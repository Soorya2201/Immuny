import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import type { Schema } from '../../data/resource';
import { env } from '$amplify/env/fetchAllergyNews';

// Search terms covering the range of allergy news readers care about —
// merged and deduplicated below into one feed.
const SEARCH_QUERIES = [
  'food allergy',
  'seasonal allergies',
  'allergy research',
  'allergy treatment',
];

const MAX_ARTICLES = 40;   // candidates considered per scrape run, before the storage cap below
const MAX_STORED = 25;     // the News tab always shows "what's current" — cap total rows, not just their age

interface ScrapedArticle {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!match) return null;
  return decodeEntities(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1'));
}

function parseGoogleNewsRss(xml: string): ScrapedArticle[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const articles: ScrapedArticle[] = [];

  for (const item of items) {
    const title = extractTag(item, 'title');
    const link = extractTag(item, 'link');
    const pubDate = extractTag(item, 'pubDate');
    const sourceMatch = item.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
    const source = sourceMatch ? decodeEntities(sourceMatch[1]) : 'Google News';

    if (!title || !link) continue;

    const publishedAt = pubDate && !Number.isNaN(Date.parse(pubDate))
      ? new Date(pubDate).toISOString()
      : new Date().toISOString();

    articles.push({ title, url: link, source, publishedAt });
  }

  return articles;
}

async function fetchQuery(query: string): Promise<ScrapedArticle[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ImmunyNewsBot/1.0)' } });
  if (!res.ok) {
    console.warn(`fetchAllergyNews: query "${query}" failed with status ${res.status}`);
    return [];
  }
  const xml = await res.text();
  return parseGoogleNewsRss(xml);
}

export const handler = async () => {
  const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
  Amplify.configure(resourceConfig, libraryOptions);
  const client = generateClient<Schema>();

  // ── Scrape ────────────────────────────────────────────────────────────
  const results = await Promise.allSettled(SEARCH_QUERIES.map(fetchQuery));
  const scraped = results.flatMap(r => (r.status === 'fulfilled' ? r.value : []));

  const byUrl = new Map<string, ScrapedArticle>();
  for (const article of scraped) {
    if (!byUrl.has(article.url)) byUrl.set(article.url, article);
  }
  const deduped = [...byUrl.values()]
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, MAX_ARTICLES);

  console.log(`fetchAllergyNews: scraped ${scraped.length} raw, ${deduped.length} unique articles`);

  // ── Skip articles we already have ───────────────────────────────────────
  const { data: existing } = await client.models.NewsArticle.list();
  const existingUrls = new Set((existing ?? []).map(e => e.url));
  const toCreate = deduped.filter(a => !existingUrls.has(a.url));

  const fetchedAt = new Date().toISOString();
  const createResults = await Promise.allSettled(
    toCreate.map(a => client.models.NewsArticle.create({
      title: a.title.slice(0, 300),
      url: a.url,
      source: a.source,
      publishedAt: a.publishedAt,
      fetchedAt,
    })),
  );
  const created = createResults
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value.data)
    .filter((d): d is NonNullable<typeof d> => d != null);

  // ── Keep only the newest MAX_STORED articles, dropping the rest ────────
  // The News tab should always read as "what's current" — trimmed by count,
  // not by age, so a slow news week doesn't leave month-old articles sitting
  // at the top just because nothing newer has pushed them out yet.
  const all = [...(existing ?? []), ...created];
  const newestFirst = all
    .slice()
    .sort((a, b) => new Date(b.publishedAt ?? b.fetchedAt ?? 0).getTime() - new Date(a.publishedAt ?? a.fetchedAt ?? 0).getTime());
  const toDelete = newestFirst.slice(MAX_STORED);
  await Promise.allSettled(toDelete.map(e => client.models.NewsArticle.delete({ id: e.id })));

  console.log(`fetchAllergyNews: created ${created.length}, pruned ${toDelete.length}, kept ${Math.min(newestFirst.length, MAX_STORED)}`);
};

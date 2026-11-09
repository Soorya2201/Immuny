import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DetectDocumentTextCommand, TextractClient } from '@aws-sdk/client-textract';
import type { Schema } from '../../data/resource';
import { PRICES, novaLiteCostUsd, recordUsage, textractCostUsd } from '../shared/usage';

const bedrock = new BedrockRuntimeClient({});
const textract = new TextractClient({});
const MAX_IMAGES = 5;

const NUTRIENTS = [
  'servingSize', 'servingsPerContainer', 'calories', 'totalFat', 'saturatedFat', 'transFat',
  'cholesterol', 'sodium', 'totalCarbohydrate', 'dietaryFiber', 'totalSugars', 'addedSugars', 'protein',
] as const;

const PROMPT = `You read photos of packaged food labels for an allergy tracking app. People rely on this to avoid allergic reactions, so accuracy matters more than completeness.

Reply with ONE JSON object and nothing else:
{
  "readable": true or false,
  "productName": string or null,
  "ingredients": string or null,
  "allergens": [string],
  "mayContain": [string],
  "nutrition": {${NUTRIENTS.map(n => `"${n}": string or null`).join(', ')}},
  "summary": string
}

Rules:
- "ingredients": copy the ingredients list exactly as printed, including sub-ingredients in brackets. Do not fix, shorten or reorder it.
- "allergens": every major allergen the food definitely contains, from the "Contains" statement or the ingredients (e.g. "milk", "egg", "peanuts", "tree nuts (almonds)", "wheat", "soy", "fish", "shellfish", "sesame"). Plain lowercase names.
- "mayContain": allergens named in "may contain", "made in a facility with", "processed on shared equipment with" or similar warnings.
- "nutrition": per-serving values exactly as printed, with units (e.g. "240mg", "12g", "1 cup (240mL)"). Calories as a number string. null for anything not visible.
- Never guess or fill in a value you cannot read clearly. Use null or leave it out.
- "summary": 2 or 3 plain sentences: what the product is, which allergens it contains or may contain, and anything notable in the nutrition (for example high sodium or added sugar). No medical advice.
- If no label text is readable, set "readable": false and leave everything else empty.`;

type Nutrition = Partial<Record<(typeof NUTRIENTS)[number], string | null>>;

export interface LabelScan {
  engine: 'nova-lite' | 'textract';
  readable: boolean;
  productName: string | null;
  ingredients: string | null;
  allergens: string[];
  mayContain: string[];
  nutrition: Nutrition;
  summary: string;
  /** Plain text for the review box: Textract lines when Nova Lite was not used. */
  rawText: string;
}

const strList = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map(x => x.trim()) : [];
const strOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null);

function parseScan(text: string): LabelScan | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const n = (raw.nutrition ?? {}) as Record<string, unknown>;
  const nutrition: Nutrition = {};
  for (const k of NUTRIENTS) {
    const v = strOrNull(n[k]);
    if (v) nutrition[k] = v;
  }
  return {
    engine: 'nova-lite',
    readable: raw.readable !== false,
    productName: strOrNull(raw.productName),
    ingredients: strOrNull(raw.ingredients),
    allergens: strList(raw.allergens),
    mayContain: strList(raw.mayContain),
    nutrition,
    summary: strOrNull(raw.summary) ?? '',
    rawText: '',
  };
}

async function readWithNovaLite(images: string[], userId: string, handlerStartedAt: number): Promise<LabelScan | null> {
  const body = JSON.stringify({
    schemaVersion: 'messages-v1',
    system: [{ text: PROMPT }],
    messages: [{
      role: 'user',
      content: [
        ...images.map(bytes => ({ image: { format: 'jpeg', source: { bytes } } })),
        { text: 'Read this food label.' },
      ],
    }],
    inferenceConfig: { maxTokens: 1500, temperature: 0, topP: 1 },
  });
  const res = await bedrock.send(new InvokeModelCommand({
    modelId: PRICES.novaLite.modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body,
  }));
  const out = JSON.parse(new TextDecoder().decode(res.body)) as {
    output?: { message?: { content?: { text?: string }[] } };
    usage?: { inputTokens?: number; outputTokens?: number };
  };
  const inputTokens = out.usage?.inputTokens ?? 0;
  const outputTokens = out.usage?.outputTokens ?? 0;
  await recordUsage({
    userId,
    provider: 'bedrock',
    model: PRICES.novaLite.modelId,
    mode: 'label-scan',
    costUsd: novaLiteCostUsd(inputTokens, outputTokens),
    handlerStartedAt,
    metrics: {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      images: images.length,
      inputUsdPer1M: PRICES.novaLite.inputUsdPer1M,
      outputUsdPer1M: PRICES.novaLite.outputUsdPer1M,
    },
  });
  return parseScan(out.output?.message?.content?.[0]?.text ?? '');
}

async function readWithTextract(images: string[], userId: string, handlerStartedAt: number): Promise<LabelScan> {
  const parts: string[] = [];
  let pages = 0;
  for (const base64 of images) {
    try {
      const res = await textract.send(new DetectDocumentTextCommand({ Document: { Bytes: Buffer.from(base64, 'base64') } }));
      pages += res.DocumentMetadata?.Pages ?? 1;
      const lines = (res.Blocks ?? []).filter(b => b.BlockType === 'LINE' && b.Text).map(b => b.Text as string);
      if (lines.length) parts.push(lines.join('\n'));
    } catch (err) {
      console.warn('scanFoodLabel: Textract failed on one image', err);
    }
  }
  await recordUsage({
    userId,
    provider: 'textract',
    model: PRICES.textractDetectText.model,
    mode: 'label-scan-fallback',
    costUsd: textractCostUsd(pages),
    handlerStartedAt,
    metrics: { pages, images: images.length, usdPerPage: PRICES.textractDetectText.usdPerPage },
  });
  const rawText = parts.join('\n---\n');
  return {
    engine: 'textract', readable: rawText !== '', productName: null, ingredients: null,
    allergens: [], mayContain: [], nutrition: {}, summary: '', rawText,
  };
}

// Returns a LabelScan as a JSON string.
export const handler: Schema['scanFoodLabel']['functionHandler'] = async (event) => {
  const handlerStartedAt = Date.now();
  const userId = (event.identity as { sub?: string } | null)?.sub ?? 'unknown';
  let images: string[];
  try {
    const parsed = JSON.parse(event.arguments.images);
    images = (Array.isArray(parsed) ? parsed : [event.arguments.images]).filter(Boolean).slice(0, MAX_IMAGES);
  } catch {
    images = [event.arguments.images];
  }
  if (!images.length) return JSON.stringify(null);

  try {
    const scan = await readWithNovaLite(images, userId, handlerStartedAt);
    if (scan) return JSON.stringify(scan);
    console.warn('scanFoodLabel: Nova Lite reply was not usable JSON, using Textract');
  } catch (err) {
    console.error('scanFoodLabel: Nova Lite failed, using Textract', err);
  }
  return JSON.stringify(await readWithTextract(images, userId, handlerStartedAt));
};

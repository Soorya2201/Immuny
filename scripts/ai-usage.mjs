#!/usr/bin/env node
// Read the backend-only AI usage table: cost summaries, per-user totals, SQL
// (DynamoDB PartiQL) queries and CSV export.
//
//   node scripts/ai-usage.mjs                       summary: today, this month, all time, by mode, top users
//   node scripts/ai-usage.mjs --by-user             one line per user, with their email
//   node scripts/ai-usage.mjs --by-user --csv users.csv   ...and save it as CSV
//   node scripts/ai-usage.mjs --csv calls.csv       every call (one row each) as CSV
//   node scripts/ai-usage.mjs --sql "SELECT * FROM AiUsage WHERE \"day\" = '2026-11-08'"
//
// Add --prod to read production instead of your sandbox. Without it, the table
// and user pool come from amplify_outputs.json (your sandbox). In SQL, write
// `AiUsage` for the table; it is swapped for the real name.
//
// Uses your default AWS profile, or AWS_PROFILE if set. PartiQL has no SUM or
// GROUP BY, so totals are added up here. The CSV holds user emails: treat it
// as personal data.
import { readFileSync, writeFileSync } from 'node:fs';
import { DynamoDBClient, ExecuteStatementCommand, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import {
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
  ListUserPoolsCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';

// ── Arguments ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const PROD = flag('--prod');
const BY_USER = flag('--by-user');
const CSV_PATH = value('--csv');
const SQL = value('--sql');

// Production is the Amplify Hosting app's `main` branch.
const PROD_APP_ID = 'd1ygg4qlozsbue';
const PROD_REGION = 'us-east-1';
const PROD_BRANCH = 'main';

// ── Where to read ─────────────────────────────────────────────────────────────
async function resolveTarget() {
  if (PROD) {
    const db = new DynamoDBClient({ region: PROD_REGION });
    const names = [];
    let ExclusiveStartTableName;
    do {
      const r = await db.send(new ListTablesCommand({ ExclusiveStartTableName }));
      names.push(...(r.TableNames ?? []));
      ExclusiveStartTableName = r.LastEvaluatedTableName;
    } while (ExclusiveStartTableName);
    const prefix = `amplify-${PROD_APP_ID}-${PROD_BRANCH}-branch-`;
    const table = names.find((n) => n.startsWith(prefix) && n.includes('AiUsage'));
    if (!table) throw new Error(`No production AiUsage table found in ${PROD_REGION}. Has the main branch deployed?`);
    return { region: PROD_REGION, table, userPoolId: undefined, label: 'production' };
  }
  const outputs = JSON.parse(readFileSync(new URL('../amplify_outputs.json', import.meta.url), 'utf8'));
  const table = outputs.custom?.aiUsageTable;
  if (!table) throw new Error('amplify_outputs.json has no custom.aiUsageTable. Deploy the sandbox first: npx ampx sandbox --once');
  return { region: outputs.auth?.aws_region, table, userPoolId: outputs.auth?.user_pool_id, label: 'sandbox' };
}

// ── DynamoDB ────────────────────────────────────────────────────────────────
// Minimal DynamoDB JSON -> plain object, for the attribute types this table uses.
function plain(attr) {
  if ('S' in attr) return attr.S;
  if ('N' in attr) return Number(attr.N);
  if ('BOOL' in attr) return attr.BOOL;
  if ('NULL' in attr) return null;
  if ('L' in attr) return attr.L.map(plain);
  if ('M' in attr) return Object.fromEntries(Object.entries(attr.M).map(([k, v]) => [k, plain(v)]));
  return attr;
}

async function run(db, sql) {
  const rows = [];
  let NextToken;
  do {
    const res = await db.send(new ExecuteStatementCommand({ Statement: sql, NextToken }));
    for (const item of res.Items ?? []) {
      rows.push(Object.fromEntries(Object.entries(item).map(([k, v]) => [k, plain(v)])));
    }
    NextToken = res.NextToken;
  } while (NextToken);
  return rows.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

// ── Cognito: user ID -> email ───────────────────────────────────────────────
async function emailLookup(region, userPoolId) {
  const cog = new CognitoIdentityProviderClient({ region });
  if (!userPoolId) {
    // Production: find the pool Amplify tagged with this app and branch.
    let NextToken;
    do {
      const r = await cog.send(new ListUserPoolsCommand({ MaxResults: 60, NextToken }));
      for (const p of r.UserPools ?? []) {
        const tags = (await cog.send(new DescribeUserPoolCommand({ UserPoolId: p.Id }))).UserPool?.UserPoolTags ?? {};
        if (tags['amplify:app-id'] === PROD_APP_ID && tags['amplify:branch-name'] === PROD_BRANCH) userPoolId = p.Id;
      }
      NextToken = r.NextToken;
    } while (NextToken && !userPoolId);
  }
  const cache = new Map();
  return async (sub) => {
    if (!userPoolId || !sub || sub === 'unknown') return '';
    if (!cache.has(sub)) {
      const r = await cog.send(new ListUsersCommand({ UserPoolId: userPoolId, Filter: `sub = "${sub}"`, Limit: 1 }));
      cache.set(sub, r.Users?.[0]?.Attributes?.find((a) => a.Name === 'email')?.Value ?? '(deleted user)');
    }
    return cache.get(sub);
  };
}

// ── Totals and output ───────────────────────────────────────────────────────
function summarise(rows) {
  const t = rows.reduce(
    (a, r) => ({
      calls: a.calls + 1,
      inputTokens: a.inputTokens + (r.inputTokens ?? 0),
      outputTokens: a.outputTokens + (r.outputTokens ?? 0),
      cost: a.cost + (r.costUsd ?? 0),
    }),
    { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 },
  );
  return { calls: t.calls, inputTokens: t.inputTokens, outputTokens: t.outputTokens, costUsd: Number(t.cost.toFixed(8)) };
}

function groupBy(rows, key) {
  const groups = new Map();
  for (const r of rows) {
    const k = r[key] ?? '?';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  return groups;
}

async function perUser(rows, lookup) {
  const out = [];
  for (const [userId, rs] of groupBy(rows, 'userId')) {
    out.push({
      email: await lookup(userId),
      userId,
      ...summarise(rs),
      firstCall: rs[0].createdAt,
      lastCall: rs.at(-1).createdAt,
    });
  }
  return out.sort((a, b) => b.costUsd - a.costUsd);
}

function toCsv(objects) {
  if (!objects.length) return '';
  const cols = [...new Set(objects.flatMap((o) => Object.keys(o)))];
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...objects.map((o) => cols.map((c) => cell(o[c])).join(','))].join('\n') + '\n';
}

function save(objects) {
  writeFileSync(CSV_PATH, toCsv(objects));
  console.log(`Saved ${objects.length} rows to ${CSV_PATH}`);
}

// ── Main ────────────────────────────────────────────────────────────────────
const target = await resolveTarget();
const db = new DynamoDBClient({ region: target.region });
console.log(`Reading ${target.label}: ${target.table} (${target.region}). Times are UTC.`);

if (SQL) {
  const rows = await run(db, SQL.replace(/\bAiUsage\b/g, `"${target.table}"`));
  console.table(rows);
  console.log(summarise(rows));
  if (CSV_PATH) save(rows);
} else {
  const rows = await run(db, `SELECT * FROM "${target.table}"`);

  if (BY_USER) {
    const users = await perUser(rows, await emailLookup(target.region, target.userPoolId));
    console.table(users.map(({ userId, ...u }) => u));
    if (CSV_PATH) save(users);
  } else if (CSV_PATH) {
    const lookup = await emailLookup(target.region, target.userPoolId);
    const withEmail = [];
    for (const r of rows) {
      // Fixed, readable column order; DynamoDB returns attributes unordered.
      withEmail.push({
        createdAt: r.createdAt, email: await lookup(r.userId), userId: r.userId, mode: r.mode,
        inputTokens: r.inputTokens, outputTokens: r.outputTokens, totalTokens: r.totalTokens,
        inputUsdPer1M: r.inputUsdPer1M, outputUsdPer1M: r.outputUsdPer1M, costUsd: r.costUsd,
        latencyMs: r.latencyMs, model: r.model, provider: r.provider, day: r.day, month: r.month, sk: r.sk,
      });
    }
    save(withEmail);
  } else {
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    console.table([
      { period: `today ${today}`, ...summarise(rows.filter((r) => r.day === today)) },
      { period: `month ${month}`, ...summarise(rows.filter((r) => r.month === month)) },
      { period: 'all time', ...summarise(rows) },
    ]);
    console.log('By mode:');
    console.table([...groupBy(rows, 'mode')].map(([mode, rs]) => ({ mode, ...summarise(rs) })));
    console.log('Top 10 users by cost (use --by-user for emails):');
    console.table([...groupBy(rows, 'userId')].map(([userId, rs]) => ({ userId, ...summarise(rs) })).sort((a, b) => b.costUsd - a.costUsd).slice(0, 10));
  }
}

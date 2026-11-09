#!/usr/bin/env node
// Read the backend-only usage table: what each user costs us. One row per paid
// call (Bea/Nova Micro tokens, Groq voice seconds, Textract label pages), each
// with the provider cost and the Lambda compute cost. --by-user adds database
// storage per user. Also SQL (DynamoDB PartiQL) queries and CSV export.
//
//   node scripts/ai-usage.mjs                       summary: today, this month, all time, by service, top users
//   node scripts/ai-usage.mjs --by-user             one line per user: every cost, storage and total
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
import { DynamoDBClient, ExecuteStatementCommand, ListTablesCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { AppSyncClient, ListGraphqlApisCommand } from '@aws-sdk/client-appsync';
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
    return { region: PROD_REGION, table, userPoolId: undefined, graphqlUrl: undefined, label: 'production' };
  }
  const outputs = JSON.parse(readFileSync(new URL('../amplify_outputs.json', import.meta.url), 'utf8'));
  const table = outputs.custom?.aiUsageTable;
  if (!table) throw new Error('amplify_outputs.json has no custom.aiUsageTable. Deploy the sandbox first: npx ampx sandbox --once');
  return {
    region: outputs.auth?.aws_region,
    table,
    userPoolId: outputs.auth?.user_pool_id,
    graphqlUrl: outputs.data?.url,
    label: 'sandbox',
  };
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
const usd = (n) => Number(n.toFixed(8));
// Rows written before 2026-11-09 are Nova-only and have no provider/Lambda columns.
const providerOf = (r) => r.provider ?? 'bedrock';
const lambdaCostOf = (r) => r.lambdaCostUsd ?? 0;

function summarise(rows) {
  const t = rows.reduce(
    (a, r) => ({
      calls: a.calls + 1,
      cost: a.cost + (r.costUsd ?? 0),
      lambda: a.lambda + lambdaCostOf(r),
    }),
    { calls: 0, cost: 0, lambda: 0 },
  );
  return { calls: t.calls, serviceUsd: usd(t.cost), lambdaUsd: usd(t.lambda), totalUsd: usd(t.cost + t.lambda) };
}

// Everything one user cost, split by service.
function userCosts(rs) {
  const by = (p) => rs.filter((r) => providerOf(r) === p);
  const sum = (list, f) => list.reduce((a, r) => a + (f(r) ?? 0), 0);
  const bea = by('bedrock'), voice = by('groq'), scans = by('textract');
  return {
    beaCalls: bea.length,
    beaTokens: sum(bea, (r) => r.totalTokens ?? (r.inputTokens ?? 0) + (r.outputTokens ?? 0)),
    beaUsd: usd(sum(bea, (r) => r.costUsd)),
    voiceClips: voice.length,
    voiceSeconds: Number(sum(voice, (r) => r.audioSeconds).toFixed(1)),
    voiceUsd: usd(sum(voice, (r) => r.costUsd)),
    scanPages: sum(scans, (r) => r.pages),
    scanUsd: usd(sum(scans, (r) => r.costUsd)),
    lambdaUsd: usd(sum(rs, lambdaCostOf)),
  };
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

// ── Database storage per user ──────────────────────────────────────────────
// DynamoDB standard storage, us-east-1: https://aws.amazon.com/dynamodb/pricing/
const DDB_USD_PER_GB_MONTH = 0.25;
const DDB_ITEM_OVERHEAD_BYTES = 100; // AWS adds 100 bytes of indexing overhead per item

// DynamoDB's own item size rules: attribute name + value.
function attrBytes(v) {
  if ('S' in v) return Buffer.byteLength(v.S);
  if ('N' in v) return Math.ceil(v.N.replace(/^-|\./g, '').replace(/^0+/, '').length / 2) + 1;
  if ('B' in v) return v.B.length;
  if ('BOOL' in v || 'NULL' in v) return 1;
  if ('L' in v) return 3 + v.L.reduce((a, x) => a + 1 + attrBytes(x), 0);
  if ('M' in v) return 3 + Object.entries(v.M).reduce((a, [k, x]) => a + 1 + Buffer.byteLength(k) + attrBytes(x), 0);
  if ('SS' in v) return v.SS.reduce((a, x) => a + Buffer.byteLength(x), 0);
  if ('NS' in v) return v.NS.length * 21;
  return 0;
}
const itemBytes = (item) => Object.entries(item).reduce((a, [k, v]) => a + Buffer.byteLength(k) + attrBytes(v), 0);

// The app's data tables are named <Model>-<AppSync API id>-NONE.
async function findApiId(region, graphqlUrl) {
  const appsync = new AppSyncClient({ region });
  let nextToken;
  do {
    const r = await appsync.send(new ListGraphqlApisCommand({ nextToken }));
    for (const api of r.graphqlApis ?? []) {
      const tags = api.tags ?? {};
      const isTarget = graphqlUrl
        ? api.uris?.GRAPHQL === graphqlUrl
        : tags['amplify:app-id'] === PROD_APP_ID && tags['amplify:branch-name'] === PROD_BRANCH;
      if (isTarget) return api.apiId;
    }
    nextToken = r.nextToken;
  } while (nextToken);
  throw new Error('Could not find the AppSync API for this environment');
}

// Bytes and items each user has stored, keyed by Cognito sub. Rows owned by
// "sub::username" or "sub" both count for that sub. Shared rows with no owner
// (news articles) are not anyone's and are left out.
async function storageByUser(db, region, graphqlUrl) {
  const apiId = await findApiId(region, graphqlUrl);
  const tables = [];
  let ExclusiveStartTableName;
  do {
    const r = await db.send(new ListTablesCommand({ ExclusiveStartTableName }));
    tables.push(...(r.TableNames ?? []).filter((n) => n.endsWith(`-${apiId}-NONE`)));
    ExclusiveStartTableName = r.LastEvaluatedTableName;
  } while (ExclusiveStartTableName);

  const users = new Map();
  for (const TableName of tables) {
    let ExclusiveStartKey;
    do {
      const r = await db.send(new ScanCommand({ TableName, ExclusiveStartKey }));
      for (const item of r.Items ?? []) {
        const owner = item.owner?.S;
        if (!owner) continue;
        const sub = owner.split('::')[0];
        const u = users.get(sub) ?? { items: 0, bytes: 0 };
        u.items += 1;
        u.bytes += itemBytes(item) + DDB_ITEM_OVERHEAD_BYTES;
        users.set(sub, u);
      }
      ExclusiveStartKey = r.LastEvaluatedKey;
    } while (ExclusiveStartKey);
  }
  return users;
}

async function perUser(rows, lookup, storage) {
  const groups = groupBy(rows, 'userId');
  const ids = new Set([...groups.keys(), ...storage.keys()]);
  const out = [];
  for (const userId of ids) {
    const rs = groups.get(userId) ?? [];
    const st = storage.get(userId) ?? { items: 0, bytes: 0 };
    const c = userCosts(rs);
    const storageUsdPerMonth = usd((st.bytes / 1024 ** 3) * DDB_USD_PER_GB_MONTH);
    out.push({
      email: await lookup(userId),
      userId,
      ...c,
      dbItems: st.items,
      dbKB: Number((st.bytes / 1024).toFixed(1)),
      dbUsdPerMonth: storageUsdPerMonth,
      totalUsd: usd(c.beaUsd + c.voiceUsd + c.scanUsd + c.lambdaUsd + storageUsdPerMonth),
      firstCall: rs[0]?.createdAt ?? '',
      lastCall: rs.at(-1)?.createdAt ?? '',
    });
  }
  return out.sort((a, b) => b.totalUsd - a.totalUsd);
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
    const storage = await storageByUser(db, target.region, target.graphqlUrl);
    const users = await perUser(rows, await emailLookup(target.region, target.userPoolId), storage);
    console.table(users.map(({ userId, firstCall, lastCall, ...u }) => u));
    console.log(
      'Usage costs are all-time; dbUsdPerMonth is what their stored data costs each month; totalUsd adds both.\n' +
        'Not per user (shared or free at this size): Cognito sign-ins (free under 10,000 monthly users),\n' +
        'AppSync/DynamoDB request charges, Amplify Hosting and CloudWatch logs.',
    );
    if (CSV_PATH) save(users);
  } else if (CSV_PATH) {
    const lookup = await emailLookup(target.region, target.userPoolId);
    const withEmail = [];
    for (const r of rows) {
      // Fixed, readable column order; DynamoDB returns attributes unordered.
      withEmail.push({
        createdAt: r.createdAt, email: await lookup(r.userId), userId: r.userId,
        provider: providerOf(r), model: r.model, mode: r.mode,
        inputTokens: r.inputTokens, outputTokens: r.outputTokens, totalTokens: r.totalTokens,
        audioSeconds: r.audioSeconds, billedSeconds: r.billedSeconds, pages: r.pages,
        costUsd: r.costUsd, lambdaMs: r.lambdaMs, lambdaCostUsd: lambdaCostOf(r),
        totalCostUsd: r.totalCostUsd ?? r.costUsd,
        latencyMs: r.latencyMs, day: r.day, month: r.month, sk: r.sk,
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
    console.log('By service:');
    const service = (r) => `${providerOf(r)} ${r.mode}`;
    console.table([...groupBy(rows.map((r) => ({ ...r, service: service(r) })), 'service')].map(([s, rs]) => ({ service: s, ...summarise(rs) })));
    console.log('Top 10 users by usage cost (use --by-user for emails, storage and the full split):');
    console.table([...groupBy(rows, 'userId')].map(([userId, rs]) => ({ userId, ...summarise(rs) })).sort((a, b) => b.totalUsd - a.totalUsd).slice(0, 10));
  }
}

#!/usr/bin/env node
// Query the backend-only AI usage table with SQL (DynamoDB PartiQL).
//
//   node scripts/ai-usage.mjs            cost summary: today, this month, all time, by mode, top users
//   node scripts/ai-usage.mjs "SELECT * FROM AiUsage WHERE \"day\" = '2026-11-07'"
//
// Write `AiUsage` as the table name; it is swapped for the real one from
// amplify_outputs.json (custom.aiUsageTable). Uses your default AWS profile,
// or AWS_PROFILE if set. PartiQL has no SUM or GROUP BY, so the summary adds
// the rows up here.
import { readFileSync } from 'node:fs';
import { DynamoDBClient, ExecuteStatementCommand } from '@aws-sdk/client-dynamodb';

const outputs = JSON.parse(readFileSync(new URL('../amplify_outputs.json', import.meta.url), 'utf8'));
const table = outputs.custom?.aiUsageTable;
if (!table) {
  console.error('amplify_outputs.json has no custom.aiUsageTable. Deploy the sandbox first: npx ampx sandbox --once');
  process.exit(1);
}
const db = new DynamoDBClient({ region: outputs.auth?.aws_region ?? outputs.data?.aws_region });

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

async function run(sql) {
  const rows = [];
  let NextToken;
  do {
    const res = await db.send(new ExecuteStatementCommand({ Statement: sql, NextToken }));
    for (const item of res.Items ?? []) {
      rows.push(Object.fromEntries(Object.entries(item).map(([k, v]) => [k, plain(v)])));
    }
    NextToken = res.NextToken;
  } while (NextToken);
  return rows;
}

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
  return { calls: t.calls, inputTokens: t.inputTokens, outputTokens: t.outputTokens, costUsd: Number(t.cost.toFixed(6)) };
}

function groupSummary(rows, key) {
  const groups = new Map();
  for (const r of rows) {
    const k = r[key] ?? '?';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  return [...groups].map(([k, rs]) => ({ [key]: k, ...summarise(rs) })).sort((a, b) => b.costUsd - a.costUsd);
}

const sqlArg = process.argv[2];
if (sqlArg) {
  const rows = await run(sqlArg.replace(/\bAiUsage\b/g, `"${table}"`));
  console.table(rows);
  console.log(summarise(rows));
} else {
  const rows = await run(`SELECT * FROM "${table}"`);
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  console.log(`Table: ${table}  (days are UTC)`);
  console.table([
    { period: `today ${today}`, ...summarise(rows.filter((r) => r.day === today)) },
    { period: `month ${month}`, ...summarise(rows.filter((r) => r.month === month)) },
    { period: 'all time', ...summarise(rows) },
  ]);
  console.log('By mode:');
  console.table(groupSummary(rows, 'mode'));
  console.log('Top 10 users by cost:');
  console.table(groupSummary(rows, 'userId').slice(0, 10));
}

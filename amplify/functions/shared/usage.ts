import { randomUUID } from "node:crypto";
import { DynamoDBClient, PutItemCommand, type AttributeValue } from "@aws-sdk/client-dynamodb";

// ─── Price list (USD) ─────────────────────────────────────────────────────────
// Each usage row stores the prices it was charged at, so changing these later
// never rewrites the cost of past calls. Checked 2026-11-09.
export const PRICES = {
    // https://aws.amazon.com/bedrock/pricing/ (on-demand, us-east-1)
    novaMicro: { modelId: "amazon.nova-micro-v1:0", inputUsdPer1M: 0.035, outputUsdPer1M: 0.14 },
    // Reads food label photos (image input is billed as input tokens).
    novaLite: { modelId: "amazon.nova-lite-v1:0", inputUsdPer1M: 0.06, outputUsdPer1M: 0.24 },
    // https://console.groq.com/docs/model/whisper-large-v3-turbo
    // Groq bills every request as at least 10 seconds of audio.
    groqWhisperTurbo: { model: "whisper-large-v3-turbo", usdPerHour: 0.04, minBilledSeconds: 10 },
    // https://aws.amazon.com/textract/pricing/ (DetectDocumentText, first 1M pages a month)
    textractDetectText: { model: "textract-detect-document-text", usdPerPage: 0.0015 },
    // https://aws.amazon.com/lambda/pricing/ (x86, us-east-1)
    lambda: { usdPerGbSecond: 0.0000166667, usdPerRequest: 0.0000002 },
} as const;

/** Rounds to the nearest billionth of a dollar. */
export const roundUsd = (usd: number) => Math.round(usd * 1e9) / 1e9;

export function novaMicroCostUsd(inputTokens: number, outputTokens: number): number {
    const p = PRICES.novaMicro;
    return roundUsd((inputTokens * p.inputUsdPer1M + outputTokens * p.outputUsdPer1M) / 1_000_000);
}

export function novaLiteCostUsd(inputTokens: number, outputTokens: number): number {
    const p = PRICES.novaLite;
    return roundUsd((inputTokens * p.inputUsdPer1M + outputTokens * p.outputUsdPer1M) / 1_000_000);
}

export function groqBilledSeconds(audioSeconds: number): number {
    return Math.max(PRICES.groqWhisperTurbo.minBilledSeconds, audioSeconds);
}

export function groqCostUsd(audioSeconds: number): number {
    return roundUsd((groqBilledSeconds(audioSeconds) / 3600) * PRICES.groqWhisperTurbo.usdPerHour);
}

export function textractCostUsd(pages: number): number {
    return roundUsd(pages * PRICES.textractDetectText.usdPerPage);
}

/** Compute cost of one Lambda invocation of `ms` milliseconds at `memoryMB`. */
export function lambdaCostUsd(ms: number, memoryMB: number): number {
    const p = PRICES.lambda;
    return roundUsd((Math.ceil(ms) / 1000) * (memoryMB / 1024) * p.usdPerGbSecond + p.usdPerRequest);
}

const db = new DynamoDBClient({});
const TABLE_NAME = process.env.AI_USAGE_TABLE ?? "";
const MEMORY_MB = Number(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE ?? 0);

export interface UsageRow {
    /** Cognito sub of the caller, from event.identity (never from the client). */
    userId: string;
    provider: "bedrock" | "groq" | "textract";
    model: string;
    mode: string;
    /** Cost charged by the provider for this call, in USD. */
    costUsd: number;
    /** Date.now() when the Lambda handler started, for the compute cost. */
    handlerStartedAt: number;
    /** Provider-specific measurements and the unit prices used, e.g. tokens, audio seconds, pages. */
    metrics: Record<string, number | string>;
}

/**
 * Writes one cost row per paid call to the backend-only usage table. Never
 * throws: a failed write is logged and the user's request carries on.
 */
export async function recordUsage(u: UsageRow): Promise<void> {
    if (!TABLE_NAME) {
        console.warn("AI_USAGE_TABLE is not set; usage not recorded");
        return;
    }
    const createdAt = new Date().toISOString();
    const lambdaMs = Date.now() - u.handlerStartedAt;
    const lambdaCost = MEMORY_MB ? lambdaCostUsd(lambdaMs, MEMORY_MB) : 0;
    const item: Record<string, AttributeValue> = {
        userId: { S: u.userId },
        sk: { S: `${createdAt}#${randomUUID()}` },
        createdAt: { S: createdAt },
        day: { S: createdAt.slice(0, 10) },
        month: { S: createdAt.slice(0, 7) },
        provider: { S: u.provider },
        model: { S: u.model },
        mode: { S: u.mode },
        costUsd: { N: String(u.costUsd) },
        lambdaMs: { N: String(lambdaMs) },
        lambdaMemoryMB: { N: String(MEMORY_MB) },
        lambdaCostUsd: { N: String(lambdaCost) },
        totalCostUsd: { N: String(roundUsd(u.costUsd + lambdaCost)) },
    };
    for (const [k, v] of Object.entries(u.metrics)) {
        item[k] = typeof v === "number" ? { N: String(v) } : { S: v };
    }
    try {
        await db.send(new PutItemCommand({ TableName: TABLE_NAME, Item: item }));
    } catch (err) {
        console.error("recordUsage failed:", err);
    }
}

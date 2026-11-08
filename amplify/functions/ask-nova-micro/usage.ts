import { randomUUID } from "node:crypto";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

// ─── Price list ───────────────────────────────────────────────────────────────
// Amazon Bedrock on-demand prices in USD per 1M tokens, from
// https://aws.amazon.com/bedrock/pricing/ (checked 2026-11-07). Batch inference
// is half this, but this function only makes on-demand calls. Each usage row
// stores the prices it was charged at, so changing these later never rewrites
// the cost of past calls.
export const NOVA_MICRO = {
    modelId: "amazon.nova-micro-v1:0",
    inputUsdPer1M: 0.035,
    outputUsdPer1M: 0.14,
} as const;

const db = new DynamoDBClient({});
const TABLE_NAME = process.env.AI_USAGE_TABLE ?? "";

export interface NovaUsage {
    userId: string;
    mode: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
}

/** Cost of one call in USD, rounded to the nearest billionth of a dollar. */
export function novaMicroCostUsd(inputTokens: number, outputTokens: number): number {
    const cost =
        (inputTokens * NOVA_MICRO.inputUsdPer1M + outputTokens * NOVA_MICRO.outputUsdPer1M) / 1_000_000;
    return Math.round(cost * 1e9) / 1e9;
}

/**
 * Writes one row per Bedrock call. Never throws: a failed write is logged and
 * the user's answer is returned regardless.
 */
export async function recordNovaUsage(u: NovaUsage): Promise<void> {
    if (!TABLE_NAME) {
        console.warn("AI_USAGE_TABLE is not set; usage not recorded");
        return;
    }
    const createdAt = new Date().toISOString();
    const costUsd = novaMicroCostUsd(u.inputTokens, u.outputTokens);
    try {
        await db.send(
            new PutItemCommand({
                TableName: TABLE_NAME,
                Item: {
                    userId: { S: u.userId },
                    sk: { S: `${createdAt}#${randomUUID()}` },
                    createdAt: { S: createdAt },
                    day: { S: createdAt.slice(0, 10) },
                    month: { S: createdAt.slice(0, 7) },
                    provider: { S: "bedrock" },
                    model: { S: NOVA_MICRO.modelId },
                    mode: { S: u.mode },
                    inputTokens: { N: String(u.inputTokens) },
                    outputTokens: { N: String(u.outputTokens) },
                    totalTokens: { N: String(u.inputTokens + u.outputTokens) },
                    inputUsdPer1M: { N: String(NOVA_MICRO.inputUsdPer1M) },
                    outputUsdPer1M: { N: String(NOVA_MICRO.outputUsdPer1M) },
                    costUsd: { N: String(costUsd) },
                    latencyMs: { N: String(u.latencyMs) },
                },
            }),
        );
    } catch (err) {
        console.error("recordNovaUsage failed:", err);
    }
}

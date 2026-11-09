import { DynamoDBClient, QueryCommand, type AttributeValue } from "@aws-sdk/client-dynamodb";
import type { Schema } from "../../data/resource";

const db = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME ?? "";

export const handler: Schema["getConversationLogs"]["functionHandler"] =
    async (event) => {
        try {
            // The caller's own account, never the userId argument: trusting the
            // argument let any signed-in user read anyone else's logs.
            const userId = (event.identity as { sub?: string } | null)?.sub;
            if (!userId) return "[]";

            if (!TABLE_NAME) return "[]";

            const result = await db.send(
                new QueryCommand({
                    TableName: TABLE_NAME,
                    KeyConditionExpression: "pk = :pk",
                    ExpressionAttributeValues: {
                        ":pk": { S: userId },
                    },
                    ScanIndexForward: false, // newest first
                    Limit: 50,
                })
            );

            const items = (result.Items ?? []).map((item: Record<string, AttributeValue>) => {
                try {
                    return JSON.parse(item.event?.S ?? "{}");
                } catch {
                    return { raw: item.event?.S };
                }
            });

            return JSON.stringify(items);
        } catch (err) {
            console.warn("getConversationLogs error:", err);
            return "[]";
        }
    };

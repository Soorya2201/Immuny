import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import type { Schema } from "../../data/resource";

const db = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME ?? "";

export const handler: Schema["logConversationEvent"]["functionHandler"] =
    async (event) => {
        try {
            const { userId, event: eventJson } = event.arguments;
            if (!userId || !eventJson) return false;

            const parsed = JSON.parse(eventJson) as { type: string; ts?: string };
            const ts = parsed.ts ?? new Date().toISOString();
            const sk = `${parsed.type}#${ts}`;
            const ttl = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 90; // 90 days

            if (TABLE_NAME) {
                await db.send(
                    new PutItemCommand({
                        TableName: TABLE_NAME,
                        Item: {
                            pk: { S: userId },
                            sk: { S: sk },
                            event: { S: eventJson },
                            ttl: { N: String(ttl) },
                        },
                    })
                );
            }

            return true;
        } catch (err) {
            console.warn("logConversationEvent error:", err);
            return false;
        }
    };

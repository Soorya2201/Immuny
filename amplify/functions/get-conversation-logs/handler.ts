import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import type { Schema } from "../../data/resource";

const db = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME ?? "";

export const handler: Schema["getConversationLogs"]["functionHandler"] =
    async (event) => {
        try {
            const { userId } = event.arguments;
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

            const items = (result.Items ?? []).map((item) => {
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

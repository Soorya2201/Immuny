import {
    BedrockRuntimeClient,
    InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { Schema } from "../../data/resource";

const bedrock = new BedrockRuntimeClient({ region: "us-east-1" });

const SYSTEM_PROMPT =
    "You are Immuny, an allergy and health AI assistant. who ask one word questions to understadn better of the situation " +
    "Keep replies very short under 6 words. Stay focused on allergies, health, food, and wellness topics. " +
    "If the user says something off-topic, gently steer back to health. " +
    "Example: if they share something personal or emotional, reassure them 'I'm here if you need anything else.' " +
    "End with ONE gentle question about how they are feeling right now. ";

export const handler: Schema["askNovaMicro"]["functionHandler"] = async (
    event
) => {
    try {
        const { question, history } = event.arguments;
        if (!question) return "Hey! Ask me anything about allergies.";

        // Build conversation messages
        const messages: { role: string; content: { text: string }[] }[] = [];

        // Inject last-N turns from history for context awareness
        if (history) {
            try {
                const parsed = JSON.parse(history) as {
                    role: string;
                    content: string;
                }[];
                for (const turn of parsed.slice(-6)) {
                    messages.push({
                        role: turn.role === "assistant" ? "assistant" : "user",
                        content: [{ text: turn.content }],
                    });
                }
            } catch {
                // ignore bad JSON
            }
        }

        messages.push({ role: "user", content: [{ text: question }] });

        const body = JSON.stringify({
            schemaVersion: "messages-v1",
            system: [{ text: SYSTEM_PROMPT }],
            messages,
            inferenceConfig: {
                maxTokens: 80,
                temperature: 0.7,
                topP: 0.9,
            },
        });

        const cmd = new InvokeModelCommand({
            modelId: "amazon.nova-micro-v1:0",
            contentType: "application/json",
            accept: "application/json",
            body,
        });

        const res = await bedrock.send(cmd);
        const raw = JSON.parse(new TextDecoder().decode(res.body)) as {
            output?: { message?: { content?: { text?: string }[] } };
        };
        const text =
            raw.output?.message?.content?.[0]?.text?.trim() ??
            "Happy to help! What's up?";

        return text;
    } catch (err) {
        console.error("askNovaMicro error:", err);
        return "Hi! How can I help you?";
    }
};

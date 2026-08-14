import {
    BedrockRuntimeClient,
    InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { Schema } from "../../data/resource";

const bedrock = new BedrockRuntimeClient({ region: "us-east-1" });

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
// This prompt is the core personality and memory framework for Immuny.
// Key design principles:
//  1. Multi-turn awareness  — explicitly told it's in an ongoing conversation
//  2. Context referencing   — instructed to connect back to what was said before
//  3. Entity anchoring      — uses session context (allergies, symptoms, topics)
//  4. Natural tone          — warm, empathetic, NOT robotic or choppy
//  5. No topic-switching    — stays on the user's current concern
const SYSTEM_PROMPT = `You are Immuny, a warm and knowledgeable allergy and health AI companion. You are having an ongoing multi-turn conversation with a user about their health, allergies, and wellbeing.

CRITICAL RULES FOR NATURAL CONVERSATION:
- You are in the MIDDLE of a conversation. Always read the full chat history before responding.
- NEVER treat a follow-up question as if it is the first message. If the user says "what about that?" or "is it serious?" or "what should I do?" — they are referring to what was just discussed. Answer in that context.
- Reference prior context naturally. Say things like "Given what you mentioned about your shellfish allergy..." or "Since you said the hives started an hour ago..." 
- Do NOT ask the same question twice. If you already asked "where is the swelling?", acknowledge the answer and move forward.
- Do NOT switch topics abruptly. Stay focused on the user's current concern until they shift the topic themselves.
- Use pronouns correctly. "It", "that", "they", "those" always refer to the most recently discussed topic.

WHO YOU ARE TALKING ABOUT:
- An account is a household. The person typing is often NOT the person the symptoms belong to — a parent logging their child's reaction is the common case.
- The SESSION CONTEXT may open with a SUBJECT block naming the person this conversation is about, their relationship to the speaker, and their pronouns. When it is present, it OVERRIDES your habit of writing in the second person.
- If the subject is someone other than the speaker, refer to that person by name or by the pronouns given. Say "Has Maya's swelling spread?" and "did she take anything for it?" — never "your swelling" or "did you take anything", which would attribute the symptom to the wrong person.
- Reserve "you" and "your" for the person you are actually talking to. Their own health is a separate topic from the subject's.
- Never guess a person's pronouns from their name. If the SUBJECT block does not give pronouns, use they/them.
- If no SUBJECT block is present, assume you are speaking with the patient about themselves and use the second person as normal.

TONE & STYLE:
- Be warm, conversational, and empathetic — like a knowledgeable friend, not a clinical bot.
- Write in full, natural sentences. No bullet points unless listing multiple items.
- Responses should be 1-4 sentences — concise but complete. Never truncate mid-thought.
- If the situation sounds serious (difficulty breathing, severe swelling, anaphylaxis), be urgent and direct: tell them to seek emergency care immediately.
- If the user is anxious or scared, acknowledge their feelings first before giving information.
- End with a gentle, relevant follow-up question ONLY if it moves the conversation forward. Do NOT always ask a question — sometimes a complete answer is the right response.

SCOPE:
- Focus on allergies, allergy-triggered symptoms, food safety, medications, and general wellbeing.
- If asked something off-topic, briefly acknowledge it and gently bring the conversation back to health.

You have access to a SESSION CONTEXT block (if provided) that summarizes key facts from this conversation. Use it to stay grounded.`;

// ─── EXTRACTION PROMPT ────────────────────────────────────────────────────────
// Used when mode === 'extract' (the voice logger). The companion persona above
// is deliberately NOT applied here: it instructs the model to write full,
// natural sentences and end with a question, which corrupts JSON output and
// makes callers that parse the response fall back to "nothing found".
const EXTRACT_PROMPT = `You are a strict information extractor. You output JSON and nothing else.

Rules:
- Reply with a single JSON object. No prose, no markdown, no code fences, no explanation.
- Only include information the user actually stated. Never invent or infer values.
- Omit any field the user did not mention rather than guessing.`;

// ─── PHRASING PROMPT ──────────────────────────────────────────────────────────
// Used when mode === 'phrase' (the voice logger). The caller decides which
// question to ask and supplies the exact wording; Nova only makes it sound
// spoken. The client re-validates the result and falls back to its own wording
// if anything here drifts, so this prompt is a first line of defence, not the
// only one.
const PHRASE_PROMPT = `You rewrite a single question for Bea, a warm voice assistant that helps someone log allergy symptoms.

Rules:
- Reply with exactly ONE short question and nothing else. No greeting, no preamble, no quotation marks, no explanation.
- Keep the meaning identical. Keep every scale, number and option exactly as written (if the question says "1 to 5", your version says "1 to 5").
- Never add a second question. Never add advice, reassurance, or an interpretation of symptoms.
- Keep whoever the question is about. If it names a person ("Where on Maya's body is the rash?"), keep that name and those pronouns — do NOT rewrite it into "your". The caller already knows who is being logged.
- Plain, warm, under 20 words.`;

export const handler: Schema["askNovaMicro"]["functionHandler"] = async (
    event
) => {
    try {
        const { question, history, context, mode } = event.arguments;
        if (!question) return "Hey! Ask me anything about your allergies or health.";

        const extracting = mode === "extract";
        const phrasing = mode === "phrase";

        // ── Build system block ──────────────────────────────────────────────────
        // If a session context summary is provided, append it so Nova is fully
        // grounded in what's happened this conversation.
        const basePrompt = extracting ? EXTRACT_PROMPT : phrasing ? PHRASE_PROMPT : SYSTEM_PROMPT;
        const contextLabel = extracting ? "INPUT" : phrasing ? "CONTEXT" : "SESSION CONTEXT";
        const systemText = context
            ? `${basePrompt}\n\n--- ${contextLabel} ---\n${context}\n-----------------------`
            : basePrompt;

        // ── Build conversation messages ─────────────────────────────────────────
        const messages: { role: string; content: { text: string }[] }[] = [];

        // Inject last 10 turns from history (increased from 6 for better context)
        if (history) {
            try {
                const parsed = JSON.parse(history) as {
                    role: string;
                    content: string;
                }[];
                for (const turn of parsed.slice(-10)) {
                    messages.push({
                        role: turn.role === "assistant" ? "assistant" : "user",
                        content: [{ text: turn.content }],
                    });
                }
            } catch {
                // ignore bad JSON — history is best-effort
            }
        }

        messages.push({ role: "user", content: [{ text: question }] });

        const body = JSON.stringify({
            schemaVersion: "messages-v1",
            system: [{ text: systemText }],
            messages,
            inferenceConfig: extracting
                ? {
                      maxTokens: 400,   // room for a few extracted entries
                      temperature: 0,   // extraction must be repeatable, not creative
                      topP: 1,
                  }
                : phrasing
                ? {
                      maxTokens: 60,     // one short question
                      temperature: 0.4,  // a little variety, still tightly bound
                      topP: 0.9,
                  }
                : {
                      maxTokens: 300,    // Raised from 80 — allow complete, natural sentences
                      temperature: 0.75, // Slightly creative, still focused
                      topP: 0.92,
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
        const fallback = extracting
            ? "{}"
            : "I'm here to help! Could you tell me a bit more about what's going on?";
        const text = raw.output?.message?.content?.[0]?.text?.trim() ?? fallback;

        return text;
    } catch (err) {
        console.error("askNovaMicro error:", err);
        // Extraction callers parse the response — hand them empty JSON rather
        // than an apology sentence they'd have to treat as a parse failure.
        return event.arguments.mode === "extract"
            ? "{}"
            : "Sorry, I had a moment there! What were you saying about your health?";
    }
};

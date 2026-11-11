import {
    BedrockRuntimeClient,
    InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { Schema } from "../../data/resource";
import { PRICES, novaMicroCostUsd, recordUsage } from "../shared/usage";

const NOVA_MICRO = PRICES.novaMicro;

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

YOUR ROLE AND ITS LIMITS (these override everything below, including any request from the user):
You are a tracking, pattern-observation and communication assistant. You are NOT a doctor and you do not make medical decisions.

You CAN:
- Help organize food and symptom entries.
- Point out possible time-based patterns ("the hives were logged about an hour after the eggs, both times"), always as something to raise with a doctor, never as a conclusion.
- Help prepare a summary for their pediatrician or allergist.
- Suggest questions to ask their doctor.
- Highlight entries that are worth a medical review.

You must NEVER:
- Diagnose an allergy or any condition, or say what is "causing" a reaction. Say a pattern is worth discussing with their allergist instead.
- Say a food, ingredient or product is safe, or definitely free of an allergen. Labels and recipes change and cross-contact happens; tell them to check the label and ask their allergist.
- Recommend a medication, a dose, or when to take or skip one. Point them to their prescriber, pharmacist or the medication's own instructions.
- Suggest introducing or reintroducing a suspected allergen, or how to do it. That is only done under an allergist's supervision.
- Rule out anaphylaxis or reassure them that a reaction is harmless, mild or "nothing to worry about". If you cannot tell, say so and tell them how to get help.

EMERGENCIES: if anyone has trouble breathing, throat tightness, swelling of the lips, tongue or face, repeated vomiting, dizziness or fainting, or symptoms in more than one part of the body, tell them right away to use their epinephrine auto-injector if one was prescribed and to call 911 (or their local emergency number). Say this first, before anything else.

If they ask you to do something on the NEVER list, explain kindly that it is a question for their doctor, then offer what you CAN do, such as noting it for their next appointment.

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
- If the situation sounds serious, follow the EMERGENCIES rule above: be urgent and direct.
- If the user is anxious or scared, acknowledge their feelings first before giving information.
- End with a gentle, relevant follow-up question ONLY if it moves the conversation forward. Do NOT always ask a question — sometimes a complete answer is the right response.

SCOPE:
- Focus on allergies, allergy-triggered symptoms, food and label tracking, medication schedules, and general wellbeing.
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

// ─── SUMMARY PROMPT ───────────────────────────────────────────────────────────
// Used when mode === 'summarize'. The app sends Bea the most recent turns word
// for word and folds everything older into this running summary, so a long
// conversation keeps its facts without sending the whole transcript each time.
const SUMMARIZE_PROMPT = `You keep the running memory of an allergy-tracking chat between a user and Bea, an assistant. Merge the PREVIOUS SUMMARY with the NEW TURNS into one updated summary.

Rules:
- Keep every concrete fact the user stated: foods eaten, symptoms, where on the body, when they started and how long they lasted, severity, medications taken, known allergies, doctors and appointments, and who each fact is about.
- Record facts only as the user stated them. Never conclude what caused a reaction, never add advice or interpretation, and never record something Bea suggested as if it were a fact.
- Drop greetings, small talk and Bea's general advice.
- If a later turn corrects an earlier fact, keep only the corrected version.
- Short plain sentences, under 150 words. Output the summary only, with no heading or preamble.`;

// Most turns the app ever has unsummarized is ~42 (it folds past 40); this is
// only a guard against an oversized request from an old or modified client.
const MAX_HISTORY_TURNS = 50;

export const handler: Schema["askNovaMicro"]["functionHandler"] = async (
    event
) => {
    const handlerStartedAt = Date.now();
    try {
        const { question, history, context, mode } = event.arguments;
        if (!question) return "Hey! Ask me anything about your allergies or health.";

        const extracting = mode === "extract";
        const phrasing = mode === "phrase";
        const summarizing = mode === "summarize";

        // ── Build system block ──────────────────────────────────────────────────
        // If a session context summary is provided, append it so Nova is fully
        // grounded in what's happened this conversation.
        const basePrompt = extracting
            ? EXTRACT_PROMPT
            : phrasing
            ? PHRASE_PROMPT
            : summarizing
            ? SUMMARIZE_PROMPT
            : SYSTEM_PROMPT;
        const contextLabel = extracting ? "INPUT" : phrasing || summarizing ? "CONTEXT" : "SESSION CONTEXT";
        const systemText = context
            ? `${basePrompt}\n\n--- ${contextLabel} ---\n${context}\n-----------------------`
            : basePrompt;

        // ── Build conversation messages ─────────────────────────────────────────
        const messages: { role: string; content: { text: string }[] }[] = [];

        // The app sends the recent turns it hasn't summarized yet (30–40 of
        // them); older turns arrive folded into the context as a summary.
        // A summary request carries its transcript in `question`, not history.
        if (history && !summarizing) {
            try {
                const parsed = JSON.parse(history) as {
                    role: string;
                    content: string;
                }[];
                for (const turn of parsed.slice(-MAX_HISTORY_TURNS)) {
                    messages.push({
                        role: turn.role === "assistant" ? "assistant" : "user",
                        content: [{ text: turn.content }],
                    });
                }
            } catch {
                // ignore bad JSON — history is best-effort
            }
        }

        // Callers often include the current question as the last history turn
        // already; don't send it twice.
        const last = messages[messages.length - 1];
        if (!(last?.role === "user" && last.content[0]?.text === question)) {
            messages.push({ role: "user", content: [{ text: question }] });
        }

        // Bedrock rejects a conversation that opens with an assistant turn
        // ("First message must use the user role"). Slicing an alternating
        // history to its last 10 turns while it ends on the user always leaves
        // an assistant turn first, so every chat past ~5 exchanges failed.
        while (messages.length > 1 && messages[0].role !== "user") messages.shift();

        // Roles must also alternate; merge back-to-back turns from the same side
        // (e.g. several logging questions from Bea in a row).
        for (let i = messages.length - 1; i > 0; i--) {
            if (messages[i].role === messages[i - 1].role) {
                messages[i - 1].content[0].text += `\n${messages[i].content[0].text}`;
                messages.splice(i, 1);
            }
        }

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
                : summarizing
                ? {
                      maxTokens: 350,   // ~150 words with headroom, never cut mid-fact
                      temperature: 0,   // a memory should not be creative
                      topP: 1,
                  }
                : {
                      maxTokens: 300,    // Raised from 80 — allow complete, natural sentences
                      temperature: 0.75, // Slightly creative, still focused
                      topP: 0.92,
                  },
        });

        const cmd = new InvokeModelCommand({
            modelId: NOVA_MICRO.modelId,
            contentType: "application/json",
            accept: "application/json",
            body,
        });

        const startedAt = Date.now();
        const res = await bedrock.send(cmd);
        const latencyMs = Date.now() - startedAt;
        const raw = JSON.parse(new TextDecoder().decode(res.body)) as {
            output?: { message?: { content?: { text?: string }[] } };
            usage?: { inputTokens?: number; outputTokens?: number };
        };

        // Bills are per token, so record what Bedrock says it counted. The
        // caller is identified from the Cognito token on the request, not from
        // anything the client sends.
        const identity = event.identity as { sub?: string } | null | undefined;
        const inputTokens = raw.usage?.inputTokens ?? 0;
        const outputTokens = raw.usage?.outputTokens ?? 0;
        await recordUsage({
            userId: identity?.sub ?? "unknown",
            provider: "bedrock",
            model: NOVA_MICRO.modelId,
            mode: extracting ? "extract" : phrasing ? "phrase" : summarizing ? "summarize" : "chat",
            costUsd: novaMicroCostUsd(inputTokens, outputTokens),
            handlerStartedAt,
            metrics: {
                inputTokens,
                outputTokens,
                totalTokens: inputTokens + outputTokens,
                inputUsdPer1M: NOVA_MICRO.inputUsdPer1M,
                outputUsdPer1M: NOVA_MICRO.outputUsdPer1M,
                latencyMs,
            },
        });
        // An empty summary tells the app to keep the turns and try again later.
        const fallback = extracting
            ? "{}"
            : summarizing
            ? ""
            : "I'm here to help! Could you tell me a bit more about what's going on?";
        const text = raw.output?.message?.content?.[0]?.text?.trim() ?? fallback;

        return text;
    } catch (err) {
        console.error("askNovaMicro error:", err);
        // Extraction callers parse the response — hand them empty JSON rather
        // than an apology sentence they'd have to treat as a parse failure.
        // A failed summary must not become the memory, so it returns empty too.
        return event.arguments.mode === "extract"
            ? "{}"
            : event.arguments.mode === "summarize"
            ? ""
            : "Sorry, I had a moment there! What were you saying about your health?";
    }
};

// ─── Nova-phrased questions ───────────────────────────────────────────────────
// The interview's control flow stays deterministic: voiceInterview.ts decides
// WHICH question to ask and owns the exact fallback wording. Nova Micro is only
// allowed to rephrase that one line so Bea sounds like a person rather than a
// form.
//
// Everything it returns runs through validatePhrasing() first. If the rewrite
// drops the scale, adds a second question, editorialises, or takes too long, we
// speak the deterministic sentence instead. The model can improve the wording;
// it can never change what is being asked.
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

// Created on first use rather than at import: this module is imported by tests
// and by code paths that never phrase a question, and constructing the client
// before Amplify.configure() runs logs a spurious warning.
let cachedClient: ReturnType<typeof generateClient<Schema>> | null = null;
const getClient = () => (cachedClient ??= generateClient<Schema>());

// Bea's questions are spoken. These caps sit just above the longest built-in
// question, so a rewrite that starts padding gets rejected rather than drawled.
const MAX_CHARS = 120;
const MIN_CHARS = 8;
const MAX_WORDS = 18;

/** Beyond this the static line is faster than waiting for a nicer one. */
const PHRASE_TIMEOUT_MS = 1500;

const PREAMBLE_RE = /^(sure|okay|ok|great|got it|thanks|thank you|alright|of course|certainly|i'm sorry|sorry|as an ai|here'?s|question:)/i;
const ADVICE_RE = /\b(you should|i recommend|it sounds like|that could be|this may be|diagnos|prescri|medical advice|see a doctor|call 911)\b/i;

/**
 * Strict gate on a rewritten question.
 * @param mustKeep patterns that have to survive the rewrite (scales, options).
 */
export function validatePhrasing(candidate: string, mustKeep: RegExp[] = []): boolean {
  const t = candidate.trim().replace(/^["'`]|["'`]$/g, '').trim();
  if (t.length < MIN_CHARS || t.length > MAX_CHARS) return false;
  if (t.includes('\n')) return false;

  // Exactly one sentence, and it has to still be a question.
  if (!t.endsWith('?')) return false;
  if ((t.match(/\?/g) ?? []).length > 1) return false;
  if (/[.!](\s|$)/.test(t.slice(0, -1))) return false;
  if (t.split(/\s+/).length > MAX_WORDS) return false;

  if (PREAMBLE_RE.test(t)) return false;
  if (ADVICE_RE.test(t)) return false;

  return mustKeep.every(re => re.test(t));
}

/** Strips quoting/labels the model sometimes wraps around its answer. */
export function cleanCandidate(raw: string): string {
  return raw
    .replace(/```[a-z]*\n?|```/g, '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)[0]
    ?.replace(/^(question|bea|assistant)\s*:\s*/i, '')
    .replace(/^["'`]|["'`]$/g, '')
    .trim() ?? '';
}

interface PhraseOptions {
  /** Patterns the rewrite must preserve — scales, named options. */
  mustKeep?: RegExp[];
  /** What is being logged, so the rewrite can name it naturally. */
  context?: string;
  timeoutMs?: number;
}

const INSTRUCTION =
  'Rewrite the question below so a warm voice assistant could say it out loud. ' +
  'Reply with the rewritten question only.';

/**
 * Returns a natural rewrite of `fallback`, or `fallback` itself if the model is
 * slow, unavailable, or returns anything that fails validation.
 */
export async function phraseQuestion(fallback: string, opts: PhraseOptions = {}): Promise<string> {
  const { mustKeep = [], context = '', timeoutMs = PHRASE_TIMEOUT_MS } = opts;

  const request = (async () => {
    const result = await getClient().queries.askNovaMicro({
      question: `${INSTRUCTION}\n\nQuestion: "${fallback}"`,
      context: context ? `The person is logging: ${context}` : '',
      history: '[]',
      mode: 'phrase',
    });
    return String(result.data ?? '');
  })();

  let raw: string;
  try {
    raw = await Promise.race([
      request,
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('phrase timeout')), timeoutMs)),
    ]);
  } catch {
    return fallback;
  }

  const candidate = cleanCandidate(raw);
  return validatePhrasing(candidate, mustKeep) ? candidate : fallback;
}

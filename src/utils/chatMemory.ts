// How much of a conversation Bea sees, and how older turns are remembered.
//
// Bea gets the most recent turns word for word. Once more than FOLD_AT turns
// have piled up unsummarized, the oldest ones (everything before the last
// HISTORY_WINDOW) are folded into a short running summary that rides along in
// her context. So she always sees at least HISTORY_WINDOW recent turns, at most
// about FOLD_AT, plus a summary of everything earlier — and the summary call
// runs once every few exchanges rather than on every message.

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>();

export interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Recent turns Bea always sees verbatim. */
export const HISTORY_WINDOW = 30;
/** Fold the oldest turns into the summary once this many are unsummarized. */
export const FOLD_AT = 40;
/** Hard cap on unsummarized turns, in case summaries keep failing. */
export const MAX_KEPT_TURNS = 60;

/**
 * Merge `turns` into `previous` and return the new summary, or null when the
 * call failed — the caller then keeps the turns and tries again later rather
 * than losing them.
 */
export async function summarizeTurns(
  previous: string,
  turns: HistoryTurn[],
  subjectContext?: string,
): Promise<string | null> {
  if (turns.length === 0) return previous || null;
  const transcript = turns
    .map(t => `${t.role === 'assistant' ? 'Bea' : 'User'}: ${t.content.replace(/\s+/g, ' ').trim()}`)
    .join('\n');
  const question = `PREVIOUS SUMMARY:\n${previous.trim() || '(none yet)'}\n\nNEW TURNS:\n${transcript}`;
  try {
    const result = await client.queries.askNovaMicro({
      question,
      history: '[]',
      context: subjectContext,
      mode: 'summarize',
    });
    const summary = String(result.data ?? '').trim();
    return summary || null;
  } catch (e) {
    console.warn('Failed to summarize earlier chat turns', e);
    return null;
  }
}

/** The context block that carries the summary to Bea. */
export function buildEarlierBlock(summary: string): string | null {
  const s = summary.trim();
  return s ? `EARLIER IN THIS CONVERSATION (summary of turns older than the chat history above):\n${s}` : null;
}

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
  /** The saved ChatMessage.sentAt, so a stored summary can say exactly where it stops. */
  sentAt?: string;
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

// ─── Saved memory (ChatMemory model, one row per thread) ─────────────────────
// Every read and write is best-effort: losing the saved memory only means a
// reopened chat rebuilds it from the transcript, never a broken conversation.

export const CHAT_MEMORY_SCHEMA_VERSION = 1;

export type UrgencyLevel = 'normal' | 'elevated' | 'emergency';

/** The session notes, in the shape the chat keeps them. */
export interface SessionNotes {
  knownAllergies: string[];
  currentSymptoms: string[];
  currentTopic: string | null;
  lastMentionedFood: string | null;
  lastMentionedMedication: string | null;
  urgencyLevel: UrgencyLevel;
  turnCount: number;
}

export interface SavedSummary {
  summary: string;
  /** sentAt of the last message the summary covers; later messages are sent verbatim. */
  summarizedThroughSentAt: string;
}

export interface SavedChatMemory {
  summary: SavedSummary | null;
  notes: SessionNotes | null;
}

export async function loadChatMemory(threadId: string): Promise<SavedChatMemory> {
  try {
    const { data } = await client.models.ChatMemory.get({ threadId });
    if (!data) return { summary: null, notes: null };
    return {
      summary: data.summary && data.summarizedThroughSentAt
        ? { summary: data.summary, summarizedThroughSentAt: data.summarizedThroughSentAt }
        : null,
      notes: data.sessionUpdatedAt
        ? {
            knownAllergies: (data.knownAllergies ?? []).filter((s): s is string => !!s),
            currentSymptoms: (data.currentSymptoms ?? []).filter((s): s is string => !!s),
            currentTopic: data.currentTopic ?? null,
            lastMentionedFood: data.lastMentionedFood ?? null,
            lastMentionedMedication: data.lastMentionedMedication ?? null,
            urgencyLevel: data.urgencyLevel ?? 'normal',
            turnCount: data.turnCount ?? 0,
          }
        : null,
    };
  } catch (e) {
    console.warn('Failed to load chat memory', e);
    return { summary: null, notes: null };
  }
}

type MemoryFields = Omit<Schema['ChatMemory']['type'], 'threadId' | 'createdAt' | 'updatedAt' | 'owner'>;

/** Update the thread's memory row, creating it on first save. Only `fields` are touched. */
async function upsert(threadId: string, familyMemberId: string | undefined, fields: Partial<MemoryFields>) {
  try {
    const row = { threadId, familyMemberId: familyMemberId ?? null, schemaVersion: CHAT_MEMORY_SCHEMA_VERSION, ...fields };
    const updated = await client.models.ChatMemory.update(row);
    if (updated.data) return;
    const created = await client.models.ChatMemory.create(row);
    if (created.errors?.length) console.warn('Failed to save chat memory', created.errors);
  } catch (e) {
    console.warn('Failed to save chat memory', e);
  }
}

export function saveSummary(threadId: string, familyMemberId: string | undefined, s: SavedSummary): Promise<void> {
  return upsert(threadId, familyMemberId, {
    summary: s.summary,
    summarizedThroughSentAt: s.summarizedThroughSentAt,
    summaryUpdatedAt: new Date().toISOString(),
  });
}

export function saveSessionNotes(threadId: string, familyMemberId: string | undefined, n: SessionNotes): Promise<void> {
  return upsert(threadId, familyMemberId, {
    knownAllergies: n.knownAllergies,
    currentSymptoms: n.currentSymptoms,
    currentTopic: n.currentTopic,
    lastMentionedFood: n.lastMentionedFood,
    lastMentionedMedication: n.lastMentionedMedication,
    urgencyLevel: n.urgencyLevel,
    turnCount: n.turnCount,
    sessionUpdatedAt: new Date().toISOString(),
  });
}

export async function deleteChatMemory(threadId: string): Promise<void> {
  try {
    await client.models.ChatMemory.delete({ threadId });
  } catch (e) {
    console.warn('Failed to delete chat memory', e);
  }
}

// Persistence for Bea conversations, one thread per person.
//
// Chat used to live only in React state, so a reload lost it and a caregiver
// had no way to look back at what they told Bea about a particular child.
// Threads are keyed to a patient rather than the account so switching person
// cannot carry one child's symptoms into another's conversation.
//
// Every write here is best-effort: a failed save degrades the history, but it
// must never break the conversation in progress.

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>();

export interface ChatThreadRecord {
  id: string;
  familyMemberId: string | undefined;
  title: string;
  startedAt: string;
  lastMessageAt: string;
  messageCount: number;
}

export interface ChatMessageRecord {
  id: string;
  threadId: string;
  role: 'user' | 'assistant';
  content: string;
  sentAt: string;
}

// Threads accumulate over months, and the default page is small enough that a
// regular user would start losing older conversations off the end of the list.
const THREAD_PAGE = 300;

const toThread = (t: Schema['ChatThread']['type']): ChatThreadRecord => ({
  id: t.id,
  familyMemberId: t.familyMemberId ?? undefined,
  title: t.title?.trim() || 'Conversation',
  startedAt: t.startedAt,
  lastMessageAt: t.lastMessageAt,
  messageCount: t.messageCount ?? 0,
});

/** Threads for one person, newest first. `undefined` means the profile owner. */
export async function listThreads(familyMemberId: string | undefined): Promise<ChatThreadRecord[]> {
  try {
    const { data } = await client.models.ChatThread.list({ limit: THREAD_PAGE });
    return (data ?? [])
      .filter(t => (t.familyMemberId ?? undefined) === familyMemberId)
      .map(toThread)
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  } catch (e) {
    console.warn('Failed to list chat threads', e);
    return [];
  }
}

/** Every thread in the household, newest first — used by the profile browser. */
export async function listAllThreads(): Promise<ChatThreadRecord[]> {
  try {
    const { data } = await client.models.ChatThread.list({ limit: THREAD_PAGE });
    return (data ?? [])
      .map(toThread)
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  } catch (e) {
    console.warn('Failed to list chat threads', e);
    return [];
  }
}

export async function latestThread(familyMemberId: string | undefined): Promise<ChatThreadRecord | null> {
  return (await listThreads(familyMemberId))[0] ?? null;
}

/** How much of a long conversation to rehydrate. One page, no cursor chasing. */
const MESSAGE_PAGE = 200;

/**
 * Messages in a thread, oldest first — the order they are rendered in.
 *
 * Fetched newest-first and reversed rather than read straight off the ascending
 * index: a single page in ascending order would return the *oldest* 200 messages
 * of a long thread and silently drop everything recent, which is the opposite of
 * what someone reopening a conversation needs.
 */
export async function loadMessages(threadId: string): Promise<ChatMessageRecord[]> {
  try {
    const { data } = await client.models.ChatMessage.listChatMessageByThreadIdAndSentAt(
      { threadId },
      { sortDirection: 'DESC', limit: MESSAGE_PAGE },
    );
    return (data ?? [])
      .map(m => ({
        id: m.id,
        threadId: m.threadId,
        role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: m.content,
        sentAt: m.sentAt,
      }))
      .reverse();
  } catch (e) {
    console.warn('Failed to load chat messages', e);
    return [];
  }
}

/**
 * A thread's title, taken from the first thing the user said.
 *
 * Truncated on a word boundary so the profile list reads as a sentence
 * fragment rather than a hard cut mid-word.
 */
export function deriveTitle(firstUserMessage: string): string {
  const flat = firstUserMessage.replace(/\s+/g, ' ').trim();
  if (!flat) return 'Conversation';
  if (flat.length <= 48) return flat;
  const cut = flat.slice(0, 48);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 24 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/**
 * Created lazily on the first user message, so opening the chat and walking
 * away leaves no empty threads in the profile history.
 */
export async function createThread(
  familyMemberId: string | undefined,
  title: string,
): Promise<ChatThreadRecord | null> {
  const now = new Date().toISOString();
  try {
    const { data } = await client.models.ChatThread.create({
      familyMemberId: familyMemberId ?? null,
      title,
      startedAt: now,
      lastMessageAt: now,
      messageCount: 0,
    });
    return data ? toThread(data) : null;
  } catch (e) {
    console.warn('Failed to create chat thread', e);
    return null;
  }
}

export async function appendMessage(
  threadId: string,
  familyMemberId: string | undefined,
  role: 'user' | 'assistant',
  content: string,
): Promise<void> {
  try {
    await client.models.ChatMessage.create({
      threadId,
      familyMemberId: familyMemberId ?? null,
      role,
      content,
      sentAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('Failed to save a chat message', e);
  }
}

/** Bump the thread so it sorts to the top and its message count stays honest. */
export async function touchThread(threadId: string, messageCount: number): Promise<void> {
  try {
    await client.models.ChatThread.update({
      id: threadId,
      lastMessageAt: new Date().toISOString(),
      messageCount,
    });
  } catch (e) {
    console.warn('Failed to update a chat thread', e);
  }
}

export async function deleteThread(threadId: string): Promise<void> {
  try {
    const messages = await loadMessages(threadId);
    await Promise.all(messages.map(m => client.models.ChatMessage.delete({ id: m.id })));
    await client.models.ChatThread.delete({ id: threadId });
  } catch (e) {
    console.warn('Failed to delete a chat thread', e);
  }
}

import { describe, it, expect, vi, beforeEach } from 'vitest';

// chatThreads builds an Amplify client at module scope. The store below stands
// in for it so the module's own logic — per-person filtering, ordering, the
// oldest-page trap in loadMessages — can be tested without a backend.
interface Row { [k: string]: unknown }
const tables: { ChatThread: Row[]; ChatMessage: Row[] } = { ChatThread: [], ChatMessage: [] };
let failNext = false;

vi.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      ChatThread: {
        list: async () => {
          if (failNext) throw new Error('network');
          return { data: [...tables.ChatThread] };
        },
        create: async (input: Row) => {
          if (failNext) throw new Error('network');
          const row = { id: `t${tables.ChatThread.length + 1}`, ...input };
          tables.ChatThread.push(row);
          return { data: row };
        },
        update: async (input: Row) => {
          const row = tables.ChatThread.find(t => t.id === input.id);
          if (row) Object.assign(row, input);
          return { data: row };
        },
        delete: async (input: Row) => {
          tables.ChatThread = tables.ChatThread.filter(t => t.id !== input.id);
          return { data: null };
        },
      },
      ChatMessage: {
        listChatMessageByThreadIdAndSentAt: async (
          key: { threadId: string },
          opts?: { sortDirection?: string; limit?: number },
        ) => {
          if (failNext) throw new Error('network');
          const rows = tables.ChatMessage
            .filter(m => m.threadId === key.threadId)
            .sort((a, b) => String(a.sentAt).localeCompare(String(b.sentAt)));
          const ordered = opts?.sortDirection === 'DESC' ? rows.reverse() : rows;
          return { data: ordered.slice(0, opts?.limit ?? 100) };
        },
        create: async (input: Row) => {
          const row = { id: `m${tables.ChatMessage.length + 1}`, ...input };
          tables.ChatMessage.push(row);
          return { data: row };
        },
        delete: async (input: Row) => {
          tables.ChatMessage = tables.ChatMessage.filter(m => m.id !== input.id);
          return { data: null };
        },
      },
    },
  }),
}));

const {
  appendMessage,
  createThread,
  deleteThread,
  deriveTitle,
  latestThread,
  listAllThreads,
  listThreads,
  loadMessages,
  touchThread,
} = await import('../utils/chatThreads');

const thread = (over: Row = {}): Row => ({
  id: 't1',
  familyMemberId: null,
  title: 'Conversation',
  startedAt: '2026-08-10T10:00:00.000Z',
  lastMessageAt: '2026-08-10T10:00:00.000Z',
  messageCount: 0,
  ...over,
});

beforeEach(() => {
  tables.ChatThread = [];
  tables.ChatMessage = [];
  failNext = false;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('deriveTitle', () => {
  it('uses the first message as the title', () => {
    expect(deriveTitle('Maya has hives on her arms')).toBe('Maya has hives on her arms');
  });

  it('collapses whitespace and trims', () => {
    expect(deriveTitle('  hives   on\n  her arms  ')).toBe('hives on her arms');
  });

  it('falls back for an empty message', () => {
    expect(deriveTitle('')).toBe('Conversation');
    expect(deriveTitle('    ')).toBe('Conversation');
  });

  it('truncates on a word boundary rather than mid-word', () => {
    const original = 'She came out in hives about twenty minutes after eating the birthday cake';
    const title = deriveTitle(original);
    expect(title.length).toBeLessThanOrEqual(49);
    expect(title.endsWith('…')).toBe(true);

    // The kept text must be a whole-word prefix: the original carries on with a
    // space at exactly the point the title stops.
    const kept = title.slice(0, -1);
    expect(original.startsWith(kept)).toBe(true);
    expect(original[kept.length]).toBe(' ');
  });

  it('keeps a message that already fits', () => {
    const short = 'Rash after peanuts';
    expect(deriveTitle(short)).toBe(short);
  });

  it('truncates hard when there is no space to cut at', () => {
    const title = deriveTitle('x'.repeat(80));
    expect(title.endsWith('…')).toBe(true);
    expect(title.length).toBeLessThanOrEqual(49);
  });
});

describe('listThreads', () => {
  it('returns only the given person\'s threads', async () => {
    tables.ChatThread = [
      thread({ id: 'owner', familyMemberId: null }),
      thread({ id: 'maya', familyMemberId: 'fm-1' }),
      thread({ id: 'alex', familyMemberId: 'fm-2' }),
    ];
    expect((await listThreads(undefined)).map(t => t.id)).toEqual(['owner']);
    expect((await listThreads('fm-1')).map(t => t.id)).toEqual(['maya']);
  });

  it('treats a null familyMemberId as the profile owner', async () => {
    tables.ChatThread = [thread({ id: 'owner', familyMemberId: null })];
    const [t] = await listThreads(undefined);
    expect(t.familyMemberId).toBeUndefined();
  });

  it('orders newest first', async () => {
    tables.ChatThread = [
      thread({ id: 'old', lastMessageAt: '2026-08-01T10:00:00.000Z' }),
      thread({ id: 'new', lastMessageAt: '2026-08-14T10:00:00.000Z' }),
      thread({ id: 'mid', lastMessageAt: '2026-08-07T10:00:00.000Z' }),
    ];
    expect((await listThreads(undefined)).map(t => t.id)).toEqual(['new', 'mid', 'old']);
  });

  it('degrades to an empty list rather than throwing', async () => {
    failNext = true;
    expect(await listThreads(undefined)).toEqual([]);
    expect(await listAllThreads()).toEqual([]);
  });

  it('falls back to a readable title when none was stored', async () => {
    tables.ChatThread = [thread({ title: '   ' })];
    expect((await listThreads(undefined))[0].title).toBe('Conversation');
  });
});

describe('latestThread', () => {
  it('returns the most recent thread for that person', async () => {
    tables.ChatThread = [
      thread({ id: 'a', familyMemberId: 'fm-1', lastMessageAt: '2026-08-01T10:00:00.000Z' }),
      thread({ id: 'b', familyMemberId: 'fm-1', lastMessageAt: '2026-08-14T10:00:00.000Z' }),
    ];
    expect((await latestThread('fm-1'))?.id).toBe('b');
  });

  it('returns null when that person has never chatted', async () => {
    tables.ChatThread = [thread({ familyMemberId: 'fm-9' })];
    expect(await latestThread('fm-1')).toBeNull();
  });
});

describe('loadMessages', () => {
  const fill = (n: number) => {
    for (let i = 0; i < n; i++) {
      tables.ChatMessage.push({
        id: `m${i}`,
        threadId: 't1',
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `message ${i}`,
        sentAt: new Date(Date.UTC(2026, 7, 14, 0, i)).toISOString(),
      });
    }
  };

  it('returns messages oldest first, ready to render', async () => {
    fill(4);
    const msgs = await loadMessages('t1');
    expect(msgs.map(m => m.content)).toEqual(['message 0', 'message 1', 'message 2', 'message 3']);
  });

  it('keeps the most recent messages of a long thread, not the oldest', async () => {
    // Reading a single ascending page would return message 0-199 and silently
    // drop everything the conversation is actually about.
    fill(260);
    const msgs = await loadMessages('t1');
    expect(msgs).toHaveLength(200);
    expect(msgs[msgs.length - 1].content).toBe('message 259');
    expect(msgs[0].content).toBe('message 60');
  });

  it('normalises any unexpected role to user', async () => {
    tables.ChatMessage = [
      { id: 'm1', threadId: 't1', role: 'system', content: 'x', sentAt: '2026-08-14T00:00:00.000Z' },
    ];
    expect((await loadMessages('t1'))[0].role).toBe('user');
  });

  it('degrades to an empty transcript rather than throwing', async () => {
    failNext = true;
    expect(await loadMessages('t1')).toEqual([]);
  });
});

describe('writes', () => {
  it('creates a thread stamped with the person and the time', async () => {
    const created = await createThread('fm-1', 'Hives');
    expect(created?.familyMemberId).toBe('fm-1');
    expect(created?.title).toBe('Hives');
    expect(created?.messageCount).toBe(0);
    expect(tables.ChatThread).toHaveLength(1);
  });

  it('stores the owner as null so it matches the HealthEntry convention', async () => {
    await createThread(undefined, 'Mine');
    expect(tables.ChatThread[0].familyMemberId).toBeNull();
  });

  it('returns null instead of throwing when the create fails', async () => {
    failNext = true;
    expect(await createThread('fm-1', 'Hives')).toBeNull();
  });

  it('appends a message against the thread and person', async () => {
    await appendMessage('t1', 'fm-1', 'user', 'hello');
    expect(tables.ChatMessage[0]).toMatchObject({ threadId: 't1', familyMemberId: 'fm-1', role: 'user', content: 'hello' });
  });

  it('bumps the thread so it sorts back to the top', async () => {
    tables.ChatThread = [thread({ lastMessageAt: '2026-08-01T10:00:00.000Z', messageCount: 2 })];
    await touchThread('t1', 5);
    expect(tables.ChatThread[0].messageCount).toBe(5);
    expect(String(tables.ChatThread[0].lastMessageAt) > '2026-08-01T10:00:00.000Z').toBe(true);
  });

  it('removes a thread and its messages together', async () => {
    tables.ChatThread = [thread()];
    tables.ChatMessage = [
      { id: 'm1', threadId: 't1', role: 'user', content: 'a', sentAt: '2026-08-14T00:00:00.000Z' },
      { id: 'm2', threadId: 'other', role: 'user', content: 'b', sentAt: '2026-08-14T00:00:00.000Z' },
    ];
    await deleteThread('t1');
    expect(tables.ChatThread).toHaveLength(0);
    expect(tables.ChatMessage.map(m => m.id)).toEqual(['m2']);
  });
});

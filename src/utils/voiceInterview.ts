// ─── Voice interview engine ───────────────────────────────────────────────────
// Drives the follow-up questions the voice logger asks after someone starts a
// log ("I have a rash"). Everything here is pure so it can be unit-tested and
// so the UI never has to guess what to ask next.
//
// Design rule: the LLM is used ONCE, to understand the opening sentence. Every
// follow-up answer is short and constrained ("a three", "this morning", "on my
// left arm"), so those are parsed deterministically here. That's what stops the
// logger from mangling what was said or silently dropping the severity.
import { toLocalDatetimeInputValue } from './formatTime';

export type EntryType = 'Symptom' | 'Exposure' | 'Medication';

export interface EntryDraft {
  type: EntryType;
  name: string;
  bodyArea?: string;
  /** Canonical 1–10 severity (what the rest of the app stores). Asked as 1–5. */
  severity?: number;
  /** When the symptom/exposure/dose actually began — local 'YYYY-MM-DDTHH:mm'. */
  startedAt?: string;
  /** What they said about timing when it couldn't be parsed, kept for the notes. */
  onsetRaw?: string;
  notes?: string;
  /** true → schedule a check-in ~24h after the entry. */
  followUp?: boolean;
  dose?: string;
  unit?: string;
  reason?: string;
  subtype?: string;
}

export type SlotKey =
  | 'name'
  | 'bodyArea'
  | 'severity'
  | 'onset'
  | 'dose'
  | 'reason'
  | 'notes'
  | 'followUp';

export interface Slot {
  key: SlotKey;
  /** The question Bea asks — phrased around what she already knows. */
  ask: (d: EntryDraft) => string;
  /** Tappable answers, for noisy rooms or when speaking isn't practical. */
  chips?: (d: EntryDraft) => string[];
  /** Optional slots can be answered with "skip" / "nothing". */
  optional?: boolean;
  applies: (d: EntryDraft) => boolean;
  isFilled: (d: EntryDraft) => boolean;
}

export const SYMPTOM_OPTIONS = [
  'Hives', 'Rash', 'Swelling', 'Itching', 'Nausea', 'Vomiting', 'Stomach Pain',
  'Difficulty Breathing', 'Wheezing', 'Dizziness', 'Fatigue', 'Headache',
  'Runny Nose', 'Sneezing', 'Watery Eyes', 'Coughing', 'Throat Tightness',
];

// Symptoms that sit in one place get asked "where"; whole-body ones don't —
// being asked "where is the nausea?" is what makes a voice flow feel robotic.
const LOCALIZED_RE = /rash|hive|itch|swell|pain|ache|burn|redness|bump|blister|sting|cramp|tingl|numb|sore|welt|eczema|flush|dry skin|peeling/i;
const SYSTEMIC_RE = /nausea|vomit|dizz|faint|fatigue|breath|wheez|cough|fever|chills|headache|migraine|anxiet|sneez|runny nose|congest/i;

export function needsBodyArea(name: string): boolean {
  return LOCALIZED_RE.test(name) && !SYSTEMIC_RE.test(name);
}

// ─── Number / word helpers ────────────────────────────────────────────────────
const WORD_NUM: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, a: 1, an: 1, couple: 2, few: 3, several: 3,
};

function toNumber(token: string): number | null {
  const t = token.trim().toLowerCase();
  if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t);
  return t in WORD_NUM ? WORD_NUM[t] : null;
}

function firstNumber(text: string): number | null {
  const digit = text.match(/\d+(?:\.\d+)?/);
  if (digit) return parseFloat(digit[0]);
  const word = text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/);
  return word ? WORD_NUM[word[1]] : null;
}

// ─── Intent words ─────────────────────────────────────────────────────────────
export function isCancel(text: string): boolean {
  return /\b(cancel that|cancel this|cancel|never ?mind|forget it|start over|scratch that|stop logging)\b/i.test(text);
}

export function isSkip(text: string): boolean {
  return /^\s*(skip|skip it|none|nothing|nothing else|no|nope|nah|no notes|that'?s it|that'?s all|thats all|i'?m good|im good|all good|no thanks|no thank you|not really|don'?t know|dunno|not sure|unsure)\b/i.test(text);
}

export function parseYesNo(text: string): boolean | null {
  // Negatives are checked first: "no, that's ok" would otherwise trip on "ok".
  if (/\b(no|nope|nah|don'?t|do not|not really|no thanks|no thank you|never ?mind|skip)\b/i.test(text)) return false;
  if (/\b(yes|yeah|yep|yup|sure|please|ok|okay|sounds good|do it|definitely|of course|that would be good|check in|good idea)\b/i.test(text)) return true;
  return null;
}

// ─── Severity ─────────────────────────────────────────────────────────────────
// Asked on a 1–5 scale (easier to answer out loud), stored on the app's
// canonical 1–10 scale so the charts, Profile bars and Insights keep working.
const SEVERITY_WORDS: { re: RegExp; five: number }[] = [
  { re: /\b(barely|hardly|very mild|slight|tiny|a little)\b/i, five: 1 },
  { re: /\b(mild|minor|light|not too bad|not that bad)\b/i, five: 2 },
  { re: /\b(moderate|medium|middling|so-so|okay-ish|manageable)\b/i, five: 3 },
  { re: /\b(bad|severe|pretty bad|really bad|strong|intense)\b/i, five: 4 },
  { re: /\b(worst|unbearable|excruciating|awful|terrible|emergency|as bad as it gets)\b/i, five: 5 },
];

export function clampSeverity(n: number): number {
  return Math.min(10, Math.max(1, Math.round(n)));
}

/** Returns canonical 1–10 severity, or null if nothing usable was said. */
export function parseSeverity(text: string): number | null {
  const t = text.toLowerCase();

  // "4 out of 5", "7/10", "three out of five" — honour whatever scale they used.
  const scaled = t.match(/(\d+(?:\.\d+)?|[a-z]+)\s*(?:out of|outta|\/|of)\s*(\d+|five|ten)/);
  if (scaled) {
    const val = toNumber(scaled[1]);
    const max = toNumber(scaled[2]);
    if (val != null && max != null && max > 0 && val >= 0 && val <= max) {
      return clampSeverity((val / max) * 10);
    }
  }

  const num = firstNumber(t);
  if (num != null) {
    if (num >= 1 && num <= 5) return clampSeverity(num * 2);   // answered the 1–5 question
    if (num > 5 && num <= 10) return clampSeverity(num);       // answered on a 1–10 scale
    return null;
  }

  for (const { re, five } of SEVERITY_WORDS) {
    if (re.test(t)) return five * 2;
  }
  return null;
}

/** Canonical 1–10 → the 1–5 scale the voice logger speaks in. */
export function toFiveScale(severity: number): number {
  return Math.min(5, Math.max(1, Math.round(severity / 2)));
}

// ─── Onset ────────────────────────────────────────────────────────────────────
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function atTime(now: Date, dayOffset: number, hours: number, minutes = 0): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

// Nothing can have started in the future, and a voice log is never about last
// year — both usually mean the phrase was misheard.
//   'shift' — a bare clock time ("at 9" said at 8am) most likely meant yesterday.
//   'clamp' — an explicitly-today phrase ("this morning" said at 6am) means
//             earlier today, so pull it back to now rather than to yesterday.
function settle(d: Date, now: Date, mode: 'shift' | 'clamp' = 'clamp'): string | null {
  let out = d;
  if (out.getTime() > now.getTime()) {
    out = mode === 'shift' ? new Date(out.getTime() - 86_400_000) : new Date(now);
    if (out.getTime() > now.getTime()) out = new Date(now);
  }
  if (now.getTime() - out.getTime() > 366 * 86_400_000) return null;
  return toLocalDatetimeInputValue(out);
}

/** Parses "this morning", "two hours ago", "last night"… into a local datetime. */
export function parseOnset(text: string, now: Date = new Date()): string | null {
  const t = text.toLowerCase().trim();
  if (!t) return null;

  if (/\b(just now|right now|just started|just began|just came on|a moment ago|a second ago|seconds ago|literally now|now)\b/.test(t)) {
    return settle(new Date(now), now);
  }
  if (/half an hour ago|half hour ago/.test(t)) {
    return settle(new Date(now.getTime() - 30 * 60_000), now);
  }

  const rel = t.match(/\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|a|an|couple|few|several)\s*(?:of\s+)?(minute|min|hour|hr|day|week)s?\s*(?:or so\s*)?ago\b/);
  if (rel) {
    const n = toNumber(rel[1]);
    const unitMs: Record<string, number> = { minute: 60_000, min: 60_000, hour: 3_600_000, hr: 3_600_000, day: 86_400_000, week: 604_800_000 };
    if (n != null) return settle(new Date(now.getTime() - n * unitMs[rel[2]]), now);
  }

  if (/\byesterday morning\b/.test(t)) return settle(atTime(now, -1, 8), now);
  if (/\byesterday afternoon\b/.test(t)) return settle(atTime(now, -1, 14), now);
  if (/\byesterday (evening|night)\b/.test(t)) return settle(atTime(now, -1, 20), now);
  if (/\b(last night|overnight|during the night|middle of the night)\b/.test(t)) return settle(atTime(now, -1, 21), now);
  if (/\byesterday\b/.test(t)) return settle(atTime(now, -1, 12), now);
  if (/\b(this morning|when i woke up|after i woke up|woke up with|first thing)\b/.test(t)) return settle(atTime(now, 0, 8), now);
  if (/\bthis afternoon\b/.test(t)) return settle(atTime(now, 0, 14), now);
  if (/\b(this evening|tonight)\b/.test(t)) return settle(atTime(now, 0, 19), now);
  if (/\b(at lunch|lunchtime|after lunch)\b/.test(t)) return settle(atTime(now, 0, 13), now);
  if (/\b(at breakfast|after breakfast)\b/.test(t)) return settle(atTime(now, 0, 8), now);
  if (/\b(at dinner|after dinner|dinnertime)\b/.test(t)) return settle(atTime(now, 0, 19), now);
  if (/\b(a )?(few|couple of|couple) days ago\b/.test(t)) {
    const n = /couple/.test(t) ? 2 : 3;
    return settle(new Date(now.getTime() - n * 86_400_000), now);
  }
  if (/\b(last week|a week ago|about a week ago)\b/.test(t)) return settle(new Date(now.getTime() - 7 * 86_400_000), now);
  if (/\btoday\b/.test(t) && !/\bat\b/.test(t)) return settle(new Date(now), now);

  // Weekday names → the most recent one that has already happened.
  const wd = t.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (wd) {
    const target = WEEKDAYS.indexOf(wd[1]);
    let back = (now.getDay() - target + 7) % 7;
    if (back === 0) back = 7;
    return settle(atTime(now, -back, 9), now);
  }

  // Clock times — only when clearly a time ("at 3", "3:30", "9 pm", "10 o'clock").
  const clock = t.match(/\b(?:at|around|about|since)?\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|o'?clock)?\b/);
  if (clock && (clock[2] || clock[3] || /\b(at|around|about|since)\b/.test(t))) {
    let h = parseInt(clock[1], 10);
    const m = clock[2] ? parseInt(clock[2], 10) : 0;
    const suffix = clock[3] ?? '';
    if (h >= 0 && h <= 23 && m < 60) {
      if (/p/.test(suffix) && h < 12) h += 12;
      if (/a/.test(suffix) && h === 12) h = 0;
      return settle(atTime(now, 0, h, m), now, 'shift');
    }
  }
  return null;
}

// ─── Free-text cleanup ────────────────────────────────────────────────────────
const LEAD_FILLER = /^(?:um+|uh+|er+|so|well|okay|ok|yeah|yes|i think|i guess|i'?d say|it'?s|its|it is|there'?s|there is|they'?re|i have|i'?ve got|i got|i am having|i'?m having|i feel|i'?m feeling|feeling|i have got|my|the|a|an|on|in|at|around|near|mostly|just|like|about)\b[\s,]*/i;

function stripFiller(text: string): string {
  let out = text.trim().replace(/[.!?,]+$/, '');
  for (let i = 0; i < 6; i++) {
    const next = out.replace(LEAD_FILLER, '');
    if (next === out) break;
    out = next.trim();
  }
  return out.trim();
}

function titleCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function fuzzyMatch(input: string, options: string[]): string | null {
  const lower = input.toLowerCase().trim();
  if (!lower) return null;
  return (
    options.find(o => o.toLowerCase() === lower) ??
    options.find(o => lower.includes(o.toLowerCase())) ??
    options.find(o => o.toLowerCase().startsWith(lower)) ??
    null
  );
}

/** "I've got a really itchy rash" → "Rash" (or the cleaned phrase if unknown). */
export function cleanSymptomName(text: string): string {
  const matched = fuzzyMatch(text, SYMPTOM_OPTIONS);
  if (matched) return matched;
  const cleaned = stripFiller(text);
  if (!cleaned) return '';
  return titleCase(cleaned.slice(0, 60));
}

/** "it's on my left arm" → "Left arm". */
export function cleanBodyArea(text: string): string {
  if (/all over/i.test(text)) return 'All over';
  const cleaned = stripFiller(text.replace(/\b(side|body)\b\s*$/i, '').trim());
  if (!cleaned) return '';
  return titleCase(cleaned.slice(0, 40));
}

/** "twenty five milligrams" / "25mg" → { dose: '25', unit: 'mg' }. */
export function parseDose(text: string): { dose?: string; unit?: string } {
  const t = text.toLowerCase();
  const m = t.match(/(\d+(?:\.\d+)?)\s*(mg|milligrams?|ml|millilit(?:er|re)s?|mcg|micrograms?|g|grams?|units?|puffs?|tablets?|pills?|sprays?|drops?)?/);
  if (!m) return {};
  const rawUnit = m[2] ?? '';
  const unitMap: [RegExp, string][] = [
    [/^mg|^milligram/, 'mg'], [/^ml|^millilit/, 'ml'], [/^mcg|^microgram/, 'mcg'],
    [/^g$|^gram/, 'g'], [/^unit/, 'units'], [/^puff/, 'puffs'],
    [/^tablet|^pill/, 'tablets'], [/^spray/, 'sprays'], [/^drop/, 'drops'],
  ];
  const unit = unitMap.find(([re]) => re.test(rawUnit))?.[1];
  return { dose: m[1], unit };
}

// ─── Opening-sentence fallback ────────────────────────────────────────────────
// Used when the model call fails or comes back unusable, so a Bedrock hiccup
// can never block someone from logging a symptom.
const MED_RE = /\b(took|take|taking|swallowed|injected|applied|dose|doses|mg|benadryl|epipen|zyrtec|claritin|allegra|epinephrine|antihistamine|inhaler|puffer|ointment|tablet|pill|capsule)\b/i;
const EXPOSURE_RE = /\b(ate|eaten|eating|drank|drink|drinking|had (?:a|some|the)|meal|lunch|dinner|breakfast|snack|exposed|touched|petted|lotion|detergent|pollen|dust|restaurant)\b/i;

export function classifyOpening(text: string): EntryType {
  if (MED_RE.test(text)) return 'Medication';
  if (EXPOSURE_RE.test(text)) return 'Exposure';
  return 'Symptom';
}

export function localExtract(text: string): EntryDraft {
  const type = classifyOpening(text);
  if (type === 'Symptom') return { type, name: cleanSymptomName(text) };

  const m = text.match(/\b(?:took|ate|had|drank|used|applied)\s+(?:some\s+|a\s+|an\s+|the\s+|my\s+)?([\w\s'-]{2,40})/i);
  let name = (m?.[1] ?? '').replace(/\b(for|because|since|at|around|this|last|yesterday|today)\b.*$/i, '').trim();
  if (!name) name = stripFiller(text).slice(0, 40);
  return { type, name: name ? titleCase(name) : '' };
}

/**
 * Severity from the opening sentence — only when it's unmistakably a rating.
 * A bare number ("I ate 2 cookies") must never become a severity.
 */
const EXPLICIT_SEVERITY_RE = /\b(severity|out of|outta|scale|level)\b|\d\s*\/\s*\d/i;

export function openingSeverity(text: string): number | null {
  return EXPLICIT_SEVERITY_RE.test(text) ? parseSeverity(text) : null;
}

// ─── Slots ────────────────────────────────────────────────────────────────────
// `ask` reads from the draft so the questions name the thing being logged
// ("How bad is the rash?") instead of sounding like a generic form.
const subject = (d: EntryDraft) => (d.name ? d.name.toLowerCase() : 'it');

const SYMPTOM_SLOTS: Slot[] = [
  {
    key: 'name',
    ask: () => 'What are you noticing right now?',
    chips: () => ['Hives', 'Rash', 'Swelling', 'Itching', 'Nausea'],
    applies: () => true,
    isFilled: d => !!d.name,
  },
  {
    key: 'bodyArea',
    ask: d => `Where on your body is the ${subject(d)}?`,
    chips: () => ['Face', 'Arms', 'Hands', 'Legs', 'Torso', 'All over'],
    applies: d => needsBodyArea(d.name),
    isFilled: d => !!d.bodyArea,
  },
  {
    key: 'severity',
    ask: d => `On a scale of 1 to 5, how bad is the ${subject(d)} right now?`,
    chips: () => ['1', '2', '3', '4', '5'],
    applies: () => true,
    isFilled: d => typeof d.severity === 'number',
  },
  {
    key: 'onset',
    ask: d => `When did the ${subject(d)} start?`,
    chips: () => ['Just now', 'An hour ago', 'This morning', 'Last night', 'Yesterday'],
    applies: () => true,
    isFilled: d => !!d.startedAt,
  },
  {
    key: 'notes',
    ask: d => `Anything else I should note about the ${subject(d)} — what you ate, anything you took for it?`,
    chips: () => ['Nothing else'],
    optional: true,
    applies: () => true,
    isFilled: d => d.notes !== undefined,
  },
  {
    key: 'followUp',
    ask: d => `Want me to check in tomorrow to see if the ${subject(d)} has cleared up?`,
    chips: () => ['Yes, check in', 'No thanks'],
    applies: () => true,
    isFilled: d => typeof d.followUp === 'boolean',
  },
];

const EXPOSURE_SLOTS: Slot[] = [
  {
    key: 'name',
    ask: () => 'What were you exposed to?',
    applies: () => true,
    isFilled: d => !!d.name,
  },
  {
    key: 'onset',
    ask: d => `When did you have the ${subject(d)}?`,
    chips: () => ['Just now', 'An hour ago', 'This morning', 'Yesterday'],
    applies: () => true,
    isFilled: d => !!d.startedAt,
  },
  {
    key: 'notes',
    ask: d => `Anything else about the ${subject(d)} — how much, or where it was from?`,
    chips: () => ['Nothing else'],
    optional: true,
    applies: () => true,
    isFilled: d => d.notes !== undefined,
  },
  {
    key: 'followUp',
    ask: () => 'Want me to check in tomorrow to see if you reacted to it?',
    chips: () => ['Yes, check in', 'No thanks'],
    applies: () => true,
    isFilled: d => typeof d.followUp === 'boolean',
  },
];

const MEDICATION_SLOTS: Slot[] = [
  {
    key: 'name',
    ask: () => 'Which medication did you take?',
    applies: () => true,
    isFilled: d => !!d.name,
  },
  {
    key: 'dose',
    ask: d => `How much ${subject(d)} did you take?`,
    chips: () => ['25 mg', '50 mg', '1 tablet', 'Not sure'],
    optional: true,
    applies: () => true,
    isFilled: d => d.dose !== undefined,
  },
  {
    key: 'onset',
    ask: d => `When did you take the ${subject(d)}?`,
    chips: () => ['Just now', 'An hour ago', 'This morning', 'Last night'],
    applies: () => true,
    isFilled: d => !!d.startedAt,
  },
  {
    key: 'reason',
    ask: () => 'What did you take it for?',
    chips: () => ['Allergic reaction', 'Prevention', 'Skip'],
    optional: true,
    applies: () => true,
    isFilled: d => d.reason !== undefined,
  },
  {
    key: 'notes',
    ask: () => 'Anything else to note?',
    chips: () => ['Nothing else'],
    optional: true,
    applies: () => true,
    isFilled: d => d.notes !== undefined,
  },
];

export const SLOTS: Record<EntryType, Slot[]> = {
  Symptom: SYMPTOM_SLOTS,
  Exposure: EXPOSURE_SLOTS,
  Medication: MEDICATION_SLOTS,
};

/**
 * The next question to ask: the first slot that applies, isn't already filled
 * from the opening sentence, and hasn't been asked yet. Anything the opening
 * sentence already covered is skipped, so "I have a rash on my arm, started
 * this morning" only gets asked for severity, notes and the check-in.
 */
export function nextSlot(draft: EntryDraft, asked: SlotKey[] = []): Slot | null {
  const slots = SLOTS[draft.type] ?? [];
  return slots.find(s => s.applies(draft) && !s.isFilled(draft) && !asked.includes(s.key)) ?? null;
}

export function remainingCount(draft: EntryDraft, asked: SlotKey[] = []): number {
  const slots = SLOTS[draft.type] ?? [];
  return slots.filter(s => s.applies(draft) && !s.isFilled(draft) && !asked.includes(s.key)).length;
}

// ─── Answer application ───────────────────────────────────────────────────────
export interface AnswerResult {
  draft: EntryDraft;
  /** 'retry' → the answer didn't parse; `reprompt` explains what's needed. */
  status: 'ok' | 'retry' | 'cancel';
  reprompt?: string;
}

export function applyAnswer(
  draft: EntryDraft,
  key: SlotKey,
  transcript: string,
  now: Date = new Date(),
): AnswerResult {
  const text = transcript.trim();
  if (!text) return { draft, status: 'retry', reprompt: "I didn't catch that — could you say it again?" };
  if (isCancel(text)) return { draft, status: 'cancel' };

  const slot = (SLOTS[draft.type] ?? []).find(s => s.key === key);
  if (slot?.optional && isSkip(text)) {
    // Record the skip so the slot is considered answered rather than re-asked.
    const skipped: EntryDraft = { ...draft };
    if (key === 'notes') skipped.notes = '';
    if (key === 'reason') skipped.reason = '';
    if (key === 'dose') skipped.dose = '';
    return { draft: skipped, status: 'ok' };
  }

  switch (key) {
    case 'name': {
      const name = draft.type === 'Symptom' ? cleanSymptomName(text) : titleCase(stripFiller(text).slice(0, 60));
      if (!name) return { draft, status: 'retry', reprompt: 'Sorry — what should I call this?' };
      return { draft: { ...draft, name }, status: 'ok' };
    }
    case 'bodyArea': {
      const area = cleanBodyArea(text);
      if (!area) return { draft, status: 'retry', reprompt: 'Whereabouts on your body — for example your face, arms or legs?' };
      return { draft: { ...draft, bodyArea: area }, status: 'ok' };
    }
    case 'severity': {
      const severity = parseSeverity(text);
      if (severity == null) {
        return { draft, status: 'retry', reprompt: 'Just a number from 1 to 5 — 1 is barely there, 5 is the worst it has been.' };
      }
      return { draft: { ...draft, severity }, status: 'ok' };
    }
    case 'onset': {
      const startedAt = parseOnset(text, now);
      if (!startedAt) {
        return { draft, status: 'retry', reprompt: 'Roughly when did it start — something like "two hours ago", "this morning" or "yesterday"?' };
      }
      return { draft: { ...draft, startedAt, onsetRaw: text }, status: 'ok' };
    }
    case 'dose': {
      const { dose, unit } = parseDose(text);
      if (!dose) return { draft: { ...draft, dose: '', notes: draft.notes }, status: 'ok' };
      return { draft: { ...draft, dose, unit: unit ?? draft.unit }, status: 'ok' };
    }
    case 'reason':
      return { draft: { ...draft, reason: titleCase(stripFiller(text).slice(0, 80)) }, status: 'ok' };
    case 'notes':
      return { draft: { ...draft, notes: text.slice(0, 500) }, status: 'ok' };
    case 'followUp': {
      const yn = parseYesNo(text);
      if (yn == null) return { draft, status: 'retry', reprompt: 'Just a yes or no — should I check in on this tomorrow?' };
      return { draft: { ...draft, followUp: yn }, status: 'ok' };
    }
    default:
      return { draft, status: 'ok' };
  }
}

/**
 * Last resort after repeated misfires: keep what was actually said in the notes
 * instead of dropping it, and let the flow move on.
 */
export function stashUnparsed(draft: EntryDraft, key: SlotKey, transcript: string): EntryDraft {
  const note = `${key === 'onset' ? 'Timing' : key}: "${transcript.trim()}"`;
  const notes = draft.notes ? `${draft.notes} · ${note}` : note;
  const out: EntryDraft = { ...draft, notes };
  // Mark the slot as filled with a neutral value so it isn't asked forever.
  if (key === 'onset') out.startedAt = out.startedAt ?? toLocalDatetimeInputValue(new Date());
  if (key === 'bodyArea') out.bodyArea = out.bodyArea ?? 'Not specified';
  if (key === 'followUp') out.followUp = out.followUp ?? false;
  return out;
}

// ─── Persistence payload ──────────────────────────────────────────────────────
export interface HealthEntryPayload {
  type: EntryType;
  name: string;
  severity?: number;
  bodyArea?: string;
  notes?: string;
  dose?: string;
  unit?: string;
  reason?: string;
  subtype?: string;
  time: string;
  followUpAt?: string;
  followUpStatus?: string;
}

/** Check-ins land the next morning rather than exactly 24h later at 3am. */
export function nextCheckInTime(from: Date): string {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  if (d.getHours() < 9) d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

export function draftToPayload(draft: EntryDraft, now: Date = new Date()): HealthEntryPayload {
  const trimmed = (v?: string) => (v && v.trim() ? v.trim() : undefined);
  const payload: HealthEntryPayload = {
    type: draft.type,
    name: draft.name.trim(),
    severity: typeof draft.severity === 'number' ? clampSeverity(draft.severity) : undefined,
    bodyArea: trimmed(draft.bodyArea),
    notes: trimmed(draft.notes),
    dose: trimmed(draft.dose),
    unit: trimmed(draft.unit),
    reason: trimmed(draft.reason),
    subtype: trimmed(draft.subtype),
    time: draft.startedAt || toLocalDatetimeInputValue(now),
  };
  if (draft.followUp) {
    payload.followUpAt = nextCheckInTime(now);
    payload.followUpStatus = 'pending';
  }
  return payload;
}

/** One-line summary used in the review card and the "saved" confirmation. */
export function describeDraft(draft: EntryDraft): string {
  const bits: string[] = [draft.name];
  if (draft.bodyArea) bits.push(`on ${draft.bodyArea.toLowerCase()}`);
  if (typeof draft.severity === 'number') bits.push(`severity ${toFiveScale(draft.severity)}/5`);
  return bits.join(' · ');
}

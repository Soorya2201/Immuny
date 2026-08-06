import { describe, it, expect } from 'vitest';
import { cleanCandidate, validatePhrasing } from '../utils/beaVoice';
import { SLOTS, type EntryDraft } from '../utils/voiceInterview';

const SEVERITY_KEEP = [/\b1\s*(?:to|-|–)\s*5\b|one to five/i];

describe('validatePhrasing', () => {
  it('accepts a natural one-sentence rewrite', () => {
    expect(validatePhrasing('How bad is the rash right now, from 1 to 5?', SEVERITY_KEEP)).toBe(true);
    expect(validatePhrasing('Where on your body is it?', [/where/i])).toBe(true);
  });

  it('rejects a rewrite that drops the scale', () => {
    expect(validatePhrasing('How bad is the rash right now?', SEVERITY_KEEP)).toBe(false);
  });

  it('rejects more than one sentence or question', () => {
    expect(validatePhrasing('How bad is it from 1 to 5? Take your time?', SEVERITY_KEEP)).toBe(false);
    expect(validatePhrasing('I hope it eases soon. How bad is it from 1 to 5?', SEVERITY_KEEP)).toBe(false);
  });

  it('rejects statements — the line has to stay a question', () => {
    expect(validatePhrasing('Please rate the rash from 1 to 5.', SEVERITY_KEEP)).toBe(false);
  });

  it('rejects preambles and filler openers', () => {
    expect(validatePhrasing('Sure, how bad is it from 1 to 5?', SEVERITY_KEEP)).toBe(false);
    expect(validatePhrasing('Got it, where is the rash?', [/where/i])).toBe(false);
  });

  it('rejects anything that strays into advice or interpretation', () => {
    expect(validatePhrasing('That could be an allergic reaction, where is it?', [/where/i])).toBe(false);
    expect(validatePhrasing('You should see a doctor, how bad is it from 1 to 5?', SEVERITY_KEEP)).toBe(false);
  });

  it('rejects rewrites that are too long to speak', () => {
    const rambling = 'Could you possibly let me know, whenever you get a spare moment today, how bad the rash feels from 1 to 5?';
    expect(validatePhrasing(rambling, SEVERITY_KEEP)).toBe(false);
  });

  it('rejects empty or truncated output', () => {
    expect(validatePhrasing('', [])).toBe(false);
    expect(validatePhrasing('How?', [])).toBe(false);
  });

  it('keeps every required option for the emergency-care question', () => {
    const keep = [/urgent care/i, /emergency/i, /ambulance/i];
    expect(validatePhrasing('Did you need urgent care, the emergency room, or an ambulance?', keep)).toBe(true);
    expect(validatePhrasing('Did you need to see anyone about it?', keep)).toBe(false);
  });
});

describe('the built-in questions satisfy their own rules', () => {
  // If a hand-written question failed validation, Nova could never improve on
  // it and the length caps would be silently wrong.
  const draft: EntryDraft = { type: 'Symptom', name: 'Rash', bodyArea: 'Left arm', severity: 8 };

  for (const [type, slots] of Object.entries(SLOTS)) {
    for (const slot of slots) {
      it(`${type}/${slot.key}`, () => {
        const question = slot.ask({ ...draft, type: type as EntryDraft['type'] });
        expect(validatePhrasing(question, slot.keep)).toBe(true);
      });
    }
  }
});

describe('cleanCandidate', () => {
  it('strips quotes, labels and code fences the model adds', () => {
    expect(cleanCandidate('"Where is the rash?"')).toBe('Where is the rash?');
    expect(cleanCandidate('Question: Where is the rash?')).toBe('Where is the rash?');
    expect(cleanCandidate('```\nWhere is the rash?\n```')).toBe('Where is the rash?');
  });

  it('takes only the first line when the model rambles', () => {
    expect(cleanCandidate('Where is the rash?\nLet me know!')).toBe('Where is the rash?');
  });

  it('returns an empty string for empty output', () => {
    expect(cleanCandidate('')).toBe('');
  });
});

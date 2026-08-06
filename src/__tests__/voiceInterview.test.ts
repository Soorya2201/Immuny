import { describe, it, expect } from 'vitest';
import {
  applyAnswer,
  classifyOpening,
  cleanBodyArea,
  cleanSymptomName,
  describeDraft,
  draftToPayload,
  isCancel,
  isSkip,
  localExtract,
  needsBodyArea,
  nextSlot,
  openingSeverity,
  parseDose,
  parseOnset,
  parseSeverity,
  parseYesNo,
  stashUnparsed,
  toFiveScale,
  type EntryDraft,
} from '../utils/voiceInterview';

// Wednesday 15 May 2024, 15:00 local.
const NOW = new Date(2024, 4, 15, 15, 0, 0);

describe('parseSeverity', () => {
  it('maps the spoken 1-5 scale onto the stored 1-10 scale', () => {
    expect(parseSeverity('3')).toBe(6);
    expect(parseSeverity('a three')).toBe(6);
    expect(parseSeverity('three')).toBe(6);
    expect(parseSeverity('about a 5')).toBe(10);
    expect(parseSeverity('1')).toBe(2);
  });

  it('honours an explicit scale', () => {
    expect(parseSeverity('4 out of 5')).toBe(8);
    expect(parseSeverity('7 out of 10')).toBe(7);
    expect(parseSeverity('three out of five')).toBe(6);
    expect(parseSeverity("I'd say 8/10")).toBe(8);
  });

  it('treats a bare number above 5 as a 1-10 answer', () => {
    expect(parseSeverity('7')).toBe(7);
    expect(parseSeverity('10')).toBe(10);
  });

  it('understands severity words', () => {
    expect(parseSeverity('pretty mild')).toBe(4);
    expect(parseSeverity('moderate')).toBe(6);
    expect(parseSeverity("it's unbearable")).toBe(10);
  });

  it('returns null when there is nothing to grade', () => {
    expect(parseSeverity('my arm')).toBeNull();
    expect(parseSeverity('')).toBeNull();
    expect(parseSeverity('12')).toBeNull();
  });

  it('round-trips through the display scale', () => {
    expect(toFiveScale(6)).toBe(3);
    expect(toFiveScale(10)).toBe(5);
    expect(toFiveScale(1)).toBe(1);
  });
});

describe('parseOnset', () => {
  it('handles "just now"', () => {
    expect(parseOnset('just now', NOW)).toBe('2024-05-15T15:00');
    expect(parseOnset('it just started', NOW)).toBe('2024-05-15T15:00');
  });

  it('handles relative offsets', () => {
    expect(parseOnset('two hours ago', NOW)).toBe('2024-05-15T13:00');
    expect(parseOnset('about 30 minutes ago', NOW)).toBe('2024-05-15T14:30');
    expect(parseOnset('half an hour ago', NOW)).toBe('2024-05-15T14:30');
    expect(parseOnset('3 days ago', NOW)).toBe('2024-05-12T15:00');
    expect(parseOnset('a week ago', NOW)).toBe('2024-05-08T15:00');
  });

  it('handles named parts of the day', () => {
    expect(parseOnset('this morning', NOW)).toBe('2024-05-15T08:00');
    expect(parseOnset('last night', NOW)).toBe('2024-05-14T21:00');
    expect(parseOnset('yesterday afternoon', NOW)).toBe('2024-05-14T14:00');
    expect(parseOnset('I woke up with it', NOW)).toBe('2024-05-15T08:00');
  });

  it('handles weekdays as the most recent past one', () => {
    // Wednesday → "monday" is two days back.
    expect(parseOnset('since monday', NOW)).toBe('2024-05-13T09:00');
    // Same weekday means last week, not today.
    expect(parseOnset('on wednesday', NOW)).toBe('2024-05-08T09:00');
  });

  it('handles clock times, shifting future ones to yesterday', () => {
    expect(parseOnset('at 9am', NOW)).toBe('2024-05-15T09:00');
    expect(parseOnset('around 10:30', NOW)).toBe('2024-05-15T10:30');
    expect(parseOnset('at 8pm', NOW)).toBe('2024-05-14T20:00');
  });

  it('never returns a future time for same-day phrases', () => {
    const earlyMorning = new Date(2024, 4, 15, 6, 0, 0);
    expect(parseOnset('this morning', earlyMorning)).toBe('2024-05-15T06:00');
  });

  it('returns null for unparseable timing', () => {
    expect(parseOnset('umm I really cannot remember', NOW)).toBeNull();
    expect(parseOnset('', NOW)).toBeNull();
  });
});

describe('yes/no, skip and cancel', () => {
  it('reads affirmatives and negatives', () => {
    expect(parseYesNo('yes please')).toBe(true);
    expect(parseYesNo('yeah that would be good')).toBe(true);
    expect(parseYesNo('no thanks')).toBe(false);
    expect(parseYesNo("no, that's ok")).toBe(false);
    expect(parseYesNo('maybe')).toBeNull();
  });

  it('detects skips and cancels', () => {
    expect(isSkip('nothing else')).toBe(true);
    expect(isSkip('no')).toBe(true);
    expect(isSkip('it started after lunch')).toBe(false);
    expect(isCancel('never mind')).toBe(true);
    expect(isCancel('cancel that')).toBe(true);
    expect(isCancel('my hives are bad')).toBe(false);
  });
});

describe('text cleanup', () => {
  it('normalises symptom names to known options', () => {
    expect(cleanSymptomName("I've got a really itchy rash")).toBe('Rash');
    expect(cleanSymptomName('hives')).toBe('Hives');
    expect(cleanSymptomName('my lips are tingling')).toBe('Lips are tingling');
  });

  it('cleans body areas', () => {
    expect(cleanBodyArea("it's on my left arm")).toBe('Left arm');
    expect(cleanBodyArea('the face')).toBe('Face');
    expect(cleanBodyArea('all over my body')).toBe('All over');
  });

  it('parses doses', () => {
    expect(parseDose('25 milligrams')).toEqual({ dose: '25', unit: 'mg' });
    expect(parseDose('50mg')).toEqual({ dose: '50', unit: 'mg' });
    expect(parseDose('two tablets')).toEqual({});
  });
});

describe('opening fallback (used when the model call fails)', () => {
  it('classifies what is being logged', () => {
    expect(classifyOpening('I have a rash on my arm')).toBe('Symptom');
    expect(classifyOpening('I just ate a peanut butter sandwich')).toBe('Exposure');
    expect(classifyOpening('I took 25mg of Benadryl')).toBe('Medication');
  });

  it('pulls a usable name out of the sentence', () => {
    expect(localExtract('I have really itchy hives').name).toBe('Hives');
    expect(localExtract('I took some Benadryl for my rash').name).toBe('Benadryl');
    expect(localExtract('I ate a peanut butter sandwich').name).toBe('Peanut butter sandwich');
  });

  it('only reads a severity off the opening line when it is clearly a rating', () => {
    expect(openingSeverity('my rash is a 4 out of 5')).toBe(8);
    expect(openingSeverity('severity 6')).toBe(6);
    expect(openingSeverity('I ate 2 cookies')).toBeNull();
    expect(openingSeverity('I took 25 mg of Benadryl')).toBeNull();
  });
});

describe('slot selection', () => {
  const base: EntryDraft = { type: 'Symptom', name: 'Rash' };

  it('asks where, how bad, when, notes, then the check-in', () => {
    expect(nextSlot(base)?.key).toBe('bodyArea');
    expect(nextSlot({ ...base, bodyArea: 'Arm' })?.key).toBe('severity');
    expect(nextSlot({ ...base, bodyArea: 'Arm', severity: 6 })?.key).toBe('onset');
    expect(nextSlot({ ...base, bodyArea: 'Arm', severity: 6, startedAt: 'x' })?.key).toBe('notes');
    expect(nextSlot({ ...base, bodyArea: 'Arm', severity: 6, startedAt: 'x', notes: '' })?.key).toBe('followUp');
    expect(nextSlot({ ...base, bodyArea: 'Arm', severity: 6, startedAt: 'x', notes: '', followUp: false })).toBeNull();
  });

  it('skips "where" for whole-body symptoms', () => {
    expect(needsBodyArea('Rash')).toBe(true);
    expect(needsBodyArea('Nausea')).toBe(false);
    expect(needsBodyArea('Headache')).toBe(false);
    expect(nextSlot({ type: 'Symptom', name: 'Nausea' })?.key).toBe('severity');
  });

  it('does not re-ask a slot that was already asked', () => {
    expect(nextSlot(base, ['bodyArea'])?.key).toBe('severity');
  });

  it('phrases questions around the symptom being logged', () => {
    expect(nextSlot(base)?.ask(base)).toBe('Where on your body is the rash?');
    const withArea = { ...base, bodyArea: 'Left arm' };
    expect(nextSlot(withArea)?.ask(withArea)).toBe('On a scale of 1 to 5, how bad is the rash right now?');
  });
});

describe('applyAnswer', () => {
  const base: EntryDraft = { type: 'Symptom', name: 'Rash' };

  it('fills a slot from a spoken answer', () => {
    const r = applyAnswer(base, 'severity', 'I would say a three', NOW);
    expect(r.status).toBe('ok');
    expect(r.draft.severity).toBe(6);
  });

  it('asks again when the answer does not parse', () => {
    const r = applyAnswer(base, 'severity', 'pretty sure it was the peanuts', NOW);
    expect(r.status).toBe('retry');
    expect(r.reprompt).toMatch(/1 to 5/);
  });

  it('accepts a skip on optional slots only', () => {
    expect(applyAnswer(base, 'notes', 'nothing else', NOW).draft.notes).toBe('');
    const severity = applyAnswer(base, 'severity', 'nothing else', NOW);
    expect(severity.status).toBe('retry');
  });

  it('cancels on "never mind"', () => {
    expect(applyAnswer(base, 'onset', 'never mind', NOW).status).toBe('cancel');
  });

  it('keeps unparsed answers in the notes rather than dropping them', () => {
    const stashed = stashUnparsed(base, 'onset', 'sometime around when the pollen got bad');
    expect(stashed.notes).toContain('pollen got bad');
    expect(stashed.startedAt).toBeTruthy();
  });
});

describe('draftToPayload', () => {
  const draft: EntryDraft = {
    type: 'Symptom',
    name: 'Rash',
    bodyArea: 'Left arm',
    severity: 6,
    startedAt: '2024-05-15T08:00',
    notes: 'after eating peanuts',
    followUp: true,
  };

  it('stores the onset time as the entry time, not the time of logging', () => {
    expect(draftToPayload(draft, NOW).time).toBe('2024-05-15T08:00');
  });

  it('schedules a check-in for the next day when asked', () => {
    const p = draftToPayload(draft, NOW);
    expect(p.followUpStatus).toBe('pending');
    expect(new Date(p.followUpAt!).getDate()).toBe(16);
  });

  it('omits check-in fields when declined', () => {
    const p = draftToPayload({ ...draft, followUp: false }, NOW);
    expect(p.followUpAt).toBeUndefined();
    expect(p.followUpStatus).toBeUndefined();
  });

  it('drops empty optional fields', () => {
    const p = draftToPayload({ type: 'Symptom', name: 'Hives', notes: '' }, NOW);
    expect(p.notes).toBeUndefined();
    expect(p.severity).toBeUndefined();
  });

  it('falls back to now when no onset was captured', () => {
    expect(draftToPayload({ type: 'Symptom', name: 'Hives' }, NOW).time).toBe('2024-05-15T15:00');
  });

  it('summarises a draft for the review card', () => {
    expect(describeDraft(draft)).toBe('Rash · on left arm · severity 3/5');
  });
});

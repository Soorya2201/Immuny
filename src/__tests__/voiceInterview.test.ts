import { describe, it, expect } from 'vitest';
import {
  applyAnswer,
  classifyOpening,
  cleanBodyArea,
  cleanSymptomName,
  describeDraft,
  draftToPayload,
  isCancel,
  isSignificantEpisode,
  isSkip,
  localExtract,
  needsBodyArea,
  nextSlot,
  openingSeverity,
  parseCofactors,
  parseDose,
  parseEmergencyCare,
  parseOnset,
  parseSeverity,
  parseTreatment,
  parseYesNo,
  personRefFor,
  SELF,
  SLOTS,
  stashUnparsed,
  toFiveScale,
  type EntryDraft,
  type SlotKey,
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

  it('asks where, how bad, when, treatment, cofactors, notes, then the check-in', () => {
    const filled = { ...base, bodyArea: 'Arm', severity: 6, startedAt: '2024-05-15T14:30' };
    expect(nextSlot(base, [], NOW)?.key).toBe('bodyArea');
    expect(nextSlot({ ...base, bodyArea: 'Arm' }, [], NOW)?.key).toBe('severity');
    expect(nextSlot({ ...base, bodyArea: 'Arm', severity: 6 }, [], NOW)?.key).toBe('onset');
    expect(nextSlot(filled, [], NOW)?.key).toBe('treatment');
    expect(nextSlot({ ...filled, treatment: '' }, [], NOW)?.key).toBe('cofactors');
    expect(nextSlot({ ...filled, treatment: '', cofactors: [] }, [], NOW)?.key).toBe('notes');
    expect(nextSlot({ ...filled, treatment: '', cofactors: [], notes: '' }, [], NOW)?.key).toBe('followUp');
    expect(nextSlot({ ...filled, treatment: '', cofactors: [], notes: '', followUp: false }, [], NOW)).toBeNull();
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

describe('person-aware questions', () => {
  const maya = personRefFor({ name: 'Maya Patel', pronouns: 'she/her' });
  const symptom = (key: SlotKey) => SLOTS.Symptom.find(s => s.key === key)!;
  const draft: EntryDraft = { type: 'Symptom', name: 'Rash' };

  it('defaults to the second person when no person is given', () => {
    expect(symptom('bodyArea').ask(draft)).toBe('Where on your body is the rash?');
    expect(symptom('treatment').ask(draft)).toBe('Did you take anything for the rash?');
    expect(symptom('epinephrine').ask(draft)).toBe('Did you have your epinephrine with you?');
  });

  it('names the person and uses their pronouns when logging for someone else', () => {
    expect(symptom('name').ask(draft, maya)).toBe('What are you noticing about Maya right now?');
    expect(symptom('bodyArea').ask(draft, maya)).toBe("Where on Maya's body is the rash?");
    expect(symptom('treatment').ask(draft, maya)).toBe('Did Maya take anything for the rash?');
    expect(symptom('epinephrine').ask(draft, maya)).toBe('Did Maya have her epinephrine to hand?');
    expect(symptom('emergencyCare').ask(draft, maya))
      .toBe('Did Maya need urgent care, the emergency room, or an ambulance for this?');
  });

  it('keeps subject-verb agreement across entry types', () => {
    const exposure: EntryDraft = { type: 'Exposure', name: 'Peanut butter' };
    const name = SLOTS.Exposure.find(s => s.key === 'name')!;
    expect(name.ask(exposure)).toBe('What were you exposed to?');
    expect(name.ask(exposure, maya)).toBe('What was Maya exposed to?');

    const med: EntryDraft = { type: 'Medication', name: 'Benadryl' };
    const dose = SLOTS.Medication.find(s => s.key === 'dose')!;
    expect(dose.ask(med, maya)).toBe('How much benadryl did Maya take?');
  });

  it('falls back to they/them when pronouns were never given', () => {
    const unknown = personRefFor({ name: 'Alex' });
    expect(symptom('epinephrine').ask(draft, unknown)).toBe('Did Alex have their epinephrine to hand?');
  });

  it('treats the account owner as the second person', () => {
    const self = personRefFor({ name: 'Soorya', isOwner: true });
    expect(self).toBe(SELF);
    expect(symptom('bodyArea').ask(draft, self)).toBe('Where on your body is the rash?');
  });

  it('names the person in re-prompts too', () => {
    const retry = applyAnswer(draft, 'epinephrine', 'mmm', new Date(), maya);
    expect(retry.status).toBe('retry');
    expect(retry.reprompt).toBe('Just yes or no — did Maya have her epinephrine?');
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

describe('clinical follow-up questions', () => {
  const mild: EntryDraft = { type: 'Symptom', name: 'Rash', bodyArea: 'Arm', severity: 4, startedAt: '2024-05-15T14:00' };
  const severe: EntryDraft = { ...mild, severity: 8 };
  const airway: EntryDraft = { type: 'Symptom', name: 'Throat tightness', severity: 4, startedAt: '2024-05-15T14:00' };

  it('asks about epinephrine and emergency care only for significant episodes', () => {
    expect(isSignificantEpisode(mild)).toBe(false);
    expect(isSignificantEpisode(severe)).toBe(true);
    expect(isSignificantEpisode(airway)).toBe(true);   // red-flag symptom, despite a mild rating

    const mildKeys: SlotKey[] = [];
    for (let i = 0; i < 8; i++) {
      const s = nextSlot(mild, mildKeys, NOW);
      if (!s) break;
      mildKeys.push(s.key);
    }
    expect(mildKeys).not.toContain('epinephrine');
    expect(mildKeys).not.toContain('emergencyCare');
    expect(mildKeys).toContain('treatment');
    expect(mildKeys).toContain('cofactors');

    expect(nextSlot(severe, ['treatment'], NOW)?.key).toBe('epinephrine');
    expect(nextSlot(severe, ['treatment', 'epinephrine'], NOW)?.key).toBe('emergencyCare');
  });

  it('only asks whether it has settled once enough time has passed', () => {
    const justNow: EntryDraft = { ...mild, startedAt: '2024-05-15T14:30' };   // 30 min before NOW
    expect(nextSlot(justNow, [], NOW)?.key).not.toBe('resolved');
    const thisMorning: EntryDraft = { ...mild, startedAt: '2024-05-15T08:00' };
    expect(nextSlot(thisMorning, [], NOW)?.key).toBe('resolved');
  });

  it('records an exact resolution time when given, and an upper bound otherwise', () => {
    const old: EntryDraft = { ...mild, startedAt: '2024-05-15T08:00' };
    const exact = applyAnswer(old, 'resolved', 'yes it stopped about two hours ago', NOW);
    expect(exact.draft.resolvedAt).toBe('2024-05-15T13:00');
    expect(exact.draft.resolvedPrecision).toBe('exact');

    const vague = applyAnswer(old, 'resolved', "yeah it's gone now", NOW);
    expect(vague.draft.resolvedAt).toBe('2024-05-15T15:00');
    expect(vague.draft.resolvedPrecision).toBe('confirmed-by');

    const ongoing = applyAnswer(old, 'resolved', 'no still going', NOW);
    expect(ongoing.draft.resolvedAt).toBeUndefined();
    expect(ongoing.status).toBe('ok');
  });

  it('skips the check-in offer once the episode is already over', () => {
    const resolved: EntryDraft = { ...mild, resolvedAt: '2024-05-15T12:00', treatment: '', cofactors: [], notes: '' };
    expect(nextSlot(resolved, ['resolved'], NOW)).toBeNull();
  });

  it('parses what was taken for it', () => {
    expect(applyAnswer(mild, 'treatment', 'I took some Benadryl', NOW).draft.treatment).toBe('Benadryl');
    expect(applyAnswer(mild, 'treatment', 'nothing', NOW).draft.treatment).toBe('');
    expect(parseTreatment('cetirizine')).toBe('Cetirizine');
  });

  it('parses epinephrine availability and emergency care', () => {
    expect(applyAnswer(severe, 'epinephrine', 'yes it was in my bag', NOW).draft.epinephrineAvailable).toBe('yes');
    expect(applyAnswer(severe, 'epinephrine', 'no I left it at home', NOW).draft.epinephrineAvailable).toBe('no');

    expect(parseEmergencyCare('we called an ambulance')).toBe('ambulance');
    expect(parseEmergencyCare('I went to the ER')).toBe('emergency-room');
    expect(parseEmergencyCare('just urgent care')).toBe('urgent-care');
    expect(parseEmergencyCare('no')).toBe('none');
    // A bare "yes" is ambiguous and must be re-asked, never guessed.
    expect(parseEmergencyCare('yes')).toBeNull();
    expect(applyAnswer(severe, 'emergencyCare', 'yes', NOW).status).toBe('retry');
  });

  it('parses cofactors from speech and from chips', () => {
    expect(parseCofactors('I had just been running and I had a cold')).toEqual(['Exercise', 'Illness']);
    expect(parseCofactors('I took some ibuprofen earlier')).toEqual(['NSAIDs']);
    expect(parseCofactors('Exercise')).toEqual(['Exercise']);
    expect(applyAnswer(mild, 'cofactors', 'none of these', NOW).draft.cofactors).toEqual([]);
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

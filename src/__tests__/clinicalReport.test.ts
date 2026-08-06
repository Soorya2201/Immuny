import { describe, it, expect } from 'vitest';
import {
  ageFromDob,
  allergensFor,
  buildReactionPairs,
  buildReport,
  findPatterns,
  formatDuration,
  isSignificant,
  scorePattern,
  type ReportEntry,
  type ReportInput,
} from '../utils/clinicalReport';

const PERIOD_START = new Date(2026, 4, 1);
const PERIOD_END = new Date(2026, 6, 31, 23, 59);
const GENERATED = new Date(2026, 7, 4, 10, 0);

let seq = 0;
function entry(over: Partial<ReportEntry> & { type: string; name: string; time: string }): ReportEntry {
  return { id: `e${++seq}`, ...over };
}

function baseInput(entries: ReportEntry[], over: Partial<ReportInput> = {}): ReportInput {
  return {
    patient: { name: 'Ada Patient', dateOfBirth: '1998-04-18', knownAllergies: 'Milk', medicalConditions: 'Eczema' },
    entries,
    medications: [],
    medicationLogs: [],
    exposureTests: [],
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    generatedAt: GENERATED,
    ...over,
  };
}

/** Three cashew reactions plus tolerated peanut/milk exposures. */
function realisticEntries(): ReportEntry[] {
  const mk = (day: number, hour: number, min = 0) => new Date(2026, 4, day, hour, min).toISOString();
  return [
    entry({ type: 'Exposure', name: 'Pistachio gelato', time: mk(14, 15), tags: '["Tree nuts"]', quantity: '0.5', quantityUnit: 'cups', containsSummary: 'This food contains: Tree nuts.' }),
    entry({ type: 'Symptom', name: 'Hives', time: mk(14, 15, 18), severity: 6, bodyArea: 'Face', resolvedAt: mk(14, 16, 33), resolvedPrecision: 'exact', cofactors: '["Exercise"]' }),
    entry({ type: 'Exposure', name: 'Restaurant pesto pasta', time: mk(20, 19), quantity: '1', quantityUnit: 'serving' }),
    entry({ type: 'Symptom', name: 'Hives', time: mk(20, 19, 38), severity: 8, resolvedAt: mk(20, 21, 38), resolvedPrecision: 'confirmed-by', epinephrineAvailable: 'no', emergencyCare: 'none', cofactors: '[]' }),
    entry({ type: 'Exposure', name: 'Vegan cheese spread', time: mk(28, 12), tags: '["Tree nuts"]', quantity: '2', quantityUnit: 'tbsp' }),
    entry({ type: 'Symptom', name: 'Itching', time: mk(28, 12, 12), severity: 4 }),
    // Tolerated
    entry({ type: 'Exposure', name: 'Peanut butter toast', time: mk(5, 8), tags: '["Peanut"]' }),
    entry({ type: 'Exposure', name: 'Glass of milk', time: mk(6, 8), tags: '["Milk"]' }),
    entry({ type: 'Exposure', name: 'Peanut snack bar', time: mk(9, 15), tags: '["Peanut"]' }),
  ];
}

describe('helpers', () => {
  it('formats durations the way a clinician reads them', () => {
    expect(formatDuration(75 * 60_000)).toBe('75 min');
    expect(formatDuration(2 * 3_600_000)).toBe('2 hr');
    expect(formatDuration(30 * 3_600_000)).toBe('1 d');
  });

  it('computes age from a date of birth', () => {
    expect(ageFromDob('1998-04-18', GENERATED)).toBe(28);
    expect(ageFromDob('not-a-date', GENERATED)).toBeNull();
  });

  it('reads allergens from tags and label text', () => {
    const e = entry({ type: 'Exposure', name: 'Snack', time: PERIOD_START.toISOString(), tags: '["Tree nuts"]', containsSummary: 'This food contains: Milk.' });
    expect(allergensFor(e)).toEqual(expect.arrayContaining(['Tree nuts', 'Milk']));
  });

  it('flags severe and airway episodes as significant', () => {
    expect(isSignificant(entry({ type: 'Symptom', name: 'Hives', time: '2026-05-01', severity: 8 }))).toBe(true);
    expect(isSignificant(entry({ type: 'Symptom', name: 'Throat tightness', time: '2026-05-01', severity: 4 }))).toBe(true);
    expect(isSignificant(entry({ type: 'Symptom', name: 'Hives', time: '2026-05-01', severity: 4 }))).toBe(false);
    expect(isSignificant(entry({ type: 'Exposure', name: 'Milk', time: '2026-05-01', severity: 10 }))).toBe(false);
  });
});

describe('exposure to symptom pairing', () => {
  it('links a symptom to the most recent exposure inside the window', () => {
    const pairs = buildReactionPairs(realisticEntries());
    expect(pairs).toHaveLength(3);
    expect(pairs[0].exposure.name).toBe('Pistachio gelato');
    expect(pairs[0].onsetMinutes).toBe(18);
  });

  it('leaves a symptom unattributed when nothing was eaten before it', () => {
    const lonely = [
      entry({ type: 'Symptom', name: 'Hives', time: new Date(2026, 4, 3, 9).toISOString(), severity: 4 }),
      entry({ type: 'Exposure', name: 'Dinner', time: new Date(2026, 4, 3, 19).toISOString() }),
    ];
    expect(buildReactionPairs(lonely)).toHaveLength(0);
  });

  it('does not pair across more than four hours', () => {
    const far = [
      entry({ type: 'Exposure', name: 'Breakfast', time: new Date(2026, 4, 3, 8).toISOString() }),
      entry({ type: 'Symptom', name: 'Hives', time: new Date(2026, 4, 3, 17).toISOString(), severity: 4 }),
    ];
    expect(buildReactionPairs(far)).toHaveLength(0);
  });
});

describe('pattern detection', () => {
  it('finds the repeated allergen and counts tolerated exposures', () => {
    const entries = realisticEntries();
    const patterns = findPatterns(entries, buildReactionPairs(entries));
    expect(patterns[0].allergen).toBe('Tree nuts');
    expect(patterns[0].pairs).toHaveLength(2);
    expect(patterns[0].toleratedCount).toBe(0);
  });

  it('needs at least two reactions before calling something a pattern', () => {
    const entries = [
      entry({ type: 'Exposure', name: 'Cashew bar', time: new Date(2026, 4, 3, 12).toISOString(), tags: '["Tree nuts"]' }),
      entry({ type: 'Symptom', name: 'Hives', time: new Date(2026, 4, 3, 12, 20).toISOString(), severity: 6 }),
    ];
    expect(findPatterns(entries, buildReactionPairs(entries))).toHaveLength(0);
  });

  it('calls two reactions Limited, however clean the records are', () => {
    const entries = realisticEntries();
    const pattern = findPatterns(entries, buildReactionPairs(entries))[0];
    const scored = scorePattern(pattern);
    expect(scored.strength).toBe('Limited');
    expect(scored.note).toMatch(/Too few repeats/);
  });

  it('names the limits when labels are incomplete or exposures were tolerated', () => {
    const scored = scorePattern({
      allergen: 'Tree nuts',
      toleratedCount: 2,
      pairs: [
        { exposure: entry({ type: 'Exposure', name: 'A', time: '2026-05-01T12:00:00Z' }), symptoms: [], onsetMinutes: 15, allergens: ['Tree nuts'] },
        { exposure: entry({ type: 'Exposure', name: 'B', time: '2026-05-02T12:00:00Z', tags: '["Tree nuts"]' }), symptoms: [], onsetMinutes: 20, allergens: ['Tree nuts'] },
        { exposure: entry({ type: 'Exposure', name: 'C', time: '2026-05-03T12:00:00Z', tags: '["Tree nuts"]' }), symptoms: [], onsetMinutes: 25, allergens: ['Tree nuts'] },
      ],
    });
    expect(scored.strength).toBe('Moderate');
    expect(scored.note).toMatch(/incomplete ingredient details/);
    expect(scored.note).toMatch(/tolerated/);
    expect(scored.note).toMatch(/limit certainty/);
  });
});

describe('buildReport', () => {
  const model = buildReport(baseInput(realisticEntries()));

  it('fills the header from the patient record', () => {
    expect(model.patientName).toBe('Ada Patient');
    expect(model.dobLabel).toContain('4/18/1998');
    expect(model.dobLabel).toContain('Age 28');
    expect(model.preparedLabel).toBe('Prepared Aug 4, 2026');
  });

  it('counts what was logged', () => {
    expect(model.kpis[0]).toEqual({ value: '6', label: 'food entries' });
    expect(model.kpis[1]).toEqual({ value: '3', label: 'symptom episodes' });
  });

  it('reports emergency visits as unrecorded rather than zero when nobody was asked', () => {
    const noneAsked = buildReport(baseInput(realisticEntries().map(e => ({ ...e, emergencyCare: null }))));
    expect(noneAsked.kpis[3].value).toBe('—');
    expect(noneAsked.kpis[3].label).toMatch(/not recorded/);
    // One episode answered "none" makes the count real.
    expect(model.kpis[3].value).toBe('0');
    expect(model.kpis[3].label).toMatch(/emergency visits/);
  });

  it('describes the pattern as an association, not a diagnosis', () => {
    expect(model.pattern.title).toMatch(/^Possible /);
    expect(model.pattern.summary).toMatch(/contained, or may have contained/);
    expect(model.pattern.bullets.join(' ')).toMatch(/minutes after exposure/);
  });

  it('separates a resolution that was timed from one confirmed by a check-in', () => {
    const rows = model.timeline;
    expect(rows[0].response).toMatch(/resolved in 75 min/);
    expect(rows[1].response).toMatch(/resolved within 2 hr/);
  });

  it('says resolution is not recorded when it is missing', () => {
    expect(model.timeline[2].response).toMatch(/resolution not recorded/);
  });

  it('lists tolerated exposures as negative evidence', () => {
    expect(model.tolerated).toEqual(expect.arrayContaining([{ count: '2x', label: 'Peanut' }]));
    expect(model.toleratedNote).toMatch(/not establish that a food is safe/);
  });

  it('flags incomplete epinephrine records in the safety panel', () => {
    const titles = model.safety.map(s => s.title).join(' | ');
    expect(titles).toMatch(/Emergency medication availability incomplete|Epinephrine/);
  });

  it('scores completeness against the right denominators', () => {
    const byLabel = Object.fromEntries(model.completeness.map(c => [c.label, c.pct]));
    expect(byLabel['Symptom resolution']).toBe(67);          // 2 of 3 symptoms
    expect(byLabel['Exact amount']).toBe(50);                // 3 of 6 exposures
    expect(byLabel['Context and cofactors']).toBe(67);       // 2 of 3 symptoms
  });

  it('returns null completeness rather than 0% when nothing applies', () => {
    const noSevere = buildReport(baseInput(realisticEntries().map(e => ({ ...e, severity: 4, epinephrineAvailable: null }))));
    const epi = noSevere.completeness.find(c => c.label === 'Emergency medication available');
    expect(epi?.pct).toBeNull();
  });

  it('always asks questions a clinician can act on', () => {
    expect(model.questions.length).toBeGreaterThan(2);
    expect(model.questions[0]).toMatch(/tree nuts/i);
  });

  it('reports epinephrine even when it was never logged', () => {
    const epi = model.medications.find(m => m.name === 'Epinephrine');
    expect(epi?.use).toBe('none logged');
    // The fixture's severe episode answered "no", so the row must say it was
    // not on hand — never that it was available.
    expect(epi?.observed).toMatch(/NOT on hand in 1 of 1 severe episode/);
  });

  it('distinguishes epinephrine that was never asked about from epinephrine that was absent', () => {
    const unasked = buildReport(baseInput(realisticEntries().map(e => ({ ...e, epinephrineAvailable: null }))));
    expect(unasked.medications.find(m => m.name === 'Epinephrine')?.observed)
      .toMatch(/not recorded in 1 of 1 severe episode/);

    const present = buildReport(baseInput(realisticEntries().map(e => (
      e.type === 'Symptom' && (e.severity ?? 0) >= 8 ? { ...e, epinephrineAvailable: 'yes' } : e
    ))));
    expect(present.medications.find(m => m.name === 'Epinephrine')?.observed)
      .toMatch(/available in every severe episode/);
  });
});

describe('buildReport with no usable data', () => {
  const empty = buildReport(baseInput([]));

  it('does not invent a pattern', () => {
    expect(empty.pattern.title).toBe('No repeated pattern identified');
    expect(empty.pattern.strength).toBe('Insufficient');
    expect(empty.pattern.summary).toMatch(/No symptom episodes were logged/);
  });

  it('leaves every completeness bar unscored instead of showing zeros', () => {
    expect(empty.completeness.every(c => c.pct === null)).toBe(true);
  });

  it('still produces a usable document', () => {
    expect(empty.evidence).toHaveLength(1);
    expect(empty.evidence[0].finding).toBe('Insufficient data');
    expect(empty.timeline).toHaveLength(0);
    expect(empty.questions.length).toBeGreaterThan(0);
    expect(empty.methodNote).toMatch(/not the probability of an allergy/);
  });

  it('handles a missing date of birth', () => {
    const noDob = buildReport(baseInput([], { patient: { name: 'Sam', dateOfBirth: null } }));
    expect(noDob.dobLabel).toBe('DOB: not recorded');
  });
});

describe('buildReport respects the reporting period', () => {
  it('excludes entries outside the window', () => {
    const older = entry({ type: 'Symptom', name: 'Hives', time: new Date(2026, 0, 5, 9).toISOString(), severity: 6 });
    const model = buildReport(baseInput([...realisticEntries(), older]));
    expect(model.kpis[1].value).toBe('3');
  });
});

// ─── Clinical report analysis ─────────────────────────────────────────────────
// Turns a patient's raw Immuny entries into the content of the allergy visit
// summary. Pure and synchronous so it can be unit-tested and so the PDF renderer
// only has to draw.
//
// Two rules run through the whole file:
//   1. Never state more than the data supports. An association is described as
//      an association, a resolution confirmed by a check-in is an upper bound,
//      and anything nobody recorded prints as "not recorded" — never as 0.
//   2. Negative evidence is shown next to positive evidence. Tolerated exposures
//      and conflicting entries are what let a clinician judge consistency.
import { COMMON_ALLERGENS } from './allergens';

// ─── Input shapes (mirrors of the Amplify models, minus the client types) ─────
export interface ReportEntry {
  id: string;
  type: string;
  name: string;
  time: string;
  subtype?: string | null;
  severity?: number | null;
  bodyArea?: string | null;
  notes?: string | null;
  tags?: string | null;
  details?: string | null;
  quantity?: string | null;
  quantityUnit?: string | null;
  dose?: string | null;
  unit?: string | null;
  route?: string | null;
  reason?: string | null;
  ocrIngredients?: string | null;
  containsSummary?: string | null;
  resolvedAt?: string | null;
  resolvedPrecision?: string | null;
  relatedEntryId?: string | null;
  epinephrineAvailable?: string | null;
  emergencyCare?: string | null;
  cofactors?: string | null;
  familyMemberId?: string | null;
}

export interface ReportMedication {
  id: string;
  name: string;
  dose?: string | null;
  unit?: string | null;
  route?: string | null;
  active?: boolean | null;
}

export interface ReportMedicationLog {
  medicationId: string;
  takenAt: string;
}

export interface ReportExposureTest {
  testName: string;
  allergen: string;
  testDate: string;
  status: string;
  results?: string | null;
  reactions?: string | null;
}

export interface ReportPatient {
  name: string;
  dateOfBirth?: string | null;
  relationship?: string | null;
  knownAllergies?: string | null;
  medicalConditions?: string | null;
  medicalHistory?: string | null;
}

export interface ReportInput {
  patient: ReportPatient;
  entries: ReportEntry[];
  medications: ReportMedication[];
  medicationLogs: ReportMedicationLog[];
  exposureTests: ReportExposureTest[];
  periodStart: Date;
  periodEnd: Date;
  generatedAt: Date;
}

// ─── Output shape ─────────────────────────────────────────────────────────────
export type PatternStrength = 'Insufficient' | 'Limited' | 'Moderate' | 'Strong';

export interface ReportModel {
  patientName: string;
  dobLabel: string;
  periodLabel: string;
  preparedLabel: string;
  scopeNote: string;
  kpis: { value: string; label: string }[];
  pattern: {
    title: string;
    summary: string;
    bullets: string[];
    strength: PatternStrength;
    strengthNote: string;
  };
  safety: { title: string; body: string; tone: 'neutral' | 'alert' }[];
  clinicalContext: string;
  evidence: { finding: string; observed: string; limit: string }[];
  timeline: {
    date: string;
    exposure: string;
    amount: string;
    onset: string;
    symptoms: string;
    response: string;
  }[];
  tolerated: { count: string; label: string }[];
  toleratedNote: string;
  otherActivity: string[];
  medications: { name: string; use: string; observed: string }[];
  completeness: { label: string; pct: number | null }[];
  questions: string[];
  exposureTests: { name: string; date: string; status: string; outcome: string }[];
  methodNote: string;
  referenceNote: string;
}

// ─── Small helpers ────────────────────────────────────────────────────────────
const HOUR = 3_600_000;
/** How long after an exposure a symptom is still plausibly related to it. */
const REACTION_WINDOW_MS = 4 * HOUR;

const ts = (iso: string) => new Date(iso).getTime();

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const longDate = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

const mediumDate = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function pct(part: number, whole: number): number | null {
  if (whole <= 0) return null;      // null renders as "not applicable", never as 0%
  return Math.round((part / whole) * 100);
}

function list(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "2 hr 15 min", "45 min" — durations a clinician can scan. */
export function formatDuration(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60_000));
  if (mins < 90) return `${mins} min`;
  const hrs = mins / 60;
  return hrs < 24 ? `${Math.round(hrs * 10) / 10} hr` : `${Math.round(hrs / 24)} d`;
}

/**
 * Date-only values are parsed by hand rather than through `new Date(iso)`:
 * that treats 'YYYY-MM-DD' as UTC midnight, which renders as the previous day
 * for anyone west of Greenwich. A date of birth printed a day early on a
 * clinical document is the kind of error that discredits the whole export.
 */
function dateParts(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

export function formatDob(iso: string): string | null {
  const p = dateParts(iso);
  return p ? `${p.m}/${p.d}/${p.y}` : null;
}

export function ageFromDob(dob: string, at: Date): number | null {
  const p = dateParts(dob);
  if (!p) return null;
  let age = at.getFullYear() - p.y;
  const monthDiff = at.getMonth() + 1 - p.m;
  if (monthDiff < 0 || (monthDiff === 0 && at.getDate() < p.d)) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

const parseTags = (raw?: string | null): string[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }
};

export const parseCofactorField = parseTags;

// ─── Domain predicates ────────────────────────────────────────────────────────
const AIRWAY_RE = /breath|wheez|throat|tongue|anaphyla|faint|chest|stridor|swallow|blood pressure|collapse/i;

export function isAirwayOrCardiovascular(entry: ReportEntry): boolean {
  return AIRWAY_RE.test(entry.name) || AIRWAY_RE.test(entry.bodyArea ?? '');
}

/** The episodes an allergist would want epinephrine information about. */
export function isSignificant(entry: ReportEntry): boolean {
  if (entry.type !== 'Symptom') return false;
  return (entry.severity ?? 0) >= 8 || isAirwayOrCardiovascular(entry);
}

/**
 * Everything we know an exposure contained, from tags, OCR text and its name.
 * Matching mirrors utils/ocr.ts (case-insensitive substring) so an allergen
 * named by a label scan lines up with one the user typed as a tag.
 */
export function allergensFor(entry: ReportEntry): string[] {
  const fromTags = parseTags(entry.tags);
  const text = [entry.name, entry.containsSummary, entry.ocrIngredients, entry.details]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const detected = COMMON_ALLERGENS.filter(a => text.includes(a.toLowerCase()));
  return [...new Set([...fromTags, ...detected].map(a => a.trim()).filter(Boolean))];
}

export function hasIngredientEvidence(entry: ReportEntry): boolean {
  return Boolean(entry.ocrIngredients || entry.containsSummary || parseTags(entry.tags).length);
}

// ─── Exposure → symptom pairing ───────────────────────────────────────────────
export interface ReactionPair {
  exposure: ReportEntry;
  symptoms: ReportEntry[];
  onsetMinutes: number;
  allergens: string[];
}

/**
 * Links each symptom to the most recent exposure within the reaction window.
 * Deliberately conservative: an exposure with no symptom after it is evidence of
 * tolerance, and a symptom with no exposure before it stays unattributed rather
 * than being pinned on the nearest meal.
 */
export function buildReactionPairs(entries: ReportEntry[]): ReactionPair[] {
  const exposures = entries.filter(e => e.type === 'Exposure').sort((a, b) => ts(a.time) - ts(b.time));
  const symptoms = entries.filter(e => e.type === 'Symptom').sort((a, b) => ts(a.time) - ts(b.time));
  const byExposure = new Map<string, ReactionPair>();

  for (const symptom of symptoms) {
    let best: ReportEntry | null = null;
    for (const exposure of exposures) {
      const gap = ts(symptom.time) - ts(exposure.time);
      if (gap >= 0 && gap <= REACTION_WINDOW_MS) {
        if (!best || ts(exposure.time) > ts(best.time)) best = exposure;
      }
    }
    if (!best) continue;
    const existing = byExposure.get(best.id);
    const onset = Math.round((ts(symptom.time) - ts(best.time)) / 60_000);
    if (existing) {
      existing.symptoms.push(symptom);
      existing.onsetMinutes = Math.min(existing.onsetMinutes, onset);
    } else {
      byExposure.set(best.id, {
        exposure: best,
        symptoms: [symptom],
        onsetMinutes: onset,
        allergens: allergensFor(best),
      });
    }
  }
  return [...byExposure.values()].sort((a, b) => ts(a.exposure.time) - ts(b.exposure.time));
}

export interface AllergenPattern {
  allergen: string;
  pairs: ReactionPair[];
  toleratedCount: number;
}

/** Candidate triggers, ranked by how many separate reactions involve them. */
export function findPatterns(entries: ReportEntry[], pairs: ReactionPair[]): AllergenPattern[] {
  const exposures = entries.filter(e => e.type === 'Exposure');
  const reactedIds = new Set(pairs.map(p => p.exposure.id));
  const byAllergen = new Map<string, ReactionPair[]>();

  for (const pair of pairs) {
    for (const allergen of pair.allergens) {
      byAllergen.set(allergen, [...(byAllergen.get(allergen) ?? []), pair]);
    }
  }

  return [...byAllergen.entries()]
    .map(([allergen, ps]) => ({
      allergen,
      pairs: ps,
      toleratedCount: exposures.filter(
        e => !reactedIds.has(e.id) && allergensFor(e).includes(allergen),
      ).length,
    }))
    .filter(p => p.pairs.length >= 2)
    .sort((a, b) => b.pairs.length - a.pairs.length || a.toleratedCount - b.toleratedCount);
}

/**
 * Strength reflects repetition and record completeness only. It is explicitly
 * not a probability of allergy — the note that ships beside it says so.
 */
export function scorePattern(pattern: AllergenPattern): { strength: PatternStrength; note: string } {
  const events = pattern.pairs.length;
  const withEvidence = pattern.pairs.filter(p => hasIngredientEvidence(p.exposure)).length;
  const onsets = pattern.pairs.map(p => p.onsetMinutes);
  const consistentTiming = Math.max(...onsets) - Math.min(...onsets) <= 120;

  const limits: string[] = [];
  if (withEvidence < events) limits.push(`${events - withEvidence} of ${events} exposures have incomplete ingredient details`);
  if (pattern.toleratedCount > 0) limits.push(`${plural(pattern.toleratedCount, 'exposure')} containing it were tolerated`);
  if (!consistentTiming) limits.push('onset times vary widely');

  let strength: PatternStrength = 'Limited';
  if (events >= 3 && withEvidence === events && consistentTiming && pattern.toleratedCount === 0) strength = 'Strong';
  else if (events >= 3 && (withEvidence >= events - 1 || consistentTiming)) strength = 'Moderate';
  else if (events >= 3) strength = 'Moderate';

  const base = strength === 'Limited'
    ? 'Too few repeats to judge consistency.'
    : 'Repeated exposure, timing, and symptoms support review.';
  const note = limits.length ? `${base} ${capitalise(limits.join('; '))} limit certainty.` : base;
  return { strength, note };
}

const capitalise = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// ─── Report assembly ──────────────────────────────────────────────────────────
export function buildReport(input: ReportInput): ReportModel {
  const { patient, entries, medications, medicationLogs, exposureTests, periodStart, periodEnd, generatedAt } = input;

  const inPeriod = entries.filter(e => {
    const t = ts(e.time);
    return t >= periodStart.getTime() && t <= periodEnd.getTime();
  });

  const symptoms = inPeriod.filter(e => e.type === 'Symptom');
  const exposures = inPeriod.filter(e => e.type === 'Exposure');
  const medEntries = inPeriod.filter(e => e.type === 'Medication');
  const pairs = buildReactionPairs(inPeriod);
  const patterns = findPatterns(inPeriod, pairs);
  const top = patterns[0] ?? null;
  const significant = symptoms.filter(isSignificant);

  // ── Header ────────────────────────────────────────────────────────────────
  const dobText = patient.dateOfBirth ? formatDob(patient.dateOfBirth) : null;
  const age = patient.dateOfBirth ? ageFromDob(patient.dateOfBirth, generatedAt) : null;
  const dobLabel = dobText
    ? `DOB: ${dobText}${age != null ? `  ·  Age ${age}` : ''}`
    : 'DOB: not recorded';

  const dayCount = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / (24 * HOUR)));

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const emergencyEvents = symptoms.filter(s => s.emergencyCare && s.emergencyCare !== 'none');
  const emergencyRecorded = symptoms.filter(s => s.emergencyCare).length;
  const kpis = [
    { value: String(exposures.length), label: exposures.length === 1 ? 'food entry' : 'food entries' },
    { value: String(symptoms.length), label: symptoms.length === 1 ? 'symptom episode' : 'symptom episodes' },
    { value: String(top?.pairs.length ?? 0), label: 'repeated-pattern events' },
    {
      // Distinguishing "none happened" from "nobody was asked" matters here.
      value: emergencyRecorded > 0 ? String(emergencyEvents.length) : '—',
      label: emergencyRecorded > 0 ? 'urgent or emergency visits' : 'emergency visits not recorded',
    },
  ];

  // ── Primary pattern ───────────────────────────────────────────────────────
  const pattern = top ? buildPatternBlock(top) : emptyPatternBlock(symptoms.length, exposures.length);

  // ── Safety snapshot ───────────────────────────────────────────────────────
  const airway = symptoms.filter(isAirwayOrCardiovascular);
  const epiRecorded = significant.filter(s => s.epinephrineAvailable).length;
  const epiMissing = significant.length - epiRecorded;
  const epiUnavailable = significant.filter(s => s.epinephrineAvailable === 'no').length;

  const safety: ReportModel['safety'] = [];
  safety.push(
    airway.length === 0
      ? {
          title: 'No breathing or cardiovascular symptoms logged',
          body: 'No wheezing, throat tightness, fainting, or low blood-pressure symptoms were recorded in this period.',
          tone: 'neutral',
        }
      : {
          title: `${plural(airway.length, 'episode')} involving breathing or circulation`,
          body: `Logged: ${list([...new Set(airway.map(a => a.name.toLowerCase()))])}. These episodes warrant priority review.`,
          tone: 'alert',
        },
  );

  if (significant.length === 0) {
    safety.push({
      title: 'No severe episodes in this period',
      body: 'No entry was rated 4 or 5 out of 5, and no airway symptom was logged, so epinephrine availability was not prompted.',
      tone: 'neutral',
    });
  } else if (epiMissing > 0) {
    safety.push({
      title: 'Emergency medication availability incomplete',
      body: `Whether epinephrine was on hand was not recorded in ${epiMissing} of ${significant.length} severe episodes.`,
      tone: 'alert',
    });
  } else {
    safety.push({
      title: epiUnavailable > 0 ? 'Epinephrine was not on hand for some episodes' : 'Epinephrine was on hand',
      body: epiUnavailable > 0
        ? `Epinephrine was not available in ${epiUnavailable} of ${significant.length} severe episodes.`
        : `Epinephrine was available in all ${significant.length} severe episodes recorded.`,
      tone: epiUnavailable > 0 ? 'alert' : 'neutral',
    });
  }

  if (emergencyEvents.length > 0) {
    safety.push({
      title: `${plural(emergencyEvents.length, 'episode')} required in-person care`,
      body: list([...new Set(emergencyEvents.map(e => EMERGENCY_LABEL[e.emergencyCare ?? ''] ?? 'Urgent care'))]) + ' during this period.',
      tone: 'alert',
    });
  }

  // ── Clinical context ──────────────────────────────────────────────────────
  const knownAllergies = splitList(patient.knownAllergies);
  const conditions = splitList(patient.medicalConditions);
  const contextBits: string[] = [];
  contextBits.push(
    conditions.length
      ? `Recorded conditions: ${list(conditions)}.`
      : 'No medical conditions are recorded in the app.',
  );
  contextBits.push(
    knownAllergies.length
      ? `Allergens the patient asked Immuny to watch: ${list(knownAllergies)}.`
      : 'No known allergens are recorded in the app.',
  );
  if (patient.medicalHistory?.trim()) contextBits.push(`Family history: ${patient.medicalHistory.trim()}`);
  if (top && !knownAllergies.some(a => a.toLowerCase().includes(top.allergen.toLowerCase()))) {
    contextBits.push(`No confirmed ${top.allergen.toLowerCase()} allergy is recorded in the app.`);
  }
  contextBits.push('Current prescribed medications and any emergency action plan should be reconciled during the visit.');

  // ── Evidence table ────────────────────────────────────────────────────────
  const evidence = buildEvidence(top, pairs, symptoms);

  // ── Reaction timeline ─────────────────────────────────────────────────────
  // Every reaction in the period, not just the ones supporting the top pattern —
  // a clinician needs to see the episodes that don't fit it too.
  const timeline = pairs.slice(0, 12).map(pair => ({
    date: shortDate(pair.exposure.time),
    exposure: pair.exposure.name,
    amount: [pair.exposure.quantity, pair.exposure.quantityUnit].filter(Boolean).join(' ') || 'amount not recorded',
    onset: `${pair.onsetMinutes} min`,
    symptoms: pair.symptoms.map(describeSymptom).join('; '),
    response: describeResponse(pair.symptoms, inPeriod),
  }));

  // ── Tolerated exposures ───────────────────────────────────────────────────
  const reactedIds = new Set(pairs.map(p => p.exposure.id));
  const toleratedCounts = new Map<string, number>();
  for (const exposure of exposures) {
    if (reactedIds.has(exposure.id)) continue;
    for (const allergen of allergensFor(exposure)) {
      toleratedCounts.set(allergen, (toleratedCounts.get(allergen) ?? 0) + 1);
    }
  }
  const tolerated = [...toleratedCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({ count: `${count}x`, label }));

  // ── Other activity ────────────────────────────────────────────────────────
  const otherActivity = buildOtherActivity(symptoms, pairs, top);

  // ── Medication and response ───────────────────────────────────────────────
  const medicationRows = buildMedicationRows(medEntries, medications, medicationLogs, inPeriod, significant);

  // ── Completeness ──────────────────────────────────────────────────────────
  const completeness = [
    { label: 'Onset relative to an exposure', pct: pct(pairs.reduce((n, p) => n + p.symptoms.length, 0), symptoms.length) },
    { label: 'Symptom resolution', pct: pct(symptoms.filter(s => s.resolvedAt).length, symptoms.length) },
    { label: 'Context and cofactors', pct: pct(symptoms.filter(s => s.cofactors != null).length, symptoms.length) },
    { label: 'Exact amount', pct: pct(exposures.filter(e => e.quantity).length, exposures.length) },
    { label: 'Ingredient label or photo', pct: pct(exposures.filter(hasIngredientEvidence).length, exposures.length) },
    { label: 'Emergency medication available', pct: pct(epiRecorded, significant.length) },
  ];

  // ── Questions ─────────────────────────────────────────────────────────────
  const questions = buildQuestions(top, symptoms, significant, epiMissing, pairs);

  // ── Exposure tests ────────────────────────────────────────────────────────
  const testRows = exposureTests
    .slice()
    .sort((a, b) => ts(b.testDate) - ts(a.testDate))
    .slice(0, 6)
    .map(t => ({
      name: t.testName || t.allergen,
      date: t.testDate ? shortDate(t.testDate) : 'not recorded',
      status: capitalise(t.status ?? ''),
      outcome: t.reactions?.trim() || t.results?.trim() || 'No outcome recorded',
    }));

  return {
    patientName: patient.name || 'Patient',
    dobLabel,
    periodLabel: `${longDate(periodStart)} – ${longDate(periodEnd)}`,
    preparedLabel: `Prepared ${mediumDate(generatedAt)}`,
    scopeNote:
      `This document summarises ${plural(inPeriod.length, 'entry', 'entries')} recorded in Immuny by the patient or their caregiver ` +
      `over ${dayCount} days. Detected patterns are associations for clinician review, not confirmed allergies or medical diagnoses.`,
    kpis,
    pattern,
    safety: safety.slice(0, 3),
    clinicalContext: contextBits.join(' '),
    evidence,
    timeline,
    tolerated,
    toleratedNote:
      'Tolerated exposures appear beside suspected triggers because negative evidence helps a clinician judge consistency. ' +
      'They do not establish that a food is safe for unsupervised reintroduction.',
    otherActivity,
    medications: medicationRows,
    completeness,
    questions,
    exposureTests: testRows,
    methodNote:
      'Immuny groups repeated combinations of exposures, timing, symptoms, context, treatment, and outcomes. Pattern strength reflects ' +
      'repetition and record completeness; it is not the probability of an allergy and does not predict the severity of a future reaction. ' +
      'Severity is self-reported on a 1–5 scale at the time of logging. Clinicians should reconcile this export with the medical record ' +
      'and their independent assessment.',
    referenceNote:
      'Clinical framing references: American College of Allergy, Asthma & Immunology, Food Allergy Testing and Diagnosis; ' +
      'American Academy of Allergy, Asthma & Immunology, Food Allergy and Anaphylaxis patient resources. ' +
      `Accessed ${mediumDate(generatedAt)}.`,
  };
}

const EMERGENCY_LABEL: Record<string, string> = {
  'urgent-care': 'Urgent care',
  'emergency-room': 'Emergency room',
  'ambulance': 'Ambulance',
};

function splitList(raw?: string | null): string[] {
  return (raw ?? '').split(',').map(s => s.trim()).filter(Boolean);
}

function describeSymptom(s: ReportEntry): string {
  const where = s.bodyArea ? ` (${s.bodyArea.toLowerCase()})` : '';
  const sev = typeof s.severity === 'number' ? ` ${Math.min(5, Math.max(1, Math.round(s.severity / 2)))}/5` : '';
  return `${s.name}${where}${sev}`;
}

/** "Cetirizine; resolved in 75 min" — only from data that was actually linked. */
function describeResponse(symptoms: ReportEntry[], all: ReportEntry[]): string {
  const parts: string[] = [];
  const treatments = symptoms
    .map(s => all.find(e => e.id === s.relatedEntryId && e.type === 'Medication')?.name)
    .filter((n): n is string => Boolean(n));
  if (treatments.length) parts.push([...new Set(treatments)].join(', '));

  const resolved = symptoms.find(s => s.resolvedAt);
  if (resolved?.resolvedAt) {
    const dur = formatDuration(ts(resolved.resolvedAt) - ts(resolved.time));
    parts.push(resolved.resolvedPrecision === 'confirmed-by' ? `resolved within ${dur}` : `resolved in ${dur}`);
  } else {
    parts.push('resolution not recorded');
  }
  return parts.join('; ');
}

function buildPatternBlock(top: AllergenPattern): ReportModel['pattern'] {
  const { strength, note } = scorePattern(top);
  const onsets = top.pairs.map(p => p.onsetMinutes);
  const symptomNames = top.pairs.flatMap(p => p.symptoms.map(s => s.name.toLowerCase()));
  const counted = new Map<string, number>();
  for (const n of symptomNames) counted.set(n, (counted.get(n) ?? 0) + 1);
  const repeated = [...counted.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]);
  const incomplete = top.pairs.filter(p => !hasIngredientEvidence(p.exposure)).length;

  const bullets: string[] = [];
  bullets.push(
    onsets.length > 1 && Math.min(...onsets) !== Math.max(...onsets)
      ? `Symptoms began ${Math.min(...onsets)}–${Math.max(...onsets)} minutes after exposure; median ${median(onsets)} minutes.`
      : `Symptoms began about ${onsets[0]} minutes after exposure.`,
  );
  if (repeated.length) {
    bullets.push(`${capitalise(list(repeated.slice(0, 2).map(([n]) => n)))} appeared in ${repeated[0][1]} of ${top.pairs.length} events.`);
  }
  if (incomplete > 0) bullets.push(`${incomplete} of ${top.pairs.length} exposures have incomplete ingredient details.`);
  if (top.toleratedCount > 0) bullets.push(`${plural(top.toleratedCount, 'other exposure')} containing ${top.allergen.toLowerCase()} were logged without a reaction.`);

  return {
    title: `Possible ${top.allergen.toLowerCase()} association`,
    summary: `${plural(top.pairs.length, 'reaction')} followed foods or products that contained, or may have contained, ${top.allergen.toLowerCase()}.`,
    bullets,
    strength,
    strengthNote: note,
  };
}

function emptyPatternBlock(symptomCount: number, exposureCount: number): ReportModel['pattern'] {
  const reason = symptomCount === 0
    ? 'No symptom episodes were logged in this period.'
    : exposureCount === 0
      ? 'Symptoms were logged, but no exposures were recorded to compare them against.'
      : 'No exposure was followed by symptoms more than once, so no repeated combination emerged.';
  return {
    title: 'No repeated pattern identified',
    summary: reason,
    bullets: [
      `${plural(symptomCount, 'symptom episode')} and ${plural(exposureCount, 'exposure')} were recorded in this period.`,
      'Logging what was eaten alongside each symptom, with timing, is what allows a pattern to emerge.',
    ],
    strength: 'Insufficient',
    strengthNote: 'There is not enough repeated data in this period to assess a pattern.',
  };
}

function buildEvidence(
  top: AllergenPattern | null,
  pairs: ReactionPair[],
  symptoms: ReportEntry[],
): ReportModel['evidence'] {
  const rows: ReportModel['evidence'] = [];
  if (top) {
    const withEvidence = top.pairs.filter(p => hasIngredientEvidence(p.exposure)).length;
    rows.push({
      finding: 'Possible shared trigger',
      observed: `${top.allergen} appeared, or may have appeared, in ${plural(top.pairs.length, 'similar episode')}.`,
      limit: withEvidence === top.pairs.length
        ? 'Ingredient details were recorded for every exposure.'
        : `${top.pairs.length - withEvidence} of ${top.pairs.length} exposures have incomplete ingredient lists.`,
    });
    const onsets = top.pairs.map(p => p.onsetMinutes);
    rows.push({
      finding: 'Timing',
      observed: `Symptoms began ${Math.min(...onsets)}–${Math.max(...onsets)} minutes after exposure; median was ${median(onsets)} minutes.`,
      limit: 'Times are self-reported and may be approximate.',
    });
  }

  const withCofactors = symptoms.filter(s => parseCofactorField(s.cofactors).length > 0);
  if (withCofactors.length) {
    const labels = [...new Set(withCofactors.flatMap(s => parseCofactorField(s.cofactors)))];
    rows.push({
      finding: 'Possible cofactor',
      observed: `${capitalise(list(labels))} recorded alongside ${plural(withCofactors.length, 'episode')}.`,
      limit: 'The dataset is too small to separate exposure from cofactor effects.',
    });
  }

  const unattributed = symptoms.length - pairs.reduce((n, p) => n + p.symptoms.length, 0);
  if (unattributed > 0) {
    rows.push({
      finding: 'Unattributed symptoms',
      observed: `${plural(unattributed, 'symptom episode')} had no exposure logged in the preceding 4 hours.`,
      limit: 'Absence of a logged exposure does not mean none occurred.',
    });
  }

  if (top && top.toleratedCount > 0) {
    rows.push({
      finding: 'Conflicting evidence',
      observed: `${plural(top.toleratedCount, 'exposure')} containing ${top.allergen.toLowerCase()} were logged with no reaction.`,
      limit: 'A tolerated exposure does not rule out an allergy, and a precautionary label does not confirm allergen presence.',
    });
  }

  if (rows.length === 0) {
    rows.push({
      finding: 'Insufficient data',
      observed: 'No repeated exposure-and-symptom combination was recorded in this period.',
      limit: 'This reflects what was logged, not an absence of reactions.',
    });
  }
  return rows;
}

function buildOtherActivity(
  symptoms: ReportEntry[],
  pairs: ReactionPair[],
  top: AllergenPattern | null,
): string[] {
  const out: string[] = [];
  const patternSymptomIds = new Set((top?.pairs ?? []).flatMap(p => p.symptoms.map(s => s.id)));
  const others = symptoms.filter(s => !patternSymptomIds.has(s.id));

  if (others.length) {
    const names = [...new Set(others.map(s => s.name.toLowerCase()))];
    out.push(`${plural(others.length, 'other symptom episode')} logged outside the pattern above: ${list(names.slice(0, 5))}.`);
  }

  const overnight = symptoms.filter(s => {
    const h = new Date(s.time).getHours();
    return h >= 22 || h < 6;
  });
  out.push(overnight.length === 0
    ? 'No overnight symptom onsets were recorded.'
    : `${plural(overnight.length, 'episode')} began between 10pm and 6am.`);

  const longest = symptoms
    .filter(s => s.resolvedAt)
    .map(s => ({ s, ms: ts(s.resolvedAt!) - ts(s.time) }))
    .sort((a, b) => b.ms - a.ms)[0];
  if (longest && longest.ms > 12 * HOUR) {
    out.push(`Longest recorded episode: ${longest.s.name.toLowerCase()}, ${formatDuration(longest.ms)}.`);
  }

  const emergency = symptoms.filter(s => s.emergencyCare && s.emergencyCare !== 'none');
  out.push(emergency.length === 0
    ? 'No emergency treatment or epinephrine administration was logged.'
    : `${plural(emergency.length, 'episode')} involved urgent or emergency care.`);

  if (pairs.length === 0 && symptoms.length > 0) {
    out.push('No symptom in this period had an exposure logged before it, so no timing relationship could be assessed.');
  }
  return out.slice(0, 5);
}

function buildMedicationRows(
  medEntries: ReportEntry[],
  medications: ReportMedication[],
  logs: ReportMedicationLog[],
  allEntries: ReportEntry[],
  significant: ReportEntry[],
): ReportModel['medications'] {
  const rows = new Map<string, { uses: number; observed: string }>();

  for (const med of medEntries) {
    const key = med.name.trim();
    if (!key) continue;
    const current = rows.get(key) ?? { uses: 0, observed: '' };
    current.uses += 1;
    rows.set(key, current);
  }

  for (const med of medications) {
    const key = med.name.trim();
    const taken = logs.filter(l => l.medicationId === med.id).length;
    const current = rows.get(key) ?? { uses: 0, observed: '' };
    current.uses += taken;
    rows.set(key, current);
  }

  // Treatment → outcome, using only symptom entries that were explicitly linked
  // to a medication at logging time.
  for (const [name, row] of rows) {
    const linkedSymptoms = allEntries.filter(
      e => e.type === 'Symptom' &&
        allEntries.some(m => m.id === e.relatedEntryId && m.type === 'Medication' && m.name.trim() === name),
    );
    const resolved = linkedSymptoms.filter(s => s.resolvedAt);
    if (resolved.length) {
      const durations = resolved.map(s => ts(s.resolvedAt!) - ts(s.time));
      row.observed = `Symptoms resolved after ${formatDuration(Math.min(...durations))}–${formatDuration(Math.max(...durations))} in ${plural(resolved.length, 'linked entry', 'linked entries')}.`;
    } else if (linkedSymptoms.length) {
      row.observed = `Taken for ${plural(linkedSymptoms.length, 'logged episode')}; no resolution time was recorded.`;
    } else {
      row.observed = 'No symptom entry was linked to this medication.';
    }
  }

  const epinephrineLogged = [...rows.keys()].some(n => /epinephrine|epipen|auvi|adrenaclick/i.test(n));
  if (!epinephrineLogged) {
    const missing = significant.filter(s => !s.epinephrineAvailable).length;
    const notOnHand = significant.filter(s => s.epinephrineAvailable === 'no').length;
    let observed: string;
    if (significant.length === 0) {
      observed = 'No severe episode was recorded in this period.';
    } else if (missing > 0) {
      observed = `Availability was not recorded in ${missing} of ${significant.length} severe ${significant.length === 1 ? 'episode' : 'episodes'}.`;
    } else if (notOnHand > 0) {
      observed = `Recorded as NOT on hand in ${notOnHand} of ${significant.length} severe ${significant.length === 1 ? 'episode' : 'episodes'}; no administration was logged.`;
    } else {
      observed = 'Recorded as available in every severe episode; no administration was logged.';
    }
    rows.set('Epinephrine', { uses: 0, observed });
  }

  return [...rows.entries()]
    .sort((a, b) => b[1].uses - a[1].uses)
    .slice(0, 8)
    .map(([name, row]) => ({
      name,
      use: row.uses === 0 ? 'none logged' : plural(row.uses, 'dose'),
      observed: row.observed,
    }));
}

function buildQuestions(
  top: AllergenPattern | null,
  symptoms: ReportEntry[],
  significant: ReportEntry[],
  epiMissing: number,
  pairs: ReactionPair[],
): string[] {
  const questions: string[] = [];

  if (top) {
    questions.push(`Does this history support evaluating ${top.allergen.toLowerCase()}, or another shared ingredient, as a trigger?`);
  } else if (symptoms.length > 0) {
    questions.push('What additional details should be captured so a pattern can be assessed at the next visit?');
  }

  const cofactorLabels = [...new Set(symptoms.flatMap(s => parseCofactorField(s.cofactors)))];
  if (cofactorLabels.length) {
    questions.push(`Could ${list(cofactorLabels.slice(0, 3)).toLowerCase()} have contributed to these episodes?`);
  }

  if (significant.length > 0 || epiMissing > 0) {
    questions.push('How should the patient distinguish a reaction that can be managed at home from one that requires epinephrine?');
  }
  if (epiMissing > 0) {
    questions.push('Should an epinephrine auto-injector be prescribed or renewed, and is the action plan current?');
  }
  if (top && top.toleratedCount > 0) {
    questions.push(`How should the tolerated ${top.allergen.toLowerCase()} exposures be weighed against the reactions above?`);
  }
  if (pairs.length > 0) {
    questions.push('Which foods should remain in the diet, and which — if any — should be avoided pending evaluation?');
  }
  questions.push('What additional information would be most useful to record during any future episode?');

  return questions.slice(0, 6);
}

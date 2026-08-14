export interface InsightCard {
  emoji: string;
  label: string;
  text: string;
}

export interface HealthEntrySummaryRow {
  type: string;
  name: string;
  severity?: number | null;
  time: string;
}

export interface ExposureTestSummaryRow {
  allergen: string;
  status: string;
  reactions?: string | null;
  // Together these give a real completion figure for a test in progress:
  // how far through its monitoring window it is.
  testDate?: string | null;        // 'YYYY-MM-DD'
  testTime?: string | null;        // 'HH:MM' local
  monitoringDuration?: string | null;  // e.g. '8 hours'
}

/**
 * Where an allergen stands in the testing process.
 *
 * Ordered by how much it should worry you, which is also the precedence used
 * when one allergen has several tests: a recorded reaction is the fact that
 * matters most, so a later test being underway must not hide it.
 */
export type AllergenStatus = 'reacted' | 'testing' | 'planned' | 'tolerated' | 'untested';

const STATUS_PRECEDENCE: AllergenStatus[] = ['reacted', 'testing', 'planned', 'tolerated', 'untested'];

export interface AllergenBar {
  label: string;
  count: number;
  status: AllergenStatus;
  /**
   * How much of the monitoring window has elapsed, 0–1.
   *
   * `null` means genuinely unknown — an untested allergen, or a test missing
   * the start time or duration needed to work it out. It is deliberately not
   * 0: a clock reading "nothing done yet" is a claim, and we would be making
   * it up. The chart draws nothing rather than guess.
   */
  progress: number | null;
}

// A completed test records reactions as free text. Absent means nothing was
// observed; so does someone typing "none" into the box, which would otherwise
// read as a reaction and colour a tolerated food red.
const NO_REACTION_RE = /^(none|no|n\/?a|nil|nothing|no reaction[s]?|none observed|no symptoms)\.?$/i;

function hasReaction(reactions: string | null | undefined): boolean {
  const text = reactions?.trim();
  return !!text && !NO_REACTION_RE.test(text);
}

function statusOfTest(test: ExposureTestSummaryRow): AllergenStatus {
  if (test.status === 'completed') return hasReaction(test.reactions) ? 'reacted' : 'tolerated';
  if (test.status === 'active') return 'testing';
  if (test.status === 'planned') return 'planned';
  return 'untested';
}

/** The status shown for an allergen, given every test recorded against it. */
export function resolveAllergenStatus(tests: ExposureTestSummaryRow[]): AllergenStatus {
  if (tests.length === 0) return 'untested';
  const statuses = tests.map(statusOfTest);
  return STATUS_PRECEDENCE.find(s => statuses.includes(s)) ?? 'untested';
}

/** '8 hours' / '1 hour' / '45 minutes' → hours. Null when it cannot be read. */
export function parseDurationHours(duration: string | null | undefined): number | null {
  const text = duration?.trim().toLowerCase();
  if (!text) return null;
  // Plurals must be part of the alternative, not left to \b: "8 hours" would
  // otherwise fail, because the boundary after "hour" lands on the "s".
  const match = text.match(/([\d.]+)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/);
  if (!match) return null;
  const value = parseFloat(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return match[2].startsWith('m') ? value / 60 : value;
}

/** Local start instant of a test. Null unless both date and time are recorded. */
function testStart(test: ExposureTestSummaryRow): Date | null {
  const date = test.testDate?.trim();
  const time = test.testTime?.trim();
  // Without a time we would have to assume midnight, which overstates progress
  // by up to a day — better to report "unknown" than to invent a start.
  if (!date || !time) return null;
  const d = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!d || !t) return null;
  const start = new Date(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  return Number.isNaN(start.getTime()) ? null : start;
}

/** How far through its monitoring window a single test is, 0–1, or null. */
export function testProgress(test: ExposureTestSummaryRow, now: Date = new Date()): number | null {
  const hours = parseDurationHours(test.monitoringDuration);
  const start = testStart(test);
  if (hours === null || start === null) return null;
  const elapsed = now.getTime() - start.getTime();
  if (elapsed <= 0) return 0;   // scheduled for later today
  return Math.min(1, elapsed / (hours * 3_600_000));
}

/**
 * Completion for the allergen as a whole.
 *
 * A finished test is done regardless of its outcome, so both 'reacted' and
 * 'tolerated' read as full. Of several tests underway, the furthest along is
 * shown — that is the one whose window closes first.
 */
export function resolveAllergenProgress(
  tests: ExposureTestSummaryRow[],
  status: AllergenStatus,
  now: Date = new Date(),
): number | null {
  if (status === 'untested') return null;
  if (status === 'reacted' || status === 'tolerated') return 1;
  if (status === 'planned') return 0;

  const running = tests
    .filter(t => t.status === 'active')
    .map(t => testProgress(t, now))
    .filter((p): p is number => p !== null);
  return running.length > 0 ? Math.max(...running) : null;
}

// Aggregates allergen/food/symptom names into frequency counts for the Insights chart.
// Symptom + Exposure entry names and ExposureTest allergens are pooled together since
// they all describe things the user reacted to or tested.
export function buildAllergenChartData(
  entries: HealthEntrySummaryRow[],
  tests: ExposureTestSummaryRow[],
  now: Date = new Date(),
): AllergenBar[] {
  // Keyed case-insensitively: "Milk" logged as an exposure and "milk" typed on
  // a test are the same food to the person tracking it, and counting them
  // separately split one food across two bars. The first spelling seen is kept
  // for display so the chart still reads in the user's own words.
  const freq: Record<string, { label: string; count: number }> = {};
  const testsByAllergen: Record<string, ExposureTestSummaryRow[]> = {};

  const tally = (name: string) => {
    const label = name.trim();
    if (!label) return null;
    const key = label.toLowerCase();
    freq[key] ??= { label, count: 0 };
    freq[key].count += 1;
    return key;
  };

  for (const e of entries) {
    if (e.type !== 'Symptom' && e.type !== 'Exposure') continue;
    tally(e.name);
  }

  for (const t of tests) {
    const key = tally(t.allergen);
    if (!key) continue;
    (testsByAllergen[key] ??= []).push(t);
  }

  return Object.entries(freq)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([key, { label, count }]) => {
      const own = testsByAllergen[key] ?? [];
      const status = resolveAllergenStatus(own);
      return { label, count, status, progress: resolveAllergenProgress(own, status, now) };
    });
}

export function buildDataSummary(
  entries: HealthEntrySummaryRow[],
  tests: ExposureTestSummaryRow[],
): string {
  if (entries.length === 0 && tests.length === 0) return 'NO_DATA';

  const symptoms = entries.filter(e => e.type === 'Symptom');
  const exposures = entries.filter(e => e.type === 'Exposure');
  const medications = entries.filter(e => e.type === 'Medication');

  const symFreq: Record<string, number> = {};
  for (const s of symptoms) symFreq[s.name] = (symFreq[s.name] ?? 0) + 1;
  const topSymptoms = Object.entries(symFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `${name} (${count}x)`)
    .join(', ');

  const expNames = exposures.slice(-5).map(e => e.name).join(', ');

  const avgSeverity =
    symptoms.length > 0
      ? (symptoms.reduce((sum, s) => sum + (s.severity ?? 0), 0) / symptoms.length).toFixed(1)
      : null;

  const completedTests = tests.filter(t => t.status === 'completed');
  const reactedTests = tests.filter(t => t.reactions && t.reactions.trim() !== '');

  const lines: string[] = [
    `Total logged: ${symptoms.length} symptoms, ${exposures.length} exposures, ${medications.length} medications.`,
  ];
  if (topSymptoms) lines.push(`Most frequent symptoms: ${topSymptoms}.`);
  if (avgSeverity) lines.push(`Average symptom severity: ${avgSeverity}/10.`);
  if (expNames) lines.push(`Recent exposures: ${expNames}.`);
  if (completedTests.length > 0)
    lines.push(`Completed ${completedTests.length} of ${tests.length} exposure tests.`);
  if (reactedTests.length > 0)
    lines.push(`Exposure tests with reactions: ${reactedTests.map(t => t.allergen).join(', ')}.`);

  return lines.join(' ');
}

export function parseInsights(raw: string): InsightCard[] {
  const cards: InsightCard[] = [];

  const patternMatch = raw.match(/PATTERN[:\s]+([^\n]+)/i);
  const trendMatch = raw.match(/TREND[:\s]+([^\n]+)/i);
  const tipMatch = raw.match(/TIP[:\s]+([^\n]+)/i);

  if (patternMatch) cards.push({ emoji: '⚠', label: 'Pattern detected', text: patternMatch[1].trim() });
  if (trendMatch) cards.push({ emoji: '📊', label: 'Trend', text: trendMatch[1].trim() });
  if (tipMatch) cards.push({ emoji: '💡', label: 'Tip', text: tipMatch[1].trim() });

  if (cards.length === 0 && raw.trim()) {
    cards.push({ emoji: '💡', label: 'Insight', text: raw.trim().slice(0, 180) });
  }

  return cards;
}

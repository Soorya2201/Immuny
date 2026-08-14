import { describe, it, expect } from 'vitest';
import { buildSymptomOverview, smoothLinePath } from '../utils/symptomOverview';

// Local-time throughout: a symptom belongs to the day the person had it, which
// is a local calendar day, not a UTC one.
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);
const iso = (d: Date) => d.toISOString();

const symptom = (when: Date, severity?: number) => ({
  type: 'Symptom',
  time: iso(when),
  severity: severity ?? null,
});

const NOW = at(2026, 8, 14, 15);

describe('buildSymptomOverview', () => {
  it('returns one bucket per day, oldest first and ending today', () => {
    const { buckets } = buildSymptomOverview([], 7, NOW);
    expect(buckets).toHaveLength(7);
    expect(buckets[0].date.getDate()).toBe(8);
    expect(buckets[6].date.getDate()).toBe(14);
  });

  it('supports the 30-day window', () => {
    const { buckets } = buildSymptomOverview([], 30, NOW);
    expect(buckets).toHaveLength(30);
    expect(buckets[29].date.getDate()).toBe(14);
  });

  it('starts every bucket empty', () => {
    const { buckets, totalLogs, highestSeverity } = buildSymptomOverview([], 7, NOW);
    expect(buckets.every(b => b.count === 0 && b.maxSeverity === null)).toBe(true);
    expect(totalLogs).toBe(0);
    expect(highestSeverity).toBeNull();
  });

  it('labels the weekly view by weekday letter and the monthly view by date', () => {
    const week = buildSymptomOverview([], 7, NOW);
    // 14 Aug 2026 is a Friday.
    expect(week.buckets[6].label).toBe('F');
    expect(week.buckets.every(b => b.label.length === 1)).toBe(true);

    const month = buildSymptomOverview([], 30, NOW);
    expect(month.buckets[29].label).toBe('14');
  });

  it('counts symptoms into the day they happened', () => {
    const { buckets, totalLogs } = buildSymptomOverview(
      [symptom(at(2026, 8, 14, 9)), symptom(at(2026, 8, 14, 18)), symptom(at(2026, 8, 12))],
      7,
      NOW,
    );
    expect(totalLogs).toBe(3);
    expect(buckets[6].count).toBe(2);   // the 14th
    expect(buckets[4].count).toBe(1);   // the 12th
    expect(buckets[5].count).toBe(0);   // the 13th
  });

  it('ignores entries that are not symptoms', () => {
    const { totalLogs, buckets } = buildSymptomOverview(
      [
        { type: 'Exposure', time: iso(at(2026, 8, 14)), severity: 9 },
        { type: 'Medication', time: iso(at(2026, 8, 14)), severity: 8 },
        symptom(at(2026, 8, 14), 3),
      ],
      7,
      NOW,
    );
    expect(totalLogs).toBe(1);
    expect(buckets[6].maxSeverity).toBe(3);
  });

  it('ignores entries outside the window', () => {
    const { totalLogs } = buildSymptomOverview(
      [symptom(at(2026, 7, 1)), symptom(at(2026, 8, 20))],
      7,
      NOW,
    );
    expect(totalLogs).toBe(0);
  });

  it('keeps the worst severity per day and overall', () => {
    const { buckets, highestSeverity } = buildSymptomOverview(
      [
        symptom(at(2026, 8, 14, 8), 3),
        symptom(at(2026, 8, 14, 20), 7),
        symptom(at(2026, 8, 13), 5),
      ],
      7,
      NOW,
    );
    expect(buckets[6].maxSeverity).toBe(7);
    expect(buckets[5].maxSeverity).toBe(5);
    expect(highestSeverity).toBe(7);
  });

  it('counts a symptom logged without a severity but records none', () => {
    const { buckets, totalLogs, highestSeverity } = buildSymptomOverview(
      [symptom(at(2026, 8, 14))],
      7,
      NOW,
    );
    expect(totalLogs).toBe(1);
    expect(buckets[6].count).toBe(1);
    expect(buckets[6].maxSeverity).toBeNull();
    expect(highestSeverity).toBeNull();
  });

  it('includes a symptom logged a minute before midnight on the first day', () => {
    const { buckets, totalLogs } = buildSymptomOverview(
      [symptom(at(2026, 8, 8, 23, 59))],
      7,
      NOW,
    );
    expect(totalLogs).toBe(1);
    expect(buckets[0].count).toBe(1);
  });

  it('excludes a symptom from the day before the window opens', () => {
    const { totalLogs } = buildSymptomOverview([symptom(at(2026, 8, 7, 23, 59))], 7, NOW);
    expect(totalLogs).toBe(0);
  });

  it('spans a month boundary without gaps', () => {
    const { buckets } = buildSymptomOverview([], 7, at(2026, 9, 2, 12));
    expect(buckets.map(b => b.date.getDate())).toEqual([27, 28, 29, 30, 31, 1, 2]);
  });
});

describe('smoothLinePath', () => {
  it('returns nothing for no points', () => {
    expect(smoothLinePath([])).toBe('');
  });

  it('returns a bare move for a single point', () => {
    expect(smoothLinePath([{ x: 5, y: 10 }])).toBe('M 5 10');
  });

  it('starts at the first point and emits one curve per gap', () => {
    const path = smoothLinePath([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
    ]);
    expect(path.startsWith('M 0 0')).toBe(true);
    expect(path.match(/C/g)).toHaveLength(2);
  });

  it('ends exactly on the last point, so the line does not overshoot', () => {
    const path = smoothLinePath([
      { x: 0, y: 4 },
      { x: 10, y: 8 },
      { x: 20, y: 2 },
      { x: 30, y: 6 },
    ]);
    expect(path.trim().endsWith('30 6')).toBe(true);
  });

  it('produces only finite numbers', () => {
    const path = smoothLinePath([
      { x: 0, y: 0 },
      { x: 1, y: 100 },
      { x: 2, y: 0 },
      { x: 3, y: 100 },
    ]);
    expect(path).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('draws a straight run as a flat path', () => {
    const path = smoothLinePath([
      { x: 0, y: 5 },
      { x: 10, y: 5 },
      { x: 20, y: 5 },
    ]);
    // Every y in the path — points and control points alike — stays on the line.
    const ys = [...path.matchAll(/[\d.]+ ([\d.]+)/g)].map(m => Number(m[1]));
    expect(ys.every(y => y === 5)).toBe(true);
  });
});

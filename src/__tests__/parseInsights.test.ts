import { describe, it, expect } from 'vitest';
import { buildDataSummary, parseInsights } from '../utils/parseInsights';
import type { HealthEntrySummaryRow, ExposureTestSummaryRow } from '../utils/parseInsights';

const TIME = '2024-06-15T10:00:00Z';

describe('buildDataSummary', () => {
  it('returns NO_DATA when both arrays are empty', () => {
    expect(buildDataSummary([], [])).toBe('NO_DATA');
  });

  it('counts types correctly in the first line', () => {
    const entries: HealthEntrySummaryRow[] = [
      { type: 'Symptom', name: 'Hives', severity: 7, time: TIME },
      { type: 'Symptom', name: 'Itching', severity: 4, time: TIME },
      { type: 'Exposure', name: 'Peanuts', time: TIME },
      { type: 'Medication', name: 'Benadryl', time: TIME },
    ];
    const summary = buildDataSummary(entries, []);
    expect(summary).toContain('2 symptoms, 1 exposures, 1 medications');
  });

  it('includes top symptoms by frequency', () => {
    const entries: HealthEntrySummaryRow[] = [
      { type: 'Symptom', name: 'Hives', severity: 5, time: TIME },
      { type: 'Symptom', name: 'Hives', severity: 6, time: TIME },
      { type: 'Symptom', name: 'Itching', severity: 3, time: TIME },
    ];
    const summary = buildDataSummary(entries, []);
    expect(summary).toContain('Hives (2x)');
    expect(summary).toContain('Itching (1x)');
  });

  it('calculates average severity', () => {
    const entries: HealthEntrySummaryRow[] = [
      { type: 'Symptom', name: 'Hives', severity: 8, time: TIME },
      { type: 'Symptom', name: 'Rash', severity: 4, time: TIME },
    ];
    const summary = buildDataSummary(entries, []);
    expect(summary).toContain('6.0/10');
  });

  it('reports reacted exposure tests', () => {
    const tests: ExposureTestSummaryRow[] = [
      { allergen: 'Peanuts', status: 'completed', reactions: 'Hives' },
      { allergen: 'Milk', status: 'completed', reactions: '' },
    ];
    const summary = buildDataSummary([], tests);
    expect(summary).toContain('Peanuts');
    expect(summary).not.toContain('Milk');
  });
});

describe('parseInsights', () => {
  it('returns empty array for empty string', () => {
    expect(parseInsights('')).toEqual([]);
  });

  it('parses all three cards from PATTERN/TREND/TIP format', () => {
    const raw = 'PATTERN: Hives appear after nut exposure.\nTREND: Severity is increasing over time.\nTIP: Carry an EpiPen at all times.';
    const cards = parseInsights(raw);
    expect(cards).toHaveLength(3);
    expect(cards[0].label).toBe('Pattern detected');
    expect(cards[0].text).toBe('Hives appear after nut exposure.');
    expect(cards[1].label).toBe('Trend');
    expect(cards[2].label).toBe('Tip');
  });

  it('falls back to a single card when format is not matched', () => {
    const raw = 'Your symptoms are worsening in spring months.';
    const cards = parseInsights(raw);
    expect(cards).toHaveLength(1);
    expect(cards[0].label).toBe('Insight');
    expect(cards[0].text).toBe(raw);
  });

  it('truncates fallback text to 180 chars', () => {
    const long = 'A'.repeat(300);
    const cards = parseInsights(long);
    expect(cards[0].text.length).toBe(180);
  });

  it('parses case-insensitive keywords', () => {
    const raw = 'pattern: Something. trend: Something else. tip: Do this.';
    const cards = parseInsights(raw);
    expect(cards).toHaveLength(3);
  });
});

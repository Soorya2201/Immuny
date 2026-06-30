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

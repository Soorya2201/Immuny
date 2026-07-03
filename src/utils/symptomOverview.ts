export interface DayBucket {
  date: Date;
  label: string;
  count: number;
  maxSeverity: number | null;
}

export interface SymptomOverview {
  buckets: DayBucket[];
  totalLogs: number;
  highestSeverity: number | null;
}

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

// Buckets symptom entries into daily counts + max severity, for the last
// `days` days (inclusive of today). Weekly view labels by weekday letter,
// monthly view labels by day-of-month (used sparsely on the axis).
export function buildSymptomOverview(
  entries: { type: string; time: string; severity?: number | null }[],
  days: 7 | 30,
): SymptomOverview {
  const today = startOfDay(new Date());
  const buckets: DayBucket[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    buckets.push({
      date,
      label: days === 7 ? WEEKDAY_LETTERS[date.getDay()] : String(date.getDate()),
      count: 0,
      maxSeverity: null,
    });
  }

  const bucketByTime = new Map(buckets.map(b => [b.date.getTime(), b]));

  let totalLogs = 0;
  let highestSeverity: number | null = null;

  for (const e of entries) {
    if (e.type !== 'Symptom') continue;
    const day = startOfDay(new Date(e.time)).getTime();
    const bucket = bucketByTime.get(day);
    if (!bucket) continue;
    bucket.count += 1;
    totalLogs += 1;
    if (typeof e.severity === 'number') {
      bucket.maxSeverity = Math.max(bucket.maxSeverity ?? 0, e.severity);
      highestSeverity = Math.max(highestSeverity ?? 0, e.severity);
    }
  }

  return { buckets, totalLogs, highestSeverity };
}

// Catmull-Rom -> cubic Bezier smoothing so the line reads as a soft wave
// instead of sharp angles between daily points.
export function smoothLinePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return path;
}

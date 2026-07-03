import { useMemo, useState } from 'react';
import { buildSymptomOverview, smoothLinePath } from '../utils/symptomOverview';
import { BarChartIcon } from './icons';

interface SymptomOverviewCardProps {
  entries: { type: string; time: string; severity?: number | null }[];
}

type Range = 'weekly' | 'monthly';

const CHART_WIDTH = 320;
const CHART_HEIGHT = 90;
const BASELINE_Y = 66;
const BUMP_MAX = 46;

export default function SymptomOverviewCard({ entries }: SymptomOverviewCardProps) {
  const [range, setRange] = useState<Range>('weekly');
  const days = range === 'weekly' ? 7 : 30;

  const overview = useMemo(() => buildSymptomOverview(entries, days), [entries, days]);
  const { buckets, totalLogs, highestSeverity } = overview;

  const maxCount = Math.max(1, ...buckets.map(b => b.count));
  const stepX = CHART_WIDTH / Math.max(1, buckets.length - 1);

  const points = buckets.map((b, i) => ({
    x: i * stepX,
    y: BASELINE_Y - (b.count > 0 ? (b.count / maxCount) * BUMP_MAX : 0),
    bucket: b,
  }));

  const linePath = smoothLinePath(points.map(p => ({ x: p.x, y: p.y })));

  // Monthly view only labels every 5th day (matches the reference sparsity —
  // labeling all 30 days would collide).
  const showLabel = (i: number) => range === 'weekly' || i === 0 || i === points.length - 1 || i % 5 === 0;

  return (
    <div className="symptom-overview-card">
      <div className="symptom-overview-header">
        <span className="symptom-overview-title"><BarChartIcon /> Symptom Overview</span>
        <div className="symptom-overview-toggle">
          <button
            className={range === 'weekly' ? 'active' : ''}
            onClick={() => setRange('weekly')}
          >
            Weekly
          </button>
          <button
            className={range === 'monthly' ? 'active' : ''}
            onClick={() => setRange('monthly')}
          >
            Monthly
          </button>
        </div>
      </div>

      <div className="symptom-overview-body">
        <svg
          viewBox={`0 -10 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="symptom-overview-svg"
          preserveAspectRatio="none"
        >
          <line x1={0} y1={BASELINE_Y + 6} x2={CHART_WIDTH} y2={BASELINE_Y + 6} className="symptom-overview-baseline" />
          <path d={linePath} className="symptom-overview-line" />
          {points.map((p, i) => p.bucket.count > 0 && (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={5 + Math.min(4, (p.bucket.maxSeverity ?? 3) / 2.5)}
              fill="url(#symptomOverviewGradient)"
            >
              <title>{`${p.bucket.count} log${p.bucket.count > 1 ? 's' : ''}${p.bucket.maxSeverity ? `, severity ${p.bucket.maxSeverity}/10` : ''}`}</title>
            </circle>
          ))}
          <defs>
            <linearGradient id="symptomOverviewGradient" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="var(--teal, #0188b4)" />
              <stop offset="100%" stopColor="#f5a742" />
            </linearGradient>
          </defs>
        </svg>
        <div className="symptom-overview-labels">
          {points.map((p, i) => (
            <span key={i} className="symptom-overview-label">{showLabel(i) ? p.bucket.label : ''}</span>
          ))}
        </div>
      </div>

      <p className="symptom-overview-caption">
        {totalLogs} symptom log{totalLogs === 1 ? '' : 's'} in the last {days} days
        {highestSeverity != null && <> · highest severity {highestSeverity}</>}
      </p>
    </div>
  );
}

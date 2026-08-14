import type { AllergenBar, AllergenStatus } from '../utils/parseInsights';
import { BarChartIcon } from './icons';

interface AllergenChartProps {
  data: AllergenBar[];
}

// Neutral, content-free rows used only to keep the chart's shape visible
// when the user has no real logged data yet — no invented allergen names.
const EMPTY_ROWS = 4;

// Every status carries a written label as well as a colour. Testing progress
// decides what a family does or doesn't eat, so it must not be legible only to
// people who can distinguish amber from green.
const STATUS_META: Record<AllergenStatus, { label: string; help: string }> = {
  reacted:   { label: 'Reacted',   help: 'A completed test recorded a reaction' },
  testing:   { label: 'Testing',   help: 'A test is underway' },
  planned:   { label: 'Planned',   help: 'A test is scheduled but not started' },
  tolerated: { label: 'Tolerated', help: 'A completed test recorded no reaction' },
  untested:  { label: 'Untested',  help: 'Logged, but never formally tested' },
};

// The legend only lists what is actually on screen — a key to five states when
// you have two is noise.
const LEGEND_ORDER: AllergenStatus[] = ['testing', 'planned', 'reacted', 'tolerated', 'untested'];

export default function AllergenChart({ data }: AllergenChartProps) {
  const isEmpty = data.length === 0;
  const max = Math.max(1, ...data.map(d => d.count));
  const present = LEGEND_ORDER.filter(s => data.some(d => d.status === s));

  return (
    <div className={`allergen-chart${isEmpty ? ' allergen-chart--placeholder' : ''}`}>
      <div className="allergen-chart-header">
        <BarChartIcon />
        <span>Reporting frequency</span>
      </div>

      <div className="allergen-chart-bars">
        {isEmpty
          ? Array.from({ length: EMPTY_ROWS }).map((_, i) => (
              <div className="allergen-bar-row allergen-bar-row--empty" key={i}>
                <div className="allergen-bar-track">
                  <div className="allergen-bar-fill" style={{ width: '0%' }} />
                </div>
              </div>
            ))
          : data.map(d => (
              <div className={`allergen-bar-row allergen-bar-row--${d.status}`} key={d.label}>
                <span className="allergen-bar-label">{d.label}</span>
                <div className="allergen-bar-track">
                  <div
                    className="allergen-bar-fill"
                    style={{ width: `${Math.max(4, (d.count / max) * 100)}%` }}
                  />
                </div>
                <span
                  className="allergen-status-pill"
                  title={STATUS_META[d.status].help}
                >
                  {/* Underway states pulse, so a test in progress reads as live
                      rather than as just another colour. */}
                  <span className="allergen-status-dot" />
                  {STATUS_META[d.status].label}
                </span>
                <span className="allergen-bar-count">{d.count}</span>
              </div>
            ))}
      </div>

      {!isEmpty && present.length > 0 && (
        <div className="allergen-legend">
          {present.map(s => (
            <span className={`allergen-legend-item allergen-bar-row--${s}`} key={s}>
              <span className="allergen-status-dot" />
              {STATUS_META[s].label}
            </span>
          ))}
        </div>
      )}

      {isEmpty && (
        <p className="allergen-chart-empty-note">
          No allergen data logged yet. Log a symptom, exposure, or test to see your trends here.
        </p>
      )}
    </div>
  );
}

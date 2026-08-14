import type { AllergenBar, AllergenStatus } from '../utils/parseInsights';
import { BarChartIcon } from './icons';

interface AllergenChartProps {
  data: AllergenBar[];
}

/**
 * A clock face filled clockwise from noon, showing how much of a test's
 * monitoring window has elapsed.
 *
 * Drawn as one circle whose stroke is thick enough to close the middle: with
 * `r` at a quarter of the box and a stroke twice that, the dash pattern cuts a
 * true pie wedge rather than a ring. Cheaper and crisper at 13px than an arc
 * path, which needs trigonometry and hairline-aliases at this size.
 *
 * `progress: null` means unknown, and draws an outline only — an empty clock
 * would assert "nothing done yet", which is a different claim from "we don't
 * know".
 */
function StatusClock({ progress, size = 13 }: { progress: number | null; size?: number }) {
  const c = size / 2;
  // The wedge stops just short of the outline, so a finished clock still reads
  // as a ring with a full face rather than a flat disc.
  const wedgeRadius = c - size * 0.17;
  const inner = wedgeRadius / 2;
  const circumference = 2 * Math.PI * inner;
  const filled = progress === null ? 0 : Math.max(0, Math.min(1, progress));

  return (
    <svg
      className="allergen-clock"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      focusable="false"
    >
      <circle className="allergen-clock-track" cx={c} cy={c} r={c - 0.7} />
      {filled > 0 && (
        <circle
          className="allergen-clock-fill"
          cx={c}
          cy={c}
          r={inner}
          strokeWidth={inner * 2}
          strokeDasharray={`${filled * circumference} ${circumference}`}
          transform={`rotate(-90 ${c} ${c})`}
        />
      )}
    </svg>
  );
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

/** Spells out what the clock is showing, for the tooltip and for screen readers. */
function describeProgress(bar: AllergenBar): string {
  const base = STATUS_META[bar.status].help;
  if (bar.status !== 'testing') return base;
  if (bar.progress === null) return `${base} — monitoring window not recorded`;
  if (bar.progress >= 1) return 'Monitoring window complete — record the result';
  return `${base} — ${Math.round(bar.progress * 100)}% through the monitoring window`;
}

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
                <span className="allergen-status-pill" title={describeProgress(d)}>
                  <StatusClock progress={d.progress} />
                  {STATUS_META[d.status].label}
                  <span className="sr-only">. {describeProgress(d)}</span>
                </span>
                <span className="allergen-bar-count">{d.count}</span>
              </div>
            ))}
      </div>

      {!isEmpty && present.length > 0 && (
        <div className="allergen-legend">
          {present.map(s => (
            <span className={`allergen-legend-item allergen-bar-row--${s}`} key={s}>
              <StatusClock progress={s === 'testing' ? 0.45 : s === 'planned' ? 0 : s === 'untested' ? null : 1} size={11} />
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

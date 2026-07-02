import type { AllergenBar } from '../utils/parseInsights';
import { BarChartIcon } from './icons';

interface AllergenChartProps {
  data: AllergenBar[];
}

// Neutral, content-free rows used only to keep the chart's shape visible
// when the user has no real logged data yet — no invented allergen names.
const EMPTY_ROWS = 4;

export default function AllergenChart({ data }: AllergenChartProps) {
  const isEmpty = data.length === 0;
  const max = Math.max(1, ...data.map(d => d.count));

  return (
    <div className={`allergen-chart${isEmpty ? ' allergen-chart--placeholder' : ''}`}>
      <div className="allergen-chart-header">
        <BarChartIcon />
        <span>Allergen frequency</span>
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
              <div className="allergen-bar-row" key={d.label}>
                <span className="allergen-bar-label">{d.label}</span>
                <div className="allergen-bar-track">
                  <div
                    className="allergen-bar-fill"
                    style={{ width: `${Math.max(4, (d.count / max) * 100)}%` }}
                  />
                </div>
                <span className="allergen-bar-count">{d.count}</span>
              </div>
            ))}
      </div>

      {isEmpty && (
        <p className="allergen-chart-empty-note">
          No allergen data logged yet. Log a symptom, exposure, or test to see your trends here.
        </p>
      )}
    </div>
  );
}

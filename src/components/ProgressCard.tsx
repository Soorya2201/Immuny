import { getBig9Status } from '../utils/allergens';

interface ProgressCardProps {
  testedAllergens: string[];
  onClick: () => void;
}

export default function ProgressCard({ testedAllergens, onClick }: ProgressCardProps) {
  const statuses = getBig9Status(testedAllergens);
  const testedCount = statuses.filter(s => s.tested).length;
  const pct = (testedCount / statuses.length) * 100;

  return (
    <button className="progress-card" onClick={onClick}>
      <div className="progress-card-title">Progress</div>

      <div
        className="progress-card-bar-track"
        role="progressbar"
        aria-valuenow={testedCount}
        aria-valuemin={0}
        aria-valuemax={statuses.length}
      >
        <div className="progress-card-bar-fill" style={{ width: `${pct}%` }} />
        <div className="progress-card-bar-thumb" style={{ left: `${pct}%` }} />
      </div>

      <p className="progress-card-summary">
        {testedCount} out of {statuses.length} Top Allergens tested
      </p>

      <div className="progress-card-badges">
        {statuses.map(s => (
          <div key={s.name} className={`progress-badge${s.tested ? ' progress-badge--tested' : ''}`}>
            <span className="progress-badge-circle">{s.code}</span>
            <span className="progress-badge-label">{s.name}</span>
          </div>
        ))}
      </div>
    </button>
  );
}

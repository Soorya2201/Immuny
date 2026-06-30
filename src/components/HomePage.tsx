import { useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import type { Page } from '../types';
import beaImg from '../assets/bea.png';
import { formatRelativeTime } from '../utils/formatTime';

const client = generateClient<Schema>();

interface RecentEntry {
  id: string;
  type: string;
  name: string;
  time: string;
  severity?: number | null;
}

const TYPE_ICON: Record<string, string> = {
  Exposure: '🍽️',
  Symptom: '🤒',
  Medication: '💊',
};

const SEVERITY_COLOR = (v: number) =>
  v <= 3 ? '#22c55e' : v <= 6 ? '#f5c842' : '#ef4444';

interface HomePageProps {
  onNavigate: (page: Page) => void;
  userName?: string;
}

export default function HomePage({ onNavigate, userName }: HomePageProps) {
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await client.models.HealthEntry.list();
        if (data) {
          const sorted = [...data]
            .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
            .slice(0, 3)
            .map(d => ({
              id: d.id,
              type: d.type,
              name: d.name,
              time: d.time,
              severity: d.severity ?? null,
            }));
          setRecentEntries(sorted);
        }
      } catch (e) {
        console.warn('HomePage: failed to load recent entries', e);
      } finally {
        setLoadingRecent(false);
      }
    })();
  }, []);

  const greeting = userName ? `Hello, ${userName.split(' ')[0]}!` : "Hello, I'm Bea,";

  return (
    <div className="home-screen">
      {/* ── Gradient hero ── */}
      <div className="home-hero">
        <div className="home-rings">
          <div className="ring ring-1" />
          <div className="ring ring-2" />
        </div>
        <img src={beaImg} alt="Bea" className="bea-hero" />
        <p className="home-greeting">{greeting}</p>
        <h2 className="home-question">How can I help?</h2>
      </div>

      {/* ── Action tiles ── */}
      <div className="home-tiles">
        <button className="home-tile home-tile--tall" onClick={() => onNavigate('voice')}>
          <span className="tile-arrow">→</span>
          <span className="tile-label">voice chat with Bea</span>
        </button>

        <button className="home-tile" onClick={() => onNavigate('chat')}>
          <span className="tile-arrow">→</span>
          <span className="tile-label">text with Bea</span>
        </button>

        <button className="home-tile" onClick={() => onNavigate('insights')}>
          <span className="tile-arrow">→</span>
          <span className="tile-label">Bea's insight explanation</span>
        </button>
      </div>

      {/* ── Recent activity ── */}
      <div className="home-recent">
        <div className="home-recent-header">
          <span>Recent activity</span>
          <button onClick={() => onNavigate('symptom-logger')}>See all</button>
        </div>

        {loadingRecent ? (
          <div className="home-recent-loading">Loading…</div>
        ) : recentEntries.length === 0 ? (
          <div className="home-recent-empty">
            No entries yet.{' '}
            <button onClick={() => onNavigate('symptom-logger')} className="link-btn">
              Log your first entry →
            </button>
          </div>
        ) : (
          <div className="home-recent-list">
            {recentEntries.map(entry => (
              <div key={entry.id} className="home-recent-card">
                <span className="recent-icon">{TYPE_ICON[entry.type] ?? '📝'}</span>
                <div className="recent-details">
                  <span className="recent-name">{entry.name}</span>
                  {entry.severity != null && (
                    <span
                      className="recent-severity"
                      style={{ color: SEVERITY_COLOR(entry.severity) }}
                    >
                      {entry.severity}/10
                    </span>
                  )}
                </div>
                <span className="recent-time">{formatRelativeTime(entry.time)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Quick shortcuts ── */}
      <div className="home-shortcuts">
        <button className="home-shortcut" onClick={() => onNavigate('symptom-logger')}>
          📋 Health Logger
        </button>
        <button className="home-shortcut" onClick={() => onNavigate('exposure-testing')}>
          🧪 Exposure Testing
        </button>
      </div>
    </div>
  );
}

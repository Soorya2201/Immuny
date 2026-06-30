import { useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import type { Page } from '../types';
import beaImg from '../assets/bea.png';
import { buildDataSummary, parseInsights } from '../utils/parseInsights';
import type { InsightCard } from '../utils/parseInsights';

const client = generateClient<Schema>();

interface InsightsState {
  cards: InsightCard[];
  raw: string;
  hasData: boolean;
}

const NO_DATA_CARDS: InsightCard[] = [
  {
    emoji: '📋',
    label: 'Get started',
    text: 'Log your first symptom, exposure, or medication to unlock AI-powered pattern insights.',
  },
  {
    emoji: '💡',
    label: 'Tip',
    text: 'The more you log, the smarter Bea gets. Even 5–7 entries reveal meaningful patterns.',
  },
];

interface InsightsPageProps {
  onNavigate: (page: Page) => void;
}

export default function InsightsPage({ onNavigate }: InsightsPageProps) {
  const [state, setState] = useState<InsightsState>({ cards: [], raw: '', hasData: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ data: entries }, { data: tests }] = await Promise.all([
          client.models.HealthEntry.list(),
          client.models.ExposureTest.list(),
        ]);

        if (cancelled) return;

        const safeEntries = (entries ?? []).map(e => ({
          type: e.type,
          name: e.name,
          severity: e.severity ?? null,
          time: e.time,
        }));
        const safeTests = (tests ?? []).map(t => ({
          allergen: t.allergen,
          status: t.status,
          reactions: t.reactions ?? null,
        }));

        const summary = buildDataSummary(safeEntries, safeTests);

        if (summary === 'NO_DATA') {
          setState({ cards: NO_DATA_CARDS, raw: '', hasData: false });
          return;
        }

        const result = await client.queries.askNovaMicro({
          question:
            'Based on this health data, generate exactly 3 insights in this format — ' +
            'PATTERN: [one sentence] TREND: [one sentence] TIP: [one actionable sentence]. ' +
            'Be specific to the numbers provided. Keep each under 25 words.',
          history: '[]',
          context: `Health data summary: ${summary}`,
        });

        if (cancelled) return;

        const raw = String(result.data ?? '').trim();
        const cards = parseInsights(raw);
        setState({ cards, raw, hasData: true });
      } catch (err) {
        if (!cancelled) {
          console.error('InsightsPage error:', err);
          setError('Could not load insights. Please try again.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return (
    <div className="insights-screen">
      <div className="insights-top-bar">
        <button className="insights-back-btn" onClick={() => onNavigate('home')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h1 className="insights-title-text">Bea</h1>
        <div className="profile-dot" />
      </div>

      <div className="insights-body">
        <img src={beaImg} alt="Bea" className="insights-bea" />
        <h2 className="insights-heading">User Insight</h2>

        {loading ? (
          <div className="insights-loading">
            <div className="insights-spinner" />
            <p>Analyzing your health data…</p>
          </div>
        ) : error ? (
          <div className="insights-error">
            <p>{error}</p>
            <button onClick={() => window.location.reload()} className="insights-retry-btn">
              Retry
            </button>
          </div>
        ) : (
          <div className="insights-card">
            {state.cards.map((card, i) => (
              <div key={i} className="insight-row">
                <span className="insight-emoji">{card.emoji}</span>
                <p>
                  <strong>{card.label}:</strong> {card.text}
                </p>
              </div>
            ))}
            {state.hasData && (
              <p className="insights-summary-link">
                For more information view{' '}
                <button
                  className="link-btn"
                  onClick={() => onNavigate('symptom-logger')}
                >
                  Health Logger
                </button>
              </p>
            )}
          </div>
        )}

        <div className="insights-actions">
          <button
            className="insights-action-secondary"
            onClick={() => onNavigate('chat')}
          >
            Chat with AI <span>→</span>
          </button>
          <button
            className="insights-action-primary"
            onClick={() => onNavigate('chat')}
          >
            Chat with an Allergist
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import type { Page } from '../types';
import beaImg from '../assets/bea.png';
import { formatRelativeTime } from '../utils/formatTime';
import { getNextUpcoming } from '../utils/medications';
import type { TodayDoseEntry } from '../utils/medications';
import {
  ArrowRightIcon,
  ChatBubbleIcon,
  ClipboardIcon,
  ClockIcon,
  FlaskIcon,
  NoteIcon,
  PillIcon,
  SparkleIcon,
  ThermometerIcon,
  UtensilsIcon,
  WaveformIcon,
} from './icons';
import type { ComponentType } from 'react';

const client = generateClient<Schema>();

interface RecentEntry {
  id: string;
  type: string;
  name: string;
  time: string;
  severity?: number | null;
}

const TYPE_ICON: Record<string, ComponentType> = {
  Exposure: UtensilsIcon,
  Symptom: ThermometerIcon,
  Medication: PillIcon,
};

const SEVERITY_COLOR = (v: number) =>
  v <= 3 ? '#22c55e' : v <= 6 ? '#f5c842' : '#ef4444';

interface HomePageProps {
  onNavigate: (page: Page, tab?: string) => void;
  userName?: string;
}

export default function HomePage({ onNavigate, userName }: HomePageProps) {
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [nextMed, setNextMed] = useState<TodayDoseEntry | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await client.models.UserProfile.list();
        if (data && data.length > 0 && data[0].name) setProfileName(data[0].name);
      } catch (e) {
        console.warn('HomePage: failed to load profile name', e);
      }
    })();
  }, []);

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

  useEffect(() => {
    (async () => {
      try {
        const [{ data: meds }, { data: logs }] = await Promise.all([
          client.models.Medication.list(),
          client.models.MedicationLog.list(),
        ]);
        if (meds) {
          const mapped = meds.map(m => ({
            id: m.id,
            name: m.name,
            dose: m.dose ?? null,
            unit: m.unit ?? null,
            route: m.route ?? null,
            timeLabel: m.timeLabel ?? null,
            scheduledTime: m.scheduledTime ?? null,
            frequency: m.frequency ?? null,
            active: m.active ?? true,
            createdAt: m.createdAt ?? new Date().toISOString(),
          }));
          const mappedLogs = (logs ?? []).map(l => ({ id: l.id, medicationId: l.medicationId, takenAt: l.takenAt }));
          setNextMed(getNextUpcoming(mapped, mappedLogs, new Date()));
        }
      } catch (e) {
        console.warn('HomePage: failed to load medications', e);
      }
    })();
  }, []);

  // Prefer the saved profile name; fall back to the local part of the login
  // email (never show the raw email — it reads oddly as a "name").
  const displayName = profileName?.trim() || userName?.split('@')[0];
  const greeting = displayName ? `Hello, ${displayName.split(' ')[0]}!` : "Hello, I'm Bea,";

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

      {/* ── Next medication reminder ── */}
      {nextMed && (
        <button className="home-med-card" onClick={() => onNavigate('medications')}>
          <span className="home-med-icon"><ClockIcon /></span>
          <div className="home-med-info">
            <span className="home-med-label">Coming up {nextMed.medication.timeLabel ?? ''}</span>
            <span className="home-med-name">{nextMed.medication.name}</span>
            <span className="home-med-subtitle">
              {[nextMed.medication.dose, nextMed.medication.unit].filter(Boolean).join('')} {nextMed.medication.frequency ?? ''}
            </span>
          </div>
          <span className="home-med-arrow"><ArrowRightIcon /></span>
        </button>
      )}

      {/* ── Action tiles ── */}
      <div className="home-tiles">
        <button className="home-tile home-tile--tall" onClick={() => onNavigate('voice')}>
          <span className="tile-top-row">
            <span className="tile-icon"><WaveformIcon /></span>
            <span className="tile-arrow"><ArrowRightIcon /></span>
          </span>
          <span className="tile-label">voice chat with Bea</span>
        </button>

        <button className="home-tile" onClick={() => onNavigate('chat')}>
          <span className="tile-top-row">
            <span className="tile-icon"><ChatBubbleIcon /></span>
            <span className="tile-arrow"><ArrowRightIcon /></span>
          </span>
          <span className="tile-label">text with Bea</span>
        </button>

        <button className="home-tile" onClick={() => onNavigate('insights')}>
          <span className="tile-top-row">
            <span className="tile-icon"><SparkleIcon /></span>
            <span className="tile-arrow"><ArrowRightIcon /></span>
          </span>
          <span className="tile-label">Bea's insight explanation</span>
        </button>
      </div>

      {/* ── Recent activity ── */}
      <div className="home-recent">
        <div className="home-recent-header">
          <span>Recent activity</span>
          <button onClick={() => onNavigate('symptom-logger', 'History')}>See all</button>
        </div>

        {loadingRecent ? (
          <div className="home-recent-loading">Loading…</div>
        ) : recentEntries.length === 0 ? (
          <div className="home-recent-empty">
            No entries yet.{' '}
            <button onClick={() => onNavigate('symptom-logger')} className="link-btn">
              Log your first entry
            </button>
          </div>
        ) : (
          <div className="home-recent-list">
            {recentEntries.map(entry => {
              const Icon = TYPE_ICON[entry.type] ?? NoteIcon;
              return (
              <div key={entry.id} className="home-recent-card">
                <span className="recent-icon"><Icon /></span>
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
              );
            })}
          </div>
        )}
      </div>

      {/* ── Quick shortcuts ── */}
      <div className="home-shortcuts">
        <button className="home-shortcut" onClick={() => onNavigate('symptom-logger')}>
          <ClipboardIcon /> Health Logger
        </button>
        <button className="home-shortcut" onClick={() => onNavigate('exposure-testing')}>
          <FlaskIcon /> Exposure Testing
        </button>
      </div>
    </div>
  );
}

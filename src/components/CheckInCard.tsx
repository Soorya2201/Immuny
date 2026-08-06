import { useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { nextCheckInTime } from '../utils/voiceInterview';

const client = generateClient<Schema>();

export interface DueCheckIn {
  id: string;
  type: string;
  name: string;
  bodyArea?: string | null;
  notes?: string | null;
  time: string;
  followUpAt: string;
}

interface CheckInCardProps {
  items: DueCheckIn[];
  /** Called once an item is answered so the caller can drop it from its list. */
  onAnswered: (id: string) => void;
}

/** Picks up the check-ins the voice logger promised ("shall I check in tomorrow?"). */
export default function CheckInCard({ items, onAnswered }: CheckInCardProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  if (items.length === 0) return null;

  // One at a time — a stack of check-ins on the home screen is noise.
  const item = items[0];
  const label = item.bodyArea ? `${item.name.toLowerCase()} on your ${item.bodyArea.toLowerCase()}` : item.name.toLowerCase();
  const loggedOn = new Date(item.time).toLocaleDateString([], { weekday: 'long' });

  const appendNote = (suffix: string) =>
    [item.notes, suffix].filter(Boolean).join(' · ').slice(0, 500);

  const answer = async (outcome: 'resolved' | 'ongoing') => {
    setBusyId(item.id);
    const stamp = new Date().toLocaleDateString([], { dateStyle: 'medium' });
    try {
      await client.models.HealthEntry.update({
        id: item.id,
        followUpStatus: outcome,
        // Still there? Ask again tomorrow. Gone? Stop asking.
        followUpAt: outcome === 'ongoing' ? nextCheckInTime(new Date()) : undefined,
        // Answering "it's gone" is the moment we learn the episode ended. It's an
        // upper bound, not the exact end — 'confirmed-by' keeps the export honest
        // about that ("resolved within 26 h", never "resolved in 26 h").
        ...(outcome === 'resolved'
          ? { resolvedAt: new Date().toISOString(), resolvedPrecision: 'confirmed-by' }
          : {}),
        notes: appendNote(outcome === 'resolved' ? `Cleared up by ${stamp}` : `Still present on ${stamp}`),
      });
      onAnswered(item.id);
    } catch (e) {
      console.error('CheckInCard: failed to record check-in', e);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="checkin-card">
      <p className="checkin-title">Bea’s check-in</p>
      <p className="checkin-question">Is the {label} gone?</p>
      <p className="checkin-meta">You logged it on {loggedOn}.</p>
      <div className="checkin-actions">
        <button
          className="checkin-btn checkin-btn--gone"
          disabled={busyId === item.id}
          onClick={() => void answer('resolved')}
        >
          It’s gone
        </button>
        <button
          className="checkin-btn checkin-btn--still"
          disabled={busyId === item.id}
          onClick={() => void answer('ongoing')}
        >
          Still there
        </button>
      </div>
    </div>
  );
}

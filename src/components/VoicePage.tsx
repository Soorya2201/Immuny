import { useEffect, useRef, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import type { Page } from '../types';
import beaImg from '../assets/bea.png';
import { toLocalDatetimeInputValue } from '../utils/formatTime';

const client = generateClient<Schema>();

const GROQ_API_KEY = (import.meta.env.VITE_GROQ_API_KEY as string | undefined) ?? '';

type RecordingStatus =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'analyzing'
  | 'confirming'
  | 'saving'
  | 'done'
  | 'error';

interface ExtractedEntry {
  type: 'Symptom' | 'Exposure' | 'Medication';
  name: string;
  severity?: number | null;
  notes?: string | null;
}

interface VoicePageProps {
  onNavigate: (page: Page) => void;
}

const STATUS_LABEL: Record<RecordingStatus, string> = {
  idle: 'Tap the mic to log a health entry by voice',
  recording: 'Listening… tap to stop',
  transcribing: 'Transcribing your voice…',
  analyzing: 'Bea is understanding your entry…',
  confirming: 'Does this look correct?',
  saving: 'Saving to your health log…',
  done: 'Saved to your log!',
  error: 'Something went wrong',
};

const EXAMPLE_PROMPTS = [
  '"I have hives on my arm, severity 6 out of 10"',
  '"I just ate a peanut butter sandwich"',
  '"I took 25mg of Benadryl for my rash"',
];

function getSupportedMimeType(): string {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

async function transcribeWithGroq(blob: Blob, mimeType: string): Promise<string> {
  if (!GROQ_API_KEY) throw new Error('Groq API key not configured. Add VITE_GROQ_API_KEY to .env.local');
  const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
  const form = new FormData();
  form.append('file', blob, `recording.${ext}`);
  form.append('model', 'whisper-large-v3-turbo');
  form.append('language', 'en');
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Groq transcription failed (${res.status}): ${err}`);
  }
  const data = await res.json() as { text?: string };
  return (data.text ?? '').trim();
}

function parseExtractedEntries(raw: string): ExtractedEntry[] {
  const cleaned = raw.replace(/```json\n?|```\n?/g, '').trim();
  const start = cleaned.indexOf('{');
  if (start === -1) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(start)) as { entries?: unknown[] };
    const entries = parsed.entries ?? [];
    return entries.filter((e): e is ExtractedEntry => {
      if (typeof e !== 'object' || e === null) return false;
      const entry = e as Record<string, unknown>;
      return (
        (entry.type === 'Symptom' || entry.type === 'Exposure' || entry.type === 'Medication') &&
        typeof entry.name === 'string' &&
        entry.name.trim() !== ''
      );
    });
  } catch {
    return [];
  }
}

function WaveAnimation() {
  return (
    <div className="voice-wave" aria-hidden="true">
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} className={`voice-wave-bar voice-wave-bar--${i}`} />
      ))}
    </div>
  );
}

function Spinner() {
  return <div className="voice-spinner" aria-label="Loading" />;
}

export default function VoicePage({ onNavigate }: VoicePageProps) {
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [savedItems, setSavedItems] = useState<string[]>([]);
  const [pendingEntries, setPendingEntries] = useState<ExtractedEntry[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>('');

  useEffect(() => {
    return () => {
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== 'inactive') {
        rec.stop();
      }
      rec?.stream.getTracks().forEach(t => t.stop());
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const mimeType = getSupportedMimeType();
      mimeTypeRef.current = mimeType;
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => void handleRecordingComplete();
      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setStatus('recording');
      setTranscript('');
      setSavedItems([]);
      setErrorMsg('');
    } catch {
      setErrorMsg('Could not access microphone. Please check app permissions.');
      setStatus('error');
    }
  };

  const stopRecording = () => {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === 'inactive') return;
    rec.stop();
    rec.stream.getTracks().forEach(t => t.stop());
  };

  const handleRecordingComplete = async () => {
    const mimeType = mimeTypeRef.current || 'audio/webm';
    const blob = new Blob(chunksRef.current, { type: mimeType });

    if (blob.size < 500) {
      setErrorMsg('Recording too short — hold the mic button and speak clearly, then release.');
      setStatus('error');
      return;
    }

    try {
      setStatus('transcribing');
      const text = await transcribeWithGroq(blob, mimeType);
      setTranscript(text);

      if (!text) {
        setErrorMsg('Could not detect speech. Please speak clearly and try again.');
        setStatus('error');
        return;
      }

      setStatus('analyzing');
      const result = await client.queries.askNovaMicro({
        question:
          'Extract health entries from the transcript in context. ' +
          'Reply ONLY with valid JSON and no other text: ' +
          '{"entries":[{"type":"Symptom","name":"string","severity":1-10 or null,"notes":"string or null"}]}. ' +
          'Allowed types: Symptom, Exposure, Medication. If no health data found, return {"entries":[]}.',
        context: `Voice transcript: "${text}"`,
        history: '[]',
      });

      const raw = String(result.data ?? '').trim();
      const entries = parseExtractedEntries(raw);

      if (entries.length === 0) {
        setErrorMsg(
          `Heard: "${text.slice(0, 80)}${text.length > 80 ? '…' : ''}" — ` +
          'but no health data was found. Try saying something like "I have hives, severity 6 out of 10" or "I ate peanuts".',
        );
        setStatus('error');
        return;
      }

      // Show the extracted entries for confirmation before saving — lets the
      // user catch misheard audio instead of it silently landing in the log.
      setPendingEntries(entries);
      setStatus('confirming');
    } catch (err) {
      console.error('VoicePage error:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setStatus('error');
    }
  };

  const confirmSave = async () => {
    setStatus('saving');
    try {
      const now = toLocalDatetimeInputValue(new Date());
      const labels: string[] = [];
      for (const entry of pendingEntries) {
        await client.models.HealthEntry.create({
          type: entry.type,
          name: entry.name.trim(),
          severity: typeof entry.severity === 'number' ? entry.severity : undefined,
          notes: typeof entry.notes === 'string' && entry.notes.trim() ? entry.notes.trim() : undefined,
          time: now,
        });
        const sev = typeof entry.severity === 'number' ? ` (severity ${entry.severity})` : '';
        labels.push(`${entry.type}: ${entry.name}${sev}`);
      }
      setSavedItems(labels);
      setPendingEntries([]);
      setStatus('done');
    } catch (err) {
      console.error('VoicePage save error:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Could not save. Please try again.');
      setStatus('error');
    }
  };

  const discardPending = () => {
    setPendingEntries([]);
    setStatus('idle');
    setTranscript('');
  };

  const handleMicPress = () => {
    if (status === 'recording') {
      stopRecording();
    } else if (status === 'idle' || status === 'done' || status === 'error') {
      void startRecording();
    }
  };

  const isProcessing =
    status === 'transcribing' || status === 'analyzing' || status === 'saving' || status === 'confirming';

  return (
    <div className="voice-screen">
      <button className="back-dark" onClick={() => onNavigate('home')}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>

      <div className="voice-content">
        {/* Bea orb — pulses while recording */}
        <div className={`voice-orb ${status === 'recording' ? 'voice-orb--active' : ''}`}>
          <img src={beaImg} alt="Bea" style={{ width: 120, height: 120, objectFit: 'contain' }} />
        </div>

        {/* Wave animation shown only while recording */}
        {status === 'recording' && <WaveAnimation />}

        {/* Spinner shown during processing */}
        {isProcessing && <Spinner />}

        <p className="voice-status-label">{STATUS_LABEL[status]}</p>

        {/* Examples of what to say, shown while idle to help people know what to report */}
        {status === 'idle' && (
          <div className="voice-examples">
            <p className="voice-examples-title">Try saying something like:</p>
            {EXAMPLE_PROMPTS.map((ex, i) => (
              <p key={i} className="voice-example-item">{ex}</p>
            ))}
          </div>
        )}

        {/* Show what was heard */}
        {transcript && status !== 'idle' && (
          <p className="voice-transcript">"{transcript}"</p>
        )}

        {/* Confirmation step — review extracted entries before saving, so a
            misheard recording can be caught instead of silently logged. */}
        {status === 'confirming' && (
          <div className="voice-confirm-box">
            {pendingEntries.map((entry, i) => (
              <div key={i} className="voice-confirm-item">
                <span className="voice-confirm-type">{entry.type}</span>
                <span className="voice-confirm-name">
                  {entry.name}
                  {typeof entry.severity === 'number' ? ` — severity ${entry.severity}/10` : ''}
                </span>
              </div>
            ))}
            <div className="voice-confirm-actions">
              <button className="voice-confirm-btn voice-confirm-btn--yes" onClick={() => void confirmSave()}>
                Yes, save this
              </button>
              <button className="voice-confirm-btn voice-confirm-btn--no" onClick={discardPending}>
                No, try again
              </button>
            </div>
          </div>
        )}

        {/* Saved items list */}
        {status === 'done' && savedItems.length > 0 && (
          <div className="voice-saved-list">
            {savedItems.map((item, i) => (
              <div key={i} className="voice-saved-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span>{item}</span>
              </div>
            ))}
          </div>
        )}

        {/* Error message */}
        {status === 'error' && errorMsg && (
          <p className="voice-error-msg">{errorMsg}</p>
        )}
      </div>

      {/* Controls */}
      <div className="voice-controls">
        {/* Text chat shortcut */}
        <button
          className="voice-side-btn"
          onClick={() => onNavigate('chat')}
          title="Switch to text chat"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </button>

        {/* Main mic / action button */}
        <button
          className={[
            'voice-mic-btn',
            status === 'recording' ? 'voice-mic-btn--active' : '',
            status === 'done' ? 'voice-mic-btn--done' : '',
            isProcessing ? 'voice-mic-btn--disabled' : '',
          ].filter(Boolean).join(' ')}
          onClick={handleMicPress}
          disabled={isProcessing}
          title={status === 'recording' ? 'Tap to stop' : 'Tap to record'}
        >
          {status === 'done' ? (
            /* Checkmark when saved */
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          ) : (
            /* Mic icon */
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          )}
        </button>

        {/* View log shortcut */}
        <button
          className="voice-side-btn"
          onClick={() => onNavigate('symptom-logger')}
          title="View health log"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
        </button>
      </div>

      {/* Log another prompt shown after a successful save */}
      {status === 'done' && (
        <button className="voice-log-another" onClick={() => setStatus('idle')}>
          + Log another entry
        </button>
      )}

      <p className="voice-disclaimer">
        Immuny helps track experiences and patterns and does not provide medical advice.
      </p>
    </div>
  );
}

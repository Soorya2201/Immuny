import { useState, useRef, useEffect } from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../amplify/data/resource';
import '@aws-amplify/ui-react/styles.css';
import './App.css';
import immunyLogo from './assets/immuny-logo.png';

const client = generateClient<Schema>();

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

type Page = 'chat' | 'profile' | 'symptom-logger' | 'exposure-testing';

const OPENAI_API_KEY = 'YOUR_OPENAI_API_KEY';

// ─── STORAGE HELPERS ──────────────────────────────────────────────────────────

async function storageGet(key: string) {
  try {
    const r = await (window as any).storage.get(key);
    return r?.value ? JSON.parse(r.value) : null;
  } catch { return null; }
}

async function storageSet(key: string, value: any) {
  try {
    await (window as any).storage.set(key, JSON.stringify(value));
  } catch {}
}

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface HealthEntry {
  id: string;
  type: 'Exposure' | 'Symptom' | 'Medication';
  name: string;
  time: string;
  [key: string]: any;
}

interface ExposureTest {
  id: string;
  testName: string;
  allergen: string;
  amount: number;
  unit: string;
  servingContext: string;
  protocol: string;
  baselineSymptoms: string;
  testDate: string;
  testTime: string;
  monitoringDuration: string;
  reminders: string[];
  status: 'planned' | 'active' | 'completed';
  results?: string;
  reactions?: string;
  createdAt: string;
}

// ─── SYMPTOM LOGGER PAGE ──────────────────────────────────────────────────────

const EXPOSURE_TYPES = ['Meal', 'Product', 'Environmental', 'Other'];
const SYMPTOM_LIST = ['Hives', 'Swelling', 'Itching', 'Nausea', 'Vomiting', 'Stomach Pain', 'Difficulty Breathing', 'Dizziness', 'Headache', 'Rash', 'Other'];
const MED_ROUTES = ['Oral', 'Topical', 'Injectable', 'Inhaled'];
const ICONS: Record<string, string> = { Exposure: '🍽️', Symptom: '🤒', Medication: '💊' };

function formatTime(iso: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function SeverityBar({ value }: { value: number }) {
  const color = value <= 3 ? '#6abf8e' : value <= 6 ? '#f5c842' : '#DC2626';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
      <div style={{ flex: 1, height: 6, background: '#E9EDEF', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${value * 10}%`, height: '100%', background: color, borderRadius: 99 }} />
      </div>
      <span style={{ fontWeight: 700, color, minWidth: 18, fontSize: 13 }}>{value}</span>
    </div>
  );
}

function EntryCard({ entry, onDelete }: { entry: HealthEntry; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ border: '1px solid #E9EDEF', borderRadius: 8, padding: 12, marginBottom: 8, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, background: '#D1E7F4', color: '#4A7BA7', padding: '2px 8px', borderRadius: 12 }}>
              {ICONS[entry.type]} {entry.type}
            </span>
            {entry.subtype && <span style={{ fontSize: 11, color: '#999' }}>{entry.subtype}</span>}
          </div>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#111B21', marginBottom: 2 }}>
            {entry.name}
            {entry.dose && <span style={{ fontWeight: 400, color: '#667781', fontSize: 13 }}> — {entry.dose}{entry.unit} ({entry.route})</span>}
          </div>
          <div style={{ fontSize: 12, color: '#667781' }}>{formatTime(entry.time)}</div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setExpanded(!expanded)} style={{ background: 'none', border: '1px solid #E9EDEF', borderRadius: 4, width: 26, height: 26, cursor: 'pointer', fontSize: 11 }}>
            {expanded ? '▲' : '▼'}
          </button>
          <button onClick={onDelete} style={{ background: 'none', border: '1px solid #E9EDEF', borderRadius: 4, width: 26, height: 26, cursor: 'pointer', color: '#DC2626', fontSize: 11 }}>✕</button>
        </div>
      </div>
      {entry.severity && <SeverityBar value={entry.severity} />}
      {entry.tags?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
          {entry.tags.map((t: string, i: number) => (
            <span key={i} style={{ background: '#F0F2F5', border: '1px solid #E9EDEF', borderRadius: 12, padding: '2px 8px', fontSize: 11, color: '#667781' }}>{t}</span>
          ))}
        </div>
      )}
      {expanded && (entry.notes || entry.details || entry.reason || entry.bodyArea) && (
        <div style={{ marginTop: 8, padding: 10, background: '#F0F2F5', borderRadius: 6, fontSize: 13, color: '#3B4A54', borderTop: '1px solid #E9EDEF' }}>
          {entry.bodyArea && <div>📍 {entry.bodyArea}</div>}
          {entry.notes || entry.details || entry.reason}
        </div>
      )}
    </div>
  );
}

function SymptomLoggerPage() {
  const now = new Date();
  const [activeTab, setActiveTab] = useState<'Exposure' | 'Symptom' | 'Medication' | 'History'>('Exposure');
  const [entries, setEntries] = useState<HealthEntry[]>([]);
  const [historyFilter, setHistoryFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [loaded, setLoaded] = useState(false);

  // Voice
  const [listening, setListening] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const recRef = useRef<any>(null);
  const voiceSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;

  // Exposure form
  const [expType, setExpType] = useState('Meal');
  const [expName, setExpName] = useState('');
  const [expTags, setExpTags] = useState('');
  const [expDetails, setExpDetails] = useState('');
  const [expTime, setExpTime] = useState(now.toISOString().slice(0, 16));

  // Symptom form
  const [symName, setSymName] = useState('');
  const [symCustom, setSymCustom] = useState('');
  const [symSeverity, setSymSeverity] = useState(5);
  const [symBody, setSymBody] = useState('');
  const [symNotes, setSymNotes] = useState('');
  const [symTime, setSymTime] = useState(now.toISOString().slice(0, 16));

  // Medication form
  const [medName, setMedName] = useState('');
  const [medDose, setMedDose] = useState('');
  const [medUnit, setMedUnit] = useState('mg');
  const [medRoute, setMedRoute] = useState('Oral');
  const [medReason, setMedReason] = useState('');
  const [medNotes, setMedNotes] = useState('');
  const [medTime, setMedTime] = useState(now.toISOString().slice(0, 16));

  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    (async () => {
      const data = await storageGet('immuny-health-entries');
      if (data) setEntries(data);
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    storageSet('immuny-health-entries', entries);
  }, [entries, loaded]);

  const addEntry = (entry: Omit<HealthEntry, 'id'>) => {
    const e = { ...entry, id: Date.now().toString() } as HealthEntry;
    setEntries(prev => [...prev, e]);
    setSavedMsg('✅ Saved!');
    setTimeout(() => setSavedMsg(''), 2000);
  };

  const deleteEntry = (id: string) => {
    if (!confirm('Delete this entry?')) return;
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const startVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = false; rec.lang = 'en-US';
    rec.onresult = (e: any) => setVoiceText(e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.start(); recRef.current = rec; setListening(true);
  };

  const stopVoice = () => { recRef.current?.stop(); setListening(false); };

  const filteredEntries = entries
    .filter(e => historyFilter === 'All' || e.type === historyFilter)
    .filter(e => !search || e.name?.toLowerCase().includes(search.toLowerCase()) ||
      e.tags?.some((t: string) => t.toLowerCase().includes(search.toLowerCase())))
    .slice().reverse();

  return (
    <div className="page-container">
      <h2>📋 Health Logger</h2>

      {/* Voice Bar */}
      <div style={{ background: '#F0F2F5', borderRadius: 8, padding: 12, marginBottom: 20, border: '1px solid #E9EDEF' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: voiceText ? 10 : 0 }}>
          <button onClick={listening ? stopVoice : startVoice} className="save-btn"
            style={{ padding: '8px 16px', fontSize: 13, background: listening ? '#DC2626' : '#4A7BA7' }}>
            {listening ? '⏹ Stop' : '🎙️ Voice Log'}
          </button>
          {!voiceSupported && <span style={{ fontSize: 12, color: '#DC2626' }}>Voice not supported</span>}
          {listening && <span style={{ fontSize: 12, color: '#4A7BA7', fontWeight: 600 }}>● Listening...</span>}
        </div>
        {voiceText && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1, background: '#fff', border: '1px solid #E9EDEF', borderRadius: 6, padding: '8px 12px', fontSize: 13 }}>"{voiceText}"</div>
            <button className="save-btn" style={{ padding: '8px 12px', fontSize: 12, whiteSpace: 'nowrap' }}
              onClick={() => setVoiceText('')}>Clear</button>
          </div>
        )}
        <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>💡 Speak your entry, then fill the form below</div>
      </div>

      {/* Tab Nav */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #E9EDEF', paddingBottom: 0 }}>
        {(['Exposure', 'Symptom', 'Medication', 'History'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: 600, fontSize: 13, color: activeTab === t ? '#4A7BA7' : '#667781',
            borderBottom: activeTab === t ? '2px solid #4A7BA7' : '2px solid transparent',
            marginBottom: -2
          }}>
            {t === 'Exposure' ? '🍽️' : t === 'Symptom' ? '🤒' : t === 'Medication' ? '💊' : '📋'} {t}
            {t === 'History' && ` (${entries.length})`}
          </button>
        ))}
      </div>

      {savedMsg && (
        <div style={{ background: '#D1E7F4', border: '1px solid #4A7BA7', borderRadius: 6, padding: '10px 16px', marginBottom: 16, color: '#4A7BA7', fontWeight: 600 }}>
          {savedMsg}
        </div>
      )}

      {/* ── Exposure Form ── */}
      {activeTab === 'Exposure' && (
        <div>
          {voiceText && <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 6, padding: 10, marginBottom: 16, fontSize: 13 }}>🎙️ Voice: <strong>"{voiceText}"</strong></div>}
          <div style={{ display: 'flex', gap: 16 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Type of Exposure</label>
              <select value={expType} onChange={e => setExpType(e.target.value)} style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 15 }}>
                {EXPOSURE_TYPES.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label>Name / Description</label>
              <input className="form-group input" type="text" value={expName} onChange={e => setExpName(e.target.value)} placeholder="e.g., Chicken Caesar Salad"
                style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 15 }} />
            </div>
          </div>
          <div className="form-group">
            <label>Ingredients / Tags (comma-separated)</label>
            <input type="text" value={expTags} onChange={e => setExpTags(e.target.value)} placeholder="e.g., chicken, lettuce, peanuts"
              style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 15 }} />
          </div>
          <div className="form-group">
            <label>Additional Details</label>
            <textarea value={expDetails} onChange={e => setExpDetails(e.target.value)} placeholder="Any extra notes..." rows={2}
              style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 15, fontFamily: 'inherit', resize: 'vertical' }} />
          </div>
          <div className="form-group">
            <label>Date & Time</label>
            <input type="datetime-local" value={expTime} onChange={e => setExpTime(e.target.value)}
              style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 15 }} />
          </div>
          <button className="save-btn" onClick={() => {
            if (!expName.trim()) return alert('Please enter a name.');
            addEntry({ type: 'Exposure', subtype: expType, name: expName, tags: expTags.split(',').map(t => t.trim()).filter(Boolean), details: expDetails, time: expTime });
            setExpName(''); setExpTags(''); setExpDetails('');
          }}>✅ Log Exposure</button>
        </div>
      )}

      {/* ── Symptom Form ── */}
      {activeTab === 'Symptom' && (
        <div>
          {voiceText && <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 6, padding: 10, marginBottom: 16, fontSize: 13 }}>🎙️ Voice: <strong>"{voiceText}"</strong></div>}
          <div className="form-group">
            <label>Symptom</label>
            <select value={symName} onChange={e => setSymName(e.target.value)}
              style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 15 }}>
              <option value="">Select symptom...</option>
              {SYMPTOM_LIST.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          {symName === 'Other' && (
            <div className="form-group">
              <label>Describe Symptom</label>
              <input type="text" value={symCustom} onChange={e => setSymCustom(e.target.value)} placeholder="e.g., Throat tightness"
                style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 15 }} />
            </div>
          )}
          <div className="form-group">
            <label>Severity: {symSeverity}/10</label>
            <input type="range" min="1" max="10" value={symSeverity} onChange={e => setSymSeverity(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#4A7BA7' }} />
            <SeverityBar value={symSeverity} />
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Body Area (optional)</label>
              <input type="text" value={symBody} onChange={e => setSymBody(e.target.value)} placeholder="e.g., Face, Hands"
                style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 15 }} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Date & Time</label>
              <input type="datetime-local" value={symTime} onChange={e => setSymTime(e.target.value)}
                style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 15 }} />
            </div>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea value={symNotes} onChange={e => setSymNotes(e.target.value)} placeholder="Additional observations..." rows={2}
              style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 15, fontFamily: 'inherit', resize: 'vertical' }} />
          </div>
          <button className="save-btn" onClick={() => {
            const name = symName === 'Other' ? symCustom : symName;
            if (!name) return alert('Please select a symptom.');
            addEntry({ type: 'Symptom', name, severity: symSeverity, bodyArea: symBody, notes: symNotes, time: symTime });
            setSymName(''); setSymCustom(''); setSymSeverity(5); setSymBody(''); setSymNotes('');
          }}>✅ Log Symptom</button>
        </div>
      )}

      {/* ── Medication Form ── */}
      {activeTab === 'Medication' && (
        <div>
          {voiceText && <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 6, padding: 10, marginBottom: 16, fontSize: 13 }}>🎙️ Voice: <strong>"{voiceText}"</strong></div>}
          <div className="form-group">
            <label>Medication Name</label>
            <input type="text" value={medName} onChange={e => setMedName(e.target.value)} placeholder="e.g., Benadryl, EpiPen"
              style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 15 }} />
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Dose</label>
              <input type="text" value={medDose} onChange={e => setMedDose(e.target.value)} placeholder="25"
                style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 15 }} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Unit</label>
              <select value={medUnit} onChange={e => setMedUnit(e.target.value)}
                style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 15 }}>
                {['mg', 'ml', 'mcg', 'units', 'puffs'].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Route</label>
              <select value={medRoute} onChange={e => setMedRoute(e.target.value)}
                style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 15 }}>
                {MED_ROUTES.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Reason (optional)</label>
            <input type="text" value={medReason} onChange={e => setMedReason(e.target.value)} placeholder="e.g., Allergic reaction"
              style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 15 }} />
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea value={medNotes} onChange={e => setMedNotes(e.target.value)} placeholder="Additional notes..." rows={2}
              style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 15, fontFamily: 'inherit', resize: 'vertical' }} />
          </div>
          <div className="form-group">
            <label>Date & Time</label>
            <input type="datetime-local" value={medTime} onChange={e => setMedTime(e.target.value)}
              style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 15 }} />
          </div>
          <button className="save-btn" onClick={() => {
            if (!medName.trim()) return alert('Please enter medication name.');
            addEntry({ type: 'Medication', name: medName, dose: medDose, unit: medUnit, route: medRoute, reason: medReason, notes: medNotes, time: medTime });
            setMedName(''); setMedDose(''); setMedReason(''); setMedNotes('');
          }}>✅ Log Medication</button>
        </div>
      )}

      {/* ── History ── */}
      {activeTab === 'History' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {['All', 'Exposure', 'Symptom', 'Medication'].map(f => (
              <button key={f} onClick={() => setHistoryFilter(f)} style={{
                padding: '6px 14px', borderRadius: 20, border: '1px solid #E9EDEF', cursor: 'pointer',
                fontWeight: 600, fontSize: 12, background: historyFilter === f ? '#4A7BA7' : '#F0F2F5',
                color: historyFilter === f ? '#fff' : '#667781'
              }}>
                {f === 'All' ? f : `${ICONS[f]} ${f}`}
              </button>
            ))}
          </div>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search entries..."
            style={{ width: '100%', padding: 10, border: '1px solid #E9EDEF', borderRadius: 8, marginBottom: 16, fontSize: 14 }} />
          <div style={{ fontSize: 12, color: '#667781', marginBottom: 12 }}>{filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'}</div>
          {filteredEntries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#ccc' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
              No entries found
            </div>
          ) : filteredEntries.map(e => <EntryCard key={e.id} entry={e} onDelete={() => deleteEntry(e.id)} />)}
        </div>
      )}
    </div>
  );
}

// ─── EXPOSURE TESTING PAGE ────────────────────────────────────────────────────

const SAFETY_CHECKS = [
  { id: 'provider', label: 'Healthcare provider has approved this test' },
  { id: 'emergency', label: 'Emergency medication is within reach' },
  { id: 'someone', label: 'Someone else is present or aware' },
  { id: 'baseline', label: 'Current symptoms are at baseline' },
  { id: 'controlled', label: 'Testing in controlled environment' },
  { id: 'document', label: 'Ready to document all reactions' },
];

const REMINDER_OPTIONS = ['5 min', '15 min', '30 min', '1 hour', '2 hours', '4 hours'];
const DURATION_OPTIONS = ['1 hour', '2 hours', '4 hours', '8 hours', '12 hours', '24 hours'];

function ExposureTestingPage() {
  const now = new Date();
  const [activeTab, setActiveTab] = useState<'new' | 'results' | 'history'>('new');
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [tests, setTests] = useState<ExposureTest[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Form state
  const [testName, setTestName] = useState('');
  const [allergen, setAllergen] = useState('');
  const [amount, setAmount] = useState('1.00');
  const [unit, setUnit] = useState('grams');
  const [servingContext, setServingContext] = useState('');
  const [protocol, setProtocol] = useState('');
  const [baselineSymptoms, setBaselineSymptoms] = useState('');
  const [testDate, setTestDate] = useState(now.toISOString().slice(0, 10));
  const [testTime, setTestTime] = useState(now.toTimeString().slice(0, 5));
  const [monitoringDuration, setMonitoringDuration] = useState('8 hours');
  const [reminders, setReminders] = useState<string[]>(['15 min', '30 min', '1 hour', '2 hours']);

  // Results state
  const [selectedTestId, setSelectedTestId] = useState('');
  const [results, setResults] = useState('');
  const [reactions, setReactions] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    (async () => {
      const data = await storageGet('immuny-exposure-tests');
      if (data) setTests(data);
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    storageSet('immuny-exposure-tests', tests);
  }, [tests, loaded]);

  const allChecked = SAFETY_CHECKS.every(c => checks[c.id]);

  const toggleCheck = (id: string) => setChecks(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleReminder = (r: string) => setReminders(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);

  const startTest = () => {
    if (!allChecked) return alert('Please complete all safety checks first.');
    if (!testName.trim() || !allergen.trim()) return alert('Please enter test name and allergen.');
    const test: ExposureTest = {
      id: Date.now().toString(),
      testName, allergen, amount: parseFloat(amount), unit, servingContext,
      protocol, baselineSymptoms, testDate, testTime, monitoringDuration,
      reminders, status: 'active', createdAt: new Date().toISOString()
    };
    setTests(prev => [...prev, test]);
    setSavedMsg('✅ Test started and saved!');
    setTimeout(() => setSavedMsg(''), 2000);
    setTestName(''); setAllergen(''); setAmount('1.00'); setServingContext('');
    setProtocol(''); setBaselineSymptoms('');
    setActiveTab('results');
  };

  const saveResults = () => {
    if (!selectedTestId) return alert('Please select a test.');
    setTests(prev => prev.map(t => t.id === selectedTestId ? { ...t, results, reactions, status: 'completed' as const } : t));
    setSavedMsg('✅ Results saved!');
    setTimeout(() => setSavedMsg(''), 2000);
    setResults(''); setReactions(''); setSelectedTestId('');
  };

  const deleteTest = (id: string) => {
    if (!confirm('Delete this test?')) return;
    setTests(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div className="page-container">
      <h2> Exposure Testing</h2>

      {/* Safety Warning */}
      <div style={{ border: '2px solid #DC2626', borderRadius: 8, padding: 16, marginBottom: 20, background: '#FFF5F5', textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#DC2626', marginBottom: 8 }}>IMPORTANT SAFETY WARNING </div>
        <p style={{ fontSize: 13, color: '#555', margin: '4px 0' }}>This is an experimental feature for controlled exposure testing under medical supervision.</p>
        <p style={{ fontSize: 13, color: '#555', margin: '4px 0' }}>ALWAYS consult your healthcare professional before performing any exposure tests</p>
        <p style={{ fontSize: 13, color: '#555', margin: '4px 0' }}>ALWAYS have your emergency medication nearby during testing</p>
        <p style={{ fontSize: 13, color: '#555', margin: '4px 0' }}>Stop immediately if you experience severe symptoms and seek medical attention</p>
      </div>

      {/* Safety Checklist */}
      <div style={{ border: '1px solid #E9EDEF', borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: '#3B4A54' }}>🛡️ Safety Checklist — Complete Before Testing</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {SAFETY_CHECKS.map(c => (
            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={!!checks[c.id]} onChange={() => toggleCheck(c.id)}
                style={{ width: 16, height: 16, accentColor: '#4A7BA7' }} />
              <span style={{ color: checks[c.id] ? '#4A7BA7' : '#667781' }}>{c.label}</span>
            </label>
          ))}
        </div>
        {allChecked && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: '#D1E7F4', borderRadius: 6, color: '#4A7BA7', fontWeight: 600, fontSize: 13 }}>
            ✅ All safety requirements met — you may proceed with testing
          </div>
        )}
        {!allChecked && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: '#FFF3CD', borderRadius: 6, color: '#856404', fontWeight: 600, fontSize: 13 }}>
            ⚠️ Please complete all safety checks before starting a test
          </div>
        )}
      </div>

      {savedMsg && (
        <div style={{ background: '#D1E7F4', border: '1px solid #4A7BA7', borderRadius: 6, padding: '10px 16px', marginBottom: 16, color: '#4A7BA7', fontWeight: 600 }}>
          {savedMsg}
        </div>
      )}

      {/* Tab Nav */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #E9EDEF' }}>
        {(['new', 'results', 'history'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: 600, fontSize: 13, color: activeTab === t ? '#4A7BA7' : '#667781',
            borderBottom: activeTab === t ? '2px solid #4A7BA7' : '2px solid transparent',
            marginBottom: -2
          }}>
            {t === 'new' ? ' New Test' : t === 'results' ? ' Test Results' : ` History (${tests.length})`}
          </button>
        ))}
      </div>

      {/* ── New Test Form ── */}
      {activeTab === 'new' && (
        <div style={{ opacity: allChecked ? 1 : 0.5, pointerEvents: allChecked ? 'auto' : 'none' }}>
          {!allChecked && (
            <div style={{ textAlign: 'center', padding: 16, color: '#DC2626', fontWeight: 600, fontSize: 13, marginBottom: 16 }}>
              🔒 Complete all safety checks above to unlock this form
            </div>
          )}

          <h3 style={{ color: '#4A7BA7', marginBottom: 16, fontSize: 16 }}> Design Exposure Test</h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Left column */}
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: '#3B4A54', borderBottom: '1px solid #E9EDEF', paddingBottom: 8 }}>Test Setup</div>
              <div className="form-group">
                <label>Test Name</label>
                <input type="text" value={testName} onChange={e => setTestName(e.target.value)} placeholder="e.g., 'Peanut Challenge - 1g'"
                  style={{ width: '100%', padding: 10, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 14 }} />
              </div>
              <div className="form-group">
                <label>Allergen/Substance</label>
                <input type="text" value={allergen} onChange={e => setAllergen(e.target.value)} placeholder="e.g., 'Peanuts'"
                  style={{ width: '100%', padding: 10, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 14 }} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, margin: '16px 0 12px', color: '#3B4A54', borderBottom: '1px solid #E9EDEF', paddingBottom: 8 }}>Dosage Information</div>
              <div className="form-group">
                <label>Amount</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => setAmount(a => String(Math.max(0.25, parseFloat(a) - 0.25)))}
                    style={{ padding: '8px 12px', border: '1px solid #E9EDEF', borderRadius: 6, cursor: 'pointer', background: '#F0F2F5' }}>−</button>
                  <input type="number" value={amount} onChange={e => setAmount(e.target.value)} step="0.25" min="0"
                    style={{ flex: 1, padding: 10, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 14, textAlign: 'center' }} />
                  <button onClick={() => setAmount(a => String(parseFloat(a) + 0.25))}
                    style={{ padding: '8px 12px', border: '1px solid #E9EDEF', borderRadius: 6, cursor: 'pointer', background: '#F0F2F5' }}>+</button>
                </div>
              </div>
              <div className="form-group">
                <label>Unit</label>
                <select value={unit} onChange={e => setUnit(e.target.value)}
                  style={{ width: '100%', padding: 10, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 14 }}>
                  {['grams', 'mg', 'ml', 'tsp', 'tbsp', 'pieces', 'servings'].map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Serving Context</label>
                <input type="text" value={servingContext} onChange={e => setServingContext(e.target.value)} placeholder="e.g., '1/4 peanut butter sandwich'"
                  style={{ width: '100%', padding: 10, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 14 }} />
              </div>
            </div>

            {/* Right column */}
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: '#3B4A54', borderBottom: '1px solid #E9EDEF', paddingBottom: 8 }}>Timing & Monitoring</div>
              <div className="form-group">
                <label>Test Date</label>
                <input type="date" value={testDate} onChange={e => setTestDate(e.target.value)}
                  style={{ width: '100%', padding: 10, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 14 }} />
              </div>
              <div className="form-group">
                <label>Test Time</label>
                <input type="time" value={testTime} onChange={e => setTestTime(e.target.value)}
                  style={{ width: '100%', padding: 10, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 14 }} />
              </div>
              <div className="form-group">
                <label>Monitoring Duration</label>
                <select value={monitoringDuration} onChange={e => setMonitoringDuration(e.target.value)}
                  style={{ width: '100%', padding: 10, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 14 }}>
                  {DURATION_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Symptom Check Reminders</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {REMINDER_OPTIONS.map(r => (
                    <button key={r} onClick={() => toggleReminder(r)} style={{
                      padding: '4px 10px', borderRadius: 16, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                      background: reminders.includes(r) ? '#DC2626' : '#F0F2F5',
                      color: reminders.includes(r) ? '#fff' : '#667781'
                    }}>
                      {r} {reminders.includes(r) ? '×' : '+'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Protocol */}
          <div style={{ fontWeight: 700, fontSize: 14, margin: '16px 0 12px', color: '#3B4A54', borderBottom: '1px solid #E9EDEF', paddingBottom: 8 }}>Test Protocol</div>
          <div className="form-group">
            <label>Detailed Protocol</label>
            <textarea value={protocol} onChange={e => setProtocol(e.target.value)} rows={3}
              placeholder="Describe exactly how the test will be conducted, including preparation, administration, and monitoring procedures..."
              style={{ width: '100%', padding: 10, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }} />
          </div>
          <div className="form-group">
            <label>Baseline Symptoms (before test)</label>
            <textarea value={baselineSymptoms} onChange={e => setBaselineSymptoms(e.target.value)} rows={2}
              placeholder="Document any existing symptoms before starting the test..."
              style={{ width: '100%', padding: 10, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }} />
          </div>
          <button className="save-btn" onClick={startTest} style={{ padding: '12px 24px', fontSize: 15 }}>Start Exposure Test</button>
        </div>
      )}

      {/* ── Results Form ── */}
      {activeTab === 'results' && (
        <div>
          <h3 style={{ color: '#4A7BA7', marginBottom: 16, fontSize: 16 }}>📊 Record Test Results</h3>
          <div className="form-group">
            <label>Select Test</label>
            <select value={selectedTestId} onChange={e => setSelectedTestId(e.target.value)}
              style={{ width: '100%', padding: 10, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 14 }}>
              <option value="">Choose a test...</option>
              {tests.filter(t => t.status === 'active').map(t => (
                <option key={t.id} value={t.id}>{t.testName} — {t.allergen} ({t.testDate})</option>
              ))}
            </select>
          </div>
          {tests.filter(t => t.status === 'active').length === 0 && (
            <div style={{ color: '#667781', fontSize: 13, padding: '12px 16px', background: '#F0F2F5', borderRadius: 8, marginBottom: 16 }}>
              No active tests. Start a new test first.
            </div>
          )}
          <div className="form-group">
            <label>Results / Observations</label>
            <textarea value={results} onChange={e => setResults(e.target.value)} rows={4}
              placeholder="Describe the outcome of the exposure test, any observations, patient response..."
              style={{ width: '100%', padding: 10, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }} />
          </div>
          <div className="form-group">
            <label>Reactions (if any)</label>
            <textarea value={reactions} onChange={e => setReactions(e.target.value)} rows={3}
              placeholder="Document any allergic reactions, symptoms that appeared, severity..."
              style={{ width: '100%', padding: 10, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }} />
          </div>
          <button className="save-btn" onClick={saveResults}>✅ Save Results</button>
        </div>
      )}

      {/* ── History ── */}
      {activeTab === 'history' && (
        <div>
          <h3 style={{ color: '#4A7BA7', marginBottom: 16, fontSize: 16 }}>📋 Testing History</h3>
          {tests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#ccc' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🧫</div>
              No tests recorded yet
            </div>
          ) : tests.slice().reverse().map(t => (
            <div key={t.id} style={{ border: '1px solid #E9EDEF', borderRadius: 8, padding: 14, marginBottom: 10, background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#111B21' }}>{t.testName}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
                      background: t.status === 'completed' ? '#D4EDDA' : t.status === 'active' ? '#D1E7F4' : '#FFF3CD',
                      color: t.status === 'completed' ? '#155724' : t.status === 'active' ? '#4A7BA7' : '#856404'
                    }}>
                      {t.status === 'completed' ? '✅ Completed' : t.status === 'active' ? '⏳ Active' : '📋 Planned'}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#667781' }}>🧪 {t.allergen} · {t.amount}{t.unit} · {t.testDate}</div>
                  {t.results && <div style={{ fontSize: 13, color: '#3B4A54', marginTop: 6, padding: '8px', background: '#F0F2F5', borderRadius: 6 }}>{t.results}</div>}
                  {t.reactions && <div style={{ fontSize: 13, color: '#DC2626', marginTop: 4, padding: '8px', background: '#FFF5F5', borderRadius: 6 }}>⚠️ {t.reactions}</div>}
                </div>
                <button onClick={() => deleteTest(t.id)}
                  style={{ background: 'none', border: '1px solid #E9EDEF', borderRadius: 4, width: 26, height: 26, cursor: 'pointer', color: '#DC2626', fontSize: 11, flexShrink: 0 }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}




function renderMarkdown(text: string): React.ReactNode {
  // Split into lines first
  const lines = text.split('\n');
  
  return lines.map((line, lineIndex) => {
    // Process inline markdown for each line
    const parts: React.ReactNode[] = [];
    
    // Pattern: **bold**, *italic*, numbered lists
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
    let lastIndex = 0;
    let match;
    
    while ((match = regex.exec(line)) !== null) {
      // Add text before match
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }
      
      if (match[0].startsWith('**')) {
        // Bold
        parts.push(<strong key={`${lineIndex}-${match.index}`}>{match[2]}</strong>);
      } else {
        // Italic
        parts.push(<em key={`${lineIndex}-${match.index}`}>{match[3]}</em>);
      }
      
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }

    // Handle numbered list items
    const isNumbered = /^\d+\.\s/.test(line);
    
    return (
      <span key={lineIndex}>
        {isNumbered ? (
          <span style={{ display: 'block', paddingLeft: 8, marginBottom: 4 }}>
            {parts.length > 0 ? parts : line}
          </span>
        ) : (
          <span style={{ display: 'block', marginBottom: line === '' ? 8 : 2 }}>
            {parts.length > 0 ? parts : line}
          </span>
        )}
      </span>
    );
  });
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState<Page>('chat');
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
      const defaultVoice = voices.find(v => v.lang.startsWith('en-')) || voices[0];
      setSelectedVoice(defaultVoice);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      if (selectedVoice) utterance.voice = selectedVoice;
      utterance.rate = 0.9;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  const transcribeAudioWithWhisper = async (audioBlob: Blob) => {
    setTranscribing(true);
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', 'whisper-1');
      formData.append('language', 'en');
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        body: formData,
      });
      if (!response.ok) throw new Error('Transcription failed');
      const data = await response.json();
      setInputText(data.text);
    } catch {
      alert('Failed to transcribe. Check your OpenAI API key.');
    } finally {
      setTranscribing(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => { audioChunksRef.current.push(event.data); };
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        await transcribeAudioWithWhisper(audioBlob);
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      alert('Could not access microphone');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const cleanModelOutput = (raw: string): string => {
  let text = raw;

  // Remove "user ... model" prefix (everything before actual response)
  text = text.replace(/^user[\s\S]*?model\s*/i, '');

  // Remove <unusedXX>thought blocks
  text = text.replace(/<unused\d+>thought\s*/gi, '');

  // Remove full "Thinking Process: 1. 2. 3..." blocks
  text = text.replace(/Thinking Process:[\s\S]*?(?=\n\nEssentially|\n\nIn summary|\n\nSo,|\n\n[A-Z][a-z]|$)/i, '');

  // Remove any remaining <tokens>
  text = text.replace(/<[^>]+>/g, '');

  // Remove leftover "model" at start
  text = text.replace(/^model\s*/i, '');

  // Collapse 3+ newlines into 2
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim() || 'I could not generate a response. Please try again.';
};

  const sendMessage = async () => {
  if (!inputText.trim() || loading) return;
  const userMessage: Message = { 
    id: Date.now().toString(), 
    role: 'user', 
    content: inputText.trim(), 
    timestamp: new Date() 
  };
  setMessages(prev => [...prev, userMessage]);
  setInputText('');
  setLoading(true);
  
  try {
    const result = await client.queries.askMedGemma({ question: userMessage.content });
    const rawResponse = result.data || 'I apologize, but I could not generate a response.';
    
    // ✅ Clean the raw model output
    const cleanResponse = cleanModelOutput(typeof rawResponse === 'string' ? rawResponse : String(rawResponse));
    
    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(), 
      role: 'assistant',
      content: cleanResponse,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, assistantMessage]);
    speakText(assistantMessage.content);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    setLoading(false);
  }
};

  const navigateTo = (page: Page) => { setCurrentPage(page); setMenuOpen(false); };

  const renderChat = () => (
    <>
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="empty-chat">
            <img src={immunyLogo} alt="Immuny" className="bot-logo-large" />
            <h2>Immuny</h2>
            <p className="tagline">ALLERGY AI ALLY</p>
            <p className="subtitle">How are you feeling today?</p>
            <div className="quick-actions">
              <button onClick={() => setInputText('Any allergy symptoms to check on?')}>🤧 Check allergies</button>
              <button onClick={() => setInputText("Don't switch to strawberries?")}>🍓 Food allergies</button>
              <button onClick={() => setInputText('What do you have for lunch?')}>🍽️ Lunch advice</button>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`message-bubble ${msg.role}`}>
              {msg.role === 'assistant' && <img src={immunyLogo} alt="Immuny" className="message-avatar" />}
              <div className="message-content">
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {renderMarkdown(msg.content)}
                </div>
                <span className="message-time">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="message-bubble assistant">
            <img src={immunyLogo} alt="Immuny" className="message-avatar" />
            <div className="message-content typing"><span /><span /><span /></div>
          </div>
        )}
        {transcribing && (
          <div className="transcribing-indicator">
            <span className="pulse-dot" />
            Transcribing audio...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        {isSpeaking && (
          <div className="speaking-banner">
            <span>🔊 Speaking with {selectedVoice?.name || 'default voice'}...</span>
            <button onClick={stopSpeaking}>Stop</button>
          </div>
        )}
        <div className="input-bar">
          <button onClick={() => setShowVoiceSettings(!showVoiceSettings)} className="settings-btn" title="Voice settings">⚙️</button>
          <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder={transcribing ? 'Transcribing...' : 'Type a message...'}
            disabled={transcribing} className="message-input" />
          <button onClick={isRecording ? stopRecording : startRecording}
            className={`voice-btn ${isRecording ? 'recording' : ''}`} disabled={transcribing}>
            {isRecording ? '⏹️' : '🎤'}
          </button>
          <button onClick={sendMessage} disabled={!inputText.trim()} className="send-btn">➤</button>
        </div>
      </div>

      {showVoiceSettings && (
        <div className="voice-settings-modal">
          <div className="modal-content">
            <div className="modal-header">
              <h3>🎙️ Voice Settings</h3>
              <button onClick={() => setShowVoiceSettings(false)}>✕</button>
            </div>
            <div className="modal-body">
              <label>Select Voice for AI Responses:</label>
              <select value={selectedVoice?.name || ''} onChange={(e) => {
                const voice = availableVoices.find(v => v.name === e.target.value);
                setSelectedVoice(voice || null);
              }} className="voice-select">
                {availableVoices.map((voice) => (
                  <option key={voice.name} value={voice.name}>{voice.name} ({voice.lang})</option>
                ))}
              </select>
              <div className="voice-test">
                <button onClick={() => speakText('Hello! This is Immuny, your allergy AI ally.')} className="test-voice-btn">
                  🔊 Test Voice
                </button>
              </div>
              <div className="api-info">
                <p><strong>Speech-to-Text:</strong> Powered by OpenAI Whisper</p>
                <p className="info-note">⚠️ Set your OpenAI API key in the code</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const renderContent = () => {
    switch (currentPage) {
      case 'profile': return <ProfilePage />;
      case 'symptom-logger': return <SymptomLoggerPage />;
      case 'exposure-testing': return <ExposureTestingPage />;
      default: return renderChat();
    }
  };

  return (
    <Authenticator>
      {({ signOut, user }) => (
        <div className="app-container">
          <div className={`sidebar ${menuOpen ? 'open' : ''}`}>
            <div className="sidebar-header">
              <img src={immunyLogo} alt="Immuny" className="sidebar-logo" />
              <div>
                <h2>Immuny</h2>
                <p className="sidebar-tagline">Allergy AI Ally</p>
              </div>
              <button onClick={() => setMenuOpen(false)}>✕</button>
            </div>
            <nav>
              <button className={currentPage === 'chat' ? 'active' : ''} onClick={() => navigateTo('chat')}>💬 Ask Immuny</button>
              <button className={currentPage === 'symptom-logger' ? 'active' : ''} onClick={() => navigateTo('symptom-logger')}>📋 Health Logger</button>
              <button className={currentPage === 'exposure-testing' ? 'active' : ''} onClick={() => navigateTo('exposure-testing')}>🧪 Exposure Testing</button>
              <button className={currentPage === 'profile' ? 'active' : ''} onClick={() => navigateTo('profile')}>👤 Profile</button>
            </nav>
            <div className="sidebar-footer">
              <p>{user?.signInDetails?.loginId}</p>
              <button onClick={signOut}>Sign Out</button>
            </div>
          </div>

          {menuOpen && <div className="overlay" onClick={() => setMenuOpen(false)} />}

          <div className="main-content">
            <header className="chat-header">
              <button onClick={() => setMenuOpen(true)} className="menu-btn">☰</button>
              <div className="header-title">
                <img src={immunyLogo} alt="Immuny" className="header-logo" />
                <div>
                  <h1>Immuny AI</h1>
                  <p>Allergy AI Ally • Voice: {selectedVoice?.name?.split(' ')[0] || 'Default'}</p>
                </div>
              </div>
            </header>
            {renderContent()}
          </div>
        </div>
      )}
    </Authenticator>
  );
}

function ProfilePage() {
  return (
    <div className="page-container">
      <h2>👤 Profile</h2>
      <div className="form-group">
        <label>Full Name</label>
        <input type="text" placeholder="Enter your name" />
      </div>
      <div className="form-group">
        <label>Age</label>
        <input type="number" placeholder="Enter your age" />
      </div>
      <button className="save-btn">Save Profile</button>
    </div>
  );
}
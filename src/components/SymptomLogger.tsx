import { useState, useRef, useEffect, type ComponentType } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClipboardIcon,
  CloseIcon,
  EditIcon,
  LightbulbIcon,
  MapPinIcon,
  MicIcon,
  PillIcon,
  SearchIcon,
  StopIcon,
  ThermometerIcon,
  UtensilsIcon,
} from './icons';
import StatusMessage from './StatusMessage';
import { toLocalDatetimeInputValue } from '../utils/formatTime';
import { COMMON_ALLERGENS } from '../utils/allergens';

const client = generateClient<Schema>();

function formatTime(iso: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface HealthEntry {
  id: string;
  type: 'Exposure' | 'Symptom' | 'Medication';
  name: string;
  time: string;
  [key: string]: any;
}

const SYMPTOM_LIST = ['Hives', 'Swelling', 'Itching', 'Nausea', 'Vomiting', 'Stomach Pain', 'Difficulty Breathing', 'Dizziness', 'Headache', 'Rash', 'Other'];
const MED_ROUTES = ['Oral', 'Topical', 'Injectable', 'Inhaled'];
const ICONS: Record<string, ComponentType> = { Exposure: UtensilsIcon, Symptom: ThermometerIcon, Medication: PillIcon };

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

function EntryCard({ entry, onDelete, onEdit }: { entry: HealthEntry; onDelete: () => void; onEdit: (updates: Partial<HealthEntry>) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(entry.name);
  const [editNotes, setEditNotes] = useState(entry.notes ?? entry.details ?? entry.reason ?? '');
  const [editSeverity, setEditSeverity] = useState(entry.severity ?? 5);
  const TypeIcon = ICONS[entry.type];

  const startEdit = () => {
    setEditName(entry.name);
    setEditNotes(entry.notes ?? entry.details ?? entry.reason ?? '');
    setEditSeverity(entry.severity ?? 5);
    setEditing(true);
    setExpanded(true);
  };

  const saveEdit = () => {
    const updates: Partial<HealthEntry> = { name: editName.trim() || entry.name };
    if (entry.type === 'Symptom') updates.severity = editSeverity;
    if (entry.notes !== undefined) updates.notes = editNotes;
    else if (entry.details !== undefined) updates.details = editNotes;
    else if (entry.reason !== undefined) updates.reason = editNotes;
    onEdit(updates);
    setEditing(false);
  };

  return (
    <div style={{ border: '1px solid #E9EDEF', borderRadius: 8, padding: 12, marginBottom: 8, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, background: '#D1E7F4', color: '#4A7BA7', padding: '2px 8px', borderRadius: 12 }}>
              <TypeIcon /> {entry.type}
            </span>
            {entry.subtype && <span style={{ fontSize: 11, color: '#999' }}>{entry.subtype}</span>}
          </div>
          {editing ? (
            <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
              style={{ width: '100%', padding: 8, border: '1px solid #4A7BA7', borderRadius: 6, fontSize: 14, fontWeight: 600, marginBottom: 4 }} />
          ) : (
            <div style={{ fontWeight: 600, fontSize: 14, color: '#111B21', marginBottom: 2 }}>
              {entry.name}
              {entry.dose && <span style={{ fontWeight: 400, color: '#667781', fontSize: 13 }}> — {entry.dose}{entry.unit} ({entry.route})</span>}
            </div>
          )}
          <div style={{ fontSize: 12, color: '#667781' }}>{formatTime(entry.time)}</div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {!confirmDelete && !editing && (
            <>
              <button onClick={() => setExpanded(!expanded)} title="Expand" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid #E9EDEF', borderRadius: 4, width: 26, height: 26, cursor: 'pointer' }}>
                {expanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
              </button>
              <button onClick={startEdit} title="Edit entry" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid #E9EDEF', borderRadius: 4, width: 26, height: 26, cursor: 'pointer', color: '#4A7BA7' }}><EditIcon /></button>
              <button onClick={() => setConfirmDelete(true)} title="Delete entry" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid #E9EDEF', borderRadius: 4, width: 26, height: 26, cursor: 'pointer', color: '#DC2626' }}><CloseIcon /></button>
            </>
          )}
          {confirmDelete && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{ color: '#DC2626', fontWeight: 600 }}>Delete this entry?</span>
              <button onClick={onDelete} style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Yes</button>
              <button onClick={() => setConfirmDelete(false)} style={{ background: 'none', border: '1px solid #E9EDEF', borderRadius: 4, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: '#667781' }}>No</button>
            </div>
          )}
        </div>
      </div>
      {!editing && entry.severity != null && <SeverityBar value={entry.severity} />}
      {editing && entry.type === 'Symptom' && (
        <div style={{ marginTop: 6 }}>
          <label style={{ fontSize: 12, color: '#667781' }}>Severity: {editSeverity}/10</label>
          <input type="range" min="1" max="10" value={editSeverity} onChange={e => setEditSeverity(Number(e.target.value))} style={{ width: '100%', accentColor: '#4A7BA7' }} />
        </div>
      )}
      {entry.tags?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
          {(typeof entry.tags === 'string' ? JSON.parse(entry.tags) : entry.tags).map((t: string, i: number) => (
            <span key={i} style={{ background: '#F0F2F5', border: '1px solid #E9EDEF', borderRadius: 12, padding: '2px 8px', fontSize: 11, color: '#667781' }}>{t}</span>
          ))}
        </div>
      )}
      {expanded && !editing && (entry.notes || entry.details || entry.reason || entry.bodyArea) && (
        <div style={{ marginTop: 8, padding: 10, background: '#F0F2F5', borderRadius: 6, fontSize: 13, color: '#3B4A54', borderTop: '1px solid #E9EDEF' }}>
          {entry.bodyArea && <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPinIcon /> {entry.bodyArea}</div>}
          {entry.notes || entry.details || entry.reason}
        </div>
      )}
      {editing && (
        <div style={{ marginTop: 8 }}>
          <label style={{ fontSize: 12, color: '#667781' }}>Notes</label>
          <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2}
            style={{ width: '100%', padding: 8, border: '1px solid #E9EDEF', borderRadius: 6, fontFamily: 'inherit', fontSize: 13 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={saveEdit} className="save-btn" style={{ padding: '6px 14px', fontSize: 12 }}>Save changes</button>
            <button onClick={() => setEditing(false)} style={{ padding: '6px 14px', fontSize: 12, background: 'none', border: '1px solid #E9EDEF', borderRadius: 8, cursor: 'pointer', color: '#667781' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

interface SymptomLoggerPageProps {
  initialTab?: 'Exposure' | 'Symptom' | 'Medication' | 'History';
}

export default function SymptomLoggerPage({ initialTab }: SymptomLoggerPageProps) {
  const now = new Date();
  const [activeTab, setActiveTab] = useState<'Exposure' | 'Symptom' | 'Medication' | 'History'>(initialTab ?? 'Exposure');
  const [entries, setEntries] = useState<HealthEntry[]>([]);
  const [historyFilter, setHistoryFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [loaded, setLoaded] = useState(false);

  const [listening, setListening] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const recRef = useRef<any>(null);
  const voiceSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;

  const [expType, setExpType] = useState('Meal');
  const [expName, setExpName] = useState('');
  const [expTags, setExpTags] = useState('');
  const [expDetails, setExpDetails] = useState('');
  const [expTime, setExpTime] = useState(toLocalDatetimeInputValue(now));

  const [symName, setSymName] = useState('');
  const [symCustom, setSymCustom] = useState('');
  const [symSeverity, setSymSeverity] = useState(5);
  const [symBody, setSymBody] = useState('');
  const [symNotes, setSymNotes] = useState('');
  const [symTime, setSymTime] = useState(toLocalDatetimeInputValue(now));

  const [medName, setMedName] = useState('');
  const [medDose, setMedDose] = useState('');
  const [medUnit, setMedUnit] = useState('mg');
  const [medRoute, setMedRoute] = useState('Oral');
  const [medReason, setMedReason] = useState('');
  const [medNotes, setMedNotes] = useState('');
  const [medTime, setMedTime] = useState(toLocalDatetimeInputValue(now));

  const [savedMsg, setSavedMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Load entries from DynamoDB ──
  useEffect(() => {
    (async () => {
      try {
        const { data } = await client.models.HealthEntry.list();
        if (data) {
          const mapped: HealthEntry[] = data.map((d: any) => ({
            id: d.id,
            type: d.type as HealthEntry['type'],
            subtype: d.subtype ?? undefined,
            name: d.name,
            severity: d.severity ?? undefined,
            bodyArea: d.bodyArea ?? undefined,
            notes: d.notes ?? undefined,
            tags: d.tags ? JSON.parse(d.tags) : undefined,
            details: d.details ?? undefined,
            dose: d.dose ?? undefined,
            unit: d.unit ?? undefined,
            route: d.route ?? undefined,
            reason: d.reason ?? undefined,
            time: d.time,
          }));
          setEntries(mapped);
        }
      } catch (e) {
        console.warn('Failed to load HealthEntry list:', e);
      }
      setLoaded(true);
    })();
  }, []);

  const addEntry = async (entry: Omit<HealthEntry, 'id'>) => {
    try {
      const tagsStr = Array.isArray(entry.tags) ? JSON.stringify(entry.tags) : (entry.tags ?? undefined);
      const { data: created } = await client.models.HealthEntry.create({
        type: entry.type,
        subtype: entry.subtype ?? undefined,
        name: entry.name,
        severity: entry.severity ?? undefined,
        bodyArea: entry.bodyArea ?? undefined,
        notes: entry.notes ?? undefined,
        tags: tagsStr,
        details: entry.details ?? undefined,
        dose: entry.dose ?? undefined,
        unit: entry.unit ?? undefined,
        route: entry.route ?? undefined,
        reason: entry.reason ?? undefined,
        time: entry.time,
      });
      if (created) {
        const newEntry: HealthEntry = {
          type: entry.type,
          name: entry.name,
          time: entry.time,
          ...entry,
          id: created.id as string,
          tags: entry.tags,
        };
        setEntries(prev => [...prev, newEntry]);
      }
      setSavedMsg({ type: 'success', text: 'Saved!' });
      setTimeout(() => setSavedMsg(null), 2000);
    } catch (e) {
      console.error('Failed to create HealthEntry:', e);
      setSavedMsg({ type: 'error', text: 'Save failed' });
      setTimeout(() => setSavedMsg(null), 3000);
    }
  };

  const deleteEntry = async (id: string) => {
    try {
      await client.models.HealthEntry.delete({ id });
      setEntries(prev => prev.filter(x => x.id !== id));
    } catch (e) {
      console.error('Failed to delete HealthEntry:', e);
    }
  };

  const updateEntry = async (id: string, updates: Partial<HealthEntry>) => {
    try {
      await client.models.HealthEntry.update({ id, ...updates });
      setEntries(prev => prev.map(x => x.id === id ? { ...x, ...updates } : x));
      setSavedMsg({ type: 'success', text: 'Updated!' });
      setTimeout(() => setSavedMsg(null), 2000);
    } catch (e) {
      console.error('Failed to update HealthEntry:', e);
      setSavedMsg({ type: 'error', text: 'Update failed' });
      setTimeout(() => setSavedMsg(null), 3000);
    }
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
    .filter(e => !search || e.name?.toLowerCase().includes(search.toLowerCase()) || (Array.isArray(e.tags) && e.tags.some((t: string) => t.toLowerCase().includes(search.toLowerCase()))))
    .slice().reverse();

  return (
    <div className="page-container">
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ClipboardIcon /> Health Logger</h2>
      <div style={{ background: '#F0F2F5', borderRadius: 8, padding: 12, marginBottom: 20, border: '1px solid #E9EDEF' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: voiceText ? 10 : 0 }}>
          <button onClick={listening ? stopVoice : startVoice} className="save-btn" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13, background: listening ? '#DC2626' : '#4A7BA7' }}>
            {listening ? <><StopIcon /> Stop</> : <><MicIcon /> Voice Log</>}
          </button>
          {!voiceSupported && <span style={{ fontSize: 12, color: '#DC2626' }}>Voice not supported</span>}
          {listening && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#4A7BA7', fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4A7BA7', display: 'inline-block' }} />
              Listening...
            </span>
          )}
        </div>
        {voiceText && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1, background: '#fff', border: '1px solid #E9EDEF', borderRadius: 6, padding: '8px 12px', fontSize: 13 }}>"{voiceText}"</div>
            <button className="save-btn" style={{ padding: '8px 12px', fontSize: 12 }} onClick={() => setVoiceText('')}>Clear</button>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#aaa', marginTop: 6 }}><LightbulbIcon /> Speak your entry, then fill the form below</div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #E9EDEF', paddingBottom: 0, overflowX: 'auto' }}>
        {(['Exposure', 'Symptom', 'Medication', 'History'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap',
            padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: 600, fontSize: 13, color: activeTab === t ? '#4A7BA7' : '#667781',
            borderBottom: activeTab === t ? '2px solid #4A7BA7' : '2px solid transparent', marginBottom: -2
          }}>
            {t === 'Exposure' ? <UtensilsIcon /> : t === 'Symptom' ? <ThermometerIcon /> : t === 'Medication' ? <PillIcon /> : <ClipboardIcon />}
            {t === 'Exposure' ? 'Food / Exposure' : t}
            {t === 'History' && ` (${entries.length})`}
          </button>
        ))}
      </div>

      {savedMsg && (
        <div style={{ background: '#D1E7F4', border: '1px solid #4A7BA7', borderRadius: 6, padding: '10px 16px', marginBottom: 16, fontWeight: 600 }}>
          <StatusMessage type={savedMsg.type} text={savedMsg.text} />
        </div>
      )}

      {activeTab === 'Exposure' && (
        <div>
          <p style={{ fontSize: 13, color: '#667781', marginBottom: 16 }}>
            Log what you ate, used, or were around — you don't need a reaction to log it.
          </p>
          <div style={{ display: 'flex', gap: 16 }}>
            <div className="form-group" style={{ flex: 1 }}><label>Type</label><select value={expType} onChange={e => setExpType(e.target.value)} style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8 }}><option>Meal</option><option>Product</option><option>Environmental</option><option>Other</option></select></div>
            <div className="form-group" style={{ flex: 2 }}><label>{expType === 'Meal' ? 'What did you eat?' : 'Name / Description'}</label><input type="text" value={expName} onChange={e => setExpName(e.target.value)} placeholder="e.g., Chicken Caesar Salad" style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8 }} /></div>
          </div>
          <div className="form-group">
            <label>Ingredients / Tags (comma-separated)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
              {COMMON_ALLERGENS.map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => {
                    const current = expTags.split(',').map(t => t.trim()).filter(Boolean);
                    if (current.some(t => t.toLowerCase() === a.toLowerCase())) return;
                    setExpTags([...current, a].join(', '));
                  }}
                  style={{ padding: '3px 10px', borderRadius: 14, border: '1px solid #E9EDEF', background: '#F0F2F5', color: '#667781', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                >
                  + {a}
                </button>
              ))}
            </div>
            <input type="text" value={expTags} onChange={e => setExpTags(e.target.value)} placeholder="e.g., chicken, lettuce, peanuts" style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8 }} />
          </div>
          <div className="form-group"><label>Details</label><textarea value={expDetails} onChange={e => setExpDetails(e.target.value)} rows={2} style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8 }} /></div>
          <div className="form-group"><label>Date & Time</label><input type="datetime-local" value={expTime} onChange={e => setExpTime(e.target.value)} style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8 }} /></div>
          <button className="save-btn" onClick={() => {
            if (!expName.trim()) return alert('Please enter a name.');
            addEntry({ type: 'Exposure', subtype: expType, name: expName, tags: expTags.split(',').map(t => t.trim()).filter(Boolean), details: expDetails, time: expTime });
            setExpName(''); setExpTags(''); setExpDetails('');
          }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><CheckCircleIcon /> {expType === 'Meal' ? 'Log Food' : 'Log Exposure'}</button>
        </div>
      )}

      {activeTab === 'Symptom' && (
        <div>
          <div className="form-group">
            <label>Symptom</label>
            <select value={symName} onChange={e => setSymName(e.target.value)} style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8 }}>
              <option value="">Select symptom…</option>
              {SYMPTOM_LIST.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          {symName === 'Other' && <div className="form-group"><label>Describe</label><input type="text" value={symCustom} onChange={e => setSymCustom(e.target.value)} placeholder="e.g., Throat tightness" style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8 }} /></div>}
          <div className="form-group"><label>Severity: {symSeverity}/10</label><input type="range" min="1" max="10" value={symSeverity} onChange={e => setSymSeverity(Number(e.target.value))} style={{ width: '100%', accentColor: '#4A7BA7' }} /><SeverityBar value={symSeverity} /></div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div className="form-group" style={{ flex: 1 }}><label>Body Area</label><input type="text" value={symBody} onChange={e => setSymBody(e.target.value)} placeholder="e.g., Face" style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8 }} /></div>
            <div className="form-group" style={{ flex: 1 }}><label>Date & Time</label><input type="datetime-local" value={symTime} onChange={e => setSymTime(e.target.value)} style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8 }} /></div>
          </div>
          <div className="form-group"><label>Notes</label><textarea value={symNotes} onChange={e => setSymNotes(e.target.value)} rows={2} style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8 }} /></div>
          <button className="save-btn" onClick={() => {
            const name = symName === 'Other' ? symCustom : symName;
            if (!name) return alert('Please select a symptom.');
            addEntry({ type: 'Symptom', name, severity: symSeverity, bodyArea: symBody, notes: symNotes, time: symTime });
            setSymName(''); setSymCustom(''); setSymSeverity(5); setSymBody(''); setSymNotes('');
          }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><CheckCircleIcon /> Log Symptom</button>
        </div>
      )}

      {activeTab === 'Medication' && (
        <div>
          <div className="form-group"><label>Medication Name</label><input type="text" value={medName} onChange={e => setMedName(e.target.value)} placeholder="e.g., Benadryl, EpiPen" style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8 }} /></div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div className="form-group" style={{ flex: 1 }}><label>Dose</label><input type="text" value={medDose} onChange={e => setMedDose(e.target.value)} placeholder="25" style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8 }} /></div>
            <div className="form-group" style={{ flex: 1 }}><label>Unit</label><select value={medUnit} onChange={e => setMedUnit(e.target.value)} style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8 }}>{['mg', 'ml', 'mcg', 'units', 'puffs'].map(o => <option key={o}>{o}</option>)}</select></div>
            <div className="form-group" style={{ flex: 1 }}><label>Route</label><select value={medRoute} onChange={e => setMedRoute(e.target.value)} style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8 }}>{MED_ROUTES.map(o => <option key={o}>{o}</option>)}</select></div>
          </div>
          <div className="form-group"><label>Reason</label><input type="text" value={medReason} onChange={e => setMedReason(e.target.value)} placeholder="e.g., Allergic reaction" style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8 }} /></div>
          <div className="form-group"><label>Notes</label><textarea value={medNotes} onChange={e => setMedNotes(e.target.value)} rows={2} style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8 }} /></div>
          <div className="form-group"><label>Date & Time</label><input type="datetime-local" value={medTime} onChange={e => setMedTime(e.target.value)} style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8 }} /></div>
          <button className="save-btn" onClick={() => {
            if (!medName.trim()) return alert('Please enter medication name.');
            addEntry({ type: 'Medication', name: medName, dose: medDose, unit: medUnit, route: medRoute, reason: medReason, notes: medNotes, time: medTime });
            setMedName(''); setMedDose(''); setMedReason(''); setMedNotes('');
          }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><CheckCircleIcon /> Log Medication</button>
        </div>
      )}

      {activeTab === 'History' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {['All', 'Exposure', 'Symptom', 'Medication'].map(f => {
              const FilterIcon = ICONS[f];
              return (
                <button key={f} onClick={() => setHistoryFilter(f)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px', borderRadius: 20, border: '1px solid #E9EDEF', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: historyFilter === f ? '#4A7BA7' : '#F0F2F5', color: historyFilter === f ? '#fff' : '#667781' }}>
                  {FilterIcon && <FilterIcon />} {f}
                </button>
              );
            })}
          </div>
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', display: 'flex' }}><SearchIcon /></span>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search entries…" style={{ width: '100%', padding: '10px 10px 10px 34px', border: '1px solid #E9EDEF', borderRadius: 8 }} />
          </div>
          {!loaded ? <div style={{ textAlign: 'center', padding: 40, color: '#4A7BA7' }}>Loading...</div>
            : filteredEntries.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#ccc' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><ClipboardIcon /></div>
                No entries found
              </div>
            )
              : filteredEntries.map(e => <EntryCard key={e.id} entry={e} onDelete={() => deleteEntry(e.id)} onEdit={updates => updateEntry(e.id, updates)} />)}
        </div>
      )}
    </div>
  );
}
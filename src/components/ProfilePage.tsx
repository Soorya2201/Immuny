import { useState, useEffect, type ComponentType } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import {
  AlertTriangleIcon,
  BarChartIcon,
  BellIcon,
  CameraIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClipboardIcon,
  CloseIcon,
  FlaskIcon,
  MedicalCrossIcon,
  MessageCircleIcon,
  NoteIcon,
  PillIcon,
  PlusIcon,
  SaveIcon,
  ThermometerIcon,
  UserIcon,
  UsersIcon,
  UtensilsIcon,
  ZapIcon,
} from './icons';
import StatusMessage from './StatusMessage';
import { COMMON_ALLERGENS } from '../utils/allergens';

const client = generateClient<Schema>();

// ── Types ──
interface NotificationPrefs {
  symptomReminders: boolean;
  exposureFollowups: boolean;
  dailyCheckin: boolean;
  weeklyReport: boolean;
}

interface FamilyMemberData {
  id: string;
  name: string;
  relationship: string;
  age?: number;
  knownAllergies?: string;
  medicalConditions?: string;
  medications?: string;
  notes?: string;
}

const RELATIONSHIPS = ['Spouse', 'Child', 'Parent', 'Sibling', 'Grandparent', 'Other'];

const LOG_TYPE_META: Record<string, { Icon: ComponentType; label: string }> = {
  user_query: { Icon: UserIcon, label: 'You asked' },
  medical_response: { Icon: FlaskIcon, label: 'MedGemma' },
  nova_reply: { Icon: ZapIcon, label: 'Nova' },
  image_analysis: { Icon: CameraIcon, label: 'Image' },
};

function LogTypeLabel({ type }: { type: string }) {
  const meta = LOG_TYPE_META[type];
  if (!meta) return <>{type}</>;
  const { Icon, label } = meta;
  return <><Icon /> {label}</>;
}

interface ConversationLog {
  type: string;
  ts: string;
  text?: string;
  question?: string;
  response?: string;
  response_preview?: string;
  routed_to?: string;
}

const DEFAULT_PREFS: NotificationPrefs = {
  symptomReminders: true,
  exposureFollowups: true,
  dailyCheckin: false,
  weeklyReport: false,
};

function formatDate(iso: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Collapsible Section ──
function Section({ title, icon: Icon, badge, defaultOpen = false, children }: {
  title: string; icon: ComponentType; badge?: string | number;
  defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="profile-section">
      <button onClick={() => setOpen(!open)} className="profile-section-header">
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon /> {title}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {badge !== undefined && <span className="profile-badge">{badge}</span>}
          <span style={{ display: 'flex', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}><ChevronDownIcon /></span>
        </span>
      </button>
      {open && <div className="profile-section-body">{children}</div>}
    </div>
  );
}

// ── Toggle Switch ──
function Toggle({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: () => void;
}) {
  return (
    <div className="profile-toggle-row" onClick={onChange}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, color: '#111B21' }}>{label}</div>
        <div style={{ fontSize: 12, color: '#667781', marginTop: 2 }}>{description}</div>
      </div>
      <div className={`profile-toggle ${checked ? 'active' : ''}`}>
        <div className="profile-toggle-thumb" />
      </div>
    </div>
  );
}

export default function ProfilePage() {
  // ── Profile fields ──
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [medicalHistory, setMedicalHistory] = useState('');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Activity data ──
  const [chatLogs, setChatLogs] = useState<ConversationLog[]>([]);
  const [healthEntries, setHealthEntries] = useState<any[]>([]);
  const [exposureTests, setExposureTests] = useState<any[]>([]);
  const [activityLoaded, setActivityLoaded] = useState(false);

  // ── Family members ──
  const [familyMembers, setFamilyMembers] = useState<FamilyMemberData[]>([]);
  const [showAddFamily, setShowAddFamily] = useState(false);
  const [fmName, setFmName] = useState('');
  const [fmRelationship, setFmRelationship] = useState('Child');
  const [fmAge, setFmAge] = useState('');
  const [fmAllergyChips, setFmAllergyChips] = useState<string[]>([]);
  const [fmAllergyOther, setFmAllergyOther] = useState('');
  const [fmConditions, setFmConditions] = useState('');
  const [fmMedications, setFmMedications] = useState('');
  const [fmNotes, setFmNotes] = useState('');

  // ── Notifications ──
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);

  // ── Load profile ──
  useEffect(() => {
    (async () => {
      try {
        const { data } = await client.models.UserProfile.list();
        if (data && data.length > 0) {
          const p = data[0] as any;
          setProfileId(p.id);
          setName(p.name ?? '');
          setAge(p.age?.toString() ?? '');
          setMedicalHistory(p.medicalHistory ?? '');
          if (p.notificationPrefs) {
            try { setNotifPrefs({ ...DEFAULT_PREFS, ...JSON.parse(p.notificationPrefs) }); } catch {}
          }
        }
      } catch (e) { console.warn('Failed to load profile:', e); }
      setProfileLoaded(true);
    })();
  }, []);

  // ── Load activity data ──
  useEffect(() => {
    (async () => {
      try {
        // Chat logs
        const userId = document.body.dataset.userId ?? 'anonymous';
        const logsResult = await client.queries.getConversationLogs({ userId });
        if (logsResult.data) {
          const parsed = JSON.parse(logsResult.data) as ConversationLog[];
          setChatLogs(parsed);
        }

        // Health entries
        const { data: he } = await client.models.HealthEntry.list();
        if (he) setHealthEntries(he);

        // Exposure tests
        const { data: et } = await client.models.ExposureTest.list();
        if (et) setExposureTests(et);

        // Family members
        const { data: fm } = await client.models.FamilyMember.list();
        if (fm) {
          setFamilyMembers(fm.map((m: any) => ({
            id: m.id,
            name: m.name,
            relationship: m.relationship,
            age: m.age ?? undefined,
            knownAllergies: m.knownAllergies ?? undefined,
            medicalConditions: m.medicalConditions ?? undefined,
            medications: m.medications ?? undefined,
            notes: m.notes ?? undefined,
          })));
        }
      } catch (e) { console.warn('Failed to load activity:', e); }
      setActivityLoaded(true);
    })();
  }, []);

  // ── Save profile ──
  const saveProfile = async () => {
    try {
      const prefsJson = JSON.stringify(notifPrefs);
      if (profileId) {
        await client.models.UserProfile.update({
          id: profileId,
          name: name || undefined,
          age: age ? parseInt(age) : undefined,
          medicalHistory: medicalHistory || undefined,
          notificationPrefs: prefsJson,
        });
      } else {
        const { data: created } = await client.models.UserProfile.create({
          name: name || undefined,
          age: age ? parseInt(age) : undefined,
          medicalHistory: medicalHistory || undefined,
          notificationPrefs: prefsJson,
        });
        if (created) setProfileId(created.id);
      }
      setProfileMsg({ type: 'success', text: 'Profile saved!' });
      setTimeout(() => setProfileMsg(null), 2000);
    } catch (e) {
      console.error('Failed to save profile:', e);
      setProfileMsg({ type: 'error', text: 'Save failed' });
      setTimeout(() => setProfileMsg(null), 3000);
    }
  };

  const togglePref = (key: keyof NotificationPrefs) => {
    setNotifPrefs(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleFmAllergyChip = (chip: string) => {
    setFmAllergyChips(prev => prev.includes(chip) ? prev.filter(c => c !== chip) : [...prev, chip]);
  };

  const addFamilyMember = async () => {
    if (!fmName.trim() || !fmRelationship) return alert('Please enter name and relationship.');
    const knownAllergies = [...fmAllergyChips, ...fmAllergyOther.split(',').map(s => s.trim()).filter(Boolean)].join(', ');
    try {
      const { data: created } = await client.models.FamilyMember.create({
        name: fmName.trim(),
        relationship: fmRelationship,
        age: fmAge ? parseInt(fmAge) : undefined,
        knownAllergies: knownAllergies || undefined,
        medicalConditions: fmConditions || undefined,
        medications: fmMedications || undefined,
        notes: fmNotes || undefined,
      });
      if (created) {
        setFamilyMembers(prev => [...prev, {
          id: created.id, name: fmName.trim(), relationship: fmRelationship,
          age: fmAge ? parseInt(fmAge) : undefined,
          knownAllergies: knownAllergies || undefined,
          medicalConditions: fmConditions || undefined,
          medications: fmMedications || undefined,
          notes: fmNotes || undefined,
        }]);
      }
      setFmName(''); setFmAge(''); setFmAllergyChips([]); setFmAllergyOther(''); setFmConditions('');
      setFmMedications(''); setFmNotes(''); setShowAddFamily(false);
      setProfileMsg({ type: 'success', text: 'Family member added!' });
      setTimeout(() => setProfileMsg(null), 2000);
    } catch (e) {
      console.error('Failed to add family member:', e);
      setProfileMsg({ type: 'error', text: 'Failed to add' }); setTimeout(() => setProfileMsg(null), 3000);
    }
  };

  const deleteFamilyMember = async (id: string) => {
    if (!window.confirm('Remove this family member?')) return;
    try {
      await client.models.FamilyMember.delete({ id });
      setFamilyMembers(prev => prev.filter(m => m.id !== id));
    } catch (e) { console.error('Failed to delete:', e); }
  };

  // ── Stats ──
  const symptomCount = healthEntries.filter((e: any) => e.type === 'Symptom').length;
  const medCount = healthEntries.filter((e: any) => e.type === 'Medication').length;
  const testCount = exposureTests.length;
  const completedTests = exposureTests.filter((t: any) => t.status === 'completed').length;
  const chatCount = chatLogs.length;

  return (
    <div className="page-container">
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><UserIcon /> Profile</h2>

      {profileMsg && (
        <div style={{
          background: profileMsg.type === 'success' ? '#D1E7F4' : '#FFF5F5',
          border: `1px solid ${profileMsg.type === 'success' ? '#4A7BA7' : '#DC2626'}`,
          borderRadius: 6, padding: '10px 16px', marginBottom: 16, fontWeight: 600,
        }}>
          <StatusMessage type={profileMsg.type} text={profileMsg.text} />
        </div>
      )}

      {/* ── Quick Stats ── */}
      <div className="profile-stats-grid">
        <div className="profile-stat-card">
          <div className="profile-stat-icon"><MessageCircleIcon /></div>
          <div className="profile-stat-value">{chatCount}</div>
          <div className="profile-stat-label">Chat Interactions</div>
        </div>
        <div className="profile-stat-card">
          <div className="profile-stat-icon"><ThermometerIcon /></div>
          <div className="profile-stat-value">{symptomCount}</div>
          <div className="profile-stat-label">Symptoms Logged</div>
        </div>
        <div className="profile-stat-card">
          <div className="profile-stat-icon"><FlaskIcon /></div>
          <div className="profile-stat-value">{testCount}</div>
          <div className="profile-stat-label">Exposure Tests</div>
        </div>
        <div className="profile-stat-card">
          <div className="profile-stat-icon"><PillIcon /></div>
          <div className="profile-stat-value">{medCount}</div>
          <div className="profile-stat-label">Medications</div>
        </div>
      </div>

      {/* ── Personal Info ── */}
      <Section title="Personal Information" icon={NoteIcon} defaultOpen={true}>
        {!profileLoaded ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#4A7BA7' }}>Loading profile...</div>
        ) : (
          <>
            <div className="form-group">
              <label>Full Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Enter your name" />
            </div>
            <div className="form-group">
              <label>Age</label>
              <input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="Enter your age" />
            </div>
            <div className="form-group">
              <label>Medical History</label>
              <textarea value={medicalHistory} onChange={e => setMedicalHistory(e.target.value)}
                rows={3} placeholder="Known allergies, conditions, medications…"
                style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8, fontFamily: 'inherit', fontSize: '0.938rem' }} />
            </div>
          </>
        )}
      </Section>

      {/* ── Chat History ── */}
      <Section title="Chat Conversations" icon={MessageCircleIcon} badge={chatCount}>
        {!activityLoaded ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#4A7BA7' }}>Loading...</div>
        ) : chatLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: '#bbb' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><MessageCircleIcon /></div>
            No chat conversations yet. Start chatting with Immuny!
          </div>
        ) : (
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {chatLogs.slice(0, 30).map((log, i) => (
              <div key={i} className="profile-activity-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <span className="profile-activity-type" style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: log.type === 'user_query' ? '#D9FDD3' : log.type === 'medical_response' ? '#F3E8FF' : '#D1E7F4',
                    color: log.type === 'user_query' ? '#155724' : log.type === 'medical_response' ? '#7C3AED' : '#4A7BA7',
                  }}>
                    <LogTypeLabel type={log.type} />
                  </span>
                  <span style={{ fontSize: 11, color: '#999' }}>{formatDate(log.ts)}</span>
                </div>
                <div style={{ fontSize: 13, color: '#3B4A54', lineHeight: 1.5 }}>
                  {log.text || log.question || ''}
                </div>
                {(log.response || log.response_preview) && (
                  <div style={{ fontSize: 12, color: '#667781', marginTop: 4, padding: '6px 10px', background: '#F8F9FA', borderRadius: 6, borderLeft: '3px solid #4A7BA7' }}>
                    {log.response_preview || log.response?.slice(0, 120)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Symptom & Health Log ── */}
      <Section title="Health Log Entries" icon={ClipboardIcon} badge={healthEntries.length}>
        {!activityLoaded ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#4A7BA7' }}>Loading...</div>
        ) : healthEntries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: '#bbb' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><ClipboardIcon /></div>
            No health entries yet. Use the Health Logger to start tracking.
          </div>
        ) : (
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {[...healthEntries].reverse().slice(0, 20).map((entry: any) => (
              <div key={entry.id} className="profile-activity-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <span className="profile-activity-type" style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: entry.type === 'Symptom' ? '#FFF5F5' : entry.type === 'Exposure' ? '#FFF8E7' : '#D1E7F4',
                    color: entry.type === 'Symptom' ? '#DC2626' : entry.type === 'Exposure' ? '#B8860B' : '#4A7BA7',
                  }}>
                    {entry.type === 'Symptom' ? <ThermometerIcon /> : entry.type === 'Exposure' ? <UtensilsIcon /> : <PillIcon />} {entry.type}
                  </span>
                  <span style={{ fontSize: 11, color: '#999' }}>{formatDate(entry.time)}</span>
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#111B21' }}>{entry.name}</div>
                {entry.severity && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: '#667781' }}>Severity:</span>
                    <div style={{ flex: 1, maxWidth: 120, height: 5, background: '#E9EDEF', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: `${entry.severity * 10}%`, height: '100%', borderRadius: 99,
                        background: entry.severity <= 3 ? '#6abf8e' : entry.severity <= 6 ? '#f5c842' : '#DC2626'
                      }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700,
                      color: entry.severity <= 3 ? '#6abf8e' : entry.severity <= 6 ? '#f5c842' : '#DC2626'
                    }}>{entry.severity}/10</span>
                  </div>
                )}
                {entry.notes && <div style={{ fontSize: 12, color: '#667781', marginTop: 4 }}>{entry.notes}</div>}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Exposure Tests ── */}
      <Section title="Exposure Tests" icon={FlaskIcon} badge={`${completedTests}/${testCount}`}>
        {!activityLoaded ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#4A7BA7' }}>Loading...</div>
        ) : exposureTests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: '#bbb' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><FlaskIcon /></div>
            No exposure tests yet. Use the Exposure Testing page to start.
          </div>
        ) : (
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {[...exposureTests].reverse().slice(0, 20).map((test: any) => (
              <div key={test.id} className="profile-activity-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#111B21' }}>{test.testName}</span>
                  <span className="profile-activity-type" style={{
                    background: test.status === 'completed' ? '#D4EDDA' : test.status === 'active' ? '#D1E7F4' : '#F0F2F5',
                    color: test.status === 'completed' ? '#155724' : test.status === 'active' ? '#4A7BA7' : '#667781',
                  }}>{test.status}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#667781' }}>
                  <FlaskIcon /> {test.allergen} · {test.amount}{test.unit} · {test.testDate}
                </div>
                {test.results && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 6, padding: '6px 10px', background: '#F0F2F5', borderRadius: 6 }}>
                    <BarChartIcon /> {test.results}
                  </div>
                )}
                {test.reactions && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 4, padding: '6px 10px', background: '#FFF5F5', borderRadius: 6, color: '#DC2626' }}>
                    <AlertTriangleIcon /> {test.reactions}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Family Members ── */}
      <Section title="Family Members" icon={UsersIcon} badge={familyMembers.length} defaultOpen={true}>
        {familyMembers.length === 0 && !showAddFamily ? (
          <div style={{ textAlign: 'center', padding: 30, color: '#bbb' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><UsersIcon /></div>
            No family members added yet.
          </div>
        ) : (
          <div>
            {familyMembers.map(fm => (
              <div key={fm.id} className="profile-activity-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: '#111B21' }}>{fm.name}</span>
                      <span className="profile-activity-type" style={{ background: '#E8F4FD', color: '#4A7BA7' }}>{fm.relationship}</span>
                      {fm.age && <span style={{ fontSize: 12, color: '#667781' }}>Age {fm.age}</span>}
                    </div>
                    {fm.knownAllergies && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, marginTop: 4 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#DC2626', fontWeight: 600 }}><AlertTriangleIcon /> Allergies:</span> <span style={{ color: '#3B4A54' }}>{fm.knownAllergies}</span>
                      </div>
                    )}
                    {fm.medicalConditions && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, marginTop: 2 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#4A7BA7', fontWeight: 600 }}><MedicalCrossIcon /> Conditions:</span> <span style={{ color: '#3B4A54' }}>{fm.medicalConditions}</span>
                      </div>
                    )}
                    {fm.medications && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, marginTop: 2 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#7C3AED', fontWeight: 600 }}><PillIcon /> Medications:</span> <span style={{ color: '#3B4A54' }}>{fm.medications}</span>
                      </div>
                    )}
                    {fm.notes && <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#667781', marginTop: 4, fontStyle: 'italic' }}><NoteIcon /> {fm.notes}</div>}
                  </div>
                  <button onClick={() => deleteFamilyMember(fm.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid #E9EDEF', borderRadius: 4, width: 26, height: 26, cursor: 'pointer', color: '#DC2626', flexShrink: 0 }}><CloseIcon /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showAddFamily ? (
          <div style={{ marginTop: 16, padding: 16, background: '#F8FBFF', borderRadius: 10, border: '1px solid #D1E7F4' }}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#4A7BA7', marginBottom: 12, fontSize: 14 }}><PlusIcon /> Add Family Member</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 13 }}>Name *</label>
                <input type="text" value={fmName} onChange={e => setFmName(e.target.value)} placeholder="e.g., Sarah" />
              </div>
              <div className="form-group" style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 13 }}>Relationship *</label>
                <select value={fmRelationship} onChange={e => setFmRelationship(e.target.value)} style={{ width: '100%', padding: 12, border: '1px solid #E9EDEF', borderRadius: 8, fontSize: '0.938rem' }}>
                  {RELATIONSHIPS.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 13 }}>Age</label>
                <input type="number" value={fmAge} onChange={e => setFmAge(e.target.value)} placeholder="Optional" />
              </div>
              <div className="form-group" style={{ marginBottom: 8, gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 13 }}>Known Allergies</label>
                <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 6px' }}>
                  Pick from the same list used for symptom &amp; exposure logging so they show up together in Insights.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {COMMON_ALLERGENS.map(a => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => toggleFmAllergyChip(a)}
                      style={{
                        padding: '4px 12px', borderRadius: 16, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                        border: fmAllergyChips.includes(a) ? '1px solid #4A7BA7' : '1px solid #E9EDEF',
                        background: fmAllergyChips.includes(a) ? '#4A7BA7' : '#F8FBFF',
                        color: fmAllergyChips.includes(a) ? '#fff' : '#4A7BA7',
                      }}
                    >
                      {a}
                    </button>
                  ))}
                </div>
                <input type="text" value={fmAllergyOther} onChange={e => setFmAllergyOther(e.target.value)} placeholder="Other allergies (comma-separated)" />
              </div>
              <div className="form-group" style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 13 }}>Medical Conditions</label>
                <input type="text" value={fmConditions} onChange={e => setFmConditions(e.target.value)} placeholder="e.g., Asthma, Eczema" />
              </div>
              <div className="form-group" style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 13 }}>Medications</label>
                <input type="text" value={fmMedications} onChange={e => setFmMedications(e.target.value)} placeholder="e.g., EpiPen, Benadryl" />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13 }}>Notes</label>
              <textarea value={fmNotes} onChange={e => setFmNotes(e.target.value)} rows={2} placeholder="Any additional notes…"
                style={{ width: '100%', padding: 10, border: '1px solid #E9EDEF', borderRadius: 8, fontFamily: 'inherit', fontSize: '0.875rem' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="save-btn" onClick={addFamilyMember} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 20px', fontSize: 13 }}><CheckCircleIcon /> Add Member</button>
              <button onClick={() => setShowAddFamily(false)} style={{ padding: '10px 20px', fontSize: 13, background: 'none', border: '1px solid #E9EDEF', borderRadius: 8, cursor: 'pointer', color: '#667781' }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAddFamily(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, width: '100%', padding: 12, background: 'none', border: '2px dashed #D1E7F4', borderRadius: 8, color: '#4A7BA7', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
            <PlusIcon /> Add Family Member
          </button>
        )}
      </Section>

      {/* ── Notifications & Personalization ── */}
      <Section title="Notifications & Personalization" icon={BellIcon} defaultOpen={true}>
        <Toggle
          label="Symptom Reminders"
          description="Get reminded to log symptoms when triggered"
          checked={notifPrefs.symptomReminders}
          onChange={() => togglePref('symptomReminders')}
        />
        <Toggle
          label="Exposure Test Follow-ups"
          description="Reminders to record results after an exposure test"
          checked={notifPrefs.exposureFollowups}
          onChange={() => togglePref('exposureFollowups')}
        />
        <Toggle
          label="Daily Health Check-in"
          description="Daily reminder to log how you're feeling"
          checked={notifPrefs.dailyCheckin}
          onChange={() => togglePref('dailyCheckin')}
        />
        <Toggle
          label="Weekly Health Report"
          description="Weekly summary of your health activity"
          checked={notifPrefs.weeklyReport}
          onChange={() => togglePref('weeklyReport')}
        />
      </Section>

      {/* ── Save Button ── */}
      <button className="save-btn" onClick={saveProfile} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', marginTop: 24, padding: 14, fontSize: 15 }}>
        <SaveIcon /> Save Profile & Preferences
      </button>
    </div>
  );
}

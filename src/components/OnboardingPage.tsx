import { useEffect, useRef, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import type { Page } from '../types';
import beaImg from '../assets/bea.png';
import { COMMON_ALLERGENS } from '../utils/allergens';
import {
  ArrowRightIcon,
  ChatBubbleIcon,
  CheckCircleIcon,
  ClipboardIcon,
  HelpCircleIcon,
  SparkleIcon,
  UsersIcon,
  WaveformIcon,
} from './icons';
import StatusMessage from './StatusMessage';
import { AQUATIC_AVATARS, avatarFor } from '../utils/avatars';

const client = generateClient<Schema>();

const CHILD_PRONOUNS = ['she/her', 'he/him', 'they/them'];

const CAREGIVER_RELATIONSHIPS = ['Mother', 'Father', 'Guardian', 'Grandparent', 'Other'];
const CONDITION_CHIPS = ['Asthma', 'Eczema', 'Seasonal Allergies', 'None of these'];
const MEDICATION_CHIPS = ['EpiPen', 'Antihistamine', 'Inhaler', 'None of these'];
const NOT_SURE_ALLERGY = 'Not sure yet';
const TOTAL_STEPS = 6;

const BackArrowIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const EmailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Formats digits as the user types into "(555) 012-3456" (US 10-digit format).
function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

// Converts a birthdate into whole months and years elapsed as of today.
function ageFromDob(dobStr: string): { years: number; totalMonths: number } {
  const dob = new Date(`${dobStr}T00:00:00`);
  const now = new Date();
  let totalMonths = (now.getFullYear() - dob.getFullYear()) * 12 + (now.getMonth() - dob.getMonth());
  if (now.getDate() < dob.getDate()) totalMonths -= 1;
  totalMonths = Math.max(0, totalMonths);
  return { years: Math.floor(totalMonths / 12), totalMonths };
}

function formatAgeFromMonths(totalMonths: number): string {
  if (totalMonths < 1) return 'Newborn';
  if (totalMonths < 12) return `${totalMonths} month${totalMonths === 1 ? '' : 's'} old`;
  const years = Math.floor(totalMonths / 12);
  return `${years} year${years === 1 ? '' : 's'} old`;
}

interface OnboardingPageProps {
  existingProfileId: string | null;
  onComplete: (landingPage?: Page) => void;
}

// Toggles a chip in/out of a selection list. Selecting the exclusive item
// ("None of these") clears everything else, and picking anything else clears it.
function toggleChip(list: string[], chip: string, exclusive: string): string[] {
  if (chip === exclusive) return list.includes(chip) ? [] : [exclusive];
  const withoutExclusive = list.filter(c => c !== exclusive);
  return withoutExclusive.includes(chip)
    ? withoutExclusive.filter(c => c !== chip)
    : [...withoutExclusive, chip];
}

export default function OnboardingPage({ existingProfileId, onComplete }: OnboardingPageProps) {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [relationship, setRelationship] = useState('Mother');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);

  const [childName, setChildName] = useState('');
  const [ageMode, setAgeMode] = useState<'age' | 'dob'>('age');
  const [ageUnit, setAgeUnit] = useState<'years' | 'months'>('years');
  const [childAge, setChildAge] = useState('');
  const [childDob, setChildDob] = useState('');
  const [childPronouns, setChildPronouns] = useState('');
  const [childAvatarKey, setChildAvatarKey] = useState('');

  const [conditions, setConditions] = useState<string[]>([]);
  const [conditionsOther, setConditionsOther] = useState('');
  const [medications, setMedications] = useState<string[]>([]);
  const [medicationsOther, setMedicationsOther] = useState('');
  const [parentAllergyHistory, setParentAllergyHistory] = useState('');

  const [allergyChips, setAllergyChips] = useState<string[]>([]);
  const [allergyOther, setAllergyOther] = useState('');
  const [allergyNotes, setAllergyNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus the first field of form steps for a snappier keyboard flow.
    if (step === 2 || step === 3) {
      const t = setTimeout(() => firstFieldRef.current?.focus(), 260);
      return () => clearTimeout(t);
    }
  }, [step]);

  const emailValid = contactEmail.trim() === '' || EmailRe.test(contactEmail.trim());
  const canAdvance =
    step === 2 ? firstName.trim() !== '' && emailValid :
    step === 3 ? childName.trim() !== '' :
    true;

  const goNext = () => {
    if (!canAdvance) { setEmailTouched(true); return; }
    setDirection('forward');
    setStep(s => Math.min(TOTAL_STEPS, s + 1));
  };
  const goBack = () => {
    setDirection('back');
    setStep(s => Math.max(1, s - 1));
  };

  const finish = async (landingPage?: Page) => {
    if (saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const caregiverName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
      const profilePayload = {
        name: caregiverName || undefined,
        caregiverRelationship: relationship || undefined,
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        medicalHistory: parentAllergyHistory.trim() || undefined,
        onboardingComplete: true,
        // Stored rather than derived so the caregiver's avatar survives a later
        // name change; they can pick a different one in Profile.
        avatarKey: avatarFor(undefined, `owner:${caregiverName || 'Me'}`).key,
      };
      if (existingProfileId) {
        await client.models.UserProfile.update({ id: existingProfileId, ...profilePayload });
      } else {
        await client.models.UserProfile.create(profilePayload);
      }

      if (childName.trim()) {
        const allergyList = [
          ...allergyChips,
          ...allergyOther.split(',').map(s => s.trim()).filter(Boolean),
        ];
        const conditionList = [
          ...conditions.filter(c => c !== 'None of these'),
          ...conditionsOther.split(',').map(s => s.trim()).filter(Boolean),
        ];
        const medicationList = [
          ...medications.filter(c => c !== 'None of these'),
          ...medicationsOther.split(',').map(s => s.trim()).filter(Boolean),
        ];

        let ageFields: { age?: number; ageMonths?: number; dateOfBirth?: string } = {};
        if (ageMode === 'dob' && childDob) {
          const { years, totalMonths } = ageFromDob(childDob);
          ageFields = totalMonths < 12
            ? { age: 0, ageMonths: totalMonths, dateOfBirth: childDob }
            : { age: years, dateOfBirth: childDob };
        } else if (ageMode === 'age' && childAge.trim()) {
          const n = parseInt(childAge, 10);
          if (Number.isFinite(n) && n > 0) {
            ageFields = ageUnit === 'months' ? { age: 0, ageMonths: Math.min(11, n) } : { age: n };
          }
        }

        await client.models.FamilyMember.create({
          name: childName.trim(),
          relationship: 'Child',
          ...ageFields,
          knownAllergies: allergyList.join(', ') || undefined,
          medicalConditions: conditionList.join(', ') || undefined,
          medications: medicationList.join(', ') || undefined,
          notes: allergyNotes.trim() || undefined,
          // Bea talks *about* this child to the caregiver, so it needs pronouns
          // from the start rather than guessing from the name.
          pronouns: childPronouns.trim() || undefined,
          avatarKey: childAvatarKey || undefined,
        });
      }

      onComplete(landingPage);
    } catch (e) {
      console.error('Onboarding save failed', e);
      setSaveError("Something went wrong saving your profile. Please try again.");
      setSaving(false);
    }
  };

  const progressPct = (step / TOTAL_STEPS) * 100;

  return (
    <div className="onboarding-screen">
      {step > 1 && (
        <div className="onboarding-topbar">
          <button className="onboarding-back-btn" onClick={goBack} aria-label="Back" disabled={saving}>
            <BackArrowIcon />
          </button>
          <div className="onboarding-progress-track">
            <div className="onboarding-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="onboarding-progress-label">{step}/{TOTAL_STEPS}</span>
        </div>
      )}

      <div key={step} className={`onboarding-step onboarding-step--${direction}`}>
        {/* ── Step 1: Welcome ─────────────────────────────────────────── */}
        {step === 1 && (
          <div className="onboarding-bookend">
            <div className="onboarding-standalone-progress-wrap">
              <span className="onboarding-progress-label-inline">1/{TOTAL_STEPS}</span>
              <div className="onboarding-progress-track onboarding-progress-track--standalone">
                <div className="onboarding-progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
            <div className="onboarding-orb">
              <div className="onboarding-ring onboarding-ring-1" />
              <div className="onboarding-ring onboarding-ring-2" />
              <img src={beaImg} alt="Bea" className="onboarding-bea-large" />
            </div>
            <h1 className="onboarding-title">Welcome to Immuny.</h1>
            <p className="onboarding-subtitle">
              Your Allergy AI Ally. Let's set up your child's profile so Bea can personalize guidance.
            </p>
            <button className="onboarding-primary-btn" onClick={goNext}>Get Started</button>
          </div>
        )}

        {/* ── Step 2: Caregiver information ──────────────────────────── */}
        {step === 2 && (
          <div className="onboarding-form-step">
            <img src={beaImg} alt="Bea" className="onboarding-bea-small" />
            <h2 className="onboarding-title onboarding-title--form">Caregiver information</h2>
            <p className="onboarding-subtitle onboarding-subtitle--form">
              Add the parent or guardian who will manage this profile.
            </p>

            <div className="onboarding-field">
              <label>First Name</label>
              <input ref={firstFieldRef} type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
                placeholder="Mary" onKeyDown={e => e.key === 'Enter' && goNext()} />
            </div>
            <div className="onboarding-field">
              <label>Last Name</label>
              <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
                placeholder="S." onKeyDown={e => e.key === 'Enter' && goNext()} />
            </div>
            <div className="onboarding-field">
              <label>Relationship</label>
              <div className="onboarding-chip-row">
                {CAREGIVER_RELATIONSHIPS.map(r => (
                  <button key={r} type="button" className={`onboarding-chip${relationship === r ? ' active' : ''}`}
                    onClick={() => setRelationship(r)}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div className="onboarding-field">
              <label>Contact Email</label>
              <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)}
                onBlur={() => setEmailTouched(true)} placeholder="mary@example.com"
                className={emailTouched && !emailValid ? 'onboarding-input-invalid' : ''}
                onKeyDown={e => e.key === 'Enter' && goNext()} />
              {emailTouched && !emailValid && <span className="onboarding-field-error">Enter a valid email address.</span>}
            </div>
            <div className="onboarding-field">
              <label>Contact Phone</label>
              <input type="tel" inputMode="tel" value={contactPhone}
                onChange={e => setContactPhone(formatPhone(e.target.value))}
                placeholder="(555) 012-3456" onKeyDown={e => e.key === 'Enter' && goNext()} />
            </div>
          </div>
        )}

        {/* ── Step 3: Child profile ───────────────────────────────────── */}
        {step === 3 && (
          <div className="onboarding-form-step">
            <img src={beaImg} alt="Bea" className="onboarding-bea-small" />
            <h2 className="onboarding-title onboarding-title--form">Child profile</h2>
            <p className="onboarding-subtitle onboarding-subtitle--form">Tell Bea who this allergy profile is for.</p>

            <div className="onboarding-field">
              <label>Child Name</label>
              <input ref={firstFieldRef} type="text" value={childName} onChange={e => setChildName(e.target.value)}
                placeholder="John" onKeyDown={e => e.key === 'Enter' && goNext()} />
            </div>
            <div className="onboarding-field">
              <label>Age</label>
              <div className="onboarding-chip-row" style={{ marginBottom: 10 }}>
                <button type="button" className={`onboarding-chip${ageMode === 'age' ? ' active' : ''}`}
                  onClick={() => setAgeMode('age')}>
                  Age
                </button>
                <button type="button" className={`onboarding-chip${ageMode === 'dob' ? ' active' : ''}`}
                  onClick={() => setAgeMode('dob')}>
                  Date of birth
                </button>
              </div>

              {ageMode === 'age' ? (
                <>
                  <div className="onboarding-chip-row" style={{ marginBottom: 10 }}>
                    <button type="button" className={`onboarding-chip${ageUnit === 'years' ? ' active' : ''}`}
                      onClick={() => { setAgeUnit('years'); setChildAge(''); }}>
                      Years
                    </button>
                    <button type="button" className={`onboarding-chip${ageUnit === 'months' ? ' active' : ''}`}
                      onClick={() => { setAgeUnit('months'); setChildAge(''); }}>
                      Months (under 1)
                    </button>
                  </div>
                  <input type="number" min={1} max={ageUnit === 'months' ? 11 : 25} value={childAge}
                    onChange={e => setChildAge(e.target.value)}
                    placeholder={ageUnit === 'months' ? 'e.g. 6' : 'e.g. 8'}
                    onKeyDown={e => e.key === 'Enter' && goNext()} />
                </>
              ) : (
                <>
                  <input type="date" value={childDob} max={todayIso()}
                    onChange={e => setChildDob(e.target.value)} />
                  {childDob && (
                    <span className="onboarding-age-hint">{formatAgeFromMonths(ageFromDob(childDob).totalMonths)}</span>
                  )}
                </>
              )}
            </div>

            <div className="onboarding-field">
              <label>Pronouns</label>
              <span className="onboarding-age-hint" style={{ display: 'block', marginBottom: 8 }}>
                Bea talks about {childName.trim() || 'your child'} to you, so this keeps it from guessing.
              </span>
              <div className="onboarding-chip-row">
                {CHILD_PRONOUNS.map(p => (
                  <button
                    key={p}
                    type="button"
                    className={`onboarding-chip${childPronouns === p ? ' active' : ''}`}
                    onClick={() => setChildPronouns(childPronouns === p ? '' : p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="onboarding-field">
              <label>Pick an avatar</label>
              <div className="avatar-picker" style={{ marginTop: 6 }}>
                {AQUATIC_AVATARS.map(({ key, label, Icon, tint }) => (
                  <button
                    key={key}
                    type="button"
                    title={label}
                    aria-label={label}
                    aria-pressed={childAvatarKey === key}
                    onClick={() => setChildAvatarKey(key)}
                    className={`avatar-picker-option ${childAvatarKey === key ? 'selected' : ''}`}
                    style={{ color: tint, background: `${tint}1F` }}
                  >
                    <Icon size={26} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 4: Medical background ─────────────────────────────── */}
        {step === 4 && (
          <div className="onboarding-form-step">
            <img src={beaImg} alt="Bea" className="onboarding-bea-small" />
            <h2 className="onboarding-title onboarding-title--form">
              {childName.trim() ? `${childName.trim()}'s medical background` : "Your child's medical background"}
            </h2>
            <p className="onboarding-subtitle onboarding-subtitle--form">
              Optional, but it helps Bea spot patterns sooner.
            </p>

            <div className="onboarding-field">
              <label>Existing conditions</label>
              <div className="onboarding-chip-row">
                {CONDITION_CHIPS.map(c => (
                  <button key={c} type="button" className={`onboarding-chip${conditions.includes(c) ? ' active' : ''}`}
                    onClick={() => setConditions(prev => toggleChip(prev, c, 'None of these'))}>
                    {c}
                  </button>
                ))}
              </div>
              <input type="text" value={conditionsOther} onChange={e => setConditionsOther(e.target.value)}
                placeholder="Other conditions (comma-separated)" style={{ marginTop: 8 }} />
            </div>

            <div className="onboarding-field">
              <label>Current medications</label>
              <div className="onboarding-chip-row">
                {MEDICATION_CHIPS.map(m => (
                  <button key={m} type="button" className={`onboarding-chip${medications.includes(m) ? ' active' : ''}`}
                    onClick={() => setMedications(prev => toggleChip(prev, m, 'None of these'))}>
                    {m}
                  </button>
                ))}
              </div>
              <input type="text" value={medicationsOther} onChange={e => setMedicationsOther(e.target.value)}
                placeholder="Other medications (comma-separated)" style={{ marginTop: 8 }} />
            </div>

            <div className="onboarding-field">
              <label>Parent/caregiver allergy history <span className="onboarding-field-optional">(optional)</span></label>
              <textarea value={parentAllergyHistory} onChange={e => setParentAllergyHistory(e.target.value)} rows={2}
                placeholder="e.g. Dad has a peanut allergy, Mom has asthma" />
            </div>
          </div>
        )}

        {/* ── Step 5: Known allergens ─────────────────────────────────── */}
        {step === 5 && (
          <div className="onboarding-form-step">
            <img src={beaImg} alt="Bea" className="onboarding-bea-small" />
            <h2 className="onboarding-title onboarding-title--form">Known allergens</h2>
            <p className="onboarding-subtitle onboarding-subtitle--form">
              Choose allergies or foods you want Immuny to watch closely.
            </p>

            <div className="onboarding-chip-row onboarding-chip-row--wrap">
              {COMMON_ALLERGENS.map(a => (
                <button key={a} type="button" className={`onboarding-chip${allergyChips.includes(a) ? ' active' : ''}`}
                  onClick={() => setAllergyChips(prev => toggleChip(prev, a, NOT_SURE_ALLERGY))}>
                  {a}
                </button>
              ))}
              <button type="button"
                className={`onboarding-chip onboarding-chip--muted${allergyChips.includes(NOT_SURE_ALLERGY) ? ' active' : ''}`}
                onClick={() => setAllergyChips(prev => toggleChip(prev, NOT_SURE_ALLERGY, NOT_SURE_ALLERGY))}>
                <HelpCircleIcon /> Not sure yet
              </button>
            </div>
            <div className="onboarding-field">
              <input type="text" value={allergyOther} onChange={e => setAllergyOther(e.target.value)}
                disabled={allergyChips.includes(NOT_SURE_ALLERGY)}
                placeholder="Other allergies (comma-separated)" />
            </div>
            <div className="onboarding-field">
              <label>Notes</label>
              <textarea value={allergyNotes} onChange={e => setAllergyNotes(e.target.value)} rows={3}
                placeholder="Anything else you'd like Bea to know?" />
            </div>
          </div>
        )}

        {/* ── Step 6: Profile ready ───────────────────────────────────── */}
        {step === 6 && (
          <div className="onboarding-bookend">
            <div className="onboarding-orb onboarding-orb--small">
              <div className="onboarding-ring onboarding-ring-1" />
              <img src={beaImg} alt="Bea" className="onboarding-bea-medium" />
            </div>
            <h1 className="onboarding-title">Profile ready</h1>
            <p className="onboarding-subtitle">
              You can now chat with Bea, log symptoms, review insights, or join the community.
            </p>

            <div className="onboarding-shortcut-list">
              <button className="onboarding-shortcut-row" onClick={() => void finish('chat')} disabled={saving}>
                <ChatBubbleIcon /><span>Text with Bea</span><ArrowRightIcon />
              </button>
              <button className="onboarding-shortcut-row" onClick={() => void finish('voice')} disabled={saving}>
                <WaveformIcon /><span>Voice check-in</span><ArrowRightIcon />
              </button>
              <button className="onboarding-shortcut-row" onClick={() => void finish('symptom-logger')} disabled={saving}>
                <ClipboardIcon /><span>Log symptoms</span><ArrowRightIcon />
              </button>
              <button className="onboarding-shortcut-row" onClick={() => void finish('insights')} disabled={saving}>
                <SparkleIcon /><span>View insights</span><ArrowRightIcon />
              </button>
              <button className="onboarding-shortcut-row" onClick={() => void finish('community')} disabled={saving}>
                <UsersIcon /><span>Community</span><ArrowRightIcon />
              </button>
            </div>

            {saveError && (
              <p style={{ marginTop: 12 }}><StatusMessage type="error" text={saveError} /></p>
            )}

            <button className="onboarding-primary-btn" onClick={() => void finish()} disabled={saving}>
              {saving ? 'Saving…' : <><CheckCircleIcon /> Finish Profile</>}
            </button>
          </div>
        )}
      </div>

      {step > 1 && step < 6 && (
        <div className="onboarding-footer">
          <button className="onboarding-secondary-btn" onClick={goBack}>Back</button>
          <button className="onboarding-primary-btn onboarding-primary-btn--inline" onClick={goNext} disabled={!canAdvance}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}

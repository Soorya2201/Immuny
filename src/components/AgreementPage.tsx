import { useState, type ComponentType, type ReactNode } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import logo from '../assets/immuny-logo-header.png';
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  ExternalLinkIcon,
  MedicalCrossIcon,
  ShieldIcon,
  SparkleIcon,
  UsersIcon,
} from './icons';
import { AGREEMENT_VERSION, BETA_GUIDELINES_URL, PRIVACY_URL, TERMS_URL } from './legalLinks';
import '../agreement.css';

const client = generateClient<Schema>();

// Shown once after sign-up, before the profile questions, and again to anyone
// whose saved agreementVersion is older than AGREEMENT_VERSION.
// The wording is the approved Privacy & Safety Agreement text: change it only
// together with AGREEMENT_VERSION.

interface Notice {
  title: string;
  icon: ComponentType;
  tone: 'amber' | 'blue' | 'violet' | 'red' | 'teal';
  body: ReactNode;
}

const NOTICES: Notice[] = [
  {
    title: "We're in Beta Testing",
    icon: AlertTriangleIcon,
    tone: 'amber',
    body: (
      <>
        Immuny is still being developed, and some features may be incomplete or change.{' '}
        <strong>For this test, please use fictional information only.</strong>{' '}
        <u>Do not enter real health information about yourself or your family.</u>{' '}
        Read the{' '}
        <a href={BETA_GUIDELINES_URL} target="_blank" rel="noopener noreferrer">Beta Testing Guidelines</a>{' '}
        before you start.
      </>
    ),
  },
  {
    title: 'Your Privacy Matters',
    icon: ShieldIcon,
    tone: 'blue',
    body: (
      <>
        Immuny collects account information and the information you enter to provide and improve the app. Learn
        more about how your information is used in our{' '}
        <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
      </>
    ),
  },
  {
    title: "AI Helps, But Doesn't Diagnose",
    icon: SparkleIcon,
    tone: 'violet',
    body: (
      <>
        Immuny uses AI to organize information, identify possible patterns, and generate summaries. AI can make
        mistakes and should not replace advice from a qualified healthcare professional.
      </>
    ),
  },
  {
    title: 'Not for Medical Emergencies',
    icon: MedicalCrossIcon,
    tone: 'red',
    body: (
      <>
        Immuny is a tracking and informational tool, not a medical device or emergency service. If you think
        someone is experiencing a medical emergency, seek immediate medical assistance.
      </>
    ),
  },
  {
    title: 'For Parents & Adults',
    icon: UsersIcon,
    tone: 'teal',
    body: (
      <>
        Immuny accounts are intended for adults 18 and older. Parents or legal guardians may create and manage
        profiles for their children.
      </>
    ),
  },
];

const DOCUMENTS = [
  { label: 'Privacy Policy', url: PRIVACY_URL },
  { label: 'Terms of Service', url: TERMS_URL },
  { label: 'Beta Testing Guidelines', url: BETA_GUIDELINES_URL },
];

const AGREEMENTS = [
  'I have reviewed and agree to the Privacy Policy and Terms of Service.',
  'I understand Immuny uses AI and does not provide medical diagnoses or emergency services.',
  'I understand Immuny is in beta testing and agree to enter fictional health information only.',
  'I confirm that I am 18 or older and will only create child profiles if I am their parent or legal guardian.',
];

interface AgreementPageProps {
  existingProfileId: string | null;
  // Called with the profile id the acceptance was saved on (created here if
  // the user has no profile yet).
  onAccepted: (profileId: string) => void;
}

export default function AgreementPage({ existingProfileId, onAccepted }: AgreementPageProps) {
  const [checked, setChecked] = useState<boolean[]>(() => AGREEMENTS.map(() => false));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const allChecked = checked.every(Boolean);
  const remaining = checked.filter(c => !c).length;

  const toggle = (i: number) => setChecked(prev => prev.map((c, j) => (j === i ? !c : c)));

  const accept = async () => {
    if (!allChecked || saving) return;
    setSaving(true);
    setError('');
    const record = { agreementAcceptedAt: new Date().toISOString(), agreementVersion: AGREEMENT_VERSION };
    try {
      const { data, errors } = existingProfileId
        ? await client.models.UserProfile.update({ id: existingProfileId, ...record })
        : await client.models.UserProfile.create({ ...record, onboardingComplete: false });
      if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'No profile returned');
      onAccepted(data.id);
    } catch (e) {
      console.error('Saving agreement failed', e);
      setError('We could not save your agreement. Check your connection and try again.');
      setSaving(false);
    }
  };

  return (
    <div className="agree-screen">
      <div className="agree-scroll">
        <header className="agree-header">
          <img src={logo} alt="Immuny, Allergy Ally" className="agree-logo" />
          <h1 className="agree-title">Welcome to Immuny!</h1>
          <p className="agree-kicker">Privacy &amp; Safety Agreement</p>
          <p className="agree-intro">
            Before getting started, please review how Immuny works and how we handle your information.
          </p>
        </header>

        <div className="agree-cards">
          {NOTICES.map(({ title, icon: Icon, tone, body }) => (
            <section key={title} className={`agree-card agree-card--${tone}`}>
              <div className="agree-card-icon" aria-hidden="true"><Icon /></div>
              <div className="agree-card-text">
                <h2>{title}</h2>
                <p>{body}</p>
              </div>
            </section>
          ))}
        </div>

        <h2 className="agree-section-title">Review Our Documents</h2>
        <div className="agree-panel agree-docs">
          {DOCUMENTS.map(({ label, url }) => (
            <a key={label} className="agree-doc" href={url} target="_blank" rel="noopener noreferrer">
              <span>{label}</span>
              <ExternalLinkIcon />
            </a>
          ))}
        </div>

        <h2 className="agree-section-title">Your Agreement</h2>
        <div className="agree-panel agree-checks">
          {AGREEMENTS.map((text, i) => (
            <label key={text} className={`agree-check${checked[i] ? ' is-checked' : ''}`}>
              <input type="checkbox" checked={checked[i]} onChange={() => toggle(i)} />
              <span className="agree-box" aria-hidden="true">
                <svg viewBox="0 0 16 16" width="12" height="12"><polyline points="3.5 8.5 6.5 11.5 12.5 4.5" /></svg>
              </span>
              <span className="agree-check-text">{text}</span>
            </label>
          ))}
        </div>
      </div>

      <footer className="agree-footer">
        {error && <p className="agree-error" role="alert">{error}</p>}
        <button type="button" className="agree-continue" disabled={!allChecked || saving} onClick={accept}>
          {saving ? 'Saving…' : 'Agree & Continue'}
          {!saving && <ArrowRightIcon />}
        </button>
        <p className="agree-footnote" aria-live="polite">
          {allChecked
            ? 'Thank you. You can continue.'
            : `All checkboxes are required to continue (${remaining} left).`}
        </p>
      </footer>
    </div>
  );
}

import { useState } from 'react';
import Section from './ProfileSection';
import { ShieldIcon, TrashIcon } from './icons';
import { deleteAllMyData, deleteMyAccount, type DeleteProgress } from '../utils/deleteMyData';

// ── How your data is used ────────────────────────────────────────────────────
// Plain language, and only claims the code backs up. Update this whenever a
// new service starts receiving user data.
export function DataUseSection() {
  return (
    <Section title="How Your Data Is Used" icon={ShieldIcon}>
      <div className="privacy-copy">
        <h4>What we keep</h4>
        <p>
          Your profile, family members, health and food entries, medications, exposure tests, chats with Bea,
          and any label text you choose to save. It is stored on Amazon Web Services (AWS) in the US, encrypted,
          and only your account can open it.
        </p>

        <h4>Who else sees it</h4>
        <ul>
          <li><strong>Bea's replies</strong> are written by Amazon's Nova Micro AI on AWS. Your message and the recent conversation are sent to write each reply.</li>
          <li><strong>Voice logging</strong> sends your recording to Groq to turn speech into text.</li>
          <li><strong>Label scans</strong> are sent to Amazon Textract to read the text. Immuny does not save the photo, only the text you check and keep.</li>
          <li><strong>Community posts and comments</strong> can be read by every signed-in Immuny user. Posting anonymously hides your name.</li>
        </ul>

        <h4>What we never do</h4>
        <p>No ads, no tracking tools, and we never sell or share your data for marketing.</p>

        <h4>What we count</h4>
        <p>
          For each message Bea answers, we record how much AI processing it used and what it cost. This record has
          no message content and is kept after you delete your data so we can track costs.
        </p>

        <h4>Your choices</h4>
        <p>
          You can edit or remove any entry, download a summary with Clinician Export, and delete all your data or
          your whole account below.
        </p>

        <p className="privacy-note">Immuny is in beta. It helps you track and spot patterns; it does not give medical advice.</p>
      </div>
    </Section>
  );
}

// ── Delete data / account (two confirmations) ────────────────────────────────
type Kind = 'data' | 'account';
type Stage = 'closed' | 'explain' | 'confirm' | 'working' | 'done' | 'error';

const CONFIRM_WORD: Record<Kind, string> = { data: 'DELETE', account: 'DELETE ACCOUNT' };

const STEP_LABEL: Record<string, string> = {
  PostLike: 'community likes',
  PostComment: 'community comments',
  CommunityPost: 'community posts',
  ChatMessage: 'chat messages',
  ChatThread: 'chats',
  MedicationLog: 'medication doses',
  Medication: 'medications',
  HealthEntry: 'health entries',
  ExposureTest: 'exposure tests',
  FamilyMember: 'family members',
  UserProfile: 'profile',
  account: 'your login',
};

export function DeleteDataSection() {
  const [kind, setKind] = useState<Kind>('data');
  const [stage, setStage] = useState<Stage>('closed');
  const [typed, setTyped] = useState('');
  const [progress, setProgress] = useState<DeleteProgress | null>(null);
  const [error, setError] = useState('');

  const open = (k: Kind) => {
    setKind(k);
    setTyped('');
    setError('');
    setProgress(null);
    setStage('explain');
  };
  const close = () => setStage('closed');

  const run = async () => {
    setStage('working');
    try {
      if (kind === 'data') await deleteAllMyData(setProgress);
      else await deleteMyAccount(setProgress);
      setStage('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      setStage('error');
    }
  };

  // Reloading drops every screen's cached copy of the deleted records: after
  // deleting data the app starts again at onboarding, after deleting the
  // account at the login page.
  const finish = () => window.location.reload();

  const isAccount = kind === 'account';
  const word = CONFIRM_WORD[kind];
  const busy = stage === 'working';

  return (
    <>
      <Section title="Delete Data or Account" icon={TrashIcon}>
        <div className="privacy-danger-row">
          <div>
            <strong>Delete all my data</strong>
            <p>Erase everything you have logged. You keep your login and can start fresh.</p>
          </div>
          <button type="button" className="danger-btn-outline" onClick={() => open('data')}>Delete data</button>
        </div>
        <div className="privacy-danger-row">
          <div>
            <strong>Delete my account</strong>
            <p>Erase everything and your login. You will be signed out and cannot sign back in.</p>
          </div>
          <button type="button" className="danger-btn" onClick={() => open('account')}>Delete account</button>
        </div>
      </Section>

      {stage !== 'closed' && (
        <div className="danger-modal-backdrop" onClick={busy || stage === 'done' ? undefined : close}>
          <div
            className="danger-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="danger-modal-title"
            onClick={e => e.stopPropagation()}
          >
            {stage === 'explain' && (
              <>
                <h3 id="danger-modal-title">{isAccount ? 'Delete your account?' : 'Delete all your data?'}</h3>
                <p>This permanently deletes, for you and every family member on this account:</p>
                <ul>
                  <li>Your profile and family members</li>
                  <li>All health, food and symptom entries</li>
                  <li>Medications, doses and exposure tests</li>
                  <li>Every chat with Bea</li>
                  <li>Your community posts, comments and likes</li>
                  {isAccount && <li>Your login. You will be signed out for good.</li>}
                </ul>
                <p className="danger-modal-warn">This cannot be undone. Download a Clinician Export first if you want a copy.</p>
                <div className="danger-modal-actions">
                  <button type="button" className="danger-btn-ghost" onClick={close}>Cancel</button>
                  <button type="button" className="danger-btn" onClick={() => setStage('confirm')}>Continue</button>
                </div>
              </>
            )}

            {stage === 'confirm' && (
              <>
                <h3 id="danger-modal-title">Are you sure?</h3>
                <label htmlFor="danger-confirm-input">
                  Type <strong>{word}</strong> to confirm.
                </label>
                <input
                  id="danger-confirm-input"
                  className="danger-modal-input"
                  value={typed}
                  onChange={e => setTyped(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  autoFocus
                />
                <div className="danger-modal-actions">
                  <button type="button" className="danger-btn-ghost" onClick={close}>Cancel</button>
                  <button
                    type="button"
                    className="danger-btn"
                    disabled={typed.trim().toUpperCase() !== word}
                    onClick={run}
                  >
                    {isAccount ? 'Delete my account' : 'Delete my data'}
                  </button>
                </div>
              </>
            )}

            {stage === 'working' && (
              <>
                <h3 id="danger-modal-title">Deleting…</h3>
                <p aria-live="polite">
                  {progress ? `Removing ${STEP_LABEL[progress.step] ?? progress.step} (${progress.deleted} deleted so far)` : 'Starting'}
                </p>
                <p className="danger-modal-warn">Keep this screen open until it finishes.</p>
              </>
            )}

            {stage === 'done' && (
              <>
                <h3 id="danger-modal-title">{isAccount ? 'Your account is deleted' : 'Your data is deleted'}</h3>
                <p>{isAccount ? 'Thank you for trying Immuny.' : 'Immuny will now start fresh.'}</p>
                <div className="danger-modal-actions">
                  <button type="button" className="danger-btn" onClick={finish}>OK</button>
                </div>
              </>
            )}

            {stage === 'error' && (
              <>
                <h3 id="danger-modal-title">Not everything was deleted</h3>
                <p>{error}</p>
                {isAccount && <p>Your account was not deleted, so you can try again.</p>}
                <div className="danger-modal-actions">
                  <button type="button" className="danger-btn-ghost" onClick={close}>Close</button>
                  <button type="button" className="danger-btn" onClick={run}>Try again</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

import { useState } from 'react';
import { signOut } from 'aws-amplify/auth';
import { LogOutIcon } from './icons';

// Last thing on the profile page. signOut() ends the session on this device and
// revokes its refresh token; the Authenticator then shows the sign-in screen.
export default function LogOutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const logOut = async () => {
    setBusy(true);
    setError('');
    try {
      await signOut();
    } catch (e) {
      console.error('Log out failed', e);
      setError('Could not log out. Check your connection and try again.');
      setBusy(false);
    }
  };

  return (
    <div className="logout-wrap">
      <button type="button" className="logout-btn" onClick={logOut} disabled={busy}>
        <LogOutIcon /> {busy ? 'Logging out…' : 'Log Out'}
      </button>
      {error && <p className="logout-error" role="alert">{error}</p>}
    </div>
  );
}

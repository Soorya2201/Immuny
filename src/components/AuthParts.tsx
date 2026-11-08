import { useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { getRememberMe, setRememberMe } from '../utils/rememberMe';
import logo from '../assets/immuny-logo-wordmark.png';

function CardHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="auth-card-header">
      <img className="auth-logo" src={logo} alt="Immuny" width={289} height={72} />
      <h1 className="auth-card-title">{title}</h1>
      <p className="auth-card-subtitle">{subtitle}</p>
    </header>
  );
}

export function SignInHeader() {
  return <CardHeader title="Log In" subtitle="Welcome back. Please log in to your account." />;
}

export function SignUpHeader() {
  return <CardHeader title="Sign Up" subtitle="Create your account to get started." />;
}

// Renders two siblings into Amplify's form column. CSS `order` lifts the
// options row above the submit button; Amplify has no slot there itself.
export function SignInFooter() {
  const { toForgotPassword, toSignUp } = useAuthenticator((c) => [c.toForgotPassword, c.toSignUp]);
  const [remember, setRemember] = useState(getRememberMe);

  return (
    <>
      <div className="auth-options-row">
        <label className="auth-remember">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => {
              setRemember(e.target.checked);
              setRememberMe(e.target.checked);
            }}
          />
          <span>Remember me</span>
        </label>
        <button type="button" className="auth-text-link" onClick={toForgotPassword}>
          Forgot password
        </button>
      </div>
      <p className="auth-switch">
        Don’t have an account?{' '}
        <button type="button" className="auth-text-link" onClick={toSignUp}>
          Sign up
        </button>
      </p>
    </>
  );
}

export function SignUpFooter() {
  const { toSignIn } = useAuthenticator((c) => [c.toSignIn]);
  return (
    <p className="auth-switch">
      Already have an account?{' '}
      <button type="button" className="auth-text-link" onClick={toSignIn}>
        Log in
      </button>
    </p>
  );
}

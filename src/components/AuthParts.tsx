import { useState } from 'react';
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react';
import { PRIVACY_URL, TERMS_URL } from './legalLinks';
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

// Sign-up only: Amplify's own fields, then the two required agreements. The
// checkbox names are not Cognito attributes, so Amplify keeps them out of the
// sign-up request; validateCustomSignUp in authConfig.ts enforces them.
// Amplify validates as soon as the form opens and keeps Sign Up disabled until
// both boxes are ticked, so the message waits until this box has been touched;
// otherwise a fresh form would open covered in red.
function Agreement({ name, error: rawError, children }: { name: string; error?: string; children: React.ReactNode }) {
  const [touched, setTouched] = useState(false);
  const error = touched ? rawError : undefined;
  return (
    <div className="auth-agree">
      <label className="auth-agree-row">
        <input
          type="checkbox"
          name={name}
          value="yes"
          required
          onChange={() => setTouched(true)}
          aria-invalid={!!error}
          aria-describedby={error ? `${name}-error` : undefined}
        />
        <span>{children}</span>
      </label>
      {error && <p id={`${name}-error`} className="auth-agree-error" role="alert">{error}</p>}
    </div>
  );
}

export function SignUpFormFields() {
  const { validationErrors } = useAuthenticator((c) => [c.validationErrors]);
  const err = (k: string) => {
    const v = validationErrors[k];
    return Array.isArray(v) ? v[0] : v;
  };
  return (
    <>
      <Authenticator.SignUp.FormFields />
      <div className="auth-agreements">
        <Agreement name="acceptTerms" error={err('acceptTerms')}>
          I am 18 or older and agree to the{' '}
          <a href={TERMS_URL} target="_blank" rel="noopener noreferrer">Terms of Service</a>
        </Agreement>
        <Agreement name="acceptPrivacy" error={err('acceptPrivacy')}>
          I have read the{' '}
          <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">Privacy Policy</a>
        </Agreement>
      </div>
    </>
  );
}

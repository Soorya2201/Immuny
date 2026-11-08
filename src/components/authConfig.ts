import type { ComponentProps } from 'react';
import type { Authenticator } from '@aws-amplify/ui-react';
import { I18n } from 'aws-amplify/utils';
import { SignInFooter, SignInHeader, SignUpFooter, SignUpHeader } from './AuthParts';
import '../auth.css';

// Button labels to match the design ("Log In", "Sign Up").
I18n.putVocabulariesForLanguage('en', {
  'Sign in': 'Log In',
  'Signing in': 'Logging in',
  'Create Account': 'Sign Up',
  'Creating Account': 'Signing up',
});

type AuthenticatorProps = ComponentProps<typeof Authenticator>;

export const authComponents: AuthenticatorProps['components'] = {
  SignIn: { Header: SignInHeader, Footer: SignInFooter },
  SignUp: { Header: SignUpHeader, Footer: SignUpFooter },
};

// Placeholder-only fields to match the design. labelHidden only hides the
// labels visually; screen readers still announce them.
export const authFormFields: AuthenticatorProps['formFields'] = {
  signIn: {
    username: { label: 'E-mail address', placeholder: 'E-mail address', labelHidden: true },
    password: { label: 'Password', placeholder: 'Password', labelHidden: true },
  },
  signUp: {
    email: { label: 'E-mail address', placeholder: 'E-mail address', labelHidden: true, order: 1 },
    password: { label: 'Password', placeholder: 'Password', labelHidden: true, order: 2 },
    confirm_password: { label: 'Confirm password', placeholder: 'Confirm password', labelHidden: true, order: 3 },
  },
};

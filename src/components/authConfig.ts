import type { ComponentProps } from 'react';
import type { Authenticator } from '@aws-amplify/ui-react';
import { I18n } from 'aws-amplify/utils';
import { signUp } from 'aws-amplify/auth';
import { LEGAL_VERSION } from './legalLinks';
import { SignInFooter, SignInHeader, SignUpFooter, SignUpFormFields, SignUpHeader } from './AuthParts';
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
  SignUp: { Header: SignUpHeader, FormFields: SignUpFormFields, Footer: SignUpFooter },
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

// Both agreements are required before an account is created. An unchecked box
// is absent from the form data, so presence is the check.
export const authServices: AuthenticatorProps['services'] = {
  async validateCustomSignUp(formData) {
    const errors: Record<string, string> = {};
    if (!formData.acceptTerms) errors.acceptTerms = 'Please confirm you are 18 or older and agree to the Terms of Service.';
    if (!formData.acceptPrivacy) errors.acceptPrivacy = 'Please confirm you have read the Privacy Policy.';
    return Object.keys(errors).length ? errors : undefined;
  },
  // Records the consent on the new account itself, so it can be shown later
  // which version of the Terms and Privacy Policy each person agreed to.
  async handleSignUp(input) {
    return signUp({
      ...input,
      options: {
        ...input.options,
        userAttributes: {
          ...input.options?.userAttributes,
          'custom:legal_accepted_at': new Date().toISOString(),
          'custom:legal_version': LEGAL_VERSION,
        },
      },
    });
  },
};

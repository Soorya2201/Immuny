import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito';
import { defaultStorage, sessionStorage } from 'aws-amplify/utils';

// "Remember me" decides where Cognito keeps its tokens: localStorage survives
// closing the browser, sessionStorage does not. The choice itself is kept in
// localStorage so the token provider can be pointed at the right store on the
// next page load, before Amplify tries to read a session.
const PREF_KEY = 'immuny.rememberMe';

export function getRememberMe(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setRememberMe(remember: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, String(remember));
  } catch {
    // Storage blocked (private mode): the choice still applies to this tab.
  }
  cognitoUserPoolsTokenProvider.setKeyValueStorage(remember ? defaultStorage : sessionStorage);
}

/** Call once, right after Amplify.configure. */
export function applyRememberMe(): void {
  setRememberMe(getRememberMe());
}

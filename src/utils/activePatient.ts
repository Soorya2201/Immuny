// Which person new entries are about. An account can track several people
// (a caregiver plus one or more children), and a clinical export is only
// meaningful if every entry in it belongs to the same patient.
//
// Stored locally rather than on the profile: it's a UI preference about what
// you're logging right now, and it has to be readable synchronously when an
// entry is written.

const KEY = 'immuny.activePatientId';

/** '' / null means the profile owner (entries with no familyMemberId). */
export function getActivePatientId(): string | undefined {
  try {
    return localStorage.getItem(KEY) || undefined;
  } catch {
    return undefined;   // private mode / storage disabled
  }
}

export function setActivePatientId(id: string | undefined): void {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    // Non-fatal: entries fall back to the profile owner.
  }
}

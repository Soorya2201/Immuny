// The context object and its hook, separate from the provider component so
// each file exports one kind of thing and Fast Refresh keeps working.

import { createContext, useContext } from 'react';
import type { Patient } from '../utils/patients';

export interface ActivePatientValue {
  patients: Patient[];
  activePatient: Patient | null;
  /** undefined = the profile owner, matching HealthEntry.familyMemberId. */
  activeId: string | undefined;
  setActiveId: (id: string | undefined) => void;
  loading: boolean;
  /** Re-read the household after profile edits (add/rename/delete a member). */
  reload: () => Promise<void>;
}

export const ActivePatientContext = createContext<ActivePatientValue | null>(null);

export function useActivePatient(): ActivePatientValue {
  const ctx = useContext(ActivePatientContext);
  if (!ctx) throw new Error('useActivePatient must be used inside an ActivePatientProvider');
  return ctx;
}

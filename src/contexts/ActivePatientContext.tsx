// Who the app is currently tracking.
//
// Chat, voice logging and the symptom logger all need the same answer to "who
// is this about?", and they need it to change together — a switch made in the
// chat header must be the one the voice logger writes to DynamoDB. Holding the
// selection in one place is what makes the switcher a single source of truth
// rather than three drifting copies.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getActivePatientId, setActivePatientId } from '../utils/activePatient';
import { loadPatients, type Patient } from '../utils/patients';
import { ActivePatientContext, type ActivePatientValue } from './useActivePatient';

// Shown when the profile cannot be read at all. The switcher is how you know
// who you are logging for, so it must never disappear.
const FALLBACK_OWNER: Patient = { id: undefined, isOwner: true, name: 'Me', firstName: 'Me' };

export function ActivePatientProvider({ children }: { children: React.ReactNode }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [activeId, setActiveIdState] = useState<string | undefined>(getActivePatientId);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const list = await loadPatients();
      setPatients(list);
      // The stored id may belong to a member who was since removed — fall back
      // to the profile owner rather than pointing at nothing.
      setActiveIdState(prev => {
        if (prev && !list.some(p => p.id === prev)) {
          setActivePatientId(undefined);
          return undefined;
        }
        return prev;
      });
    } catch (e) {
      // loadPatients already degrades internally, so reaching here means
      // something unexpected. Keep a usable owner rather than an empty list,
      // which would hide the switcher entirely.
      console.warn('Failed to load the household — falling back to the profile owner', e);
      setPatients([FALLBACK_OWNER]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const setActiveId = useCallback((id: string | undefined) => {
    setActiveIdState(id);
    setActivePatientId(id);   // keeps ExportDataSheet and any direct reader in step
  }, []);

  const activePatient = useMemo(
    () => patients.find(p => p.id === activeId) ?? patients[0] ?? null,
    [patients, activeId],
  );

  const value = useMemo<ActivePatientValue>(
    () => ({ patients, activePatient, activeId, setActiveId, loading, reload }),
    [patients, activePatient, activeId, setActiveId, loading, reload],
  );

  return <ActivePatientContext.Provider value={value}>{children}</ActivePatientContext.Provider>;
}

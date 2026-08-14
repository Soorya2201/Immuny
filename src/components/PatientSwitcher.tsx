// The "who am I tracking?" control that sits in the top-right of any screen
// where what you say or log belongs to a specific person.
//
// It is deliberately always visible rather than hidden behind a menu: the cost
// of logging a reaction against the wrong child is high, so the current subject
// should never have to be recalled or guessed at.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useActivePatient } from '../contexts/useActivePatient';
import PatientAvatar from './PatientAvatar';
import { ageLabel, patientSeed, type Patient } from '../utils/patients';
import { CheckCircleIcon, ChevronDownIcon, UsersIcon } from './icons';

interface PatientSwitcherProps {
  /** Shown as the popover footer action; omit to hide it. */
  onManageFamily?: () => void;
}

function subtitleFor(p: Patient): string {
  const bits = [p.isOwner ? 'You' : p.relationship, ageLabel(p)].filter(Boolean);
  return bits.join(' · ');
}

export default function PatientSwitcher({ onManageFamily }: PatientSwitcherProps) {
  const { patients, activePatient, activeId, setActiveId, loading } = useActivePatient();

  // The switcher must render even if the household could not be read: an
  // invisible control is worse than a generic one, because its whole job is
  // telling you who the screen is about before you log anything against them.
  const current: Patient = activePatient ?? { id: undefined, isOwner: true, name: 'Me', firstName: 'Me' };
  const options = patients.length > 0 ? patients : [current];

  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) chipRef.current?.focus();
  }, []);

  // Open on the active row so arrow keys start from where the user already is.
  const toggle = () => {
    if (open) return close();
    setFocusIndex(Math.max(0, options.findIndex(p => p.id === activeId)));
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    optionRefs.current[focusIndex]?.focus();
  }, [open, focusIndex]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open, close]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIndex(i => (i + 1) % options.length); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocusIndex(i => (i - 1 + options.length) % options.length); }
    if (e.key === 'Home')      { e.preventDefault(); setFocusIndex(0); }
    if (e.key === 'End')       { e.preventDefault(); setFocusIndex(options.length - 1); }
  };

  const choose = (p: Patient) => {
    setActiveId(p.id);
    close();
  };

  // Only the very first load is blank.
  if (loading) return <div className="patient-switcher" aria-hidden="true" />;

  return (
    <div className="patient-switcher" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        ref={chipRef}
        type="button"
        className={`patient-chip ${open ? 'open' : ''}`}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Tracking ${current.name}. Change person.`}
        title={`Tracking ${current.name}`}
      >
        <PatientAvatar avatarKey={current.avatarKey} seed={patientSeed(current)} size={28} />
        <span className="patient-chip-name">{current.firstName}</span>
        <span className="patient-chip-caret"><ChevronDownIcon /></span>
      </button>

      {open && (
        <div className="patient-popover" role="menu" aria-label="Choose who you're tracking">
          <p className="patient-popover-title">Who is this about?</p>

          <div className="patient-popover-list">
            {options.map((p, i) => {
              const active = p.id === activeId;
              return (
                <button
                  key={p.id ?? 'owner'}
                  ref={el => { optionRefs.current[i] = el; }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  className={`patient-option ${active ? 'active' : ''}`}
                  onClick={() => choose(p)}
                  onMouseEnter={() => setFocusIndex(i)}
                >
                  <PatientAvatar avatarKey={p.avatarKey} seed={patientSeed(p)} size={36} />
                  <span className="patient-option-text">
                    <span className="patient-option-name">{p.firstName}</span>
                    {subtitleFor(p) && <span className="patient-option-sub">{subtitleFor(p)}</span>}
                  </span>
                  {active && <span className="patient-option-check"><CheckCircleIcon /></span>}
                </button>
              );
            })}
          </div>

          {onManageFamily && (
            <button
              type="button"
              className="patient-popover-footer"
              onClick={() => { close(false); onManageFamily(); }}
            >
              <UsersIcon /> Manage family
            </button>
          )}
        </div>
      )}
    </div>
  );
}

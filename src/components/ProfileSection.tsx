import { useState, type ComponentType, type ReactNode } from 'react';
import { ChevronDownIcon } from './icons';

// ── Collapsible Section ──
export default function Section({ title, icon: Icon, badge, defaultOpen = false, children }: {
  title: string; icon: ComponentType; badge?: string | number;
  defaultOpen?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="profile-section">
      <button onClick={() => setOpen(!open)} className="profile-section-header">
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon /> {title}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {badge !== undefined && <span className="profile-badge">{badge}</span>}
          <span style={{ display: 'flex', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}><ChevronDownIcon /></span>
        </span>
      </button>
      {open && <div className="profile-section-body">{children}</div>}
    </div>
  );
}

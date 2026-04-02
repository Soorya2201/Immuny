// ─── SMARTWATCH STATUS COMPONENT ─────────────────────────────────────────────

import { useState } from 'react';

export interface Vitals {
  heart_rate: number | null;
  spo2: number | null;
  respiratory_rate: number | null;
  skin_temp: number | null;
}

function VitalRow({ label, value, unit, warn, danger }: {
  label: string; value: number | null; unit: string;
  warn: (v: number) => boolean; danger: (v: number) => boolean;
}) {
  if (value === null || value === undefined) return null;
  const isDanger = danger(value);
  const isWarn   = !isDanger && warn(value);
  const color    = isDanger ? '#DC2626' : isWarn ? '#F59E0B' : '#374151';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: '#6B7280' }}>{label}</span>
      <span style={{ fontWeight: 700, color }}>{value} {unit}</span>
    </div>
  );
}

export default function WatchStatus({ connected, vitals, alertLevel }: {
  connected: boolean | null;
  vitals: Vitals | null;
  alertLevel: 'normal' | 'warning' | 'critical';
}) {
  const [showPanel, setShowPanel] = useState(false);
  const color = !connected ? '#9CA3AF'
    : alertLevel === 'critical' ? '#DC2626'
    : alertLevel === 'warning'  ? '#F59E0B'
    : '#22C55E';
  const icon  = !connected ? '⌚' : alertLevel !== 'normal' ? '⚠️' : '💚';
  const label = connected === null ? 'Checking…'
    : !connected ? 'Watch not connected'
    : alertLevel === 'critical' ? 'CRITICAL alert'
    : alertLevel === 'warning'  ? 'Warning detected'
    : 'Watch connected';

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setShowPanel(p => !p)} title={label} style={{
        background: `${color}33`, border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
        borderRadius: 20, outline: alertLevel !== 'normal' && connected ? `2px solid ${color}` : 'none',
      }}>
        <span style={{ fontSize: '1.1rem' }}>{icon}</span>
        <span style={{
          width: 10, height: 10, borderRadius: '50%', background: color,
          display: 'inline-block',
          boxShadow: connected && alertLevel !== 'normal' ? `0 0 8px ${color}` : 'none',
          animation: connected && alertLevel !== 'normal' ? 'pulse 1.5s infinite' : 'none',
        }} />
      </button>

      {showPanel && (
        <div style={{
          position: 'absolute', top: '110%', right: 0, width: 220,
          background: 'white', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          padding: 16, zIndex: 9999, color: '#111B21',
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: '#4A7BA7' }}>⌚ Smartwatch Status</div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
            padding: '6px 10px', borderRadius: 8,
            background: !connected ? '#F3F4F6' : alertLevel === 'critical' ? '#FEE2E2' : alertLevel === 'warning' ? '#FEF3C7' : '#DCFCE7',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color }}>{label}</span>
          </div>
          {connected && vitals && (
            <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <VitalRow label="❤️ Heart Rate"  value={vitals.heart_rate}       unit="bpm"  warn={v => v > 100} danger={v => v > 110} />
              <VitalRow label="🫁 SpO2"         value={vitals.spo2}             unit="%"    warn={v => v < 96}  danger={v => v < 94}  />
              <VitalRow label="💨 Resp. Rate"  value={vitals.respiratory_rate} unit="/min" warn={v => v > 18}  danger={v => v > 22}  />
              <VitalRow label="🌡️ Skin Temp"  value={vitals.skin_temp}        unit="°C"   warn={_ => false}   danger={_ => false}   />
            </div>
          )}
          {!connected && <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 8 }}>Make sure the Colab API is running and ngrok URL is set.</p>}
        </div>
      )}
    </div>
  );
}
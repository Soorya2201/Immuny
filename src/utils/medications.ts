export interface MedicationRow {
  id: string;
  name: string;
  dose: string | null;
  unit: string | null;
  route: string | null;
  timeLabel: string | null;
  scheduledTime: string | null; // 'HH:MM' 24-hour, null for as-needed
  frequency: string | null;
  active: boolean;
  createdAt: string;
}

export interface MedicationLogRow {
  id: string;
  medicationId: string;
  takenAt: string; // ISO datetime
}

export type DoseStatus = 'taken' | 'missed' | 'upcoming' | 'asNeeded';

export interface TodayDoseEntry {
  medication: MedicationRow;
  status: DoseStatus;
  isNext: boolean;
}

export interface AdherenceCell {
  dateStr: string;
  status: 'taken' | 'missed' | 'none';
}

export interface AdherenceRow {
  medication: MedicationRow;
  cells: AdherenceCell[];
}

// Local (not UTC) YYYY-MM-DD — matters near midnight.
export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function scheduledDateTime(scheduledTime: string, onDay: Date): Date {
  const [h, min] = scheduledTime.split(':').map(Number);
  const dt = new Date(onDay);
  dt.setHours(h, min, 0, 0);
  return dt;
}

export function computeTodayOrder(
  meds: MedicationRow[],
  logs: MedicationLogRow[],
  now: Date,
): TodayDoseEntry[] {
  const todayStr = localDateStr(now);

  const entries: TodayDoseEntry[] = meds
    .filter(m => m.active)
    .map(m => {
      const takenToday = logs.some(
        l => l.medicationId === m.id && localDateStr(new Date(l.takenAt)) === todayStr,
      );
      let status: DoseStatus;
      if (takenToday) status = 'taken';
      else if (!m.scheduledTime) status = 'asNeeded';
      else status = now >= scheduledDateTime(m.scheduledTime, now) ? 'missed' : 'upcoming';
      return { medication: m, status, isNext: false };
    })
    .sort((a, b) => (a.medication.scheduledTime ?? '99:99').localeCompare(b.medication.scheduledTime ?? '99:99'));

  const nextIdx = entries.findIndex(e => e.status === 'upcoming');
  if (nextIdx >= 0) entries[nextIdx].isNext = true;

  return entries;
}

export function getNextUpcoming(
  meds: MedicationRow[],
  logs: MedicationLogRow[],
  now: Date,
): TodayDoseEntry | null {
  return computeTodayOrder(meds, logs, now).find(e => e.isNext) ?? null;
}

export function buildAdherenceGrid(
  meds: MedicationRow[],
  logs: MedicationLogRow[],
  days: number,
  now: Date,
): AdherenceRow[] {
  const dateList: Date[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dateList.push(d);
  }

  return meds
    .filter(m => m.active)
    .map(m => {
      const createdDateStr = localDateStr(new Date(m.createdAt));
      const cells: AdherenceCell[] = dateList.map(d => {
        const dStr = localDateStr(d);

        if (dStr < createdDateStr) return { dateStr: dStr, status: 'none' };

        const takenThatDay = logs.some(
          l => l.medicationId === m.id && localDateStr(new Date(l.takenAt)) === dStr,
        );
        if (takenThatDay) return { dateStr: dStr, status: 'taken' };

        if (!m.scheduledTime) return { dateStr: dStr, status: 'none' };

        const isToday = dStr === localDateStr(now);
        if (isToday) {
          const scheduled = scheduledDateTime(m.scheduledTime, d);
          return { dateStr: dStr, status: now >= scheduled ? 'missed' : 'none' };
        }
        // Every day in dateList before today has fully elapsed.
        return { dateStr: dStr, status: 'missed' };
      });
      return { medication: m, cells };
    });
}

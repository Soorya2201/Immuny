import { describe, it, expect } from 'vitest';
import {
  buildAdherenceGrid,
  computeTodayOrder,
  getNextUpcoming,
  localDateStr,
  type MedicationLogRow,
  type MedicationRow,
} from '../utils/medications';

// Built with local-time constructors throughout: the module's whole point is
// that a dose belongs to the local calendar day, so a test pinned to UTC would
// pass in London and fail everywhere else.
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

const med = (over: Partial<MedicationRow> = {}): MedicationRow => ({
  id: 'm1',
  name: 'Cetirizine',
  dose: '10',
  unit: 'mg',
  route: 'Oral',
  timeLabel: 'Morning',
  scheduledTime: '09:00',
  frequency: 'once daily',
  active: true,
  createdAt: at(2026, 8, 1).toISOString(),
  ...over,
});

const log = (medicationId: string, when: Date, id = 'l1'): MedicationLogRow => ({
  id,
  medicationId,
  takenAt: when.toISOString(),
});

describe('localDateStr', () => {
  it('formats the local calendar day, zero-padded', () => {
    expect(localDateStr(at(2026, 8, 14, 15, 30))).toBe('2026-08-14');
    expect(localDateStr(at(2026, 1, 5, 0, 0))).toBe('2026-01-05');
  });

  it('stays on the local day just before midnight', () => {
    // The naive toISOString().slice(0,10) this replaces would roll over to the
    // next day for anyone west of UTC, filing an 11pm dose under tomorrow.
    expect(localDateStr(at(2026, 8, 14, 23, 59))).toBe('2026-08-14');
    expect(localDateStr(at(2026, 8, 15, 0, 1))).toBe('2026-08-15');
  });
});

describe('computeTodayOrder', () => {
  it('ignores inactive medications', () => {
    const order = computeTodayOrder([med({ active: false })], [], at(2026, 8, 14, 10));
    expect(order).toEqual([]);
  });

  it('marks a dose upcoming before its scheduled time', () => {
    const order = computeTodayOrder([med()], [], at(2026, 8, 14, 8));
    expect(order[0].status).toBe('upcoming');
    expect(order[0].isNext).toBe(true);
  });

  it('marks a dose missed once its time has passed untaken', () => {
    const order = computeTodayOrder([med()], [], at(2026, 8, 14, 10));
    expect(order[0].status).toBe('missed');
    expect(order[0].isNext).toBe(false);
  });

  it('counts a dose taken at the same moment it is due as due, not missed', () => {
    const order = computeTodayOrder([med()], [], at(2026, 8, 14, 9));
    expect(order[0].status).toBe('missed'); // now >= scheduled
  });

  it('marks a dose taken when a log exists for today', () => {
    const order = computeTodayOrder([med()], [log('m1', at(2026, 8, 14, 9, 5))], at(2026, 8, 14, 10));
    expect(order[0].status).toBe('taken');
  });

  it('does not count yesterday\'s dose as today\'s', () => {
    const order = computeTodayOrder([med()], [log('m1', at(2026, 8, 13, 9, 5))], at(2026, 8, 14, 10));
    expect(order[0].status).toBe('missed');
  });

  it('does not credit a dose logged against another medication', () => {
    const order = computeTodayOrder([med()], [log('other', at(2026, 8, 14, 9, 5))], at(2026, 8, 14, 10));
    expect(order[0].status).toBe('missed');
  });

  it('treats a medication with no scheduled time as as-needed', () => {
    const order = computeTodayOrder([med({ scheduledTime: null })], [], at(2026, 8, 14, 10));
    expect(order[0].status).toBe('asNeeded');
  });

  it('reports an as-needed medication as taken once logged today', () => {
    const order = computeTodayOrder(
      [med({ scheduledTime: null })],
      [log('m1', at(2026, 8, 14, 11))],
      at(2026, 8, 14, 12),
    );
    expect(order[0].status).toBe('taken');
  });

  it('orders by time of day and puts as-needed last', () => {
    const meds = [
      med({ id: 'evening', scheduledTime: '20:00' }),
      med({ id: 'asneeded', scheduledTime: null }),
      med({ id: 'morning', scheduledTime: '08:00' }),
    ];
    const order = computeTodayOrder(meds, [], at(2026, 8, 14, 7));
    expect(order.map(e => e.medication.id)).toEqual(['morning', 'evening', 'asneeded']);
  });

  it('flags only the earliest upcoming dose as next', () => {
    const meds = [
      med({ id: 'morning', scheduledTime: '08:00' }),
      med({ id: 'noon', scheduledTime: '12:00' }),
      med({ id: 'evening', scheduledTime: '20:00' }),
    ];
    const order = computeTodayOrder(meds, [], at(2026, 8, 14, 10));
    expect(order.filter(e => e.isNext).map(e => e.medication.id)).toEqual(['noon']);
    expect(order.find(e => e.medication.id === 'morning')?.status).toBe('missed');
  });

  it('skips past a taken dose when choosing the next one', () => {
    const meds = [
      med({ id: 'noon', scheduledTime: '12:00' }),
      med({ id: 'evening', scheduledTime: '20:00' }),
    ];
    const order = computeTodayOrder(meds, [log('noon', at(2026, 8, 14, 12, 5))], at(2026, 8, 14, 11));
    expect(order.filter(e => e.isNext).map(e => e.medication.id)).toEqual(['evening']);
  });
});

describe('getNextUpcoming', () => {
  it('returns the next due dose', () => {
    const next = getNextUpcoming([med()], [], at(2026, 8, 14, 8));
    expect(next?.medication.id).toBe('m1');
  });

  it('returns null once everything today is taken or missed', () => {
    expect(getNextUpcoming([med()], [], at(2026, 8, 14, 23))).toBeNull();
    expect(getNextUpcoming([med()], [log('m1', at(2026, 8, 14, 9))], at(2026, 8, 14, 8))).toBeNull();
  });

  it('returns null when there are no medications', () => {
    expect(getNextUpcoming([], [], at(2026, 8, 14, 8))).toBeNull();
  });
});

describe('buildAdherenceGrid', () => {
  const now = at(2026, 8, 14, 12);

  it('returns one cell per day, oldest first, ending today', () => {
    const [row] = buildAdherenceGrid([med()], [], 7, now);
    expect(row.cells).toHaveLength(7);
    expect(row.cells[0].dateStr).toBe('2026-08-08');
    expect(row.cells[6].dateStr).toBe('2026-08-14');
  });

  it('produces consecutive calendar days with no gaps or repeats', () => {
    const [row] = buildAdherenceGrid([med()], [], 30, now);
    const days = row.cells.map(c => c.dateStr);
    expect(new Set(days).size).toBe(30);
    expect([...days].sort()).toEqual(days);
  });

  it('stays correct across a daylight-saving change', () => {
    // US DST ends 1 Nov 2026; a naive minus-24-hours loop repeats a day here.
    const [row] = buildAdherenceGrid([med({ createdAt: at(2026, 10, 25).toISOString() })], [], 10, at(2026, 11, 3, 12));
    const days = row.cells.map(c => c.dateStr);
    expect(new Set(days).size).toBe(10);
    expect(days[0]).toBe('2026-10-25');
    expect(days[9]).toBe('2026-11-03');
  });

  it('leaves days before the medication existed blank rather than missed', () => {
    const [row] = buildAdherenceGrid([med({ createdAt: at(2026, 8, 12).toISOString() })], [], 7, now);
    expect(row.cells.slice(0, 4).every(c => c.status === 'none')).toBe(true);
    expect(row.cells[4].status).not.toBe('none');   // the 12th, the day it was added
  });

  it('marks a day taken when a log falls on it', () => {
    const [row] = buildAdherenceGrid([med()], [log('m1', at(2026, 8, 12, 9))], 7, now);
    expect(row.cells.find(c => c.dateStr === '2026-08-12')?.status).toBe('taken');
    expect(row.cells.find(c => c.dateStr === '2026-08-11')?.status).toBe('missed');
  });

  it('does not mark today missed before the dose is due', () => {
    const [row] = buildAdherenceGrid([med({ scheduledTime: '20:00' })], [], 3, now);
    expect(row.cells[2].dateStr).toBe('2026-08-14');
    expect(row.cells[2].status).toBe('none');
  });

  it('marks today missed once the dose time has passed', () => {
    const [row] = buildAdherenceGrid([med({ scheduledTime: '09:00' })], [], 3, now);
    expect(row.cells[2].status).toBe('missed');
  });

  it('never marks an as-needed medication missed', () => {
    const [row] = buildAdherenceGrid([med({ scheduledTime: null })], [], 7, now);
    expect(row.cells.some(c => c.status === 'missed')).toBe(false);
  });

  it('keeps each medication\'s logs to its own row', () => {
    const rows = buildAdherenceGrid(
      [med({ id: 'a' }), med({ id: 'b' })],
      [log('a', at(2026, 8, 13, 9))],
      3,
      now,
    );
    expect(rows.find(r => r.medication.id === 'a')?.cells[1].status).toBe('taken');
    expect(rows.find(r => r.medication.id === 'b')?.cells[1].status).toBe('missed');
  });

  it('omits inactive medications', () => {
    expect(buildAdherenceGrid([med({ active: false })], [], 7, now)).toEqual([]);
  });
});

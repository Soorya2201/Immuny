import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { formatRelativeTime, formatPostTime } from '../utils/formatTime';

const FIXED_NOW = new Date('2024-06-15T12:00:00Z').getTime();

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

function minsAgo(n: number) { return new Date(FIXED_NOW - n * 60_000).toISOString(); }
function hoursAgo(n: number) { return new Date(FIXED_NOW - n * 3_600_000).toISOString(); }
function daysAgo(n: number) { return new Date(FIXED_NOW - n * 86_400_000).toISOString(); }

describe('formatRelativeTime', () => {
  it('returns empty string for empty input', () => {
    expect(formatRelativeTime('')).toBe('');
  });

  it('returns minutes ago for < 1 hour', () => {
    expect(formatRelativeTime(minsAgo(5))).toBe('5m ago');
    expect(formatRelativeTime(minsAgo(45))).toBe('45m ago');
  });

  it('returns hours ago for < 24 hours', () => {
    expect(formatRelativeTime(hoursAgo(2))).toBe('2h ago');
    expect(formatRelativeTime(hoursAgo(23))).toBe('23h ago');
  });

  it('returns days ago for >= 24 hours', () => {
    expect(formatRelativeTime(daysAgo(1))).toBe('1d ago');
    expect(formatRelativeTime(daysAgo(7))).toBe('7d ago');
  });
});

describe('formatPostTime', () => {
  it('returns empty string for empty input', () => {
    expect(formatPostTime('')).toBe('');
  });

  it('returns Just now for < 1 hour', () => {
    expect(formatPostTime(minsAgo(30))).toBe('Just now');
    expect(formatPostTime(minsAgo(59))).toBe('Just now');
  });

  it('returns hours for < 24 hours', () => {
    expect(formatPostTime(hoursAgo(5))).toBe('5hr');
    expect(formatPostTime(hoursAgo(23))).toBe('23hr');
  });

  it('returns days for >= 24 hours', () => {
    expect(formatPostTime(daysAgo(2))).toBe('2d');
    expect(formatPostTime(daysAgo(10))).toBe('10d');
  });
});

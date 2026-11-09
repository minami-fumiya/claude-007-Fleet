import { describe, expect, it } from 'vitest';
import {
  clockText, frontCovers, frontsAt, isNightHour, localHour, msToNextTurn, timeOfDayAt, weatherAt, WORLD_HOUR_MS,
} from '@/systems/WorldClock';
import { TimeOfDay, Weather } from '@/types/Weather';

const COLS = 288;
const ROWS = 160;

describe('0.0.72 世界の時計 (#445)', () => {
  it('runs a world hour in five real minutes, a day in two real hours', () => {
    const t0 = Date.UTC(2026, 10, 9, 0, 0);
    expect(localHour(t0 + WORLD_HOUR_MS, 0) - localHour(t0, 0)).toBeCloseTo(1, 6);
    expect(localHour(t0 + 24 * WORLD_HOUR_MS, 0)).toBeCloseTo(localHour(t0, 0), 6);
  });

  it('keeps local time by longitude: fifteen degrees to the hour', () => {
    const t = Date.UTC(2026, 10, 9, 1, 0);
    expect((localHour(t, 90) - localHour(t, 0) + 24) % 24).toBeCloseTo(6, 6);
    expect(localHour(t, -180)).toBeGreaterThanOrEqual(0);
  });

  it('is night from 20:00 to 05:00 and says how long until it turns', () => {
    expect(isNightHour(21)).toBe(true);
    expect(isNightHour(4.9)).toBe(true);
    expect(isNightHour(5)).toBe(false);
    expect(isNightHour(19.9)).toBe(false);
    // Find a moment of local noon at longitude 0 and check the turn comes eight world hours later.
    let t = Date.UTC(2026, 10, 9);
    while (Math.abs(localHour(t, 0) - 12) > 0.01) t += WORLD_HOUR_MS / 100;
    expect(timeOfDayAt(t, 0)).toBe(TimeOfDay.Day);
    expect(msToNextTurn(t, 0) / WORLD_HOUR_MS).toBeCloseTo(8, 1);
    expect(timeOfDayAt(t + msToNextTurn(t, 0) + 1000, 0)).toBe(TimeOfDay.Night);
    expect(clockText(14.5)).toBe('14:30');
  });
});

describe('0.0.72 天候の前線 (#445)', () => {
  it('is the same at the same time on every device (deterministic)', () => {
    const t = Date.UTC(2026, 10, 9, 3, 17);
    expect(frontsAt(t, COLS, ROWS)).toEqual(frontsAt(t, COLS, ROWS));
  });

  it('drifts east as the hours go', () => {
    const t = Date.UTC(2026, 10, 9, 3, 0);
    const a = frontsAt(t, COLS, ROWS);
    const b = frontsAt(t + WORLD_HOUR_MS, COLS, ROWS);
    const moved = a.filter((f, i) => f.id === b[i].id).map((f, i) => (b[i].c - f.c + COLS) % COLS);
    expect(moved.length).toBeGreaterThan(0);
    for (const d of moved) expect(d).toBeGreaterThanOrEqual(1);
  });

  it('covers some of the sea but leaves most of it clear, storms the least', () => {
    const t = Date.UTC(2026, 10, 9, 5, 0);
    const count: Record<string, number> = {};
    for (let r = 0; r < ROWS; r += 2) for (let c = 0; c < COLS; c += 2) {
      const w = weatherAt(t, c, r, COLS, ROWS);
      count[w] = (count[w] ?? 0) + 1;
    }
    const total = Object.values(count).reduce((a, b) => a + b, 0);
    expect((count[Weather.Clear] ?? 0) / total).toBeGreaterThan(0.5);
    expect((count[Weather.Storm] ?? 0) / total).toBeLessThan(0.15);
  });

  it('wraps a front across the east-west join', () => {
    const f = { id: 'x', weather: Weather.Storm, c: COLS - 2, r0: 10, rows: 5, width: 6 };
    expect(frontCovers(f, 1, 12, COLS)).toBe(true);
    expect(frontCovers(f, 5, 12, COLS)).toBe(false);
    expect(frontCovers(f, 1, 20, COLS)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  fleePoint, meetResponse, MAX_NEAR, pathLength, residentDay, residentPos, residentsFor, residentsNear, seaLine, theaterCells, worldGap,
} from '@/systems/WorldSim';
import { SECTOR_PX, WORLD_PX, homePort, isSea, theaterOf } from '@/systems/OpenSeaSystem';
import { WORLD_HOUR_MS } from '@/systems/WorldClock';

const T0 = Date.UTC(2026, 10, 9, 6, 0);
const IJN_SEAS = ['pacific', 'north_pacific', 'indian'];

describe('0.0.72 住人 (#445)', () => {
  const list = residentsFor('IJN', IJN_SEAS, residentDay(T0));

  it('draws the same residents for the same day, and new ones the next day', () => {
    expect(residentsFor('IJN', IJN_SEAS, residentDay(T0))).toEqual(list);
    const tomorrow = residentsFor('IJN', IJN_SEAS, residentDay(T0) + 1);
    expect(tomorrow.map((r) => r.id)).not.toEqual(list.map((r) => r.id));
    expect(list.every((r) => r.id.startsWith(`${residentDay(T0)}:`))).toBe(true);
  });

  it('has patrols and convoys in every sea, and the navy\'s own patrols off its home port only', () => {
    for (const t of IJN_SEAS) {
      expect(list.some((r) => r.kind === 'patrol' && r.theater === t), t).toBe(true);
      expect(list.some((r) => r.kind === 'convoy' && r.theater === t), t).toBe(true);
    }
    const home = homePort('IJN')!;
    const friends = list.filter((r) => r.kind === 'friend');
    expect(friends.length).toBeGreaterThan(0);
    for (const f of friends) expect(f.theater).toBe(theaterOf(home.c, home.r));
  });

  it('sails only on the sea: every leg is a sea line, and it is on the sea at any time', () => {
    for (const r of list) {
      const pts = r.kind === 'convoy' ? r.path : [...r.path, r.path[0]];
      for (let i = 1; i < pts.length; i++) expect(seaLine(pts[i - 1], pts[i]), r.id).toBe(true);
      for (let k = 0; k < 6; k++) {
        const p = residentPos(r, T0 + k * WORLD_HOUR_MS * 3.7);
        expect(isSea(Math.floor(p.x / SECTOR_PX), Math.floor(p.y / SECTOR_PX)), `${r.id} at ${k}`).toBe(true);
      }
    }
  });

  it('moves at its speed: a world hour later it has gone about `speed` sectors (less where it turns)', () => {
    for (const r of list.slice(0, 20)) {
      const a = residentPos(r, T0);
      const b = residentPos(r, T0 + WORLD_HOUR_MS / 4);
      expect(worldGap(a, b) / SECTOR_PX, r.id).toBeLessThanOrEqual(r.speed / 4 + 0.01);
      expect(pathLength(r)).toBeGreaterThan(0);
    }
    // Over real seconds the step is small (no jumps on screen).
    const r = list[0];
    expect(worldGap(residentPos(r, T0), residentPos(r, T0 + 1000))).toBeLessThan(SECTOR_PX * 0.02);
  });

  it('finds those near a point, nearest first, at most sixty', () => {
    const r = list[3];
    const at = residentPos(r, T0);
    const near = residentsNear(list, { x: at.x + 500, y: at.y }, T0);
    expect(near[0].r.id).toBe(r.id);
    expect(near.length).toBeLessThanOrEqual(MAX_NEAR);
    for (let i = 1; i < near.length; i++) expect(near[i].dist).toBeGreaterThanOrEqual(near[i - 1].dist);
  });

  it('keeps the numbers modest: sixty at most within sight of any point of the sea', () => {
    const cells = theaterCells().pacific;
    for (let i = 0; i < cells.length; i += 997) {
      const s = cells[i];
      expect(residentsNear(list, { x: (s.c + 0.5) * SECTOR_PX, y: (s.r + 0.5) * SECTOR_PX }, T0, SECTOR_PX * 6).length).toBeLessThanOrEqual(MAX_NEAR);
    }
  });
});

describe('0.0.72 発見 → 追跡 / 逃走', () => {
  it('a convoy always runs; a patrol runs only from a fleet much stronger than itself', () => {
    expect(meetResponse('convoy', 9999, 1)).toBe('flee');
    expect(meetResponse('patrol', 500, 1000)).toBe('flee');
    expect(meetResponse('patrol', 700, 1000)).toBe('chase');
  });

  it('runs straight away from the fleet, across the east-west join too', () => {
    const p = fleePoint({ x: 1000, y: 5000 }, { x: 2000, y: 5000 });
    expect(p.x).toBeLessThan(1000);
    const q = fleePoint({ x: 100, y: 5000 }, { x: WORLD_PX.w - 100, y: 5000 });
    expect(q.x).toBeGreaterThan(100);
  });
});

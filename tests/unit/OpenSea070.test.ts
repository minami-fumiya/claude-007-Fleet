import { describe, expect, it } from 'vitest';
import { framePixel, framePoint, frameRadius, inFrameZone, seaFrame } from '@/systems/SeaFrame';
import { BATTLE_WORLD } from '@/systems/BattleLayout';
import { anchorAt, baseAnchor, FUEL_MAX, OPEN_SEA_OBJECTIVES, parseAnchors, placeFuel } from '@/systems/OpenSeaSystem';
import { Objective } from '@/types/Campaign';

const close = (a: { x: number; y: number }, b: { x: number; y: number }): void => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe('0.0.70 the objective ground at sea (SeaFrame)', () => {
  const centre = { x: 10_000, y: 20_000 };

  it('is the battle square itself when the fleet comes from the south', () => {
    const f = seaFrame(centre, { x: centre.x, y: centre.y + 3000 });
    expect(f.size).toBe(BATTLE_WORLD.w);
    close(framePoint(f, { x: 0.5, y: 0.5 }), centre);
    // The zone of a breakthrough (north on the campaign map) lies beyond the middle, away from the fleet.
    close(framePoint(f, { x: 0.5, y: 0.1 }), { x: centre.x, y: centre.y - 0.4 * f.size });
  });

  it('turns so that the fleet always comes in from the battle square\'s south', () => {
    for (const from of [{ x: centre.x + 3000, y: centre.y }, { x: centre.x, y: centre.y - 3000 }, { x: centre.x - 2000, y: centre.y + 2000 }]) {
      const f = seaFrame(centre, from);
      const south = framePoint(f, { x: 0.5, y: 1 });
      const toSouth = Math.atan2(south.y - centre.y, south.x - centre.x);
      const toFleet = Math.atan2(from.y - centre.y, from.x - centre.x);
      expect(Math.cos(toSouth - toFleet)).toBeCloseTo(1, 6);
    }
  });

  it('starts a convoy on the fleet\'s side (west faces the fleet)', () => {
    const from = { x: centre.x + 4000, y: centre.y };
    const f = seaFrame(centre, from, 'west');
    const west = framePoint(f, { x: 0, y: 0.5 });
    const east = framePoint(f, { x: 1, y: 0.5 });
    expect(Math.hypot(west.x - from.x, west.y - from.y)).toBeLessThan(Math.hypot(east.x - from.x, east.y - from.y));
  });

  it('keeps distances and zone sizes as on the campaign map', () => {
    const f = seaFrame(centre, { x: centre.x + 1234, y: centre.y + 987 });
    const a = framePoint(f, { x: 0.2, y: 0.3 });
    const b = framePoint(f, { x: 0.7, y: 0.9 });
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(Math.hypot(0.5, 0.6) * f.size, 6);
    expect(frameRadius(f, 0.05)).toBe(0.05 * BATTLE_WORLD.w);
    const zone = { x: 0.5, y: 0.1, r: 0.05 };
    const z = framePoint(f, zone);
    expect(inFrameZone(f, z.x, z.y, zone)).toBe(true);
    expect(inFrameZone(f, centre.x, centre.y, zone)).toBe(false);
  });

  it('places pixels of the square (minefields, the convoy) the same way', () => {
    const f = seaFrame(centre, { x: centre.x - 500, y: centre.y + 3000 });
    close(framePixel(f, { x: 800, y: 1600 }), framePoint(f, { x: 0.25, y: 0.5 }));
  });

  it('stands still when the fleet is on the middle (no turn)', () => {
    const f = seaFrame(centre, centre);
    close(framePoint(f, { x: 0.5, y: 1 }), { x: centre.x, y: centre.y + f.size / 2 });
  });
});

describe('0.0.70 every objective is fought at sea', () => {
  it('covers all seven objectives', () => {
    expect([...OPEN_SEA_OBJECTIVES].sort()).toEqual(Object.values(Objective).sort());
  });
});

describe('0.0.70 fuel lies with the fleet', () => {
  it('keeps what is left at sea and fills the tank in a base', () => {
    const sea = { x: 5000, y: 7000 };
    let anchors = anchorAt([], ['a'], sea, 'IJN', 37.5);
    expect(placeFuel(anchors, sea)).toBe(37.5);
    const base = baseAnchor('ijn_fb_indian')!;
    anchors = anchorAt(anchors, ['a'], base, 'IJN', 3);
    expect(placeFuel(anchors, base)).toBe(FUEL_MAX);
    expect(anchors.find((g) => g.at.base === base.base)?.fuel).toBe(FUEL_MAX);
  });

  it('a group joined at sea keeps the lower tank; a missing tank reads full', () => {
    const sea = { x: 5000, y: 7000 };
    const anchors = anchorAt(anchorAt([], ['a'], sea, 'IJN', 60), ['b'], sea, 'IJN', 20);
    expect(anchors).toEqual([{ shipIds: ['a', 'b'], at: sea, fuel: 20 }]);
    expect(placeFuel([{ shipIds: ['c'], at: sea }], sea)).toBe(FUEL_MAX);
    expect(parseAnchors([{ shipIds: ['c'], at: sea, fuel: 250 }])[0].fuel).toBe(FUEL_MAX);
    expect(parseAnchors([{ shipIds: ['c'], at: sea, fuel: 'x' }])[0].fuel).toBeUndefined();
  });
});

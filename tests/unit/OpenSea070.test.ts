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

describe('0.0.70 practice grounds and the places on the sea', () => {
  it('gives every navy a training ground and an exercise ground at sea, off its home port and clear of the areas', async () => {
    const os = await import('@/systems/OpenSeaSystem');
    for (const n of Object.keys(os.WORLD_MAP.homePorts)) {
      const g = os.practiceGrounds(n);
      expect(g, n).not.toBeNull();
      for (const s of [g!.training, g!.exercise]) {
        expect(os.isSea(s.c, s.r), n).toBe(true);
        expect(os.areaAt(s), n).toBeUndefined();
      }
      expect(g!.training.c !== g!.exercise.c || g!.training.r !== g!.exercise.r, n).toBe(true);
    }
  });

  it("puts each navy's six places (two ports, oil, mine, convoy, stronghold) at sea, reachable from its home port", async () => {
    const os = await import('@/systems/OpenSeaSystem');
    const sp = await import('@/systems/SeaPlaceSystem');
    for (const n of Object.keys(os.WORLD_MAP.homePorts)) {
      const places = sp.seaPlaces(n);
      expect(places.map((p) => p.kind).sort(), n).toEqual(['convoy', 'fort', 'mine', 'oil', 'port', 'port']);
      const steps = os.seaSteps(os.homePort(n)!);
      for (const p of places) {
        expect(os.isSea(p.c, p.r), p.id).toBe(true);
        expect(steps[p.r * os.WORLD_MAP.cols + p.c], p.id).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('pays a resource point once a game hour and the stronghold once a week', async () => {
    const sp = await import('@/systems/SeaPlaceSystem');
    const ws = await import('@/systems/WorldSystem');
    const [oil] = sp.seaPlaces('IJN').filter((p) => p.kind === 'oil');
    const [fort] = sp.seaPlaces('IJN').filter((p) => p.kind === 'fort');
    const now = Date.UTC(2026, 10, 9, 3, 10);
    let world = ws.emptyWorld();
    expect(sp.placeReady(world, oil, 'IJN', now)).toBe(true);
    world = sp.markPlace(world, oil, now);
    expect(sp.placeReady(world, oil, 'IJN', now + 60_000)).toBe(false);
    expect(sp.placeReady(world, oil, 'IJN', now + 3_600_000)).toBe(true);
    world = sp.markPlace(world, fort, now);
    expect(sp.placeReady(world, fort, 'IJN', now + 3_600_000)).toBe(false);
    expect(sp.placeReward(oil, 'IJN').fuel).toBeGreaterThan(0);
  });
});

describe('0.0.70 編成のおすすめ (#416)', () => {
  it('hints a remodel within reach first, then an empty upgrade slot with upgrades in the stock', async () => {
    const { fleetHint, upgradeSlots } = await import('@/systems/CustomizationSystem');
    expect(fleetHint({ canRefit: true, refitStage: 0, fitted: 0, stockTotal: 0 })).toBe('改装できる');
    expect(fleetHint({ canRefit: false, refitStage: 1, fitted: 0, stockTotal: 3 })).toBe('装備に空き');
    expect(fleetHint({ canRefit: false, refitStage: 1, fitted: upgradeSlots(1), stockTotal: 3 })).toBeNull();
    expect(fleetHint({ canRefit: false, refitStage: 1, fitted: 0, stockTotal: 0 })).toBeNull();
  });
});

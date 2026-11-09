import { describe, expect, it } from 'vitest';
import {
  advanceOrders, arrivesAt, IOffscreenWorld, movingShips, OFFSCREEN_FLOOR, offscreenHurt, orderPos, orderVoyage, parseOrder, routeSectors, runMs,
} from '@/systems/FleetOrders';
import { anchorAt, anchorages, baseAnchor, fleetStart, findRoute, FUEL_MAX, parseAnchors, SECTOR_PX, shipsAt, WORLD_MAP } from '@/systems/OpenSeaSystem';
import { IResident, residentPos } from '@/systems/WorldSim';
import { WORLD_HOUR_MS } from '@/systems/WorldClock';

const T0 = Date.UTC(2026, 10, 9, 8, 0);
const truk = baseAnchor('ijn_fb_truk') ?? baseAnchor(Object.keys(WORLD_MAP.bases).find((b) => b.startsWith('ijn_') && !b.endsWith('home'))!)!;
const sea = { x: (WORLD_MAP.homePorts.IJN.c + 6.5) * SECTOR_PX, y: (WORLD_MAP.homePorts.IJN.r + 4.5) * SECTOR_PX };
const fromSector = { c: Math.floor(sea.x / SECTOR_PX), r: Math.floor(sea.y / SECTOR_PX) };
const toSector = { c: Math.floor(truk.x / SECTOR_PX), r: Math.floor(truk.y / SECTOR_PX) };
const quiet: IOffscreenWorld = { residents: [], won: () => false, power: () => 100, enemyPower: () => 50, homeFrom: () => null };

describe('0.0.72 回航の命令 (#445)', () => {
  const route = findRoute(fromSector, toSector)!;
  const fleet = anchorAt([], ['a', 'b'], sea, 'IJN', 80)[0];

  it('sets out with fuel enough, along a sea route, and tells when it arrives', () => {
    const ordered = orderVoyage(fleet, route, truk, T0);
    expect(typeof ordered).not.toBe('string');
    if (typeof ordered === 'string') return;
    expect(arrivesAt(ordered.order!)).toBe(T0 + runMs(route));
    expect(orderVoyage({ ...fleet, fuel: 1 }, route, truk, T0)).toMatch(/燃料が足りません/);
    expect(orderVoyage(fleet, null, truk, T0)).toMatch(/航路/);
  });

  it('moves along the route with the world clock and stands at the destination once there', () => {
    const ordered = orderVoyage(fleet, route, truk, T0) as typeof fleet;
    const o = ordered.order!;
    const start = orderPos(o, T0);
    expect(Math.hypot(start.x - (fromSector.c + 0.5) * SECTOR_PX, start.y - (fromSector.r + 0.5) * SECTOR_PX)).toBeLessThan(1);
    const half = orderPos(o, T0 + runMs(route) / 2);
    expect(half).not.toEqual(start);
    expect(orderPos(o, arrivesAt(o) + 1000)).toEqual({ x: truk.x, y: truk.y });
    expect(routeSectors(route)).toBeGreaterThan(0);
  });

  it('lies at the destination with a full tank in a base after arriving (even while the game was closed)', () => {
    const ordered = orderVoyage(fleet, route, truk, T0) as typeof fleet;
    const later = advanceOrders([ordered], {}, arrivesAt(ordered.order!) + WORLD_HOUR_MS * 30, quiet);
    expect(later.anchors).toEqual([{ shipIds: ['a', 'b'], at: truk, fuel: FUEL_MAX }]);
    const halfway = advanceOrders([ordered], {}, T0 + runMs(route) / 2, quiet);
    expect(halfway.anchors[0].order?.checkedAt).toBe(T0 + runMs(route) / 2);
  });

  it('keeps ships under way out of the anchorages and the builder until they arrive', () => {
    const ordered = orderVoyage(fleet, route, truk, T0) as typeof fleet;
    const anchors = [ordered, ...anchorAt([], ['c'], truk, 'IJN')];
    expect(movingShips(anchors)).toEqual(new Set(['a', 'b']));
    expect(anchorages(anchors, 'IJN').some((p) => p.x === sea.x && p.y === sea.y)).toBe(false);
    expect(shipsAt(anchors, ['a', 'b', 'c'], truk, 'IJN')).toEqual(['c']);
    expect(fleetStart(anchors, ['a'], 'IJN')).toHaveProperty('problem');
    // A fleet putting in where one under way set out doesn't join it.
    const joined = anchorAt(anchors, ['d'], sea, 'IJN', 50);
    expect(joined.find((a) => a.shipIds.includes('d'))?.order).toBeUndefined();
  });

  it('reads an order back from a save, and drops a broken one', () => {
    const ordered = orderVoyage(fleet, route, truk, T0) as typeof fleet;
    const back = parseAnchors(JSON.parse(JSON.stringify([{ ...ordered, returnAt: 'medium' }])));
    expect(back[0].order).toEqual(ordered.order);
    expect(back[0].returnAt).toBe('medium');
    expect(parseOrder({ route: [{ c: 1, r: 1 }], dest: truk, startedAt: 1 })).toBeUndefined();
    expect(parseAnchors([{ shipIds: ['a'], at: sea, order: 'x', returnAt: 'bad' }])[0]).toEqual({ shipIds: ['a'], at: sea });
  });
});

describe('0.0.72 画面の外の戦いと帰投の基準', () => {
  const route = findRoute(fromSector, toSector)!;
  const fleet = anchorAt([], ['a', 'b'], sea, 'IJN', 80)[0];
  const ordered = orderVoyage(fleet, route, truk, T0) as typeof fleet;
  // An enemy patrol lying still on the route's middle sector (a one-sector path).
  const mid = route[Math.floor(route.length / 2)];
  const foe: IResident = { id: '99:patrol:pacific:0', kind: 'patrol', theater: 'pacific', danger: 5, path: [mid, mid], speed: 0, phase: 0 };

  it('hurts the ships but never sinks them; the stronger side wins', () => {
    const w = { ...quiet, residents: [foe], enemyPower: () => 400, power: () => 100 };
    const r = advanceOrders([ordered], { a: 0.2, b: 1 }, arrivesAt(ordered.order!) + 1, { ...w, homeFrom: () => null });
    expect(r.fights).toHaveLength(1);
    expect(r.fights[0].won).toBe(false);
    expect(r.hp.a).toBeGreaterThanOrEqual(OFFSCREEN_FLOOR);
    expect(r.hp.b).toBeLessThan(1);
    expect(residentPos(foe, T0)).toBeTruthy();
    expect(offscreenHurt(100, 50, 'x')).toBeLessThan(offscreenHurt(100, 300, 'x'));
  });

  it('turns for the nearest dock when a ship falls to its 帰投の基準 (中破 here), and not with なし', () => {
    const home = { route: [mid, toSector], dest: truk };
    const w: IOffscreenWorld = { ...quiet, residents: [foe], enemyPower: () => 300, power: () => 100, homeFrom: () => home };
    const medium = advanceOrders([{ ...ordered, returnAt: 'medium' }], { a: 0.55, b: 1 }, T0 + runMs(route) * 0.9, w);
    expect(medium.fights[0].turnedHome).toBe(true);
    // The short way home was sailed by then: the fleet lies in the dock's base.
    expect(medium.anchors[0].order?.home === true || medium.anchors[0].at.base === truk.base).toBe(true);
    const none = advanceOrders([{ ...ordered, returnAt: 'none' }], { a: 0.55, b: 1 }, T0 + runMs(route) * 0.9, w);
    expect(none.fights[0].turnedHome).toBe(false);
  });

  it('meets an enemy once a run, and leaves alone those already beaten', () => {
    const w = { ...quiet, residents: [foe] };
    const first = advanceOrders([ordered], {}, T0 + runMs(route) * 0.9, w);
    expect(first.fights).toHaveLength(1);
    const again = advanceOrders(first.anchors, first.hp, T0 + runMs(route) * 0.95, w);
    expect(again.fights).toHaveLength(0);
    expect(advanceOrders([ordered], {}, T0 + runMs(route) * 0.9, { ...w, won: () => true }).fights).toHaveLength(0);
  });
});

describe('0.0.73 哨戒', () => {
  const route = findRoute(fromSector, toSector)!;
  const fleet = anchorAt([], ['a', 'b'], sea, 'IJN', 80)[0];
  const centre = route[Math.floor(route.length / 2)];
  const loop = [centre, { c: centre.c + 1, r: centre.r }];
  const foe: IResident = { id: '99:patrol:pacific:1', kind: 'patrol', theater: 'pacific', danger: 4, path: [centre, centre], speed: 0, phase: 0 };

  it('sails out, then keeps its loop for good (never arrives) until called off', async () => {
    const { orderPatrol, stopOrder, arrivesAt: arrives } = await import('@/systems/FleetOrders');
    const p = orderPatrol(fleet, route, loop, 'report', T0) as typeof fleet;
    expect(arrives(p.order!)).toBe(Infinity);
    const later = orderPos(p.order!, T0 + runMs(route) * 5);
    expect(Math.abs(Math.floor(later.y / SECTOR_PX) - centre.r)).toBeLessThanOrEqual(1);
    const stopped = stopOrder(p, T0 + runMs(route) * 5);
    expect(stopped.order).toBeUndefined();
    expect(stopped.at).toEqual(later);
  });

  it('reports what comes within three sectors once; only reporting, it keeps out of fights', async () => {
    const { orderPatrol } = await import('@/systems/FleetOrders');
    const p = orderPatrol(fleet, route, loop, 'report', T0) as typeof fleet;
    const r = advanceOrders([p], {}, T0 + runMs(route) * 3, { ...quiet, residents: [foe] });
    expect(r.sightings.map((x) => x.id)).toEqual([foe.id]);
    expect(r.fights).toHaveLength(0);
    const again = advanceOrders(r.anchors, r.hp, T0 + runMs(route) * 4, { ...quiet, residents: [foe] });
    expect(again.sightings).toHaveLength(0);
    const chase = advanceOrders([orderPatrol(fleet, route, loop, 'chase', T0) as typeof fleet], {}, T0 + runMs(route) * 3, { ...quiet, residents: [foe] });
    expect(chase.fights.length).toBeGreaterThan(0);
  });

  it('reads a patrol back from a save', () => {
    const back = parseAnchors(JSON.parse(JSON.stringify([{ ...fleet, order: { route, dest: truk, startedAt: T0, checkedAt: T0, met: [], patrol: { loop, stance: 'report' }, seen: ['x'] } }])));
    expect(back[0].order?.patrol).toEqual({ loop, stance: 'report' });
    expect(back[0].order?.seen).toEqual(['x']);
  });
});

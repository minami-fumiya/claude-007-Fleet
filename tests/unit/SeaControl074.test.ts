import { describe, expect, it } from 'vitest';
import campaignData from '@/data/campaign.json';
import {
  advanceIntercepts, advanceOrders, dutyWork, IOffscreenWorld, MINE_HOURS, orderPatrol, patrolLoop, runMs, SWEEP_HOURS,
} from '@/systems/FleetOrders';
import { anchorAt, baseAnchor, findRoute, isSea, parseAnchors, SECTOR_PX, WORLD_MAP } from '@/systems/OpenSeaSystem';
import { emptySeaControl, parseSeaControl } from '@/systems/SeaControlSystem';
import {
  addRegionEvent, CONTROL_ENEMY, CONTROL_SAFE, controlWord, eventPoints, EVENT_HOURS, fuelMul, incomeShare, LOW_FUEL_MUL, parseRegionEvents,
  regionAt, regionControl, regionOfArea, seaRegions,
} from '@/systems/SeaRegionSystem';
import { WORLD_HOUR_MS } from '@/systems/WorldClock';
import { IResident, residentPos, seaLine } from '@/systems/WorldSim';
import { ShipClass } from '@/types/ShipClass';
import { counterResident, incomeAreas, planCounter, sweptArea, withAreaEvent } from '@/utils/SeaControlView';
import { applySeaControl, emptyNationProgress } from '@/utils/ProgressStore';
import { SEA_INCOME_PER_AREA } from '@/systems/SeaControlSystem';

const T0 = Date.UTC(2026, 10, 10, 8, 0);
const H = WORLD_HOUR_MS;
const AREAS = (campaignData as { areas: Array<{ id: string; theater: string; training?: boolean }> }).areas;
const pacific = AREAS.filter((a) => a.theater === 'pacific' && !a.training).map((a) => a.id);
const none = { nation: 'IJN', cleared: [] as string[], lost: [] as string[], duties: [], events: [], classOf: () => undefined };

describe('0.0.74 海の地方 (#445 段階 C1)', () => {
  it('cuts the sea into regions round the areas and the home ports, the rest each theater’s open ocean', () => {
    const regions = seaRegions();
    expect(regions.length).toBeGreaterThan(90);
    for (const a of AREAS.filter((x) => !x.training && WORLD_MAP.areas[x.id])) expect(regionOfArea(a.id)?.areaId).toBe(a.id);
    const home = WORLD_MAP.homePorts.IJN;
    expect(regionAt(home)?.home).toBe('IJN');
    expect(regionAt(home)?.name).toMatch(/近海$/);
    expect(regions.filter((r) => r.id.startsWith('open:')).every((r) => r.name.endsWith('の外洋'))).toBe(true);
    // Every sea sector belongs to one region of its own theater.
    for (const r of regions) expect(r.cells).toBeGreaterThan(0);
    expect(regionAt({ c: home.c, r: home.r })?.theater).toBeTruthy();
  });

  it('holds an area won (50%+), loses the enemy’s seas (below 10%), and weighs fleets on duty by class', () => {
    const area = regionOfArea(pacific[0])!;
    expect(regionControl(area, { ...none, cleared: [pacific[0]] }, T0)).toBeGreaterThanOrEqual(CONTROL_SAFE);
    expect(regionControl(area, { ...none, cleared: [pacific[0]], lost: [pacific[0]] }, T0)).toBeLessThan(CONTROL_SAFE);
    const far = regionOfArea(pacific[pacific.length - 1])!;
    expect(regionControl(far, none, T0)).toBeLessThanOrEqual(CONTROL_ENEMY);
    const big = { ...none, duties: [{ region: far.id, shipIds: ['bb1', 'bb2'], mission: 'patrol' }], classOf: () => ShipClass.Battleship };
    const subs = { ...big, classOf: () => ShipClass.Submarine };
    expect(regionControl(far, big, T0)).toBeGreaterThan(regionControl(far, subs, T0));
    expect(controlWord(80)).toBe('優勢');
    expect(controlWord(5)).toBe('敵の海');
  });

  it('moves with the fights of late, fading over EVENT_HOURS world hours', () => {
    const area = regionOfArea(pacific[1])!;
    const events = addRegionEvent([], area.id, 'loss', T0);
    expect(eventPoints(events, area.id, T0)).toBe(-10);
    expect(eventPoints(events, area.id, T0 + (EVENT_HOURS / 2) * H)).toBeCloseTo(-5);
    expect(eventPoints(events, area.id, T0 + EVENT_HOURS * H)).toBe(0);
    expect(addRegionEvent(events, area.id, 'win', T0 + EVENT_HOURS * H)).toHaveLength(1);
    expect(parseRegionEvents([...events, { region: 1 }, null, { region: 'x', kind: 'nope', d: 1, at: 1 }])).toEqual(events);
  });

  it('halves the income of an area whose region is not held, unless a fleet escorts there; more fuel in the enemy’s waters', () => {
    expect(incomeShare(60, false)).toBe(1);
    expect(incomeShare(30, false)).toBe(0.5);
    expect(incomeShare(30, true)).toBe(1);
    expect(fuelMul(10)).toBe(LOW_FUEL_MUL);
    expect(fuelMul(40)).toBe(1);
    const id = pacific[0];
    const region = regionOfArea(id)!;
    const beaten = { ...emptySeaControl(), events: [{ region: region.id, kind: 'lost' as const, d: -40, at: T0 }] };
    expect(incomeAreas({ nation: 'IJN', campaign: [id], sea: beaten }, [id], T0)).toBe(0.5);
    const p = { ...emptyNationProgress(), campaign: [id], sea: { ...beaten, incomeAt: T0 - 2 * 3_600_000 } };
    expect(applySeaControl(p, T0, 'IJN').resources.fuel).toBe(Math.round(SEA_INCOME_PER_AREA.fuel * 0.5) * 2);
    // Without the navy (old callers) every area held still pays in full.
    expect(applySeaControl(p, T0).resources.fuel).toBe(SEA_INCOME_PER_AREA.fuel * 2);
  });
});

describe('0.0.74 任務', () => {
  const home = WORLD_MAP.homePorts.IJN;
  const centre = { c: home.c + 5, r: home.r + 3 };
  const start = isSea(centre.c, centre.r) ? centre : { c: home.c + 6, r: home.r + 4 };
  const loop = patrolLoop(start, isSea, seaLine);
  const fleet = anchorAt([], ['a'], { x: (loop[0].c + 0.5) * SECTOR_PX, y: (loop[0].r + 0.5) * SECTOR_PX }, 'IJN', 80)[0];
  const on = (mission: Parameters<typeof orderPatrol>[5]) => orderPatrol(fleet, [loop[0]], loop, 'chase', T0, mission) as typeof fleet;
  const near = (kind: IResident['kind']): IResident => ({ id: `r:${kind}`, kind, theater: 'pacific', danger: 2, path: [loop[0], loop[1]], speed: 0.0001, phase: 0 });
  const world = (r: IResident[]): IOffscreenWorld => ({ residents: r, won: () => false, power: () => 100, enemyPower: () => 50, homeFrom: () => null });

  it('lays mines after six hours on station and again a day later; sweeps after four; counts training and escort hours', () => {
    const mine = on('mine').order!;
    const station = T0 + runMs(mine.route);
    expect(dutyWork(mine, ['a'], station + (MINE_HOURS - 1) * H).works).toEqual([]);
    const laid = dutyWork(mine, ['a'], station + MINE_HOURS * H);
    expect(laid.works.map((w) => w.mission)).toEqual(['mine']);
    expect(dutyWork({ ...mine, workAt: laid.workAt }, ['a'], station + (MINE_HOURS + 23) * H).works).toEqual([]);
    expect(dutyWork({ ...mine, workAt: laid.workAt }, ['a'], station + (MINE_HOURS + 24) * H).works).toHaveLength(1);
    expect(dutyWork(on('sweep').order!, ['a'], station + SWEEP_HOURS * H).works.map((w) => w.mission)).toEqual(['sweep']);
    expect(dutyWork(on('train').order!, ['a'], station + 5 * H).works[0].hours).toBe(4);
    expect(dutyWork(on('escort').order!, ['a'], station + 5 * H).works[0].hours).toBe(5);
    expect(dutyWork(on('raid').order!, ['a'], station + 5 * H).works).toEqual([]);
  });

  it('fights by its duty: 通商破壊 goes for convoys, 船団護衛 lets them be, 機雷・掃海・訓練 keep clear', () => {
    const convoy = near('convoy');
    const t = T0 + H;
    expect(advanceOrders([on('raid')], {}, t, world([convoy])).fights.map((f) => f.kind)).toEqual(['convoy']);
    expect(advanceOrders([on('escort')], {}, t, world([convoy])).fights).toEqual([]);
    expect(advanceOrders([on('escort')], {}, t, world([near('patrol')])).fights).toHaveLength(1);
    for (const m of ['mine', 'sweep', 'train'] as const) expect(advanceOrders([on(m)], {}, t, world([near('patrol')])).fights).toEqual([]);
    // 哨戒 reports what it sees; the other duties don't.
    expect(advanceOrders([on('patrol')], {}, t, world([convoy])).sightings).toHaveLength(1);
    expect(advanceOrders([on('raid')], {}, t, world([convoy])).sightings).toEqual([]);
  });

  it('迎撃: a fleet in a base sails out to an enemy found within eight sectors, and not to one farther', () => {
    const baseId = Object.keys(WORLD_MAP.bases).find((b) => b.startsWith('ijn_'))!;
    const at = baseAnchor(baseId)!;
    const waiting = { shipIds: ['a'], at, fuel: 100, intercept: { checkedAt: T0 } };
    const foe: IResident = { id: 'p1', kind: 'patrol', theater: 'pacific', danger: 2, path: [{ c: 0, r: 0 }, { c: 1, r: 0 }], speed: 1, phase: 0 };
    const known = (dx: number) => [{ id: 'p1', kind: 'patrol' as const, x: at.x + dx * SECTOR_PX, y: at.y, at: T0 + H, resident: foe }];
    const out = advanceIntercepts([waiting], {}, T0 + 2 * H, world([foe]), known(4));
    expect(out.fights.map((f) => f.mission)).toEqual(['intercept']);
    expect(out.anchors[0].intercept?.checkedAt).toBe(T0 + 2 * H);
    expect(advanceIntercepts([waiting], {}, T0 + 2 * H, world([foe]), known(12)).fights).toEqual([]);
    // What was found before it last looked is not fought again.
    expect(advanceIntercepts(out.anchors, {}, T0 + 3 * H, world([foe]), known(4)).fights).toEqual([]);
  });

  it('reads the duties and the intercept back from a save', () => {
    const saved = JSON.parse(JSON.stringify([on('mine'), { shipIds: ['b'], at: baseAnchor(Object.keys(WORLD_MAP.bases)[0])!, intercept: { checkedAt: 5 } }, { shipIds: ['c'], at: { x: 1, y: 1 }, intercept: { checkedAt: 5 } }]));
    const back = parseAnchors(saved);
    expect(back[0].order?.patrol?.mission).toBe('mine');
    expect(back[1].intercept).toEqual({ checkedAt: 5 });
    // At sea a fleet can't wait to intercept.
    expect(back[2].intercept).toBeUndefined();
  });
});

describe('0.0.74 敵の反攻艦隊', () => {
  const target = pacific[3];
  const counter = { areaId: target, startedAt: T0, endsAt: T0 + 3 * 3_600_000 };

  it('gathers in the enemy’s waters and sails by sea to arrive at the deadline', () => {
    const planned = planCounter({ nation: 'IJN', campaign: pacific.slice(0, 5) }, counter, T0);
    expect(planned.route?.length).toBeGreaterThan(1);
    const end = planned.route![planned.route!.length - 1];
    expect(regionAt(end)?.areaId).toBe(target);
    expect(planned.sailAt).toBeGreaterThanOrEqual(T0);
    const r = counterResident({ nation: 'IJN', campaign: [], sea: { ...emptySeaControl(), counter: planned } })!;
    expect(r.kind).toBe('counter');
    const first = planned.route![0];
    const before = residentPos(r, planned.sailAt! - 1000);
    expect(Math.floor(before.x / SECTOR_PX)).toBe(first.c);
    const after = residentPos(r, planned.endsAt + H);
    expect(Math.floor(after.x / SECTOR_PX)).toBe(end.c);
    expect(Math.floor(after.y / SECTOR_PX)).toBe(end.r);
    // Saved and read back.
    expect(parseSeaControl(JSON.parse(JSON.stringify({ ...emptySeaControl(), counter: planned }))).counter).toEqual(planned);
    expect(findRoute(planned.route![0], end)).not.toBeNull();
  });

  it('a sea swept lately has no minefields in its area’s battles for two days', () => {
    const region = regionOfArea(target)!;
    const p = withAreaEvent({ sea: emptySeaControl() }, target, 'sweep', T0);
    expect(p.sea.events?.[0].region).toBe(region.id);
    expect(sweptArea(p, target, T0 + 10 * H)).toBe(true);
    expect(sweptArea(p, target, T0 + 49 * H)).toBe(false);
    expect(sweptArea(p, pacific[0], T0 + H)).toBe(false);
  });
});

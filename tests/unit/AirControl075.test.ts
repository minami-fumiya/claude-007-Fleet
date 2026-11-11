import { describe, expect, it } from 'vitest';
import campaignData from '@/data/campaign.json';
import {
  advanceAirOps, AIR_HIGH, AIR_LOW, airControl, airEffect, clearAirOp, enemyAir, fieldsFor, IAirInput, ourAir, parseAirOps, PORT_STRIKE_HOURS, setAirOp,
  SUPERIORITY_MUL,
} from '@/systems/AirControlSystem';
import { SECTOR_PX, WORLD_MAP } from '@/systems/OpenSeaSystem';
import { emptySeaControl, parseSeaControl } from '@/systems/SeaControlSystem';
import { airSeaPoints, CUT_PENALTY, regionAt, regionControl, regionNeighbours, regionOfArea, seaRegions } from '@/systems/SeaRegionSystem';
import { WORLD_HOUR_MS } from '@/systems/WorldClock';
import { IResident } from '@/systems/WorldSim';
import { airFields, areaAirEffect, controlInputOf, portDown, suppliedRegions, supplyReach, supplySources, wasStruck } from '@/utils/SeaControlView';
import { newMedals } from '@/systems/RecordSystem';
import { emptyRecord } from '@/systems/RecordSystem';

const T0 = Date.UTC(2026, 10, 11, 8, 0);
const H = WORLD_HOUR_MS;
const AREAS = (campaignData as { areas: Array<{ id: string; theater: string; training?: boolean }> }).areas;
const pacific = AREAS.filter((a) => a.theater === 'pacific' && !a.training).map((a) => a.id);
const home = WORLD_MAP.homePorts.IJN;
const homeRegion = regionAt(home)!;
const input = (over: Partial<IAirInput> = {}): IAirInput => ({
  nation: 'IJN', cleared: [], lost: [], fields: [{ id: 'home', name: '横須賀の飛行場', at: { c: home.c, r: home.r }, power: 24 }], carriers: {}, ops: [], ...over,
});

describe('0.0.75 制空権 (#445 段階 C2)', () => {
  it('holds the sky over home waters and loses it over the enemy’s far seas, where its land planes raid', () => {
    expect(airControl(homeRegion, input())).toBe(100);
    expect(airEffect(homeRegion, input())).toBe('scout');
    const far = regionOfArea(pacific[pacific.length - 1])!;
    expect(airControl(far, input())).toBeLessThanOrEqual(AIR_LOW);
    expect(airEffect(far, input())).toBe('raid');
    // Won, the enemy's airfields there are gone: no raid even without air cover.
    expect(airEffect(far, input({ cleared: [far.areaId!] }))).not.toBe('raid');
    expect(enemyAir(far, input({ cleared: [far.areaId!] }))).toBeLessThan(enemyAir(far, input()));
  });

  it('counts the base air groups in reach, the carriers on duty, and doubles a group on 制空', () => {
    const far = regionOfArea(pacific[pacific.length - 1])!;
    const field = { id: 'b1', name: '前線', at: far.seed, power: 24 };
    expect(ourAir(far, input({ fields: [field] }))).toBe(24);
    expect(ourAir(far, input({ fields: [field], ops: [{ base: 'b1', mission: 'superiority', region: far.id, at: T0 }] }))).toBe(24 * SUPERIORITY_MUL);
    expect(ourAir(far, input({ carriers: { [far.id]: 2 } }))).toBe(16);
    expect(fieldsFor(far, [field, input().fields[0]]).map((f) => f.id)).toEqual(['b1']);
    expect(airControl(far, input({ fields: [field], ops: [{ base: 'b1', mission: 'superiority', region: far.id, at: T0 }] }))).toBeGreaterThanOrEqual(AIR_HIGH);
  });

  it('helps hold the sea above 50% (up to +10), never lowers it', () => {
    expect(airSeaPoints(100)).toBe(10);
    expect(airSeaPoints(30)).toBe(0);
    const r = regionOfArea(pacific[0])!;
    const base = { nation: 'IJN', cleared: [pacific[0]], lost: [], duties: [], events: [], classOf: () => undefined };
    expect(regionControl(r, { ...base, airOf: () => 100 }, T0) - regionControl(r, base, T0)).toBe(10);
    expect(regionControl(r, { ...base, cut: new Set([r.id]) }, T0)).toBe(regionControl(r, base, T0) - CUT_PENALTY);
  });

  it('keeps the airfields from the home port and the bases with a 基地航空隊', () => {
    expect(airFields({ nation: 'IJN', campaign: [] }).map((f) => f.id)).toEqual(['home']);
    const first = Object.keys(WORLD_MAP.bases).find((b) => b.startsWith('ijn_') && b !== 'ijn_home')!;
    const withAir = airFields({ nation: 'IJN', campaign: [], basesOpen: [first], facilities: { [first]: { baseAir: 2 } } as never });
    expect(withAir.find((f) => f.id === first)?.power).toBe(24);
  });
});

describe('0.0.75 補給線', () => {
  it('reaches from its sources through the regions not the enemy’s, side by side', () => {
    expect(regionNeighbours(homeRegion.id).size).toBeGreaterThan(0);
    const all = { nation: 'IJN', campaign: AREAS.map((a) => a.id) };
    expect(supplySources(all).map((r) => r.id)).toContain(homeRegion.id);
    // Everything won: nothing held is cut off, and the supply reaches nearly every sea.
    expect(controlInputOf(all, T0).cut?.size).toBe(0);
    expect(suppliedRegions(all, T0).size).toBeGreaterThan(90);
    // Through nothing: only the sources.
    expect(supplyReach([homeRegion], () => false)).toEqual(new Set([homeRegion.id]));
  });

  it('a forward base on a stronghold taken is a source of its own', () => {
    const fort = Object.entries(WORLD_MAP.places ?? {}).find(([, p]) => p.kind === 'fort' && p.nation === 'IJN')![0];
    const sources = supplySources({ nation: 'IJN', campaign: [], sea: { ...emptySeaControl(), outposts: [fort] } });
    expect(sources.map((r) => r.id)).toContain(regionAt(WORLD_MAP.places[fort])!.id);
  });
});

describe('0.0.75 航空の任務', () => {
  const region = regionOfArea(pacific[2])!;
  const near: IResident = { id: 'r1', kind: 'patrol', theater: 'pacific', danger: 3, path: [region.seed, { c: region.seed.c + 1, r: region.seed.r }], speed: 0.0001, phase: 0 };
  const ctx = (ops: ReturnType<typeof setAirOp>, struck: string[] = []) => ({
    ops, regions: (id: string) => seaRegions().find((r) => r.id === id), residents: [near], won: () => false, struck: (id: string) => struck.includes(id), enemyHarbour: () => true,
  });

  it('索敵 finds what sails near the region’s middle; 対艦攻撃 strikes it once', () => {
    const recon = advanceAirOps(ctx(setAirOp([], 'b1', 'recon', region.id, T0)), T0 + 2 * H);
    expect(recon.found.map((f) => f.id)).toEqual(['r1']);
    expect(recon.ops[0].at).toBe(T0 + 2 * H);
    const strike = advanceAirOps(ctx(setAirOp([], 'b1', 'strike', region.id, T0)), T0 + 3 * H);
    expect(strike.struck).toEqual(['r1']);
    expect(advanceAirOps(ctx(setAirOp([], 'b1', 'strike', region.id, T0), ['r1']), T0 + 3 * H).struck).toEqual([]);
  });

  it('港湾攻撃 strikes every six world hours; one mission a base; read back from a save', () => {
    const ops = setAirOp([], 'b1', 'port', region.id, T0);
    expect(advanceAirOps(ctx(ops), T0 + (PORT_STRIKE_HOURS - 1) * H).ports).toEqual([]);
    expect(advanceAirOps(ctx(ops), T0 + PORT_STRIKE_HOURS * 2 * H).ports).toHaveLength(2);
    const two = setAirOp(ops, 'b1', 'recon', region.id, T0);
    expect(two).toHaveLength(1);
    expect(clearAirOp(two, 'b1')).toEqual([]);
    expect(parseAirOps([...two, { base: 1 }, { base: 'x', mission: 'nope', region: 'y', at: 1 }])).toEqual(two);
    const sea = parseSeaControl(JSON.parse(JSON.stringify({ ...emptySeaControl(), airOps: two, struck: { r1: T0, bad: 'x' }, outposts: ['a', 'a', 3] })));
    expect(sea.airOps).toEqual(two);
    expect(sea.struck).toEqual({ r1: T0 });
    expect(sea.outposts).toEqual(['a']);
    expect(wasStruck({ sea }, 'r1')).toBe(true);
  });

  it('an area whose harbour was struck lately fights weaker for a day; the far seas raid a fleet without cover', () => {
    const area = pacific[2];
    const p = { sea: { ...emptySeaControl(), events: [{ region: region.id, kind: 'portStrike' as const, d: 4, at: T0 }] } };
    expect(portDown(p, area, T0 + 10 * H)).toBe(true);
    expect(portDown(p, area, T0 + 25 * H)).toBe(false);
    expect(areaAirEffect({ nation: 'IJN', campaign: [] }, pacific[pacific.length - 1], T0)).toBe('raid');
    expect(SECTOR_PX).toBeGreaterThan(0);
  });

  it('0.0.75: 制空・補給線の勲章', () => {
    const ids = newMedals(emptyRecord(), { clearedTheaters: [], airHeld: 3, suppliedRegions: 5, outposts: 1, totals: { airStrike: 1, portStrike: 1, airRecon: 1 } }).map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['air_superior', 'air_striker', 'port_raid', 'air_recon', 'supply_line', 'outpost']));
    expect(ids).not.toContain('air_superior_2');
  });
});

describe('0.0.75 前線基地の施設を読み込む', () => {
  it('keeps the forward bases’ facilities and their works on loading (they were dropped since 0.0.50)', async () => {
    const { emptySave, parseSave } = await import('@/utils/ProgressStore');
    const save = emptySave();
    const base = 'ijn_fb_north_pacific';
    const np = { facilities: { [base]: { supply: 2, anchorage: 1, baseAir: 3, frontShop: 1, outpost: 1 }, ijn_home: { fuelTank: 2 } }, facilityJobs: [{ base, id: 'baseAir', level: 3, endsAt: 99 }] };
    const raw = JSON.parse(JSON.stringify(save));
    raw.nations = { IJN: np };
    const back = parseSave(JSON.stringify(raw)).nations.IJN!;
    expect(back.facilities[base]).toEqual({ supply: 2, anchorage: 1, baseAir: 3, frontShop: 1, outpost: 1 });
    expect(back.facilities.ijn_home).toEqual({ fuelTank: 2 });
    expect(back.facilityJobs).toHaveLength(1);
  });
});

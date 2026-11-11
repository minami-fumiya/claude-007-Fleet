/**
 * 制海権 (0.0.74): the regions' control reckoned from a navy's saved progress — its areas won, its fleets on duty, the
 * fights of late — for the store (the income), the chart and the residents (the enemy patrols more where it is low).
 */
import campaignData from '@/data/campaign.json';
import ijn from '@/data/ships/ijn.json';
import usn from '@/data/ships/usn.json';
import km from '@/data/ships/km.json';
import rn from '@/data/ships/rn.json';
import fr from '@/data/ships/fr.json';
import su from '@/data/ships/su.json';
import rm from '@/data/ships/rm.json';
import { baseOfProgress, baseReaches, openBases } from '@/systems/BaseSystem';
import { theatersFor } from '@/systems/CampaignSystem';
import type { IAnchoredFleet, IOpenSeaProgress, ISectorRef } from '@/systems/OpenSeaSystem';
import { SECTOR_PX, WORLD_MAP, colGap, dangerAt, findRoute, homePort, routeLength, wrapCol } from '@/systems/OpenSeaSystem';
import { AIR_HIGH, BASE_AIR_PER_LEVEL, HOME_AIR, IAirField, IAirInput, LAND_PLANE_MUL, PORT_DOWN_HOURS, airControl, airEffect } from '@/systems/AirControlSystem';
import { landModelsFor } from '@/systems/AircraftSystem';
import { Facilities, facilityLevel } from '@/systems/FacilitySystem';
import { AircraftType } from '@/types/Aircraft';
import { WORLD_HOUR_MS } from '@/systems/WorldClock';
import type { IResident } from '@/systems/WorldSim';
import { orderPos, runMs } from '@/systems/FleetOrders';
import { emptySeaControl, ICounterattack, ISeaControl } from '@/systems/SeaControlSystem';
import {
  CONTROL_ENEMY, CONTROL_LOW, CONTROL_SAFE, IControlInput, IDutyFleet, ISeaRegion, RegionEventKind, addRegionEvent, incomeShare, regionAt, regionAtPx, regionById, regionControl, regionNeighbours, regionOfArea, seaRegions,
} from '@/systems/SeaRegionSystem';
import { ICampaignData } from '@/types/Campaign';
import { Nation } from '@/types/Nation';
import { ShipClass } from '@/types/ShipClass';

const CLASS_OF = new Map<string, ShipClass>();
for (const list of [ijn, usn, km, rn, fr, su, rm] as Array<{ ships: Array<{ id: string; shipClass: string }> }>) {
  for (const s of list.ships) CLASS_OF.set(s.id, s.shipClass as ShipClass);
}

/** A ship's class from the ship data (designs and unknown ids: undefined). */
export function shipClassOf(id: string): ShipClass | undefined {
  return CLASS_OF.get(id);
}

export interface IControlSource {
  nation: string;
  campaign: readonly string[];
  sea?: ISeaControl;
  openSea?: Pick<IOpenSeaProgress, 'anchors'>;
  /** 制空権・補給線 (0.0.75): the bases open and their facilities, the land planes developed */
  facilities?: Facilities;
  basesOpen?: string[];
  merit?: number;
  rankFloor?: number;
  aircraftDev?: string[];
}

/** The mission a fleet away is on, if any: its duty's kind and the region it works in. */
export function dutyOf(f: IAnchoredFleet, now: number): IDutyFleet | null {
  const o = f.order;
  if (o?.patrol) {
    // On the way out it isn't there yet.
    const at = now >= o.startedAt + runMs(o.route) ? o.patrol.loop[0] : null;
    const region = at ? regionAt(at) : null;
    return region ? { region: region.id, shipIds: f.shipIds, mission: o.patrol.mission ?? 'patrol' } : null;
  }
  if (!o && f.intercept && f.at.base) {
    const region = regionAtPx(f.at.x, f.at.y, SECTOR_PX);
    return region ? { region: region.id, shipIds: f.shipIds, mission: 'intercept' } : null;
  }
  return null;
}

export function dutyFleets(anchors: readonly IAnchoredFleet[], now: number): IDutyFleet[] {
  return anchors.flatMap((a) => {
    const d = dutyOf(a, now);
    return d ? [d] : [];
  });
}

/** The navy's bases open (the first always is). */
function basesOpenOf(p: IControlSource): ReturnType<typeof openBases> {
  return openBases({ ...p, campaign: [...p.campaign] });
}

/** 制空権 (0.0.75): the navy's airfields — the home port's own, and each base open with a 基地航空隊. */
export function airFields(p: IControlSource): IAirField[] {
  const mul = (p.aircraftDev ?? []).some((id) => landModelsFor(p.nation, AircraftType.Fighter).some((m) => m.id === id)) ? LAND_PLANE_MUL : 1;
  const home = homePort(p.nation);
  const out: IAirField[] = home ? [{ id: 'home', name: `${home.name}の飛行場`, at: { c: home.c, r: home.r }, power: HOME_AIR * mul }] : [];
  for (const b of basesOpenOf(p)) {
    const lv = facilityLevel(p.facilities ?? {}, b.id, 'baseAir');
    const at = WORLD_MAP.bases[b.id];
    if (lv > 0 && at) out.push({ id: b.id, name: b.name, at: { c: at.c, r: at.r }, power: BASE_AIR_PER_LEVEL * lv * mul });
  }
  return out;
}

export function airInputOf(p: IControlSource, duties: readonly IDutyFleet[]): IAirInput {
  const carriers: Record<string, number> = {};
  for (const d of duties) for (const id of d.shipIds) if (shipClassOf(id) === ShipClass.Carrier) carriers[d.region] = (carriers[d.region] ?? 0) + 1;
  return { nation: p.nation, cleared: p.campaign, lost: p.sea?.lost ?? [], fields: airFields(p), carriers, ops: p.sea?.airOps ?? [] };
}

/** Every region's air control (id → %). */
export function navyAir(p: IControlSource, now: number, theaters?: ReadonlySet<string>): Record<string, number> {
  const air = airInputOf(p, dutyFleets(p.openSea?.anchors ?? [], now));
  const out: Record<string, number> = {};
  for (const r of seaRegions()) if (!theaters || theaters.has(r.theater)) out[r.id] = airControl(r, air);
  return out;
}

/** 補給線 (0.0.75): where the supply starts — the home port, the bases open, the forward bases on strongholds taken. */
export function supplySources(p: IControlSource): ISeaRegion[] {
  const out: ISeaRegion[] = [];
  const home = homePort(p.nation);
  const at = (s: ISectorRef | undefined): void => {
    const r = s ? regionAt(s) : null;
    if (r && !out.includes(r)) out.push(r);
  };
  if (home) at(home);
  for (const b of basesOpenOf(p)) at(WORLD_MAP.bases[b.id]);
  for (const id of p.sea?.outposts ?? []) at(WORLD_MAP.places?.[id]);
  return out;
}

/** The regions the supply reaches: from its sources through the regions not the enemy's (CONTROL_LOW and up), side by side on the sea. */
export function supplyReach(sources: readonly ISeaRegion[], held: (id: string) => boolean): Set<string> {
  const seen = new Set(sources.map((r) => r.id));
  const queue = [...seen];
  for (let i = 0; i < queue.length; i++) {
    for (const n of regionNeighbours(queue[i])) {
      if (seen.has(n) || !held(n)) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  return seen;
}

/**
 * What the control of a navy's regions is reckoned from: its areas, its fleets on duty, the fights of late, its sky
 * (0.0.75), and the regions held but cut off from every harbour (they lose CUT_PENALTY).
 */
export function controlInputOf(p: IControlSource, now: number): IControlInput {
  const duties = dutyFleets(p.openSea?.anchors ?? [], now);
  const air = airInputOf(p, duties);
  const airMemo = new Map<string, number>();
  const airOf = (id: string): number => {
    let v = airMemo.get(id);
    if (v === undefined) {
      const r = regionById(id);
      v = r ? airControl(r, air) : 50;
      airMemo.set(id, v);
    }
    return v;
  };
  const base: IControlInput = { nation: p.nation, cleared: p.campaign, lost: p.sea?.lost ?? [], duties, events: p.sea?.events ?? [], classOf: shipClassOf, airOf };
  const memo = new Map<string, number>();
  const held = (id: string): number => {
    let v = memo.get(id);
    if (v === undefined) {
      const r = regionById(id);
      v = r ? regionControl(r, base, now) : 0;
      memo.set(id, v);
    }
    return v;
  };
  const reach = supplyReach(supplySources(p), (id) => held(id) >= CONTROL_LOW);
  const cut = new Set(seaRegions().filter((r) => r.areaId && !reach.has(r.id) && held(r.id) >= CONTROL_SAFE).map((r) => r.id));
  return { ...base, cut };
}

/** 補給線: the regions the navy's supply reaches now. */
export function suppliedRegions(p: IControlSource, now: number): Set<string> {
  const input = controlInputOf(p, now);
  return supplyReach(supplySources(p), (id) => {
    const r = regionById(id);
    return !!r && regionControl(r, input, now) >= CONTROL_LOW;
  });
}

/** The seas a navy sails (its theaters its bases reach). */
export function controlTheaters(p: Parameters<typeof baseOfProgress>[0] & { nation: string }): Set<string> {
  const reach = baseOfProgress(p);
  return new Set(theatersFor(campaignData as ICampaignData, p.nation as Nation).filter((t) => baseReaches(reach, t.id)).map((t) => t.id));
}

/** Every region's control in the given theaters (id → %). */
export function navyControl(p: IControlSource, now: number, theaters: ReadonlySet<string>): Record<string, number> {
  const input = controlInputOf(p, now);
  const out: Record<string, number> = {};
  for (const r of seaRegions()) if (theaters.has(r.theater)) out[r.id] = regionControl(r, input, now);
  return out;
}

/** 海上優勢章: the regions (not its home waters) a navy holds at CONTROL_SAFE or more. */
export function regionsHeldBy(p: IControlSource, now: number): number {
  const input = controlInputOf(p, now);
  return seaRegions().filter((r) => !r.home && regionControl(r, input, now) >= CONTROL_SAFE).length;
}

/** The control of the region a world point is in (and the region). */
export function controlAtPx(p: IControlSource, x: number, y: number, now: number): { region: ISeaRegion; control: number } | null {
  const region = regionAtPx(x, y, SECTOR_PX);
  return region ? { region, control: regionControl(region, controlInputOf(p, now), now) } : null;
}

/** 敵の哨戒が増える海: the seeds of the regions (round areas) where the navy's control is below CONTROL_LOW. */
export function hotSeas(p: IControlSource, now: number, theaters: ReadonlySet<string>): ISectorRef[] {
  const input = controlInputOf(p, now);
  return seaRegions().filter((r) => r.areaId && theaters.has(r.theater) && regionControl(r, input, now) < CONTROL_LOW).map((r) => r.seed);
}

/**
 * The areas held, weighted by how much of their income gets through: whole where the region is held (50%+) or a
 * fleet escorts the convoys there, half where not.
 */
export function incomeAreas(p: IControlSource, held: readonly string[], now: number): number {
  const input = controlInputOf(p, now);
  let sum = 0;
  for (const id of held) {
    const region = regionOfArea(id);
    if (!region) {
      sum += 1;
      continue;
    }
    const escorted = input.duties.some((d) => d.region === region.id && d.mission === 'escort');
    sum += incomeShare(regionControl(region, input, now), escorted);
  }
  return sum;
}

/** Where a fleet under orders is (for the chart's region readout). */
export function fleetPoint(f: IAnchoredFleet, now: number): { x: number; y: number } {
  return f.order ? orderPos(f.order, now) : { x: f.at.x, y: f.at.y };
}


// --- 反攻艦隊 (0.0.74) -------------------------------------------------------------------------------------------

/** The counterattack's fleet speed (sectors a world hour). */
export const COUNTER_SPEED = 4;

/**
 * Where a counterattack on `areaId` sets out from: the nearest region of the area's theater the enemy holds (below
 * CONTROL_ENEMY), or else the sea farthest out towards the enemy within reach. Its way by sea, and when it must sail
 * to reach the area by `endsAt`.
 */
export function planCounter(p: IControlSource, counter: ICounterattack, now: number): ICounterattack {
  const target = regionOfArea(counter.areaId);
  if (!target) return counter;
  const input = controlInputOf(p, now);
  const gap = (a: ISectorRef, b: ISectorRef): number => colGap(a.c, b.c) + Math.abs(a.r - b.r);
  const enemy = seaRegions()
    .filter((r) => r.theater === target.theater && r.id !== target.id && regionControl(r, input, now) < CONTROL_ENEMY && gap(r.seed, target.seed) >= 8)
    .sort((a, b) => gap(a.seed, target.seed) - gap(b.seed, target.seed));
  let route: ISectorRef[] | null = null;
  for (const r of enemy.slice(0, 4)) {
    route = findRoute(r.seed, target.seed);
    if (route && route.length >= 2 && routeLength(route) <= 60) break;
    route = null;
  }
  if (!route) {
    // No enemy sea near: it comes in from the open sea, fifteen sectors out towards the enemy's side.
    const out = findRoute(target.seed, { c: wrapCol(target.seed.c + 15), r: target.seed.r }) ?? findRoute(target.seed, { c: wrapCol(target.seed.c - 15), r: target.seed.r });
    route = out && out.length >= 2 ? [...out].reverse() : null;
  }
  if (!route) return counter;
  const sailMs = Math.round((routeLength(route) / COUNTER_SPEED) * WORLD_HOUR_MS);
  return { ...counter, route, sailAt: Math.max(counter.startedAt, counter.endsAt - sailMs) };
}

/** The counterattack under way as a resident of the sea (it can be met, fought, intercepted). */
export function counterResident(p: IControlSource & { sea?: ISeaControl }): IResident | null {
  const c = p.sea?.counter;
  if (!c?.route || c.sailAt === undefined) return null;
  const theater = regionOfArea(c.areaId)?.theater ?? 'pacific';
  return { id: counterId(c), kind: 'counter', theater, danger: Math.min(10, dangerAt(p.nation, c.route[c.route.length - 1]) + 1), path: c.route, speed: COUNTER_SPEED, phase: 0, sailAt: c.sailAt, areaId: c.areaId };
}

export function counterId(c: Pick<ICounterattack, 'areaId' | 'startedAt'>): string {
  return `counter:${c.areaId}:${c.startedAt}`;
}

/** Whether a resident id is the counterattack's. */
export function isCounterId(id: string): boolean {
  return id.startsWith('counter:');
}

/** World hours a sea swept stays clear of the enemy's mines. */
export const SWEPT_HOURS = 48;

/** 掃海 (0.0.74): whether the region round an area was swept lately (its battles have no minefields then). */
export function sweptArea(p: { sea?: ISeaControl }, areaId: string, now: number): boolean {
  const region = regionOfArea(areaId);
  return !!region && (p.sea?.events ?? []).some((e) => e.kind === 'sweep' && e.region === region.id && now >= e.at && now - e.at < SWEPT_HOURS * WORLD_HOUR_MS);
}

/** A fight or a duty's work recorded in the region of a world point. */
export function withRegionEvent<T extends { sea?: ISeaControl }>(p: T, x: number, y: number, kind: RegionEventKind, now: number, d?: number): T {
  const region = regionAtPx(x, y, SECTOR_PX);
  if (!region) return p;
  const sea = p.sea ?? emptySeaControl();
  return { ...p, sea: { ...sea, events: addRegionEvent(sea.events, region.id, kind, now, d) } };
}

/** A fight in a campaign area recorded in its region. */
export function withAreaEvent<T extends { sea?: ISeaControl }>(p: T, areaId: string, kind: RegionEventKind, now: number): T {
  const region = regionOfArea(areaId);
  if (!region) return p;
  const sea = p.sea ?? emptySeaControl();
  return { ...p, sea: { ...sea, events: addRegionEvent(sea.events, region.id, kind, now) } };
}

/** 制空章 (0.0.75): the regions (not home waters) whose sky the navy holds at AIR_HIGH or more. */
export function airHeldBy(p: IControlSource, now: number): number {
  const air = navyAir(p, now);
  return seaRegions().filter((r) => !r.home && (air[r.id] ?? 0) >= AIR_HIGH).length;
}

/** 補給線章 (0.0.75): the regions (not home waters) the supply reaches. */
export function suppliedBy(p: IControlSource, now: number): number {
  const reach = suppliedRegions(p, now);
  return seaRegions().filter((r) => !r.home && reach.has(r.id)).length;
}

/** 補給線: within it a sector burns this share of the plain fuel, and a port patches the ships this much further. */
export const SUPPLIED_FUEL_MUL = 0.8;
export const SUPPLIED_REPAIR_BONUS = 0.2;

/** 制空権 (0.0.75): what the sky over an area's region does to its battle (scouts out, or a raid coming). */
export function areaAirEffect(p: IControlSource, areaId: string, now: number): 'scout' | 'raid' | null {
  const region = regionOfArea(areaId);
  return region ? airEffect(region, airInputOf(p, dutyFleets(p.openSea?.anchors ?? [], now))) : null;
}

/** 港湾攻撃 (0.0.75): whether the harbour of an area's region was struck lately (its ships go unrepaired). */
export function portDown(p: { sea?: ISeaControl }, areaId: string, now: number): boolean {
  const region = regionOfArea(areaId);
  return !!region && (p.sea?.events ?? []).some((e) => e.kind === 'portStrike' && e.region === region.id && now >= e.at && now - e.at < PORT_DOWN_HOURS * WORLD_HOUR_MS);
}

/** 対艦攻撃 (0.0.75): whether a resident was struck from the air. */
export function wasStruck(p: { sea?: ISeaControl }, residentId: string): boolean {
  return (p.sea?.struck?.[residentId] ?? 0) > 0;
}

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
import { baseOfProgress, baseReaches } from '@/systems/BaseSystem';
import { theatersFor } from '@/systems/CampaignSystem';
import type { IAnchoredFleet, IOpenSeaProgress, ISectorRef } from '@/systems/OpenSeaSystem';
import { SECTOR_PX, colGap, dangerAt, findRoute, routeLength, wrapCol } from '@/systems/OpenSeaSystem';
import { WORLD_HOUR_MS } from '@/systems/WorldClock';
import type { IResident } from '@/systems/WorldSim';
import { orderPos, runMs } from '@/systems/FleetOrders';
import { emptySeaControl, ICounterattack, ISeaControl } from '@/systems/SeaControlSystem';
import {
  CONTROL_ENEMY, CONTROL_LOW, CONTROL_SAFE, IControlInput, IDutyFleet, ISeaRegion, RegionEventKind, addRegionEvent, incomeShare, regionAt, regionAtPx, regionControl, regionOfArea, seaRegions,
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

interface IControlSource {
  nation: string;
  campaign: readonly string[];
  sea?: ISeaControl;
  openSea?: Pick<IOpenSeaProgress, 'anchors'>;
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

export function controlInputOf(p: IControlSource, now: number): IControlInput {
  return {
    nation: p.nation,
    cleared: p.campaign,
    lost: p.sea?.lost ?? [],
    duties: dutyFleets(p.openSea?.anchors ?? [], now),
    events: p.sea?.events ?? [],
    classOf: shipClassOf,
  };
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

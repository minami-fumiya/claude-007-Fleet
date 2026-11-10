/**
 * 海の地方と制海権 (#445, 0.0.74 段階 C1, pure). HoI4's sea regions: the world's sea is cut into regions round the
 * campaign areas and the home ports (each sea sector belongs to the nearest of them by sea, in its own theater); the
 * open ocean far from all of them is each theater's 外洋. A navy holds each region 0..100%: its areas won, the enemy's
 * strength there (the danger), its fleets on duty there (weighted by class: capital ships count most, submarines
 * least) and the fights of late (won raise it, lost lower it, fading over EVENT_HOURS world hours).
 *
 * What it does: at 50% and above the convoys get through (the areas there pay their full income) and the ports
 * supply; below it the income is halved unless a fleet escorts the convoys there; below 20% the enemy patrols more
 * and the fleet burns more fuel; below 10% the enemy's counterattacks set out from there.
 */
import campaignData from '@/data/campaign.json';
import {
  ISectorRef, IWorldMap, WORLD_MAP, dangerAt, inRows, isSea, theaterOf, wrapCol,
} from '@/systems/OpenSeaSystem';
import { WORLD_HOUR_MS } from '@/systems/WorldClock';
import { ShipClass } from '@/types/ShipClass';

export interface ISeaRegion {
  id: string;
  name: string;
  theater: string;
  /** The sector it grew from (the area's middle sea sector, the home port, or for 外洋 a sector of it) */
  seed: ISectorRef;
  /** The campaign area it is round, if any */
  areaId?: string;
  /** The navy whose home waters it is, if any */
  home?: string;
  /** Sea sectors in it */
  cells: number;
}

/** Steps by sea a region reaches from its seed; farther out is the theater's open ocean. */
export const REGION_REACH = 16;
/** 制海権の段階 */
export const CONTROL_SAFE = 50;
export const CONTROL_LOW = 20;
export const CONTROL_ENEMY = 10;
/** Fuel a sector costs in a region below CONTROL_LOW, as a multiple. */
export const LOW_FUEL_MUL = 1.25;
/** Income of an area whose region is below CONTROL_SAFE, unescorted. */
export const RAIDED_INCOME_MUL = 0.5;
/** World hours a fight's effect on the control fades over. */
export const EVENT_HOURS = 96;
/** The most the fights of late move a region either way. */
export const EVENT_CAP = 40;
/** The most the fleets on duty in a region add. */
export const PRESENCE_CAP = 30;
/** A ship on duty adds this times its class weight. */
export const PRESENCE_PER_SHIP = 6;
export const CLASS_WEIGHT: Record<ShipClass, number> = {
  [ShipClass.Battleship]: 1,
  [ShipClass.Carrier]: 1,
  [ShipClass.Cruiser]: 0.6,
  [ShipClass.Destroyer]: 0.4,
  [ShipClass.Submarine]: 0.2,
};

/** What a fight or a duty did to a region (saved with the navy's 制海権). */
export type RegionEventKind = 'win' | 'loss' | 'raid' | 'mine' | 'sweep' | 'counter' | 'lost';
export interface IRegionEvent {
  region: string;
  kind: RegionEventKind;
  /** Points, before fading */
  d: number;
  at: number;
}
export const EVENT_POINTS: Record<RegionEventKind, number> = { win: 8, loss: -10, raid: 5, mine: 15, sweep: 5, counter: 12, lost: -40 };
/** The events kept (the oldest drop first). */
export const MAX_EVENTS = 120;

interface IAreaLike { id: string; name: string; theater: string; training?: boolean }
const AREAS = (campaignData as { areas: IAreaLike[] }).areas;
const THEATER_NAMES: Record<string, string> = Object.fromEntries((campaignData as { theaters: Array<{ id: string; name: string }> }).theaters.map((t) => [t.id, t.name]));

interface IRegionIndex {
  regions: ISeaRegion[];
  /** Region index of each sector (row-major), -1 for land */
  cell: Int16Array;
}

let index: IRegionIndex | null = null;

/** The middle sea sector of an area's block (or its first sea sector). */
function areaSeed(block: { c: number; r: number; size: number }, map: IWorldMap): ISectorRef | null {
  const mid = { c: wrapCol(block.c + Math.floor(block.size / 2), map.cols), r: block.r + Math.floor(block.size / 2) };
  if (isSea(mid.c, mid.r, map)) return mid;
  for (let dr = 0; dr < block.size; dr++) for (let dc = 0; dc < block.size; dc++) if (isSea(block.c + dc, block.r + dr, map)) return { c: wrapCol(block.c + dc, map.cols), r: block.r + dr };
  return null;
}

/** The regions of the world (the same for every navy), built once. */
function build(map: IWorldMap = WORLD_MAP): IRegionIndex {
  const cols = map.cols;
  const cell = new Int16Array(cols * map.rows).fill(-1);
  const dist = new Int16Array(cols * map.rows).fill(-1);
  const regions: ISeaRegion[] = [];
  const queue: number[] = [];
  const theaterCode = (c: number, r: number): string => map.theater[r][wrapCol(c, cols)];
  const seed = (s: ISectorRef, region: Omit<ISeaRegion, 'cells' | 'seed'>): void => {
    const k = s.r * cols + s.c;
    if (cell[k] >= 0) return;
    regions.push({ ...region, seed: s, cells: 0 });
    cell[k] = regions.length - 1;
    dist[k] = 0;
    queue.push(k);
  };
  for (const [nation, port] of Object.entries(map.homePorts)) {
    const t = theaterOf(port.c, port.r, map);
    if (t && isSea(port.c, port.r, map)) seed({ c: port.c, r: port.r }, { id: `home:${nation}`, name: `${port.name}近海`, theater: t, home: nation });
  }
  for (const a of AREAS) {
    const block = map.areas[a.id];
    const s = block ? areaSeed(block, map) : null;
    const t = s ? theaterOf(s.c, s.r, map) : null;
    if (s && t && !a.training) seed(s, { id: `area:${a.id}`, name: `${a.name}の海`, theater: t, areaId: a.id });
  }
  // Grow every region by sea, a step at a time, within its own theater and REGION_REACH of its seed.
  for (let qi = 0; qi < queue.length; qi++) {
    const k = queue[qi];
    const c = k % cols;
    const r = (k - c) / cols;
    if (dist[k] >= REGION_REACH) continue;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = wrapCol(c + dc, cols);
      const nr = r + dr;
      if (!inRows(nr, map) || !isSea(nc, nr, map) || theaterCode(nc, nr) !== theaterCode(c, r)) continue;
      const nk = nr * cols + nc;
      if (cell[nk] >= 0) continue;
      cell[nk] = cell[k];
      dist[nk] = dist[k] + 1;
      queue.push(nk);
    }
  }
  // What is left is the open ocean: one region a theater.
  const open: Record<string, number> = {};
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = r * cols + c;
      if (cell[k] >= 0 || !isSea(c, r, map)) continue;
      const t = theaterOf(c, r, map);
      if (!t) continue;
      if (open[t] === undefined) {
        regions.push({ id: `open:${t}`, name: `${THEATER_NAMES[t] ?? t}の外洋`, theater: t, seed: { c, r }, cells: 0 });
        open[t] = regions.length - 1;
      }
      cell[k] = open[t];
    }
  }
  for (let k = 0; k < cell.length; k++) if (cell[k] >= 0) regions[cell[k]].cells++;
  return { regions, cell };
}

function idx(): IRegionIndex {
  index ??= build();
  return index;
}

export function seaRegions(): readonly ISeaRegion[] {
  return idx().regions;
}

export function regionById(id: string): ISeaRegion | undefined {
  return idx().regions.find((r) => r.id === id);
}

/** The region a sea sector is in (null on land). */
export function regionAt(s: ISectorRef): ISeaRegion | null {
  const { regions, cell } = idx();
  if (!inRows(s.r)) return null;
  const k = cell[s.r * WORLD_MAP.cols + wrapCol(s.c)];
  return k >= 0 ? regions[k] : null;
}

/** The region an area is round. */
export function regionOfArea(areaId: string): ISeaRegion | undefined {
  return idx().regions.find((r) => r.areaId === areaId);
}

/** The region of a world point (px). */
export function regionAtPx(x: number, y: number, sectorPx: number): ISeaRegion | null {
  return regionAt({ c: wrapCol(Math.floor(x / sectorPx)), r: Math.floor(y / sectorPx) });
}

/** A fleet on duty in a region (哨戒 and the other duties, or 迎撃 waiting in a base there). */
export interface IDutyFleet {
  region: string;
  shipIds: readonly string[];
  mission: string;
}

/** What the control of a navy's regions is reckoned from. */
export interface IControlInput {
  nation: string;
  /** Areas won */
  cleared: readonly string[];
  /** Areas won whose sea the enemy has taken back (0.0.62) */
  lost: readonly string[];
  duties: readonly IDutyFleet[];
  events: readonly IRegionEvent[];
  /** A ship's class (for its weight on duty); undefined counts half */
  classOf: (shipId: string) => ShipClass | undefined;
}

/** The fights of late in a region, faded by their age (world hours). */
export function eventPoints(events: readonly IRegionEvent[], region: string, now: number): number {
  let sum = 0;
  for (const e of events) {
    if (e.region !== region) continue;
    const age = (now - e.at) / WORLD_HOUR_MS;
    if (age < 0 || age >= EVENT_HOURS) continue;
    sum += e.d * (1 - age / EVENT_HOURS);
  }
  return Math.max(-EVENT_CAP, Math.min(EVENT_CAP, sum));
}

/** What the fleets on duty in a region add. */
export function presencePoints(duties: readonly IDutyFleet[], region: string, classOf: IControlInput['classOf']): number {
  let sum = 0;
  for (const d of duties) {
    if (d.region !== region) continue;
    for (const id of d.shipIds) {
      const k = classOf(id);
      sum += PRESENCE_PER_SHIP * (k ? CLASS_WEIGHT[k] : 0.5);
    }
  }
  return Math.min(PRESENCE_CAP, sum);
}

/** The base of a region's control: home waters, the area won or not, or the open ocean; less the enemy's strength. */
export function basePoints(region: ISeaRegion, input: Pick<IControlInput, 'nation' | 'cleared' | 'lost'>): number {
  const danger = dangerAt(input.nation, region.seed);
  const enemy = 1.5 * (danger - 1);
  if (region.home) return region.home === input.nation ? 80 : 5;
  if (region.areaId) return (input.cleared.includes(region.areaId) && !input.lost.includes(region.areaId) ? 65 : 10) - enemy;
  return 35 - enemy;
}

/** 制海権 of a region for a navy: 0..100. */
export function regionControl(region: ISeaRegion, input: IControlInput, now: number): number {
  const v = basePoints(region, input) + presencePoints(input.duties, region.id, input.classOf) + eventPoints(input.events, region.id, now);
  return Math.max(0, Math.min(100, Math.round(v)));
}

/** Every region's control at once (id → %). */
export function controlMap(input: IControlInput, now: number, theaters?: ReadonlySet<string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of idx().regions) if (!theaters || theaters.has(r.theater)) out[r.id] = regionControl(r, input, now);
  return out;
}

/** The word for a control: 優勢 / 拮抗 / 劣勢 / 敵の海 */
export function controlWord(v: number): string {
  if (v >= CONTROL_SAFE) return '優勢';
  if (v >= CONTROL_LOW) return '拮抗';
  if (v >= CONTROL_ENEMY) return '劣勢';
  return '敵の海';
}

/** A new event, the list kept short and the faded ones dropped. */
export function addRegionEvent(events: readonly IRegionEvent[] | undefined, region: string, kind: RegionEventKind, now: number, d = EVENT_POINTS[kind]): IRegionEvent[] {
  const live = (events ?? []).filter((e) => (now - e.at) / WORLD_HOUR_MS < EVENT_HOURS);
  return [...live, { region, kind, d, at: now }].slice(-MAX_EVENTS);
}

/** Read from a save: anything broken is dropped. */
export function parseRegionEvents(raw: unknown): IRegionEvent[] {
  if (!Array.isArray(raw)) return [];
  const kinds = new Set(Object.keys(EVENT_POINTS));
  return raw
    .filter((e): e is IRegionEvent => !!e && typeof e.region === 'string' && kinds.has(e.kind) && Number.isFinite(e.d) && Number.isFinite(e.at))
    .map((e) => ({ region: e.region, kind: e.kind, d: e.d, at: e.at }))
    .slice(-MAX_EVENTS);
}

/** The fuel a sector costs in a region of this control, as a multiple of the plain cost. */
export function fuelMul(control: number): number {
  return control < CONTROL_LOW ? LOW_FUEL_MUL : 1;
}

/** The share of an area's income that gets through, by its region's control and whether a fleet escorts there. */
export function incomeShare(control: number, escorted: boolean): number {
  return control >= CONTROL_SAFE || escorted ? 1 : RAIDED_INCOME_MUL;
}


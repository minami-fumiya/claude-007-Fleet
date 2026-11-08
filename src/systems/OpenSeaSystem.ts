import worldJson from '@/data/world/world.json';
import archipelago from '@/data/maps/archipelago.json';
import atoll from '@/data/maps/atoll.json';
import strait from '@/data/maps/strait.json';
import { IMapCircle, IMapData } from '@/types/Map';

/**
 * 本当のオープンワールド (#445, 0.0.68 段階 A1, pure): one world of sectors, each the size of a battle sea.
 * The battle screen sails it (BattleScene's open-sea mode streams the sectors round the flagship); the chart plans
 * routes over it. The east and west edges join; the north and south do not.
 */

export interface ISectorRef {
  c: number;
  r: number;
}

export interface IWorldIsland extends ISectorRef {
  map: 'archipelago' | 'atoll' | 'strait';
  name: string;
}

/** A campaign area's block of sea (#445, 0.0.69): its top-left sector and its side (2, or 1 in the Black Sea) */
export interface IAreaBlock extends ISectorRef {
  size: number;
}

export interface IWorldMap {
  cols: number;
  rows: number;
  lon0: number;
  lat0: number;
  dLon: number;
  dLat: number;
  /** One string a row: # land, . sea */
  land: string[];
  /** One letter a sea sector: the theater it is in (THEATER_OF_CODE), - for land */
  theater: string[];
  islands: IWorldIsland[];
  homePorts: Record<string, { name: string } & ISectorRef>;
  /** bases.json ids at their sea sectors (0.0.69) */
  bases: Record<string, ISectorRef>;
  /** Each campaign area's block of sea (0.0.69) */
  areas: Record<string, IAreaBlock>;
}

export const WORLD_MAP = worldJson as IWorldMap;

/** One sector is one battle sea (BATTLE_WORLD). */
export const SECTOR_PX = 3200;
export const WORLD_PX = { w: WORLD_MAP.cols * SECTOR_PX, h: WORLD_MAP.rows * SECTOR_PX };

export const THEATER_OF_CODE: Record<string, string> = {
  P: 'pacific', N: 'north_pacific', A: 'atlantic', S: 'south_atlantic', M: 'mediterranean', B: 'baltic', K: 'blacksea', I: 'indian', R: 'arctic',
};

/**
 * The fleet's fuel (the 外洋's 補給 100 kept as a tank, #445): a sector sailed costs FUEL_PER_SECTOR. 0.0.69: the
 * sectors are a quarter of 0.0.68's across (1.25°), so a sector costs a quarter as much (the same fuel for the same sea).
 */
export const FUEL_MAX = 100;
export const FUEL_PER_SECTOR = 0.75;
/** Out of fuel the fleet still crawls home at this share of its speed. */
export const NO_FUEL_SPEED = 0.3;
/** How many sectors round the flagship the battle screen holds: 1 = the 3 × 3 window. */
export const STREAM_RADIUS = 1;
/** The sectors round the fleet that count as explored. */
export const EXPLORE_RADIUS = 1;
/** Inside this many pixels of the home port's centre the fleet can enter port. */
export const PORT_RADIUS = 900;

export function wrapCol(c: number, cols = WORLD_MAP.cols): number {
  return ((c % cols) + cols) % cols;
}

export function inRows(r: number, map: IWorldMap = WORLD_MAP): boolean {
  return r >= 0 && r < map.rows;
}

export function isSea(c: number, r: number, map: IWorldMap = WORLD_MAP): boolean {
  return inRows(r, map) && map.land[r][wrapCol(c, map.cols)] === '.';
}

/** The theater id of a sea sector, or null on land. */
export function theaterOf(c: number, r: number, map: IWorldMap = WORLD_MAP): string | null {
  if (!inRows(r, map)) return null;
  return THEATER_OF_CODE[map.theater[r][wrapCol(c, map.cols)]] ?? null;
}

/** The sector a world pixel is in (x wraps). */
export function sectorAt(x: number, y: number): ISectorRef {
  return { c: wrapCol(Math.floor(x / SECTOR_PX)), r: Math.max(0, Math.min(WORLD_MAP.rows - 1, Math.floor(y / SECTOR_PX))) };
}

export function sectorCentre(s: ISectorRef): { x: number; y: number } {
  return { x: (s.c + 0.5) * SECTOR_PX, y: (s.r + 0.5) * SECTOR_PX };
}

/** Longitude and latitude of a sector's centre ("東経 139°・北緯 35°"). */
export function lonLatOf(s: ISectorRef, map: IWorldMap = WORLD_MAP): { lon: number; lat: number } {
  let lon = map.lon0 + (wrapCol(s.c, map.cols) + 0.5) * map.dLon;
  if (lon >= 180) lon -= 360;
  return { lon, lat: map.lat0 - (s.r + 0.5) * map.dLat };
}

export function lonLatText(s: ISectorRef): string {
  const { lon, lat } = lonLatOf(s);
  const ew = lon >= 0 ? `東経 ${Math.round(lon)}°` : `西経 ${Math.round(-lon)}°`;
  const ns = lat >= 0 ? `北緯 ${Math.round(lat)}°` : `南緯 ${Math.round(-lat)}°`;
  return `${ew}・${ns}`;
}

export function homePort(nation: string, map: IWorldMap = WORLD_MAP): ({ name: string } & ISectorRef) | undefined {
  return map.homePorts[nation];
}

/** Steps between two columns the short way round. */
export function colGap(a: number, b: number, cols = WORLD_MAP.cols): number {
  const d = Math.abs(wrapCol(a, cols) - wrapCol(b, cols));
  return Math.min(d, cols - d);
}

/**
 * The sea sectors next to one: the eight round it, but a diagonal only when both sides of the corner are sea
 * (a fleet doesn't slip between two touching land sectors).
 */
export function neighbours(s: ISectorRef, map: IWorldMap = WORLD_MAP): Array<ISectorRef & { cost: number }> {
  const out: Array<ISectorRef & { cost: number }> = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const c = wrapCol(s.c + dc, map.cols);
      const r = s.r + dr;
      if (!isSea(c, r, map)) continue;
      if (dr !== 0 && dc !== 0 && (!isSea(s.c + dc, s.r, map) || !isSea(s.c, s.r + dr, map))) continue;
      out.push({ c, r, cost: dr !== 0 && dc !== 0 ? Math.SQRT2 : 1 });
    }
  }
  return out;
}

const key = (s: ISectorRef, cols: number): number => s.r * cols + wrapCol(s.c, cols);

/**
 * The shortest sea route between two sectors (A*, over the wrapping grid), start and end included; null when one
 * of them is land or there is no way by sea.
 */
export function findRoute(from: ISectorRef, to: ISectorRef, map: IWorldMap = WORLD_MAP): ISectorRef[] | null {
  if (!isSea(from.c, from.r, map) || !isSea(to.c, to.r, map)) return null;
  const cols = map.cols;
  const h = (s: ISectorRef): number => {
    const dc = colGap(s.c, to.c, cols);
    const dr = Math.abs(s.r - to.r);
    return Math.max(dc, dr) + (Math.SQRT2 - 1) * Math.min(dc, dr);
  };
  const start = { c: wrapCol(from.c, cols), r: from.r };
  const goal = key(to, cols);
  const g = new Map<number, number>([[key(start, cols), 0]]);
  const came = new Map<number, number>();
  // A small binary heap of [f, key].
  const heap: Array<[number, number]> = [[h(start), key(start, cols)]];
  const push = (item: [number, number]): void => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const closed = new Set<number>();
  while (heap.length > 0) {
    const [, k] = pop();
    if (closed.has(k)) continue;
    if (k === goal) {
      const path: ISectorRef[] = [];
      for (let at: number | undefined = k; at !== undefined; at = came.get(at)) path.push({ c: at % cols, r: Math.floor(at / cols) });
      return path.reverse();
    }
    closed.add(k);
    const here = { c: k % cols, r: Math.floor(k / cols) };
    for (const n of neighbours(here, map)) {
      const nk = key(n, cols);
      if (closed.has(nk)) continue;
      const cost = (g.get(k) ?? 0) + n.cost;
      if (cost < (g.get(nk) ?? Infinity)) {
        g.set(nk, cost);
        came.set(nk, k);
        push([cost + h(n), nk]);
      }
    }
  }
  return null;
}

/** A route's length in sectors (a diagonal step counts sqrt 2). */
export function routeLength(route: readonly ISectorRef[], cols = WORLD_MAP.cols): number {
  let n = 0;
  for (let i = 1; i < route.length; i++) {
    const dc = colGap(route[i].c, route[i - 1].c, cols);
    const dr = Math.abs(route[i].r - route[i - 1].r);
    n += dc !== 0 && dr !== 0 ? Math.SQRT2 : 1;
  }
  return n;
}

/** Fuel a route takes. */
export function routeFuel(route: readonly ISectorRef[]): number {
  return Math.ceil(routeLength(route) * FUEL_PER_SECTOR);
}

/** Fuel burned for `px` pixels sailed. */
export function fuelForPx(px: number): number {
  return (px / SECTOR_PX) * FUEL_PER_SECTOR;
}

/** Sea steps from `from` to every sector (-1 where the sea doesn't reach), by breadth-first search. */
export function seaSteps(from: ISectorRef, map: IWorldMap = WORLD_MAP): Int16Array {
  const out = new Int16Array(map.cols * map.rows).fill(-1);
  if (!isSea(from.c, from.r, map)) return out;
  const q: ISectorRef[] = [{ c: wrapCol(from.c, map.cols), r: from.r }];
  out[key(q[0], map.cols)] = 0;
  for (let i = 0; i < q.length; i++) {
    const d = out[key(q[i], map.cols)];
    for (const n of neighbours(q[i], map)) {
      const k = key(n, map.cols);
      if (out[k] >= 0) continue;
      out[k] = d + 1;
      q.push(n);
    }
  }
  return out;
}

const stepsCache = new Map<string, Int16Array>();

/** 危険度 1〜10 of a sea sector for a navy: farther from its home port by sea, more dangerous (a step every 12 sectors, ~1,700 km). */
export const DANGER_STEP = 12;
export function dangerAt(nation: string, s: ISectorRef): number {
  const home = homePort(nation);
  if (!home) return 1;
  let steps = stepsCache.get(nation);
  if (!steps) {
    steps = seaSteps(home);
    stepsCache.set(nation, steps);
  }
  const d = steps[key(s, WORLD_MAP.cols)];
  if (d < 0) return 10;
  return Math.max(1, Math.min(10, 1 + Math.floor(d / DANGER_STEP)));
}

// --- Explored sectors (one bit a sector, saved per navy as hex) ------------------------------------------------

const SECTORS = WORLD_MAP.cols * WORLD_MAP.rows;
const HEX_LEN = Math.ceil(SECTORS / 4);

export function emptyExplored(): string {
  return '0'.repeat(HEX_LEN);
}

/** 0.0.68's chart: 72 × 40 sectors of 5°, each now 4 × 4 of 0.0.69's. */
const OLD_COLS = 72;
const OLD_ROWS = 40;
const OLD_HEX_LEN = (OLD_COLS * OLD_ROWS) / 4;

/**
 * A saved explored string read safely: wrong length or stray characters give an empty chart. 0.0.68's coarser chart
 * is carried over, each of its sectors opening the 16 that now cover it.
 */
export function readExplored(raw: unknown): string {
  if (typeof raw !== 'string' || !/^[0-9a-f]+$/.test(raw)) return emptyExplored();
  if (raw.length === HEX_LEN) return raw;
  if (raw.length !== OLD_HEX_LEN) return emptyExplored();
  const fx = WORLD_MAP.cols / OLD_COLS;
  const fy = WORLD_MAP.rows / OLD_ROWS;
  const chars = emptyExplored().split('');
  for (let k = 0; k < OLD_COLS * OLD_ROWS; k++) {
    if (((parseInt(raw[k >> 2], 16) >> (k & 3)) & 1) === 0) continue;
    const c0 = (k % OLD_COLS) * fx;
    const r0 = Math.floor(k / OLD_COLS) * fy;
    for (let dy = 0; dy < fy; dy++) {
      for (let dx = 0; dx < fx; dx++) {
        const n = (r0 + dy) * WORLD_MAP.cols + c0 + dx;
        chars[n >> 2] = (parseInt(chars[n >> 2], 16) | (1 << (n & 3))).toString(16);
      }
    }
  }
  return chars.join('');
}

export function isExplored(bits: string, s: ISectorRef): boolean {
  const k = key(s, WORLD_MAP.cols);
  return ((parseInt(bits[k >> 2], 16) >> (k & 3)) & 1) === 1;
}

/** The chart with the sectors within `radius` of `s` explored. */
export function explore(bits: string, s: ISectorRef, radius = EXPLORE_RADIUS): string {
  const chars = bits.split('');
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const r = s.r + dr;
      if (!inRows(r)) continue;
      const k = key({ c: s.c + dc, r }, WORLD_MAP.cols);
      chars[k >> 2] = (parseInt(chars[k >> 2], 16) | (1 << (k & 3))).toString(16);
    }
  }
  return chars.join('');
}

export function exploredCount(bits: string): number {
  let n = 0;
  for (const ch of bits) {
    let v = parseInt(ch, 16);
    while (v) {
      n += v & 1;
      v >>= 1;
    }
  }
  return n;
}

// --- What a sector holds -----------------------------------------------------------------------------------------

const TEMPLATES: Record<IWorldIsland['map'], IMapData> = {
  archipelago: archipelago as IMapData,
  atoll: atoll as IMapData,
  strait: strait as IMapData,
};

/** Land sectors are filled by a 4 × 4 lattice of overlapping circles: solid inside, a ragged coast at the edges. */
const LAND_LATTICE = 4;
const LAND_R = 0.18;

function hash(c: number, r: number): number {
  let h = Math.imul(c + 1, 73856093) ^ Math.imul(r + 1, 19349663);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return (h ^ (h >>> 15)) >>> 0;
}

export interface ISectorContent extends IMapData {
  land: boolean;
  /** The island group's name, for an island sector */
  place?: string;
}

/**
 * A sector's islands, shoals and currents in its own normalised coordinates (0..1 of the sector), deterministic.
 * A land sector is a block of land; an island sector holds its battle map's islands; a sea sector by a coast gets
 * shoals along that coast and, now and then, an islet.
 */
export function sectorContent(c: number, r: number, map: IWorldMap = WORLD_MAP): ISectorContent {
  const cc = wrapCol(c, map.cols);
  const id = `s${cc}_${r}`;
  if (!isSea(cc, r, map)) {
    const circles: IMapCircle[] = [];
    for (let i = 0; i < LAND_LATTICE; i++) {
      for (let j = 0; j < LAND_LATTICE; j++) circles.push({ x: (i + 0.5) / LAND_LATTICE, y: (j + 0.5) / LAND_LATTICE, r: LAND_R });
    }
    return { id, name: '陸', land: true, islands: [circles], shoals: [], currents: [] };
  }
  const isle = map.islands.find((i) => i.c === cc && i.r === r);
  if (isle) {
    const t = TEMPLATES[isle.map];
    return { id, name: isle.name, place: isle.name, land: false, islands: t.islands, shoals: t.shoals, currents: [] };
  }
  const h = hash(cc, r);
  const shoals: IMapCircle[] = [];
  const islands: IMapCircle[][] = [];
  const sides: Array<[number, number, (t: number) => { x: number; y: number }]> = [
    [0, -1, (t) => ({ x: t, y: 0.07 })],
    [0, 1, (t) => ({ x: t, y: 0.93 })],
    [-1, 0, (t) => ({ x: 0.07, y: t })],
    [1, 0, (t) => ({ x: 0.93, y: t })],
  ];
  for (const [dc, dr, at] of sides) {
    if (!inRows(r + dr, map) || isSea(cc + dc, r + dr, map)) continue;
    for (const t of [0.2, 0.5, 0.8]) shoals.push({ ...at(t), r: 0.07 });
    if (h % 3 === 0) {
      const p = at(0.3 + ((h >> 4) % 40) / 100);
      islands.push([{ x: p.x + dc * -0.06, y: p.y + dr * -0.06, r: 0.025 }]);
    }
  }
  return { id, name: '外洋', land: false, islands, shoals, currents: [] };
}

/** The sectors the battle screen holds round a sector: (2R+1) squared of them, as unwrapped columns (may be -1 or cols). */
export function sectorWindow(centre: ISectorRef, radius = STREAM_RADIUS): ISectorRef[] {
  const out: ISectorRef[] = [];
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const r = centre.r + dr;
      if (r >= 0 && r < WORLD_MAP.rows) out.push({ c: centre.c + dc, r });
    }
  }
  return out;
}

/** The theaters with sea in the world, and how many sectors each. */
export function theaterSectors(map: IWorldMap = WORLD_MAP): Record<string, number> {
  const out: Record<string, number> = {};
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const t = theaterOf(c, r, map);
      if (t) out[t] = (out[t] ?? 0) + 1;
    }
  }
  return out;
}

// --- Saved state (per navy) --------------------------------------------------------------------------------------

export interface IOpenSeaProgress {
  /** Explored sectors, one bit each, as hex */
  explored: string;
  /** Pixels the flagship has sailed on the open sea */
  sailedPx: number;
  /** Voyages made */
  voyages: number;
  /** 停泊 (0.0.69): the groups of ships lying away from the home port */
  anchors: IAnchoredFleet[];
}

export function emptyOpenSea(): IOpenSeaProgress {
  return { explored: emptyExplored(), sailedPx: 0, voyages: 0, anchors: [] };
}

/** The saved open sea read with defaults (alpha saves: missing fields don't break the load). */
export function parseOpenSea(raw: unknown): IOpenSeaProgress {
  const o = raw && typeof raw === 'object' ? (raw as Partial<IOpenSeaProgress>) : {};
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  return { explored: readExplored(o.explored), sailedPx: num(o.sailedPx), voyages: Math.floor(num(o.voyages)), anchors: parseAnchors(o.anchors) };
}

/** Sectors sailed, for the record and the medals. */
export function sectorsSailed(p: Pick<IOpenSeaProgress, 'sailedPx'>): number {
  return Math.floor(p.sailedPx / SECTOR_PX);
}

/** A campaign area's block of sea, or undefined for an area without one. */
export function areaBlock(areaId: string, map: IWorldMap = WORLD_MAP): IAreaBlock | undefined {
  return map.areas[areaId];
}

/** The pixel centre of an area's block, and its half-width. */
export function areaCentre(block: IAreaBlock): { x: number; y: number; half: number } {
  return { x: (block.c + block.size / 2) * SECTOR_PX, y: (block.r + block.size / 2) * SECTOR_PX, half: (block.size / 2) * SECTOR_PX };
}

/** The area whose block holds sector `s`, if any. */
export function areaAt(s: ISectorRef, map: IWorldMap = WORLD_MAP): string | undefined {
  const c = wrapCol(s.c, map.cols);
  for (const [id, b] of Object.entries(map.areas)) {
    if (s.r >= b.r && s.r < b.r + b.size && colGap(c, b.c, map.cols) < map.cols / 2 && wrapCol(c - b.c, map.cols) < b.size) return id;
  }
  return undefined;
}

/** A base's sector (bases.json id). */
export function baseSector(baseId: string, map: IWorldMap = WORLD_MAP): ISectorRef | undefined {
  return map.bases[baseId];
}

// --- 停泊 (0.0.69): where each fleet lies between voyages -----------------------------------------------------------

/** Where an anchored fleet lies: at one of the navy's bases, or at sea (the exact point it stopped at). */
export interface IAnchorPlace {
  /** bases.json id when in harbour */
  base?: string;
  /** World pixels (the sector follows from them) */
  x: number;
  y: number;
}

/** A group of the navy's ships lying together away from the home port. Ships in no group are at the home port. */
export interface IAnchoredFleet {
  shipIds: string[];
  at: IAnchorPlace;
}

/** The home port as an anchorage. */
export function homeAnchor(nation: string): IAnchorPlace {
  const home = homePort(nation) ?? { c: 0, r: 0 };
  return { base: `${nation.toLowerCase()}_home`, x: (home.c + 0.5) * SECTOR_PX, y: (home.r + 0.5) * SECTOR_PX };
}

/** A base's anchorage (its sector's middle). */
export function baseAnchor(baseId: string): IAnchorPlace | undefined {
  const s = WORLD_MAP.bases[baseId];
  return s ? { base: baseId, x: (s.c + 0.5) * SECTOR_PX, y: (s.r + 0.5) * SECTOR_PX } : undefined;
}

/** Where a ship lies: its group's place, or the home port. */
export function shipPlace(anchors: readonly IAnchoredFleet[], shipId: string, nation: string): IAnchorPlace {
  return anchors.find((a) => a.shipIds.includes(shipId))?.at ?? homeAnchor(nation);
}

const samePlace = (a: IAnchorPlace, b: IAnchorPlace): boolean => (a.base !== undefined || b.base !== undefined ? a.base === b.base : Math.hypot(a.x - b.x, a.y - b.y) < 1);

/** Where a fleet of these ships puts to sea from, or why it can't (its ships lie in different places). */
export function fleetStart(anchors: readonly IAnchoredFleet[], shipIds: readonly string[], nation: string): { at: IAnchorPlace } | { problem: string } {
  if (shipIds.length === 0) return { problem: '艦隊がありません' };
  const places = shipIds.map((id) => shipPlace(anchors, id, nation));
  if (places.some((p) => !samePlace(p, places[0]))) return { problem: '艦隊の艦が別々の場所に停泊しています。同じ場所の艦で組んでください' };
  return { at: places[0] };
}

/** The anchorages with these ships moved to `at` (out of whatever group they were in). At the home port they join no group. */
export function anchorAt(anchors: readonly IAnchoredFleet[], shipIds: readonly string[], at: IAnchorPlace, nation: string): IAnchoredFleet[] {
  const rest = anchors.map((a) => ({ ...a, shipIds: a.shipIds.filter((id) => !shipIds.includes(id)) })).filter((a) => a.shipIds.length > 0);
  if (at.base === homeAnchor(nation).base) return rest;
  // Joining a group already lying there.
  const there = rest.find((a) => samePlace(a.at, at));
  if (there) return rest.map((a) => (a === there ? { ...a, shipIds: [...a.shipIds, ...shipIds] } : a));
  return [...rest, { shipIds: [...shipIds], at }];
}

/** Saved anchorages read safely (alpha saves: missing or broken entries are dropped). */
export function parseAnchors(raw: unknown): IAnchoredFleet[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((a): IAnchoredFleet[] => {
    const o = a as Partial<IAnchoredFleet>;
    const at = o?.at as Partial<IAnchorPlace> | undefined;
    if (!Array.isArray(o?.shipIds) || !at || typeof at.x !== 'number' || typeof at.y !== 'number' || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return [];
    const shipIds = o.shipIds.filter((id): id is string => typeof id === 'string');
    if (shipIds.length === 0) return [];
    return [{ shipIds, at: { ...(typeof at.base === 'string' ? { base: at.base } : {}), x: at.x, y: at.y } }];
  });
}

/** A place's name: the base's, or the sea's position. */
export function placeName(at: IAnchorPlace, baseNames: Record<string, string>): string {
  if (at.base) return baseNames[at.base] ?? at.base;
  return `洋上 (${lonLatText(sectorAt(at.x, at.y))})`;
}

// --- 海の上の敵艦隊 (0.0.69): groups waiting at sea, a fresh set every hour ---------------------------------------

/** Share of the sea sectors holding a group in a given hour. */
export const ENCOUNTER_RATE = 0.012;
/** Groups keep this many sectors from the navy's harbours and from the campaign areas. */
const ENCOUNTER_CLEAR = 3;

export interface IEncounter {
  /** Unique for the hour: "sea:<hour>:<c>:<r>" */
  id: string;
  c: number;
  r: number;
  danger: number;
  theater: string;
}

/** The hour a time falls in (the groups change with it). */
export function seaHour(now: number): number {
  return Math.floor(now / 3_600_000);
}

/**
 * The group lying in sector `s` this hour, if any: in a sea the navy fights in (`theaters`), clear of its harbours
 * (`ports`) and of the campaign areas, by a stable hash of the sector and the hour.
 */
export function encounterAt(nation: string, s: ISectorRef, hour: number, theaters: ReadonlySet<string>, ports: readonly ISectorRef[]): IEncounter | null {
  const c = wrapCol(s.c);
  if (!isSea(c, s.r)) return null;
  const theater = theaterOf(c, s.r);
  if (!theater || !theaters.has(theater)) return null;
  let h = Math.imul(c + 7, 2654435761) ^ Math.imul(s.r + 13, 2246822519) ^ Math.imul(hour, 3266489917);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = (h ^ (h >>> 12)) >>> 0;
  if (h % 10_000 >= ENCOUNTER_RATE * 10_000) return null;
  const near = (p: ISectorRef, gap: number): boolean => colGap(p.c, c) < gap && Math.abs(p.r - s.r) < gap;
  if (ports.some((p) => near(p, ENCOUNTER_CLEAR))) return null;
  if (Object.values(WORLD_MAP.areas).some((b) => near({ c: b.c, r: b.r }, ENCOUNTER_CLEAR))) return null;
  return { id: `sea:${hour}:${c}:${s.r}`, c, r: s.r, danger: dangerAt(nation, { c, r: s.r }), theater };
}

/** The groups within the sectors round `centre` this hour. */
export function encountersNear(nation: string, centre: ISectorRef, hour: number, theaters: ReadonlySet<string>, ports: readonly ISectorRef[], radius = 1): IEncounter[] {
  return sectorWindow(centre, radius).map((s) => encounterAt(nation, s, hour, theaters, ports)).filter((g): g is IEncounter => g !== null);
}

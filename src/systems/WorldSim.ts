/**
 * 住人 (#445, 0.0.72 段階 B1, pure): the fleets that live on the world's sea — the enemy's patrols, the enemy's
 * convoys and the navy's own patrols. Each sails a fixed path (a loop, or for a convoy a run between two coasts and
 * back) at its own speed; where it is follows from the world's clock alone, so every load and every device agrees and
 * nothing of it is saved but what was sunk. The population is drawn afresh every world day (two real hours).
 *
 * Meeting the player's fleet is the battle screen's business: a resident within sight decides to close or to run by
 * the strength of the two fleets (`meetResponse`), and the fight is fought there and then.
 */
import {
  ISectorRef, SECTOR_PX, WORLD_MAP, WORLD_PX, colGap, dangerAt, homePort, isSea, theaterOf, wrapCol,
} from '@/systems/OpenSeaSystem';
import { WORLD_HOUR_MS, worldHours } from '@/systems/WorldClock';

/** 0.0.74: `counter` — an enemy counterattack sailing for a sea the navy holds */
export type ResidentKind = 'patrol' | 'convoy' | 'friend' | 'superweapon' | 'counter';

export interface IResident {
  /** `<day>:<kind>:<theater>:<n>` — the day first, so a sinking is kept for the day only (WorldSystem's spots) */
  id: string;
  kind: ResidentKind;
  theater: string;
  danger: number;
  /** The sectors it sails through, in order; a loop goes back to the first */
  path: ISectorRef[];
  /** Sectors a world hour */
  speed: number;
  /** Where on its path it was at the day's start (0..1) */
  phase: number;
  /** 超兵器 (0.0.72): the campaign area whose superweapon it is (it patrols round that area); 反攻 (0.0.74): the area it sails for */
  areaId?: string;
  /** 反攻 (0.0.74): real ms it sets out along its path (it gathers at the start till then, and stays at the end) */
  sailAt?: number;
}

/** A superweapon's sea open to the navy: the area, its middle sector and its theater. */
export interface IGiantSea {
  areaId: string;
  at: ISectorRef;
  theater: string;
}

/** A world day: the residents are drawn again each day. */
export const RESIDENT_DAY_HOURS = 24;
/** Residents close enough to the fleet to be drawn and watched at once (重さの目安). */
export const MAX_NEAR = 60;
export const SPEED: Record<ResidentKind, number> = { patrol: 4, convoy: 3, friend: 4, superweapon: 2, counter: 4 };
/** Residents a sea sector, by kind (an enemy patrol every ~85 sectors: a fleet meets about as many as the 0.0.69 groups). */
export const PATROL_DENSITY = 0.012;
export const CONVOY_DENSITY = 0.0024;
export const FRIEND_DENSITY = 0.0012;
/** A patrol's turning points lie within this many sectors of its start. */
const PATROL_REACH = 9;
/** An enemy weaker than this share of the player's fleet runs instead of closing. */
export const FLEE_BELOW = 0.6;
/** Sight between a resident and the fleet (px): within it they meet. */
export const MEET_PX = SECTOR_PX * 1.4;
/** No resident fights within this many sectors of a harbour or a campaign area (they keep their own fights). */
export const RESIDENT_CLEAR = 3;
/** Residents within this distance of the fleet show on the minimap. */
export const NEAR_PX = SECTOR_PX * 2.2;

export function residentDay(now: number): number {
  return Math.floor(worldHours(now) / RESIDENT_DAY_HOURS);
}

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

let cellsCache: Record<string, ISectorRef[]> | null = null;

/** Every sea sector of each theater. */
export function theaterCells(): Record<string, ISectorRef[]> {
  if (cellsCache) return cellsCache;
  const out: Record<string, ISectorRef[]> = {};
  for (let r = 0; r < WORLD_MAP.rows; r++) {
    for (let c = 0; c < WORLD_MAP.cols; c++) {
      if (!isSea(c, r)) continue;
      const t = theaterOf(c, r);
      if (t) (out[t] ??= []).push({ c, r });
    }
  }
  cellsCache = out;
  return out;
}

/** The signed column step from `a` to `b` the short way round. */
function dcol(a: number, b: number): number {
  const cols = WORLD_MAP.cols;
  let d = (b - a) % cols;
  if (d > cols / 2) d -= cols;
  if (d < -cols / 2) d += cols;
  return d;
}

/** Whether a straight run between two sector middles stays on the sea (sampled every tenth of a sector, as it is sailed). */
export function seaLine(a: ISectorRef, b: ISectorRef): boolean {
  const dc = dcol(a.c, b.c);
  const dr = b.r - a.r;
  const n = Math.max(1, Math.ceil(Math.hypot(dc, dr) * 10));
  for (let i = 0; i <= n; i++) {
    const c = wrapCol(Math.floor(a.c + 0.5 + (dc * i) / n));
    const r = Math.floor(a.r + 0.5 + (dr * i) / n);
    if (r < 0 || r >= WORLD_MAP.rows || !isSea(c, r)) return false;
  }
  return true;
}

function segLength(a: ISectorRef, b: ISectorRef): number {
  return Math.hypot(dcol(a.c, b.c), b.r - a.r);
}

/** A loop of turning points round `start`, each leg on the sea; null when none is found. */
function loopFrom(start: ISectorRef, cells: readonly ISectorRef[], next: () => number, legs = 4): ISectorRef[] | null {
  const near = cells.filter((s) => colGap(s.c, start.c) <= PATROL_REACH && Math.abs(s.r - start.r) <= PATROL_REACH);
  if (near.length < legs) return null;
  const path = [start];
  for (let tries = 0; path.length < legs && tries < 40; tries++) {
    const cand = near[Math.floor(next() * near.length)];
    const last = path[path.length - 1];
    if (segLength(last, cand) < 2 || !seaLine(last, cand)) continue;
    path.push(cand);
  }
  if (path.length < legs || !seaLine(path[path.length - 1], start)) return null;
  return path;
}

/** A coast-to-coast run (there and back): a sea sector beside land, then another far off it in a straight sea line. */
function runFrom(start: ISectorRef, coast: readonly ISectorRef[], next: () => number): ISectorRef[] | null {
  for (let tries = 0; tries < 30; tries++) {
    const end = coast[Math.floor(next() * coast.length)];
    const len = segLength(start, end);
    if (len >= 6 && len <= 30 && seaLine(start, end)) return [start, end];
  }
  return null;
}

function besideLand(s: ISectorRef): boolean {
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const r = s.r + dr;
    if (r >= 0 && r < WORLD_MAP.rows && !isSea(wrapCol(s.c + dc), r)) return true;
  }
  return false;
}

const cache = new Map<string, IResident[]>();

/**
 * The residents of a day in the seas a navy sails (`theaters`): the enemy's patrols and convoys there, and the navy's
 * own patrols in the sea of its home port. Drawn by a fixed seed, so the same for every call.
 */
export function residentsFor(nation: string, theaters: readonly string[], day: number, giants: readonly IGiantSea[] = [], hot: readonly ISectorRef[] = []): IResident[] {
  const key = `${nation}|${day}|${[...theaters].sort().join(',')}|${giants.map((g) => g.areaId).join(',')}|${hot.map((s) => `${s.c}.${s.r}`).join(',')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const cells = theaterCells();
  const home = homePort(nation);
  const homeTheater = home ? theaterOf(home.c, home.r) : null;
  const out: IResident[] = [];
  for (const theater of [...theaters].sort()) {
    const sea = cells[theater] ?? [];
    if (sea.length === 0) continue;
    const next = rng(hashText(`${nation}:${theater}:${day}`));
    const coast = sea.filter(besideLand);
    const add = (kind: ResidentKind, count: number): void => {
      let n = 0;
      for (let tries = 0; n < count && tries < count * 6; tries++) {
        const from = kind === 'convoy' ? coast : sea;
        if (from.length === 0) break;
        const start = from[Math.floor(next() * from.length)];
        // The navy's own patrols keep to the waters off its home port.
        if (kind === 'friend' && home && (colGap(start.c, home.c) > 24 || Math.abs(start.r - home.r) > 18)) continue;
        const path = kind === 'convoy' ? (coast.length > 1 ? runFrom(start, coast, next) : null) : loopFrom(start, sea, next);
        if (!path) continue;
        out.push({
          id: `${day}:${kind}:${theater}:${n}`,
          kind,
          theater,
          danger: kind === 'convoy' ? Math.max(1, dangerAt(nation, start) - 2) : dangerAt(nation, start),
          path,
          speed: SPEED[kind],
          phase: next(),
        });
        n++;
      }
    };
    add('patrol', Math.max(2, Math.round(sea.length * PATROL_DENSITY)));
    add('convoy', Math.max(1, Math.round(sea.length * CONVOY_DENSITY)));
    if (theater === homeTheater) add('friend', Math.max(2, Math.round(sea.length * FRIEND_DENSITY)));
  }
  // 制海権 (0.0.74): where the navy's control is low the enemy patrols more — one more patrol round each such sea.
  for (const s of hot) {
    const theater = theaterOf(s.c, s.r);
    const sea = theater ? cells[theater] ?? [] : [];
    if (!theater || !theaters.includes(theater) || sea.length === 0) continue;
    const next = rng(hashText(`${nation}:hot:${s.c}:${s.r}:${day}`));
    const path = loopFrom(s, sea, next);
    if (path) out.push({ id: `${day}:patrol:hot:${s.c}.${s.r}`, kind: 'patrol', theater, danger: dangerAt(nation, s), path, speed: SPEED.patrol, phase: next() });
  }
  // 超兵器 (0.0.72): each open superweapon's sea has its giant slowly patrolling round the area.
  for (const g of giants) {
    const sea = cells[g.theater] ?? [];
    const next = rng(hashText(`${nation}:giant:${g.areaId}:${day}`));
    const start = sea.length > 0 ? sea.reduce((best, s) => (colGap(s.c, g.at.c) + Math.abs(s.r - g.at.r) < colGap(best.c, g.at.c) + Math.abs(best.r - g.at.r) ? s : best)) : null;
    const path = start ? loopFrom(start, sea, next) : null;
    if (!start || !path) continue;
    out.push({ id: `${day}:superweapon:${g.areaId}`, kind: 'superweapon', theater: g.theater, danger: 10, path, speed: SPEED.superweapon, phase: next(), areaId: g.areaId });
  }
  if (cache.size > 8) cache.clear();
  cache.set(key, out);
  return out;
}

/** The full path a resident sails round: a loop closes on its start, a run comes back the same way. */
function legs(r: IResident): ISectorRef[] {
  if (r.kind === 'counter') return r.path;
  return r.kind === 'convoy' ? [...r.path, ...r.path.slice(0, -1).reverse()] : [...r.path, r.path[0]];
}

export function pathLength(r: IResident): number {
  const pts = legs(r);
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += segLength(pts[i - 1], pts[i]);
  return len;
}

export interface IResidentPos {
  x: number;
  y: number;
  /** Radians, the way it is sailing */
  heading: number;
}

/** Where a resident is at `now` (world px, x within the world), as it sails its path at its speed. */
export function residentPos(r: IResident, now: number): IResidentPos {
  const pts = legs(r);
  const total = pathLength(r);
  const hours = worldHours(now) - residentDay(now) * RESIDENT_DAY_HOURS;
  // 反攻 (0.0.74): gathered at its start, then along its way once, then at its end.
  let d = r.sailAt !== undefined
    ? Math.max(0, Math.min(total, ((now - r.sailAt) / WORLD_HOUR_MS) * r.speed))
    : ((r.phase * total + hours * r.speed) % total + total) % total;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = segLength(a, b);
    if (d <= len || i === pts.length - 1) {
      const t = len > 0 ? Math.min(1, d / len) : 0;
      const dc = dcol(a.c, b.c);
      const dr = b.r - a.r;
      const x = ((((a.c + 0.5 + dc * t) * SECTOR_PX) % WORLD_PX.w) + WORLD_PX.w) % WORLD_PX.w;
      return { x, y: (a.r + 0.5 + dr * t) * SECTOR_PX, heading: Math.atan2(dr, dc) };
    }
    d -= len;
  }
  const s = pts[0];
  return { x: (s.c + 0.5) * SECTOR_PX, y: (s.r + 0.5) * SECTOR_PX, heading: 0 };
}

/** The distance in px between two world points, the short way round the east-west join. */
export function worldGap(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = Math.abs(a.x - b.x) % WORLD_PX.w;
  return Math.hypot(Math.min(dx, WORLD_PX.w - dx), a.y - b.y);
}

/** The residents within `range` px of a point at `now`, nearest first, at most MAX_NEAR. */
export function residentsNear(list: readonly IResident[], at: { x: number; y: number }, now: number, range = NEAR_PX): Array<{ r: IResident; pos: IResidentPos; dist: number }> {
  const out: Array<{ r: IResident; pos: IResidentPos; dist: number }> = [];
  for (const r of list) {
    // A cheap first cut on the path's first sector (a patrol keeps within PATROL_REACH of it; a run within 30).
    const s = r.path[0];
    const far = r.kind === 'counter' ? 200 : r.kind === 'convoy' ? 32 : PATROL_REACH + 2;
    if (colGap(s.c, Math.floor(at.x / SECTOR_PX)) > far + range / SECTOR_PX || Math.abs(s.r - at.y / SECTOR_PX) > far + range / SECTOR_PX) continue;
    const pos = residentPos(r, now);
    const dist = worldGap(pos, at);
    if (dist <= range) out.push({ r, pos, dist });
  }
  return out.sort((a, b) => a.dist - b.dist).slice(0, MAX_NEAR);
}

/** On meeting: an enemy patrol much weaker than the fleet runs; a convoy always runs; otherwise it closes. */
export function meetResponse(kind: ResidentKind, enemyPower: number, playerPower: number): 'chase' | 'flee' {
  if (kind === 'convoy') return 'flee';
  // 反攻艦隊 (0.0.74): it is set on its target and never runs.
  if (kind === 'counter') return 'chase';
  return enemyPower < playerPower * FLEE_BELOW ? 'flee' : 'chase';
}

/** A point `dist` px from `from`, straight away from `threat` (where a running fleet makes for). */
export function fleePoint(from: { x: number; y: number }, threat: { x: number; y: number }, dist = SECTOR_PX * 4): { x: number; y: number } {
  let dx = from.x - threat.x;
  if (Math.abs(dx) > WORLD_PX.w / 2) dx -= Math.sign(dx) * WORLD_PX.w;
  const dy = from.y - threat.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: from.x + (dx / len) * dist, y: Math.max(0, Math.min(WORLD_PX.h, from.y + (dy / len) * dist)) };
}

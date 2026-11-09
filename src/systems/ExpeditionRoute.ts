/**
 * 遠征の航路 (#445, 0.0.73 段階 B2, pure): an expedition sails a real route on the world's sea. It leaves the home
 * port (a sea's expedition, the navy's forward base in that sea), sails out to a place on the sea, keeps station there
 * for what its time leaves, and sails back. Its time stays the expedition's own (so the hourly income keeps to the
 * economy's table); the place is chosen as far out as that time lets it go and back at OFFSCREEN_SPEED (30 sectors at
 * most), so a longer expedition goes farther. Danger out there makes it pay a little more, and the residents met on
 * the way fight it off-screen (never sinking it).
 */
import { BASES } from '@/systems/BaseSystem';
import {
  ISectorRef, SECTOR_PX, WORLD_MAP, WORLD_PX, colGap, dangerAt, findRoute, homePort, isSea, seaSteps, theaterOf,
} from '@/systems/OpenSeaSystem';
import { WORLD_HOUR_MS } from '@/systems/WorldClock';
import { CATCH_UP_HOURS, IOffscreenWorld, OFFSCREEN_FLOOR, OFFSCREEN_SPEED, offscreenHurt, RETURN_AT, routeSectors } from '@/systems/FleetOrders';
import type { IExpedition, IExpeditionRun } from '@/systems/ExpeditionSystem';
import { MEET_PX, residentPos, worldGap } from '@/systems/WorldSim';

/** The farthest an expedition sails out (sectors). */
export const MAX_ONE_WAY = 30;
export const MIN_ONE_WAY = 2;

export interface IExpeditionPlan {
  start: ISectorRef;
  dest: ISectorRef;
  /** One way, start and destination included */
  route: ISectorRef[];
  /** Real ms out (and as long back) */
  legMs: number;
  /** Real ms kept on station at the destination */
  stationMs: number;
  danger: number;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Where an expedition leaves from: the home port, or for a sea's expedition the navy's forward base in that sea. */
export function expeditionStart(nation: string, exp: Pick<IExpedition, 'theater'>): ISectorRef | null {
  if (exp.theater) {
    const base = BASES.find((b) => b.nation === nation && b.kind === 'forward' && (b.theaters ?? []).includes(exp.theater!) && WORLD_MAP.bases[b.id]);
    const s = base ? WORLD_MAP.bases[base.id] : undefined;
    if (s) return { c: s.c, r: s.r };
  }
  const home = homePort(nation);
  return home ? { c: home.c, r: home.r } : null;
}

/** The one-way distance an expedition of `minutes` may sail (out and back in its time at OFFSCREEN_SPEED). */
export function oneWayFor(minutes: number): number {
  const worldHours = (minutes * 60_000) / WORLD_HOUR_MS;
  return Math.max(MIN_ONE_WAY, Math.min(MAX_ONE_WAY, Math.floor((OFFSCREEN_SPEED * worldHours) / 2 * 0.9)));
}

const cache = new Map<string, IExpeditionPlan | null>();
const stepsCache = new Map<string, Int16Array>();

/** The expedition's route for a navy (the same every time: the place is drawn by a fixed seed). */
export function expeditionPlan(nation: string, exp: Pick<IExpedition, 'id' | 'minutes' | 'theater'>): IExpeditionPlan | null {
  const key = `${nation}:${exp.id}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const start = expeditionStart(nation, exp);
  let plan: IExpeditionPlan | null = null;
  if (start) {
    const want = oneWayFor(exp.minutes);
    const sk = `${start.c},${start.r}`;
    const steps = stepsCache.get(sk) ?? seaSteps(start);
    stepsCache.set(sk, steps);
    const cols = WORLD_MAP.cols;
    // Sea sectors a little short of the distance by sea (in the expedition's own sea when it has one).
    const near: ISectorRef[] = [];
    for (let r = 0; r < WORLD_MAP.rows; r++) {
      for (let c = 0; c < cols; c++) {
        const n = steps[r * cols + c];
        if (n < Math.max(1, want * 0.7) || n > want || !isSea(c, r)) continue;
        if (exp.theater && theaterOf(c, r) !== exp.theater) continue;
        near.push({ c, r });
      }
    }
    const pool = near.length > 0 ? near : [start];
    const dest = pool[hash(key) % pool.length];
    let route = dest.c === start.c && dest.r === start.r ? [start, start] : findRoute(start, dest);
    // The way by sea can be longer than the steps counted (diagonals): it ends where the time allows.
    const budget = (OFFSCREEN_SPEED * ((exp.minutes * 60_000) / WORLD_HOUR_MS)) / 2;
    while (route && route.length > 2 && routeSectors(route) > budget) route = route.slice(0, -1);
    if (route) {
      const end = route[route.length - 1];
      const legMs = Math.round((routeSectors(route) / OFFSCREEN_SPEED) * WORLD_HOUR_MS);
      plan = { start, dest: end, route, legMs, stationMs: Math.max(0, exp.minutes * 60_000 - legMs * 2), danger: dangerAt(nation, end) };
    }
  }
  cache.set(key, plan);
  return plan;
}

/** Where an expedition is at `t`: out along the route, on station, or back along it (world px). */
export function expeditionPos(plan: IExpeditionPlan, startedAt: number, t: number): { x: number; y: number; leg: 'out' | 'station' | 'back' } {
  const e = Math.max(0, t - startedAt);
  const along = (ms: number): { x: number; y: number } => {
    let d = (ms / WORLD_HOUR_MS) * OFFSCREEN_SPEED;
    for (let i = 1; i < plan.route.length; i++) {
      const a = plan.route[i - 1];
      const b = plan.route[i];
      const len = Math.hypot(colGap(a.c, b.c), b.r - a.r);
      if (d <= len || i === plan.route.length - 1) {
        const k = len > 0 ? Math.min(1, d / len) : 0;
        let dc = b.c - a.c;
        if (Math.abs(dc) > WORLD_MAP.cols / 2) dc -= Math.sign(dc) * WORLD_MAP.cols;
        const x = ((((a.c + 0.5 + dc * k) * SECTOR_PX) % WORLD_PX.w) + WORLD_PX.w) % WORLD_PX.w;
        return { x, y: (a.r + 0.5 + (b.r - a.r) * k) * SECTOR_PX };
      }
      d -= len;
    }
    const s = plan.route[0];
    return { x: (s.c + 0.5) * SECTOR_PX, y: (s.r + 0.5) * SECTOR_PX };
  };
  if (e < plan.legMs) return { ...along(e), leg: 'out' };
  if (e < plan.legMs + plan.stationMs) return { ...along(plan.legMs), leg: 'station' };
  return { ...along(Math.max(0, plan.legMs * 2 + plan.stationMs - e)), leg: 'back' };
}

/** Real ms the expedition needs from `t` to be home, sailing back from where it is. */
export function msHomeFrom(plan: IExpeditionPlan, startedAt: number, t: number): number {
  const e = Math.max(0, t - startedAt);
  if (e < plan.legMs) return e;
  if (e < plan.legMs + plan.stationMs) return plan.legMs;
  return Math.max(0, plan.legMs * 2 + plan.stationMs - e);
}

/** 危ない海ほど多い: the reward's multiplier by the danger out there (0.9 near home, up to 1.3). */
export function expeditionDangerMul(danger: number): number {
  return Math.max(0.9, Math.min(1.3, 1 + 0.05 * (danger - 3)));
}

/** Sectors sailed by an expedition that came home (out and back). */
export function expeditionSectors(plan: IExpeditionPlan): number {
  return Math.round(routeSectors(plan.route) * 2);
}

/** An expedition's fight on its way (for the notes and the medals). */
export interface IExpeditionFight {
  runId: string;
  shipIds: string[];
  residentId: string;
  won: boolean;
  turnedHome: boolean;
  at: number;
}

/**
 * Brings the expeditions under way up to `now`: an enemy resident met on the route fights them off-screen as a
 * fleet under orders is fought (never sunk); hurt down to the 帰投の基準 (大破), the expedition turns home at once and
 * pays half. Runs sent before the routes (no `startedAt`) are left as they were.
 */
export function advanceExpeditions(
  runs: readonly IExpeditionRun[], hp: Readonly<Record<string, number>>, now: number, w: IOffscreenWorld,
  planOf: (id: string) => IExpeditionPlan | null,
): { runs: IExpeditionRun[]; hp: Record<string, number>; fights: IExpeditionFight[] } {
  const health: Record<string, number> = { ...hp };
  const fights: IExpeditionFight[] = [];
  const out = runs.map((run) => {
    const plan = planOf(run.id);
    if (run.startedAt === undefined || !plan || run.cut) return run;
    let r: IExpeditionRun = { ...run, met: [...(run.met ?? [])] };
    const from = Math.max(run.checkedAt ?? run.startedAt, now - CATCH_UP_HOURS * WORLD_HOUR_MS);
    const end = Math.min(now, run.endsAt);
    for (let t = from; t <= end; t += WORLD_HOUR_MS / 4) {
      const at = expeditionPos(plan, run.startedAt, t);
      const foe = w.residents.find((x) => x.kind !== 'friend' && x.kind !== 'superweapon' && !r.met!.includes(x.id) && !w.won(x.id) && worldGap(residentPos(x, t), at) <= MEET_PX);
      if (!foe) continue;
      const ours = w.power(r.shipIds, health);
      const theirs = w.enemyPower(foe);
      for (const id of r.shipIds) health[id] = Math.max(OFFSCREEN_FLOOR, (health[id] ?? 1) - offscreenHurt(ours, theirs, `${foe.id}:${id}`));
      r = { ...r, met: [...r.met!, foe.id] };
      const low = r.shipIds.some((id) => (health[id] ?? 1) <= RETURN_AT.heavy);
      if (low) r = { ...r, cut: true, endsAt: Math.min(r.endsAt, t + msHomeFrom(plan, run.startedAt, t)) };
      fights.push({ runId: run.id, shipIds: [...r.shipIds], residentId: foe.id, won: ours >= theirs, turnedHome: low, at: t });
      if (low) break;
    }
    return { ...r, checkedAt: Math.max(from, end) };
  });
  return { runs: out, hp: health, fights };
}

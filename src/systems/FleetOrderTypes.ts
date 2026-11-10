/**
 * 画面の外の艦隊 (0.0.72): the order's shape and its reading from a save, apart from the reckoning (FleetOrders) so the
 * anchorages (OpenSeaSystem) can read it without a load-order cycle. No imports but types.
 */
import type { IAnchorPlace, ISectorRef } from '@/systems/OpenSeaSystem';

/** 自動の帰投の基準: none — never on its own; heavy — a ship at 大破 (25%); medium — a ship at 中破 (50%). */
export type ReturnRule = 'none' | 'heavy' | 'medium';

export interface IFleetOrder {
  /** The sea route, start and end included */
  route: ISectorRef[];
  dest: IAnchorPlace;
  /** Real ms the fleet set out (its place on the route counts from here) */
  startedAt: number;
  /** Real ms the watch for enemies has reached */
  checkedAt: number;
  /** Residents already met on this run */
  met: string[];
  /** Turned home by its 帰投の基準 */
  home?: boolean;
  /** 哨戒 (0.0.73): after the route, round this loop until called off; chase what it finds, or only report it */
  patrol?: { loop: ISectorRef[]; stance: PatrolStance; mission?: MissionKind };
  /** 任務の働き (0.0.74): world ms the duty's work (mines laid, sweeping, training) was last counted to */
  workAt?: number;
  /** Residents the patrol has already reported */
  seen?: string[];
}

export type PatrolStance = 'chase' | 'report';

/**
 * 任務 (0.0.74, HoI4 に倣う) of a fleet round a loop: 哨戒 (find and report), 船団護衛 (keep the convoys' income),
 * 通商破壊 (sink the enemy's convoys), 機雷敷設 / 掃海 (lay mines / clear them), 訓練 (train in safe waters).
 * 迎撃 is no loop: the fleet waits in a base (IAnchoredFleet.intercept).
 */
export type MissionKind = 'patrol' | 'escort' | 'raid' | 'mine' | 'sweep' | 'train';
export const MISSION_KINDS: readonly MissionKind[] = ['patrol', 'escort', 'raid', 'mine', 'sweep', 'train'];

/** Read safely from a save (alpha: a broken order is dropped and the fleet lies where it started). */
export function parseOrder(raw: unknown): IFleetOrder | undefined {
  const o = raw as Partial<IFleetOrder> | null;
  if (!o || !Array.isArray(o.route) || !o.dest || typeof o.startedAt !== 'number') return undefined;
  const route = o.route.filter((s): s is ISectorRef => typeof s?.c === 'number' && typeof s?.r === 'number').map((s) => ({ c: s.c, r: s.r }));
  const d = o.dest as Partial<IAnchorPlace>;
  if (route.length < 2 || typeof d.x !== 'number' || typeof d.y !== 'number') return undefined;
  const p = o.patrol as { loop?: unknown; stance?: unknown } | undefined;
  const loop = Array.isArray(p?.loop) ? p!.loop.filter((s): s is ISectorRef => typeof (s as ISectorRef)?.c === 'number' && typeof (s as ISectorRef)?.r === 'number').map((s) => ({ c: s.c, r: s.r })) : [];
  const mission = MISSION_KINDS.find((m) => m === (p as { mission?: unknown } | undefined)?.mission);
  const patrol = loop.length >= 2 ? { loop, stance: (p?.stance === 'report' ? 'report' : 'chase') as PatrolStance, ...(mission && mission !== 'patrol' ? { mission } : {}) } : undefined;
  return {
    route,
    dest: { ...(typeof d.base === 'string' ? { base: d.base } : {}), x: d.x, y: d.y },
    startedAt: o.startedAt,
    checkedAt: typeof o.checkedAt === 'number' ? o.checkedAt : o.startedAt,
    met: Array.isArray(o.met) ? o.met.filter((id): id is string => typeof id === 'string') : [],
    ...(o.home === true ? { home: true } : {}),
    ...(patrol ? { patrol } : {}),
    ...(typeof o.workAt === 'number' && Number.isFinite(o.workAt) ? { workAt: o.workAt } : {}),
    ...(Array.isArray(o.seen) ? { seen: o.seen.filter((id): id is string => typeof id === 'string') } : {}),
  };
}

export function parseReturnRule(raw: unknown): ReturnRule | undefined {
  return raw === 'none' || raw === 'heavy' || raw === 'medium' ? raw : undefined;
}

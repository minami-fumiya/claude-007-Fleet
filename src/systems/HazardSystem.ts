import { ICampaignArea, Objective } from '@/types/Campaign';
import { ShipClass } from '@/types/ShipClass';

/**
 * 海の障害と上陸支援 (#368 #251, pure).
 * - 機雷原: the enemy's minefields in the deeper seas. A surface ship of the player's sailing through one may strike a
 *   mine; destroyers inside sweep it, and once swept it is gone.
 * - 防潜網: nets across a harbour or a strait. The player's submarines inside crawl.
 * - 上陸支援: in a 対地攻撃 battle a landing party goes ashore while the fleet stands close to the island, and hits the
 *   nearest shore target hard (twice a battle at most).
 */

export type HazardKind = 'minefield' | 'net';

export interface IHazard {
  kind: HazardKind;
  /** Centre and radius in world pixels */
  x: number;
  y: number;
  r: number;
  /** A minefield's mines left, 1 → 0 (swept) */
  charge: number;
}

export const HAZARD_LABEL: Record<HazardKind, string> = { minefield: '機雷原', net: '防潜網' };

/** Minefields lie from this depth of the navy's order on */
export const MINE_DEPTH = 4;
export const MINE_RADIUS = 230;
/** Chance a second of striking a mine at full speed (150) in an unswept field */
export const MINE_RATE = 0.05;
/** A mine takes this share of the ship's HP */
export const MINE_DAMAGE = 0.1;
/** Destroyer-seconds it takes to sweep a field */
export const SWEEP_SECONDS = 20;
/** A destroyer sweeping strikes mines this much less often */
export const SWEEPER_RATE_MUL = 0.5;
export const NET_RADIUS = 260;
/** Speed of the player's submarines inside a net */
export const NET_SPEED_MUL = 0.3;

/** 上陸支援: when the landing parties go ashore (battle ms), how close a ship must be, and what they do */
export const LANDING_AT: readonly number[] = [60_000, 150_000];
export const LANDING_RANGE = 700;
export const LANDING_DAMAGE = 0.45;

function idHash(id: string): number {
  let h = 7;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 100_003;
  return h;
}

/** A small, stable pseudo-random sequence for an area */
function seq(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export interface IHazardPlan {
  mines: number;
  net: boolean;
}

/** What an area holds (none in the training seas, exercises or the first seas of the order). */
export function hazardPlan(area: Pick<ICampaignArea, 'id' | 'objective' | 'training'>, depth: number): IHazardPlan {
  if (area.training) return { mines: 0, net: false };
  const h = idHash(area.id);
  const mines = depth >= MINE_DEPTH && h % 3 !== 0 ? 1 + (depth >= 9 && h % 2 === 0 ? 1 : 0) : 0;
  const net = depth >= 3 && (area.objective === Objective.Bombard || area.objective === Objective.Breakthrough);
  return { mines, net };
}

/**
 * Where the hazards lie: the minefields across the middle of the sea (between the fleets), the net round the island
 * a bombardment is for, or across the middle of a strait. `island` is the island's centre and radius, if any.
 */
export function placeHazards(plan: IHazardPlan, areaId: string, world: { w: number; h: number }, island?: { x: number; y: number; r: number }): IHazard[] {
  const rnd = seq(idHash(areaId) * 2654435761);
  const out: IHazard[] = [];
  for (let i = 0; i < plan.mines; i++) {
    const x = world.w * (0.25 + 0.5 * rnd());
    const y = world.h * (0.38 + 0.24 * rnd());
    out.push({ kind: 'minefield', x, y, r: MINE_RADIUS, charge: 1 });
  }
  if (plan.net) {
    const at = island ?? { x: world.w / 2, y: world.h * 0.4, r: 0 };
    out.push({ kind: 'net', x: at.x, y: at.y, r: Math.max(NET_RADIUS, at.r * 1.35), charge: 1 });
  }
  return out;
}

export function inHazard(z: IHazard, x: number, y: number): boolean {
  return z.charge > 0 && Math.hypot(x - z.x, y - z.y) <= z.r;
}

/** The chance this frame that a surface ship moving at `speed` strikes a mine of field `z` (0 when submerged). */
export function mineChance(z: IHazard, speed: number, dtSec: number, opts: { submerged?: boolean; sweeper?: boolean } = {}): number {
  if (z.kind !== 'minefield' || z.charge <= 0 || opts.submerged || speed <= 1) return 0;
  return Math.min(1, MINE_RATE * z.charge * Math.min(1.5, speed / 150) * dtSec * (opts.sweeper ? SWEEPER_RATE_MUL : 1));
}

/** The field after `destroyers` of the player's destroyers spent `dtSec` inside it. */
export function sweep(z: IHazard, destroyers: number, dtSec: number): IHazard {
  if (z.kind !== 'minefield' || destroyers <= 0 || z.charge <= 0) return z;
  return { ...z, charge: Math.max(0, z.charge - (destroyers * dtSec) / SWEEP_SECONDS) };
}

export function isSweeper(shipClass: ShipClass): boolean {
  return shipClass === ShipClass.Destroyer;
}

/** The net's speed for a ship inside it (submarines only). */
export function netSpeedMul(hazards: readonly IHazard[], shipClass: ShipClass, x: number, y: number): number {
  if (shipClass !== ShipClass.Submarine) return 1;
  return hazards.some((z) => z.kind === 'net' && inHazard(z, x, y)) ? NET_SPEED_MUL : 1;
}

/** Whether the next landing is due: the battle's time has come and one of the fleet is close to the island. */
export function landingDue(battleMs: number, done: number, nearest: number): boolean {
  const at = LANDING_AT[done];
  return at !== undefined && battleMs >= at && nearest <= LANDING_RANGE;
}

/** "機雷原 2 (駆逐艦で掃海)・防潜網" — '' for a clear sea */
export function hazardText(plan: IHazardPlan, bombard: boolean): string {
  const parts = [
    ...(plan.mines > 0 ? [`機雷原 ${plan.mines} (駆逐艦で掃海)`] : []),
    ...(plan.net ? ['防潜網 (潜水艦が遅くなる)'] : []),
    ...(bombard ? ['上陸支援 (島に近づくと上陸部隊が陣地を攻撃)'] : []),
  ];
  return parts.join('・');
}

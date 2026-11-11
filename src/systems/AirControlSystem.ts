/**
 * 空の地方と制空権・航空の任務 (#445, 0.0.75 段階 C2, pure). The sky is cut as the sea is (the same regions). A navy's
 * air in a region comes from its airfields within AIR_RANGE (the home port's own, and each base with a 基地航空隊,
 * 12 a level) and the carriers on duty there; the enemy's from its airfields (strong round the areas not yet won,
 * weak where the navy has won them). The control is the navy's share of the two.
 *
 * At AIR_HIGH and above the navy's scouts show the enemy at the start of a battle there; at AIR_LOW and below, where
 * the enemy's own air is strong, its land planes raid the battle once. Above 50% the sky held adds to the sea's
 * control (SeaRegionSystem.airSeaPoints).
 *
 * 航空の任務 are given to a base's air group for one region in its reach: 制空 (doubles its air there), 索敵 (finds
 * the enemy's ships there every world hour), 対艦攻撃 (strikes the ships found there before they are fought: they
 * fight weaker) and 港湾攻撃 (strikes the enemy's harbour there every six world hours: its ships go unrepaired).
 */
import type { ISectorRef } from '@/systems/OpenSeaSystem';
import { SECTOR_PX, colGap, dangerAt } from '@/systems/OpenSeaSystem';
import { ISeaRegion, regionAt } from '@/systems/SeaRegionSystem';
import { WORLD_HOUR_MS } from '@/systems/WorldClock';
import { IResident, residentPos, worldGap } from '@/systems/WorldSim';

/** How far an airfield's planes reach (sectors, ~2,200 km). */
export const AIR_RANGE = 16;
/** The home port's own airfields. */
export const HOME_AIR = 24;
/** A base's 基地航空隊, a level. */
export const BASE_AIR_PER_LEVEL = 12;
/** A carrier on duty in the region. */
export const CARRIER_AIR = 8;
/** Land planes developed make the airfields stronger. */
export const LAND_PLANE_MUL = 1.2;
/** 制空: the air group's strength there, doubled. */
export const SUPERIORITY_MUL = 2;
/** 制空権の段階 */
export const AIR_HIGH = 60;
export const AIR_LOW = 25;
/** The enemy raids only where its own air is at least this strong. */
export const RAID_ENEMY_MIN = 15;
/** 対艦攻撃: a ship struck fights at this share of its strength. */
export const STRUCK_MUL = 0.75;
/** 索敵 finds what is within this many sectors of the region's middle. */
export const AIR_RECON_SECTORS = 6;
/** 港湾攻撃 strikes every this many world hours; the harbour stays unrepaired this long. */
export const PORT_STRIKE_HOURS = 6;
export const PORT_DOWN_HOURS = 24;
/** 港湾攻撃: the enemy in a sea whose harbour was struck fights at this share. */
export const PORT_DOWN_MUL = 0.9;

export type AirMission = 'superiority' | 'recon' | 'strike' | 'port';
export const AIR_MISSIONS: readonly AirMission[] = ['superiority', 'recon', 'strike', 'port'];
export const AIR_MISSION_JA: Record<AirMission, string> = { superiority: '制空', recon: '索敵', strike: '対艦攻撃', port: '港湾攻撃' };

/** An airfield of the navy: the home port (`home`) or a base with a 基地航空隊. */
export interface IAirField {
  id: string;
  name: string;
  at: ISectorRef;
  power: number;
}

/** A base air group's mission (saved with the navy's 制海権). */
export interface IAirOp {
  base: string;
  mission: AirMission;
  region: string;
  /** World ms its work was last counted to */
  at: number;
}

export interface IAirInput {
  nation: string;
  cleared: readonly string[];
  lost: readonly string[];
  fields: readonly IAirField[];
  /** Carriers on duty, by region */
  carriers: Readonly<Record<string, number>>;
  ops: readonly IAirOp[];
}

function gap(a: ISectorRef, b: ISectorRef): number {
  return Math.hypot(colGap(a.c, b.c), a.r - b.r);
}

/** Whether an airfield's planes reach a region: its middle within AIR_RANGE, or the airfield in the region itself. */
export function inAirRange(field: Pick<IAirField, 'at'>, region: Pick<ISeaRegion, 'seed' | 'id'>): boolean {
  return gap(field.at, region.seed) <= AIR_RANGE || regionAt(field.at)?.id === region.id;
}

/** The navy's air over a region. */
export function ourAir(region: ISeaRegion, input: IAirInput): number {
  let sum = (input.carriers[region.id] ?? 0) * CARRIER_AIR;
  for (const f of input.fields) {
    if (!inAirRange(f, region)) continue;
    const covering = input.ops.some((o) => o.base === f.id && o.region === region.id && o.mission === 'superiority');
    sum += f.power * (covering ? SUPERIORITY_MUL : 1);
  }
  return sum;
}

/** The enemy's air over a region: its airfields round the areas not yet won, a little everywhere by the danger. */
export function enemyAir(region: ISeaRegion, input: Pick<IAirInput, 'nation' | 'cleared' | 'lost'>): number {
  const danger = dangerAt(input.nation, region.seed);
  if (region.home) return region.home === input.nation ? 0 : 60;
  if (region.areaId) return input.cleared.includes(region.areaId) && !input.lost.includes(region.areaId) ? 1.5 * danger : 10 + 3 * danger;
  return danger;
}

/** 制空権 of a region: the navy's share of the air over it (50 where neither side flies). */
export function airControl(region: ISeaRegion, input: IAirInput): number {
  const ours = ourAir(region, input);
  const theirs = enemyAir(region, input);
  if (ours + theirs <= 0) return 50;
  return Math.round((100 * ours) / (ours + theirs));
}

/** What the sky does to a battle there: the scouts out (high), or the enemy's planes raiding (low, enemy strong). */
export function airEffect(region: ISeaRegion, input: IAirInput): 'scout' | 'raid' | null {
  const v = airControl(region, input);
  if (v >= AIR_HIGH) return 'scout';
  if (v <= AIR_LOW && enemyAir(region, input) >= RAID_ENEMY_MIN) return 'raid';
  return null;
}

/** The airfields that reach a region (the home port's can't be sent: it guards home). */
export function fieldsFor(region: ISeaRegion, fields: readonly IAirField[]): IAirField[] {
  return fields.filter((f) => f.id !== 'home' && inAirRange(f, region)).sort((a, b) => gap(a.at, region.seed) - gap(b.at, region.seed));
}

/** A mission given: the base's air group takes it up (one mission a base). */
export function setAirOp(ops: readonly IAirOp[], base: string, mission: AirMission, region: string, now: number): IAirOp[] {
  return [...ops.filter((o) => o.base !== base), { base, mission, region, at: now }];
}

export function clearAirOp(ops: readonly IAirOp[], base: string): IAirOp[] {
  return ops.filter((o) => o.base !== base);
}

/** Read from a save: anything broken is dropped. */
export function parseAirOps(raw: unknown): IAirOp[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((o): o is IAirOp => !!o && typeof o.base === 'string' && AIR_MISSIONS.includes(o.mission) && typeof o.region === 'string' && Number.isFinite(o.at))
    .map((o) => ({ base: o.base, mission: o.mission, region: o.region, at: o.at }));
}

/** What the air groups did since they were last counted. */
export interface IAirWork {
  ops: IAirOp[];
  /** 索敵: enemies found (as a patrol's sightings) */
  found: Array<{ id: string; kind: string; c: number; r: number; at: number; base: string }>;
  /** 対艦攻撃: residents struck */
  struck: string[];
  /** 港湾攻撃: regions whose harbour was struck, and when */
  ports: Array<{ region: string; at: number }>;
}

/**
 * Brings the air groups' missions up to `now`, a world hour at a time (a day at most): 索敵 finds the residents near the
 * region's middle; 対艦攻撃 strikes those found (by itself or the patrols) that are not struck yet; 港湾攻撃 strikes
 * the harbour every PORT_STRIKE_HOURS (only a region round an area the navy has not won).
 */
export function advanceAirOps(input: { ops: readonly IAirOp[]; regions: (id: string) => ISeaRegion | undefined; residents: readonly IResident[]; won: (id: string) => boolean; struck: (id: string) => boolean; enemyHarbour: (region: ISeaRegion) => boolean }, now: number): IAirWork {
  const H = WORLD_HOUR_MS;
  const work: IAirWork = { ops: [], found: [], struck: [], ports: [] };
  const struck = new Set<string>();
  for (const op of input.ops) {
    const region = input.regions(op.region);
    if (!region) continue;
    const from = Math.max(op.at, now - 24 * H);
    const step = op.mission === 'port' ? PORT_STRIKE_HOURS * H : H;
    let t = from + step;
    let at = op.at;
    if (op.mission === 'superiority') {
      work.ops.push({ ...op, at: now });
      continue;
    }
    const middle = { x: (region.seed.c + 0.5) * SECTOR_PX, y: (region.seed.r + 0.5) * SECTOR_PX };
    for (; t <= now; t += step) {
      at = t;
      if (op.mission === 'port') {
        if (input.enemyHarbour(region)) work.ports.push({ region: region.id, at: t });
        continue;
      }
      for (const r of input.residents) {
        if (r.kind === 'friend' || r.kind === 'superweapon' || input.won(r.id)) continue;
        const p = residentPos(r, t);
        if (worldGap(p, middle) > AIR_RECON_SECTORS * SECTOR_PX) continue;
        if (op.mission === 'recon' && !work.found.some((f) => f.id === r.id)) work.found.push({ id: r.id, kind: r.kind, c: Math.floor(p.x / SECTOR_PX), r: Math.floor(p.y / SECTOR_PX), at: t, base: op.base });
        if (op.mission === 'strike' && !input.struck(r.id) && !struck.has(r.id)) {
          struck.add(r.id);
          work.struck.push(r.id);
          break;
        }
      }
    }
    work.ops.push({ ...op, at });
  }
  return work;
}

import { IResources } from '@/types/Progression';
import { canAfford, pay, REGEN_CAP, REGEN_PER_TICK, RESOURCE_KEYS, resources } from './ResourceSystem';
import type { IBase } from './BaseSystem';

/**
 * Base facilities (#146, pure). Every base can build the common facilities and has one of its own (its bonus from
 * #88, which counts as level 1 of it). Regeneration speed and caps are the base values plus every base's
 * facilities, so a player without any facility regenerates exactly as before.
 */

export type FacilityId = 'fuelTank' | 'ammoDepot' | 'steelMill' | 'airBase' | 'workshop' | 'unique';

export interface IFacility {
  id: FacilityId;
  name: string;
  /** What one level adds */
  effect: string;
  maxLevel: number;
}

export const COMMON_FACILITIES: IFacility[] = [
  { id: 'fuelTank', name: '燃料タンク', effect: '燃料の回復上限 +1,000', maxLevel: 5 },
  { id: 'ammoDepot', name: '弾薬庫', effect: '弾薬の回復上限 +1,000', maxLevel: 5 },
  { id: 'steelMill', name: '製鋼所', effect: '鋼材の回復 +1 / 分', maxLevel: 5 },
  { id: 'airBase', name: '航空基地', effect: 'ボーキの回復 +1 / 分', maxLevel: 5 },
  { id: 'workshop', name: '工作部', effect: 'この軍港の研究費・建造時間 −5%', maxLevel: 5 },
];

/** The base's own facility: its bonus grows by half again per level above 1 (up to 3). */
export const UNIQUE_MAX_LEVEL = 3;

/** Base id → facility → level (the unique one is 1 when absent). */
export type Facilities = Record<string, Partial<Record<FacilityId, number>>>;

/** A facility being built or raised (#146). */
export interface IFacilityJob {
  base: string;
  id: FacilityId;
  /** The level it reaches */
  level: number;
  endsAt: number;
}

export function facilityLevel(facilities: Facilities, base: string, id: FacilityId): number {
  const lv = facilities[base]?.[id];
  return lv ?? (id === 'unique' ? 1 : 0);
}

export function maxLevelOf(id: FacilityId): number {
  return id === 'unique' ? UNIQUE_MAX_LEVEL : COMMON_FACILITIES.find((f) => f.id === id)?.maxLevel ?? 0;
}

/** Cost of raising a facility to `level`: grows with the level. */
export function facilityCost(id: FacilityId, level: number): IResources {
  const n = Math.max(1, level);
  if (id === 'unique') return resources({ fuel: 600 * n, ammo: 300 * n, steel: 900 * n, bauxite: 150 * n });
  return resources({ fuel: 200 * n, ammo: 100 * n, steel: 300 * n, bauxite: id === 'airBase' ? 100 * n : 0 });
}

/** Minutes to raise a facility to `level`. */
export function facilityMinutes(id: FacilityId, level: number): number {
  return (id === 'unique' ? 30 : 10) * Math.max(1, level);
}

export type FacilityState = 'max' | 'busy' | 'resources' | 'ready';

/** Whether the facility can be raised now: one job per base at a time. */
export function facilityState(facilities: Facilities, jobs: readonly IFacilityJob[], base: string, id: FacilityId, have: IResources): FacilityState {
  const lv = facilityLevel(facilities, base, id);
  if (lv >= maxLevelOf(id)) return 'max';
  if (jobs.some((j) => j.base === base)) return 'busy';
  return canAfford(have, facilityCost(id, lv + 1)) ? 'ready' : 'resources';
}

/** Pays for and starts raising a facility; null when it can't be raised now. */
export function startFacility<T extends { resources: IResources; facilities: Facilities; facilityJobs: IFacilityJob[] }>(
  progress: T, base: string, id: FacilityId, now: number,
): T | null {
  if (facilityState(progress.facilities, progress.facilityJobs, base, id, progress.resources) !== 'ready') return null;
  const level = facilityLevel(progress.facilities, base, id) + 1;
  const left = pay(progress.resources, facilityCost(id, level));
  if (!left) return null;
  return { ...progress, resources: left, facilityJobs: [...progress.facilityJobs, { base, id, level, endsAt: now + facilityMinutes(id, level) * 60_000 }] };
}

/** Finished facility jobs take effect (also after the game was closed). */
export function finishFacilities<T extends { facilities: Facilities; facilityJobs: IFacilityJob[] }>(progress: T, now: number): T {
  const done = progress.facilityJobs.filter((j) => j.endsAt <= now);
  if (done.length === 0) return progress;
  const facilities: Facilities = { ...progress.facilities };
  for (const j of done) facilities[j.base] = { ...(facilities[j.base] ?? {}), [j.id]: Math.max(j.level, facilityLevel(facilities, j.base, j.id)) };
  return { ...progress, facilities, facilityJobs: progress.facilityJobs.filter((j) => j.endsAt > now) };
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

function totalLevel(facilities: Facilities, id: FacilityId): number {
  return Object.keys(facilities).reduce((sum, base) => sum + facilityLevel(facilities, base, id), 0);
}

export interface IRegenRules {
  perTick: IResources;
  cap: IResources;
}

/** Regeneration with every base's facilities: tanks raise caps, the mill and the air base speed steel and bauxite. */
export function regenRules(facilities: Facilities): IRegenRules {
  const cap = resources();
  for (const k of RESOURCE_KEYS) cap[k] = REGEN_CAP;
  cap.fuel += 1000 * totalLevel(facilities, 'fuelTank');
  cap.ammo += 1000 * totalLevel(facilities, 'ammoDepot');
  const perTick = { ...REGEN_PER_TICK };
  perTick.steel += totalLevel(facilities, 'steelMill');
  perTick.bauxite += totalLevel(facilities, 'airBase');
  return { perTick, cap };
}

/** "燃料タンク Lv2 (横須賀) +2,000" lines behind the regeneration figures. */
export function regenBreakdown(facilities: Facilities, baseName: (id: string) => string): string[] {
  const out: string[] = [];
  for (const [base, levels] of Object.entries(facilities)) {
    for (const f of COMMON_FACILITIES.filter((x) => x.id !== 'workshop')) {
      const lv = levels[f.id] ?? 0;
      if (lv > 0) out.push(`${f.name} Lv${lv} (${baseName(base)})`);
    }
  }
  return out;
}

/** How much stronger the base's own bonus is at its unique facility's level: ×1, ×1.5, ×2. */
export function uniqueStrength(facilities: Facilities, base: string): number {
  return 1 + 0.5 * (facilityLevel(facilities, base, 'unique') - 1);
}

/** A base with its own bonus scaled by its unique facility (#146) and its workshop's discounts folded in. */
export function boostedBase(base: IBase | undefined, facilities: Facilities): IBase | undefined {
  if (!base) return base;
  const k = uniqueStrength(facilities, base.id);
  const scale = (mul: number): number => Math.max(0.3, 1 - (1 - mul) * k);
  const research = (base.research !== undefined ? scale(base.research) : 1) * (1 - 0.05 * facilityLevel(facilities, base.id, 'workshop'));
  return {
    ...base,
    build: base.build ? { ...base.build, mul: scale(base.build.mul) } : undefined,
    research: research === 1 ? undefined : research,
    repairTime: base.repairTime !== undefined ? scale(base.repairTime) : undefined,
  };
}

/** Build time multiplier from the base's workshop (#146). */
export function buildTimeMul(facilities: Facilities, base: string): number {
  return 1 - 0.05 * facilityLevel(facilities, base, 'workshop');
}

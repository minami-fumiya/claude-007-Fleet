import { IResources } from '@/types/Progression';
import { canAfford, HOLD_CAP_BASE, HOLD_CAP_PER_LEVEL, pay, REGEN_CAP, REGEN_PER_TICK, RESOURCE_KEYS, resources } from './ResourceSystem';
import type { IBase } from './BaseSystem';
import { facilityMedal } from './MedalGate';

/**
 * Base facilities (#146, pure). Every base can build the common facilities and has one of its own (its bonus from
 * #88, which counts as level 1 of it). Regeneration speed and caps are the base values plus every base's
 * facilities, so a player without any facility regenerates exactly as before.
 */

export type FacilityId = 'fuelTank' | 'ammoDepot' | 'steelMill' | 'airBase' | 'workshop' | 'unique' | ForwardFacilityId;

/** 基地の施設 (#373): a forward base's own facilities, none of the ports'. */
export type ForwardFacilityId = 'supply' | 'anchorage' | 'baseAir' | 'frontShop' | 'outpost';

export interface IFacility {
  id: FacilityId;
  name: string;
  /** What one level adds */
  effect: string;
  maxLevel: number;
}

export const COMMON_FACILITIES: IFacility[] = [
  // The four resource facilities work alike (#190): each level adds regeneration speed and cap, and holding cap (#221).
  { id: 'fuelTank', name: '燃料タンク', effect: '燃料の回復 +1 / 分・回復上限 +1,000・保有上限 +5,000', maxLevel: 5 },
  { id: 'ammoDepot', name: '弾薬庫', effect: '弾薬の回復 +1 / 分・回復上限 +1,000・保有上限 +5,000', maxLevel: 5 },
  { id: 'steelMill', name: '製鋼所', effect: '鋼材の回復 +1 / 分・回復上限 +1,000・保有上限 +5,000', maxLevel: 5 },
  { id: 'airBase', name: '航空基地', effect: 'ボーキの回復 +1 / 分・回復上限 +1,000・保有上限 +5,000', maxLevel: 5 },
  { id: 'workshop', name: '工作部', effect: '研究費・建造時間 −5% (全軍港で合算)', maxLevel: 5 },
];

/**
 * 基地の施設 (#373): what a forward base can build, each from Lv0. All but 前線工作所 help only in the base's own
 * theater; 前線工作所 adds up over every base like a port's workshop.
 */
export const FORWARD_FACILITIES: ReadonlyArray<IFacility & { id: ForwardFacilityId }> = [
  { id: 'supply', name: '補給廠', effect: 'この戦域への出撃・掃討の燃料・弾薬 −10% / −15% / −20%', maxLevel: 3 },
  { id: 'anchorage', name: '泊地修理所', effect: 'この戦域の作戦で、途中の戦闘の後に全艦の耐久 +5% / +10% / +15%', maxLevel: 3 },
  { id: 'baseAir', name: '基地航空隊', effect: 'この戦域の戦闘で、敵艦隊の位置が分かる / 攻撃隊が 1 回来援 / 2 回来援', maxLevel: 3 },
  { id: 'frontShop', name: '前線工作所', effect: '研究費 −2%・修理時間 −3% (全基地で合算)', maxLevel: 3 },
  { id: 'outpost', name: '前進遠征拠点', effect: 'この海の遠征先が 1 つ開く / その遠征の報酬 +20%', maxLevel: 2 },
];

/** Whether a base id is a forward base's (#373): their ids read `<navy>_fb_<theater>`. */
export function isForwardBaseId(base: string): boolean {
  return base.includes('_fb_');
}

/** What each forward facility costs per level (#373): a little under a port's, the air group needing bauxite. */
const FORWARD_COST: Record<ForwardFacilityId, IResources> = {
  supply: { fuel: 150, ammo: 150, steel: 150, bauxite: 0 },
  anchorage: { fuel: 200, ammo: 0, steel: 300, bauxite: 0 },
  baseAir: { fuel: 200, ammo: 0, steel: 200, bauxite: 200 },
  frontShop: { fuel: 150, ammo: 100, steel: 250, bauxite: 0 },
  outpost: { fuel: 100, ammo: 100, steel: 200, bauxite: 0 },
};
const FORWARD_MINUTES: Record<ForwardFacilityId, number> = { supply: 3, anchorage: 5, baseAir: 5, frontShop: 4, outpost: 4 };
const isForwardFacility = (id: FacilityId): id is ForwardFacilityId => id in FORWARD_COST;

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
  // A forward base has no unique facility (#373).
  return lv ?? (id === 'unique' && !isForwardBaseId(base) ? 1 : 0);
}

export function maxLevelOf(id: FacilityId): number {
  if (id === 'unique') return UNIQUE_MAX_LEVEL;
  return [...COMMON_FACILITIES, ...FORWARD_FACILITIES].find((f) => f.id === id)?.maxLevel ?? 0;
}

/** The facilities a base can build (#373): a port's common ones and its own, or a forward base's. */
export function facilitiesOf(base: string): FacilityId[] {
  return isForwardBaseId(base) ? FORWARD_FACILITIES.map((f) => f.id) : ['unique', ...COMMON_FACILITIES.map((f) => f.id)];
}

/** Every forward base's level of a facility added up (#373), e.g. 前線工作所 over all of a navy's bases. */
export function forwardTotal(facilities: Facilities, id: ForwardFacilityId, bases?: readonly string[]): number {
  return Object.keys(facilities).filter((b) => isForwardBaseId(b) && (!bases || bases.includes(b))).reduce((sum, b) => sum + facilityLevel(facilities, b, id), 0);
}

/** Cost of raising a facility to `level`: grows with the level. */
export function facilityCost(id: FacilityId, level: number): IResources {
  const n = Math.max(1, level);
  if (isForwardFacility(id)) {
    const c = FORWARD_COST[id];
    return resources({ fuel: c.fuel * n, ammo: c.ammo * n, steel: c.steel * n, bauxite: c.bauxite * n });
  }
  if (id === 'unique') return resources({ fuel: 600 * n, ammo: 300 * n, steel: 900 * n, bauxite: 150 * n });
  return resources({ fuel: 200 * n, ammo: 100 * n, steel: 300 * n, bauxite: id === 'airBase' ? 100 * n : 0 });
}

/** Minutes to raise a facility to `level`: about half of 0.0.20's (#212), cut again by 2/5 in #359. */
export function facilityMinutes(id: FacilityId, level: number): number {
  if (isForwardFacility(id)) return FORWARD_MINUTES[id] * Math.max(1, level);
  return (id === 'unique' ? 10 : 3) * Math.max(1, level);
}

/** Facilities a base can raise at once (#216): two, three once its own facility is Lv2; a forward base one (#373). */
export function facilitySlots(facilities: Facilities, base: string): number {
  if (isForwardBaseId(base)) return 1;
  return facilityLevel(facilities, base, 'unique') >= 2 ? 3 : 2;
}

export type FacilityState = 'max' | 'busy' | 'medal' | 'resources' | 'ready';

/**
 * Whether the facility can be raised now: a base raises up to facilitySlots facilities at once but never the same one
 * twice (#216), and the upper levels need a medal (#169) when `medals` is given.
 */
export function facilityState(facilities: Facilities, jobs: readonly IFacilityJob[], base: string, id: FacilityId, have: IResources, medals?: readonly string[]): FacilityState {
  const lv = facilityLevel(facilities, base, id);
  if (!facilitiesOf(base).includes(id) || lv >= maxLevelOf(id)) return 'max';
  const here = jobs.filter((j) => j.base === base);
  if (here.some((j) => j.id === id) || here.length >= facilitySlots(facilities, base)) return 'busy';
  const need = facilityMedal(base, id, lv + 1);
  if (medals && need && !medals.includes(need)) return 'medal';
  return canAfford(have, facilityCost(id, lv + 1)) ? 'ready' : 'resources';
}

/** Pays for and starts raising a facility; null when it can't be raised now. */
export function startFacility<T extends { resources: IResources; facilities: Facilities; facilityJobs: IFacilityJob[]; record?: { medals: string[] } }>(
  progress: T, base: string, id: FacilityId, now: number,
): T | null {
  if (facilityState(progress.facilities, progress.facilityJobs, base, id, progress.resources, progress.record?.medals ?? []) !== 'ready') return null;
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

/** What one level of a resource facility adds (#190): the same for all four resources. */
export const REGEN_CAP_PER_LEVEL = 1000;
export const REGEN_RATE_PER_LEVEL = 1;
/** Each level of a base's own facility above 1 adds this to all four regeneration caps (#190). */
export const UNIQUE_REGEN_CAP = 500;

/**
 * Regeneration with every base's facilities (#146 #190): each resource's facility raises both its rate and its cap,
 * and the bases' own facilities raise every cap a little. 0.0.27's tanks (cap only) and mills (rate only) keep what
 * they gave and gain the other half.
 */
export function regenRules(facilities: Facilities): IRegenRules {
  const unique = Object.keys(facilities).reduce((sum, base) => sum + Math.max(0, facilityLevel(facilities, base, 'unique') - 1), 0);
  const cap = resources();
  const perTick = { ...REGEN_PER_TICK };
  for (const k of RESOURCE_KEYS) {
    const lv = totalLevel(facilities, HOLD_FACILITY[k]);
    cap[k] = REGEN_CAP + REGEN_CAP_PER_LEVEL * lv + UNIQUE_REGEN_CAP * unique;
    perTick[k] += REGEN_RATE_PER_LEVEL * lv;
  }
  return { perTick, cap };
}

/**
 * "回復 5 → 6 / 分・回復上限 2,500 → 3,500・保有上限 15,000 → 20,000" for a resource facility's next level (#190), or
 * its current values once it is at the top. Undefined for the workshop and the unique facility.
 */
export function facilityPreview(facilities: Facilities, base: string, id: FacilityId, short = false): string | undefined {
  const k = RESOURCE_KEYS.find((r) => HOLD_FACILITY[r] === id);
  if (!k) return undefined;
  const now = regenRules(facilities);
  const hold = holdCap(facilities);
  const n = (v: number): string => v.toLocaleString('en-US');
  if (facilityLevel(facilities, base, id) >= maxLevelOf(id)) return `回復 ${now.perTick[k]} / 分・回復上限 ${n(now.cap[k])}・保有上限 ${n(hold[k])}`;
  const raised: Facilities = { ...facilities, [base]: { ...(facilities[base] ?? {}), [id]: facilityLevel(facilities, base, id) + 1 } };
  const next = regenRules(raised);
  const nextHold = holdCap(raised);
  // Narrow screens: only the next level's figures ("次: 回復 7 / 分・回復上限 2,500・保有上限 15,000").
  if (short) return `次: 回復 ${next.perTick[k]} / 分・回復上限 ${n(next.cap[k])}・保有上限 ${n(nextHold[k])}`;
  return `回復 ${now.perTick[k]} → ${next.perTick[k]} / 分・回復上限 ${n(now.cap[k])} → ${n(next.cap[k])}・保有上限 ${n(hold[k])} → ${n(nextHold[k])}`;
}

/** Which facility raises each resource's holding cap (#221). */
export const HOLD_FACILITY: Record<keyof IResources, FacilityId> = { fuel: 'fuelTank', ammo: 'ammoDepot', steel: 'steelMill', bauxite: 'airBase' };

/** Holding cap (#221): the base amount plus HOLD_CAP_PER_LEVEL per level of the resource's facility, every base counted. */
export function holdCap(facilities: Facilities): IResources {
  const cap = resources();
  for (const k of RESOURCE_KEYS) cap[k] = HOLD_CAP_BASE[k] + HOLD_CAP_PER_LEVEL * totalLevel(facilities, HOLD_FACILITY[k]);
  return cap;
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
  if (isForwardBaseId(base)) return 1;
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

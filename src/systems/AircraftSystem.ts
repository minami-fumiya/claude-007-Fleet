import data from '@/data/aircraft.json';
import { AircraftType, CARRIER_AIRCRAFT, CarrierAircraft } from '@/types/Aircraft';
import { IResources } from '@/types/Progression';
import { Nation } from '@/types/Nation';
import { canAfford, pay, resources } from './ResourceSystem';

/**
 * 航空機の機種・開発・パイロット (#87, pure). Each navy flies its own carrier planes, generation by generation: the
 * first of each kind is on every carrier from the start, later ones are developed once in the arsenal (research and
 * resources) and then chosen per carrier. A model's `perf` multiplies the base plane. Each carrier's air group has
 * pilots who grow with the battles they fly and the planes they shoot down; past ACE_KILLS an ace joins, named.
 */

/** What a model does better or worse than the base plane of its kind. */
export interface IAircraftPerf {
  /** Bombs and aerial torpedoes */
  attack: number;
  /** Dogfights: the planes it shoots down */
  agility: number;
  /** Losses to AA and fighters are divided by it */
  toughness: number;
  speed: number;
}

export const BASE_PERF: IAircraftPerf = { attack: 1, agility: 1, toughness: 1, speed: 1 };

export interface IAircraftData {
  id: string;
  no?: number;
  nation: string;
  type: AircraftType;
  name: string;
  year?: number;
  /** Research that opens its development; none = on every carrier from the start */
  requires?: string;
  cost?: Partial<IResources>;
  perf?: Partial<IAircraftPerf>;
  description?: string;
}

export const AIRCRAFT = (data as unknown as { aircraft: IAircraftData[] }).aircraft;

/** The air side of a nation's progress. */
export interface IAirHolder {
  research: string[];
  resources: IResources;
  /** Models developed (#87) */
  aircraftDev: string[];
  /** Carrier id → the model chosen for each kind */
  airGroups: Record<string, Partial<Record<CarrierAircraft, string>>>;
  /** Carrier id → its air group's pilots */
  pilots: Record<string, IPilot>;
}

export interface IPilot {
  /** 練度 0..100 */
  skill: number;
  /** Enemy planes its fighters have shot down */
  kills: number;
  /** The ace who joined, by name */
  ace?: string;
}

/** A navy's models of a kind, oldest first. */
export function modelsFor(nation: Nation | string, type: CarrierAircraft): IAircraftData[] {
  return AIRCRAFT.filter((a) => a.nation === nation && a.type === type);
}

export function perfOf(model: Pick<IAircraftData, 'perf'> | undefined): IAircraftPerf {
  return { ...BASE_PERF, ...(model?.perf ?? {}) };
}

export function isDeveloped(holder: Pick<IAirHolder, 'aircraftDev'>, model: IAircraftData): boolean {
  return !model.requires || holder.aircraftDev.includes(model.id);
}

export function developCostOf(model: IAircraftData): IResources {
  return resources(model.cost ?? {});
}

export type AircraftDevState = 'developed' | 'research' | 'resources' | 'ready';

export function aircraftDevState(holder: IAirHolder, model: IAircraftData): AircraftDevState {
  if (isDeveloped(holder, model)) return 'developed';
  if (model.requires && !holder.research.includes(model.requires)) return 'research';
  return canAfford(holder.resources, developCostOf(model)) ? 'ready' : 'resources';
}

/** Develops a model once; null when it can't be now. */
export function developAircraft<T extends IAirHolder>(holder: T, id: string): T | null {
  const model = AIRCRAFT.find((a) => a.id === id);
  if (!model || aircraftDevState(holder, model) !== 'ready') return null;
  const left = pay(holder.resources, developCostOf(model));
  return left ? { ...holder, resources: left, aircraftDev: [...holder.aircraftDev, id] } : null;
}

/** The model a carrier flies for a kind: its choice when developed, else the newest developed one of its navy. */
export function carrierModel(holder: Pick<IAirHolder, 'aircraftDev' | 'airGroups'>, shipId: string, nation: Nation | string, type: CarrierAircraft): IAircraftData | undefined {
  const models = modelsFor(nation, type).filter((m) => isDeveloped(holder, m));
  const chosen = holder.airGroups[shipId]?.[type];
  return models.find((m) => m.id === chosen) ?? models[models.length - 1];
}

/** Chooses `id` for the carrier's kind (it must be its navy's, developed). */
export function chooseModel<T extends IAirHolder>(holder: T, shipId: string, id: string): T | null {
  const model = AIRCRAFT.find((a) => a.id === id);
  if (!model || model.type === AircraftType.Recon || !isDeveloped(holder, model)) return null;
  const type = model.type as CarrierAircraft;
  return { ...holder, airGroups: { ...holder.airGroups, [shipId]: { ...(holder.airGroups[shipId] ?? {}), [type]: id } } };
}

/** Each kind's performance on this carrier. */
export function wingPerf(holder: Pick<IAirHolder, 'aircraftDev' | 'airGroups'>, shipId: string, nation: Nation | string): Record<CarrierAircraft, IAircraftPerf> {
  const out = {} as Record<CarrierAircraft, IAircraftPerf>;
  for (const t of CARRIER_AIRCRAFT) out[t] = perfOf(carrierModel(holder, shipId, nation, t));
  return out;
}

// ---------------------------------------------------------------------------
// Pilots
// ---------------------------------------------------------------------------

export const MAX_PILOT_SKILL = 100;
/** Skill a battle flown brings, and each plane shot down. */
export const PILOT_SORTIE_SKILL = 3;
export const PILOT_KILL_SKILL = 0.5;
/** Skill lost per plane lost (green replacements). */
export const PILOT_LOSS_SKILL = 0.3;
/** Planes shot down before an ace joins the air group. */
export const ACE_KILLS = 15;
/** An ace's air group fights and aims this much better on top of its skill. */
export const ACE_BONUS = 0.1;

export const NO_PILOT: IPilot = { skill: 0, kills: 0 };

/** How much better the air group fights and aims: up to +20% from skill, +10% with an ace. */
export function pilotMul(pilot: IPilot | undefined): number {
  const p = pilot ?? NO_PILOT;
  return 1 + (Math.min(MAX_PILOT_SKILL, p.skill) / MAX_PILOT_SKILL) * 0.2 + (p.ace ? ACE_BONUS : 0);
}

/** Real aces of each navy's air arm, in the order they join. */
export const ACE_NAMES: Record<string, string[]> = {
  IJN: ['岩本徹三', '坂井三郎', '西沢広義', '杉田庄一', '菅野直', '赤松貞明'],
  USN: ['デヴィッド・マッキャンベル', 'エドワード・オヘア', 'ジョン・サッチ', 'アレクサンダー・ブラシュー', 'セシル・ハリス'],
  KM: ['ヴェルナー・メルダース', 'アドルフ・ガーランド', 'ヘルマン・グラーフ'],
  RN: ['スタンリー・オール', 'エリック・ブラウン', 'ロナルド・ヘイ'],
  RM: ['アドリアーノ・ヴィスコンティ', 'フランコ・ルッキーニ'],
  SU: ['アレクサンドル・ポクルイシュキン', 'イワン・コジェドゥーブ', 'ボリス・サフォーノフ'],
  FR: ['ピエール・クロステルマン', 'エドモン・マラン・ラ・メスレ'],
};

/** The next ace's name for the navy: one not already flying with another of its carriers. */
export function nextAceName(nation: Nation | string, pilots: Record<string, IPilot>): string {
  const taken = new Set(Object.values(pilots).map((p) => p.ace).filter((a): a is string => !!a));
  const names = ACE_NAMES[nation] ?? [];
  return names.find((n) => !taken.has(n)) ?? `${names[0] ?? 'エース'} ${taken.size + 1}`;
}

/** The air group after a battle it flew in: skill and kills grow, losses thin it; an ace may join. */
export function pilotAfterBattle(pilot: IPilot | undefined, flown: { kills: number; lost: number }, nation: Nation | string, pilots: Record<string, IPilot>): { pilot: IPilot; aceBorn?: string } {
  const p = pilot ?? NO_PILOT;
  const skill = Math.max(0, Math.min(MAX_PILOT_SKILL, p.skill + PILOT_SORTIE_SKILL + flown.kills * PILOT_KILL_SKILL - flown.lost * PILOT_LOSS_SKILL));
  const kills = p.kills + flown.kills;
  if (!p.ace && kills >= ACE_KILLS) {
    const ace = nextAceName(nation, pilots);
    return { pilot: { skill: Math.round(skill * 10) / 10, kills, ace }, aceBorn: ace };
  }
  return { pilot: { ...p, skill: Math.round(skill * 10) / 10, kills } };
}

import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { IResources } from '@/types/Progression';
import type { IProgress } from '@/utils/ProgressStore';
import { canAfford, pay, resources, RESOURCE_KEYS } from './ResourceSystem';
import { FICTIONAL_TECH } from './ResearchSystem';
import { RANKS, rankOf } from './RankSystem';

/**
 * Ship ownership and the shipyard (建造, #18 / #29, pure). A nation owns ships; the Fleet Builder only offers owned
 * ones for campaign and free battles. Ships are built with resources (one of each), gated by the class's
 * construction research and by the admiral's rank against the ship's grade, or granted as first-clear rewards.
 */

/** Research that allows building each class; destroyers need none. */
export const BUILD_TECH: Partial<Record<ShipClass, string>> = {
  [ShipClass.Cruiser]: 'build_cruiser',
  [ShipClass.Battleship]: 'build_battleship',
  [ShipClass.Carrier]: 'build_carrier',
  [ShipClass.Submarine]: 'build_submarine',
};

export function isBuildTech(id: string): boolean {
  return Object.values(BUILD_TECH).includes(id);
}

/** A ship's grade is how many of these HP marks it exceeds (0..5); it must not exceed the admiral's rank index. */
export const GRADE_HP = [250, 400, 520, 700, 780];
export const MAX_GRADE = GRADE_HP.length;

/** Grade 0 (destroyers, submarines) .. 5 (the largest battleships and every fictional design). */
export function shipGrade(ship: IShipData): number {
  if (ship.fictional) return MAX_GRADE;
  return GRADE_HP.filter((hp) => ship.hp > hp).length;
}

/** Rank needed to build a ship (its name, for messages). */
export function gradeRankName(grade: number): string {
  return RANKS[Math.min(RANKS.length - 1, Math.max(0, grade))].name;
}

/** Resources per point of HP, by class. Steel also pays for armour (5 HP-equivalents per point). */
const COST_PER_HP: Record<ShipClass, IResources> = {
  [ShipClass.Destroyer]: { fuel: 0.5, ammo: 0.5, steel: 0.8, bauxite: 0 },
  [ShipClass.Submarine]: { fuel: 0.6, ammo: 0.6, steel: 0.8, bauxite: 0 },
  [ShipClass.Cruiser]: { fuel: 0.8, ammo: 0.9, steel: 1.2, bauxite: 0.1 },
  [ShipClass.Carrier]: { fuel: 1, ammo: 0.5, steel: 1.2, bauxite: 1.2 },
  [ShipClass.Battleship]: { fuel: 1.2, ammo: 1.5, steel: 1.8, bauxite: 0.1 },
};
const ARMOR_HP = 5;
const FICTIONAL_COST_MUL = 1.3;

/** Build cost from the ship's class, HP and armour (rounded to tens). */
export function buildCost(ship: IShipData): IResources {
  const k = COST_PER_HP[ship.shipClass] ?? COST_PER_HP[ShipClass.Cruiser];
  const mul = ship.fictional ? FICTIONAL_COST_MUL : 1;
  const size = { fuel: ship.hp, ammo: ship.hp, steel: ship.hp + ship.armor * ARMOR_HP, bauxite: ship.hp };
  const out = resources();
  for (const key of RESOURCE_KEYS) out[key] = Math.round((k[key] * size[key] * mul) / 10) * 10;
  return out;
}

/** The ship a new nation starts with: its first-listed historical destroyer (else its cheapest ship). */
export function starterShip(roster: IShipData[]): IShipData | undefined {
  const historical = roster.filter((s) => !s.fictional);
  const destroyer = historical.find((s) => s.shipClass === ShipClass.Destroyer);
  if (destroyer) return destroyer;
  const total = (s: IShipData): number => RESOURCE_KEYS.reduce((sum, key) => sum + buildCost(s)[key], 0);
  return [...historical].sort((a, b) => total(a) - total(b))[0];
}

/** Owned ship ids, or the starter when the list is empty (a slot made without one never leaves the player shipless). */
export function ownedIds(progress: Pick<IProgress, 'ships'>, roster: IShipData[]): string[] {
  if (progress.ships.length > 0) return progress.ships;
  const starter = starterShip(roster);
  return starter ? [starter.id] : [];
}

/** The nation's owned ships, in roster order. */
export function ownedShips(progress: Pick<IProgress, 'ships'>, roster: IShipData[]): IShipData[] {
  const owned = new Set(ownedIds(progress, roster));
  return roster.filter((s) => owned.has(s.id));
}

export function isOwned(progress: Pick<IProgress, 'ships'>, roster: IShipData[], id: string): boolean {
  return ownedIds(progress, roster).includes(id);
}

/** Adds a ship to the fleet (no duplicates). */
export function grantShip(progress: IProgress, roster: IShipData[], id: string): IProgress {
  const owned = ownedIds(progress, roster);
  return owned.includes(id) ? { ...progress, ships: owned } : { ...progress, ships: [...owned, id] };
}

export type BuildState = 'owned' | 'research' | 'fictional' | 'rank' | 'resources' | 'ready';

/** Why a ship can or can't be built right now; `techNames` maps research ids to their display names. */
export function buildState(progress: IProgress, roster: IShipData[], ship: IShipData): BuildState {
  if (isOwned(progress, roster, ship.id)) return 'owned';
  const tech = BUILD_TECH[ship.shipClass];
  if (tech && !progress.research.includes(tech)) return 'research';
  if (ship.fictional && !progress.research.includes(FICTIONAL_TECH)) return 'fictional';
  if (shipGrade(ship) > rankOf(progress).index) return 'rank';
  if (!canAfford(progress.resources, buildCost(ship))) return 'resources';
  return 'ready';
}

/** Short label for a build state, e.g. "要研究: 巡洋艦建造" / "要階級: 少将". */
export function buildStateLabel(state: BuildState, ship: IShipData, techNames: Record<string, string> = {}): string {
  switch (state) {
    case 'owned': return '保有';
    case 'research': {
      const id = BUILD_TECH[ship.shipClass] ?? '';
      return `要研究: ${techNames[id] ?? id}`;
    }
    case 'fictional': return `要研究: ${techNames[FICTIONAL_TECH] ?? FICTIONAL_TECH}`;
    case 'rank': return `要階級: ${gradeRankName(shipGrade(ship))}`;
    case 'resources': return '資源不足';
    case 'ready': return '建造可 ›';
  }
}

/** Pays for and adds the ship. Returns null when it can't be built now. */
export function buildShip(progress: IProgress, roster: IShipData[], ship: IShipData): IProgress | null {
  if (!roster.some((s) => s.id === ship.id) || buildState(progress, roster, ship) !== 'ready') return null;
  const left = pay(progress.resources, buildCost(ship));
  return left ? { ...grantShip(progress, roster, ship.id), resources: left } : null;
}

/**
 * The ship a campaign area's first clear grants this nation: the cheapest historical ship of the area's
 * `rewardShip` class it does not own yet, else its cheapest unowned historical ship of any class.
 */
export function rewardShipFor(rewardClass: ShipClass | undefined, roster: IShipData[], owned: string[]): IShipData | undefined {
  if (!rewardClass) return undefined;
  const candidates = roster.filter((s) => !s.fictional && !owned.includes(s.id));
  const total = (s: IShipData): number => RESOURCE_KEYS.reduce((sum, key) => sum + buildCost(s)[key], 0);
  const cheapest = (list: IShipData[]): IShipData | undefined => [...list].sort((a, b) => total(a) - total(b))[0];
  return cheapest(candidates.filter((s) => s.shipClass === rewardClass)) ?? cheapest(candidates);
}

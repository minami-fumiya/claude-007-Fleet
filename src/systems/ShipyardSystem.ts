import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { IResources } from '@/types/Progression';
import type { IProgress } from '@/utils/ProgressStore';
import { canAfford, pay, resources, RESOURCE_KEYS } from './ResourceSystem';
import { FICTIONAL_TECH } from './ResearchSystem';
import { GRADE_RANK, rankForGrade, rankOf } from './RankSystem';
import { assignShips, buildMultiplier, currentBase, currentBaseId, scaleCost } from './BaseSystem';
import { isHeavyCruiser, isLightCruiser } from './ShipKind';
import rewardShipData from '@/data/reward-ships.json';
import { hasMedal, medalName, shipMedal } from './MedalGate';
import { dockCount } from './DockSystem';

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

/** Heavy cruisers need their own research on top of the (light) cruiser one (#37). */
export const HEAVY_CRUISER_TECH = 'build_heavy_cruiser';

/** Research that allows building this ship (undefined = none needed). */
export function buildTechFor(ship: Pick<IShipData, 'shipClass' | 'subtype'>): string | undefined {
  return isHeavyCruiser(ship) ? HEAVY_CRUISER_TECH : BUILD_TECH[ship.shipClass];
}

export function isBuildTech(id: string): boolean {
  return id === HEAVY_CRUISER_TECH || Object.values(BUILD_TECH).includes(id);
}

/** A ship's grade is how many of these HP marks it exceeds (0..5); each grade needs a rank (RankSystem.GRADE_RANK). */
export const GRADE_HP = [250, 400, 520, 700, 780];
export const MAX_GRADE = GRADE_HP.length;

/** Grade 0 (destroyers, submarines) .. 5 (the largest battleships and every fictional design). */
export function shipGrade(ship: IShipData): number {
  if (ship.fictional) return MAX_GRADE;
  return GRADE_HP.filter((hp) => ship.hp > hp).length;
}

/** Rank needed to build a ship (its name, for messages). */
export function gradeRankName(grade: number): string {
  return rankForGrade(grade).name;
}

/** Whether a rank may build ships of `grade`. */
export function gradeAllowed(grade: number, rankIndex: number): boolean {
  return rankIndex >= GRADE_RANK[Math.min(GRADE_RANK.length - 1, Math.max(0, grade))];
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
/** Light cruisers are cheaper to build than heavy ones (#37). */
const LIGHT_CRUISER_COST_MUL = 0.85;

/** Build cost from the ship's class, HP and armour (rounded to tens). */
export function buildCost(ship: IShipData): IResources {
  const k = COST_PER_HP[ship.shipClass] ?? COST_PER_HP[ShipClass.Cruiser];
  const mul = (ship.fictional ? FICTIONAL_COST_MUL : 1) * (isLightCruiser(ship) ? LIGHT_CRUISER_COST_MUL : 1);
  const size = { fuel: ship.hp, ammo: ship.hp, steel: ship.hp + ship.armor * ARMOR_HP, bauxite: ship.hp };
  const out = resources();
  for (const key of RESOURCE_KEYS) out[key] = Math.round((k[key] * size[key] * mul) / 10) * 10;
  return out;
}

/** Build cost at the admiral's current base (#88), which can make some classes cheaper. */
export function buildCostAt(progress: Pick<IProgress, 'nation' | 'base' | 'campaign' | 'merit' | 'rankFloor'>, ship: IShipData): IResources {
  return scaleCost(buildCost(ship), buildMultiplier(currentBase(progress.nation, progress), ship.shipClass));
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
  // A new ship joins the base the admiral is at (#145).
  return owned.includes(id) ? { ...progress, ships: owned } : assignShips({ ...progress, ships: [...owned, id] }, [id], currentBaseId(progress));
}

/**
 * Reward-only ships (報酬限定艦, #39 #160): nation → campaign area → ship. These can't be built; the area's first clear
 * grants them. Each nation keeps its destroyers and submarines (and, with many of a class, one of it) buildable.
 */
export const REWARD_SHIPS = rewardShipData as Partial<Record<string, Record<string, string>>>;

/** The area whose first clear grants this reward-only ship, or undefined for a ship that can be built. */
export function rewardAreaOf(ship: Pick<IShipData, 'id' | 'nation'>): string | undefined {
  const byArea = REWARD_SHIPS[ship.nation] ?? {};
  return Object.keys(byArea).find((area) => byArea[area] === ship.id);
}

export function isRewardOnly(ship: Pick<IShipData, 'id' | 'nation'>): boolean {
  return rewardAreaOf(ship) !== undefined;
}

export type BuildState = 'owned' | 'building' | 'reward' | 'research' | 'fictional' | 'rank' | 'medal' | 'resources' | 'dock' | 'ready';

/** Why a ship can or can't be built right now; `techNames` maps research ids to their display names. */
export function buildState(progress: IProgress, roster: IShipData[], ship: IShipData): BuildState {
  if (isOwned(progress, roster, ship.id)) return 'owned';
  if ((progress.builds ?? []).some((b) => b.shipId === ship.id)) return 'building';
  if (isRewardOnly(ship)) return 'reward';
  const tech = buildTechFor(ship);
  if (tech && !progress.research.includes(tech)) return 'research';
  if (ship.fictional && !progress.research.includes(FICTIONAL_TECH)) return 'fictional';
  if (!gradeAllowed(shipGrade(ship), rankOf(progress).index)) return 'rank';
  // The biggest battleships and carriers, and the fictional designs, need a medal too (#169).
  if (!hasMedal(progress.record ?? { medals: [] }, shipMedal(ship, shipGrade(ship)))) return 'medal';
  if (!canAfford(progress.resources, buildCostAt(progress, ship))) return 'resources';
  if (docksInUse(progress) >= buildDockCount(progress)) return 'dock';
  return 'ready';
}

/** Short label for a build state, e.g. "要研究: 巡洋艦建造" / "要階級: 少将" / "作戦報酬: 坊ノ岬沖". */
export function buildStateLabel(state: BuildState, ship: IShipData, techNames: Record<string, string> = {}, areaNames: Record<string, string> = {}): string {
  switch (state) {
    case 'owned': return '保有';
    case 'building': return '建造中';
    case 'dock': return 'ドック満杯';
    case 'reward': {
      const area = rewardAreaOf(ship) ?? '';
      return `作戦報酬: ${areaNames[area] ?? area}`;
    }
    case 'research': {
      const id = buildTechFor(ship) ?? '';
      return `要研究: ${techNames[id] ?? id}`;
    }
    case 'fictional': return `要研究: ${techNames[FICTIONAL_TECH] ?? FICTIONAL_TECH}`;
    case 'rank': return `要階級: ${gradeRankName(shipGrade(ship))}`;
    case 'medal': return `要勲章: ${medalName(shipMedal(ship, shipGrade(ship)) ?? '')}`;
    case 'resources': return '資源不足';
    case 'ready': return '建造可 ›';
  }
}

// ---------------------------------------------------------------------------
// Construction time (#143)
// ---------------------------------------------------------------------------

/**
 * Minutes to build by class (light cruisers are quicker than heavy ones); each grade adds GRADE_MINUTES. Halved twice
 * (#176, #212): a destroyer in a minute and a half, the biggest battleships in about 12.
 */
export const BUILD_MINUTES: Record<ShipClass, number> = {
  [ShipClass.Destroyer]: 1.5,
  [ShipClass.Submarine]: 2,
  [ShipClass.Cruiser]: 4,
  [ShipClass.Carrier]: 6,
  [ShipClass.Battleship]: 8,
};
export const LIGHT_CRUISER_MINUTES = 3;
export const GRADE_MINUTES = 1;

export function buildTimeMs(ship: IShipData, timeMul = 1): number {
  const base = isLightCruiser(ship) ? LIGHT_CRUISER_MINUTES : BUILD_MINUTES[ship.shipClass];
  const minutes = (base + GRADE_MINUTES * shipGrade(ship)) * (ship.fictional ? 1.5 : 1);
  return Math.round(minutes * 60_000 * timeMul);
}

/** The docks of the base the admiral is at (#211): builds share them with repairs. */
export function buildDockCount(progress: Pick<IProgress, 'baseDocks' | 'base'> & Partial<IProgress>): number {
  return dockCount({ docksOwned: progress.baseDocks?.[currentBaseId(progress as IProgress)] });
}

/** Docks of the current base in use: its builds and its repairs (#211). */
export function docksInUse(progress: IProgress): number {
  const here = currentBaseId(progress);
  return buildsHere(progress).length + progress.docks.filter((j) => (j.base ?? here) === here).length;
}

/** Builds on the slips of the base the admiral is at (#145); each base has its own. */
export function buildsHere(progress: IProgress): IProgress['builds'] {
  const here = currentBaseId(progress);
  return (progress.builds ?? []).filter((b) => (b.base ?? here) === here);
}

/** Pays for the ship and lays it down; it joins the fleet when `completeBuilds` finds it finished. */
export function startBuild(progress: IProgress, roster: IShipData[], ship: IShipData, now: number, timeMul = 1): IProgress | null {
  if (!roster.some((s) => s.id === ship.id) || buildState(progress, roster, ship) !== 'ready') return null;
  const left = pay(progress.resources, buildCostAt(progress, ship));
  if (!left) return null;
  // Laid down at the current base (#145): it joins that base when finished.
  return { ...progress, resources: left, builds: [...(progress.builds ?? []), { shipId: ship.id, endsAt: now + buildTimeMs(ship, timeMul), base: currentBaseId(progress) }] };
}

/** Adds every finished ship to the fleet; `done` lists them (empty when nothing finished). */
export function completeBuilds(progress: IProgress, roster: IShipData[], now: number): { progress: IProgress; done: string[] } {
  const builds = progress.builds ?? [];
  const done = builds.filter((b) => b.endsAt <= now).map((b) => b.shipId);
  if (done.length === 0) return { progress, done };
  let next: IProgress = { ...progress, builds: builds.filter((b) => b.endsAt > now) };
  for (const b of builds.filter((x) => x.endsAt <= now)) {
    next = grantShip(next, roster, b.shipId);
    if (b.base) next = assignShips(next, [b.shipId], b.base);
  }
  return { progress: next, done };
}

/** Finishes a build at once with a 高速建造材; null when there is none or the ship isn't being built. */
export function fastBuild(progress: IProgress, roster: IShipData[], shipId: string, now: number): IProgress | null {
  const items = progress.items ?? { fastRepair: 0, fastBuild: 0, captainBook: 0 };
  if (items.fastBuild <= 0 || !(progress.builds ?? []).some((b) => b.shipId === shipId)) return null;
  const sped = { ...progress, items: { ...items, fastBuild: items.fastBuild - 1 }, builds: progress.builds.map((b) => (b.shipId === shipId ? { ...b, endsAt: now } : b)) };
  return completeBuilds(sped, roster, now).progress;
}

/** Pays for and adds the ship. Returns null when it can't be built now. */
export function buildShip(progress: IProgress, roster: IShipData[], ship: IShipData): IProgress | null {
  if (!roster.some((s) => s.id === ship.id) || buildState(progress, roster, ship) !== 'ready') return null;
  const left = pay(progress.resources, buildCostAt(progress, ship));
  return left ? { ...grantShip(progress, roster, ship.id), resources: left } : null;
}

/**
 * The ship a campaign area's first clear grants this nation: its reward-only ship for that area when it does not own
 * it yet. Every first-clear ship is reward-only (#160); an area without one for the nation grants resources only.
 */
export function rewardShipFor(roster: IShipData[], owned: string[], areaId: string): IShipData | undefined {
  const id = roster[0] ? REWARD_SHIPS[roster[0].nation]?.[areaId] : undefined;
  return id ? roster.find((s) => s.id === id && !owned.includes(s.id)) : undefined;
}

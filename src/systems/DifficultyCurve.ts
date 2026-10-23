import { ICampaignArea, ICampaignData } from '@/types/Campaign';
import { IShipData, ShipSubtype } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { IShipModifiers } from '@/types/Modifiers';
import { RANKS, START_RANK } from './RankSystem';
import { costCap } from './FleetCost';
import baseData from '@/data/bases.json';

/**
 * 難しさの曲線 (#254, pure): how strong an area's enemy should be for where it sits. An area's depth is the longest
 * chain of areas leading to it inside its theater (the first area is 1), plus the theater's tier: the seas added in
 * 0.0.35 start a step in. The enemy's strength is the sum of HP × (1 + armor / 100) over its ships; the target grows
 * half again with each step of depth, and every area's enemy stays within a band around it. New areas are written
 * from this curve, and docs/balance/ keeps the table.
 *
 * Since #293 the tier depends on the navy: each base opens one theater, and a theater's tier is its place in that
 * navy's order (the nearest sea first). The enemy is written for the theater's own `tier`; a navy that reaches the sea
 * later meets it strengthened by the curve's growth for each step further in (`enemyScale`).
 */

/** The target strength of the first area, and how much each step of depth multiplies it. */
export const CURVE_BASE = 250;
export const CURVE_GROWTH = 1.5;
/** How far an area's enemy may sit below or above the target (historical battles vary). */
export const CURVE_BAND = { low: 0.4, high: 2.5 } as const;
/** The opening (#268): up to this depth the band tops out lower, so a starting fleet of destroyers can win. */
export const EARLY_DEPTH = 3;
export const EARLY_HIGH = 1.6;
/** Up to this depth no heavy cruiser, battleship or carrier sails against a new admiral (#268). */
export const LIGHT_ONLY_DEPTH = 2;

/** Whether a ship may appear at `depth`: the first steps keep to destroyers, submarines and light cruisers. */
export function allowedAtDepth(ship: Pick<IShipData, 'shipClass' | 'subtype'>, depth: number): boolean {
  if (depth > LIGHT_ONLY_DEPTH) return true;
  if (ship.shipClass === ShipClass.Battleship || ship.shipClass === ShipClass.Carrier) return false;
  return !(ship.shipClass === ShipClass.Cruiser && ship.subtype === ShipSubtype.HeavyCruiser);
}

/** One ship's weight in the strength sum. */
export function shipPower(ship: Pick<IShipData, 'hp' | 'armor'>): number {
  return ship.hp * (1 + ship.armor / 100);
}

/** The strength of a fleet. */
export function fleetPower(ships: ReadonlyArray<Pick<IShipData, 'hp' | 'armor'>>): number {
  return Math.round(ships.reduce((sum, s) => sum + shipPower(s), 0));
}

/**
 * How deep a far sea goes for a navy (#293). Past this the curve outgrows the strongest fleets a navy can build (about
 * 4,000〜9,000 by HP × armor at 元帥), so a sea further along the order starts deeper but tops out here.
 */
export const REACH_MAX_DEPTH = 9;

const BASES = (baseData as { bases: Array<{ nation: string; theaters?: string[] }> }).bases;

/** Where `theater` comes in `nation`'s order (#293): the place of the base that opens it, 0 for the first. */
export function theaterStep(nation: string, theater: string): number | undefined {
  const i = BASES.filter((b) => b.nation === nation).findIndex((b) => b.theaters?.includes(theater));
  return i < 0 ? undefined : i;
}

/**
 * The area's depth on the curve (1 for a theater's first area; training areas are always 1). With a navy, the
 * theater's step is its place in that navy's order (#293); without, the step its enemy was written for.
 */
export function areaDepth(data: Pick<ICampaignData, 'areas' | 'theaters'>, area: ICampaignArea, nation?: string): number {
  if (area.training) return 1;
  const written = data.theaters.find((t) => t.id === area.theater)?.tier ?? 0;
  const step = nation !== undefined ? theaterStep(nation, area.theater) : undefined;
  const memo = new Map<string, number>();
  const walk = (a: ICampaignArea, seen: ReadonlySet<string>): number => {
    const known = memo.get(a.id);
    if (known !== undefined) return known;
    // Only areas of the same theater count: the seas that open from another theater (#250) start again at 1.
    const before = [...a.requires, ...(a.requiresAny ?? [])]
      .map((id) => data.areas.find((x) => x.id === id && x.theater === a.theater))
      .filter((x): x is ICampaignArea => x !== undefined && !seen.has(x.id));
    const d = before.length === 0 ? 1 : 1 + Math.max(...before.map((x) => walk(x, new Set([...seen, a.id]))));
    memo.set(a.id, d);
    return d;
  };
  const depth = walk(area, new Set());
  if (step === undefined) return depth + written;
  // A far sea is deeper, up to the curve's top (#293): no deeper than REACH_MAX_DEPTH unless written deeper.
  return Math.max(depth + written, Math.min(depth + step, REACH_MAX_DEPTH));
}

/**
 * How much stronger the area's enemy is for `nation` than as written (#293): the curve's growth for each step the sea
 * lies further along that navy's order. 1 for the navy it was written for, a training area, or no navy.
 */
export function enemyScale(data: Pick<ICampaignData, 'areas' | 'theaters'>, area: ICampaignArea, nation?: string): number {
  if (nation === undefined || area.training) return 1;
  return CURVE_GROWTH ** (areaDepth(data, area, nation) - areaDepth(data, area));
}

/**
 * The enemy's modifiers for a scale: hit points and gun and torpedo power each take its square root, so their product
 * is it. Air strikes stay as written: they already sink a flagship in seconds (the battle simulator, #320).
 */
export function scaleModifiers(scale: number): Partial<IShipModifiers> {
  if (scale === 1) return {};
  const k = Math.sqrt(scale);
  return { hpMul: k, gunPowerMul: k, torpedoPowerMul: k };
}

/** The enemy strength the curve asks for at `depth`. */
export function targetPower(depth: number): number {
  return Math.round(CURVE_BASE * CURVE_GROWTH ** (Math.max(1, depth) - 1));
}

/** Whether `power` sits inside the band at `depth`. */
export function withinCurve(power: number, depth: number): boolean {
  const t = targetPower(depth);
  const high = depth <= EARLY_DEPTH ? EARLY_HIGH : CURVE_BAND.high;
  return power >= t * CURVE_BAND.low && power <= t * high;
}

/**
 * The rank an area is meant for: 准尉 and 少尉 for the first two steps, then two ranks above the step (#293: players
 * arrive two to four ranks above the old "depth − 1", where the fleet of the recommended rank matches the enemy).
 */
export function recommendedRank(depth: number): { index: number; name: string } {
  const index = Math.min(RANKS.length - 1, Math.max(START_RANK, depth <= 2 ? depth : depth + 1));
  return { index, name: RANKS[index].name };
}

/** "敵の戦力 1,560 (目安 844) · 推奨 准佐 (コスト 15)" for the area briefing: the rank and its cost cap (#306). */
export function curveText(power: number, depth: number): string {
  const rank = recommendedRank(depth);
  return `${power.toLocaleString('en-US')} (目安 ${targetPower(depth).toLocaleString('en-US')})  ·  推奨 ${rank.name} (コスト ${costCap(rank.index)})`;
}

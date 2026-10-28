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
 *
 * Since #358 (案 A) the depth follows the area's recommended rank: a theater's ten areas take ten ranks in a row, so no
 * two share one, and the enemy keeps its written share of the target at that depth.
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

const BASES = (baseData as { bases: Array<{ nation: string; theaters?: string[] }> }).bases;

/** Where `theater` comes in `nation`'s order (#293): 0 for the home port's sea, then each forward base's in turn (#373). */
export function theaterStep(nation: string, theater: string): number | undefined {
  const i = BASES.filter((b) => b.nation === nation && (b.theaters?.length ?? 0) > 0).findIndex((b) => b.theaters?.includes(theater));
  return i < 0 ? undefined : i;
}

/**
 * The longest chain of areas leading to `area` inside its theater (1 for its first area). Only areas of the same
 * theater count: the seas that open from another theater (#250) start again at 1.
 */
export function chainDepth(data: Pick<ICampaignData, 'areas'>, area: ICampaignArea): number {
  const memo = new Map<string, number>();
  const walk = (a: ICampaignArea, seen: ReadonlySet<string>): number => {
    const known = memo.get(a.id);
    if (known !== undefined) return known;
    const before = [...a.requires, ...(a.requiresAny ?? [])]
      .map((id) => data.areas.find((x) => x.id === id && x.theater === a.theater))
      .filter((x): x is ICampaignArea => x !== undefined && !seen.has(x.id));
    const d = before.length === 0 ? 1 : 1 + Math.max(...before.map((x) => walk(x, new Set([...seen, a.id]))));
    memo.set(a.id, d);
    return d;
  };
  return walk(area, new Set());
}

/**
 * The area's place in its theater (#358), 0 for the first: by the chain of areas leading to it, and among areas as
 * deep, in the order the data lists them (the main line before its side seas).
 */
export function areaOrder(data: Pick<ICampaignData, 'areas'>, area: ICampaignArea): number {
  const own = data.areas.filter((a) => a.theater === area.theater && !a.training);
  const sorted = own.map((a, i) => ({ a, i, d: chainDepth(data, a) })).sort((x, y) => x.d - y.d || x.i - y.i);
  return Math.max(0, sorted.findIndex((x) => x.a.id === area.id));
}

/** The highest rank a theater may start at (#358): its ten areas then end at 元帥. */
export const THEATER_START_MAX = 4;

/**
 * The rank index an area is meant for (#358 案 A): a theater's ten areas take ten ranks in a row, one each, starting
 * at the theater's step in the navy's order (准尉 for the first, never above 大尉). Without a navy, the step the
 * theater was written for.
 */
export function areaRankIndex(data: Pick<ICampaignData, 'areas' | 'theaters'>, area: ICampaignArea, nation?: string): number {
  if (area.training) return START_RANK;
  const step = (nation !== undefined ? theaterStep(nation, area.theater) : undefined) ?? data.theaters.find((t) => t.id === area.theater)?.tier ?? 0;
  return Math.min(RANKS.length - 1, Math.min(START_RANK + step, THEATER_START_MAX) + areaOrder(data, area));
}

/** The curve's depth for a rank: 准尉 1, 少尉 2, 中尉 2.5, then one less than the rank (the old "rank = depth + 1"). */
export function depthForRank(index: number): number {
  return index <= 2 ? Math.max(1, index) : index === 3 ? 2.5 : index - 1;
}

/**
 * The area's depth on the curve (1 for a theater's first area at 准尉; training areas are always 1). Since #358 it
 * follows the area's recommended rank, so every area of a theater sits a step deeper than the one before.
 */
export function areaDepth(data: Pick<ICampaignData, 'areas' | 'theaters'>, area: ICampaignArea, nation?: string): number {
  if (area.training) return 1;
  return depthForRank(areaRankIndex(data, area, nation));
}

/**
 * The depth the area's enemy was written for (#254 #293): its chain in the theater plus the theater's tier. The
 * enemy keeps its strength against that depth's target wherever the area now sits on the curve.
 */
export function writtenDepth(data: Pick<ICampaignData, 'areas' | 'theaters'>, area: ICampaignArea): number {
  if (area.training) return 1;
  return chainDepth(data, area) + (data.theaters.find((t) => t.id === area.theater)?.tier ?? 0);
}

/**
 * How much stronger (or weaker) the area's enemy is for `nation` than as written (#293 #358): the written enemy keeps
 * its share of the target, moved to the depth of the area's recommended rank. 1 for a training area.
 */
export function enemyScale(data: Pick<ICampaignData, 'areas' | 'theaters'>, area: ICampaignArea, nation?: string): number {
  if (area.training) return 1;
  return (targetPower(areaDepth(data, area, nation)) / targetPower(writtenDepth(data, area))) * (nation ? NAVY_ENEMY_SCALE[nation] ?? 1 : 1);
}

/**
 * Navies whose ships are weaker rank for rank (#352): the Soviet fleet met its seas at three to six times its strength
 * where the others met two to three, and won 55% of the simulated battles against 90% and up. Their enemies sail at
 * this share of the curve.
 */
export const NAVY_ENEMY_SCALE: Readonly<Record<string, number>> = { SU: 0.6 };

/**
 * The enemy's modifiers for a scale: hit points and gun and torpedo power each take its square root, so their product
 * is it. Air strikes stay as written: they already sink a flagship in seconds (the battle simulator, #320).
 */
export function scaleModifiers(scale: number): Partial<IShipModifiers> {
  if (scale === 1) return {};
  const k = Math.sqrt(scale);
  return { hpMul: k, gunPowerMul: k, torpedoPowerMul: k };
}

/**
 * Past this depth (少将) the curve grows slower (#358): the strongest fleets a navy builds stop growing about there
 * (#293: 4,000〜9,000 by HP × armor at 元帥), and the last ranks are made by the enemy's own strengthening.
 */
export const CURVE_TOP_DEPTH = 9;
export const CURVE_TOP_GROWTH = 1.15;

/** The enemy strength the curve asks for at `depth`. */
export function targetPower(depth: number): number {
  const d = Math.max(1, depth);
  const below = CURVE_BASE * CURVE_GROWTH ** (Math.min(d, CURVE_TOP_DEPTH) - 1);
  return Math.round(below * CURVE_TOP_GROWTH ** Math.max(0, d - CURVE_TOP_DEPTH));
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
  const index = Math.min(RANKS.length - 1, Math.max(START_RANK, depth <= 2 ? Math.round(depth) : depth < 3 ? 3 : Math.round(depth + 1)));
  return { index, name: RANKS[index].name };
}

/**
 * "1,560 (目安 844) · 推奨 准佐 (コスト 15・総戦力 1,560)" for the area briefing: the rank and its cost cap (#306), and
 * the 総戦力 (#342) to bring (#358): as much as the enemy's, where the fleet's colour turns from red.
 */
export function curveText(power: number, depth: number): string {
  const rank = recommendedRank(depth);
  const n = (v: number): string => v.toLocaleString('en-US');
  return `${n(power)} (目安 ${n(targetPower(depth))})  ·  推奨 ${rank.name} (コスト ${costCap(rank.index)}・総戦力 ${n(power)})`;
}

import { ICampaignArea, ICampaignData } from '@/types/Campaign';
import { IShipData } from '@/types/Ship';
import { RANKS, START_RANK } from './RankSystem';

/**
 * 難しさの曲線 (#254, pure): how strong an area's enemy should be for where it sits. An area's depth is the longest
 * chain of areas leading to it inside its theater (the first area is 1), plus the theater's tier: the seas added in
 * 0.0.35 start a step in. The enemy's strength is the sum of HP × (1 + armor / 100) over its ships; the target grows
 * half again with each step of depth, and every area's enemy stays within a band around it. New areas are written
 * from this curve, and docs/balance/ keeps the table.
 */

/** The target strength of the first area, and how much each step of depth multiplies it. */
export const CURVE_BASE = 250;
export const CURVE_GROWTH = 1.5;
/** How far an area's enemy may sit below or above the target (historical battles vary). */
export const CURVE_BAND = { low: 0.4, high: 2.5 } as const;

/** One ship's weight in the strength sum. */
export function shipPower(ship: Pick<IShipData, 'hp' | 'armor'>): number {
  return ship.hp * (1 + ship.armor / 100);
}

/** The strength of a fleet. */
export function fleetPower(ships: ReadonlyArray<Pick<IShipData, 'hp' | 'armor'>>): number {
  return Math.round(ships.reduce((sum, s) => sum + shipPower(s), 0));
}

/** The area's depth on the curve (1 for a theater's first area; training areas are always 1). */
export function areaDepth(data: Pick<ICampaignData, 'areas' | 'theaters'>, area: ICampaignArea): number {
  if (area.training) return 1;
  const tier = data.theaters.find((t) => t.id === area.theater)?.tier ?? 0;
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
  return walk(area, new Set()) + tier;
}

/** The enemy strength the curve asks for at `depth`. */
export function targetPower(depth: number): number {
  return Math.round(CURVE_BASE * CURVE_GROWTH ** (Math.max(1, depth) - 1));
}

/** Whether `power` sits inside the band at `depth`. */
export function withinCurve(power: number, depth: number): boolean {
  const t = targetPower(depth);
  return power >= t * CURVE_BAND.low && power <= t * CURVE_BAND.high;
}

/** The rank an area is meant for: 准尉 for the first two steps, one rank a step after that. */
export function recommendedRank(depth: number): { index: number; name: string } {
  const index = Math.min(RANKS.length - 1, Math.max(START_RANK, depth - 1));
  return { index, name: RANKS[index].name };
}

/** "敵の戦力 1,560 (目安 844) · 推奨 中尉" for the area briefing. */
export function curveText(power: number, depth: number): string {
  return `${power.toLocaleString('en-US')} (目安 ${targetPower(depth).toLocaleString('en-US')})  ·  推奨 ${recommendedRank(depth).name}`;
}

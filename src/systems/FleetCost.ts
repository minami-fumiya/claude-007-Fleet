import { IShipData, ShipSubtype } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { RANKS } from './RankSystem';
import { shipGrade } from './ShipyardSystem';
import { midClass } from './ShipKind';

/**
 * 出撃コスト (#306): every ship weighs on the fleet by its size, and the rank caps the fleet's total. The slot count
 * (`IRank.slots`) stays: a fleet must fit both.
 */

/** Base cost of a ship by 中分類; battleships and fleet carriers add their grade on top. */
const MID_COST: Partial<Record<string, number>> = {
  [ShipSubtype.Escort]: 1,
  Destroyer: 2, [ShipSubtype.EscortDestroyer]: 2, [ShipSubtype.LeaderDestroyer]: 2, [ShipSubtype.AADestroyer]: 2,
  Submarine: 2, [ShipSubtype.LargeSubmarine]: 2, [ShipSubtype.SubmarineCarrier]: 3,
  [ShipSubtype.LightCruiser]: 3, [ShipSubtype.AACruiser]: 3, [ShipSubtype.HeavyCruiser]: 4,
  [ShipSubtype.EscortCarrier]: 3, [ShipSubtype.LightCarrier]: 4, FleetCarrier: 5, [ShipSubtype.ArmoredCarrier]: 6,
  Battleship: 5, [ShipSubtype.FastBattleship]: 5, [ShipSubtype.BattleCruiser]: 5, [ShipSubtype.AviationBattleship]: 5,
};

/** A planned ship (架空艦, #309) weighs this much more: most outclass the real ships of their kind */
export const FICTIONAL_COST = 1;

/** The fleet's cost cap by rank index (准尉 6 … 元帥 48). */
export const COST_CAP = [6, 6, 10, 12, 14, 15, 16, 20, 24, 28, 32, 36, 40, 48];

/**
 * A ship's sortie cost: its 中分類, +1 per grade above 2 for battleships and fleet carriers (the biggest ones weigh most),
 * +1 for a planned ship (架空艦) and +1 per remodel stage.
 */
export function shipCost(ship: Pick<IShipData, 'shipClass' | 'subtype' | 'fictional'> & Partial<IShipData>, stage = 0): number {
  const base = MID_COST[midClass(ship)] ?? 3;
  const big = ship.shipClass === ShipClass.Battleship || midClass(ship) === 'FleetCarrier' || ship.subtype === ShipSubtype.ArmoredCarrier;
  const grade = big && ship.hp !== undefined ? Math.max(0, shipGrade(ship as IShipData) - 2) : 0;
  return base + grade + (ship.fictional ? FICTIONAL_COST : 0) + Math.max(0, stage);
}

/** The fleet's total cost, each ship at its remodel stage. */
export function fleetCost(ships: ReadonlyArray<IShipData>, refits: Readonly<Record<string, number>> = {}): number {
  return ships.reduce((sum, s) => sum + shipCost(s, refits[s.id] ?? 0), 0);
}

export function costCap(rankIndex: number): number {
  return COST_CAP[Math.max(0, Math.min(COST_CAP.length - 1, rankIndex))];
}

/** "コストが超過: 28 / 24 (4 超過)", or null when the fleet fits. */
export function costOverText(cost: number, cap: number): string | null {
  return cost > cap ? `コストが超過: ${cost} / ${cap} (${cost - cap} 超過)` : null;
}

/** "コスト 14 / 16" */
export function costText(cost: number, cap: number): string {
  return `コスト ${cost} / ${cap}`;
}

/** Whether `ship` still fits the cap next to `fleet` (in place of `replacing`, if given). */
export function fitsCost(ship: IShipData, fleet: ReadonlyArray<IShipData>, cap: number, refits: Readonly<Record<string, number>> = {}, replacing?: IShipData | null): boolean {
  const rest = fleet.filter((s) => s.id !== ship.id && s.id !== replacing?.id);
  return fleetCost([...rest, ship], refits) <= cap;
}

/** Ranks and caps line up one for one. */
export const COST_CAPS_COVER_RANKS = COST_CAP.length === RANKS.length;

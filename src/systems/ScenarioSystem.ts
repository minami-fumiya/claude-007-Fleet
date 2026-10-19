import { IScenario, IScenarioForce, IScenarioSide, ScenarioTheater } from '@/types/Scenario';
import { IShipData } from '@/types/Ship';
import { ShipRegistry } from './ShipRegistry';

/** Historical scenarios (pure): which forces the player and the AI get when playing a side. */

export interface IScenarioSetup {
  side: IScenarioSide;
  player: IScenarioForce;
  enemy: IScenarioForce;
}

export function setupFor(scenario: IScenario, sideIndex: number): IScenarioSetup | null {
  const side = scenario.sides[sideIndex];
  if (!side) return null;
  const player = scenario.forces[side.force];
  const enemy = scenario.forces[side.force === 'A' ? 'B' : 'A'];
  return { side, player, enemy };
}

export function forceShips(force: IScenarioForce, registry: ShipRegistry): IShipData[] {
  return force.ships.map((id) => registry.byId(id)).filter((s): s is IShipData => s !== undefined);
}

/** Normalised scenario point → world pixels. */
export function placeAt(p: { x: number; y: number }, worldW: number, worldH: number): { x: number; y: number } {
  return { x: p.x * worldW, y: p.y * worldH };
}

export function zoneRadius(r: number, worldW: number, worldH: number): number {
  return r * Math.min(worldW, worldH);
}

export function inZone(x: number, y: number, zone: { x: number; y: number; r: number }, worldW: number, worldH: number): boolean {
  const c = placeAt(zone, worldW, worldH);
  return Math.hypot(x - c.x, y - c.y) <= zoneRadius(zone.r, worldW, worldH);
}

export const SCENARIO_THEATER_LABEL: Record<ScenarioTheater, string> = { pacific: '太平洋', atlantic: '大西洋', mediterranean: '地中海', arctic: '北極海' };

/** "1942年6月" → 194206 (0 when unreadable), for ordering the list (#71). */
export function scenarioMonth(date: string): number {
  const m = /(\d{4})年(\d{1,2})月/.exec(date);
  return m ? Number(m[1]) * 100 + Number(m[2]) : 0;
}

/** Oldest first; the same month keeps the given order. */
export function sortScenarios(list: readonly IScenario[]): IScenario[] {
  return list.map((s, i) => ({ s, i })).sort((a, b) => scenarioMonth(a.s.date) - scenarioMonth(b.s.date) || a.i - b.i).map(({ s }) => s);
}

/** The scenarios of a theater ('all' for every one). */
export function scenariosIn(list: readonly IScenario[], theater: ScenarioTheater | 'all'): IScenario[] {
  return theater === 'all' ? [...list] : list.filter((s) => s.theater === theater);
}

import { IScenario, IScenarioForce, IScenarioSide, ScenarioTheater } from '@/types/Scenario';
import { IShipData } from '@/types/Ship';
import { ShipRegistry } from './ShipRegistry';
import { kindBreakdown, kindGroups } from './ShipKind';

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

/**
 * A side's ships by kind (#196): a headline ("7 隻 — 戦艦 1・軽巡 1・駆逐艦 5") and one line per kind with its
 * names, repeated ships counted ("駆逐艦  雪風・浜風 ×2"). Stand-ins of another nation are marked ※.
 */
export function forceLineup(force: IScenarioForce, registry: ShipRegistry): { headline: string; lines: string[] } {
  const ships = forceShips(force, registry).map((s) => ({ ...s, name: `${s.name.replace(/\s*\(.*\)\s*$/, '')}${s.nation !== force.nation ? '※' : ''}` }));
  const lines = kindGroups(ships).map((g) => {
    const counts = new Map<string, number>();
    for (const n of g.names) counts.set(n, (counts.get(n) ?? 0) + 1);
    return `${g.kind}  ${[...counts].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join('・')}`;
  });
  return { headline: `${ships.length} 隻 — ${kindBreakdown(ships)}`, lines };
}

/** The scenarios a nation fought in (#224): only those can be played, from that nation's side. */
export function playableScenarios(list: readonly IScenario[], nation: string): IScenario[] {
  return list.filter((sc) => sc.forces.A.nation === nation || sc.forces.B.nation === nation);
}

/** The side indices of `sc` the nation can take (#224): those whose force is its own navy. */
export function playableSides(sc: IScenario, nation: string): number[] {
  return sc.sides.map((side, i) => ({ side, i })).filter(({ side }) => sc.forces[side.force].nation === nation).map(({ i }) => i);
}

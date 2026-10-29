import { Formation } from './Formation';
import { Nation } from './Nation';
import { Objective } from './Campaign';
import { TimeOfDay, Weather } from './Weather';

/** Normalised map point (0..1 of the world) with a heading in degrees (0 = north). */
export interface IScenarioPlacement {
  x: number;
  y: number;
  angle: number;
}

export interface IScenarioForce {
  nation: Nation;
  /** Ship ids, flagship first */
  ships: string[];
  /** One placement per ship */
  positions: IScenarioPlacement[];
  /** Formation when this force is the enemy (#82); chosen by the situation when absent */
  formation?: Formation;
}

export interface IScenarioZone {
  x: number;
  y: number;
  /** In units of the world's shorter side */
  r: number;
  label: string;
}

/** One playable side of a scenario and what that side must achieve. */
export interface IScenarioSide {
  force: 'A' | 'B';
  label: string;
  objective: Objective;
  brief: string;
  /** Enemy ship ids that matter for SinkTargets / PreventEscape / Delay */
  targets?: string[];
  zone?: IScenarioZone;
  timeLimitSec?: number;
  /** The enemy AI heads for the zone instead of hunting (escape / breakthrough attempts) */
  enemyGoesForZone?: boolean;
}

/** Sea area a scenario is filed under in the list (#71). */
export type ScenarioTheater = 'pacific' | 'atlantic' | 'mediterranean' | 'arctic' | 'baltic' | 'blacksea';

/** What happened in the real battle (#200): who won, how many ships each force lost, in a line. */
export interface IScenarioHistory {
  winner: 'A' | 'B' | 'draw';
  /** Ships each force lost (within the scenario's forces) */
  lost: { A: number; B: number };
  text: string;
}

export interface IScenario {
  id: string;
  name: string;
  /** "1942年6月" */
  date: string;
  history?: IScenarioHistory;
  theater?: ScenarioTheater;
  description: string;
  map: string;
  weather: Weather;
  time: TimeOfDay;
  forces: { A: IScenarioForce; B: IScenarioForce };
  sides: IScenarioSide[];
}

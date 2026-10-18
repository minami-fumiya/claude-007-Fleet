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

export interface IScenario {
  id: string;
  name: string;
  date: string;
  description: string;
  map: string;
  weather: Weather;
  time: TimeOfDay;
  forces: { A: IScenarioForce; B: IScenarioForce };
  sides: IScenarioSide[];
}

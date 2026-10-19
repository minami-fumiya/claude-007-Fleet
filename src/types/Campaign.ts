import { Nation } from './Nation';
import { ShipClass } from './ShipClass';
import { IResources } from './Progression';
import { TimeOfDay, Weather } from './Weather';
import type { IScenarioZone } from './Scenario';

/** What wins an operation. */
export enum Objective {
  /** Sink every enemy ship */
  Annihilate = 'Annihilate',
  /** Get the convoy across the map */
  Convoy = 'Convoy',
  /** Destroy every shore target */
  Bombard = 'Bombard',
  /** Sink the listed enemy ships before time runs out */
  SinkTargets = 'SinkTargets',
  /** Get the flagship into the objective zone before time runs out */
  Breakthrough = 'Breakthrough',
  /** Sink the listed enemy ship before it reaches the zone */
  PreventEscape = 'PreventEscape',
  /** Keep the enemy out of the zone until time runs out */
  Delay = 'Delay',
}

/** Objective details of a campaign area (#40); the enemy fleet's lead ship is the target. */
export interface ICampaignSide {
  /** The enemy lead ship is the target (SinkTargets / PreventEscape / Delay) */
  targetLead?: boolean;
  zone?: IScenarioZone;
  timeLimitSec?: number;
  /** The target heads for the zone instead of hunting */
  enemyGoesForZone?: boolean;
}

export interface ICampaignArea {
  id: string;
  theater: string;
  name: string;
  description: string;
  /** Node position on the strategic map, normalised 0..1 */
  x: number;
  y: number;
  /** Area ids that must be cleared first */
  requires: string[];
  /** Branch merge (#40): at least one of these must be cleared too */
  requiresAny?: string[];
  enemy: { nation: Nation; ships: string[] };
  objective: Objective;
  map: string;
  weather: Weather;
  time: TimeOfDay;
  /** Paid on the first clear */
  reward: Partial<IResources>;
  /** Zone / time limit / target for the objectives beyond 殲滅・護衛・砲撃 (#40) */
  side?: ICampaignSide;
  /** Class of the ship the first clear adds to the player's nation (see ShipyardSystem.rewardShipFor) */
  rewardShip?: ShipClass;
}

export interface ITheater {
  id: string;
  name: string;
  en: string;
  /** Who each playable nation fights here; a nation missing from this map can't play the theater. */
  opponents: Partial<Record<Nation, Nation>>;
}

export interface ICampaignData {
  theaters: ITheater[];
  areas: ICampaignArea[];
}

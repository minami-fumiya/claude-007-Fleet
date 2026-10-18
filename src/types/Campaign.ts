import { Nation } from './Nation';
import { ShipClass } from './ShipClass';
import { IResources } from './Progression';
import { TimeOfDay, Weather } from './Weather';

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
  enemy: { nation: Nation; ships: string[] };
  objective: Objective;
  map: string;
  weather: Weather;
  time: TimeOfDay;
  /** Paid on the first clear */
  reward: Partial<IResources>;
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

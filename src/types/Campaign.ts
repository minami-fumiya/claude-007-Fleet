import { Nation } from './Nation';
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
}

export interface ITheater {
  id: string;
  name: string;
  en: string;
}

export interface ICampaignData {
  theaters: ITheater[];
  areas: ICampaignArea[];
}

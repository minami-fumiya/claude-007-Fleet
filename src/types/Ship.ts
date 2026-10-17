import { Nation } from './Nation';
import { ShipClass } from './ShipClass';
import { IAirWing } from './Aircraft';

export interface IShipData {
  id: string;
  name: string;
  nation: Nation;
  shipClass: ShipClass;
  hp: number;
  armor: number;
  speed: number;
  weapons: string[];
  spriteKey: string;
  /** Carriers only: embarked aircraft */
  airWing?: IAirWing;
  /** Planned-only design: needs the 架空艦計画 research and never appears in enemy fleets */
  fictional?: boolean;
  /** Short history for the encyclopedia */
  description?: string;
}

export interface IShipStats {
  name: string;
  maxHp: number;
  currentHp: number;
  armor: number;
  speed: number;
  firePower: number;
  shipClass: ShipClass;
  /** Crew proficiency 0..100 (aim and evasion) */
  proficiency?: number;
}

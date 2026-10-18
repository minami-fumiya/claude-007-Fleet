import { Nation } from './Nation';
import { ShipClass } from './ShipClass';
import { IAirWing } from './Aircraft';

/**
 * Finer ship type for display and unlocks (#16). Mechanics still run on the 5 `ShipClass` values:
 * a battlecruiser fights as a Battleship, an escort as a Destroyer, a light carrier as a Carrier.
 */
export enum ShipSubtype {
  BattleCruiser = 'BattleCruiser',
  AviationBattleship = 'AviationBattleship',
  HeavyCruiser = 'HeavyCruiser',
  LightCruiser = 'LightCruiser',
  LightCarrier = 'LightCarrier',
  EscortCarrier = 'EscortCarrier',
  Escort = 'Escort',
}

export const SUBTYPE_JA: Record<ShipSubtype, string> = {
  [ShipSubtype.BattleCruiser]: '巡洋戦艦',
  [ShipSubtype.AviationBattleship]: '航空戦艦',
  [ShipSubtype.HeavyCruiser]: '重巡洋艦',
  [ShipSubtype.LightCruiser]: '軽巡洋艦',
  [ShipSubtype.LightCarrier]: '軽空母',
  [ShipSubtype.EscortCarrier]: '護衛空母',
  [ShipSubtype.Escort]: '海防艦',
};

export interface IShipData {
  id: string;
  name: string;
  nation: Nation;
  shipClass: ShipClass;
  /** Display / unlock subtype (巡洋戦艦, 重巡, 軽空母 …); mechanics follow `shipClass` */
  subtype?: ShipSubtype;
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

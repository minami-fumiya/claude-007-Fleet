import { Nation } from './Nation';
import { ShipClass } from './ShipClass';

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
}

export interface IShipStats {
  maxHp: number;
  currentHp: number;
  armor: number;
  speed: number;
  firePower: number;
  shipClass: ShipClass;
}

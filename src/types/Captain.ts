import { Nation } from './Nation';
import { ShipClass } from './ShipClass';

/** A captain's speciality; its bonus grows with the captain's level. */
export enum CaptainSkill {
  /** 砲術: gun firepower and reload */
  Gunnery = 'Gunnery',
  /** 水雷: torpedo firepower */
  Torpedo = 'Torpedo',
  /** 機関: speed and hull (HP) */
  Engineering = 'Engineering',
  /** 航空: carrier air wing strike power and rearming (air defence moved to 対空, #185) */
  Aviation = 'Aviation',
  /** 対空: anti-aircraft fire (#185) */
  AntiAir = 'AntiAir',
  /** 対潜: depth charges and sonar watch (vision) */
  ASW = 'ASW',
  /** 夜戦: vision, guns and torpedoes at night */
  Night = 'Night',
  /** 索敵: vision */
  Recon = 'Recon',
  /** 応急: hull (HP) and armour from damage control */
  Damecon = 'Damecon',
}

/** Static captain data (src/data/captains.json). */
export interface ICaptainData {
  id: string;
  name: string;
  nation: Nation;
  skill: CaptainSkill;
  /** A short biography for the 図鑑 (#130) */
  bio?: string;
  /** Overrides of the aptitude the speciality implies (#131) */
  aptitude?: Partial<Record<ShipClass, Aptitude>>;
}

/** How well a captain commands a ship class (#131): S 120%, A 100%, B 80%, C 60% of their skills and abilities. */
export type Aptitude = 'S' | 'A' | 'B' | 'C';

/** The abilities every captain grows with level (#131; 対空 split from 航空 in #185). */
export enum CaptainAbility {
  /** 砲術: gun firepower */
  Gunnery = 'gunnery',
  /** 雷撃: torpedo firepower */
  Torpedo = 'torpedo',
  /** 航空: air wing strike power */
  Aviation = 'aviation',
  /** 対空: anti-aircraft fire (#185) */
  AntiAir = 'antiAir',
  /** 操艦: evasion */
  Handling = 'handling',
}

/** A captain with progress applied. */
export interface ICaptain extends ICaptainData {
  xp: number;
  level: number;
}

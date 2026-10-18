import { Nation } from './Nation';

/** A captain's speciality; its bonus grows with the captain's level. */
export enum CaptainSkill {
  /** 砲術: gun firepower and reload */
  Gunnery = 'Gunnery',
  /** 水雷: torpedo firepower */
  Torpedo = 'Torpedo',
  /** 機関: speed and hull (HP) */
  Engineering = 'Engineering',
  /** 航空: carrier air wing strike power and air defence */
  Aviation = 'Aviation',
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
}

/** A captain with progress applied. */
export interface ICaptain extends ICaptainData {
  xp: number;
  level: number;
}

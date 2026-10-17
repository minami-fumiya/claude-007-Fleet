import { Nation } from './Nation';

/** A captain's speciality; its bonus grows with the captain's level. */
export enum CaptainSkill {
  /** 砲術: gun firepower and reload */
  Gunnery = 'Gunnery',
  /** 水雷: torpedo firepower */
  Torpedo = 'Torpedo',
  /** 機関: speed and hull (HP) */
  Engineering = 'Engineering',
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

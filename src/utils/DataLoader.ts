import { IShipData } from '@/types/Ship';
import { IWeaponData } from '@/types/Weapon';
import { NATION_INFO, PLAYABLE_NATIONS } from '@/config/NationInfo';
import { ShipRegistry } from '@/systems/ShipRegistry';
import { ICaptainData } from '@/types/Captain';
import { IUpgradeData } from '@/types/Modifiers';

export interface IShipJsonFile {
  ships: IShipData[];
}

export interface IWeaponJsonFile {
  weapons: IWeaponData[];
}

export class DataLoader {
  static fromCache<T>(scene: Phaser.Scene, key: string): T {
    return scene.cache.json.get(key) as T;
  }

  static getShips(scene: Phaser.Scene, key: string): IShipData[] {
    const data = DataLoader.fromCache<IShipJsonFile>(scene, key);
    return data?.ships ?? [];
  }

  /** All playable nations' ships from the JSON cache (loaded in PreloadScene). */
  static getRegistry(scene: Phaser.Scene): ShipRegistry {
    return new ShipRegistry(PLAYABLE_NATIONS.flatMap((n) => DataLoader.getShips(scene, NATION_INFO[n].dataKey)));
  }

  static getCaptains(scene: Phaser.Scene): ICaptainData[] {
    return DataLoader.fromCache<{ captains: ICaptainData[] }>(scene, 'captains')?.captains ?? [];
  }

  static getUpgrades(scene: Phaser.Scene): IUpgradeData[] {
    return DataLoader.fromCache<{ upgrades: IUpgradeData[] }>(scene, 'upgrades')?.upgrades ?? [];
  }

  static getWeapons(scene: Phaser.Scene, key: string): IWeaponData[] {
    const data = DataLoader.fromCache<IWeaponJsonFile>(scene, key);
    return data?.weapons ?? [];
  }

  static getWeaponById(scene: Phaser.Scene, weaponId: string): IWeaponData | undefined {
    return DataLoader.getWeapons(scene, 'weapons').find((w) => w.id === weaponId);
  }

  static async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`DataLoader: failed to load ${url} (${response.status})`);
    return response.json() as Promise<T>;
  }
}

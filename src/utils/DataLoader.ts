import { IShipData } from '@/types/Ship';

export interface IShipJsonFile {
  ships: IShipData[];
}

export class DataLoader {
  static fromCache<T>(scene: Phaser.Scene, key: string): T {
    return scene.cache.json.get(key) as T;
  }

  static getShips(scene: Phaser.Scene, key: string): IShipData[] {
    const data = DataLoader.fromCache<IShipJsonFile>(scene, key);
    return data?.ships ?? [];
  }

  static async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`DataLoader: failed to load ${url} (${response.status})`);
    return response.json() as Promise<T>;
  }
}

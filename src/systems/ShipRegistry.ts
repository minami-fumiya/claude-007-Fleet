import { IShipData } from '@/types/Ship';
import { Nation } from '@/types/Nation';
import { ShipClass } from '@/types/ShipClass';

/** Every ship of every nation, looked up by nation, class or id. Pure, so it can be unit tested. */
export class ShipRegistry {
  private readonly byNationMap = new Map<Nation, IShipData[]>();
  private readonly byIdMap = new Map<string, IShipData>();

  constructor(ships: IShipData[]) {
    for (const ship of ships) {
      if (this.byIdMap.has(ship.id)) throw new Error(`ShipRegistry: duplicate ship id "${ship.id}"`);
      this.byIdMap.set(ship.id, ship);
      const list = this.byNationMap.get(ship.nation) ?? [];
      list.push(ship);
      this.byNationMap.set(ship.nation, list);
    }
  }

  all(): IShipData[] {
    return [...this.byIdMap.values()];
  }

  byNation(nation: Nation): IShipData[] {
    return this.byNationMap.get(nation) ?? [];
  }

  byClass(nation: Nation, shipClass: ShipClass): IShipData[] {
    return this.byNation(nation).filter((s) => s.shipClass === shipClass);
  }

  byId(id: string): IShipData | undefined {
    return this.byIdMap.get(id);
  }

  nations(): Nation[] {
    return [...this.byNationMap.keys()];
  }
}

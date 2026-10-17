import { IFleet, IFleetSlot } from '@/types/Fleet';
import { IShipData } from '@/types/Ship';
import { Nation } from '@/types/Nation';

export class FleetSystem {
  static createFleet(
    id: string,
    name: string,
    nation: Nation,
    ships: (IShipData | null)[],
    flagshipIndex = 0,
  ): IFleet {
    const slots: IFleetSlot[] = ships.map((shipData, i) => ({
      slotIndex: i,
      shipData: shipData ?? null,
    }));
    return { id, name, nation, slots, flagshipIndex };
  }

  static isValid(fleet: IFleet): boolean {
    return fleet.slots.some((s) => s.shipData !== null);
  }

  static getShips(fleet: IFleet): IShipData[] {
    return fleet.slots.map((s) => s.shipData).filter((s): s is IShipData => s !== null);
  }

  static getFlagship(fleet: IFleet): IShipData | null {
    return fleet.slots[fleet.flagshipIndex]?.shipData ?? null;
  }

  static getEscorts(fleet: IFleet): IShipData[] {
    return fleet.slots
      .filter((s, i) => i !== fleet.flagshipIndex && s.shipData !== null)
      .map((s) => s.shipData as IShipData);
  }
}

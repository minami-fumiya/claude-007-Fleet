import { IShipData } from './Ship';
import { Nation } from './Nation';

export interface IFleetSlot {
  slotIndex: number;
  shipData: IShipData | null;
}

export interface IFleet {
  id: string;
  name: string;
  nation: Nation;
  slots: IFleetSlot[];
  flagshipIndex: number;
}

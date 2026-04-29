export enum Formation {
  LineAhead = 'LineAhead',
  DoubleLine = 'DoubleLine',
  Circle = 'Circle',
}

export interface IFormationSlotOffset {
  forward: number;
  right: number;
}

export interface IFormationConfig {
  formation: Formation;
  name: string;
  slotOffsets: IFormationSlotOffset[];
}

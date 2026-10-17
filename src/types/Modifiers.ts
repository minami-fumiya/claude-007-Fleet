/** Multipliers / bonuses applied to one ship at battle start (upgrades and its captain). */
export interface IShipModifiers {
  hpMul: number;
  armorAdd: number;
  speedMul: number;
  gunPowerMul: number;
  gunReloadMul: number;
  torpedoPowerMul: number;
  visionMul: number;
  aaMul: number;
}

export const NO_MODIFIERS: IShipModifiers = {
  hpMul: 1,
  armorAdd: 0,
  speedMul: 1,
  gunPowerMul: 1,
  gunReloadMul: 1,
  torpedoPowerMul: 1,
  visionMul: 1,
  aaMul: 1,
};

/** Equipment fitted in a ship's upgrade slot (src/data/upgrades.json). */
export interface IUpgradeData {
  id: string;
  name: string;
  description: string;
  /** Partial modifiers; missing fields mean "no change" */
  effects: Partial<IShipModifiers>;
  /** Research id that unlocks this upgrade (always available when absent) */
  requires?: string;
}

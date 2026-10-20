/** Multipliers / bonuses applied to one ship at battle start (upgrades, research, refits and its captain). */
export interface IShipModifiers {
  hpMul: number;
  armorAdd: number;
  speedMul: number;
  gunPowerMul: number;
  gunReloadMul: number;
  torpedoPowerMul: number;
  visionMul: number;
  aaMul: number;
  /** Carrier aviation: damage of bombs and aerial torpedoes */
  airPowerMul: number;
  /** Carrier aviation: extra planes of each type in the air wing (added, not multiplied) */
  planesAdd: number;
  /** Carrier aviation: re-arm time of landed squadrons (lower is faster) */
  rearmMul: number;
  /** ASW: sonar reach */
  sonarMul: number;
  /** ASW: depth charge damage */
  depthChargeMul: number;
  /** Night battle: aim error at night (lower is better) */
  nightAimMul: number;
  /** Night battle: vision at night */
  nightVisionMul: number;
  /** Chance added to dodging a shell or torpedo (formations, #59) */
  evadeAdd: number;
  /** Damage control (#48): chance and length of fires and flooding (lower is better) */
  fireFloodMul: number;
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
  airPowerMul: 1,
  planesAdd: 0,
  rearmMul: 1,
  sonarMul: 1,
  depthChargeMul: 1,
  nightAimMul: 1,
  nightVisionMul: 1,
  evadeAdd: 0,
  fireFloodMul: 1,
};

/** Fields that are added when modifiers combine; every other field multiplies. */
export const ADDITIVE_MODIFIERS: ReadonlyArray<keyof IShipModifiers> = ['armorAdd', 'planesAdd', 'evadeAdd'];

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

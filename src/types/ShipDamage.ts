/** Component damage a hit can cause (部位損傷). Each wears off once the crew repairs it. */
export enum CriticalType {
  /** 主砲損傷: guns reload slower */
  MainGun = 'MainGun',
  /** 機関損傷: lower top speed */
  Engine = 'Engine',
  /** 舵損傷: the ship turns slowly */
  Rudder = 'Rudder',
}

/** Time (scene ms) each critical lasts until; 0 / absent = not damaged. */
export type CriticalState = Partial<Record<CriticalType, number>>;

export interface ICriticalEffects {
  speedMul: number;
  turnMul: number;
  gunReloadMul: number;
}

/** 火災・浸水 (#48): burning or flooding until these times (scene ms). */
export interface IStatusState {
  fire?: number;
  flood?: number;
}

export type StatusKind = keyof IStatusState;

/** 弾種 (#48): the main guns' shells. AUTO picks per target (AP for heavy ships, HE for the rest). */
export type ShellMode = 'auto' | 'AP' | 'HE';

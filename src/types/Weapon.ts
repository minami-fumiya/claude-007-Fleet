export enum WeaponType {
  ShellAP = 'ShellAP',
  ShellHE = 'ShellHE',
  Torpedo = 'Torpedo',
  DepthCharge = 'DepthCharge',
  Bomb = 'Bomb',
  AntiAir = 'AntiAir',
}

export interface IWeaponData {
  id: string;
  name: string;
  type: WeaponType;
  firePower: number;
  range: number;
  reloadTime: number;
  projectileSpeed: number;
}

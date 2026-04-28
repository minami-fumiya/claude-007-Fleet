export enum WeaponType {
  MainGun = 'MainGun',
  Torpedo = 'Torpedo',
  Aircraft = 'Aircraft',
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

import Phaser from 'phaser';
import { BaseShip } from '@/entities/ships/BaseShip';
import { Shell } from '@/entities/weapons/Shell';
import { ObjectPool } from '@/utils/ObjectPool';
import { IWeaponData } from '@/types/Weapon';
import { ReloadState } from './ReloadState';

export { ReloadState } from './ReloadState';

const POOL_SIZE = 20;

export class WeaponSystem {
  readonly shells: Shell[] = [];
  private pool: ObjectPool<Shell>;
  private reload = new ReloadState();

  constructor(scene: Phaser.Scene) {
    this.pool = new ObjectPool<Shell>(
      () => {
        const s = new Shell(scene);
        this.shells.push(s);
        return s;
      },
      (s) => s.setActive(true).setVisible(true),
      (s) => s.deactivate(),
      POOL_SIZE,
    );
  }

  fireWeapon(ship: BaseShip, weapon: IWeaponData, targetAngle: number, now: number): boolean {
    if (!this.reload.isReady(ship, weapon.reloadTime, now)) return false;
    this.reload.markFired(ship, now);
    const shell = this.pool.get();
    shell.fire(ship.x, ship.y, targetAngle);
    return true;
  }

  update(time: number, delta: number): void {
    this.shells.forEach((s) => s.update(time, delta));
  }
}

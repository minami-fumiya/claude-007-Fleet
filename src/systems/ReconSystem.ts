import Phaser from 'phaser';
import { DEPTH_EFFECTS } from '@/config/GameConstants';
import { BaseShip } from '@/entities/ships/BaseShip';
import { aaFire, applyAttrition, IAAGun } from './AirCombat';
import { carriesRecon, IVisionCone, RECON_HALF_ANGLE, RECON_RANGE, reconPatrol } from './VisionSystem';

const RECON_SPEED = 230;
/** A lost floatplane is replaced by the ship's spare after this long. */
const RELAUNCH_MS = 20000;
/** Angular speed of the patrol point around its orbit (rad/s). */
const ORBIT_RATE = 0.55;

interface IRecon {
  ship: BaseShip;
  plane: Phaser.GameObjects.Image | null;
  orbit: number;
  heading: number;
  damage: number;
  relaunchAt: number;
}

/**
 * Floatplanes of one side: every battleship and cruiser keeps one scouting a cone ahead of it,
 * circling an orbit centred in front of its ship. Enemy AA can shoot them down; a spare is
 * launched after a while.
 */
export class ReconSystem {
  private recons: IRecon[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly enemySide: boolean,
  ) {}

  register(ship: BaseShip): void {
    if (!carriesRecon(ship.stats.shipClass)) return;
    this.recons.push({ ship, plane: null, orbit: Math.random() * Math.PI * 2, heading: 0, damage: 0, relaunchAt: 0 });
  }

  /** Vision cones of the planes currently aloft. */
  cones(rangeMul = 1): IVisionCone[] {
    return this.recons
      .filter((r) => r.plane)
      .map((r) => ({ kind: 'cone', x: r.plane!.x, y: r.plane!.y, heading: r.heading, range: RECON_RANGE * rangeMul, halfAngle: RECON_HALF_ANGLE }));
  }

  update(time: number, delta: number, foeGuns: IAAGun[]): void {
    const dtSec = delta / 1000;
    for (const r of this.recons) {
      if (!r.ship.isAlive) {
        r.plane?.destroy();
        r.plane = null;
        continue;
      }
      if (!r.plane) {
        if (time < r.relaunchAt) continue;
        r.plane = this.scene.add.image(r.ship.x, r.ship.y, 'plane-recon').setDepth(DEPTH_EFFECTS - 2);
        if (this.enemySide) r.plane.setTint(0xff7070);
        r.damage = 0;
      }
      this.fly(r, dtSec);
      const loss = applyAttrition(1, r.damage, aaFire(r.plane.x, r.plane.y, foeGuns), dtSec);
      r.damage = loss.damage;
      if (loss.planes === 0) {
        r.plane.destroy();
        r.plane = null;
        r.relaunchAt = time + RELAUNCH_MS;
      }
    }
  }

  private fly(r: IRecon, dtSec: number): void {
    const plane = r.plane!;
    r.orbit += ORBIT_RATE * dtSec;
    const bow = Phaser.Math.DegToRad(r.ship.angle - 90);
    const goal = reconPatrol(r.ship.x, r.ship.y, bow, r.orbit);
    const dx = goal.x - plane.x;
    const dy = goal.y - plane.y;
    const d = Math.hypot(dx, dy);
    if (d > 1) {
      const step = Math.min(d, RECON_SPEED * dtSec);
      plane.x += (dx / d) * step;
      plane.y += (dy / d) * step;
      r.heading = Math.atan2(dy, dx);
      plane.setRotation(r.heading);
    }
  }

  destroy(): void {
    for (const r of this.recons) r.plane?.destroy();
    this.recons = [];
  }
}

import Phaser from 'phaser';
import { DEPTH_EFFECTS } from '@/config/GameConstants';
import { BaseShip } from '@/entities/ships/BaseShip';
import { aaFire, applyAttrition, IAAGun } from './AirCombat';
import { carriesRecon, IVisionCone, pickShadowTarget, RECON_HALF_ANGLE, RECON_RANGE, reconPatrol, SHADOW_MS, shadowOrbit } from './VisionSystem';

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
  /** Contact being shadowed (#98), and since when */
  shadow: BaseShip | null;
  shadowSince: number;
}

/**
 * Floatplanes of one side: every battleship and cruiser keeps one scouting a cone ahead of it,
 * circling an orbit centred in front of its ship. A plane that finds an enemy shadows it (触接, #98): it circles the
 * contact, keeping it in sight, until it is shot down or its fuel runs out. Enemy AA can shoot planes down; a spare
 * is launched after a while.
 */
export class ReconSystem {
  private recons: IRecon[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly enemySide: boolean,
  ) {}

  register(ship: BaseShip): void {
    if (!carriesRecon(ship.stats.shipClass)) return;
    this.recons.push({ ship, plane: null, orbit: Math.random() * Math.PI * 2, heading: 0, damage: 0, relaunchAt: 0, shadow: null, shadowSince: 0 });
  }

  /** Vision cones of the planes currently aloft. */
  cones(rangeMul = 1): IVisionCone[] {
    return this.recons
      .filter((r) => r.plane)
      .map((r) => ({ kind: 'cone', x: r.plane!.x, y: r.plane!.y, heading: r.heading, range: RECON_RANGE * rangeMul, halfAngle: RECON_HALF_ANGLE }));
  }

  /** Ships currently being shadowed by this side's planes. */
  shadowed(): BaseShip[] {
    return this.recons.filter((r) => r.plane && r.shadow).map((r) => r.shadow!);
  }

  update(time: number, delta: number, foeGuns: IAAGun[], foes: BaseShip[] = []): void {
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
        r.shadow = null;
      }
      this.updateShadow(r, time, foes);
      if (!r.plane) continue;
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

  /** Starts, keeps or ends shadowing a contact (#98). Fuel spent: the plane goes home and a spare follows later. */
  private updateShadow(r: IRecon, time: number, foes: BaseShip[]): void {
    const plane = r.plane!;
    if (r.shadow && (!r.shadow.isAlive || r.shadow.submerged)) r.shadow = null;
    if (r.shadow && time - r.shadowSince > SHADOW_MS) {
      plane.destroy();
      r.plane = null;
      r.shadow = null;
      r.relaunchAt = time + RELAUNCH_MS / 2;
      return;
    }
    if (r.shadow) return;
    const cone: IVisionCone = { kind: 'cone', x: plane.x, y: plane.y, heading: r.heading, range: RECON_RANGE, halfAngle: RECON_HALF_ANGLE };
    const taken = new Set(this.shadowed());
    const found = pickShadowTarget(
      cone,
      foes.filter((f) => f.isAlive).map((f) => ({ ref: f, x: f.x, y: f.y, shipClass: f.stats.shipClass, submerged: f.submerged })),
      taken,
    );
    if (found) {
      r.shadow = found;
      r.shadowSince = time;
    }
  }

  private fly(r: IRecon, dtSec: number): void {
    const plane = r.plane!;
    r.orbit += ORBIT_RATE * dtSec;
    const bow = Phaser.Math.DegToRad(r.ship.angle - 90);
    const goal = r.shadow ? shadowOrbit(r.shadow.x, r.shadow.y, r.orbit) : reconPatrol(r.ship.x, r.ship.y, bow, r.orbit);
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
    // While shadowing, the scout keeps looking at its contact whichever way it flies.
    if (r.shadow) r.heading = Math.atan2(r.shadow.y - plane.y, r.shadow.x - plane.x);
  }

  destroy(): void {
    for (const r of this.recons) r.plane?.destroy();
    this.recons = [];
  }
}

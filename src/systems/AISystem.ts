import Phaser from 'phaser';
import { BaseShip } from '@/entities/ships/BaseShip';
import { WeaponSystem } from './WeaponSystem';
import { AIMode, decide, IAISelf, IAITarget, ITacticsProfile, submarineWantsDive, TURN_RATE_DEG } from './AIBrain';
import { engageSteer, IBounds } from './AutoPilot';
import { maxSurfaceRange, selectWeapons, weaponKind, WeaponKind } from './WeaponSelector';
import { interceptAngle } from '@/utils/MathUtils';
import { ShipClass } from '@/types/ShipClass';

/** One ship as seen by the other side this frame. */
export interface IShipView extends IAITarget {
  ship: BaseShip;
}

const EDGE_MARGIN = 90;
/** AI gunnery is not perfect: each shot is off by up to this much (radians). */
const AI_AIM_ERROR = 0.05;
const PATROL_THROTTLE = 0.5;

export function shipView(ship: BaseShip, detected: boolean): IShipView {
  return {
    ship,
    x: ship.x,
    y: ship.y,
    alive: ship.isAlive,
    hpFraction: ship.stats.maxHp > 0 ? ship.stats.currentHp / ship.stats.maxHp : 0,
    shipClass: ship.stats.shipClass,
    submerged: ship.submerged,
    detected,
  };
}

/** Carriers fight with their aircraft, so they hold position as if their reach were this long. */
const CARRIER_STANDOFF_RANGE = 1000;

export function aiSelf(ship: BaseShip): IAISelf {
  const gunRange = maxSurfaceRange(ship.loadout);
  return {
    x: ship.x,
    y: ship.y,
    hpFraction: ship.stats.maxHp > 0 ? ship.stats.currentHp / ship.stats.maxHp : 0,
    maxRange: ship.stats.shipClass === ShipClass.Carrier ? Math.max(gunRange, CARRIER_STANDOFF_RANGE) : gunRange,
    hasDepthCharges: ship.loadout.some((w) => weaponKind(w) === WeaponKind.DepthCharge),
  };
}

/** Fires every weapon that can engage `target` now, leading moving targets. */
export function fireAt(
  weapons: WeaponSystem,
  ship: BaseShip,
  target: IShipView,
  torpedoEagerness: number,
  time: number,
  aimError = 0,
): void {
  const distance = Phaser.Math.Distance.Between(ship.x, ship.y, target.x, target.y);
  const usable = selectWeapons(ship.loadout, {
    distance,
    targetSubmerged: target.submerged,
    shooterSubmerged: ship.submerged,
    torpedoEagerness,
  });
  const vel = (target.ship.body as Phaser.Physics.Arcade.Body | null)?.velocity;
  for (const w of usable) {
    const lead = interceptAngle(ship.x, ship.y, target.x, target.y, vel?.x ?? 0, vel?.y ?? 0, w.projectileSpeed);
    const angle = lead + (Math.random() * 2 - 1) * aimError;
    weapons.fireWeapon(ship, w, angle, time);
  }
}

/** The nearest live foe this side can see, for dive decisions. */
export function nearestDistance(ship: BaseShip, foes: IShipView[]): number {
  let best = Infinity;
  for (const f of foes) {
    if (!f.alive || !f.detected) continue;
    best = Math.min(best, Phaser.Math.Distance.Between(ship.x, ship.y, f.x, f.y));
  }
  return best;
}

/**
 * AI v2 for one enemy ship: picks a target among all visible player ships with its nation's
 * tactics, holds its preferred range (or backs off when damaged, or runs over a submerged boat to
 * drop depth charges) and fires every weapon that can engage.
 */
export class AISystem {
  private current: IShipView | null = null;

  constructor(
    private readonly weapons: WeaponSystem,
    private readonly profile: ITacticsProfile,
    private readonly bounds: IBounds,
  ) {}

  /** Whether this ship wants to be submerged (only meaningful for submarines). */
  wantsDive(ship: BaseShip, foes: IShipView[]): boolean {
    if (!ship.sub) return false;
    return submarineWantsDive(nearestDistance(ship, foes), ship.sub.air, ship.sub.submerged);
  }

  update(ship: BaseShip, foes: IShipView[], time: number, delta: number): void {
    if (!ship.isAlive) return;
    const dtSec = delta / 1000;
    const turnRate = TURN_RATE_DEG[ship.stats.shipClass];
    // Views are rebuilt every frame; keep tracking the same ship.
    const current = this.current ? foes.find((f) => f.ship === this.current!.ship) ?? null : null;
    const decision = decide(aiSelf(ship), foes, this.profile, current);
    this.current = decision.target;

    const target = decision.target;
    if (!target) {
      // Nothing visible: patrol towards the middle of the sea.
      const centre = { x: this.bounds.width / 2, y: this.bounds.height / 2 };
      ship.steer(engageSteer(ship, centre, 200, this.bounds, EDGE_MARGIN), dtSec, turnRate);
      const body = ship.body as Phaser.Physics.Arcade.Body;
      body.velocity.scale(PATROL_THROTTLE);
      return;
    }

    const steer = engageSteer(ship, target, decision.preferredRange, this.bounds, EDGE_MARGIN);
    // Hunting a submerged boat: always drive straight over it.
    if (decision.mode === AIMode.Hunt) steer.throttle = 1;
    ship.steer(steer, dtSec, turnRate);
    fireAt(this.weapons, ship, target, this.profile.torpedoEagerness, time, AI_AIM_ERROR);
  }
}

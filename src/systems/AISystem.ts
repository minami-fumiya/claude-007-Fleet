import Phaser from 'phaser';
import { BaseShip } from '@/entities/ships/BaseShip';
import { WeaponSystem } from './WeaponSystem';
import { AIMode, decide, IAISelf, IAITarget, ITacticsProfile, submarineWantsDive, TURN_RATE_DEG } from './AIBrain';
import { engageSteer, headingTo, IBounds } from './AutoPilot';
import { maxSurfaceRange, selectWeapons, weaponKind, WeaponKind } from './WeaponSelector';
import { interceptAngle } from '@/utils/MathUtils';
import { ShipClass } from '@/types/ShipClass';
import { aimErrorMul } from './ProficiencySystem';
import { FormationSystem } from './FormationSystem';
import { IFormationSlotOffset } from '@/types/Formation';

/** One ship as seen by the other side this frame. */
export interface IShipView extends IAITarget {
  ship: BaseShip;
}

const EDGE_MARGIN = 90;
/** AI gunnery is not perfect: each shot is off by up to this much (radians). */
export const AI_AIM_ERROR = 0.085;
/** The player's automatic fire (touch / AUTO) is a little better than the AI's. */
export const AUTO_AIM_ERROR = 0.07;
/** Torpedoes are slow, so a perfectly led spread almost never misses; AI torpedo aim is rougher. */
const AI_TORPEDO_AIM_ERROR = 0.12;
const PATROL_THROTTLE = 0.5;

export function shipView(ship: BaseShip, detected: boolean): IShipView {
  return {
    ship,
    x: ship.x,
    y: ship.y,
    alive: ship.isAlive,
    hpFraction: ship.stats.maxHp > 0 ? ship.stats.currentHp / ship.stats.maxHp : 0,
    shipClass: ship.stats.shipClass,
    subtype: ship.stats.subtype,
    submerged: ship.submerged,
    detected,
  };
}

/** Carriers fight with their aircraft, so they hold position as if their reach were this long. */
const CARRIER_STANDOFF_RANGE = 1000;
/**
 * Carriers keep this far from their target whatever the nation's tactics (the player's AUTO uses the
 * same): an IJN profile used to bring them to half range, inside the enemy cruisers' guns (#23).
 */
export const CARRIER_STANDOFF = 850;

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
    targetLand: target.ship.isLand,
    torpedoEagerness,
  });
  const vel = (target.ship.body as Phaser.Physics.Arcade.Body | null)?.velocity;
  for (const w of usable) {
    const lead = interceptAngle(ship.x, ship.y, target.x, target.y, vel?.x ?? 0, vel?.y ?? 0, w.projectileSpeed);
    const error = aimError > 0 && weaponKind(w) === WeaponKind.Torpedo ? Math.max(aimError, AI_TORPEDO_AIM_ERROR) : aimError;
    const angle = lead + (Math.random() * 2 - 1) * error * aimErrorMul(ship.stats.proficiency ?? 0) * ship.aimErrorMul;
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
  /** When set the ship makes for this point (escape / breakthrough) and only fires on the way */
  goal: { x: number; y: number } | null = null;
  /** Throttle while heading for `goal` (a slow escape or advance a fleet can still catch, #40) */
  goalThrottle = 1;
  /** Where the ship searches when nothing is visible (default: the middle of the sea) */
  patrol: { x: number; y: number } | null = null;
  /**
   * An enemy escort's place in its fleet's formation (#82): kept until a target is in sight, then the ship fights
   * on its own (散開).
   */
  station: { lead: BaseShip; offset: IFormationSlotOffset } | null = null;

  /** The ship this AI is attacking (null when it has no target). */
  get targetShip(): BaseShip | null {
    return this.current?.ship ?? null;
  }

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

  /**
   * `attackers` counts how many ships of this side currently target each foe (this ship's own pick included); the
   * AI avoids piling onto a ship the others already attack (#34). The caller updates it after each decision.
   */
  update(ship: BaseShip, foes: IShipView[], time: number, delta: number, attackers?: Map<BaseShip, number>): void {
    if (!ship.isAlive) return;
    const dtSec = delta / 1000;
    const turnRate = TURN_RATE_DEG[ship.stats.shipClass];
    const own = this.current?.ship ?? null;
    const candidates = attackers
      ? foes.map((f) => ({ ...f, attackers: Math.max(0, (attackers.get(f.ship) ?? 0) - (f.ship === own ? 1 : 0)) }))
      : foes;
    // Views are rebuilt every frame; keep tracking the same ship.
    const current = own ? candidates.find((f) => f.ship === own) ?? null : null;
    const decision = decide(aiSelf(ship), candidates, this.profile, current);
    this.current = decision.target;

    const target = decision.target;
    if (!target && this.goal) {
      ship.steer({ headingDeg: headingTo(ship, this.goal), throttle: this.goalThrottle }, dtSec, turnRate);
      return;
    }
    if (!target && this.station?.lead.isAlive) {
      // In formation: make for the slot beside the flagship, slowing as the ship gets there.
      const slot = FormationSystem.getWorldPosition(this.station.lead, this.station.offset);
      const dist = Math.hypot(slot.x - ship.x, slot.y - ship.y);
      ship.steer({ headingDeg: dist < 30 ? this.station.lead.angle : headingTo(ship, slot), throttle: Math.max(0.35, Math.min(1, dist / 220)) }, dtSec, turnRate);
      return;
    }
    if (!target) {
      // Nothing visible: patrol towards the patrol point (the middle of the sea by default).
      const centre = this.patrol ?? { x: this.bounds.width / 2, y: this.bounds.height / 2 };
      ship.steer(engageSteer(ship, centre, 200, this.bounds, EDGE_MARGIN), dtSec, turnRate);
      const body = ship.body as Phaser.Physics.Arcade.Body;
      body.velocity.scale(PATROL_THROTTLE);
      return;
    }

    if (this.goal) {
      ship.steer({ headingDeg: headingTo(ship, this.goal), throttle: this.goalThrottle }, dtSec, turnRate);
      fireAt(this.weapons, ship, target, this.profile.torpedoEagerness, time, AI_AIM_ERROR);
      return;
    }
    const range = ship.stats.shipClass === ShipClass.Carrier ? Math.max(decision.preferredRange, CARRIER_STANDOFF) : decision.preferredRange;
    const steer = engageSteer(ship, target, range, this.bounds, EDGE_MARGIN);
    // Hunting a submerged boat: always drive straight over it.
    if (decision.mode === AIMode.Hunt) steer.throttle = 1;
    ship.steer(steer, dtSec, turnRate);
    fireAt(this.weapons, ship, target, this.profile.torpedoEagerness, time, AI_AIM_ERROR);
  }
}

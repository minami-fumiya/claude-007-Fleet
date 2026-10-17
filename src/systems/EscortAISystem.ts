import Phaser from 'phaser';
import { BaseShip } from '@/entities/ships/BaseShip';
import { WeaponSystem } from './WeaponSystem';
import { FormationSystem } from './FormationSystem';
import { IFormationSlotOffset } from '@/types/Formation';
import { aiSelf, fireAt, IShipView } from './AISystem';
import { chooseTarget, isEngageable, ITacticsProfile, TURN_RATE_DEG } from './AIBrain';
import { headingTo, waypointSteer } from './AutoPilot';

const ARRIVE_THRESHOLD = 24;
/** Escorts with depth charges leave the formation to attack a submarine on sonar this close. */
const ASW_BREAK_DISTANCE = 380;

/**
 * Player escort: keeps its formation slot and fires at the best target in range. Escorts carrying
 * depth charges break formation to run over a detected submerged submarine nearby.
 */
export class EscortAISystem {
  constructor(
    private readonly weapons: WeaponSystem,
    private readonly offset: IFormationSlotOffset,
    private readonly profile: ITacticsProfile,
  ) {}

  update(escort: BaseShip, flagship: BaseShip, foes: IShipView[], time: number, delta: number): void {
    if (!escort.isAlive || !flagship.isAlive) return;
    const dtSec = delta / 1000;
    const turnRate = TURN_RATE_DEG[escort.stats.shipClass];
    const self = aiSelf(escort);

    const sub = self.hasDepthCharges ? this.nearbySubmarine(escort, foes) : null;
    if (sub) {
      escort.steer({ headingDeg: headingTo(escort, sub), throttle: 1 }, dtSec, turnRate);
      fireAt(this.weapons, escort, sub, this.profile.torpedoEagerness, time, 0.05);
      return;
    }

    const slot = FormationSystem.getWorldPosition(flagship, this.offset);
    const steer = waypointSteer(escort, slot, ARRIVE_THRESHOLD);
    if (steer) {
      escort.steer(steer, dtSec, turnRate);
    } else {
      (escort.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      escort.angle = flagship.angle;
    }

    const target = chooseTarget(self, foes, this.profile);
    if (target) fireAt(this.weapons, escort, target, this.profile.torpedoEagerness, time, 0.05);
  }

  private nearbySubmarine(escort: BaseShip, foes: IShipView[]): IShipView | null {
    let best: IShipView | null = null;
    let bestDist = ASW_BREAK_DISTANCE;
    for (const f of foes) {
      if (!f.submerged || !isEngageable(aiSelf(escort), f)) continue;
      const d = Phaser.Math.Distance.Between(escort.x, escort.y, f.x, f.y);
      if (d < bestDist) {
        bestDist = d;
        best = f;
      }
    }
    return best;
  }
}

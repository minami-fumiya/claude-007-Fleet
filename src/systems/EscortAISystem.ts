import Phaser from 'phaser';
import { BaseShip } from '@/entities/ships/BaseShip';
import { WeaponSystem } from './WeaponSystem';
import { IFormationSlotOffset } from '@/types/Formation';
import { AI_AIM_ERROR, aiSelf, fireAt, IShipView } from './AISystem';
import { chooseTarget, isEngageable, ITacticsProfile, TURN_RATE_DEG } from './AIBrain';
import { headingTo } from './AutoPilot';
import { escortSteer, nextFormationHeading } from './EscortSteering';
/** Escorts with depth charges leave the formation to attack a submarine on sonar this close. */
const ASW_BREAK_DISTANCE = 380;

/**
 * Player escort: keeps its formation slot (turning with the formation, not snapping to the flagship's heading, #80)
 * and fires at the best target in range. Escorts carrying depth charges break formation to run over a detected
 * submerged submarine nearby; `hunting` tells the HUD why it left.
 */
export class EscortAISystem {
  /** Breaking formation to attack a submarine */
  hunting = false;
  /** The formation's reference heading, following the flagship at a limited turn rate (null until the first frame) */
  private formationHeading: number | null = null;

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

    this.formationHeading = nextFormationHeading(this.formationHeading ?? flagship.angle, flagship.angle, dtSec);
    const sub = self.hasDepthCharges ? this.nearbySubmarine(escort, foes) : null;
    this.hunting = sub !== null;
    if (sub) {
      escort.steer({ headingDeg: headingTo(escort, sub), throttle: 1 }, dtSec, turnRate);
      fireAt(this.weapons, escort, sub, this.profile.torpedoEagerness, time, AI_AIM_ERROR);
      return;
    }

    const flagSpeed = (flagship.body as Phaser.Physics.Arcade.Body).velocity.length();
    const steer = escortSteer(
      { x: escort.x, y: escort.y, angle: escort.angle, speed: escort.currentSpeed },
      { x: flagship.x, y: flagship.y, angle: flagship.angle, speed: flagship.currentSpeed, currentSpeed: flagSpeed },
      this.offset,
      this.formationHeading,
    );
    escort.steer(steer, dtSec, turnRate);

    const target = chooseTarget(self, foes, this.profile);
    if (target) fireAt(this.weapons, escort, target, this.profile.torpedoEagerness, time, AI_AIM_ERROR);
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

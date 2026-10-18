import Phaser from 'phaser';
import { BaseShip } from '@/entities/ships/BaseShip';
import { Squadron, SquadronState } from '@/entities/aircraft/Squadron';
import { AircraftType, CarrierAircraft } from '@/types/Aircraft';
import { IWeaponData } from '@/types/Weapon';
import { IShipData } from '@/types/Ship';
import { createAirWing, IAirWingState, land, launch, lose, REARM_MS, tickAirWing } from './AirWingSystem';
import { applyToAirWing } from './CustomizationSystem';
import { IShipModifiers, NO_MODIFIERS } from '@/types/Modifiers';
import { aaFire, aaStrength, applyAttrition, bombHits, dogfightRate, IAAGun } from './AirCombat';
import { CombatSystem } from './CombatSystem';
import { WeaponSystem } from './WeaponSystem';
import { IShipView } from './AISystem';
import { interceptAngle } from '@/utils/MathUtils';

/** Fighters orbit their carrier at this radius and engage raids coming within the alert radius. */
const CAP_RADIUS = 130;
const CAP_ALERT_RADIUS = 420;
const CAP_ENDURANCE_MS = 45000;
/** Fighters fight planes within this distance of them. */
const DOGFIGHT_RANGE = 70;
/** Carriers launch strikes at visible targets within this range. */
export const STRIKE_RANGE = 1500;
const DIVE_RELEASE_DIST = 26;
const TORPEDO_RELEASE_DIST = 180;
const BOMB_HIT_CHANCE = 0.55;
const LANDING_DIST = 30;
/** Drop torpedoes spread across this angle (radians) between the planes. */
const AERIAL_TORPEDO_SPREAD = 0.06;
const AERIAL_TORPEDO_ERROR = 0.16;

export interface IAirContext {
  /** Enemy ships as this side sees them */
  foes: IShipView[];
  /** Enemy squadrons in the air */
  foeSquadrons: Squadron[];
  /** Enemy AA guns (surfaced live ships) */
  foeGuns: IAAGun[];
}

/** A carrier's bombs / aerial torpedoes with its aviation bonus. */
function airPowered(weapon: IWeaponData, carrier: BaseShip): IWeaponData {
  const mul = carrier.mods.airPowerMul;
  return mul === 1 ? weapon : { ...weapon, firePower: weapon.firePower * mul };
}

export function aaGuns(ships: BaseShip[]): IAAGun[] {
  return ships
    .filter((s) => s.isAlive && !s.submerged)
    .map((s) => ({ x: s.x, y: s.y, strength: aaStrength(s.stats.shipClass) * s.aaMul }));
}

/**
 * One side's carrier aviation: air wings, combat air patrol, strikes, bombing / aerial torpedo
 * attacks, AA losses and landing. AI-controlled carriers decide on their own; the player's
 * flagship launches strikes on command (`launchStrike`) but keeps its own CAP up automatically.
 */
export class AirOpsSystem {
  readonly squadrons: Squadron[] = [];
  /** Called when a squadron takes off (sound) */
  onLaunch: (x: number, y: number) => void = () => undefined;
  private wings = new Map<BaseShip, IAirWingState>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly enemySide: boolean,
    private readonly weapons: WeaponSystem,
    private readonly bomb: IWeaponData,
    private readonly aerialTorpedo: IWeaponData,
    /** Called for every bomb that hits, after its damage is applied */
    private readonly onBombHit: (target: BaseShip, weapon: IWeaponData, damage: number) => void,
  ) {}

  register(carrier: BaseShip, wing: IAirWingState | null): void {
    if (wing) this.wings.set(carrier, wing);
  }

  /** The ship's air wing with aviation modifiers (extra planes, faster re-arming) applied. */
  static wingFor(data: IShipData, mods: IShipModifiers = NO_MODIFIERS): IAirWingState | null {
    return data.airWing ? createAirWing(applyToAirWing(data.airWing, mods), Math.round(REARM_MS * mods.rearmMul)) : null;
  }

  wing(carrier: BaseShip): IAirWingState | undefined {
    return this.wings.get(carrier);
  }

  /** Aircraft lost by every wing of this side so far. */
  totalLost(): number {
    let n = 0;
    for (const w of this.wings.values()) n += w.lost;
    return n;
  }

  hasCarrier(carrier: BaseShip): boolean {
    return this.wings.has(carrier);
  }

  /** Bombers of `carrier` currently in the air. */
  strikeAloft(carrier: BaseShip): boolean {
    return this.squadrons.some((s) => s.alive && s.carrier === carrier && s.type !== AircraftType.Fighter);
  }

  /** Sends every ready bomber squadron of `carrier` at `target`. Returns how many squadrons left. */
  launchStrike(carrier: BaseShip, target: BaseShip): number {
    let launched = 0;
    for (const type of [AircraftType.DiveBomber, AircraftType.TorpedoBomber] as CarrierAircraft[]) {
      const sq = this.launchSquadron(carrier, type);
      if (sq) {
        sq.target = target;
        launched++;
      }
    }
    return launched;
  }

  /**
   * Per-frame update. `autoStrike` lists carriers that pick and launch strikes themselves;
   * `pickTarget` chooses their target from the visible foes.
   */
  update(time: number, delta: number, ctx: IAirContext, autoStrike: (carrier: BaseShip) => boolean, pickTarget: (carrier: BaseShip, foes: IShipView[]) => IShipView | null): void {
    const dtSec = delta / 1000;
    for (const [carrier, wing] of this.wings) {
      if (!carrier.isAlive) continue;
      this.wings.set(carrier, tickAirWing(wing, time));
      this.keepCap(carrier, time);
      if (autoStrike(carrier) && !this.strikeAloft(carrier)) {
        const target = pickTarget(carrier, this.strikeTargets(carrier, ctx.foes));
        if (target) this.launchStrike(carrier, target.ship);
      }
    }

    for (const sq of this.squadrons) {
      if (!sq.alive) continue;
      this.attrition(sq, ctx, dtSec);
      if (!sq.alive) continue;
      this.fly(sq, ctx, time, dtSec);
    }
    this.cleanup();
  }

  /** Visible surface foes within strike range of `carrier`. */
  strikeTargets(carrier: BaseShip, foes: IShipView[]): IShipView[] {
    return foes.filter(
      (f) => f.alive && f.detected && !f.submerged && Phaser.Math.Distance.Between(carrier.x, carrier.y, f.x, f.y) <= STRIKE_RANGE,
    );
  }

  private keepCap(carrier: BaseShip, time: number): void {
    const capUp = this.squadrons.some((s) => s.alive && s.carrier === carrier && s.type === AircraftType.Fighter);
    if (capUp) return;
    const sq = this.launchSquadron(carrier, AircraftType.Fighter);
    if (sq) sq.returnAt = time + CAP_ENDURANCE_MS;
  }

  private launchSquadron(carrier: BaseShip, type: CarrierAircraft): Squadron | null {
    const wing = this.wings.get(carrier);
    if (!wing) return null;
    const { state, count } = launch(wing, type);
    if (count === 0) return null;
    this.wings.set(carrier, state);
    const sq = new Squadron(this.scene, carrier.x, carrier.y, type, carrier, count, this.enemySide);
    this.squadrons.push(sq);
    this.onLaunch(carrier.x, carrier.y);
    return sq;
  }

  /** AA losses, plus fighters' dogfights with enemy planes nearby (both sides take losses). */
  private attrition(sq: Squadron, ctx: IAirContext, dtSec: number): void {
    const aa = aaFire(sq.x, sq.y, ctx.foeGuns);
    let r = applyAttrition(sq.planes, sq.damage, aa, dtSec);
    sq.planes = r.planes;
    sq.damage = r.damage;

    if (sq.type === AircraftType.Fighter && sq.planes > 0) {
      for (const enemy of ctx.foeSquadrons) {
        if (!enemy.alive || Phaser.Math.Distance.Between(sq.x, sq.y, enemy.x, enemy.y) > DOGFIGHT_RANGE) continue;
        const theirLoss = applyAttrition(enemy.planes, enemy.damage, sq.planes * dogfightRate(sq.type, enemy.type), dtSec);
        r = applyAttrition(sq.planes, sq.damage, enemy.planes * dogfightRate(enemy.type, sq.type), dtSec);
        enemy.planes = theirLoss.planes;
        enemy.damage = theirLoss.damage;
        enemy.syncIcons();
        sq.planes = r.planes;
        sq.damage = r.damage;
      }
    }
    sq.syncIcons();
  }

  private fly(sq: Squadron, ctx: IAirContext, time: number, dtSec: number): void {
    const carrier = sq.carrier;
    if (sq.state === SquadronState.Return) {
      if (!carrier.isAlive) {
        sq.planes = 0;
        return;
      }
      if (sq.flyTo(carrier.x, carrier.y, dtSec) <= LANDING_DIST) {
        const wing = this.wings.get(carrier);
        if (wing) this.wings.set(carrier, land(wing, sq.type, sq.launched, sq.planes, time));
        sq.setActive(false);
      }
      return;
    }

    if (sq.type === AircraftType.Fighter) {
      this.flyCap(sq, ctx, time, dtSec);
      return;
    }

    const target = this.validTarget(sq, ctx);
    if (!target) {
      sq.state = SquadronState.Return;
      return;
    }
    sq.target = target.ship;
    if (sq.type === AircraftType.DiveBomber) {
      if (sq.flyTo(target.x, target.y, dtSec) <= DIVE_RELEASE_DIST) this.dropBombs(sq, target.ship);
      return;
    }
    // Torpedo bombers release short of the target, leading it.
    const d = Phaser.Math.Distance.Between(sq.x, sq.y, target.x, target.y);
    if (d > TORPEDO_RELEASE_DIST) {
      sq.flyTo(target.x, target.y, dtSec);
      return;
    }
    const vel = (target.ship.body as Phaser.Physics.Arcade.Body | null)?.velocity;
    const aim = interceptAngle(sq.x, sq.y, target.x, target.y, vel?.x ?? 0, vel?.y ?? 0, this.aerialTorpedo.projectileSpeed);
    for (let i = 0; i < sq.planes; i++) {
      // Each pilot's drop is a little off as well as spread across the formation.
      const offset = (i - (sq.planes - 1) / 2) * AERIAL_TORPEDO_SPREAD + (Math.random() * 2 - 1) * AERIAL_TORPEDO_ERROR;
      this.weapons.launchProjectile(sq.x, sq.y, aim + offset, airPowered(this.aerialTorpedo, carrier));
    }
    sq.state = SquadronState.Return;
  }

  /** Current target if still a valid strike target, otherwise the nearest visible surface foe. */
  private validTarget(sq: Squadron, ctx: IAirContext): IShipView | null {
    const visible = ctx.foes.filter((f) => f.alive && f.detected && !f.submerged);
    const current = visible.find((f) => f.ship === sq.target);
    if (current) return current;
    let best: IShipView | null = null;
    let bestD = STRIKE_RANGE;
    for (const f of visible) {
      const d = Phaser.Math.Distance.Between(sq.x, sq.y, f.x, f.y);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  private dropBombs(sq: Squadron, target: BaseShip): void {
    const hits = bombHits(sq.planes, BOMB_HIT_CHANCE);
    const bomb = airPowered(this.bomb, sq.carrier);
    for (let i = 0; i < hits && target.isAlive; i++) {
      const dmg = CombatSystem.calculateDamage(bomb, target.stats.shipClass, target.stats.armor);
      CombatSystem.applyDamage(target, dmg);
      this.onBombHit(target, this.bomb, dmg);
    }
    sq.state = SquadronState.Return;
  }

  private flyCap(sq: Squadron, ctx: IAirContext, time: number, dtSec: number): void {
    const carrier = sq.carrier;
    if (time >= sq.returnAt || !carrier.isAlive) {
      sq.state = SquadronState.Return;
      return;
    }
    // Intercept the nearest raid approaching the carrier.
    let raid: Squadron | null = null;
    let best = CAP_ALERT_RADIUS;
    for (const e of ctx.foeSquadrons) {
      if (!e.alive) continue;
      const d = Phaser.Math.Distance.Between(carrier.x, carrier.y, e.x, e.y);
      if (d < best) {
        best = d;
        raid = e;
      }
    }
    if (raid) {
      sq.state = SquadronState.Intercept;
      sq.flyTo(raid.x, raid.y, dtSec);
      return;
    }
    sq.state = SquadronState.Patrol;
    sq.orbit += (sq.speed / CAP_RADIUS) * dtSec * 0.5;
    sq.flyTo(carrier.x + Math.cos(sq.orbit) * CAP_RADIUS, carrier.y + Math.sin(sq.orbit) * CAP_RADIUS, dtSec);
  }

  /** Removes landed and destroyed squadrons; shot-down ones are written off from their wing. */
  private cleanup(): void {
    for (let i = this.squadrons.length - 1; i >= 0; i--) {
      const sq = this.squadrons[i];
      if (sq.active && sq.planes > 0) continue;
      if (sq.active && sq.planes <= 0) {
        const wing = this.wings.get(sq.carrier);
        if (wing) this.wings.set(sq.carrier, lose(wing, sq.type, sq.launched));
      }
      sq.destroy();
      this.squadrons.splice(i, 1);
    }
  }
}

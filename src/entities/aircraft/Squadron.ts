import Phaser from 'phaser';
import { DEPTH_EFFECTS } from '@/config/GameConstants';
import { AircraftType, CarrierAircraft } from '@/types/Aircraft';
import { BASE_PERF, IAircraftPerf } from '@/systems/AircraftSystem';
import { BaseShip } from '@/entities/ships/BaseShip';

export enum SquadronState {
  /** Fighters circling over their carrier */
  Patrol = 'Patrol',
  /** Fighters chasing an enemy squadron */
  Intercept = 'Intercept',
  /** Bombers flying to their target */
  Outbound = 'Outbound',
  /** Heading home to land */
  Return = 'Return',
}

export const PLANE_SPEED: Record<CarrierAircraft, number> = {
  [AircraftType.Fighter]: 320,
  [AircraftType.DiveBomber]: 250,
  [AircraftType.TorpedoBomber]: 230,
};

const TEXTURE: Record<CarrierAircraft, string> = {
  [AircraftType.Fighter]: 'plane-fighter',
  [AircraftType.DiveBomber]: 'plane-dive',
  [AircraftType.TorpedoBomber]: 'plane-torpedo',
};

/** V-formation slots (px, in the squadron's heading frame: x forward, y right). */
const SLOTS: Array<[number, number]> = [[0, 0], [-9, -9], [-9, 9], [-18, -18], [-18, 18], [-27, 0]];

/**
 * A group of carrier aircraft flying together. Movement and combat are driven by AirOpsSystem;
 * this class only holds the squadron's state and draws its planes in a V.
 */
export class Squadron extends Phaser.GameObjects.Container {
  state: SquadronState;
  /** Planes still flying */
  planes: number;
  /** Fractional damage carried towards the next plane lost */
  damage = 0;
  target: BaseShip | Squadron | null = null;
  /** Fighters return to re-arm after this time */
  returnAt = Infinity;
  /** Patrol orbit position (radians) */
  orbit = Math.random() * Math.PI * 2;
  /** The model flown (#87) */
  perf: IAircraftPerf = BASE_PERF;
  /** The pilots' edge (#87): dogfights and aim */
  pilot = 1;
  private icons: Phaser.GameObjects.Image[] = [];

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly type: CarrierAircraft,
    readonly carrier: BaseShip,
    readonly launched: number,
    readonly enemySide: boolean,
  ) {
    super(scene, x, y);
    this.planes = launched;
    this.state = type === AircraftType.Fighter ? SquadronState.Patrol : SquadronState.Outbound;
    for (let i = 0; i < launched; i++) {
      const [fx, fy] = SLOTS[i % SLOTS.length];
      const icon = scene.add.image(fx, fy, TEXTURE[type]);
      if (enemySide) icon.setTint(0xff7070);
      this.icons.push(icon);
    }
    this.add(this.icons);
    this.setDepth(DEPTH_EFFECTS - 2);
    scene.add.existing(this);
  }

  get speed(): number {
    return PLANE_SPEED[this.type] * this.perf.speed;
  }

  get alive(): boolean {
    return this.active && this.planes > 0;
  }

  /** Flies towards (x, y) for `dtSec`; returns the remaining distance. */
  flyTo(x: number, y: number, dtSec: number): number {
    const dx = x - this.x;
    const dy = y - this.y;
    const d = Math.hypot(dx, dy);
    const step = Math.min(d, this.speed * dtSec);
    if (d > 0) {
      this.x += (dx / d) * step;
      this.y += (dy / d) * step;
      this.setRotation(Math.atan2(dy, dx));
    }
    return d - step;
  }

  /** Hides icons for planes that have been shot down. */
  syncIcons(): void {
    this.icons.forEach((icon, i) => icon.setVisible(i < this.planes));
  }
}

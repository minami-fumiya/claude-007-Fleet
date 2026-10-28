import { ShipClass } from '@/types/ShipClass';

/** Pure helpers for the audio system: throttling, the cap on sounds at once, distance falloff and sinking sizes. */

export type SoundKind =
  | 'gun' | 'bigGun' | 'explosion' | 'splash' | 'torpedo' | 'depthCharge' | 'plane' | 'ui'
  // 0.0.49 (#104): sinkings by size and our own, hits, warnings, aviation, submarines, jingles and notices
  | 'sinkLarge' | 'sinkMedium' | 'sinkSmall' | 'ownSink'
  | 'hit' | 'ricochet' | 'nearMiss' | 'alarm' | 'torpedoHit' | 'torpedoLaunch'
  | 'aaFire' | 'planeDown' | 'launch' | 'bombDrop'
  | 'dive' | 'surface' | 'sonar'
  | 'victory' | 'defeat' | 'notify' | 'uiBack';

/** Minimum gap between two sounds of the same kind, so salvos don't stack into noise. */
const MIN_GAP_MS: Record<SoundKind, number> = {
  gun: 70,
  bigGun: 110,
  explosion: 90,
  splash: 60,
  torpedo: 200,
  depthCharge: 250,
  plane: 600,
  ui: 40,
  sinkLarge: 400,
  sinkMedium: 300,
  sinkSmall: 200,
  ownSink: 400,
  hit: 80,
  ricochet: 120,
  nearMiss: 150,
  alarm: 3000,
  torpedoHit: 150,
  torpedoLaunch: 300,
  aaFire: 250,
  planeDown: 200,
  launch: 500,
  bombDrop: 150,
  dive: 400,
  surface: 400,
  sonar: 1500,
  victory: 2000,
  defeat: 2000,
  notify: 300,
  uiBack: 40,
};

/** How long each sound lasts (ms), for the cap on sounds at once. */
export const SOUND_MS: Record<SoundKind, number> = {
  gun: 220, bigGun: 500, explosion: 900, splash: 300, torpedo: 250, depthCharge: 900, plane: 1400, ui: 60,
  sinkLarge: 3200, sinkMedium: 2000, sinkSmall: 1100, ownSink: 2600,
  hit: 250, ricochet: 300, nearMiss: 500, alarm: 1200, torpedoHit: 1200, torpedoLaunch: 400,
  aaFire: 500, planeDown: 700, launch: 900, bombDrop: 500,
  dive: 900, surface: 900, sonar: 1200,
  victory: 1800, defeat: 1800, notify: 400, uiBack: 60,
};

/** At most this many sounds at once (#104): ten ships a side would otherwise stack dozens of salvos. */
export const MAX_SOUNDS = 14;
/** Sounds that always play, cap or not: they tell the player something happened. */
const ALWAYS: ReadonlySet<SoundKind> = new Set<SoundKind>(['sinkLarge', 'sinkMedium', 'sinkSmall', 'ownSink', 'alarm', 'victory', 'defeat', 'notify', 'ui', 'uiBack']);

export class SoundThrottle {
  private last = new Map<SoundKind, number>();
  /** End times of the sounds playing */
  private playing: number[] = [];

  /** True (and records the play) if `kind` may sound at `now`. */
  tryPlay(kind: SoundKind, now: number): boolean {
    const prev = this.last.get(kind);
    if (prev !== undefined && now - prev < MIN_GAP_MS[kind]) return false;
    this.playing = this.playing.filter((end) => end > now);
    if (this.playing.length >= MAX_SOUNDS && !ALWAYS.has(kind)) return false;
    this.last.set(kind, now);
    this.playing.push(now + SOUND_MS[kind]);
    return true;
  }

  /** Sounds playing at `now` (for tests). */
  active(now: number): number {
    return this.playing.filter((end) => end > now).length;
  }
}

/** Sounds fade with distance from the listener and are silent beyond `maxDistance`. */
export function distanceGain(distance: number, maxDistance = 1500): number {
  if (distance <= 0) return 1;
  if (distance >= maxDistance) return 0;
  const t = 1 - distance / maxDistance;
  return t * t;
}

export type ShipSize = 'large' | 'medium' | 'small';

/** 大型 (battleships, carriers) / 中型 (cruisers) / 小型 (destroyers, submarines) for the sinking sound and shake (#104 #107). */
export function shipSize(shipClass: ShipClass): ShipSize {
  if (shipClass === ShipClass.Battleship || shipClass === ShipClass.Carrier) return 'large';
  if (shipClass === ShipClass.Cruiser) return 'medium';
  return 'small';
}

/** The sound of a ship going down: ours apart, the enemy's by size. */
export function sinkSound(shipClass: ShipClass, own: boolean): SoundKind {
  if (own) return 'ownSink';
  return ({ large: 'sinkLarge', medium: 'sinkMedium', small: 'sinkSmall' } as const)[shipSize(shipClass)];
}

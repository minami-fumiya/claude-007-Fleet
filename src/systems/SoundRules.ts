/** Pure helpers for the audio system: throttling and distance falloff. */

export type SoundKind = 'gun' | 'bigGun' | 'explosion' | 'splash' | 'torpedo' | 'depthCharge' | 'plane' | 'ui';

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
};

export class SoundThrottle {
  private last = new Map<SoundKind, number>();

  /** True (and records the play) if `kind` may sound at `now`. */
  tryPlay(kind: SoundKind, now: number): boolean {
    const prev = this.last.get(kind);
    if (prev !== undefined && now - prev < MIN_GAP_MS[kind]) return false;
    this.last.set(kind, now);
    return true;
  }
}

/** Sounds fade with distance from the listener and are silent beyond `maxDistance`. */
export function distanceGain(distance: number, maxDistance = 1500): number {
  if (distance <= 0) return 1;
  if (distance >= maxDistance) return 0;
  const t = 1 - distance / maxDistance;
  return t * t;
}

export function angleBetween(x1: number, y1: number, x2: number, y2: number): number {
  return Math.atan2(y2 - y1, x2 - x1);
}

export function distanceBetween(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface IStickVector {
  /** Normalised x in [-1, 1] */
  x: number;
  /** Normalised y in [-1, 1] */
  y: number;
  /** Magnitude in [0, 1] (0 inside the dead zone) */
  magnitude: number;
}

/**
 * Converts a raw thumb offset from the stick centre into a normalised vector.
 * Offsets beyond `radius` are clamped; offsets inside `deadZone` (fraction of radius) yield zero.
 */
export function stickVector(dx: number, dy: number, radius: number, deadZone = 0.15): IStickVector {
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (radius <= 0 || dist === 0) return { x: 0, y: 0, magnitude: 0 };
  const raw = Math.min(dist, radius) / radius;
  if (raw < deadZone) return { x: 0, y: 0, magnitude: 0 };
  const magnitude = (raw - deadZone) / (1 - deadZone);
  return { x: (dx / dist) * magnitude, y: (dy / dist) * magnitude, magnitude };
}

/** Wraps an angle in degrees to the range (-180, 180]. */
export function wrapDegrees(deg: number): number {
  const w = ((deg % 360) + 360) % 360;
  return w > 180 ? w - 360 : w;
}

/** Rotates `currentDeg` toward `targetDeg` along the shortest arc by at most `maxStep` degrees. */
export function rotateTowardsDegrees(currentDeg: number, targetDeg: number, maxStep: number): number {
  const diff = wrapDegrees(targetDeg - currentDeg);
  if (Math.abs(diff) <= maxStep) return currentDeg + diff;
  return currentDeg + Math.sign(diff) * maxStep;
}

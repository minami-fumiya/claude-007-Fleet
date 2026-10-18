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

export interface IRectArea {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * For a point outside `rect`, where the line from the rect's centre to that point crosses the rect's
 * edge, plus the direction (radians) towards the point. Null when the point is inside the rect.
 * Used to pin off-screen enemy markers to the screen border.
 */
export function edgePoint(px: number, py: number, rect: IRectArea): { x: number; y: number; angle: number } | null {
  if (px >= rect.left && px <= rect.right && py >= rect.top && py <= rect.bottom) return null;
  const cx = (rect.left + rect.right) / 2;
  const cy = (rect.top + rect.bottom) / 2;
  const dx = px - cx;
  const dy = py - cy;
  const halfW = (rect.right - rect.left) / 2;
  const halfH = (rect.bottom - rect.top) / 2;
  // Scale the direction so it just reaches whichever edge it hits first.
  const t = Math.min(dx === 0 ? Infinity : halfW / Math.abs(dx), dy === 0 ? Infinity : halfH / Math.abs(dy));
  return { x: cx + dx * t, y: cy + dy * t, angle: Math.atan2(dy, dx) };
}

/**
 * Angle (radians) to fire a projectile of `speed` from (sx, sy) so it meets a target at (tx, ty)
 * moving with velocity (vx, vy). Falls back to aiming straight at the target when it cannot be
 * caught (target faster than the projectile) or the projectile speed is not positive.
 */
export function interceptAngle(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  vx: number,
  vy: number,
  speed: number,
): number {
  const dx = tx - sx;
  const dy = ty - sy;
  const direct = Math.atan2(dy, dx);
  if (speed <= 0) return direct;
  // Solve |d + v t| = speed t for the smallest positive t.
  const a = vx * vx + vy * vy - speed * speed;
  const b = 2 * (dx * vx + dy * vy);
  const c = dx * dx + dy * dy;
  let t: number;
  if (Math.abs(a) < 1e-9) {
    if (Math.abs(b) < 1e-9) return direct;
    t = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return direct;
    const root = Math.sqrt(disc);
    const t1 = (-b - root) / (2 * a);
    const t2 = (-b + root) / (2 * a);
    t = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
  }
  if (!(t > 0)) return direct;
  return Math.atan2(dy + vy * t, dx + vx * t);
}

/**
 * Pure helpers behind the scrolling lists (src/ui/components/ScrollList.ts): offsets, inertia
 * and the scrollbar thumb. Kept free of Phaser so they can be unit tested.
 *
 * An "offset" is how far the content has scrolled up, in px: 0 shows the top of the content,
 * `maxScroll()` shows its bottom.
 */

/** A pointer that moves further than this between press and release scrolls instead of tapping. */
export const TAP_THRESHOLD = 12;
/** Inertia: velocity kept per 16.7 ms frame (0.95 → glides for about a second). */
export const FRICTION_PER_FRAME = 0.95;
/** Inertia stops below this speed, px/ms. */
export const MIN_VELOCITY = 0.02;
/** Fastest fling, px/ms, so a jittery sample can't throw the list to the end. */
export const MAX_VELOCITY = 4;
/** Only pointer samples this recent count towards the release velocity, ms. */
export const VELOCITY_WINDOW_MS = 100;

export interface IPointerSample {
  /** Time stamp, ms */
  t: number;
  /** Pointer y on screen, px */
  y: number;
}

export interface IInertiaStep {
  offset: number;
  /** Scroll speed, px/ms (positive = content moves up / offset grows) */
  velocity: number;
  /** True once the glide has stopped (too slow, or hit an end) */
  done: boolean;
}

export interface IThumb {
  /** Top of the thumb, relative to the top of the track */
  y: number;
  h: number;
}

export function maxScroll(contentH: number, viewH: number): number {
  return Math.max(0, contentH - viewH);
}

export function clampScroll(offset: number, contentH: number, viewH: number): number {
  return Math.min(maxScroll(contentH, viewH), Math.max(0, offset));
}

export function canScroll(contentH: number, viewH: number): boolean {
  return maxScroll(contentH, viewH) > 0;
}

/** True once a press has moved far enough to count as a scroll drag rather than a tap. */
export function isDrag(dx: number, dy: number, threshold: number = TAP_THRESHOLD): boolean {
  return Math.hypot(dx, dy) >= threshold;
}

/**
 * Release velocity of a drag in offset px/ms: dragging the finger up (y falling) scrolls the
 * content up, so the sign is flipped. Uses the samples from the last `VELOCITY_WINDOW_MS`.
 */
export function releaseVelocity(samples: readonly IPointerSample[], now: number): number {
  const recent = samples.filter((s) => now - s.t <= VELOCITY_WINDOW_MS);
  if (recent.length < 2) return 0;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const dt = last.t - first.t;
  if (dt <= 0) return 0;
  const v = -(last.y - first.y) / dt;
  return Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, v));
}

/** Advances an inertia glide by `dtMs`, slowing with friction and stopping at either end. */
export function stepInertia(
  offset: number,
  velocity: number,
  dtMs: number,
  contentH: number,
  viewH: number,
  frictionPerFrame: number = FRICTION_PER_FRAME,
): IInertiaStep {
  const next = clampScroll(offset + velocity * dtMs, contentH, viewH);
  const hitEnd = next !== offset + velocity * dtMs;
  const v = velocity * Math.pow(frictionPerFrame, dtMs / (1000 / 60));
  const done = hitEnd || Math.abs(v) < MIN_VELOCITY;
  return { offset: next, velocity: done ? 0 : v, done };
}

/** Scrollbar thumb size and position for a track of `trackH` px. */
export function thumbMetrics(offset: number, contentH: number, viewH: number, trackH: number, minThumb = 24): IThumb {
  const max = maxScroll(contentH, viewH);
  if (max <= 0 || contentH <= 0) return { y: 0, h: trackH };
  const h = Math.min(trackH, Math.max(minThumb, (viewH / contentH) * trackH));
  const y = (clampScroll(offset, contentH, viewH) / max) * (trackH - h);
  return { y, h };
}

/** The smallest change of offset that brings the item at [itemTop, itemTop + itemH) fully into view. */
export function scrollIntoView(offset: number, itemTop: number, itemH: number, contentH: number, viewH: number): number {
  let next = offset;
  if (itemTop < next) next = itemTop;
  else if (itemTop + itemH > next + viewH) next = itemTop + itemH - viewH;
  return clampScroll(next, contentH, viewH);
}

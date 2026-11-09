/**
 * 海の上の作戦の枠 (#445, 0.0.70): a campaign objective's ground laid on the world's ocean.
 *
 * A campaign battle is laid out on a 3200 px square with the player coming from the south (the convoy from the
 * west). At sea the fleet comes from wherever it sailed: the square is centred on the area and turned so that its
 * south (or west) faces the fleet. Zones, escape points, minefields and convoy routes keep the battle's own
 * proportions, so time limits and distances weigh as they do on the campaign screen.
 */
import { BATTLE_WORLD } from '@/systems/BattleLayout';

export interface IPoint {
  x: number;
  y: number;
}

export interface ISeaFrame {
  cx: number;
  cy: number;
  size: number;
  cos: number;
  sin: number;
}

/** The side of the battle square the player's fleet comes from. */
export type FrameEntry = 'south' | 'west';

/** The square on the area centre, turned so that `entry` faces the fleet at `from`. */
export function seaFrame(centre: IPoint, from: IPoint, entry: FrameEntry = 'south', size = BATTLE_WORLD.w): ISeaFrame {
  const approach = Math.atan2(from.y - centre.y, from.x - centre.x);
  // The battle square's own direction of that side: south is +y, west is -x.
  const base = entry === 'south' ? Math.PI / 2 : Math.PI;
  const turn = Number.isFinite(approach) && (from.x !== centre.x || from.y !== centre.y) ? approach - base : 0;
  return { cx: centre.x, cy: centre.y, size, cos: Math.cos(turn), sin: Math.sin(turn) };
}

/** A point of the battle square (0..1 each way) on the ocean. */
export function framePoint(f: ISeaFrame, p: IPoint): IPoint {
  const dx = (p.x - 0.5) * f.size;
  const dy = (p.y - 0.5) * f.size;
  return { x: f.cx + dx * f.cos - dy * f.sin, y: f.cy + dx * f.sin + dy * f.cos };
}

/** A radius given as a share of the square. */
export function frameRadius(f: ISeaFrame, r: number): number {
  return r * f.size;
}

/** Whether an ocean point lies in a zone of the square. */
export function inFrameZone(f: ISeaFrame, x: number, y: number, zone: IPoint & { r: number }): boolean {
  const c = framePoint(f, zone);
  return Math.hypot(x - c.x, y - c.y) <= frameRadius(f, zone.r);
}

/** A battle-square point in pixels (0..size) on the ocean: minefields and nets are placed in pixels. */
export function framePixel(f: ISeaFrame, p: IPoint): IPoint {
  return framePoint(f, { x: p.x / f.size, y: p.y / f.size });
}

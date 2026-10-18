import { IResolvedMap } from '@/types/Map';
import { onIsland } from './MapSystem';

/**
 * Battle world geometry (pure): the size of the sea and where fleets start. The world is the same
 * square in both orientations; the camera shows a screen-sized part of it and follows the flagship.
 */

export interface IPoint {
  x: number;
  y: number;
}

export interface IWorldSize {
  w: number;
  h: number;
}

export const BATTLE_WORLD: IWorldSize = { w: 3200, h: 3200 };

/** Most ships a side can field in one battle. */
export const MAX_FLEET_SIZE = 8;

/**
 * Fleets start this far apart (flagship to enemy line, px) instead of at the map edges, so the first
 * contact comes after ~15 s of sailing; the rest of the sea is room to manoeuvre.
 */
export const START_GAP = 1300;

/** Gap between neighbouring enemy ships at the start (px): wider than any hull, so they never overlap. */
export const ENEMY_SPACING = 200;
/** Each step out from the middle of the enemy line also starts this much farther back (a shallow wedge). */
const ENEMY_WEDGE_STEP = 40;

/** Convoy route: merchant ships start on the west edge, in the middle of the sea. */
export const CONVOY_START_X = 140;

export function playerStart(world: IWorldSize = BATTLE_WORLD): IPoint {
  return { x: world.w / 2, y: world.h / 2 + START_GAP / 2 };
}

/** Escort fleet beside the convoy on the west edge. */
export function convoyEscortStart(world: IWorldSize = BATTLE_WORLD): IPoint {
  return { x: CONVOY_START_X + 160, y: world.h / 2 + 260 };
}

/** Lateral slot of the i-th enemy: the flagship in the middle, then alternately left and right. */
export function lineSlot(i: number): number {
  if (i === 0) return 0;
  const step = Math.ceil(i / 2);
  return i % 2 === 1 ? -step : step;
}

/**
 * Start points of an enemy fleet of `count` ships (flagship first): a line abreast across the
 * north of the start gap, the flagship in the middle and the wings slightly back.
 */
export function enemySpawnPoints(count: number, world: IWorldSize = BATTLE_WORLD): IPoint[] {
  const cx = world.w / 2;
  const cy = world.h / 2 - START_GAP / 2;
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const slot = lineSlot(i);
    return { x: cx + slot * ENEMY_SPACING, y: cy - Math.abs(slot) * ENEMY_WEDGE_STEP };
  });
}

/** North / south shifts (px) tried, nearest first, to move a whole start line off an island. */
const LINE_SHIFTS = [0, -150, 150, -300, 300, -450, 450, -600, 600];

/**
 * Moves a fleet's start points north or south together until every one is clear of land (or, if no
 * shift clears them all, the shift that leaves the fewest on land; `clearSpawn` nudges the rest).
 */
export function lineAtSea(map: IResolvedMap, points: IPoint[], margin = 60): IPoint[] {
  let best = points;
  let bestWet = -1;
  for (const dy of LINE_SHIFTS) {
    const moved = points.map((p) => ({ x: p.x, y: p.y + dy }));
    const wet = moved.filter((p) => !onIsland(map, p.x, p.y, margin)).length;
    if (wet === points.length) return moved;
    if (wet > bestWet) {
      best = moved;
      bestWet = wet;
    }
  }
  return best;
}

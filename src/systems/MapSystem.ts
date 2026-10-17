import { IMapData, IResolvedMap } from '@/types/Map';

/** Battle map geometry (pure): islands, shoals and currents, plus steering around islands. */

/** Ships in shoal water are slowed to this fraction. */
export const SHOAL_SPEED = 0.5;
/** How far ahead (px) AI helms look for land. */
export const AVOID_LOOKAHEAD = 170;
/** Heading offsets tried (degrees, nearest first) when the way ahead is blocked. */
const AVOID_OFFSETS = [30, -30, 60, -60, 90, -90, 125, -125, 160, -160];

export function resolveMap(map: IMapData, worldW: number, worldH: number): IResolvedMap {
  const unit = Math.min(worldW, worldH);
  const circle = (c: { x: number; y: number; r: number }): { x: number; y: number; r: number } => ({
    x: c.x * worldW,
    y: c.y * worldH,
    r: c.r * unit,
  });
  return {
    islands: map.islands.map((island) => island.map(circle)),
    shoals: map.shoals.map(circle),
    currents: map.currents.map((z) => ({ x: z.x * worldW, y: z.y * worldH, w: z.w * worldW, h: z.h * worldH, vx: z.vx, vy: z.vy })),
  };
}

export function currentAt(map: IResolvedMap, x: number, y: number): { vx: number; vy: number } {
  let vx = 0;
  let vy = 0;
  for (const z of map.currents) {
    if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) {
      vx += z.vx;
      vy += z.vy;
    }
  }
  return { vx, vy };
}

export function inShoal(map: IResolvedMap, x: number, y: number): boolean {
  return map.shoals.some((c) => Math.hypot(x - c.x, y - c.y) <= c.r);
}

/** Is (x, y) on land, or within `margin` px of it? */
export function onIsland(map: IResolvedMap, x: number, y: number, margin = 0): boolean {
  return map.islands.some((island) => island.some((c) => Math.hypot(x - c.x, y - c.y) <= c.r + margin));
}

/** Is the straight line from (x, y) along `headingDeg` (0 = north) clear of land for `distance` px? */
export function clearAhead(map: IResolvedMap, x: number, y: number, headingDeg: number, distance: number, margin = 24): boolean {
  const rad = ((headingDeg - 90) * Math.PI) / 180;
  const steps = 4;
  for (let i = 1; i <= steps; i++) {
    const d = (distance * i) / steps;
    if (onIsland(map, x + Math.cos(rad) * d, y + Math.sin(rad) * d, margin)) return false;
  }
  return true;
}

/** The wanted heading if it's clear, otherwise the nearest clear alternative (or the wanted one if boxed in). */
export function avoidHeading(map: IResolvedMap, x: number, y: number, headingDeg: number, lookahead = AVOID_LOOKAHEAD): number {
  if (map.islands.length === 0 || clearAhead(map, x, y, headingDeg, lookahead)) return headingDeg;
  for (const off of AVOID_OFFSETS) {
    if (clearAhead(map, x, y, headingDeg + off, lookahead)) return headingDeg + off;
  }
  return headingDeg;
}

/** Moves a spawn point out of any island (searching outward in a spiral). */
export function clearSpawn(map: IResolvedMap, x: number, y: number, margin = 60): { x: number; y: number } {
  if (!onIsland(map, x, y, margin)) return { x, y };
  for (let ring = 1; ring <= 12; ring++) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const px = x + Math.cos(a) * ring * 40;
      const py = y + Math.sin(a) * ring * 40;
      if (!onIsland(map, px, py, margin)) return { x: px, y: py };
    }
  }
  return { x, y };
}

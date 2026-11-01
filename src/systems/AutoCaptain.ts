/**
 * AUTO の旗艦 (#400, pure). The flagship under AUTO used to steam for the middle of the sea at 70% whenever nothing
 * was in sight, so in fog it ran alone into the enemy's guns and torpedoes (米国の北極海 4: sunk in 20-40 s). Now it
 * searches slowly towards where the enemy was last seen, holds back once it is badly hurt, and fights from further
 * off when its hull is past half.
 */

/** Fraction of the main gun's range AUTO fights from while the hull is sound. */
export const AUTO_RANGE_FRACTION = 0.75;
/** …and once it is below half: near the edge of its own reach. */
export const AUTO_HURT_RANGE_FRACTION = 0.95;
/** Below this share of its hull the flagship stops searching and fights from further off. */
export const AUTO_HURT_HP = 0.5;
/** Throttle while searching with nothing in sight, slow enough for the escorts to keep their places ahead. */
export const AUTO_SEARCH_THROTTLE = 0.45;

/** The range AUTO keeps from its target. */
export function autoEngageRange(weaponRange: number, hpFrac: number, carrierStandoff?: number): number {
  if (carrierStandoff !== undefined) return carrierStandoff;
  return weaponRange * (hpFrac < AUTO_HURT_HP ? AUTO_HURT_RANGE_FRACTION : AUTO_RANGE_FRACTION);
}

/**
 * Where AUTO searches with nothing in sight: the last place an enemy was seen (the nearest one), else the middle of
 * the sea; null once the flagship is badly hurt (it holds where it is and lets the enemy come to its guns).
 */
export function autoSearchGoal(
  at: { x: number; y: number },
  lastSeen: readonly { x: number; y: number }[],
  centre: { x: number; y: number },
  hpFrac: number,
): { x: number; y: number } | null {
  if (hpFrac < AUTO_HURT_HP) return null;
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const p of lastSeen) {
    const d = Math.hypot(p.x - at.x, p.y - at.y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best ?? centre;
}

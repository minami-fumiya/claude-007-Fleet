import { Formation } from '@/types/Formation';
import { Nation } from '@/types/Nation';
import { ShipClass } from '@/types/ShipClass';

/**
 * 敵の陣形 (#82, pure): the enemy fleet forms up too. Carriers on either side mean a ring (輪形陣); submarines
 * against it a screen of hunters (梯形陣, 単横陣 with three or more destroyers); otherwise each navy's own way of
 * fighting a surface action. An area or scenario can name one instead.
 */

const SURFACE: Record<Nation, Formation> = {
  [Nation.IJN]: Formation.LineAhead,
  [Nation.USN]: Formation.DoubleLine,
  [Nation.KM]: Formation.LineAhead,
  [Nation.RN]: Formation.LineAhead,
  [Nation.FR]: Formation.DoubleLine,
  [Nation.RM]: Formation.DoubleLine,
  [Nation.SU]: Formation.DoubleLine,
};

export function enemyFormation(opts: { nation: Nation; enemy: ShipClass[]; player: ShipClass[]; night: boolean; named?: Formation }): Formation {
  if (opts.named) return opts.named;
  if (opts.enemy.length <= 1) return Formation.LineAhead;
  if (opts.enemy.includes(ShipClass.Carrier) || opts.player.includes(ShipClass.Carrier)) return Formation.Circle;
  if (opts.player.includes(ShipClass.Submarine)) {
    return opts.enemy.filter((c) => c === ShipClass.Destroyer).length >= 3 ? Formation.LineAbreast : Formation.Echelon;
  }
  // Japanese night actions lead with a destroyer screen (警戒陣).
  if (opts.nation === Nation.IJN && opts.night) return Formation.Vanguard;
  return SURFACE[opts.nation] ?? Formation.LineAhead;
}

/** Engagement range at which the escorts leave their places and fight on their own (散開). */
export const BREAK_FORMATION_RANGE = 900;

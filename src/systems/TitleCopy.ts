import { Objective } from '@/types/Campaign';
import { FORMATION_ORDER, FORMATION_RULES } from './FormationRules';

/**
 * The title screen's info tiles (#197, pure). Counts come from the game's own lists, so adding a formation or an
 * objective keeps the copy true (it once read "ほか 6 種" for six formations in all, and "敵艦隊をすべて撃沈"
 * long after other objectives existed).
 */
export interface ITitleTile { title: string; body: string }

export function titleTiles(portrait: boolean): ITitleTile[] {
  const [first, second] = FORMATION_ORDER.map((f) => FORMATION_RULES[f].ja);
  return [
    // Portrait means a phone, so the copy describes that device's controls.
    portrait ? { title: '◎ 自動砲撃', body: '射程内の敵へ自動で撃つ' } : { title: '◎ 砲撃', body: '狙った地点へ主砲を放つ' },
    { title: '⚓ 陣形', body: `${first}・${second}など全 ${FORMATION_ORDER.length} 種` },
    { title: '★ 作戦目的', body: `殲滅・護衛・突入など ${Object.values(Objective).length} 種` },
  ];
}

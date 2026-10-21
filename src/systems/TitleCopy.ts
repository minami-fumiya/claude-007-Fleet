import { Objective } from '@/types/Campaign';
import { FORMATION_ORDER, FORMATION_RULES } from './FormationRules';

/**
 * The title screen's info tiles (#197, pure). Counts come from the game's own lists, so adding a formation or an
 * objective keeps the copy true (it once read "ほか 6 種" for six formations in all, and "敵艦隊をすべて撃沈"
 * long after other objectives existed).
 */
export interface ITitleTile { title: string; body: string }

export function titleTiles(portrait: boolean, seas?: { won: number; total: number }): ITitleTile[] {
  const [first, second] = FORMATION_ORDER.map((f) => FORMATION_RULES[f].ja);
  return [
    // Portrait means a phone, so the copy describes that device's controls.
    portrait ? { title: '◎ 自動砲撃', body: '射程内の敵へ自動で撃つ' } : { title: '◎ 砲撃', body: '狙った地点へ主砲を放つ' },
    { title: '⚓ 陣形', body: `${first}・${second}など全 ${FORMATION_ORDER.length} 種` },
    { title: '★ 作戦目的', body: `殲滅・護衛・突入など ${Object.values(Objective).length} 種` },
    // 七つの海 (#250): how far the admiral has come, under the name the title promises.
    ...(seas ? [{ title: '◆ 七つの海', body: `${seas.won} / ${seas.total} を制覇` }] : []),
  ];
}

/** The title's main button (#198): "日本 · 少佐 で続ける" for a save in progress, "はじめる" for a new one (#283). */
export function continueLabel(nation: string | null, rankName: string | null): string {
  return nation && rankName ? `${nation} · ${rankName} で続ける` : 'はじめる  →';
}

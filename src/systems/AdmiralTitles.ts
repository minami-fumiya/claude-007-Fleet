/**
 * 称号 (#92, pure): names an admiral may wear beside the rank. Each comes with a medal; the admiral picks one of
 * those earned in 戦績 → 称号, and it shows on the home screen.
 */
export interface IAdmiralTitle {
  id: string;
  name: string;
  /** The medal that earns the title */
  medal: string;
}

export const TITLES: readonly IAdmiralTitle[] = [
  { id: 't_first', name: '新任提督', medal: 'first_victory' },
  { id: 't_veteran', name: '歴戦の提督', medal: 'veteran_3' },
  { id: 't_victor', name: '常勝提督', medal: 'victor_3' },
  { id: 't_ace', name: '海の武人', medal: 'ace_3' },
  { id: 't_bb', name: '戦艦の天敵', medal: 'battleship_slayer_3' },
  { id: 't_cv', name: '空母狩り', medal: 'carrier_slayer_3' },
  { id: 't_dd', name: '駆逐艦狩り', medal: 'destroyer_slayer_3' },
  { id: 't_sub', name: '潜水艦の天敵', medal: 'sub_hunter_3' },
  { id: 't_night', name: '夜戦の鬼', medal: 'night_fighter_3' },
  { id: 't_s', name: '完勝の名将', medal: 's_rank_3' },
  { id: 't_perfect', name: '不沈の提督', medal: 'perfect_3' },
  { id: 't_formations', name: '陣形の達人', medal: 'formations_2' },
  { id: 't_seas', name: '七つの海の覇者', medal: 'seas' },
  { id: 't_far', name: '遠洋の提督', medal: 'far_seas' },
  { id: 't_convoy', name: '船団の守護者', medal: 'convoy_3' },
  { id: 't_underdog', name: '寡兵の将', medal: 'underdog' },
  { id: 't_overturn', name: '歴史を変えた提督', medal: 'overturn' },
  { id: 't_history', name: '戦史家', medal: 'chronicler' },
  { id: 't_research', name: '技術の提督', medal: 'science_3' },
  { id: 't_mentor', name: '名艦長の師', medal: 'mentor' },
  { id: 't_rich', name: '大富豪', medal: 'treasury_3' },
  { id: 't_fire', name: '火攻めの名人', medal: 'fire_flood_3' },
  { id: 't_aa', name: '対空の要', medal: 'anti_air_3' },
  { id: 't_superweapon', name: '超兵器殺し', medal: 'superweapon_slayer_3' },
  { id: 't_hard', name: '精鋭の提督', medal: 'hard_mode_3' },
  { id: 't_quests', name: '任務の鬼', medal: 'quest_clerk_3' },
  { id: 't_nations', name: '連合の提督', medal: 'nations' },
  { id: 't_base', name: '前線の提督', medal: 'forward_base_3' },
  { id: 't_voyage', name: '大航海者', medal: 'voyage_3' },
  { id: 't_gunnery', name: '砲術の大家', medal: 'gunnery_3' },
  { id: 't_torpedo', name: '水雷の名手', medal: 'torpedo_hits_3' },
  { id: 't_marksman', name: '百発百中', medal: 'marksman_3' },
  { id: 't_multi', name: '一網打尽', medal: 'multi_sink_3' },
  { id: 't_endurance', name: '不眠の提督', medal: 'battle_hours_3' },
  { id: 't_tech', name: '艦隊技術の父', medal: 'fleet_tech_4' },
  { id: 't_skill', name: '名艦の提督', medal: 'ship_skill_3' },
];

/** The titles a set of medals earns, in the table's order. */
export function earnedTitles(medals: readonly string[]): IAdmiralTitle[] {
  return TITLES.filter((t) => medals.includes(t.medal));
}

/** The name of the title the admiral wears, if it is one they have earned (a title is never shown unearned). */
export function wornTitle(record: { title?: string; medals: readonly string[] }): string | undefined {
  const t = TITLES.find((x) => x.id === record.title);
  return t && record.medals.includes(t.medal) ? t.name : undefined;
}

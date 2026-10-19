import { EVENT_KINDS } from './EventKinds';
import { IBattleRecordInput, IMedal, IServiceRecord } from '@/types/Record';
import { ShipClass } from '@/types/ShipClass';

/** Service record and medals (pure): career totals from every battle, and the medals they earn. */

export function emptyRecord(): IServiceRecord {
  return { sorties: 0, victories: 0, perfectVictories: 0, sunk: {}, damageDealt: 0, bestDamage: 0, shipsLost: 0, medals: [] };
}

export function totalSunk(r: IServiceRecord): number {
  return Object.values(r.sunk).reduce((a, n) => a + (n ?? 0), 0);
}

export function recordBattle(r: IServiceRecord, b: IBattleRecordInput): IServiceRecord {
  const sunk = { ...r.sunk };
  for (const c of b.sunkClasses) sunk[c] = (sunk[c] ?? 0) + 1;
  const damage = Math.max(0, Math.round(b.damageDealt));
  return {
    ...r,
    sorties: r.sorties + 1,
    victories: r.victories + (b.victory ? 1 : 0),
    perfectVictories: r.perfectVictories + (b.victory && b.shipsLost === 0 ? 1 : 0),
    sunk,
    damageDealt: r.damageDealt + damage,
    bestDamage: Math.max(r.bestDamage, damage),
    shipsLost: r.shipsLost + Math.max(0, b.shipsLost),
  };
}

/** Context medals may need beyond the record itself (#92): totals over every nation the admiral has played. */
export interface IMedalContext {
  /** Campaign theaters with every area cleared */
  clearedTheaters: string[];
  /** Lifetime quest-event totals (#158), summed over the nations */
  totals?: Partial<Record<string, number>>;
  /** Campaign areas cleared, and those won with an S rank */
  areasCleared?: number;
  areasS?: number;
  shipsOwned?: number;
  researchDone?: number;
  captains?: number;
  /** Highest captain level */
  captainLevel?: number;
  /** Most facilities one base is raising at once (#216) */
  parallelFacilities?: number;
  /** Most docks one base has (#211) */
  maxDocks?: number;
  /** 1 when some nation holds all four resources at its holding cap (#221) */
  fullStock?: number;
  /** Highest steel holding cap of any nation (#221) */
  steelCap?: number;
  /** Lowest level among the four resource facilities (all bases summed), best nation (#190) */
  supplyLevel?: number;
  /** Most carriers one nation owns (#204) */
  carriersOwned?: number;
  /** Most enemies one captain's own ship has sunk (#199) */
  captainSinks?: number;
  /** Sum of every facility level built (#146) */
  facilityLevels?: number;
  /** Nations with any progress */
  nationsPlayed?: number;
  /** Highest rank index reached (0 = 准尉) */
  rankIndex?: number;
}

export type MedalCategory = 'sink' | 'battle' | 'campaign' | 'growth' | 'base' | 'special' | 'quest';

export const MEDAL_CATEGORY_LABEL: Record<MedalCategory, string> = {
  sink: '撃沈', battle: '戦闘', campaign: '作戦', growth: '育成', base: '軍港・工廠', special: '特殊', quest: '任務',
};

interface IMedalRule extends IMedal {
  category: MedalCategory;
  /** Where the admiral stands, against `goal` */
  value: (r: IServiceRecord, ctx: IMedalContext) => number;
  goal: number;
}

const sunkOf = (r: IServiceRecord, c: ShipClass): number => r.sunk[c] ?? 0;
const total = (ctx: IMedalContext, event: string): number => ctx.totals?.[event] ?? 0;

/** One medal per tier of a ladder: `ranks` names the tiers (三等 / 二等 / 一等 …). */
function ladder(
  id: string, name: string, category: MedalCategory, goals: number[], text: (goal: number) => string,
  value: IMedalRule['value'], ranks = ['三等', '二等', '一等', '特等', '名誉'],
): IMedalRule[] {
  return goals.map((goal, i) => ({ id: i === 0 ? id : `${id}_${i + 1}`, name: goals.length > 1 ? `${name} ${ranks[i]}` : name, description: text(goal), category, value, goal }));
}

/** Medals (#92): the original twelve keep their ids; the ladders add tiers above them. */
export const MEDALS: IMedalRule[] = [
  // 撃沈
  ...ladder('battleship_slayer', '戦艦撃沈章', 'sink', [5, 25, 100], (g) => `戦艦を ${g} 隻撃沈する`, (r) => sunkOf(r, ShipClass.Battleship)),
  ...ladder('carrier_slayer', '空母撃沈章', 'sink', [3, 15, 50], (g) => `空母を ${g} 隻撃沈する`, (r) => sunkOf(r, ShipClass.Carrier)),
  ...ladder('cruiser_slayer', '巡洋艦撃沈章', 'sink', [10, 50, 200], (g) => `巡洋艦を ${g} 隻撃沈する`, (r) => sunkOf(r, ShipClass.Cruiser)),
  ...ladder('destroyer_slayer', '駆逐艦撃沈章', 'sink', [20, 100, 400], (g) => `駆逐艦を ${g} 隻撃沈する`, (r) => sunkOf(r, ShipClass.Destroyer)),
  ...ladder('sub_hunter', '対潜章', 'sink', [5, 25, 100], (g) => `潜水艦を ${g} 隻撃沈する`, (r) => sunkOf(r, ShipClass.Submarine)),
  ...ladder('ace', '武功章', 'sink', [30, 150, 500, 2000], (g) => `累計 ${g} 隻撃沈する`, (r) => totalSunk(r)),
  // 戦闘
  { id: 'first_victory', name: '初陣勝利章', description: '初めて勝利する', category: 'battle', value: (r) => r.victories, goal: 1 },
  ...ladder('victor', '勝利章', 'battle', [10, 50, 200, 1000], (g) => `${g} 回勝利する`, (r) => r.victories),
  ...ladder('veteran', '歴戦章', 'battle', [20, 100, 500, 1000], (g) => `${g} 回出撃する`, (r) => r.sorties),
  ...ladder('perfect', '完全勝利章', 'battle', [5, 25, 100], (g) => `1 隻も失わずに ${g} 回勝利する`, (r) => r.perfectVictories),
  ...ladder('big_gun', '大火力章', 'battle', [3000, 8000, 15000], (g) => `1 回の戦闘で ${g.toLocaleString()} ダメージを与える`, (r) => r.bestDamage),
  ...ladder('firepower', '砲撃章', 'battle', [50_000, 250_000, 1_000_000], (g) => `累計 ${g.toLocaleString()} ダメージを与える`, (r) => r.damageDealt),
  ...ladder('night_fighter', '夜戦章', 'battle', [5, 30, 100], (g) => `夜戦で ${g} 回勝利する`, (_r, c) => total(c, 'nightWin')),
  ...ladder('s_rank', '完勝章', 'battle', [10, 50, 200], (g) => `S 評価で ${g} 回勝利する`, (_r, c) => total(c, 'winS')),
  // 作戦
  { id: 'pacific', name: '太平洋制覇章', description: '太平洋戦域の全海域を攻略する', category: 'campaign', value: (_r, c) => (c.clearedTheaters.includes('pacific') ? 1 : 0), goal: 1 },
  { id: 'atlantic', name: '大西洋制覇章', description: '大西洋戦域の全海域を攻略する', category: 'campaign', value: (_r, c) => (c.clearedTheaters.includes('atlantic') ? 1 : 0), goal: 1 },
  { id: 'baltic', name: 'バルト海制覇章', description: 'バルト海戦域の全海域を攻略する', category: 'campaign', value: (_r, c) => (c.clearedTheaters.includes('baltic') ? 1 : 0), goal: 1 },
  { id: 'mediterranean', name: '地中海制覇章', description: '地中海戦域 (インド洋を含む) の全海域を攻略する', category: 'campaign', value: (_r, c) => (c.clearedTheaters.includes('mediterranean') ? 1 : 0), goal: 1 },
  ...ladder('explorer', '攻略章', 'campaign', [5, 15, 30], (g) => `作戦の海域を ${g} か所攻略する`, (_r, c) => c.areasCleared ?? 0),
  ...ladder('flawless', '海域完勝章', 'campaign', [3, 10, 25], (g) => `${g} か所の海域で S 評価を取る`, (_r, c) => c.areasS ?? 0),
  ...ladder('operations', '作戦従事章', 'campaign', [20, 100, 400], (g) => `作戦の海域で ${g} 回勝利する`, (_r, c) => total(c, 'campaignWin')),
  ...ladder('convoy', '船団護衛章', 'campaign', [3, 15, 50], (g) => `輸送船団の護衛で ${g} 回勝利する`, (_r, c) => total(c, 'convoyWin')),
  ...ladder('mission', '任務達成章', 'campaign', [10, 50], (g) => `目的がある海域で ${g} 回勝利する`, (_r, c) => total(c, 'objectiveWin')),
  ...ladder('pacific_war', '太平洋従軍章', 'campaign', [10, 50], (g) => `太平洋で ${g} 回勝利する`, (_r, c) => total(c, 'winPacific')),
  ...ladder('atlantic_war', '大西洋従軍章', 'campaign', [10, 50], (g) => `大西洋で ${g} 回勝利する`, (_r, c) => total(c, 'winAtlantic')),
  ...ladder('med_war', '地中海従軍章', 'campaign', [10, 50], (g) => `地中海で ${g} 回勝利する`, (_r, c) => total(c, 'winMediterranean')),
  ...ladder('baltic_war', 'バルト海従軍章', 'campaign', [10, 50], (g) => `バルト海で ${g} 回勝利する`, (_r, c) => total(c, 'winBaltic')),
  // 育成
  ...ladder('task_force', '機動部隊編成章', 'growth', [2, 4, 6], (g) => `空母を ${g} 隻保有する (どれか 1 か国)`, (_r, c) => c.carriersOwned ?? 0),
  ...ladder('fleet', '艦隊章', 'growth', [5, 15, 30], (g) => `艦を ${g} 隻保有する (どれか 1 か国)`, (_r, c) => c.shipsOwned ?? 0),
  ...ladder('science', '技術章', 'growth', [5, 15, 30], (g) => `研究を ${g} 完了する (どれか 1 か国)`, (_r, c) => c.researchDone ?? 0),
  ...ladder('captains', '艦長章', 'growth', [3, 6, 9], (g) => `艦長を ${g} 人そろえる (どれか 1 か国)`, (_r, c) => c.captains ?? 0),
  ...ladder('captain_ace', '撃沈王章', 'growth', [10, 50, 150], (g) => `1 人の艦長の艦で ${g} 隻撃沈する`, (_r, c) => c.captainSinks ?? 0),
  ...ladder('mentor', '名艦長章', 'growth', [10, 30, 60, 100], (g) => `艦長を Lv${g} に育てる`, (_r, c) => c.captainLevel ?? 0),
  ...ladder('s_recruiter', '完勝の将章', 'growth', [5, 15], (g) => `S 評価と昇進で艦長を ${g} 名迎える`, (_r, c) => total(c, 'captainJoin')),
  ...ladder('instructor', '教官章', 'growth', [1, 10, 30], (g) => `艦長にスキルを ${g} 回習得させる`, (_r, c) => total(c, 'learnSkill')),
  ...ladder('refitter', '改造章', 'growth', [1, 10, 30], (g) => `艦を ${g} 回改造する`, (_r, c) => total(c, 'refit')),
  ...ladder('promotion', '昇進章', 'growth', [6, 8, 11], (g) => `階級を ${({ 6: '少佐', 8: '大佐', 11: '中将' } as Record<number, string>)[g]}まで上げる`, (_r, c) => c.rankIndex ?? 0),
  // 軍港・工廠
  ...ladder('shipwright', '造船章', 'base', [1, 10, 50], (g) => `艦を ${g} 隻建造する`, (_r, c) => total(c, 'build')),
  ...ladder('rush_work', '突貫工事章', 'base', [2, 3], (g) => `1 つの軍港で施設を ${g} つ同時に建設する`, (_r, c) => c.parallelFacilities ?? 0),
  ...ladder('dock_expansion', '船渠拡張章', 'base', [4, 6, 8], (g) => `1 つの軍港のドックを ${g} 本にする`, (_r, c) => c.maxDocks ?? 0),
  { id: 'stockpile', name: '大備蓄章', description: '4 つの資源をすべて保有上限まで貯める', category: 'base', value: (_r, c) => c.fullStock ?? 0, goal: 1 },
  ...ladder('warehouse', '備蓄拡張章', 'base', [20000, 40000], (g) => `製鋼所で鋼材の保有上限を ${g.toLocaleString()} にする`, (_r, c) => c.steelCap ?? 0),
  ...ladder('supply_depot', '補給基地章', 'base', [3, 5], (g) => `燃料タンク・弾薬庫・製鋼所・航空基地をすべて Lv${g} 以上にする`, (_r, c) => c.supplyLevel ?? 0),
  ...ladder('dockyard', '船渠章', 'base', [10, 100, 300], (g) => `損傷艦を ${g} 隻入渠させる`, (_r, c) => total(c, 'repair')),
  ...ladder('builder', '軍港建設章', 'base', [5, 15, 30], (g) => `軍港の施設を合計 Lv${g} にする`, (_r, c) => c.facilityLevels ?? 0),
  ...ladder('patrol', '哨戒章', 'base', [10, 100], (g) => `攻略済みの海域を ${g} 回掃討する`, (_r, c) => total(c, 'sweep')),
  // 特殊
  ...ladder('event_tour', 'イベント巡り章', 'special', [3, 7], (g) => `${g} 種類のイベントの開催中に勝利する`, (_r, c) => EVENT_KINDS.filter((k) => total(c, `event_${k}`) > 0).length),
  ...ladder('veteran_player', '古参章', 'special', [1, 3, 10], (g) => `新しい版を ${g} 回迎える (タイトルの更新内容)`, (_r, c) => total(c, 'versionUpdate')),
  ...ladder('nations', '連合章', 'special', [2, 4, 7], (g) => `${g} か国で艦隊を率いる`, (_r, c) => c.nationsPlayed ?? 0),
  ...ladder('torpedo_squadron', '水雷戦隊章', 'special', [10, 50], (g) => `駆逐艦が旗艦の艦隊で ${g} 回勝利する`, (_r, c) => total(c, 'ddFlagWin')),
  ...ladder('drill', '演習章', 'special', [20, 100], (g) => `演習で ${g} 回勝利する`, (_r, c) => total(c, 'exerciseWin')),
  ...ladder('unscathed', '無傷章', 'special', [10, 50], (g) => `艦を失わずに ${g} 回勝利する (任務の記録)`, (_r, c) => total(c, 'perfectWin')),
  // 任務 (#158): awarded only by claiming the quest that names them
  ...([
    ['q_win200', '不敗の勲章', '任務「不敗の艦隊」を達成する'], ['q_sink500', '五百隻撃沈記念章', '任務「五百隻撃沈」を達成する'],
    ['q_bb50', '戦艦の天敵章', '任務「戦艦の天敵」を達成する'], ['q_cv30', '機動部隊の天敵章', '任務「機動部隊の天敵」を達成する'],
    ['q_ss60', '海の狩人章', '任務「海の狩人」を達成する'], ['q_night20', '夜の支配者章', '任務「夜の支配者」を達成する'],
    ['q_s30', '名将章', '任務「完勝の名将」を達成する'], ['q_objective20', '作戦の達人章', '任務「作戦の達人」を達成する'],
    ['q_ddflag20', '水雷戦隊司令章', '任務「水雷戦隊司令」を達成する'], ['q_build10', '造船所の顔章', '任務「造船所の顔」を達成する'],
    ['q_research10', '技術立国章', '任務「技術立国」を達成する'], ['q_facility10', '軍港の建設者章', '任務「軍港の建設者」を達成する'],
    ['q_captain30', '名艦長の師章', '任務「名艦長の師」を達成する'],
  ] as const).map(([id, name, description]): IMedalRule => ({ id, name, description, category: 'quest', value: (r) => (r.medals.includes(id) ? 1 : 0), goal: 1 })),
];

/** How far along a medal is: [value, goal]. */
export function medalProgress(id: string, r: IServiceRecord, ctx: IMedalContext): [number, number] {
  const m = MEDALS.find((x) => x.id === id);
  return m ? [Math.min(m.goal, m.value(r, ctx)), m.goal] : [0, 1];
}

/** Medals now earned that the record doesn't hold yet. */
export function newMedals(r: IServiceRecord, ctx: IMedalContext): IMedal[] {
  return MEDALS.filter((m) => m.category !== 'quest' && !r.medals.includes(m.id) && m.value(r, ctx) >= m.goal).map(({ id, name, description }) => ({ id, name, description }));
}

export function awardMedals(r: IServiceRecord, medals: IMedal[]): IServiceRecord {
  return { ...r, medals: [...r.medals, ...medals.map((m) => m.id).filter((id) => !r.medals.includes(id))] };
}

/** Tolerant parse of a stored record (older saves have none). */
export function parseRecord(raw: unknown): IServiceRecord {
  const r = (raw ?? {}) as Partial<IServiceRecord>;
  const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  const sunk: Partial<Record<ShipClass, number>> = {};
  for (const c of Object.values(ShipClass)) {
    const v = n((r.sunk as Record<string, unknown> | undefined)?.[c]);
    if (v > 0) sunk[c] = v;
  }
  return {
    sorties: n(r.sorties),
    victories: n(r.victories),
    perfectVictories: n(r.perfectVictories),
    sunk,
    damageDealt: n(r.damageDealt),
    bestDamage: n(r.bestDamage),
    shipsLost: n(r.shipsLost),
    medals: Array.isArray(r.medals) ? r.medals.filter((m): m is string => typeof m === 'string') : [],
  };
}

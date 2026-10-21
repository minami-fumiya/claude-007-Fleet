import { EVENT_KINDS } from './EventKinds';
import { IBattleRecordInput, IMedal, IModeRecord, IScenarioBest, IScenarioRecord, IServiceRecord, RecordMode } from '@/types/Record';
import { ALL_SCENARIOS } from '@/data/scenarios';
import { ShipClass } from '@/types/ShipClass';
import campaignData from '@/data/campaign.json';

/** Service record and medals (pure): career totals from every battle, and the medals they earn. */

export function emptyRecord(): IServiceRecord {
  return { ...emptyModeRecord(), medals: [], byMode: {}, scenarios: {} };
}

export function emptyModeRecord(): IModeRecord {
  return { sorties: 0, victories: 0, perfectVictories: 0, sunk: {}, damageDealt: 0, bestDamage: 0, shipsLost: 0 };
}

export function totalSunk(r: Pick<IModeRecord, 'sunk'>): number {
  return Object.values(r.sunk).reduce((a, n) => a + (n ?? 0), 0);
}

export const RECORD_MODES: RecordMode[] = ['campaign', 'exercise', 'scenario'];
export const RECORD_MODE_LABEL: Record<RecordMode, string> = { campaign: '作戦', exercise: '演習', scenario: '史実' };

/** One battle added to a set of figures. */
function addBattle<T extends IModeRecord>(r: T, b: IBattleRecordInput): T {
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

/**
 * Adds a battle to the record (#177): to its kind's figures always, to the career totals unless it is a historical
 * scenario, and a scenario's win or loss to that scenario's side.
 */
export function recordBattle(r: IServiceRecord, b: IBattleRecordInput, mode: RecordMode = 'campaign', scenario?: { id: string; force: 'A' | 'B' }): IServiceRecord {
  const byMode = { ...(r.byMode ?? {}), [mode]: addBattle(r.byMode?.[mode] ?? emptyModeRecord(), b) };
  const out: IServiceRecord = { ...(mode === 'scenario' ? r : addBattle(r, b)), byMode };
  if (mode !== 'scenario' || !scenario) return out;
  const was: IScenarioRecord = r.scenarios?.[scenario.id] ?? { wins: {}, losses: {} };
  const key = b.victory ? 'wins' : 'losses';
  const battle: IScenarioBest = { victory: b.victory, sunk: b.sunkClasses.length, lost: Math.max(0, b.shipsLost) };
  const prev = was.best?.[scenario.force];
  const best = prev && !betterBest(battle, prev) ? prev : battle;
  const now: IScenarioRecord = { ...was, [key]: { ...was[key], [scenario.force]: (was[key][scenario.force] ?? 0) + 1 }, best: { ...(was.best ?? {}), [scenario.force]: best } };
  return { ...out, scenarios: { ...(r.scenarios ?? {}), [scenario.id]: now } };
}

/**
 * Battles fought before the record was split (#177): the career totals less what the campaign and the exercises
 * have counted since. Shown as 区分なし (0.0.30 以前); never negative.
 */
export function unsortedRecord(r: IServiceRecord): IModeRecord {
  const parts = (['campaign', 'exercise'] as const).map((m) => r.byMode?.[m] ?? emptyModeRecord());
  const less = (k: 'sorties' | 'victories' | 'perfectVictories' | 'damageDealt' | 'shipsLost'): number => Math.max(0, r[k] - parts.reduce((s, p) => s + p[k], 0));
  const sunk: IModeRecord['sunk'] = {};
  for (const c of Object.values(ShipClass)) {
    const n = (r.sunk[c] ?? 0) - parts.reduce((s, p) => s + (p.sunk[c] ?? 0), 0);
    if (n > 0) sunk[c] = n;
  }
  const best = Math.max(0, ...parts.map((p) => p.bestDamage));
  return { sorties: less('sorties'), victories: less('victories'), perfectVictories: less('perfectVictories'), sunk, damageDealt: less('damageDealt'), bestDamage: r.bestDamage > best ? r.bestDamage : 0, shipsLost: less('shipsLost') };
}

/** True when `a` beats `b` (#200): a win first, then more sunk, then fewer lost. */
export function betterBest(a: IScenarioBest, b: IScenarioBest): boolean {
  if (a.victory !== b.victory) return a.victory;
  if (a.sunk !== b.sunk) return a.sunk > b.sunk;
  return a.lost < b.lost;
}

/** Scenarios won from the side that lost the real battle (#200 史実を覆す). */
export function overturnedCount(r: Pick<IServiceRecord, 'scenarios'>): number {
  return ALL_SCENARIOS.filter((sc) => {
    const w = sc.history?.winner;
    const loser = w === 'A' ? 'B' : w === 'B' ? 'A' : null;
    return loser !== null && (r.scenarios?.[sc.id]?.wins[loser] ?? 0) > 0;
  }).length;
}

/** Scenarios played from both sides (#200 歴史家). */
export function bothSidesPlayed(r: Pick<IServiceRecord, 'scenarios'>): number {
  const played = (s: IScenarioRecord, f: 'A' | 'B'): boolean => (s.wins[f] ?? 0) + (s.losses[f] ?? 0) > 0;
  return ALL_SCENARIOS.filter((sc) => {
    const s = r.scenarios?.[sc.id];
    return s !== undefined && played(s, 'A') && played(s, 'B');
  }).length;
}

/** Scenarios of a sea area won from either side, against how many it has (#200). */
function theaterWins(r: Pick<IServiceRecord, 'scenarios'>, theater: string): number {
  const list = ALL_SCENARIOS.filter((sc) => sc.theater === theater);
  const won = list.filter((sc) => ((r.scenarios?.[sc.id]?.wins.A ?? 0) + (r.scenarios?.[sc.id]?.wins.B ?? 0)) > 0).length;
  return won >= list.length ? 1 : 0;
}

/** Scenarios won at least once from either side, and from both sides (#177). */
export function scenarioWins(r: Pick<IServiceRecord, 'scenarios'>): { won: number; bothSides: number } {
  const all = Object.values(r.scenarios ?? {});
  return {
    won: all.filter((s) => (s.wins.A ?? 0) + (s.wins.B ?? 0) > 0).length,
    bothSides: all.filter((s) => (s.wins.A ?? 0) > 0 && (s.wins.B ?? 0) > 0).length,
  };
}

/** Context medals may need beyond the record itself (#92): totals over every nation the admiral has played. */
/** 七つの海 (#250): the theaters that are seas, the Baltic and the Black Sea (inland seas) aside. */
export const SEVEN_SEAS: string[] = (campaignData.theaters as Array<{ id: string; inland?: boolean }>).filter((t) => !t.inland).map((t) => t.id);

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
  /** Most bases one nation has open (built, #217) */
  basesOpen?: number;
  /** Classes (lead + sisters, #85) one nation owns every ship of, best nation */
  classesComplete?: number;
  /** Kinds of ship by 通し番号 type (#249: 戦艦・巡洋戦艦・重巡 …) one nation owns, best nation */
  shipTypes?: number;
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
  /** Lifetime gold earned (#183) */
  goldEarned?: number;
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
  { id: 'pacific', name: '南太平洋制覇章', description: '南太平洋の全海域を攻略する', category: 'campaign', value: (_r, c) => (c.clearedTheaters.includes('pacific') ? 1 : 0), goal: 1 },
  { id: 'atlantic', name: '北大西洋制覇章', description: '北大西洋の全海域を攻略する', category: 'campaign', value: (_r, c) => (c.clearedTheaters.includes('atlantic') ? 1 : 0), goal: 1 },
  { id: 'baltic', name: 'バルト海制覇章', description: 'バルト海戦域の全海域を攻略する', category: 'campaign', value: (_r, c) => (c.clearedTheaters.includes('baltic') ? 1 : 0), goal: 1 },
  { id: 'mediterranean', name: '地中海制覇章', description: '地中海の全海域を攻略する', category: 'campaign', value: (_r, c) => (c.clearedTheaters.includes('mediterranean') ? 1 : 0), goal: 1 },
  ...ladder('explorer', '攻略章', 'campaign', [5, 15, 30], (g) => `作戦の海域を ${g} か所攻略する`, (_r, c) => c.areasCleared ?? 0),
  ...ladder('flawless', '海域完勝章', 'campaign', [3, 10, 25], (g) => `${g} か所の海域で S 評価を取る`, (_r, c) => c.areasS ?? 0),
  ...ladder('operations', '作戦従事章', 'campaign', [20, 100, 400], (g) => `作戦の海域で ${g} 回勝利する`, (_r, c) => total(c, 'campaignWin')),
  ...ladder('convoy', '船団護衛章', 'campaign', [3, 15, 50], (g) => `輸送船団の護衛で ${g} 回勝利する`, (_r, c) => total(c, 'convoyWin')),
  ...ladder('mission', '任務達成章', 'campaign', [10, 50], (g) => `目的がある海域で ${g} 回勝利する`, (_r, c) => total(c, 'objectiveWin')),
  ...ladder('pacific_war', '南太平洋従軍章', 'campaign', [10, 50], (g) => `南太平洋で ${g} 回勝利する`, (_r, c) => total(c, 'winPacific')),
  ...ladder('atlantic_war', '北大西洋従軍章', 'campaign', [10, 50], (g) => `北大西洋で ${g} 回勝利する`, (_r, c) => total(c, 'winAtlantic')),
  ...ladder('med_war', '地中海従軍章', 'campaign', [10, 50], (g) => `地中海で ${g} 回勝利する`, (_r, c) => total(c, 'winMediterranean')),
  { id: 'blacksea', name: '黒海制覇章', description: '黒海戦域の全海域を攻略する', category: 'campaign', value: (_r, c) => (c.clearedTheaters.includes('blacksea') ? 1 : 0), goal: 1 },
  ...ladder('blacksea_war', '黒海従軍章', 'campaign', [10, 50], (g) => `黒海で ${g} 回勝利する`, (_r, c) => total(c, 'winBlackSea')),
  ...ladder('training', '訓練章', 'campaign', [5, 30], (g) => `訓練海域で ${g} 回勝利する`, (_r, c) => total(c, 'trainingWin')),
  // 七つの海 (#250): each sea added in 0.0.35, its battles, and the seven together (the inland seas aside).
  ...([['north_pacific', '北太平洋', 'winNorthPacific'], ['south_atlantic', '南大西洋', 'winSouthAtlantic'], ['indian', 'インド洋', 'winIndian'], ['arctic', '北極海', 'winArctic']] as const).flatMap(([t, name, event]): IMedalRule[] => [
    { id: t, name: `${name}制覇章`, description: `${name}の全海域を攻略する`, category: 'campaign', value: (_r, c) => (c.clearedTheaters.includes(t) ? 1 : 0), goal: 1 },
    ...ladder(`${t}_war`, `${name}従軍章`, 'campaign', [10, 50], (g) => `${name}で ${g} 回勝利する`, (_r, c) => total(c, event)),
  ]),
  ...ladder('seas', '七つの海章', 'campaign', [1, 3, 7], (g) => (g === 7 ? '七つの海すべての全海域を攻略する' : `七つの海のうち ${g} つの全海域を攻略する`), (_r, c) => c.clearedTheaters.filter((t) => SEVEN_SEAS.includes(t)).length),
  ...ladder('baltic_war', 'バルト海従軍章', 'campaign', [10, 50], (g) => `バルト海で ${g} 回勝利する`, (_r, c) => total(c, 'winBaltic')),
  // 育成
  ...ladder('task_force', '機動部隊編成章', 'growth', [2, 4, 6], (g) => `空母を ${g} 隻保有する (どれか 1 か国)`, (_r, c) => c.carriersOwned ?? 0),
  // The 図鑑 numbers ships by type (#249): owning many kinds of ship.
  ...ladder('ship_types', '艦種章', 'growth', [3, 6, 9], (g) => `1 か国で ${g} 種類の艦種 (図鑑の No. の種別) の艦を保有する`, (_r, c) => c.shipTypes ?? 0),
  ...ladder('class_set', '同型艦章', 'growth', [1, 3, 10], (g) => `1 か国で ${g} つの級の艦をすべてそろえる (例: 金剛型 4 隻)`, (_r, c) => c.classesComplete ?? 0),
  ...ladder('fleet', '艦隊章', 'growth', [5, 15, 30, 60, 100], (g) => `艦を ${g} 隻保有する (どれか 1 か国)`, (_r, c) => c.shipsOwned ?? 0),
  ...ladder('science', '技術章', 'growth', [5, 15, 30], (g) => `研究を ${g} 完了する (どれか 1 か国)`, (_r, c) => c.researchDone ?? 0),
  ...ladder('captains', '艦長章', 'growth', [3, 6, 9, 20, 30], (g) => `艦長を ${g} 人そろえる (どれか 1 か国)`, (_r, c) => c.captains ?? 0),
  ...ladder('anti_air', '対空射撃章', 'battle', [20, 100, 500], (g) => `敵機を ${g} 機撃墜する`, (_r, c) => total(c, 'planesDown')),
  ...ladder('captain_ace', '撃沈王章', 'growth', [10, 50, 150], (g) => `1 人の艦長の艦で ${g} 隻撃沈する`, (_r, c) => c.captainSinks ?? 0),
  ...ladder('mentor', '名艦長章', 'growth', [10, 30, 60, 100], (g) => `艦長を Lv${g} に育てる`, (_r, c) => c.captainLevel ?? 0),
  ...ladder('s_recruiter', '完勝の将章', 'growth', [5, 15], (g) => `S 評価と昇進で艦長を ${g} 名迎える`, (_r, c) => total(c, 'captainJoin')),
  ...ladder('instructor', '教官章', 'growth', [1, 10, 30], (g) => `艦長にスキルを ${g} 回習得させる`, (_r, c) => total(c, 'learnSkill')),
  ...ladder('refit_branch', '改造方向章', 'growth', [1, 5, 15], (g) => `改三の方向 (甲・乙・丙) を選んで ${g} 隻改造する`, (_r, c) => total(c, 'refitBranch')),
  ...ladder('special_branch', '匠の改装章', 'growth', [1, 5], (g) => `専用の改装を持つ艦 (大和・長門 …) で改三の方向を ${g} 隻選ぶ`, (_r, c) => total(c, 'specialBranch')),
  ...ladder('refit_rebranch', '改装の匠章', 'growth', [1, 3, 10], (g) => `改造を終えた艦の方向を ${g} 回変える`, (_r, c) => total(c, 'refitRebranch')),
  ...ladder('refitter', '改造章', 'growth', [1, 10, 30], (g) => `艦を ${g} 回改造する`, (_r, c) => total(c, 'refit')),
  ...ladder('promotion', '昇進章', 'growth', [6, 8, 11], (g) => `階級を ${({ 6: '少佐', 8: '大佐', 11: '中将' } as Record<number, string>)[g]}まで上げる`, (_r, c) => c.rankIndex ?? 0),
  // 軍港・工廠
  ...ladder('shipwright', '造船章', 'base', [1, 10, 50], (g) => `艦を ${g} 隻建造する`, (_r, c) => total(c, 'build')),
  ...ladder('list_search', '捜索章', 'special', [1, 30], (g) => `一覧で艦を名前で ${g} 回検索する`, (_r, c) => total(c, 'listSearch')),
  ...ladder('build_done', '竣工章', 'base', [5, 30, 100], (g) => `建造した艦が ${g} 隻竣工する`, (_r, c) => total(c, 'buildDone')),
  ...ladder('rush_work', '突貫工事章', 'base', [2, 3], (g) => `1 つの軍港で施設を ${g} つ同時に建設する`, (_r, c) => c.parallelFacilities ?? 0),
  ...ladder('dock_expansion', '船渠拡張章', 'base', [4, 6, 8], (g) => `1 つの軍港のドックを ${g} 本にする`, (_r, c) => c.maxDocks ?? 0),
  // A new base starts with one dock (#244): the second is the first step.
  { id: 'second_dock', name: '第二船渠章', description: '1 つの軍港のドックを 2 本にする', category: 'base', value: (_r, c) => c.maxDocks ?? 0, goal: 2 },
  { id: 'stockpile', name: '大備蓄章', description: '4 つの資源をすべて保有上限まで貯める', category: 'base', value: (_r, c) => c.fullStock ?? 0, goal: 1 },
  ...ladder('warehouse', '備蓄拡張章', 'base', [20000, 40000], (g) => `製鋼所で鋼材の保有上限を ${g.toLocaleString()} にする`, (_r, c) => c.steelCap ?? 0),
  ...ladder('harbor_works', '築港章', 'base', [2, 4], (g) => `1 か国で軍港を ${g} つ開く (工事で開港)`, (_r, c) => c.basesOpen ?? 0),
  ...ladder('supply_depot', '補給基地章', 'base', [3, 5], (g) => `燃料タンク・弾薬庫・製鋼所・航空基地をすべて Lv${g} 以上にする`, (_r, c) => c.supplyLevel ?? 0),
  ...ladder('dockyard', '船渠章', 'base', [10, 100, 300], (g) => `損傷艦を ${g} 隻入渠させる`, (_r, c) => total(c, 'repair')),
  ...ladder('builder', '軍港建設章', 'base', [5, 15, 30], (g) => `軍港の施設を合計 Lv${g} にする`, (_r, c) => c.facilityLevels ?? 0),
  ...ladder('patrol', '哨戒章', 'base', [10, 100, 300, 1000], (g) => `攻略済みの海域を ${g} 回掃討する`, (_r, c) => total(c, 'sweep')),
  // 特殊
  ...ladder('event_tour', 'イベント巡り章', 'special', [3, 7], (g) => `${g} 種類のイベントの開催中に勝利する`, (_r, c) => EVENT_KINDS.filter((k) => total(c, `event_${k}`) > 0).length),
  ...ladder('veteran_player', '古参章', 'special', [1, 3, 10], (g) => `新しい版を ${g} 回迎える (タイトルの更新内容)`, (_r, c) => total(c, 'versionUpdate')),
  ...ladder('nations', '連合章', 'special', [2, 4, 7], (g) => `${g} か国で艦隊を率いる`, (_r, c) => c.nationsPlayed ?? 0),
  ...ladder('torpedo_squadron', '水雷戦隊章', 'special', [10, 50], (g) => `駆逐艦が旗艦の艦隊で ${g} 回勝利する`, (_r, c) => total(c, 'ddFlagWin')),
  ...ladder('drill', '演習章', 'special', [20, 100], (g) => `演習で ${g} 回勝利する`, (_r, c) => total(c, 'exerciseWin')),
  ...ladder('historian', '戦史章', 'special', [3, 6, 10], (g) => `史実のシナリオを ${g} 種類勝利する`, (r) => scenarioWins(r).won),
  ...ladder('both_sides', '両陣営章', 'special', [1, 5], (g) => `史実のシナリオ ${g} 種類で両方の陣営から勝利する`, (r) => scenarioWins(r).bothSides),
  ...ladder('history_battles', '史実従軍章', 'special', [10, 50], (g) => `史実のシナリオで ${g} 回勝利する`, (r) => r.byMode?.scenario?.victories ?? 0),
  ...ladder('overturn', '史実を覆す章', 'special', [3, ALL_SCENARIOS.filter((sc) => sc.history && sc.history.winner !== 'draw').length], (g) => `史実で負けた側で、史実のシナリオ ${g} 種類に勝利する`, (r) => overturnedCount(r)),
  { id: 'chronicler', name: '歴史家章', description: `史実のシナリオ ${ALL_SCENARIOS.length} 種類すべてを両方の陣営で遊ぶ`, category: 'special', value: (r) => bothSidesPlayed(r), goal: ALL_SCENARIOS.length },
  ...([['pacific', '太平洋'], ['atlantic', '大西洋'], ['mediterranean', '地中海'], ['arctic', '北極海']] as const).map(([t, name]): IMedalRule => ({
    id: `history_${t}`, name: `${name}戦史章`, description: `${name}の史実のシナリオすべてに勝利する`, category: 'special', value: (r) => theaterWins(r, t), goal: 1,
  })),
  ...ladder('unscathed', '無傷章', 'special', [10, 50], (g) => `艦を失わずに ${g} 回勝利する (任務の記録)`, (_r, c) => total(c, 'perfectWin')),
  ...ladder('shopper', '御用達章', 'base', [5, 30, 100], (g) => `ショップで ${g} 回買い物をする`, (_r, c) => total(c, 'shopBuy')),
  ...ladder('treasury', '蓄財章', 'special', [5000, 50000, 200000], (g) => `ゴールドを累計 ${g.toLocaleString()} 手に入れる`, (_r, c) => c.goldEarned ?? 0),
  ...ladder('fire_flood', '火攻め章', 'battle', [20, 100, 400], (g) => `敵艦に火災・浸水を ${g} 回起こす`, (_r, c) => total(c, 'fireSet')),
  ...ladder('airfield', '飛行場制圧章', 'battle', [3, 15, 50], (g) => `敵の飛行場を ${g} か所破壊する`, (_r, c) => total(c, 'airfieldDown')),
  ...ladder('superweapon_slayer', '超兵器撃沈章', 'sink', [1, 5, 20], (g) => `超兵器を ${g} 隻撃沈する`, (_r, c) => total(c, 'superweaponSunk')),
  ...ladder('hard_mode', '精鋭章', 'battle', [10, 50, 200], (g) => `難易度「難しい」で ${g} 回勝利する`, (_r, c) => total(c, 'hardWin')),
  ...ladder('quest_clerk', '任務精励章', 'special', [50, 300, 1000], (g) => `任務を ${g} 件達成する (報酬を受け取る)`, (_r, c) => total(c, 'questClaim')),
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
  const r = (raw !== null && typeof raw === 'object' ? raw : {}) as Partial<IServiceRecord>;
  const byMode: Partial<Record<RecordMode, IModeRecord>> = {};
  for (const m of RECORD_MODES) if (r.byMode?.[m]) byMode[m] = parseModeRecord(r.byMode[m]);
  const scenarios: Record<string, IScenarioRecord> = {};
  const side = (v: unknown): Partial<Record<'A' | 'B', number>> => {
    const o = (v !== null && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    const out: Partial<Record<'A' | 'B', number>> = {};
    for (const k of ['A', 'B'] as const) if (num(o[k]) > 0) out[k] = num(o[k]);
    return out;
  };
  if (r.scenarios && typeof r.scenarios === 'object') {
    for (const [id, v] of Object.entries(r.scenarios)) {
      if (!v || typeof v !== 'object') continue;
      const best: Partial<Record<'A' | 'B', IScenarioBest>> = {};
      const b = (v.best ?? {}) as Record<string, unknown>;
      for (const f of ['A', 'B'] as const) {
        const x = b[f] as Partial<IScenarioBest> | undefined;
        if (x && typeof x === 'object') best[f] = { victory: x.victory === true, sunk: num(x.sunk), lost: num(x.lost) };
      }
      scenarios[id] = { wins: side(v.wins), losses: side(v.losses), ...(Object.keys(best).length > 0 ? { best } : {}) };
    }
  }
  return {
    ...parseModeRecord(r),
    medals: Array.isArray(r.medals) ? r.medals.filter((m): m is string => typeof m === 'string') : [],
    byMode,
    scenarios,
  };
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

function parseModeRecord(raw: unknown): IModeRecord {
  const r = (raw !== null && typeof raw === 'object' ? raw : {}) as Partial<IModeRecord>;
  const sunk: Partial<Record<ShipClass, number>> = {};
  for (const c of Object.values(ShipClass)) {
    const v = num((r.sunk as Record<string, unknown> | undefined)?.[c]);
    if (v > 0) sunk[c] = v;
  }
  return {
    sorties: num(r.sorties),
    victories: num(r.victories),
    perfectVictories: num(r.perfectVictories),
    sunk,
    damageDealt: num(r.damageDealt),
    bestDamage: num(r.bestDamage),
    shipsLost: num(r.shipsLost),
  };
}

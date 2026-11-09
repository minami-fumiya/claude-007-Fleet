import { ICampaignArea } from '@/types/Campaign';
import { IResources } from '@/types/Progression';
import { Nation } from '@/types/Nation';
import { ShipClass } from '@/types/ShipClass';
import { DAY_START_UTC, gameDay, gameWeek, nextReset } from './QuestSystem';

/**
 * 記念日と特別海域 (#416 #387, pure).
 * - 記念日: the days of the great sea battles (and 12 月 8 日). On the day (JST) the battle's historical scenario pays
 *   gold for a win, once a year, and the navies that fought it earn more from every campaign battle.
 * - 特別海域: each game week one sea the admiral has won is fought again by one class of ship only (駆逐艦だけ…),
 *   against its main fleet, for a bigger reward once a week.
 */

export interface IAnniversary {
  id: string;
  /** "12-08" (JST) */
  md: string;
  name: string;
  /** The navies that fought it: their campaign battles earn more that day */
  nations: Nation[];
  /** The historical scenario fought on the day, when there is one */
  scenario?: string;
  /** 記念日を海の上に (0.0.73): where it was fought (longitude, latitude) */
  at?: [number, number];
}

/** Where each anniversary's battle was fought (0.0.73): its ring on the world's sea that day. */
export const ANNIVERSARY_PLACES: Readonly<Record<string, [number, number]>> = {
  pearl_harbor: [-158.0, 21.0], river_plate: [-55.0, -35.5], north_cape: [25.0, 72.5], second_sirte: [18.0, 33.5],
  matapan: [21.5, 35.5], bonomisaki: [128.0, 30.4], coral_sea: [155.0, -15.0], denmark_strait: [-28.0, 66.0],
  bismarck: [-16.0, 48.0], midway: [-177.4, 28.2], sevastopol: [33.0, 44.0], mers_el_kebir: [-0.7, 36.2],
  cape_spada: [24.0, 35.9], savo: [159.8, -9.0], tallinn: [24.0, 59.7], dakar: [-17.8, 14.6], leyte: [125.5, 10.5],
  samar: [126.0, 11.8], guadalcanal: [160.0, -9.2], tassafaronga: [159.9, -9.4],
};

export const ANNIVERSARIES: readonly IAnniversary[] = [
  { id: 'pearl_harbor', md: '12-08', name: '真珠湾攻撃', nations: [Nation.IJN, Nation.USN] },
  { id: 'river_plate', md: '12-13', name: 'ラプラタ沖海戦', nations: [Nation.KM, Nation.RN], scenario: 'river-plate' },
  { id: 'north_cape', md: '12-26', name: '北岬沖海戦', nations: [Nation.KM, Nation.RN], scenario: 'north-cape' },
  { id: 'second_sirte', md: '03-22', name: '第二次シルテ湾海戦', nations: [Nation.RM, Nation.RN], scenario: 'second-sirte' },
  { id: 'matapan', md: '03-28', name: 'マタパン岬沖海戦', nations: [Nation.RM, Nation.RN], scenario: 'matapan' },
  { id: 'bonomisaki', md: '04-07', name: '坊ノ岬沖海戦', nations: [Nation.IJN, Nation.USN], scenario: 'bonomisaki' },
  { id: 'coral_sea', md: '05-08', name: '珊瑚海海戦', nations: [Nation.IJN, Nation.USN], scenario: 'coral-sea' },
  { id: 'denmark_strait', md: '05-24', name: 'デンマーク海峡海戦', nations: [Nation.KM, Nation.RN], scenario: 'denmark-strait' },
  { id: 'bismarck', md: '05-27', name: 'ビスマルク追撃戦', nations: [Nation.KM, Nation.RN], scenario: 'bismarck-chase' },
  { id: 'midway', md: '06-05', name: 'ミッドウェー海戦', nations: [Nation.IJN, Nation.USN], scenario: 'midway' },
  { id: 'sevastopol', md: '06-27', name: 'セヴァストポリ輸送作戦', nations: [Nation.SU, Nation.RM], scenario: 'sevastopol-run' },
  { id: 'mers_el_kebir', md: '07-03', name: 'メルセルケビール海戦', nations: [Nation.FR, Nation.RN], scenario: 'mers-el-kebir' },
  { id: 'cape_spada', md: '07-19', name: 'スパダ岬沖海戦', nations: [Nation.RM, Nation.RN], scenario: 'cape-spada' },
  { id: 'savo', md: '08-08', name: '第一次ソロモン海戦', nations: [Nation.IJN, Nation.USN], scenario: 'savo-island' },
  { id: 'tallinn', md: '08-28', name: 'タリン撤退', nations: [Nation.SU, Nation.KM], scenario: 'tallinn' },
  { id: 'dakar', md: '09-23', name: 'ダカール沖海戦', nations: [Nation.FR, Nation.RN], scenario: 'dakar' },
  { id: 'leyte', md: '10-24', name: 'レイテ沖海戦', nations: [Nation.IJN, Nation.USN], scenario: 'leyte-gulf' },
  { id: 'samar', md: '10-25', name: 'サマール沖海戦', nations: [Nation.IJN, Nation.USN], scenario: 'samar' },
  { id: 'guadalcanal', md: '11-13', name: '第三次ソロモン海戦', nations: [Nation.IJN, Nation.USN], scenario: 'guadalcanal' },
  { id: 'tassafaronga', md: '11-30', name: 'ルンガ沖夜戦', nations: [Nation.IJN, Nation.USN], scenario: 'tassafaronga' },
];

/** Campaign battle rewards of a navy on its anniversary */
export const ANNIVERSARY_REWARD_MUL = 1.25;
/** A win of the day's scenario, once a year */
export const ANNIVERSARY_GOLD = 150;

const JST = 9 * 3_600_000;

/** The JST calendar of `now`: { year, md: "MM-DD" }. */
export function jstDate(now: number): { year: number; md: string } {
  const d = new Date(now + JST);
  return { year: d.getUTCFullYear(), md: `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}` };
}

export function anniversariesOn(now: number): IAnniversary[] {
  const { md } = jstDate(now);
  return ANNIVERSARIES.filter((a) => a.md === md);
}

/** The anniversary of a scenario today, if it is its day. */
export function scenarioAnniversary(scenarioId: string, now: number): IAnniversary | undefined {
  return anniversariesOn(now).find((a) => a.scenario === scenarioId);
}

/** The campaign reward multiplier for `nation` today (1 on ordinary days). */
export function anniversaryRewardMul(nation: Nation, now: number): number {
  return anniversariesOn(now).some((a) => a.nations.includes(nation)) ? ANNIVERSARY_REWARD_MUL : 1;
}

/** The key a year's anniversary win is kept under: "2026:midway" */
export function anniversaryKey(a: IAnniversary, now: number): string {
  return `${jstDate(now).year}:${a.id}`;
}

/** The next anniversary from today on (today's included), for the help and the home strip. */
export function nextAnniversary(now: number): { anniversary: IAnniversary; days: number } {
  for (let days = 0; days < 370; days++) {
    const list = anniversariesOn(now + days * 86_400_000);
    if (list.length > 0) return { anniversary: list[0], days };
  }
  return { anniversary: ANNIVERSARIES[0], days: 0 };
}

/** "12 月 8 日" */
export function mdLabel(md: string): string {
  const [m, d] = md.split('-').map(Number);
  return `${m} 月 ${d} 日`;
}

// ---------------------------------------------------------------------------
// 特別海域

export interface ISpecialRule {
  id: string;
  /** "駆逐艦だけ" */
  name: string;
  shipClass: ShipClass;
}

/** The rules, one a week in turn */
export const SPECIAL_RULES: readonly ISpecialRule[] = [
  { id: 'destroyers', name: '駆逐艦だけ', shipClass: ShipClass.Destroyer },
  { id: 'submarines', name: '潜水艦だけ', shipClass: ShipClass.Submarine },
  { id: 'cruisers', name: '巡洋艦だけ', shipClass: ShipClass.Cruiser },
];

/** The special sea's reward against the area's first-clear reward, and its gold */
export const SPECIAL_REWARD_MUL = 1.5;
export const SPECIAL_GOLD = 120;
/** The special enemy is the area's main fleet made this much weaker (one class against a whole fleet) */
export const SPECIAL_ENEMY_SCALE = 0.75;

export interface ISpecialOps {
  /** The game week whose special sea was won */
  wonWeek?: number;
  /** Anniversary wins, "2026:midway" */
  anniversaries: string[];
}

export function emptySpecialOps(): ISpecialOps {
  return { anniversaries: [] };
}

export function parseSpecialOps(raw: unknown): ISpecialOps {
  if (!raw || typeof raw !== 'object') return emptySpecialOps();
  const o = raw as Record<string, unknown>;
  const list = Array.isArray(o.anniversaries) ? [...new Set(o.anniversaries.filter((x): x is string => typeof x === 'string'))] : [];
  return { anniversaries: list, ...(typeof o.wonWeek === 'number' && Number.isFinite(o.wonWeek) && o.wonWeek >= 0 ? { wonWeek: o.wonWeek } : {}) };
}

function hash(n: number): number {
  let t = (n + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

export function weeklyRule(now: number): ISpecialRule {
  return SPECIAL_RULES[gameWeek(now) % SPECIAL_RULES.length];
}

/**
 * This week's special sea: one of the areas the admiral has won (no training seas), chosen by the week, so it
 * stays put all week and moves on Monday. Undefined before the first clear.
 */
export function weeklyArea(areas: readonly ICampaignArea[], cleared: readonly string[], now: number): ICampaignArea | undefined {
  const won = areas.filter((a) => !a.training && cleared.includes(a.id));
  if (won.length === 0) return undefined;
  return won[hash(gameWeek(now) * 7907) % won.length];
}

export type SpecialState = 'none' | 'open' | 'won';

export function specialState(ops: ISpecialOps | undefined, area: ICampaignArea | undefined, now: number): SpecialState {
  if (!area) return 'none';
  return ops?.wonWeek === gameWeek(now) ? 'won' : 'open';
}

/** Whether a fleet keeps the rule: every ship of the class (an empty fleet does not). */
export function fleetKeepsRule(rule: ISpecialRule, classes: readonly ShipClass[]): boolean {
  return classes.length > 0 && classes.every((c) => c === rule.shipClass);
}

export function specialReward(areaReward: Partial<IResources>): IResources {
  const m = (v: number | undefined): number => Math.round((v ?? 0) * SPECIAL_REWARD_MUL);
  return { fuel: m(areaReward.fuel), ammo: m(areaReward.ammo), steel: m(areaReward.steel), bauxite: m(areaReward.bauxite) };
}

/** A win of the special sea: the week is marked (the reward is the caller's). Null when it was already won. */
export function winSpecial(ops: ISpecialOps | undefined, now: number): ISpecialOps | null {
  const base = ops ?? emptySpecialOps();
  if (base.wonWeek === gameWeek(now)) return null;
  return { ...base, wonWeek: gameWeek(now) };
}

/** A win of a scenario on its anniversary: marked once a year. Null when it isn't the day or was already won. */
export function winAnniversary(ops: ISpecialOps | undefined, scenarioId: string, now: number): { ops: ISpecialOps; anniversary: IAnniversary } | null {
  const a = scenarioAnniversary(scenarioId, now);
  if (!a) return null;
  const base = ops ?? emptySpecialOps();
  const key = anniversaryKey(a, now);
  if (base.anniversaries.includes(key)) return null;
  return { ops: { ...base, anniversaries: [...base.anniversaries, key] }, anniversary: a };
}

/** When the week's special sea changes (Monday 00:00 JST). */
export function nextSpecialAt(now: number): number {
  return nextReset('weekly', now);
}

/** Game day helper re-exported for the screens */
export { gameDay, DAY_START_UTC };

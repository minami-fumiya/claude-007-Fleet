import { IResources } from '@/types/Progression';
import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { Nation } from '@/types/Nation';
import { Formation } from '@/types/Formation';
import { gameHour, gameWeek } from './QuestSystem';

/**
 * 外洋 (#65 オープンワールドの第 1 段階, pure). From the home port the fleet sails a chart of the open sea as far as
 * its supply allows. Rings round the port say how dangerous the water is (1 near home … 10 far out); the enemy groups
 * met in each ring are stronger and pay more. Damage stays with the ships. The fleet must always keep enough supply to
 * sail home: a move or a fight that would leave too little is refused. A lost battle, or every ship badly hurt,
 * brings the fleet home at once.
 */

/** The chart is WORLD_SIZE units square; the port sits at the bottom middle. */
export const WORLD_SIZE = 1000;
export const HOME = { x: 500, y: 930 } as const;
/** Width of a danger ring */
export const RING = 90;
export const MAX_DANGER = 10;
/** Supply a voyage starts with, what a chart unit of sailing takes, and what a battle takes */
export const SUPPLY_MAX = 100;
export const SUPPLY_PER_UNIT = 0.05;
export const BATTLE_SUPPLY = 8;
/** Enemy groups on the chart (one a ring), placed anew every game hour */
export const SPOTS_PER_HOUR = MAX_DANGER;
/** A battle's extra reward per danger, and its gold */
export const WORLD_REWARD_PER_DANGER: IResources = { fuel: 25, ammo: 25, steel: 30, bauxite: 10 };
export const WORLD_GOLD_PER_DANGER = 10;

export interface IPoint {
  x: number;
  y: number;
}

export interface IVoyage {
  x: number;
  y: number;
  supply: number;
  shipIds: string[];
  captainIds: (string | null)[];
  formation: Formation;
  /** Spots won on this voyage ("hour:index") */
  cleared: string[];
  startedAt: number;
}

export interface IWorld {
  voyage: IVoyage | null;
  /** The most dangerous ring a battle was won in, and battles won, on all voyages */
  best: number;
  wins: number;
  /** Spots won this game hour, on any voyage: sailing home and out again doesn't bring them back */
  cleared: string[];
  /** 0.0.66: the hour each port or resource point was last visited, and the week each stronghold fell */
  visits?: Record<string, number>;
  forts?: Record<string, number>;
}

export interface ISpot extends IPoint {
  id: string;
  danger: number;
  enemyNation: Nation;
}

export function emptyWorld(): IWorld {
  return { voyage: null, best: 0, wins: 0, cleared: [], visits: {}, forts: {} };
}

export function distance(a: IPoint, b: IPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** The danger of the water at `p`: 1 by the port, one more each RING out, MAX_DANGER at most. */
export function dangerAt(p: IPoint): number {
  return Math.max(1, Math.min(MAX_DANGER, Math.ceil(distance(HOME, p) / RING)));
}

function hash(n: number): number {
  let t = (n + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/**
 * The enemy groups at sea this game hour: one in each ring, in the upper half round the port, each of a navy other
 * than the player's. The same for everyone at the same hour.
 */
export function worldSpots(now: number, player: Nation, foes: readonly Nation[]): ISpot[] {
  const hour = gameHour(now);
  const others = foes.filter((n) => n !== player);
  return Array.from({ length: SPOTS_PER_HOUR }, (_, i) => {
    const h = hash(hour * 131 + i * 7);
    // The first ring's group keeps clear of the port and its name.
    const r = RING * (i === 0 ? 0.85 : i + 0.5);
    // Upward from the port, up to 70 degrees either side, and no wider than keeps the spot on the chart (so its ring holds).
    const dev = Math.min(((i === 0 ? 35 : 70) * Math.PI) / 180, Math.asin(Math.min(1, (WORLD_SIZE / 2 - 30) / r)));
    const angle = -Math.PI / 2 + ((h % 1000) / 1000 * 2 - 1) * dev;
    const x = Math.max(30, Math.min(WORLD_SIZE - 30, HOME.x + Math.cos(angle) * r));
    const y = Math.max(30, Math.min(WORLD_SIZE - 30, HOME.y + Math.sin(angle) * r));
    const p = { x: Math.round(x), y: Math.round(y) };
    return { id: `${hour}:${i}`, ...p, danger: dangerAt(p), enemyNation: others[(h >>> 9) % Math.max(1, others.length)] ?? player };
  });
}

/** Supply a trip of `units` takes. */
export function supplyFor(units: number): number {
  return Math.ceil(units * SUPPLY_PER_UNIT);
}

/** Why the fleet can't go and fight at `spot` (null when it can): it must keep enough to sail home after. */
export function reachProblem(voyage: IVoyage, spot: IPoint): string | null {
  const need = supplyFor(distance(voyage, spot)) + BATTLE_SUPPLY + supplyFor(distance(spot, HOME));
  return need > voyage.supply ? `補給が足りません (要 ${need} / 残り ${voyage.supply}、帰りの分も要ります)` : null;
}

/** The voyage after sailing to `spot` (the battle there is still to come). */
export function sailTo(voyage: IVoyage, spot: IPoint): IVoyage {
  return { ...voyage, x: spot.x, y: spot.y, supply: Math.max(0, voyage.supply - supplyFor(distance(voyage, spot))) };
}

export function startVoyage(shipIds: string[], captainIds: (string | null)[], formation: Formation, now: number): IVoyage {
  return { ...HOME, supply: SUPPLY_MAX, shipIds: [...shipIds], captainIds: [...captainIds], formation, cleared: [], startedAt: now };
}

/** After a battle at `spotId`: its supply spent and, on a win, the spot marked. */
export function afterBattle(world: IWorld, spotId: string, danger: number, victory: boolean): IWorld {
  const v = world.voyage;
  if (!v) return world;
  const voyage = { ...v, supply: Math.max(0, v.supply - BATTLE_SUPPLY), cleared: victory ? [...new Set([...v.cleared, spotId])] : v.cleared };
  // Only this hour's spots are kept (their ids start with the hour).
  const hour = spotId.split(':')[0];
  // A stronghold (not an hour's group) leaves the hour's list alone; it keeps its own week.
  const isGroup = /^\d+$/.test(hour);
  const cleared = !victory || !isGroup ? (world.cleared ?? []) : [...new Set([...(world.cleared ?? []).filter((id) => id.startsWith(`${hour}:`)), spotId])];
  return { ...world, voyage, best: victory ? Math.max(world.best, danger) : world.best, wins: world.wins + (victory ? 1 : 0), cleared };
}

/** Whether a spot was already won this hour (on this voyage or an earlier one). */
export function spotWon(world: IWorld | undefined, spotId: string): boolean {
  return (world?.cleared ?? []).includes(spotId) || (world?.voyage?.cleared ?? []).includes(spotId);
}

export function endVoyage(world: IWorld): IWorld {
  return { ...world, voyage: null };
}

/** The extra reward of a battle won at this danger. */
export function worldReward(danger: number): IResources {
  const d = Math.max(1, Math.min(MAX_DANGER, danger));
  const w = WORLD_REWARD_PER_DANGER;
  return { fuel: w.fuel * d, ammo: w.ammo * d, steel: w.steel * d, bauxite: w.bauxite * d };
}

export function worldGold(danger: number): number {
  return WORLD_GOLD_PER_DANGER * Math.max(1, Math.min(MAX_DANGER, danger));
}

/** How strong the enemy is against its data at this danger (the battle scales it like a campaign sea). */
export function worldEnemyScale(danger: number): number {
  return 0.55 + 0.08 * Math.max(1, Math.min(MAX_DANGER, danger));
}

/** The classes a group at this danger brings: small ships near home, battle fleets far out. */
export function worldEnemyClasses(danger: number): ShipClass[] {
  const d = Math.max(1, Math.min(MAX_DANGER, danger));
  const count = Math.min(6, 1 + Math.ceil(d / 2));
  const pool: ShipClass[] = d <= 2 ? [ShipClass.Destroyer, ShipClass.Destroyer, ShipClass.Submarine]
    : d <= 4 ? [ShipClass.Cruiser, ShipClass.Destroyer, ShipClass.Destroyer]
      : d <= 6 ? [ShipClass.Cruiser, ShipClass.Battleship, ShipClass.Destroyer, ShipClass.Cruiser]
        : d <= 8 ? [ShipClass.Battleship, ShipClass.Carrier, ShipClass.Cruiser, ShipClass.Destroyer]
          : [ShipClass.Battleship, ShipClass.Carrier, ShipClass.Battleship, ShipClass.Cruiser, ShipClass.Destroyer];
  return Array.from({ length: count }, (_, i) => pool[i % pool.length]);
}

/**
 * The enemy group of a spot: ships of its navy by class, older near home and newer far out (a stable choice per
 * spot). Ships the navy lacks of a class are taken from its destroyers.
 */
export function worldEnemyFleet(roster: readonly IShipData[], spot: Pick<ISpot, 'id' | 'danger'>): IShipData[] {
  const usable = roster.filter((s) => !s.designed && !s.foreign && !s.blueprint && s.hp > 0);
  const seed = [...spot.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9973, 7);
  return worldEnemyClasses(spot.danger).map((c, i) => {
    const kind = usable.filter((s) => s.shipClass === c);
    const list = (kind.length > 0 ? kind : usable.filter((s) => s.shipClass === ShipClass.Destroyer)).slice().sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || a.hp - b.hp);
    if (list.length === 0) return usable[0];
    const at = Math.min(list.length - 1, Math.floor(((spot.danger - 1) / (MAX_DANGER - 1)) * (list.length - 1)) + ((seed + i) % 2));
    return list[Math.max(0, at)];
  }).filter((s): s is IShipData => s !== undefined);
}

/** Whether the fleet must come home after a battle: lost, or every ship badly hurt. */
export function mustReturn(victory: boolean, hpFractions: readonly number[], heavy: number): boolean {
  return !victory || hpFractions.length === 0 || hpFractions.every((f) => f <= heavy);
}

/** Read from a save: anything missing or odd falls back to the port. */
export function parseWorld(raw: unknown): IWorld {
  if (!raw || typeof raw !== 'object') return emptyWorld();
  const o = raw as Record<string, unknown>;
  const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
  const v = o.voyage as Record<string, unknown> | null | undefined;
  const ids = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []);
  const voyage: IVoyage | null = v && typeof v === 'object' && ids(v.shipIds).length > 0
    ? {
      x: Math.min(WORLD_SIZE, num(v.x, HOME.x)), y: Math.min(WORLD_SIZE, num(v.y, HOME.y)), supply: Math.min(SUPPLY_MAX, num(v.supply)),
      shipIds: ids(v.shipIds), captainIds: Array.isArray(v.captainIds) ? v.captainIds.map((c) => (typeof c === 'string' ? c : null)) : [],
      formation: (Object.values(Formation) as string[]).includes(v.formation as string) ? (v.formation as Formation) : Formation.LineAhead,
      cleared: ids(v.cleared), startedAt: num(v.startedAt),
    }
    : null;
  const counts = (x: unknown): Record<string, number> => (x && typeof x === 'object' ? Object.fromEntries(Object.entries(x as Record<string, unknown>).filter(([, n]) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) as Record<string, number> : {});
  return { voyage, best: Math.min(MAX_DANGER, num(o.best)), wins: num(o.wins), cleared: ids(o.cleared), visits: counts(o.visits), forts: counts(o.forts) };
}

/** The ships out on a voyage (they can't sail elsewhere until it ends). */
export function voyageShipIds(world: IWorld | undefined): string[] {
  return world?.voyage?.shipIds ?? [];
}

// ---------------------------------------------------------------------------
// 0.0.66 第 2 段階: each navy's chart, its ports, resource points and the enemy stronghold

/** Each navy's sea (the chart's name) */
export const WORLD_SEA: Record<Nation, string> = {
  [Nation.IJN]: '西太平洋', [Nation.USN]: '中部太平洋', [Nation.KM]: '北海とノルウェー海', [Nation.RN]: '北大西洋',
  [Nation.FR]: '大西洋とビスケー湾', [Nation.SU]: 'バルト海と北極海', [Nation.RM]: '地中海',
};

export type FeatureKind = 'port' | 'oil' | 'mine' | 'convoy' | 'fort';

export interface IFeature extends IPoint {
  id: string;
  kind: FeatureKind;
  name: string;
  danger: number;
}

export const FEATURE_MARK: Record<FeatureKind, string> = { port: '港', oil: '油', mine: '鉱', convoy: '船', fort: '要' };
export const FEATURE_KIND: Record<FeatureKind, string> = { port: '港', oil: '油田', mine: '鉱山', convoy: '船団の航路', fort: '敵の要塞' };

/** Each navy's places, by name: two ports, three resource points and the enemy's stronghold far out. */
const PLACE_NAMES: Record<Nation, { port: [string, string]; oil: string; mine: string; convoy: string; fort: string }> = {
  [Nation.IJN]: { port: ['トラック泊地', 'パラオ'], oil: 'パレンバン油田', mine: '海南島の鉱山', convoy: '南方航路', fort: 'ミッドウェー島' },
  [Nation.USN]: { port: ['真珠湾', 'エスピリトゥサント'], oil: 'カリフォルニア油田', mine: 'アラスカの鉱山', convoy: '太平洋航路', fort: 'トラック環礁' },
  [Nation.KM]: { port: ['ヴィルヘルムスハーフェン', 'トロンハイム'], oil: 'ルーマニアの油田', mine: 'キルナの鉄鉱山', convoy: '北海航路', fort: 'スカパ・フロー' },
  [Nation.RN]: { port: ['スカパ・フロー', 'ジブラルタル'], oil: 'アバダン油田', mine: 'ウェールズの炭鉱', convoy: '援ソ船団の航路', fort: 'ブレスト' },
  [Nation.FR]: { port: ['ブレスト', 'ダカール'], oil: 'モスル油田', mine: 'ロレーヌの鉄鉱山', convoy: '北アフリカ航路', fort: 'ヴィルヘルムスハーフェン' },
  [Nation.SU]: { port: ['クロンシュタット', 'ムルマンスク'], oil: 'バクー油田', mine: 'ウラルの鉱山', convoy: '援ソ船団の航路', fort: 'キール' },
  [Nation.RM]: { port: ['ターラント', 'トブルク'], oil: 'リビアの油田', mine: 'サルデーニャの鉱山', convoy: '北アフリカ航路', fort: 'マルタ島' },
};

/** Where each kind sits: its ring and side (–1 left … 1 right), turned a little by the navy so every chart differs. */
const LAYOUT: Array<{ kind: FeatureKind; ring: number; side: number; index?: 0 | 1 }> = [
  { kind: 'port', ring: 3.4, side: -0.55, index: 0 },
  { kind: 'oil', ring: 2.4, side: 0.6 },
  { kind: 'mine', ring: 4.6, side: 0.75 },
  { kind: 'port', ring: 6.4, side: 0.3, index: 1 },
  { kind: 'convoy', ring: 5.5, side: -0.85 },
  { kind: 'fort', ring: 8.6, side: -0.2 },
];

export function worldFeatures(nation: Nation): IFeature[] {
  const names = PLACE_NAMES[nation] ?? PLACE_NAMES[Nation.IJN];
  const tilt = (hash([...nation].reduce((n, c) => n * 31 + c.charCodeAt(0), 7)) % 100) / 100 * 0.5 - 0.25;
  return LAYOUT.map((l, i) => {
    const r = RING * l.ring;
    const side = Math.max(-1, Math.min(1, l.side + (l.kind === 'fort' ? tilt : tilt * 0.6)));
    const dev = Math.min((70 * Math.PI) / 180, Math.asin(Math.min(1, (WORLD_SIZE / 2 - 40) / r)));
    const angle = -Math.PI / 2 + side * dev;
    const p = { x: Math.round(HOME.x + Math.cos(angle) * r), y: Math.round(HOME.y + Math.sin(angle) * r) };
    const name = l.kind === 'port' ? names.port[l.index ?? 0] : names[l.kind as Exclude<FeatureKind, 'port'>];
    return { id: `${l.kind}${l.kind === 'port' ? l.index : ''}:${nation}:${i}`, kind: l.kind, name, ...p, danger: dangerAt(p) };
  });
}

/** Spots keep this far from the places on the chart (so their marks never sit on each other). */
export const FEATURE_CLEARANCE = 70;

/** This hour's groups moved clear of the navy's places (each one stepped round its ring until it is). */
export function clearOfFeatures(spots: readonly ISpot[], features: readonly IPoint[]): ISpot[] {
  return spots.map((s) => {
    let p: IPoint = s;
    const r = distance(HOME, s);
    let angle = Math.atan2(s.y - HOME.y, s.x - HOME.x);
    for (let k = 0; k < 24 && features.some((f) => distance(f, p) < FEATURE_CLEARANCE); k++) {
      angle += (k % 2 === 0 ? 1 : -1) * (k + 1) * 0.12;
      if (angle > -0.15 || angle < -Math.PI + 0.15) continue;
      p = { x: Math.round(Math.max(30, Math.min(WORLD_SIZE - 30, HOME.x + Math.cos(angle) * r))), y: Math.round(Math.max(30, Math.min(WORLD_SIZE - 30, HOME.y + Math.sin(angle) * r))) };
    }
    return { ...s, x: p.x, y: p.y, danger: dangerAt(p) };
  });
}

/** A port call refills the supply and patches the ships up to this share of their HP. */
export const PORT_REPAIR = 0.6;
/** A resource point pays this per danger, by its kind */
export const RESOURCE_PER_DANGER: Record<'oil' | 'mine' | 'convoy', IResources> = {
  oil: { fuel: 60, ammo: 0, steel: 0, bauxite: 0 },
  mine: { fuel: 0, ammo: 0, steel: 50, bauxite: 25 },
  convoy: { fuel: 25, ammo: 25, steel: 25, bauxite: 10 },
};
/** The stronghold taken: its reward, its gold, and how much safer the water round it is that week */
export const FORT_REWARD: IResources = { fuel: 1500, ammo: 1500, steel: 2000, bauxite: 800 };
export const FORT_GOLD = 300;
export const FORT_SAFE_RADIUS = 260;
export const FORT_SAFE_DANGER = 2;

export function resourceReward(kind: FeatureKind, danger: number): IResources {
  const per = kind === 'oil' || kind === 'mine' || kind === 'convoy' ? RESOURCE_PER_DANGER[kind] : { fuel: 0, ammo: 0, steel: 0, bauxite: 0 };
  const d = Math.max(1, Math.min(MAX_DANGER, danger));
  return { fuel: per.fuel * d, ammo: per.ammo * d, steel: per.steel * d, bauxite: per.bauxite * d };
}

/** The game hour a port or resource point was last visited, and the week each stronghold fell. */
export interface IWorldVisits {
  visits: Record<string, number>;
  forts: Record<string, number>;
}

/** Whether a place can be used now: ports and resources once an hour, a stronghold once a week. */
export function featureReady(world: Pick<IWorld, 'visits' | 'forts'> | undefined, f: IFeature, now: number): boolean {
  if (f.kind === 'fort') return (world?.forts?.[f.id] ?? -1) !== gameWeek(now);
  return (world?.visits?.[f.id] ?? -1) !== gameHour(now);
}

/** Why the fleet can't go to a place (null when it can): enough to get there, fight if it must, and sail home. */
export function featureProblem(voyage: IVoyage, f: IFeature): string | null {
  // A port refills the supply, so only the way there counts.
  if (f.kind === 'port') {
    const need = supplyFor(distance(voyage, f));
    return need > voyage.supply ? `補給が足りません (要 ${need} / 残り ${voyage.supply})` : null;
  }
  if (f.kind === 'fort') return reachProblem(voyage, f);
  const need = supplyFor(distance(voyage, f)) + supplyFor(distance(f, HOME));
  return need > voyage.supply ? `補給が足りません (要 ${need} / 残り ${voyage.supply}、帰りの分も要ります)` : null;
}

/** A port call: there, the supply refilled, the hour marked. The ships' repairs are the caller's (they live in the save). */
export function callAtPort(world: IWorld, port: IFeature, now: number): IWorld {
  const v = world.voyage;
  if (!v) return world;
  return { ...world, voyage: { ...sailTo(v, port), supply: SUPPLY_MAX }, visits: { ...(world.visits ?? {}), [port.id]: gameHour(now) } };
}

/** A resource point visited: there, the hour marked (the reward is the caller's). */
export function visitResource(world: IWorld, point: IFeature, now: number): IWorld {
  const v = world.voyage;
  if (!v) return world;
  return { ...world, voyage: sailTo(v, point), visits: { ...(world.visits ?? {}), [point.id]: gameHour(now) } };
}

export function takeFort(world: IWorld, fortId: string, now: number): IWorld {
  return { ...world, forts: { ...(world.forts ?? {}), [fortId]: gameWeek(now) } };
}

/** The strongholds taken this week: the water round them is safer. */
export function safeAround(world: Pick<IWorld, 'forts'> | undefined, features: readonly IFeature[], now: number): IPoint[] {
  return features.filter((f) => f.kind === 'fort' && world?.forts?.[f.id] === gameWeek(now));
}

/** A group's danger with the strongholds taken this week round it. */
export function safeDanger(spot: Pick<ISpot, 'x' | 'y' | 'danger'>, safe: readonly IPoint[]): number {
  return safe.some((p) => distance(p, spot) <= FORT_SAFE_RADIUS) ? Math.max(1, spot.danger - FORT_SAFE_DANGER) : spot.danger;
}

/** The stronghold's garrison: a strong group of its sea's year, its batteries on the island. */
/** The navy that holds each navy's stronghold */
export const FORT_NATION: Record<Nation, Nation> = {
  [Nation.IJN]: Nation.USN, [Nation.USN]: Nation.IJN, [Nation.KM]: Nation.RN, [Nation.RN]: Nation.KM,
  [Nation.FR]: Nation.KM, [Nation.SU]: Nation.KM, [Nation.RM]: Nation.RN,
};

export function fortDanger(): number {
  return MAX_DANGER - 1;
}

import { Objective } from '@/types/Campaign';

/** Win / loss rules for each operation objective (pure). */

/** Convoy escort: this many merchant ships must get through. */
export const CONVOY_NEEDED = 2;

export interface IObjectiveState {
  flagshipAlive: boolean;
  /** Enemy warships still afloat */
  enemiesAlive: number;
  enemiesTotal: number;
  /** Convoy escort */
  convoyTotal?: number;
  convoyEscaped?: number;
  convoyLost?: number;
  /** Convoy HP left and in all (#186), for the objective line. */
  convoyHp?: number;
  convoyMaxHp?: number;
  /** Shore bombardment */
  landTargetsAlive?: number;
  /** Shore targets in all (#421) */
  landTargetsTotal?: number;
  /** Scenario objectives */
  targetsAlive?: number;
  /** Objective ships in all (#421) */
  targetsTotal?: number;
  /** How far the escaping target got toward its zone (0 at the start, 1 there), for PreventEscape / Delay (#421) */
  escapeProgress?: number;
  flagshipInZone?: boolean;
  /** An enemy objective ship reached the zone */
  enemyInZone?: boolean;
  elapsedSec?: number;
  /** 0 / absent = no time limit */
  timeLimitSec?: number;
}

export type Outcome = 'victory' | 'defeat' | null;

export function evaluateObjective(objective: Objective, s: IObjectiveState): Outcome {
  if (!s.flagshipAlive) return 'defeat';
  const timeUp = (s.timeLimitSec ?? 0) > 0 && (s.elapsedSec ?? 0) >= (s.timeLimitSec ?? 0);
  switch (objective) {
    case Objective.SinkTargets:
      if ((s.targetsAlive ?? 0) === 0) return 'victory';
      return timeUp ? 'defeat' : null;
    case Objective.Breakthrough:
      if (s.flagshipInZone) return 'victory';
      return timeUp ? 'defeat' : null;
    case Objective.PreventEscape:
      if (s.enemyInZone) return 'defeat';
      if ((s.targetsAlive ?? 0) === 0) return 'victory';
      return timeUp ? 'defeat' : null;
    case Objective.Delay:
      if (s.enemyInZone) return 'defeat';
      if (timeUp || (s.targetsAlive ?? 1) === 0) return 'victory';
      return null;
    case Objective.Convoy: {
      const total = s.convoyTotal ?? 0;
      const escaped = s.convoyEscaped ?? 0;
      const lost = s.convoyLost ?? 0;
      if (total - lost < CONVOY_NEEDED) return 'defeat';
      if (escaped >= CONVOY_NEEDED && escaped + lost >= total) return 'victory';
      // With the attackers gone the convoy is safe.
      if (s.enemiesTotal > 0 && s.enemiesAlive === 0) return 'victory';
      return null;
    }
    case Objective.Bombard:
      return (s.landTargetsAlive ?? 0) === 0 ? 'victory' : null;
    default:
      return s.enemiesTotal > 0 && s.enemiesAlive === 0 ? 'victory' : null;
  }
}

/**
 * Why the battle ended (#335), for the results: the objective's own words, not "旗艦が撃沈された" for every loss (a convoy
 * that lost its merchants, a time limit or an escaped enemy said the flagship sank).
 */
export function outcomeReason(objective: Objective, s: IObjectiveState, victory: boolean): string {
  const timeUp = (s.timeLimitSec ?? 0) > 0 && (s.elapsedSec ?? 0) >= (s.timeLimitSec ?? 0);
  const allSunk = s.enemiesTotal > 0 && s.enemiesAlive === 0;
  if (!victory) {
    if (!s.flagshipAlive) return '旗艦が撃沈された…';
    switch (objective) {
      case Objective.Convoy: return `輸送船が ${s.convoyLost ?? 0} 隻沈められ、船団を守れなかった…`;
      case Objective.PreventEscape: return s.enemyInZone ? '目標の敵艦に逃げられた…' : '時間切れ。目標の敵艦を沈められなかった…';
      case Objective.Delay: return '敵の突破を許した…';
      case Objective.Breakthrough: return '時間切れ。突破できなかった…';
      case Objective.SinkTargets: return '時間切れ。目標を沈められなかった…';
      default: return timeUp ? '時間切れ…' : '作戦に失敗した…';
    }
  }
  switch (objective) {
    case Objective.Convoy:
      return allSunk && (s.convoyEscaped ?? 0) < CONVOY_NEEDED ? '敵を殲滅し、船団を守り抜いた！' : `輸送船 ${s.convoyEscaped ?? 0} 隻が無事に抜けた！`;
    case Objective.SinkTargets: return '目標を撃沈した！';
    case Objective.Breakthrough: return '突破に成功した！';
    case Objective.PreventEscape: return '目標の敵艦を逃さず撃沈した！';
    case Objective.Delay: return allSunk ? '敵艦隊を殲滅した！' : '時間まで敵を食い止めた！';
    case Objective.Bombard: return '地上の目標をすべて破壊した！';
    default: return '敵艦隊を殲滅した！';
  }
}

/** Short HUD line describing progress towards the objective. */
function clock(sec: number): string {
  const t = Math.max(0, Math.ceil(sec));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** "  ·  船団 HP 72%" (#186): the convoy's HP left over all its ships, escaped ones included. */
export function convoyHpText(s: IObjectiveState): string {
  const max = s.convoyMaxHp ?? 0;
  if (max <= 0) return '';
  return `  ·  船団 HP ${Math.round((100 * Math.max(0, s.convoyHp ?? 0)) / max)}%`;
}

export function objectiveStatus(objective: Objective, s: IObjectiveState): string {
  const left = (s.timeLimitSec ?? 0) > 0 ? `  ·  残り ${clock((s.timeLimitSec ?? 0) - (s.elapsedSec ?? 0))}` : '';
  switch (objective) {
    case Objective.SinkTargets:
      return `目標艦  残り ${s.targetsAlive ?? 0}${left}`;
    case Objective.Breakthrough:
      return `旗艦を突入地点へ${left}`;
    case Objective.PreventEscape:
      return `目標艦の脱出を阻止せよ${left}`;
    case Objective.Delay:
      return `敵の突入を阻止せよ${left}`;
    case Objective.Convoy:
      return `船団  脱出 ${s.convoyEscaped ?? 0} / 必要 ${CONVOY_NEEDED}  ·  喪失 ${s.convoyLost ?? 0}${convoyHpText(s)}`;
    case Objective.Bombard:
      return `陸上目標  残り ${s.landTargetsAlive ?? 0}`;
    default:
      return '';
  }
}

/**
 * What the pause sheet shows (#189): the objective, the battle clock (with its limit), both fleets' state and the
 * objective's own progress. `goal` is the objective as the map words it ("敵旗艦の撃沈 — 突入地点 (6:00 以内)").
 */
export function pauseLines(objective: Objective, goal: string, s: IObjectiveState, fleet: { alive: number; total: number }): string[] {
  const limit = s.timeLimitSec ?? 0;
  const elapsed = s.elapsedSec ?? 0;
  const lines = [
    `作戦目標  ${goal}`,
    `経過  ${clock(elapsed)}${limit > 0 ? `  /  制限 ${clock(limit)}  (残り ${clock(limit - elapsed)})` : ''}`,
    `敵艦  撃沈 ${s.enemiesTotal - s.enemiesAlive} / ${s.enemiesTotal}`,
    `味方  健在 ${fleet.alive} / ${fleet.total}${s.flagshipAlive ? '' : '  (旗艦喪失)'}`,
  ];
  // The time limit is already on the clock line.
  const status = objectiveStatus(objective, { ...s, timeLimitSec: 0 }).trim();
  if (status) lines.push(`進捗  ${status}`);
  return lines;
}

/**
 * Throttle that brings a ship `distance` px away to its goal in `arrivalSec` (velocity = speed × throttle px/s).
 * A Delay's target (#40) used to run in at full speed and reach the zone within seconds.
 */
export function goalThrottle(distance: number, speed: number, arrivalSec?: number): number {
  if (!arrivalSec || speed <= 0) return 1;
  return Math.min(1, Math.max(0.1, distance / (arrivalSec * speed)));
}

export interface IBattleBannerInput {
  areaName?: string;
  /** The sortie's node: battle n of m, and whether it is the main fleet */
  sortie?: { node: number; battles: number; boss: boolean };
  exercise?: boolean;
  scenarioName?: string;
  /** What wins the battle, in the map's words */
  goal: string;
  timeLimitSec?: number;
}

/**
 * The two lines shown as a battle opens (#279): which fight this is — "サボ島沖  ·  第 2 / 3 戦  ·  前哨戦" — and how
 * it is won, with the time limit when there is one.
 */
export function battleBanner(b: IBattleBannerInput): [string, string] {
  const kind = b.scenarioName
    ? `史実: ${b.scenarioName}`
    : b.exercise
      ? '演習'
      : [b.areaName, b.sortie && b.sortie.battles > 1 ? `第 ${b.sortie.node} / ${b.sortie.battles} 戦` : '', b.sortie ? (b.sortie.boss ? '主力戦' : '前哨戦') : '主力戦'].filter((t) => t).join('  ·  ');
  const limit = b.timeLimitSec ? `  (制限 ${Math.floor(b.timeLimitSec / 60)}分${b.timeLimitSec % 60 ? `${b.timeLimitSec % 60}秒` : ''})` : '';
  return [kind, `勝利条件: ${b.goal}${limit}`];
}

/** One of the results' three stat cards (#421). */
export interface IObjectiveStat {
  label: string;
  value: string;
}

/** The objective's own numbers for the results (#421): three cards and how far the objective was achieved. */
export interface IObjectiveResult {
  stats: [IObjectiveStat, IObjectiveStat, IObjectiveStat];
  /** One line under the rank: "船団の残り耐久 82%・4 隻中 3 隻" */
  achievement: string;
}

/** The share of the convoy's HP left, 0..1 (1 with no convoy). */
export function convoyHpRatio(s: IObjectiveState): number {
  const max = s.convoyMaxHp ?? 0;
  return max > 0 ? Math.max(0, s.convoyHp ?? 0) / max : 1;
}

/**
 * What the results show for each objective (#421): a convoy its HP and ships left, a breakthrough the time it took
 * and the time to spare, a bombardment the shore targets destroyed, and so on. `fleet` is the player's ships left.
 */
export function objectiveResult(objective: Objective, s: IObjectiveState, fleet: { alive: number; total: number }): IObjectiveResult {
  const limit = s.timeLimitSec ?? 0;
  const elapsed = s.elapsedSec ?? 0;
  const pct = (v: number): string => `${Math.round(v * 100)}%`;
  const time: IObjectiveStat = { label: '戦闘時間', value: clock(elapsed) };
  const spare: IObjectiveStat = { label: '残り時間', value: limit > 0 ? clock(limit - elapsed) : '—' };
  const sunk: IObjectiveStat = { label: '撃沈', value: `${s.enemiesTotal - s.enemiesAlive} / ${s.enemiesTotal}` };
  const left: IObjectiveStat = { label: '残存', value: `${fleet.alive} / ${fleet.total}` };
  switch (objective) {
    case Objective.Convoy: {
      const total = s.convoyTotal ?? 0;
      const kept = total - (s.convoyLost ?? 0);
      return {
        stats: [{ label: '船団の残り耐久', value: pct(convoyHpRatio(s)) }, { label: '残った輸送船', value: `${kept} / ${total}` }, time],
        achievement: `船団の残り耐久 ${pct(convoyHpRatio(s))}・輸送船 ${total} 隻中 ${kept} 隻`,
      };
    }
    case Objective.Breakthrough:
      return {
        stats: [{ label: '突入までの時間', value: s.flagshipInZone ? clock(elapsed) : '—' }, spare, left],
        achievement: s.flagshipInZone ? `${clock(elapsed)} で突入${limit > 0 ? ` (制限 ${clock(limit)})` : ''}` : '突入できず',
      };
    case Objective.Bombard: {
      const total = s.landTargetsTotal ?? 0;
      const down = total - (s.landTargetsAlive ?? 0);
      return { stats: [{ label: '地上目標', value: `${down} / ${total}` }, sunk, time], achievement: `地上目標 ${total} 中 ${down} を破壊` };
    }
    case Objective.SinkTargets: {
      const total = s.targetsTotal ?? 0;
      const down = total - (s.targetsAlive ?? 0);
      return { stats: [{ label: '撃沈目標', value: `${down} / ${total}` }, time, spare], achievement: `目標 ${total} 隻中 ${down} 隻を ${clock(elapsed)} で撃沈` };
    }
    case Objective.PreventEscape: {
      const away = 1 - Math.min(1, Math.max(0, s.escapeProgress ?? 0));
      return { stats: [{ label: '逃げ切りまで', value: s.enemyInZone ? '0%' : pct(away) }, spare, left], achievement: s.enemyInZone ? '目標に逃げ切られた' : `逃げ切りまで残り ${pct(away)} の地点で阻止` };
    }
    case Objective.Delay: {
      const held = limit > 0 ? Math.min(elapsed, limit) : elapsed;
      return { stats: [{ label: '守った時間', value: limit > 0 ? `${clock(held)} / ${clock(limit)}` : clock(held) }, sunk, left], achievement: limit > 0 ? `目標の時間 ${clock(limit)} のうち ${clock(held)} を守った` : `${clock(held)} 守った` };
    }
    default:
      return { stats: [sunk, left, time], achievement: `敵艦 ${s.enemiesTotal} 隻中 ${s.enemiesTotal - s.enemiesAlive} 隻を撃沈` };
  }
}

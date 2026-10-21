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
  /** Scenario objectives */
  targetsAlive?: number;
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

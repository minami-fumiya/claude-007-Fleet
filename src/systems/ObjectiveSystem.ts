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
      return `船団  脱出 ${s.convoyEscaped ?? 0} / 必要 ${CONVOY_NEEDED}  ·  喪失 ${s.convoyLost ?? 0}`;
    case Objective.Bombard:
      return `陸上目標  残り ${s.landTargetsAlive ?? 0}`;
    default:
      return '';
  }
}

/**
 * Throttle that brings a ship `distance` px away to its goal in `arrivalSec` (velocity = speed × throttle px/s).
 * A Delay's target (#40) used to run in at full speed and reach the zone within seconds.
 */
export function goalThrottle(distance: number, speed: number, arrivalSec?: number): number {
  if (!arrivalSec || speed <= 0) return 1;
  return Math.min(1, Math.max(0.1, distance / (arrivalSec * speed)));
}

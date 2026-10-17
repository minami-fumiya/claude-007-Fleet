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
}

export type Outcome = 'victory' | 'defeat' | null;

export function evaluateObjective(objective: Objective, s: IObjectiveState): Outcome {
  if (!s.flagshipAlive) return 'defeat';
  switch (objective) {
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
export function objectiveStatus(objective: Objective, s: IObjectiveState): string {
  switch (objective) {
    case Objective.Convoy:
      return `船団  脱出 ${s.convoyEscaped ?? 0} / 必要 ${CONVOY_NEEDED}  ·  喪失 ${s.convoyLost ?? 0}`;
    case Objective.Bombard:
      return `陸上目標  残り ${s.landTargetsAlive ?? 0}`;
    default:
      return '';
  }
}

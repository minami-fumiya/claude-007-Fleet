import { describe, it, expect } from 'vitest';
import { CONVOY_NEEDED, evaluateObjective, objectiveStatus } from '@/systems/ObjectiveSystem';
import { Objective } from '@/types/Campaign';

const base = { flagshipAlive: true, enemiesAlive: 2, enemiesTotal: 3 };

describe('ObjectiveSystem', () => {
  it('loses whenever the flagship sinks', () => {
    for (const o of Object.values(Objective)) {
      expect(evaluateObjective(o, { ...base, flagshipAlive: false, enemiesAlive: 0 })).toBe('defeat');
    }
  });

  it('annihilation needs every enemy sunk', () => {
    expect(evaluateObjective(Objective.Annihilate, base)).toBeNull();
    expect(evaluateObjective(Objective.Annihilate, { ...base, enemiesAlive: 0 })).toBe('victory');
  });

  it('convoy: wins when enough ships are through and the rest are accounted for', () => {
    const c = { ...base, convoyTotal: 3 };
    expect(evaluateObjective(Objective.Convoy, { ...c, convoyEscaped: CONVOY_NEEDED, convoyLost: 0 })).toBeNull();
    expect(evaluateObjective(Objective.Convoy, { ...c, convoyEscaped: 2, convoyLost: 1 })).toBe('victory');
    expect(evaluateObjective(Objective.Convoy, { ...c, convoyEscaped: 3, convoyLost: 0 })).toBe('victory');
  });

  it('convoy: loses when too many ships are sunk, wins early if the attackers are gone', () => {
    const c = { ...base, convoyTotal: 3 };
    expect(evaluateObjective(Objective.Convoy, { ...c, convoyEscaped: 0, convoyLost: 2 })).toBe('defeat');
    expect(evaluateObjective(Objective.Convoy, { ...c, enemiesAlive: 0, convoyEscaped: 0, convoyLost: 1 })).toBe('victory');
  });

  it('bombardment ignores enemy ships and needs every shore target destroyed', () => {
    expect(evaluateObjective(Objective.Bombard, { ...base, landTargetsAlive: 2 })).toBeNull();
    expect(evaluateObjective(Objective.Bombard, { ...base, landTargetsAlive: 0 })).toBe('victory');
  });

  it('describes progress for the HUD', () => {
    expect(objectiveStatus(Objective.Convoy, { ...base, convoyEscaped: 1, convoyLost: 1 })).toContain('脱出 1');
    expect(objectiveStatus(Objective.Bombard, { ...base, landTargetsAlive: 3 })).toContain('3');
    expect(objectiveStatus(Objective.Annihilate, base)).toBe('');
  });
});

describe('scenario objectives', () => {
  const s = { flagshipAlive: true, enemiesAlive: 3, enemiesTotal: 3, timeLimitSec: 300 };

  it('sink targets before the clock runs out', () => {
    expect(evaluateObjective(Objective.SinkTargets, { ...s, targetsAlive: 1, elapsedSec: 10 })).toBeNull();
    expect(evaluateObjective(Objective.SinkTargets, { ...s, targetsAlive: 0, elapsedSec: 10 })).toBe('victory');
    expect(evaluateObjective(Objective.SinkTargets, { ...s, targetsAlive: 1, elapsedSec: 300 })).toBe('defeat');
  });

  it('break through to the zone', () => {
    expect(evaluateObjective(Objective.Breakthrough, { ...s, flagshipInZone: true, elapsedSec: 10 })).toBe('victory');
    expect(evaluateObjective(Objective.Breakthrough, { ...s, flagshipInZone: false, elapsedSec: 301 })).toBe('defeat');
  });

  it('prevent the escape of a target', () => {
    expect(evaluateObjective(Objective.PreventEscape, { ...s, targetsAlive: 1, enemyInZone: true })).toBe('defeat');
    expect(evaluateObjective(Objective.PreventEscape, { ...s, targetsAlive: 0, elapsedSec: 10 })).toBe('victory');
    expect(evaluateObjective(Objective.PreventEscape, { ...s, targetsAlive: 1, elapsedSec: 300 })).toBe('defeat');
  });

  it('delay: hold until time is up or the attacker is sunk', () => {
    expect(evaluateObjective(Objective.Delay, { ...s, targetsAlive: 1, elapsedSec: 300 })).toBe('victory');
    expect(evaluateObjective(Objective.Delay, { ...s, targetsAlive: 0, elapsedSec: 10 })).toBe('victory');
    expect(evaluateObjective(Objective.Delay, { ...s, targetsAlive: 1, enemyInZone: true })).toBe('defeat');
    expect(evaluateObjective(Objective.Delay, { ...s, targetsAlive: 1, elapsedSec: 10 })).toBeNull();
  });

  it('shows the time left', () => {
    expect(objectiveStatus(Objective.SinkTargets, { ...s, targetsAlive: 2, elapsedSec: 100 })).toContain('残り 3:20');
  });
});

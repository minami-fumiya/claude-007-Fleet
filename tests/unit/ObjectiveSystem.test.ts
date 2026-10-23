import { describe, it, expect } from 'vitest';
import { battleBanner, CONVOY_NEEDED, evaluateObjective, objectiveStatus, outcomeReason, pauseLines } from '@/systems/ObjectiveSystem';
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
    // The convoy's HP over all its ships (#186)
    expect(objectiveStatus(Objective.Convoy, { ...base, convoyHp: 360, convoyMaxHp: 500 })).toContain('船団 HP 72%');
    expect(objectiveStatus(Objective.Convoy, { ...base, convoyHp: -20, convoyMaxHp: 500 })).toContain('船団 HP 0%');
    expect(objectiveStatus(Objective.Convoy, base)).not.toContain('HP');
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

describe('pause sheet (#189)', () => {
  it('shows the objective, the clock, both fleets and the progress', () => {
    const lines = pauseLines(Objective.SinkTargets, '敵旗艦の撃沈', { ...base, targetsAlive: 1, elapsedSec: 130, timeLimitSec: 360 }, { alive: 3, total: 4 });
    expect(lines[0]).toBe('作戦目標  敵旗艦の撃沈');
    expect(lines[1]).toBe('経過  2:10  /  制限 6:00  (残り 3:50)');
    expect(lines).toContain('敵艦  撃沈 1 / 3');
    expect(lines).toContain('味方  健在 3 / 4');
    // The limit is on the clock line, not repeated in the progress.
    expect(lines.at(-1)).toBe('進捗  目標艦  残り 1');
  });

  it('a plain fight has no progress line and no limit', () => {
    const lines = pauseLines(Objective.Annihilate, '敵艦隊の殲滅', { ...base, elapsedSec: 5 }, { alive: 1, total: 1 });
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('経過  0:05');
  });
});

describe('the battle banner (#279)', () => {
  it('names the fight and how it is won', () => {
    expect(battleBanner({ areaName: 'サボ島沖', sortie: { node: 2, battles: 3, boss: false }, goal: '敵艦隊の全滅' })).toEqual(['サボ島沖  ·  第 2 / 3 戦  ·  前哨戦', '勝利条件: 敵艦隊の全滅']);
    expect(battleBanner({ areaName: '海峡突破', sortie: { node: 3, battles: 3, boss: true }, goal: '泊地への突入', timeLimitSec: 180 })[1]).toBe('勝利条件: 泊地への突入  (制限 3分)');
    expect(battleBanner({ areaName: 'p1', goal: 'x', timeLimitSec: 150 })).toEqual(['p1  ·  主力戦', '勝利条件: x  (制限 2分30秒)']);
    expect(battleBanner({ exercise: true, goal: 'x' })[0]).toBe('演習');
    expect(battleBanner({ scenarioName: 'ミッドウェー', goal: 'x' })[0]).toBe('史実: ミッドウェー');
  });

  it('says why the battle ended in the objective\'s words (#335)', () => {
    // A convoy that lost two merchants is lost with the flagship afloat: not "旗艦が撃沈された".
    const convoy = { ...base, convoyTotal: 3, convoyLost: 2, convoyEscaped: 0 };
    expect(evaluateObjective(Objective.Convoy, convoy)).toBe('defeat');
    expect(outcomeReason(Objective.Convoy, convoy, false)).toBe('輸送船が 2 隻沈められ、船団を守れなかった…');
    expect(outcomeReason(Objective.Convoy, { ...convoy, flagshipAlive: false }, false)).toBe('旗艦が撃沈された…');
    expect(outcomeReason(Objective.Convoy, { ...base, convoyTotal: 3, convoyEscaped: 2, convoyLost: 1 }, true)).toBe('輸送船 2 隻が無事に抜けた！');
    expect(outcomeReason(Objective.Breakthrough, { ...base, elapsedSec: 300, timeLimitSec: 300 }, false)).toContain('時間切れ');
    expect(outcomeReason(Objective.Delay, { ...base, elapsedSec: 300, timeLimitSec: 300 }, true)).toBe('時間まで敵を食い止めた！');
    for (const o of Object.values(Objective)) {
      expect(outcomeReason(o, base, true).length, o).toBeGreaterThan(0);
      expect(outcomeReason(o, base, false).length, o).toBeGreaterThan(0);
    }
  });
});

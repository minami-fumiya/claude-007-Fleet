import { describe, it, expect } from 'vitest';
import { battleRank, betterRank, isBattleRank, RANK_MERIT_MUL, RANK_REWARD_MUL, rankBreakdown, rankShortfall, sRankTime } from '@/systems/BattleRank';
import { settleBattle } from '@/systems/ProgressionSystem';
import { emptyProgress } from '@/utils/ProgressStore';
import { runMigrations } from '@/utils/SaveMigration';

const win = { victory: true, fleetSize: 4, shipsLost: 0, hpRatio: 0.9, durationSec: 200 };

describe('battle rank (#149)', () => {
  it('S for a quick, clean win; A without losses and 60% HP; B one loss or 40% HP; C worse; D for a defeat (#295)', () => {
    expect(battleRank(win)).toBe('S');
    expect(battleRank({ ...win, hpRatio: 0.84 })).toBe('A');
    expect(battleRank({ ...win, minShipHp: 0.25 })).toBe('A');
    expect(battleRank({ ...win, durationSec: 421 })).toBe('A');
    expect(battleRank({ ...win, hpRatio: 0.59 })).toBe('B');
    expect(battleRank({ ...win, shipsLost: 1, hpRatio: 0.3 })).toBe('B');
    expect(battleRank({ ...win, shipsLost: 2, hpRatio: 0.4 })).toBe('B');
    expect(battleRank({ ...win, shipsLost: 2, hpRatio: 0.39 })).toBe('C');
    expect(battleRank({ ...win, victory: false })).toBe('D');
  });

  it('an S is timed by the area: two thirds of its limit, none when holding out wins (#295)', () => {
    expect(sRankTime({})).toBe(300);
    expect(sRankTime({ timeLimitSec: 180 })).toBe(120);
    expect(sRankTime({ timeLimitSec: 150, timeWins: true })).toBe(Infinity);
    expect(battleRank({ ...win, durationSec: 150, timeLimitSec: 180 })).toBe('A');
    expect(battleRank({ ...win, durationSec: 150, timeLimitSec: 150, timeWins: true })).toBe('S');
  });

  it('says what kept a win from S (#295)', () => {
    expect(rankShortfall(win)).toBe('');
    expect(rankShortfall({ ...win, victory: false })).toBe('');
    expect(rankShortfall({ ...win, hpRatio: 0.78 })).toBe('S まで: 残り耐久 78% (85% 必要)');
    expect(rankShortfall({ ...win, shipsLost: 1, minShipHp: 0.2, durationSec: 500 })).toBe('S まで: 喪失 1 隻 · 大破艦あり · 500 秒 (300 秒以内)');
  });

  it('scales the battle reward and merit; S pays more than C', () => {
    expect(RANK_REWARD_MUL.S).toBeGreaterThan(RANK_REWARD_MUL.B);
    expect(RANK_REWARD_MUL.C).toBeLessThan(1);
    expect(RANK_MERIT_MUL.S).toBe(1.5);
    const outcome = { victory: true, enemiesSunk: 3, planesLost: 0, ships: [] };
    const s = settleBattle(emptyProgress(), outcome, { rankMul: RANK_REWARD_MUL.S }).reward;
    const b = settleBattle(emptyProgress(), outcome, { rankMul: RANK_REWARD_MUL.B }).reward;
    expect(s.fuel).toBeGreaterThan(b.fuel);
    expect(s.steel).toBe(Math.round(b.steel * 1.2));
  });

  it('describes the rank, keeps the best per area, and validates stored ranks', () => {
    expect(rankBreakdown({ hpRatio: 0.78, shipsLost: 1 })).toBe('損害 22% · 喪失 1');
    expect(betterRank('B', 'S')).toBe('S');
    expect(betterRank('A', 'C')).toBe('A');
    expect(betterRank(undefined, 'C')).toBe('C');
    expect(isBattleRank('S')).toBe(true);
    expect(isBattleRank('Z')).toBe(false);
  });

  it('an area won without losses before #149 counts as S', () => {
    const out = runMigrations({ version: 9, nations: { IJN: { perfect: ['p1', 'p3'] } } }) as { nations: { IJN: { areaRanks: Record<string, string> } } };
    expect(out.nations.IJN.areaRanks).toEqual({ p1: 'S', p3: 'S' });
  });
});

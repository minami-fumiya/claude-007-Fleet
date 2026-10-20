import { describe, it, expect } from 'vitest';
import { battleDifficulty, DIFFICULTIES, DIFFICULTY_ORDER, nextDifficulty } from '@/systems/DifficultySystem';
import { DEFAULT_SETTINGS, parseSettings } from '@/systems/SettingsSystem';

describe('難易度 (#100)', () => {
  it('harder means a sharper, tougher enemy that pays more; 普通 changes nothing', () => {
    expect(DIFFICULTIES.normal).toEqual({ label: '普通', aimMul: 1, flagshipPriority: 0, hpMul: 1, rewardMul: 1 });
    const [easy, normal, hard] = DIFFICULTY_ORDER.map((d) => DIFFICULTIES[d]);
    expect(easy.aimMul).toBeGreaterThan(normal.aimMul);
    expect(hard.aimMul).toBeLessThan(normal.aimMul);
    expect(easy.hpMul).toBeLessThan(1);
    expect(hard.hpMul).toBeGreaterThan(1);
    expect(easy.rewardMul).toBeLessThan(1);
    expect(hard.rewardMul).toBeGreaterThan(1);
    // Easy looks past the player's flagship more, hard less.
    expect(easy.flagshipPriority).toBeLessThan(normal.flagshipPriority);
    expect(hard.flagshipPriority).toBeGreaterThan(normal.flagshipPriority);
  });

  it('scenarios always play at 普通; the setting cycles and reads from any stored settings', () => {
    expect(battleDifficulty('hard', true)).toBe(DIFFICULTIES.normal);
    expect(battleDifficulty('hard', false)).toBe(DIFFICULTIES.hard);
    expect(nextDifficulty('easy')).toBe('normal');
    expect(nextDifficulty('hard')).toBe('easy');
    expect(DEFAULT_SETTINGS.difficulty).toBe('normal');
    expect(parseSettings(JSON.stringify({ bgm: 50 })).difficulty).toBe('normal');
    expect(parseSettings(JSON.stringify({ difficulty: 'hard' })).difficulty).toBe('hard');
    expect(parseSettings(JSON.stringify({ difficulty: 'nightmare' })).difficulty).toBe('normal');
  });
});

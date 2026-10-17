import { describe, it, expect } from 'vitest';
import { addProficiency, aimErrorMul, evadeChance, MAX_PROFICIENCY, proficiencyGain, proficiencyLabel } from '@/systems/ProficiencySystem';

describe('ProficiencySystem', () => {
  it('rewards kills, victory and survival, with diminishing returns', () => {
    const base = { victory: false, enemiesSunk: 0, survived: true, current: 0 };
    expect(proficiencyGain(base)).toBe(10);
    expect(proficiencyGain({ ...base, victory: true, enemiesSunk: 2 })).toBe(24);
    expect(proficiencyGain({ ...base, survived: false })).toBe(5);
    expect(proficiencyGain({ ...base, current: 75 })).toBe(5);
    expect(proficiencyGain({ ...base, current: 100 })).toBeGreaterThan(0);
  });

  it('caps at the maximum', () => {
    expect(addProficiency(95, 20)).toBe(MAX_PROFICIENCY);
    expect(addProficiency(0, -5)).toBe(0);
  });

  it('veterans aim better and dodge more', () => {
    expect(aimErrorMul(0)).toBe(1);
    expect(aimErrorMul(100)).toBe(0.5);
    expect(evadeChance(0)).toBe(0);
    expect(evadeChance(100)).toBeCloseTo(0.15);
    expect(evadeChance(500)).toBeCloseTo(0.15);
  });

  it('labels crews', () => {
    expect(proficiencyLabel(0)).toBe('新兵');
    expect(proficiencyLabel(30)).toBe('一般');
    expect(proficiencyLabel(60)).toBe('熟練');
    expect(proficiencyLabel(90)).toBe('精鋭');
  });
});

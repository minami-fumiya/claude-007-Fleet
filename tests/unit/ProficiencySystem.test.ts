import { describe, it, expect } from 'vitest';
import { addProficiency, aimErrorMul, evadeChance, MAX_PROFICIENCY, proficiencyGain, proficiencyLabel, TRAINING_MANUAL_GAIN, useTrainingManual } from '@/systems/ProficiencySystem';
import refits from '@/data/refits.json';

describe('ProficiencySystem', () => {
  it('rewards kills, victory and survival, with diminishing returns', () => {
    const base = { victory: false, enemiesSunk: 0, survived: true, current: 0 };
    // #305: (3 + sinks (max 6) + 2 for a win) × (1 − proficiency / 110).
    expect(proficiencyGain(base)).toBe(3);
    expect(proficiencyGain({ ...base, victory: true, enemiesSunk: 2 })).toBe(7);
    expect(proficiencyGain({ ...base, victory: true, enemiesSunk: 20 })).toBe(11);
    expect(proficiencyGain({ ...base, survived: false })).toBe(2);
    expect(proficiencyGain({ ...base, current: 75 })).toBe(1);
    expect(proficiencyGain({ ...base, current: 100 })).toBeGreaterThan(0);
  });

  it('a won battle with two sinks: a destroyer reaches 改 in about 3 battles, a cruiser in about 5, a battleship 改三 in 30+ (#305)', () => {
    const battlesTo = (goal: number): number => {
      let p = 0;
      let n = 0;
      while (p < goal && n < 1000) {
        p = addProficiency(p, proficiencyGain({ victory: true, enemiesSunk: 2, survived: true, current: p }));
        n++;
      }
      return n;
    };
    const th = (c: keyof typeof refits.classes): number[] => refits.classes[c].map((s) => s.minProficiency);
    expect(th('Destroyer')).toEqual([20, 50, 80]);
    expect(th('Cruiser')).toEqual([30, 65, 90]);
    expect(th('Battleship')).toEqual([40, 80, 100]);
    expect(th('Carrier')).toEqual(th('Battleship'));
    expect(th('Submarine')).toEqual(th('Destroyer'));
    expect(battlesTo(20)).toBeLessThanOrEqual(4);
    expect(battlesTo(30)).toBeGreaterThanOrEqual(4);
    expect(battlesTo(30)).toBeLessThanOrEqual(6);
    expect(battlesTo(65)).toBeGreaterThanOrEqual(12);
    expect(battlesTo(100)).toBeGreaterThanOrEqual(30);
  });

  it('a 訓練教範 adds 10, up to the top, and is spent (#305)', () => {
    const p = { items: { trainingManual: 1 }, proficiency: { a: 95 } };
    const used = useTrainingManual(p, 'a')!;
    expect(used.proficiency.a).toBe(MAX_PROFICIENCY);
    expect(used.items.trainingManual).toBe(0);
    expect(useTrainingManual(used, 'a')).toBeNull();
    expect(useTrainingManual({ items: { trainingManual: 2 }, proficiency: {} }, 'b')!.proficiency.b).toBe(TRAINING_MANUAL_GAIN);
    expect(useTrainingManual({ items: { trainingManual: 2 }, proficiency: { c: 100 } }, 'c')).toBeNull();
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

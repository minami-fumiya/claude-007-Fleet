import { describe, it, expect } from 'vitest';
import {
  addMorale, battleMoraleDelta, MORALE_HIGH, MORALE_REST, MORALE_TIRED, moraleLabel, moraleModifiers, moraleMood, moraleOf, SUPPLY_SHIP_GAIN, useSupplyShip,
} from '@/systems/MoraleSystem';
import { combineModifiers } from '@/systems/CustomizationSystem';
import { MEDALS } from '@/systems/RecordSystem';
import { emptyNationProgress, parseSave } from '@/utils/ProgressStore';

const T0 = 1_700_000_000_000;
const MIN = 60_000;

describe('士気 (#54)', () => {
  it('starts rested, falls with sorties, comes back to 50 and then slowly on to 100 with time (#401)', () => {
    let s = { morale: {}, moraleAt: {} };
    expect(moraleOf(s, 'a', T0)).toBe(MORALE_REST);
    // Three lost battles in a row tire the crew.
    for (let i = 0; i < 3; i++) s = addMorale(s, ['a'], battleMoraleDelta(false, 'D'), T0);
    expect(moraleOf(s, 'a', T0)).toBe(5);
    expect(moraleMood(moraleOf(s, 'a', T0))).toBe('tired');
    // About two hours and a half later it is rested again; then it rises a third as fast, up to 100.
    expect(moraleOf(s, 'a', T0 + 60 * MIN)).toBeGreaterThan(5);
    expect(moraleOf(s, 'a', T0 + 150 * MIN)).toBe(MORALE_REST);
    expect(moraleOf(s, 'a', T0 + 210 * MIN)).toBe(MORALE_REST + 6);
    expect(moraleOf(s, 'a', T0 + 999 * MIN)).toBe(100);
  });

  it('wins lift it, an S most; high morale no longer falls with time (#401), and it stays within 0〜100', () => {
    expect(battleMoraleDelta(true, 'S')).toBeGreaterThan(battleMoraleDelta(true, 'A'));
    expect(battleMoraleDelta(true, 'A')).toBeGreaterThan(battleMoraleDelta(false, 'D'));
    let s = addMorale({ morale: {}, moraleAt: {} }, ['a'], 200, T0);
    expect(moraleOf(s, 'a', T0)).toBe(100);
    expect(moraleOf(s, 'a', T0 + 999 * MIN)).toBe(100);
    s = addMorale(s, ['a'], -500, T0);
    expect(moraleOf(s, 'a', T0)).toBe(0);
  });

  it('a cheerful crew dodges and reloads better, a tired one worse', () => {
    const high = combineModifiers(moraleModifiers(MORALE_HIGH));
    const tired = combineModifiers(moraleModifiers(MORALE_TIRED - 1));
    const plain = combineModifiers(moraleModifiers(MORALE_REST));
    expect(high.evadeAdd).toBeGreaterThan(plain.evadeAdd);
    expect(high.gunReloadMul).toBeLessThan(plain.gunReloadMul);
    expect(tired.evadeAdd).toBeLessThan(plain.evadeAdd);
    expect(tired.gunReloadMul).toBeGreaterThan(plain.gunReloadMul);
    expect(moraleLabel(75)).toBe('士気 75 ★');
    expect(moraleLabel(20)).toBe('士気 20 疲労');
    expect(moraleLabel(50)).toBe('士気 50');
  });

  it('a 給糧艦 lifts every ship given and is spent', () => {
    const p = { ...emptyNationProgress(['a', 'b']), items: { ...emptyNationProgress().items, supplyShip: 1 } };
    const used = useSupplyShip(p, ['a', 'b'], T0)!;
    expect(moraleOf(used, 'a', T0)).toBe(MORALE_REST + SUPPLY_SHIP_GAIN);
    expect(moraleOf(used, 'b', T0)).toBe(MORALE_REST + SUPPLY_SHIP_GAIN);
    expect(used.items.supplyShip).toBe(0);
    expect(useSupplyShip(used, ['a'], T0)).toBeNull();
  });

  it('a save without morale reads as rested, and brings medals', () => {
    const save = parseSave(JSON.stringify({ version: 1, nations: { IJN: { ships: ['fubuki'] } } }));
    const np = save.nations.IJN!;
    expect(np.morale).toEqual({});
    expect(np.items.supplyShip).toBe(0);
    expect(moraleOf(np, 'fubuki', T0)).toBe(MORALE_REST);
    for (const id of ['supply', 'supply_3', 'sparkle', 'sparkle_3']) expect(MEDALS.some((m) => m.id === id), id).toBe(true);
  });
});

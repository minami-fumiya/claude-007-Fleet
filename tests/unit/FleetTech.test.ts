import { describe, expect, it } from 'vitest';
import { shipTechPoints, TECH_MAX_LEVEL, TECH_THRESHOLDS, techLevel, techModifiers, techPoints, toNextLevel } from '@/systems/FleetTechSystem';
import { ShipClass } from '@/types/ShipClass';

const classes: Record<string, ShipClass> = { a: ShipClass.Destroyer, b: ShipClass.Destroyer, c: ShipClass.Battleship };

describe('艦隊技術 (#56)', () => {
  it('a ship counts 1, each remodel more, and a full crew 2 more', () => {
    const p = { ships: ['a'], refits: { a: 2 }, proficiency: { a: 100 } };
    expect(shipTechPoints('a', { ...p, refits: {}, proficiency: {} })).toBe(1);
    expect(shipTechPoints('a', { ...p, refits: { a: 1 }, proficiency: {} })).toBe(2);
    expect(shipTechPoints('a', p)).toBe(1 + 3 + 2);
    expect(shipTechPoints('a', { ...p, refits: { a: 3 } })).toBe(1 + 5 + 2);
  });

  it('adds up per class, ships out of the roster count for nothing', () => {
    const pts = techPoints({ ships: ['a', 'b', 'c', 'ghost', 'a'], refits: { b: 1 }, proficiency: {} }, (id) => classes[id]);
    expect(pts[ShipClass.Destroyer]).toBe(3);
    expect(pts[ShipClass.Battleship]).toBe(1);
    expect(pts[ShipClass.Carrier]).toBe(0);
  });

  it('levels at the thresholds, up to the top', () => {
    expect(techLevel(0)).toBe(0);
    expect(techLevel(TECH_THRESHOLDS[0])).toBe(1);
    expect(techLevel(999)).toBe(TECH_MAX_LEVEL);
    expect(toNextLevel(3)).toBe(TECH_THRESHOLDS[0] - 3);
    expect(toNextLevel(999)).toBeUndefined();
  });

  it('the bonus touches its class only and grows with the level', () => {
    expect(techModifiers(ShipClass.Destroyer, 0).torpedoPowerMul).toBe(1);
    expect(techModifiers(ShipClass.Destroyer, 2).torpedoPowerMul).toBeCloseTo(1.02 ** 2);
    expect(techModifiers(ShipClass.Destroyer, 5).gunPowerMul).toBe(1);
    expect(techModifiers(ShipClass.Battleship, 9).gunPowerMul).toBeCloseTo(1.015 ** TECH_MAX_LEVEL);
  });
});

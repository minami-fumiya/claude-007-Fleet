import { describe, it, expect } from 'vitest';
import { AA_KILLS_PER_SEC, AA_RANGE, aaFire, aaStrength, applyAttrition, bombHits, dogfightRate } from '@/systems/AirCombat';
import { AircraftType } from '@/types/Aircraft';
import { ShipClass } from '@/types/ShipClass';

describe('AirCombat', () => {
  it('gives battleships the heaviest AA', () => {
    expect(aaStrength(ShipClass.Battleship)).toBeGreaterThan(aaStrength(ShipClass.Destroyer));
  });

  it('sums AA from guns in range only', () => {
    const guns = [
      { x: 0, y: 0, strength: 1 },
      { x: AA_RANGE, y: 0, strength: 0.5 },
      { x: AA_RANGE * 3, y: 0, strength: 1 },
    ];
    expect(aaFire(0, 0, guns)).toBeCloseTo(1.5 * AA_KILLS_PER_SEC);
    expect(aaFire(5000, 0, guns)).toBe(0);
  });

  it('accumulates fractional damage into whole planes', () => {
    let s = { planes: 3, damage: 0 };
    s = applyAttrition(s.planes, s.damage, 0.6, 1);
    expect(s).toEqual({ planes: 3, damage: 0.6 });
    s = applyAttrition(s.planes, s.damage, 0.6, 1);
    expect(s.planes).toBe(2);
    expect(s.damage).toBeCloseTo(0.2);
  });

  it('never goes below zero planes', () => {
    expect(applyAttrition(2, 0, 10, 1)).toEqual({ planes: 0, damage: 0 });
  });

  it('fighters beat bombers, bombers barely fight back', () => {
    expect(dogfightRate(AircraftType.Fighter, AircraftType.DiveBomber)).toBeGreaterThan(dogfightRate(AircraftType.Fighter, AircraftType.Fighter));
    expect(dogfightRate(AircraftType.TorpedoBomber, AircraftType.Fighter)).toBeGreaterThan(0);
    expect(dogfightRate(AircraftType.DiveBomber, AircraftType.TorpedoBomber)).toBe(0);
  });

  it('counts bomb hits with the given rng', () => {
    const seq = [0.1, 0.9, 0.5];
    let i = 0;
    expect(bombHits(3, 0.6, () => seq[i++])).toBe(2);
    expect(bombHits(0, 1)).toBe(0);
  });
});

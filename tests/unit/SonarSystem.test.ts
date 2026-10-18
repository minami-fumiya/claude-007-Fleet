import { describe, it, expect } from 'vitest';
import { depthChargeFalloff, isDetected, sonarRange } from '@/systems/SonarSystem';
import { ShipClass } from '@/types/ShipClass';

describe('SonarSystem', () => {
  it('gives destroyers the longest sonar and battleships none', () => {
    expect(sonarRange(ShipClass.Destroyer)).toBeGreaterThan(sonarRange(ShipClass.Cruiser));
    expect(sonarRange(ShipClass.Battleship)).toBe(0);
    expect(sonarRange(ShipClass.Carrier)).toBe(0);
  });

  it('detects a contact inside any hunter range', () => {
    const hunters = [
      { x: 0, y: 0, sonarRange: 0 },
      { x: 1000, y: 0, sonarRange: 300 },
    ];
    expect(isDetected({ x: 1200, y: 0 }, hunters)).toBe(true);
    expect(isDetected({ x: 1301, y: 0 }, hunters)).toBe(false);
    // A ship without sonar never detects, even point blank.
    expect(isDetected({ x: 5, y: 0 }, hunters)).toBe(false);
  });

  it('detects exactly at the range boundary', () => {
    expect(isDetected({ x: 300, y: 0 }, [{ x: 0, y: 0, sonarRange: 300 }])).toBe(true);
  });

  it('has no hunters means no detection', () => {
    expect(isDetected({ x: 0, y: 0 }, [])).toBe(false);
  });
});

describe('depthChargeFalloff', () => {
  it('is full strength near the blast', () => {
    expect(depthChargeFalloff(0, 90)).toBe(1);
    expect(depthChargeFalloff(30, 90)).toBe(1);
  });

  it('falls off linearly to zero at the edge', () => {
    expect(depthChargeFalloff(60, 90)).toBeCloseTo(0.5);
    expect(depthChargeFalloff(90, 90)).toBe(0);
    expect(depthChargeFalloff(200, 90)).toBe(0);
  });

  it('is zero for a zero radius', () => {
    expect(depthChargeFalloff(0, 0)).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import {
  carriesRecon,
  IVisionCone,
  pickShadowTarget,
  RECON_RANGE,
  SHADOW_RADIUS,
  shadowOrbit,
  shadowValue,
  conePolygon,
  inSource,
  isVisible,
  PERISCOPE_VISION,
  reconPatrol,
  shipVision,
  VisionSource,
} from '@/systems/VisionSystem';
import { ShipClass } from '@/types/ShipClass';

describe('VisionSystem', () => {
  it('limits a submerged boat to periscope range', () => {
    expect(shipVision(ShipClass.Submarine, true)).toBe(PERISCOPE_VISION);
    expect(shipVision(ShipClass.Battleship)).toBeGreaterThan(PERISCOPE_VISION);
  });

  it('gives recon planes to battleships and cruisers only', () => {
    expect(carriesRecon(ShipClass.Battleship)).toBe(true);
    expect(carriesRecon(ShipClass.Cruiser)).toBe(true);
    expect(carriesRecon(ShipClass.Destroyer)).toBe(false);
    expect(carriesRecon(ShipClass.Carrier)).toBe(false);
  });

  it('tests circles by distance', () => {
    const c: VisionSource = { kind: 'circle', x: 0, y: 0, radius: 100 };
    expect(inSource(100, 0, c)).toBe(true);
    expect(inSource(101, 0, c)).toBe(false);
  });

  it('tests cones by distance and angle', () => {
    const cone: VisionSource = { kind: 'cone', x: 0, y: 0, heading: 0, range: 500, halfAngle: Math.PI / 6 };
    expect(inSource(400, 0, cone)).toBe(true);
    expect(inSource(400, 200, cone)).toBe(true); // ~26.6 deg
    expect(inSource(400, 300, cone)).toBe(false); // ~36.9 deg
    expect(inSource(-100, 0, cone)).toBe(false);
    expect(inSource(600, 0, cone)).toBe(false);
    expect(inSource(0, 0, cone)).toBe(true);
  });

  it('handles cones facing across the ±pi seam', () => {
    const cone: VisionSource = { kind: 'cone', x: 0, y: 0, heading: Math.PI, range: 500, halfAngle: 0.3 };
    expect(inSource(-400, 50, cone)).toBe(true);
    expect(inSource(-400, -50, cone)).toBe(true);
  });

  it('is visible when inside any source', () => {
    const sources: VisionSource[] = [
      { kind: 'circle', x: 0, y: 0, radius: 50 },
      { kind: 'circle', x: 1000, y: 0, radius: 50 },
    ];
    expect(isVisible(1020, 0, sources)).toBe(true);
    expect(isVisible(500, 0, sources)).toBe(false);
    expect(isVisible(0, 0, [])).toBe(false);
  });

  it('builds a cone polygon from apex and arc', () => {
    const pts = conePolygon({ kind: 'cone', x: 0, y: 0, heading: 0, range: 100, halfAngle: 0.5 }, 4);
    expect(pts).toHaveLength(6);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    for (const p of pts.slice(1)) expect(Math.hypot(p.x, p.y)).toBeCloseTo(100);
  });

  it('patrols an orbit ahead of the ship', () => {
    const p = reconPatrol(0, 0, 0, 0, 400, 200);
    expect(p).toEqual({ x: 600, y: 0, heading: Math.PI / 2 });
    const q = reconPatrol(0, 0, 0, Math.PI, 400, 200);
    expect(q.x).toBeCloseTo(200);
  });
});

describe('recon shadowing (#98)', () => {
  const cone: IVisionCone = { kind: 'cone', x: 0, y: 0, heading: 0, range: 600, halfAngle: Math.PI / 4 };
  const c = (ref: string, x: number, shipClass: ShipClass, submerged = false) => ({ ref, x, y: 0, shipClass, submerged });

  it('picks the most valuable surface contact in the cone, nearest first among equals', () => {
    const list = [c('dd', 100, ShipClass.Destroyer), c('bb', 500, ShipClass.Battleship), c('cv', 900, ShipClass.Carrier), c('bb2', 300, ShipClass.Battleship)];
    expect(pickShadowTarget(cone, list, new Set())).toBe('bb2');
  });

  it('skips submerged boats, contacts outside the cone and ones another scout already shadows', () => {
    expect(pickShadowTarget(cone, [c('ss', 100, ShipClass.Submarine, true)], new Set())).toBeNull();
    expect(pickShadowTarget(cone, [c('bb', -200, ShipClass.Battleship)], new Set())).toBeNull();
    expect(pickShadowTarget(cone, [c('bb', 200, ShipClass.Battleship), c('dd', 150, ShipClass.Destroyer)], new Set(['bb']))).toBe('dd');
  });

  it('a shadowing plane circles its contact within recon range', () => {
    for (let o = 0; o < 7; o += 0.5) {
      const p = shadowOrbit(1000, 500, o);
      expect(Math.hypot(p.x - 1000, p.y - 500)).toBeCloseTo(SHADOW_RADIUS);
      expect(SHADOW_RADIUS).toBeLessThan(RECON_RANGE);
    }
    expect(shadowValue(ShipClass.Carrier)).toBeGreaterThan(shadowValue(ShipClass.Cruiser));
  });
});

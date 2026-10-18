import { describe, it, expect } from 'vitest';
import { escortSteer, FORMATION_TURN_DEG, nextFormationHeading, STATION_RADIUS } from '@/systems/EscortSteering';
import { FormationSystem } from '@/systems/FormationSystem';
import { rotateTowardsDegrees } from '@/utils/MathUtils';

const bowVec = (angle: number): { x: number; y: number } => {
  const r = ((angle - 90) * Math.PI) / 180;
  return { x: Math.cos(r), y: Math.sin(r) };
};

describe('EscortSteering (#80)', () => {
  it('the formation heading follows the flagship at a limited rate', () => {
    expect(nextFormationHeading(0, 180, 1)).toBeCloseTo(FORMATION_TURN_DEG);
    expect(nextFormationHeading(0, 10, 1)).toBeCloseTo(10);
  });

  it('on station an escort holds the formation course at the flagship speed instead of stopping', () => {
    const slot = FormationSystem.getWorldPositionFromValues(0, 0, 0, { forward: -90, right: 0 });
    const s = escortSteer({ x: slot.x, y: slot.y + STATION_RADIUS / 2, angle: 0, speed: 100 }, { x: 0, y: 0, angle: 0, speed: 80, currentSpeed: 50 }, { forward: -90, right: 0 }, 0);
    expect(s.headingDeg).toBe(0);
    expect(s.throttle).toBeCloseTo(0.5);
  });

  it('an escort that overshot its slot slows on the formation course instead of turning around', () => {
    // Slot is 150 px behind the escort, which faces the formation course (up).
    const slot = FormationSystem.getWorldPositionFromValues(0, 0, 0, { forward: -90, right: 0 });
    const s = escortSteer({ x: slot.x, y: slot.y - 150, angle: 0, speed: 100 }, { x: 0, y: 0, angle: 0, speed: 80, currentSpeed: 60 }, { forward: -90, right: 0 }, 0);
    expect(s.headingDeg).toBe(0);
    expect(s.throttle).toBeLessThan(0.6);
  });

  it('through a 180° flagship turn the rear escort of a line stays near its slot', () => {
    const slotOffset = { forward: -270, right: 0 };
    const flag = { x: 0, y: 0, angle: 0 };
    let heading = 0;
    const start = FormationSystem.getWorldPositionFromValues(0, 0, 0, slotOffset);
    const esc = { x: start.x, y: start.y, angle: 0 };
    const dt = 1 / 30;
    let worst = 0;
    for (let i = 0; i < 30 * 20; i++) {
      // The flagship turns hard to the reverse course over the first 2 s, then steams on at 60 px/s.
      flag.angle = rotateTowardsDegrees(flag.angle, 180, 120 * dt);
      const fv = bowVec(flag.angle);
      flag.x += fv.x * 60 * dt;
      flag.y += fv.y * 60 * dt;
      heading = nextFormationHeading(heading, flag.angle, dt);
      const s = escortSteer({ ...esc, speed: 110 }, { ...flag, speed: 100, currentSpeed: 60 }, slotOffset, heading);
      esc.angle = rotateTowardsDegrees(esc.angle, s.headingDeg, 75 * dt);
      const ev = bowVec(esc.angle);
      esc.x += ev.x * 110 * s.throttle * dt;
      esc.y += ev.y * 110 * s.throttle * dt;
      if (i > 30 * 12) {
        const slot = FormationSystem.getWorldPositionFromValues(flag.x, flag.y, heading, slotOffset);
        worst = Math.max(worst, Math.hypot(slot.x - esc.x, slot.y - esc.y));
      }
    }
    // After the turn has settled the escort is back in its slot.
    expect(worst).toBeLessThan(STATION_RADIUS * 2);
  });
});

import { describe, expect, it } from 'vitest';
import { dashes, rimSegment } from '@/utils/RouteLine';

describe('RouteLine (#162)', () => {
  it('starts and ends on the node rims, never inside a node', () => {
    const s = rimSegment({ x: 0, y: 0 }, { x: 100, y: 0 }, 20, 4)!;
    expect(s).toEqual({ x1: 24, y1: 0, x2: 76, y2: 0 });
    const d = rimSegment({ x: 10, y: 10 }, { x: 110, y: 90 }, 22)!;
    expect(Math.hypot(d.x1 - 10, d.y1 - 10)).toBeCloseTo(26);
    expect(Math.hypot(d.x2 - 110, d.y2 - 90)).toBeCloseTo(26);
  });

  it('draws nothing between touching nodes', () => {
    expect(rimSegment({ x: 0, y: 0 }, { x: 40, y: 0 }, 20)).toBeNull();
  });

  it('cuts the line into dashes that stay on it', () => {
    const d = dashes({ x1: 0, y1: 0, x2: 50, y2: 0 }, 10, 5);
    expect(d.map((s) => [s.x1, s.x2])).toEqual([[0, 10], [15, 25], [30, 40], [45, 50]]);
    expect(dashes({ x1: 5, y1: 5, x2: 5, y2: 5 })).toEqual([]);
  });
});

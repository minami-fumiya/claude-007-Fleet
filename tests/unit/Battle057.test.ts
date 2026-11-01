import { describe, expect, it } from 'vitest';
import { emptyCommentary, forget, next, raise } from '@/systems/CommentarySystem';

describe('0.0.57 commentary (#404)', () => {
  it('a ship that sinks takes its waiting 大破 line with it', () => {
    const ship = {};
    let s = emptyCommentary();
    s = raise(s, { kind: 'ownHeavy', text: '長門 大破', at: 1, subject: ship }, 'normal');
    s = raise(s, { kind: 'ownSunk', text: '長門 沈没', at: 1.1 }, 'normal');
    s = forget(s, ship);
    const said: string[] = [];
    for (let t = 1.2; t < 12; t += 0.5) {
      const r = next(s, t);
      s = r.state;
      if (r.line) said.push(r.line.text);
    }
    expect(said).toEqual(['長門 沈没']);
  });

  it('lines about other ships stay', () => {
    const a = {};
    const b = {};
    let s = emptyCommentary();
    s = raise(s, { kind: 'ownHeavy', text: 'A 大破', at: 1, subject: a }, 'normal');
    s = raise(s, { kind: 'enemyHeavy', text: '敵 大破', at: 1, subject: b }, 'normal');
    s = forget(s, a);
    expect(s.queue.map((q) => q.text)).toEqual(['敵 大破']);
  });
});

import { AUTO_HURT_HP, autoEngageRange, autoSearchGoal } from '@/systems/AutoCaptain';
import { beyondLeash, FLEET_LEASH } from '@/systems/EscortSteering';

describe('0.0.57 AUTO flagship (#400)', () => {
  const centre = { x: 1000, y: 1000 };
  it('searches towards the nearest place an enemy was last seen, else the middle', () => {
    expect(autoSearchGoal({ x: 0, y: 0 }, [{ x: 900, y: 900 }, { x: 100, y: 100 }], centre, 1)).toEqual({ x: 100, y: 100 });
    expect(autoSearchGoal({ x: 0, y: 0 }, [], centre, 1)).toEqual(centre);
  });
  it('holds where it is once badly hurt', () => {
    expect(autoSearchGoal({ x: 0, y: 0 }, [], centre, AUTO_HURT_HP - 0.01)).toBeNull();
  });
  it('fights from further off past half its hull; a carrier keeps its standoff', () => {
    expect(autoEngageRange(1000, 0.4)).toBeGreaterThan(autoEngageRange(1000, 0.9));
    expect(autoEngageRange(1000, 0.4, 850)).toBe(850);
  });
});

describe('0.0.57 fleets stay together (#400)', () => {
  it('a ship further than the leash from its slot turns back', () => {
    expect(beyondLeash({ x: 0, y: 0 }, { x: FLEET_LEASH + 1, y: 0 })).toBe(true);
    expect(beyondLeash({ x: 0, y: 0 }, { x: FLEET_LEASH - 1, y: 0 })).toBe(false);
  });
});

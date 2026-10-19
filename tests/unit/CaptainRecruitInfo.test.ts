import { describe, expect, it } from 'vitest';
import { CAPTAIN_DROP_CHANCE, CAPTAIN_SOURCES, captainsLeft, nationCaptains, nextCaptain, nextCaptainText } from '@/systems/CaptainRoster';
import { SKILL_LABEL } from '@/systems/CaptainSystem';
import { ShipClass } from '@/types/ShipClass';

describe('when captains join (#179)', () => {
  it('names the next recruit with their speciality, the same one the recruit would be', () => {
    const owned = [nationCaptains('IJN')[0].id];
    const next = nextCaptain('IJN', owned, [ShipClass.Destroyer])!;
    expect(nextCaptainText('IJN', owned, [ShipClass.Destroyer])).toBe(`艦長 ${next.name} (${SKILL_LABEL[next.skill]})`);
  });

  it('says nothing once every captain has joined', () => {
    const all = nationCaptains('IJN').map((c) => c.id);
    expect(nextCaptainText('IJN', all)).toBe('');
    expect(captainsLeft('IJN', all)).toBe(0);
    expect(captainsLeft('IJN', [])).toBe(nationCaptains('IJN').length);
  });

  it('lists the three ways in, with the drop chance', () => {
    expect(CAPTAIN_SOURCES).toHaveLength(3);
    expect(CAPTAIN_SOURCES[2]).toContain(`${Math.round(CAPTAIN_DROP_CHANCE * 100)}%`);
  });
});

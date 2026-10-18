import { describe, it, expect } from 'vitest';
import { clearCount, fleetSlots, MAX_FLEET_SLOTS, nextRank, promotionText, RANKS, rankForClears, rankOf } from '@/systems/RankSystem';
import campaign from '@/data/campaign.json';

const clears = (n: number): { campaign: string[] } => ({ campaign: Array.from({ length: n }, (_, i) => `area${i}`) });

describe('RankSystem (#30 / #25)', () => {
  it('ranks run 少佐 → 大将 with fleet slots 1..6', () => {
    expect(RANKS.map((r) => r.name)).toEqual(['少佐', '中佐', '大佐', '少将', '中将', '大将']);
    expect(RANKS.map((r) => r.slots)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(MAX_FLEET_SLOTS).toBe(6);
    for (let i = 1; i < RANKS.length; i++) expect(RANKS[i].minClears).toBeGreaterThan(RANKS[i - 1].minClears);
  });

  it('a new admiral has one slot; the first clear promotes', () => {
    expect(rankOf(clears(0)).name).toBe('少佐');
    expect(fleetSlots(clears(0))).toBe(1);
    expect(fleetSlots(clears(1))).toBe(2);
    expect(rankForClears(1000).name).toBe('大将');
  });

  it('counts each area once', () => {
    expect(clearCount({ campaign: ['p1', 'p1', 'a1'] })).toBe(2);
  });

  it('describes the next promotion', () => {
    expect(nextRank(clears(0))).toEqual({ rank: RANKS[1], clearsNeeded: 1 });
    expect(nextRank(clears(2))?.clearsNeeded).toBe(RANKS[3].minClears - 2);
    expect(nextRank(clears(RANKS[5].minClears))).toBeNull();
    expect(promotionText(clears(0))).toContain('中佐');
    expect(promotionText(clears(99))).toBe('最高位に到達');
  });

  it('the top rank is reachable with the campaign as it is', () => {
    expect(campaign.areas.length).toBeGreaterThanOrEqual(RANKS[RANKS.length - 1].minClears);
  });
});

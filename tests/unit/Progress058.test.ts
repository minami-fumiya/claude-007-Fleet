import { describe, expect, it } from 'vitest';
import { MORALE_HIGH, MORALE_REST, restedMorale } from '@/systems/MoraleSystem';
import { nextPresetRank, presetSlots } from '@/systems/PresetSystem';
import { developRandom, RANDOM_LUCKY_CHANCE } from '@/systems/EquipmentSystem';
import { MEDALS } from '@/systems/RecordSystem';
import { remodelCost } from '@/systems/FleetCost';
import quests from '@/data/quests.json';
import tech from '@/data/tech-tree.json';
import { resources } from '@/systems/ResourceSystem';
import { Nation } from '@/types/Nation';
import type { IUpgradeData } from '@/types/Modifiers';

describe('0.0.58 進行と経済', () => {
  it('morale rests up to 50 quickly, then on towards 100 a third as fast (#401)', () => {
    expect(restedMorale(20, 100)).toBe(MORALE_REST);
    // 50 → ★ (70) in a little over an hour and a half.
    const toHigh = (MORALE_HIGH - MORALE_REST) / (0.3 / 3);
    expect(toHigh).toBeGreaterThan(90);
    expect(toHigh).toBeLessThan(240);
    expect(restedMorale(90, 10_000)).toBe(100);
  });

  it('saved fleets grow with rank, each step named (#401)', () => {
    expect([0, 6, 8, 10].map(presetSlots)).toEqual([3, 5, 7, 10]);
    expect(nextPresetRank(0)).toBe(6);
    expect(nextPresetRank(10)).toBeNull();
  });

  it('おまかせ開発 is a lucky dip: two copies when lucky, and it has its medal (#401)', () => {
    const u = { id: 'x', name: 'x', nations: [], research: [], cost: { fuel: 100, ammo: 100, steel: 100, bauxite: 100 } } as unknown as IUpgradeData;
    const holder = { resources: resources({ fuel: 999, ammo: 999, steel: 999, bauxite: 999 }), research: [], equipment: {}, upgrades: {} };
    const lucky = developRandom(holder, [u], Nation.IJN, 0, RANDOM_LUCKY_CHANCE / 2);
    const plain = developRandom(holder, [u], Nation.IJN, 0, 0.9);
    expect(lucky?.count).toBe(2);
    expect(plain?.count).toBe(1);
    expect(MEDALS.some((m) => m.id.startsWith('lucky_dip'))).toBe(true);
  });

  it('a superweapon quest pays for winning its seas, the sinking is a bonus (#396)', () => {
    const list = (quests as { quests: Array<{ id: string; event: string }> }).quests;
    expect(list.find((q) => q.id === 'a_superweapon1')?.event).toBe('superweaponWin');
    expect(list.find((q) => q.id === 'a_superweapon_sunk')?.event).toBe('superweaponSunk');
  });

  it('remodels weigh less (#405) and research Lv9 / Lv10 open at 准将 / 少将 (#405)', () => {
    expect([0, 1, 2, 3].map(remodelCost)).toEqual([0, 1, 1, 2]);
    for (const t of (tech as { tech: Array<{ branch: string; level: number; rank: number }> }).tech) {
      if (t.branch.startsWith('shipbuilding')) continue;
      if (t.level >= 9) expect(t.rank, `${t.branch} ${t.level}`).toBe(t.level);
    }
  });

  it('a promotion asks for an S against six ships only once the rank held meets such fleets in its seas (#407)', async () => {
    const { RANK_MISSIONS } = await import('@/systems/RankSystem');
    const { areaDepth, recommendedRank } = await import('@/systems/DifficultyCurve');
    const data = (await import('@/data/campaign.json')).default as unknown as Parameters<typeof areaDepth>[0];
    const big = data.areas.filter((a) => !(a as { training?: boolean }).training && a.enemy.ships.length >= 6);
    const firstRank = Math.min(...big.map((a) => recommendedRank(areaDepth(data, a)).index));
    for (const [index, list] of Object.entries(RANK_MISSIONS)) {
      if (list?.some((m) => m.stat === 'bigS')) expect(Number(index) - 1, `rank ${index}`).toBeGreaterThanOrEqual(firstRank);
    }
  });
});

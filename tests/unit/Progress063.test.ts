import { describe, expect, it } from 'vitest';
import { areaDepth, enemyScale, isOpeningArea, OPENING_ENEMY_SCALE, OPENING_TORPEDO_MUL } from '@/systems/DifficultyCurve';
import { convoyGuardPoint, convoyGuardTarget, CONVOY_GUARD_AHEAD } from '@/systems/AutoPilot';
import campaignData from '@/data/campaign.json';
import specialData from '@/data/special.json';
import type { ICampaignData } from '@/types/Campaign';

const DATA = campaignData as ICampaignData;
const area = (id: string) => DATA.areas.find((a) => a.id === id)!;

describe('0.0.63 最初の海域 (#433)', () => {
  it('a theater\'s first area in the earliest ranks meets a weaker enemy with softer torpedoes', () => {
    const p1 = area('p1');
    expect(isOpeningArea(p1, areaDepth(DATA, p1, 'IJN'))).toBe(true);
    // The same sea further along another navy's order is not an opening any more.
    expect(isOpeningArea(p1, areaDepth(DATA, p1, 'RN'))).toBe(false);
    expect(isOpeningArea(area('p2'), 1)).toBe(false);
    expect(OPENING_ENEMY_SCALE).toBeLessThan(1);
    expect(OPENING_TORPEDO_MUL).toBeLessThan(1);
    const opening = enemyScale(DATA, p1, 'IJN');
    // Taken out again, the scale is what the curve alone gives.
    expect(opening / OPENING_ENEMY_SCALE).toBeGreaterThan(opening);
  });
});

describe('0.0.63 船団護衛の AUTO (#416)', () => {
  const convoy = [{ x: 140, y: 400 }, { x: 140, y: 490 }];
  const near = { x: 600, y: 120, alive: true, id: 'near-escort' };
  const raider = { x: 300, y: 520, alive: true, id: 'near-convoy' };

  it('the escort goes for the enemy nearest the convoy, not the one nearest itself', () => {
    const escort = { x: 620, y: 140 };
    expect(convoyGuardTarget(escort, [near, raider], convoy)?.id).toBe('near-convoy');
    // A locked target stays locked; with no convoy left it is the nearest enemy again.
    expect(convoyGuardTarget(escort, [near, raider], convoy, near)?.id).toBe('near-escort');
    expect(convoyGuardTarget(escort, [near, raider], [])?.id).toBe('near-escort');
  });

  it('with nothing in sight it waits ahead of the convoy on its route', () => {
    expect(convoyGuardPoint(convoy)).toEqual({ x: 140 + CONVOY_GUARD_AHEAD, y: 445 });
    expect(convoyGuardPoint([])).toBeNull();
  });

  it('the merchantmen take two submarine torpedoes and more', () => {
    const merchant = (specialData as unknown as { convoy: { hp: number } }).convoy;
    expect(merchant.hp).toBeGreaterThan(2 * 200);
  });
});

describe('0.0.63 国家方針の国の道 (#416)', () => {
  it('every navy has its own way of three, with effects beyond ship bonuses', async () => {
    const { focusTree, focusBuildTimeMul, focusRepairTimeMul, focusExpeditionMul } = await import('@/systems/NationFocusSystem');
    for (const n of ['IJN', 'USN', 'KM', 'RN', 'FR', 'RM', 'SU']) {
      const way = focusTree(n).filter((x) => /_way\d$/.test(x.id));
      expect(way.map((x) => x.rank), n).toEqual([3, 5, 7]);
    }
    const all = (n: string) => ({ done: focusTree(n).map((x) => x.id) });
    expect(focusBuildTimeMul('USN', all('USN'))).toBeCloseTo(0.92 * 0.92);
    expect(focusRepairTimeMul('SU', all('SU'))).toBeCloseTo(0.9);
    expect(focusExpeditionMul('RN', all('RN'))).toBeCloseTo(1.21);
    expect(focusBuildTimeMul('IJN', undefined)).toBe(1);
  });

  it('a focus finished since the screen was opened shows on the home strip', async () => {
    const { pendingSummary } = await import('@/systems/PendingSummary');
    const { emptyProgress } = await import('@/utils/ProgressStore');
    const p = { ...emptyProgress(), focus: { done: ['ijn_expand', 'ijn_way1'], current: null }, focusSeen: 1 };
    expect(pendingSummary(p, 0, 0).find((i) => i.id === 'focusDone')?.count).toBe(1);
    expect(pendingSummary({ ...p, focusSeen: undefined }, 0, 0).find((i) => i.id === 'focusDone')).toBeUndefined();
  });
});

describe('0.0.63 艦ごとの戦歴・超兵器の戦歴 (#416)', () => {
  it('each battle adds the classes a ship sank, its best and its heavy damage', async () => {
    const { addBattle, shipRecordText, sunkTotal } = await import('@/systems/ShipRecordSystem');
    const { ShipClass } = await import('@/types/ShipClass');
    let r = addBattle(undefined, [ShipClass.Destroyer, ShipClass.Destroyer, ShipClass.Cruiser], false);
    r = addBattle(r, [], true);
    expect(r).toEqual({ battles: 2, sunk: { Destroyer: 2, Cruiser: 1 }, best: 3, heavy: 1 });
    expect(sunkTotal(r)).toBe(3);
    expect(shipRecordText(r)).toBe('出撃 2・撃沈 3 (巡 1・駆 2)・最多 3 隻・大破 1');
    expect(shipRecordText(undefined)).toBe('');
  });

  it('a superweapon\'s history keeps the fastest sinking, and every navy\'s together', async () => {
    const { addGiantBattle, giantRecordText, mergeGiantRecords } = await import('@/systems/ShipRecordSystem');
    let g = addGiantBattle(undefined, false, 300);
    g = addGiantBattle(g, true, 192.4);
    g = addGiantBattle(g, true, 250);
    expect(g).toEqual({ fought: 3, sunk: 2, bestSec: 192 });
    expect(giantRecordText(g)).toBe('戦った 3 回・撃沈 2 回・最短 3:12');
    expect(mergeGiantRecords([g, { fought: 1, sunk: 1, bestSec: 100 }, undefined])).toEqual({ fought: 4, sunk: 3, bestSec: 100 });
  });

  it('old saves read with no records; the medal counts the best ship', async () => {
    const { emptyNationProgress, parseSave, emptySave } = await import('@/utils/ProgressStore');
    const raw = JSON.stringify({ ...emptySave(), nations: { IJN: { ...emptyNationProgress(), shipRecords: undefined, giantRecords: undefined } } });
    const np = parseSave(raw).nations.IJN!;
    expect(np.shipRecords).toEqual({});
    expect(np.giantRecords).toEqual({});
    const { MEDALS } = await import('@/systems/RecordSystem');
    expect(MEDALS.map((m) => m.id)).toContain('ship_ace');
    expect(MEDALS.map((m) => m.id)).toContain('national_way');
  });
});

describe('0.0.63 NEW の印 (#416)', () => {
  it('a screen opened before marks what opened since; its first visit marks nothing', async () => {
    const { markSeen, newIds, parseSeenNew } = await import('@/systems/NewMarks');
    expect(newIds(undefined, 'shipyard', ['a', 'b'])).toEqual([]);
    const seen = markSeen(undefined, 'shipyard', ['a', 'b']);
    expect(newIds(seen, 'shipyard', ['a', 'b', 'c'])).toEqual(['c']);
    expect(markSeen(seen, 'shipyard', ['a'])).toBe(seen);
    expect(parseSeenNew({ shipyard: ['a', 'a', 1] })).toEqual({ shipyard: ['a'] });
  });
});

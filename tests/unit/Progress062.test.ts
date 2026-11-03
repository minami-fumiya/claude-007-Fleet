import { describe, expect, it } from 'vitest';
import {
  accrueSeaIncome, COUNTER_EVERY, COUNTER_HOURS, COUNTER_MIN_HELD, counterTargets, countSortie, defenseReward, emptySeaControl, expireCounter, heldAreas,
  parseSeaControl, retakeArea, SEA_INCOME_INTERVAL_MS, SEA_INCOME_MAX_HOURS, SEA_INCOME_PER_AREA, seaIncome, seaState, settleDefense,
} from '@/systems/SeaControlSystem';
import { applySeaControl, emptyNationProgress, emptyProgress, emptySave, parseSave } from '@/utils/ProgressStore';
import { pendingSummary } from '@/systems/PendingSummary';
import { MEDALS } from '@/systems/RecordSystem';
import { QUEST_EVENTS } from '@/systems/QuestSystem';
import { INCOME, LEDGER_LABEL } from '@/systems/LedgerSystem';
import campaignData from '@/data/campaign.json';
import type { ICampaignData } from '@/types/Campaign';

const DATA = campaignData as ICampaignData;
const HOUR = SEA_INCOME_INTERVAL_MS;
const pacific = DATA.areas.filter((a) => a.theater === 'pacific' && !a.training).map((a) => a.id);

describe('0.0.62 制海権と収入 (#50)', () => {
  it('the seas held are the areas won and not taken back, training areas aside', () => {
    const sea = { ...emptySeaControl(), lost: [pacific[1]] };
    expect(heldAreas(DATA.areas, pacific.slice(0, 3), sea)).toEqual([pacific[0], pacific[2]]);
    expect(seaState(pacific[1], pacific, sea)).toBe('lost');
    expect(seaState(pacific[0], pacific, sea)).toBe('held');
    expect(seaState(pacific[5], [], sea)).toBe('none');
  });

  it('each sea pays an hour; the first look only starts the clock, and a long absence pays at most 12 hours', () => {
    expect(seaIncome(10).fuel).toBe(SEA_INCOME_PER_AREA.fuel * 10);
    const start = accrueSeaIncome(emptySeaControl(), 10, 1000);
    expect(start.gain.fuel).toBe(0);
    expect(start.sea.incomeAt).toBe(1000);
    const two = accrueSeaIncome(start.sea, 10, 1000 + 2.5 * HOUR);
    expect(two.gain.steel).toBe(SEA_INCOME_PER_AREA.steel * 10 * 2);
    expect(two.sea.incomeAt).toBe(1000 + 2 * HOUR);
    const week = accrueSeaIncome(start.sea, 1, 1000 + 24 * 7 * HOUR);
    expect(week.gain.fuel).toBe(SEA_INCOME_PER_AREA.fuel * SEA_INCOME_MAX_HOURS);
  });

  it('the income comes in on loading, within the holding cap, and goes into the ledger', () => {
    const now = 10 * HOUR;
    const p = { ...emptyNationProgress(), campaign: pacific.slice(0, 4), sea: { ...emptySeaControl(), incomeAt: now - 3 * HOUR } };
    const after = applySeaControl(p, now);
    expect(after.resources.fuel).toBe(SEA_INCOME_PER_AREA.fuel * 4 * 3);
    expect(INCOME).toContain('seaControl');
    expect(LEDGER_LABEL.seaControl).toBe('制海権');
    expect(Object.keys(after.ledger).some((k) => k.endsWith(':seaControl'))).toBe(true);
  });

  it('old saves read with no sea lost and no counterattack', () => {
    expect(parseSave(JSON.stringify(emptySave())).nations).toEqual({});
    const raw = JSON.stringify({ ...emptySave(), nations: { IJN: { ...emptyNationProgress(), sea: undefined } } });
    expect(parseSave(raw).nations.IJN!.sea).toEqual(emptySeaControl());
    expect(parseSeaControl({ lost: ['p2', 'p2', 3], counter: { areaId: 'p3', endsAt: 5 } })).toEqual({ lost: ['p2'], counter: { areaId: 'p3', startedAt: 0, endsAt: 5 }, sorties: 0, count: 0, incomeAt: 0 });
  });
});

describe('0.0.62 敵の反攻と防衛戦 (#50)', () => {
  const won = pacific.slice(0, 6);
  const targets = counterTargets(DATA.areas, won, emptySeaControl());

  it('a theater\'s first area is never struck', () => {
    expect(targets).not.toContain(pacific[0]);
    expect(targets.length).toBe(won.length - 1);
  });

  it('a counterattack comes after a number of main-fleet battles, not with the clock, and one at a time', () => {
    let sea = emptySeaControl();
    for (let i = 0; i < COUNTER_EVERY - 1; i++) {
      const r = countSortie(sea, targets, 0);
      expect(r.started).toBeNull();
      sea = r.sea;
    }
    const r = countSortie(sea, targets, 1000);
    expect(r.started).not.toBeNull();
    expect(targets).toContain(r.started!.areaId);
    expect(r.started!.endsAt).toBe(1000 + COUNTER_HOURS * 3_600_000);
    // None while it is under way.
    let s2 = r.sea;
    for (let i = 0; i < COUNTER_EVERY * 2; i++) s2 = countSortie(s2, targets, 2000).sea;
    expect(s2.counter).toEqual(r.started);
  });

  it('no counterattack while too few seas can be struck', () => {
    let sea = emptySeaControl();
    for (let i = 0; i < COUNTER_EVERY * 3; i++) sea = countSortie(sea, targets.slice(0, COUNTER_MIN_HELD - 1), 0).sea;
    expect(sea.counter).toBeNull();
  });

  it('a defence won keeps the sea and pays a share of the first reward; lost, or left past the deadline, the sea goes', () => {
    const counter = { areaId: won[3], startedAt: 0, endsAt: 100 };
    const sea = { ...emptySeaControl(), counter };
    expect(settleDefense(sea, won[3], true)).toEqual({ ...sea, counter: null });
    expect(settleDefense(sea, won[3], false).lost).toEqual([won[3]]);
    expect(expireCounter(sea, 99).lostArea).toBeNull();
    expect(expireCounter(sea, 100).sea.lost).toEqual([won[3]]);
    expect(defenseReward({ fuel: 1000, steel: 500 })).toEqual({ fuel: 300, ammo: 0, steel: 150, bauxite: 0 });
    // Won again, the sea is back.
    expect(retakeArea({ ...sea, lost: [won[3]] }, won[3]).lost).toEqual([]);
  });

  it('a sea lost pays nothing; the home screen calls the player to a defence', () => {
    const now = 10 * HOUR;
    const p = { ...emptyProgress(), campaign: won, sea: { ...emptySeaControl(), incomeAt: now - HOUR, lost: [won[1], won[2]], counter: { areaId: won[3], startedAt: now, endsAt: now + HOUR } } };
    expect(applySeaControl(p, now).resources.fuel).toBe(SEA_INCOME_PER_AREA.fuel * (won.length - 2));
    const item = pendingSummary(p, now, 0).find((i) => i.id === 'counter');
    expect(item?.data).toEqual({ areaId: won[3] });
  });

  it('medals and quest events for the seas held, defended and won back', () => {
    const ids = MEDALS.map((m) => m.id);
    for (const id of ['sea_held', 'sea_defender', 'sea_retake']) expect(ids).toContain(id);
    expect(QUEST_EVENTS).toContain('defenseWin');
    expect(QUEST_EVENTS).toContain('seaRetake');
  });
});

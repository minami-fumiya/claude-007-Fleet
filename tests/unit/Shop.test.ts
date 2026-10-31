import { describe, it, expect } from 'vitest';
import { addGold, battleGold, boughtThisHour, buy, canBuy, dailyDeal, emptyWallet, ITEMS, parseWallet, priceOf, sell, SELL, SELL_HOURLY, SHOP_ENTRIES, shopRefillMs } from '@/systems/GoldSystem';
import { ECONOMY, hourBudget, hourGold } from '@/systems/EconomyModel';
import { RESOURCE_KEYS, resources } from '@/systems/ResourceSystem';
import { ITEM_LABEL } from '@/systems/QuestSystem';
import { IResources } from '@/types/Progression';

const NOW = Date.UTC(2026, 9, 20, 3);
const DAY = 86_400_000;
const CAP: IResources = resources({ fuel: 10_000, ammo: 10_000, steel: 10_000, bauxite: 5_000 });
const HAVE = resources({ fuel: 1000, ammo: 1000, steel: 1000, bauxite: 500 });
const rich = addGold(emptyWallet(), 100_000);

describe('gold (#183)', () => {
  it('campaign wins pay by rank and more on a first clear; defeats, exercises and scenarios pay nothing', () => {
    expect(battleGold({ victory: true, campaign: true, rank: 'S', firstClear: false })).toBeGreaterThan(battleGold({ victory: true, campaign: true, rank: 'B', firstClear: false }));
    expect(battleGold({ victory: true, campaign: true, rank: 'A', firstClear: true })).toBeGreaterThan(battleGold({ victory: true, campaign: true, rank: 'A', firstClear: false }));
    expect(battleGold({ victory: false, campaign: true, rank: 'C', firstClear: false })).toBe(0);
    expect(battleGold({ victory: true, campaign: false, rank: 'S', firstClear: false })).toBe(0);
    expect(battleGold({ victory: true, campaign: true, rank: 'S', firstClear: false, training: true })).toBe(battleGold({ victory: true, campaign: true, rank: 'S', firstClear: false }) / 2);
  });

  it('keeps the lifetime total apart from what is spent, and reads any stored purse', () => {
    const w = addGold(emptyWallet(), 500);
    expect(w).toEqual({ gold: 500, earned: 500, shop: { day: 0, bought: {} } });
    expect(parseWallet(undefined)).toEqual(emptyWallet());
    expect(parseWallet({ gold: -3, earned: 'x', shop: null })).toEqual(emptyWallet());
    expect(parseWallet(JSON.parse(JSON.stringify(w)))).toEqual(w);
  });
});

describe('shop (#183)', () => {
  it('buys a pack for gold, counts the hour and stops at its limit; the next hour starts over (#396)', () => {
    const e = SHOP_ENTRIES.find((x) => x.id === 'fuel_s')!;
    let w = rich;
    expect(e.hourly).toBe(5);
    for (let i = 0; i < e.hourly!; i++) {
      const r = buy(w, e, HAVE, CAP, NOW)!;
      expect(r.give.fuel).toBe(500);
      expect(r.wallet.gold).toBe(w.gold - priceOf(e, NOW));
      w = r.wallet;
    }
    expect(boughtThisHour(w, e.id, NOW)).toBe(e.hourly);
    expect(canBuy(w, e, HAVE, CAP, NOW)).toBe('limit');
    expect(canBuy(w, e, HAVE, CAP, NOW + shopRefillMs(NOW))).toBeNull();
    expect(w.earned).toBe(rich.earned);
  });

  it('refuses without the gold or when the pack would overflow the holding cap', () => {
    const e = SHOP_ENTRIES.find((x) => x.id === 'steel_l')!;
    expect(canBuy(emptyWallet(), e, HAVE, CAP, NOW)).toBe('gold');
    expect(canBuy(rich, e, { ...HAVE, steel: 9000 }, CAP, NOW)).toBe('cap');
    const item = SHOP_ENTRIES.find((x) => x.id === 'fast_repair')!;
    expect(buy(rich, item, HAVE, CAP, NOW)!.items).toEqual({ fastRepair: 1 });
  });

  it('one entry a day is the お買い得品, 30% off, the same all day', () => {
    const deal = dailyDeal(NOW);
    expect(dailyDeal(NOW + 3_600_000)).toBe(deal);
    expect(priceOf(deal, NOW)).toBe(Math.round(deal.price * 0.7));
    const days = new Set(Array.from({ length: 30 }, (_, i) => dailyDeal(NOW + i * DAY).id));
    expect(days.size).toBeGreaterThan(5);
  });

  it('sells spare resources for about half their price, five times an hour for each resource (#396)', () => {
    let w = emptyWallet();
    let have = resources({ fuel: 20_000 });
    for (let i = 0; i < SELL_HOURLY; i++) {
      const r = sell(w, 'fuel', have, NOW)!;
      w = r.wallet;
      have = r.resources;
    }
    expect(have.fuel).toBe(20_000 - SELL_HOURLY * SELL.amount);
    expect(w.gold).toBe(SELL_HOURLY * SELL.rates.fuel);
    expect(sell(w, 'fuel', have, NOW)).toBeNull();
    expect(sell(w, 'fuel', have, NOW + shopRefillMs(NOW))).not.toBeNull();
    expect(sell(emptyWallet(), 'steel', resources(), NOW)).toBeNull();
    // No profit from selling and buying back: every pack costs more per unit than selling pays.
    for (const e of SHOP_ENTRIES) for (const k of RESOURCE_KEYS) {
      const n = e.give?.[k];
      if (n) expect(e.price / n, `${e.id}`).toBeGreaterThan(SELL.rates[k] / SELL.amount);
    }
  });

  it("an hour's gold, spent at the shop's best rate, buys less than an hour of battle income (#396: the limit is per hour now)", () => {
    for (const phase of ECONOMY.phases) {
      const gold = hourGold(phase);
      const battle = hourBudget(phase).income.battle;
      for (const k of RESOURCE_KEYS) {
        const best = Math.max(...SHOP_ENTRIES.map((e) => (e.give?.[k] ?? 0) / e.price));
        expect(gold * best, `${phase.id} ${k}`).toBeLessThanOrEqual(battle[k]);
      }
    }
  });
});

describe('items (#184)', () => {
  it('items.json lists gold and every item, each with a use, sources and the screen it is used on', () => {
    expect(ITEMS.map((i) => i.id)).toEqual(['gold', 'fastRepair', 'fastBuild', 'trainingManual', 'supplyShip', 'captainBook']);
    for (const i of ITEMS) {
      expect(i.description.length).toBeGreaterThan(5);
      expect(i.sources.length).toBeGreaterThan(0);
      expect(i.scene).toMatch(/Scene$/);
    }
    expect(ITEM_LABEL).toEqual({ fastRepair: '高速修理材', fastBuild: '高速建造材', trainingManual: '訓練教範', supplyShip: '給糧艦', captainBook: '艦長教本' });
  });
});

describe('給糧艦は何隻でも買える (#359)', () => {
  it('has no hourly limit', () => {
    const e = SHOP_ENTRIES.find((x) => x.id === 'supply_ship')!;
    expect(e.hourly).toBeUndefined();
    let w = { ...rich, gold: 100_000 };
    for (let i = 0; i < 5; i++) w = buy(w, e, HAVE, CAP, NOW)!.wallet;
    expect(boughtThisHour(w, e.id, NOW)).toBe(5);
    expect(canBuy(w, e, HAVE, CAP, NOW)).toBeNull();
  });
});

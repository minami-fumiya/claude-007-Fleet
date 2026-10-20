import shopData from '@/data/shop.json';
import itemData from '@/data/items.json';
import { IItems, IResources, IWallet } from '@/types/Progression';
import { BattleRank } from './BattleRank';
import { gainResources, pay, RESOURCE_KEYS, resources } from './ResourceSystem';
import { gameDay } from './QuestSystem';

/**
 * ゴールドとショップ (#183, pure). Gold is the admiral's, shared by every nation: campaign wins (by rank), first
 * clears, sweeps, some quests and every medal pay it, and the shop turns it into resources and items, a day's limit
 * of each. Spare resources sell back for about half. There is no real-money purchase anywhere in the game.
 */

export interface IShopEntry {
  id: string;
  name: string;
  give?: Partial<IResources>;
  items?: Partial<IItems>;
  price: number;
  /** Purchases a game day */
  daily: number;
}

interface IShopData {
  entries: IShopEntry[];
  sell: { amount: number; rates: Record<keyof IResources, number>; daily: number };
  dealDiscount: number;
}

const SHOP = shopData as unknown as IShopData;
export const SHOP_ENTRIES = SHOP.entries;
export const SELL = SHOP.sell;
/** Pseudo-entry counting the day's sales against SELL.daily */
export const SELL_ID = 'sell';

/** Gold for a won campaign battle by rank (#183); a defeat pays nothing. */
export const GOLD_FOR_RANK: Record<BattleRank, number> = { S: 60, A: 40, B: 25, C: 10, D: 0 };
export const GOLD_FIRST_CLEAR = 200;
export const GOLD_SWEEP = 10;
export const GOLD_PER_MEDAL = 100;
/** A historical scenario's first win from a side (#200) */
export const GOLD_SCENARIO_FIRST = 100;

export function emptyWallet(): IWallet {
  return { gold: 0, earned: 0, shop: { day: 0, bought: {} } };
}

export function addGold(w: IWallet, amount: number): IWallet {
  const n = Math.max(0, Math.round(amount));
  return n === 0 ? w : { ...w, gold: w.gold + n, earned: w.earned + n };
}

/** Today's purchases (an older day's count as none). */
function bought(w: IWallet, now: number): Record<string, number> {
  return w.shop.day === gameDay(now) ? w.shop.bought : {};
}

/** The day's お買い得品 (#183): one entry, the same all day, at a discount. */
export function dailyDeal(now: number): IShopEntry {
  const day = gameDay(now);
  return SHOP_ENTRIES[((day * 7919) % SHOP_ENTRIES.length + SHOP_ENTRIES.length) % SHOP_ENTRIES.length];
}

export function priceOf(entry: IShopEntry, now: number): number {
  return dailyDeal(now).id === entry.id ? Math.round(entry.price * (1 - SHOP.dealDiscount)) : entry.price;
}

export function boughtToday(w: IWallet, id: string, now: number): number {
  return bought(w, now)[id] ?? 0;
}

export type ShopRefusal = 'gold' | 'limit' | 'cap' | null;

/** Why `entry` can't be bought now, or null when it can. A resource pack must fit under the holding cap. */
export function canBuy(w: IWallet, entry: IShopEntry, have: IResources, cap: IResources, now: number): ShopRefusal {
  if (boughtToday(w, entry.id, now) >= entry.daily) return 'limit';
  if (w.gold < priceOf(entry, now)) return 'gold';
  if (entry.give) {
    const lost = gainResources(have, entry.give, cap).lost;
    if (RESOURCE_KEYS.some((k) => lost[k] > 0)) return 'cap';
  }
  return null;
}

function counted(w: IWallet, id: string, now: number): IWallet['shop'] {
  const today = bought(w, now);
  return { day: gameDay(now), bought: { ...today, [id]: (today[id] ?? 0) + 1 } };
}

/** Buys one `entry`: the purse and the day's count, and what it gives. Null when refused. */
export function buy(w: IWallet, entry: IShopEntry, have: IResources, cap: IResources, now: number): { wallet: IWallet; give: IResources; items: Partial<IItems> } | null {
  if (canBuy(w, entry, have, cap, now)) return null;
  return { wallet: { ...w, gold: w.gold - priceOf(entry, now), shop: counted(w, entry.id, now) }, give: resources(entry.give ?? {}), items: entry.items ?? {} };
}

/** Sells SELL.amount of one resource for its rate (#183); null when short of it or past the day's limit. */
export function sell(w: IWallet, kind: keyof IResources, have: IResources, now: number): { wallet: IWallet; resources: IResources; gold: number } | null {
  if (boughtToday(w, SELL_ID, now) >= SELL.daily) return null;
  const left = pay(have, { [kind]: SELL.amount });
  if (!left) return null;
  const gold = SELL.rates[kind];
  return { wallet: { ...addGold(w, gold), shop: counted(w, SELL_ID, now) }, resources: left, gold };
}

/** Gold for a battle's result (#183): campaign wins only (free exercises and scenarios would farm it). */
export function battleGold(opts: { victory: boolean; campaign: boolean; rank: BattleRank; firstClear: boolean; training?: boolean }): number {
  if (!opts.campaign || !opts.victory) return 0;
  return Math.round(GOLD_FOR_RANK[opts.rank] * (opts.training ? 0.5 : 1)) + (opts.firstClear ? GOLD_FIRST_CLEAR : 0);
}

/** Tolerant parse of a stored wallet. */
export function parseWallet(v: unknown): IWallet {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return emptyWallet();
  const o = v as Record<string, unknown>;
  const n = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
  const shop = (typeof o.shop === 'object' && o.shop !== null ? o.shop : {}) as Record<string, unknown>;
  const list: Record<string, number> = {};
  if (typeof shop.bought === 'object' && shop.bought !== null) for (const [k, x] of Object.entries(shop.bought as Record<string, unknown>)) if (n(x) > 0) list[k] = n(x);
  const gold = n(o.gold);
  return { gold, earned: Math.max(gold, n(o.earned)), shop: { day: n(shop.day), bought: list } };
}

export interface IItemInfo {
  id: keyof IItems | 'gold';
  name: string;
  description: string;
  sources: string[];
  scene: string;
  use: string;
}

/** Items (#184), from items.json: what each is for, how it comes and where it is used. */
export const ITEMS = (itemData as { items: IItemInfo[] }).items;

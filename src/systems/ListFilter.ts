import { IShipData } from '@/types/Ship';
import { kindLabel } from './EncyclopediaSystem';
import { classKey, className } from './ShipOrder';

/**
 * 一覧の絞り込み (#263, pure): the same filter on the shipyard, the 図鑑, the fleet builder and the refit list — a
 * state (what can be built now, owned, not owned), a kind (重巡洋艦, 軽空母 …) and a name search that matches the
 * ship's or its class's name in kana, kanji or Latin letters.
 */

export type ListState = 'all' | 'buildable' | 'owned' | 'unowned';

export interface IListFilter {
  state: ListState;
  /** A kind label from kindLabel (重巡洋艦 …), or null for every kind */
  kind: string | null;
  /** Part of a name; '' matches everything */
  query: string;
}

export const NO_FILTER: IListFilter = { state: 'all', kind: null, query: '' };

export const LIST_STATE_LABEL: Record<ListState, string> = {
  all: 'すべて',
  buildable: '建造できる',
  owned: '保有',
  unowned: '未保有',
};

/** Folds width, case and katakana into one form, so ｶﾞﾝﾄ, ガント and がんと match alike. */
export function normalizeQuery(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '');
}

export interface IFilterContext {
  owned: readonly string[];
  /** Whether a ship can be built now (the shipyard's 'ready'); only the shipyard passes it */
  buildable?: (ship: IShipData) => boolean;
  /** The roster, to search class names ("長門型") */
  roster?: readonly IShipData[];
  /** Whether the ship's name may be shown (#245): a hidden ship never matches a name search */
  nameKnown?: (ship: IShipData) => boolean;
}

/** The ships that pass `filter`, in their order. */
export function filterShips(ships: readonly IShipData[], filter: IListFilter, ctx: IFilterContext): IShipData[] {
  const q = normalizeQuery(filter.query);
  const leads = new Map((ctx.roster ?? ships).map((s) => [s.id, s]));
  return ships.filter((s) => {
    if (filter.state === 'owned' && !ctx.owned.includes(s.id)) return false;
    if (filter.state === 'unowned' && ctx.owned.includes(s.id)) return false;
    if (filter.state === 'buildable' && !(ctx.buildable?.(s) ?? false)) return false;
    if (filter.kind && kindLabel(s) !== filter.kind) return false;
    if (q) {
      if (ctx.nameKnown && !ctx.nameKnown(s)) return false;
      const lead = leads.get(classKey(s)) ?? s;
      const names = [s.name, className(lead)].map(normalizeQuery);
      if (!names.some((n) => n.includes(q))) return false;
    }
    return true;
  });
}

/** The kinds present in `ships`, in their first-seen order: the choices of the kind button. */
export function kindsOf(ships: readonly IShipData[]): string[] {
  return [...new Set(ships.map(kindLabel))];
}

/** The next value in a cycle (the state and kind buttons step through their choices). */
export function nextIn<T>(list: readonly T[], current: T): T {
  const i = list.indexOf(current);
  return list[(i + 1) % list.length];
}

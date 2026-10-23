import { IShipData } from '@/types/Ship';
import { kindLabel } from './EncyclopediaSystem';
import { classKey, className } from './ShipOrder';

/**
 * 一覧の絞り込み (#263, pure): the same filter on the shipyard, the 図鑑, the fleet builder and the refit list — a
 * state (what can be built now, owned, not owned), a kind (重巡洋艦, 軽空母 …) and a name search that matches the
 * ship's or its class's name in kana, kanji or Latin letters (hiragana also against the romaji, #338).
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

/** Folds width, case and katakana into one form, so half-width kana, ガント and がんと match alike. */
export function normalizeQuery(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '');
}

const KANA: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o', か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko', が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so', ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo', た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do', な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no', は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo', ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po', ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo', ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro', わ: 'wa', を: 'o', ん: 'n', ゔ: 'vu',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
};
const SMALL_Y: Record<string, string> = { ゃ: 'a', ゅ: 'u', ょ: 'o' };

/** Hiragana as Hepburn romaji (#338): "しょうかく" → "shoukaku"; anything else is kept. */
export function kanaToRomaji(text: string): string {
  let out = '';
  let double = false;
  for (const c of text) {
    if (c === 'っ') {
      double = true;
      continue;
    }
    let r = KANA[c];
    if (SMALL_Y[c] !== undefined) {
      // きゃ → kya, しゃ → sha, ちゃ → cha, じゃ → ja.
      out = out.replace(/(shi|chi|ji|[a-z]i)$/, (m) => (m === 'shi' ? 'sh' : m === 'chi' ? 'ch' : m === 'ji' ? 'j' : `${m.slice(0, -1)}y`)) + SMALL_Y[c];
      continue;
    }
    if (c === 'ー') r = out.slice(-1);
    if (r === undefined) r = c;
    if (double && /^[a-z]/.test(r)) r = (r.startsWith('ch') ? 't' : r[0]) + r;
    double = false;
    out += r;
  }
  return out;
}

/**
 * One spelling for romaji (#338): no macrons, case, spaces or marks, and long vowels and n/m before b, m, p
 * folded, so "Shōkaku", "Shokaku" and しょうかく ("shoukaku") all read "shokaku".
 */
export function romajiKey(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/ou|oo/g, 'o')
    .replace(/uu/g, 'u')
    .replace(/aa/g, 'a')
    .replace(/m(?=[bmp])/g, 'n');
}

const HAS_KANA = /[\u3041-\u309f]/;

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
      // かな検索 (#338): hiragana typed for a name written in kanji reads against its romaji ("ながと" → 長門 (Nagato)).
      const roman = HAS_KANA.test(q) ? romajiKey(kanaToRomaji(q)) : '';
      if (!names.some((n) => n.includes(q) || (roman.length >= 2 && romajiKey(n).includes(roman)))) return false;
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

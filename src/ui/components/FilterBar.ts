import Phaser from 'phaser';
import { UIButton } from './UIKit';
import { IListFilter, LIST_STATE_LABEL, ListState, nextIn, NO_FILTER } from '@/systems/ListFilter';

/** The rectangle the bar fills. */
interface IBarRect { x: number; y: number; w: number; h: number }

interface IFilterBarOptions {
  /** Where the choice is kept between visits (localStorage) */
  key: string;
  /** The state button's choices; null leaves the button out (the 図鑑 keeps its own 所持のみ toggle) */
  states: ListState[] | null;
  /** The kinds the kind button steps through (the current tab's) */
  kinds: () => string[];
  onChange: (filter: IListFilter) => void;
  /** The filter on a first visit */
  initial?: Partial<IListFilter>;
  fontSize?: number;
}

const STORE = 'ww2fleet.filter.';

/** The filter a screen last used (its key), or `fallback`. */
export function loadFilter(key: string, fallback: IListFilter = NO_FILTER): IListFilter {
  try {
    const raw = localStorage.getItem(STORE + key);
    if (!raw) return fallback;
    const v = JSON.parse(raw) as Partial<IListFilter>;
    return { ...fallback, ...v, query: typeof v.query === 'string' ? v.query : '' };
  } catch {
    return fallback;
  }
}

function save(key: string, filter: IListFilter): void {
  try {
    localStorage.setItem(STORE + key, JSON.stringify(filter));
  } catch {
    // Private windows may refuse storage: the filter just isn't remembered.
  }
}

/**
 * 一覧の絞り込み (#263): a row of buttons over a ship list — what to show (建造できる / 保有 …), the kind, and a name
 * search — the same on the shipyard, the 図鑑, the fleet builder and the refit list. The choice is remembered per
 * screen.
 */
export class FilterBar {
  private filterValue: IListFilter;
  private stateBtn?: UIButton;
  private kindBtn: UIButton;
  private searchBtn: UIButton;

  constructor(scene: Phaser.Scene, r: IBarRect, private readonly opts: IFilterBarOptions) {
    this.filterValue = loadFilter(opts.key, { ...NO_FILTER, ...opts.initial });
    const parts = opts.states ? 3 : 2;
    const gap = 8;
    const bw = (r.w - gap * (parts - 1)) / parts;
    const fontSize = opts.fontSize ?? 13;
    let x = r.x + bw / 2;
    const cy = r.y + r.h / 2;
    if (opts.states) {
      const states = opts.states;
      this.stateBtn = new UIButton(scene, x, cy, '', () => this.set({ state: nextIn(states, this.filterValue.state) }), { variant: 'secondary', width: bw, height: r.h, fontSize });
      x += bw + gap;
    }
    this.kindBtn = new UIButton(scene, x, cy, '', () => {
      const kinds: Array<string | null> = [null, ...opts.kinds()];
      this.set({ kind: nextIn(kinds, kinds.includes(this.filterValue.kind) ? this.filterValue.kind : null) });
    }, { variant: 'secondary', width: bw, height: r.h, fontSize });
    x += bw + gap;
    this.searchBtn = new UIButton(scene, x, cy, '', () => this.ask(), { variant: 'secondary', width: bw, height: r.h, fontSize });
    this.label();
  }

  /** The bar's buttons, for screens that redraw (and destroy) their controls on every refresh. */
  get buttons(): UIButton[] {
    return [this.stateBtn, this.kindBtn, this.searchBtn].filter((b): b is UIButton => b !== undefined);
  }

  get filter(): IListFilter {
    return this.filterValue;
  }

  /** Drops a kind the current tab doesn't have (switching from 戦艦 to 駆逐艦 clears 巡洋戦艦). */
  fitKinds(): void {
    if (this.filterValue.kind && !this.opts.kinds().includes(this.filterValue.kind)) {
      this.filterValue = { ...this.filterValue, kind: null };
      save(this.opts.key, this.filterValue);
      this.label();
    }
  }

  private ask(): void {
    const answer = window.prompt('艦名・級の名前で検索 (空欄で解除)', this.filterValue.query);
    if (answer === null) return;
    this.set({ query: answer.trim() });
  }

  private set(change: Partial<IListFilter>): void {
    this.filterValue = { ...this.filterValue, ...change };
    save(this.opts.key, this.filterValue);
    this.label();
    this.opts.onChange(this.filterValue);
  }

  private label(): void {
    const f = this.filterValue;
    this.stateBtn?.setLabel(`表示: ${LIST_STATE_LABEL[f.state]}`).setVariant(f.state === 'all' ? 'secondary' : 'primary');
    this.kindBtn.setLabel(`艦種: ${f.kind ?? 'すべて'}`).setVariant(f.kind ? 'primary' : 'secondary');
    this.searchBtn.setLabel(f.query ? `検索: ${f.query}` : '名前で検索').setVariant(f.query ? 'primary' : 'secondary');
  }
}

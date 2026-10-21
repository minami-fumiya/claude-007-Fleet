import { Css, Fonts } from '@/ui/theme';
import { pushRecent, suggest } from '@/utils/SearchHistory';

/**
 * A text box over the game (#308), in the game's look, instead of the browser's own prompt window. It is an HTML
 * input laid over the canvas so Japanese input (IME) works. Used for the name search (with recent searches and
 * suggestions) and for the save code in the settings (shown to copy, or pasted in).
 */

export interface ITextInputOptions {
  title: string;
  /** Under the title, e.g. "空欄で解除" */
  hint?: string;
  value?: string;
  placeholder?: string;
  /** The save code: a multi-line box */
  multiline?: boolean;
  /** Shown to copy only (the field is selected); the confirm button reads 閉じる */
  readonly?: boolean;
  confirmLabel?: string;
  /** Names to suggest as the player types (the name search) */
  names?: readonly string[];
  /** localStorage key of the recent searches; none when absent */
  recentKey?: string;
}

const ID = 'text-input-sheet';

function loadRecent(key: string | undefined): string[] {
  if (!key) return [];
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveRecent(key: string | undefined, list: string[]): void {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Storage refused (private window): the recent list just isn't remembered.
  }
}

/** Whether a text box is open (scenes leave their keys alone while it is). */
export function textInputOpen(): boolean {
  return document.getElementById(ID) !== null;
}

/** Opens the box; resolves with the text (trimmed) on confirm, or null when cancelled. */
export function askText(opts: ITextInputOptions): Promise<string | null> {
  document.getElementById(ID)?.remove();
  return new Promise((resolve) => {
    const shade = document.createElement('div');
    shade.id = ID;
    Object.assign(shade.style, {
      position: 'fixed', inset: '0', background: 'rgba(2, 8, 20, 0.78)', zIndex: '1000',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh', fontFamily: Fonts.body,
    } as Partial<CSSStyleDeclaration>);
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      width: 'min(520px, 92vw)', background: Css.bgMid, border: `1px solid ${Css.cyan}`, borderRadius: '16px',
      boxShadow: '0 0 24px rgba(97, 231, 255, 0.25)', padding: '18px 18px 14px', color: Css.text, boxSizing: 'border-box',
    } as Partial<CSSStyleDeclaration>);
    shade.appendChild(panel);

    const title = document.createElement('div');
    title.textContent = opts.title;
    Object.assign(title.style, { fontSize: '17px', fontWeight: '900', marginBottom: opts.hint ? '4px' : '12px' });
    panel.appendChild(title);
    if (opts.hint) {
      const hint = document.createElement('div');
      hint.textContent = opts.hint;
      Object.assign(hint.style, { fontSize: '12px', color: Css.muted, marginBottom: '12px' });
      panel.appendChild(hint);
    }

    const field: HTMLInputElement | HTMLTextAreaElement = document.createElement(opts.multiline ? 'textarea' : 'input');
    field.value = opts.value ?? '';
    if (opts.placeholder) field.placeholder = opts.placeholder;
    field.readOnly = opts.readonly === true;
    field.setAttribute('data-role', 'text-input');
    Object.assign(field.style, {
      width: '100%', boxSizing: 'border-box', background: Css.bgDeep, color: Css.text, border: `1px solid ${Css.dim}`,
      borderRadius: '10px', padding: '10px 12px', fontSize: '16px', fontFamily: Fonts.body, outline: 'none',
      ...(opts.multiline ? { height: '140px', resize: 'none', fontSize: '12px', wordBreak: 'break-all' } : {}),
    } as Partial<CSSStyleDeclaration>);
    panel.appendChild(field);

    // Suggestions and recent searches (name search only).
    const chips = document.createElement('div');
    Object.assign(chips.style, { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px', minHeight: opts.names ? '30px' : '0' });
    panel.appendChild(chips);
    const recent = loadRecent(opts.recentKey);
    const chip = (label: string, onPick: () => void, css: string): void => {
      const b = document.createElement('button');
      b.textContent = label;
      Object.assign(b.style, {
        background: 'transparent', color: css, border: `1px solid ${css}`, borderRadius: '999px', padding: '4px 10px',
        fontSize: '13px', fontFamily: Fonts.body, cursor: 'pointer',
      } as Partial<CSSStyleDeclaration>);
      b.addEventListener('click', onPick);
      chips.appendChild(b);
    };
    const drawChips = (): void => {
      chips.replaceChildren();
      if (!opts.names) return;
      const typed = field.value;
      const found = suggest(opts.names, typed);
      if (found.length > 0) for (const n of found) chip(n, () => finish(n), Css.cyan);
      else if (!typed.trim()) for (const r of recent) chip(`最近: ${r}`, () => finish(r), Css.muted);
    };
    field.addEventListener('input', drawChips);

    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '8px', marginTop: '14px', justifyContent: 'flex-end' });
    panel.appendChild(row);
    const button = (label: string, onClick: () => void, primary: boolean): void => {
      const b = document.createElement('button');
      b.textContent = label;
      Object.assign(b.style, {
        background: primary ? Css.cyan : 'transparent', color: primary ? Css.ink : Css.text, border: `1px solid ${primary ? Css.cyan : Css.dim}`,
        borderRadius: '10px', padding: '10px 16px', fontSize: '15px', fontWeight: '900', fontFamily: Fonts.body, cursor: 'pointer', minWidth: '88px',
      } as Partial<CSSStyleDeclaration>);
      b.addEventListener('click', onClick);
      row.appendChild(b);
    };

    let done = false;
    const close = (value: string | null): void => {
      if (done) return;
      done = true;
      shade.remove();
      resolve(value);
    };
    const finish = (text: string): void => {
      const value = text.trim();
      if (value && opts.recentKey) saveRecent(opts.recentKey, pushRecent(recent, value));
      close(value);
    };
    if (opts.readonly) {
      button(opts.confirmLabel ?? '閉じる', () => close(field.value), true);
    } else {
      button('やめる', () => close(null), false);
      if (opts.names) button('解除', () => close(''), false);
      button(opts.confirmLabel ?? '検索', () => finish(field.value), true);
    }
    // Enter confirms a one-line box; Escape cancels; a tap on the shade outside the panel cancels too.
    field.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if ((e as KeyboardEvent).key === 'Escape') close(null);
      else if ((e as KeyboardEvent).key === 'Enter' && !opts.multiline && !(e as KeyboardEvent).isComposing) finish(field.value);
    });
    shade.addEventListener('pointerdown', (e) => {
      if (e.target === shade) close(null);
    });

    document.body.appendChild(shade);
    drawChips();
    field.focus();
    if (opts.readonly) field.select();
  });
}

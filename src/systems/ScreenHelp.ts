import helpData from '@/data/screen-help.json';

/**
 * First-visit help (#61, pure): each screen explains itself once, the first time it opens. The ids seen are kept
 * in the save; 設定 can show them all again.
 */

/** One page of a screen's help (#421): a heading and a few lines. */
export interface IHelpPage {
  title: string;
  text: string;
}

export interface IScreenHelp {
  /** The scene key */
  id: string;
  title: string;
  /** Turned with ‹ › (#421); a page holds at most HELP_PAGE_CHARS characters */
  pages: IHelpPage[];
}

/** A help page's most characters (#421): about five lines on either layout. */
export const HELP_PAGE_CHARS = 150;

/**
 * Splits an old-style help text into pages (#421): a page for each paragraph (blank line or line break), the
 * heading taken from the screen's title with the page number.
 */
export function pagesOf(title: string, text: string): IHelpPage[] {
  const parts = text.split(/\n+/).map((t) => t.trim()).filter((t) => t);
  return parts.map((t, i) => ({ title: parts.length > 1 ? `${title} (${i + 1})` : title, text: t }));
}

/** "‹ 1 / 3 ›" (#421). */
export function pageLabel(page: number, pages: number): string {
  return `${page + 1} / ${pages}`;
}

/** Splits rows into pages by height (#421): as many as fit `room`, at least one a page. */
export function paginate<T>(rows: readonly T[], height: (row: T) => number, room: number): T[][] {
  const out: T[][] = [];
  let page: T[] = [];
  let used = 0;
  for (const r of rows) {
    const h = height(r);
    if (page.length > 0 && used + h > room) {
      out.push(page);
      page = [];
      used = 0;
    }
    page.push(r);
    used += h;
  }
  if (page.length > 0) out.push(page);
  return out;
}

/** Every screen's help; an entry still written as one `text` is read as pages, a paragraph each. */
export const SCREEN_HELP: IScreenHelp[] = (helpData as { screens: Array<Omit<IScreenHelp, 'pages'> & { pages?: IHelpPage[]; text?: string }> }).screens
  .map((h) => ({ id: h.id, title: h.title, pages: h.pages ?? pagesOf(h.title, h.text ?? '') }));

export function screenHelp(id: string): IScreenHelp | undefined {
  return SCREEN_HELP.find((h) => h.id === id);
}

/** The help to show for `id`: none when the screen has no help or it was already seen. */
export function unseenHelp(seen: readonly string[], id: string): IScreenHelp | undefined {
  return seen.includes(id) ? undefined : screenHelp(id);
}

export function markHelpSeen(seen: readonly string[], id: string): string[] {
  return seen.includes(id) ? [...seen] : [...seen, id];
}

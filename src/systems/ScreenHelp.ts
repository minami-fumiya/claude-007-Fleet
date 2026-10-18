import helpData from '@/data/screen-help.json';

/**
 * First-visit help (#61, pure): each screen explains itself once, the first time it opens. The ids seen are kept
 * in the save; 設定 can show them all again.
 */

export interface IScreenHelp {
  /** The scene key */
  id: string;
  title: string;
  text: string;
}

export const SCREEN_HELP = (helpData as { screens: IScreenHelp[] }).screens;

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

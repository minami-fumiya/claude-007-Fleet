import { applyTheme, Css, resolveTheme } from './theme';

/**
 * Applies the stored colour theme (#94) as the very first thing main.ts does, before any screen module reads a colour
 * token into a constant of its own. A change in the settings reloads the page.
 */
function storedTheme(): string {
  try {
    const raw = localStorage.getItem('ww2fleet.settings.v1');
    const v = raw ? (JSON.parse(raw) as { theme?: unknown }).theme : undefined;
    return typeof v === 'string' ? v : 'dark';
  } catch {
    return 'dark';
  }
}

const prefersDark = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
applyTheme(resolveTheme(storedTheme(), prefersDark));
// The page around the canvas (bars beside it on a wide or tall screen) takes the theme's background too.
if (typeof document !== 'undefined') {
  document.documentElement.style.background = Css.bgDeep;
  if (document.body) document.body.style.background = Css.bgDeep;
}

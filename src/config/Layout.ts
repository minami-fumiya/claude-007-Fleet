export type Orientation = 'portrait' | 'landscape';

export interface IInputCapabilities {
  /** `(any-pointer: coarse)` — a finger is available */
  coarsePointer: boolean;
  /** `(any-pointer: fine)` — a mouse or trackpad is available */
  finePointer: boolean;
  /** Explicit `?layout=portrait|landscape` override from the URL, if any */
  override?: string | null;
  /** 画面の向き (#95): the settings' choice — 'auto', or a fixed 'portrait' / 'landscape' */
  choice?: string | null;
  /** The window is wider than tall (a phone held sideways) */
  wide?: boolean;
}

/** A device that has only a finger (a phone or tablet). */
export function touchOnly(caps: Pick<IInputCapabilities, 'coarsePointer' | 'finePointer'>): boolean {
  return caps.coarsePointer && !caps.finePointer;
}

/**
 * Phones and tablets (touch only, no mouse) play the way they are held (#95: portrait unless turned sideways); anything
 * with a mouse plays in landscape. The settings may fix either way, and `?layout=` in the URL forces either layout,
 * which is handy for checking the phone UI on a PC.
 */
export function resolveOrientation(caps: IInputCapabilities): Orientation {
  if (caps.override === 'portrait' || caps.override === 'landscape') return caps.override;
  if (caps.choice === 'portrait' || caps.choice === 'landscape') return caps.choice;
  return touchOnly(caps) && !caps.wide ? 'portrait' : 'landscape';
}

/** The settings key the orientation is read from before the game starts. */
const SETTINGS_KEY = 'ww2fleet.settings.v1';

function storedOrientationChoice(): string | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const v = raw ? (JSON.parse(raw) as { orientation?: unknown }).orientation : null;
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

/** The browser's input and window as resolveOrientation needs them. */
export function currentCapabilities(): IInputCapabilities {
  return {
    coarsePointer: window.matchMedia('(any-pointer: coarse)').matches,
    finePointer: window.matchMedia('(any-pointer: fine)').matches,
    override: new URLSearchParams(window.location.search).get('layout'),
    choice: storedOrientationChoice(),
    wide: window.innerWidth > window.innerHeight,
  };
}

export function canvasSize(orientation: Orientation): { width: number; height: number } {
  return orientation === 'portrait' ? { width: 720, height: 1280 } : { width: 1280, height: 720 };
}

/** Reads the current browser's capabilities; falls back to landscape outside a browser (tests, SSR). */
export function detectOrientation(): Orientation {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'landscape';
  return resolveOrientation(currentCapabilities());
}

export type Orientation = 'portrait' | 'landscape';

export interface IInputCapabilities {
  /** `(any-pointer: coarse)` — a finger is available */
  coarsePointer: boolean;
  /** `(any-pointer: fine)` — a mouse or trackpad is available */
  finePointer: boolean;
  /** Explicit `?layout=portrait|landscape` override from the URL, if any */
  override?: string | null;
}

/**
 * Phones and tablets (touch only, no mouse) play in portrait; anything with a mouse plays in landscape.
 * `?layout=` in the URL forces either layout, which is handy for checking the phone UI on a PC.
 */
export function resolveOrientation(caps: IInputCapabilities): Orientation {
  if (caps.override === 'portrait' || caps.override === 'landscape') return caps.override;
  return caps.coarsePointer && !caps.finePointer ? 'portrait' : 'landscape';
}

export function canvasSize(orientation: Orientation): { width: number; height: number } {
  return orientation === 'portrait' ? { width: 720, height: 1280 } : { width: 1280, height: 720 };
}

/** Reads the current browser's capabilities; falls back to landscape outside a browser (tests, SSR). */
export function detectOrientation(): Orientation {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'landscape';
  return resolveOrientation({
    coarsePointer: window.matchMedia('(any-pointer: coarse)').matches,
    finePointer: window.matchMedia('(any-pointer: fine)').matches,
    override: new URLSearchParams(window.location.search).get('layout'),
  });
}

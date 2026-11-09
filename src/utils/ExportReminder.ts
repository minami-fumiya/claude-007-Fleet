/**
 * セーブの書き出し (#116, 0.0.71). Until the cloud save (before the beta, 2026-11-09 decision) the save lives only in
 * this browser: the game remembers when it was last written out (a code or a file) on this device, and asks for it
 * again after enough sorties or a new version. Kept in its own key, per device, outside the save itself.
 */
export const EXPORT_KEY = 'ww2fleet.export.v1';
/** Sorties after which the notice asks again. */
export const EXPORT_EVERY_SORTIES = 10;

export interface IExportState {
  /** When the save was last copied or written to a file (ms), 0 never */
  lastAt: number;
  /** The career sorties then */
  sorties: number;
  /** The game version then */
  version: string;
}

export const NO_EXPORT: IExportState = { lastAt: 0, sorties: 0, version: '' };

/** Read safely: anything broken reads as never exported. */
export function parseExportState(raw: string | null): IExportState {
  try {
    const o = raw ? (JSON.parse(raw) as Partial<IExportState>) : null;
    if (!o || typeof o !== 'object') return NO_EXPORT;
    return {
      lastAt: typeof o.lastAt === 'number' && Number.isFinite(o.lastAt) ? o.lastAt : 0,
      sorties: typeof o.sorties === 'number' && Number.isFinite(o.sorties) ? Math.max(0, o.sorties) : 0,
      version: typeof o.version === 'string' ? o.version : '',
    };
  } catch {
    return NO_EXPORT;
  }
}

/**
 * Why the notice should ask for a write-out now, or null: never written and EXPORT_EVERY_SORTIES sorties played,
 * that many more since the last one, or a new version since then (only once something was written).
 */
export function exportDue(state: IExportState, sorties: number, version: string): 'never' | 'sorties' | 'version' | null {
  if (state.lastAt === 0) return sorties >= EXPORT_EVERY_SORTIES ? 'never' : null;
  if (sorties - state.sorties >= EXPORT_EVERY_SORTIES) return 'sorties';
  if (state.version !== '' && state.version !== version) return 'version';
  return null;
}

/** The write-out just done. */
export function exported(now: number, sorties: number, version: string): IExportState {
  return { lastAt: now, sorties, version };
}

/** "2026/11/09 08:30" (local time), or a line saying it never was. */
export function lastExportText(state: IExportState): string {
  if (state.lastAt === 0) return 'まだ書き出していません';
  const d = new Date(state.lastAt);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function loadExportState(): IExportState {
  try {
    return parseExportState(localStorage.getItem(EXPORT_KEY));
  } catch {
    return NO_EXPORT;
  }
}

export function saveExportState(state: IExportState): void {
  try {
    localStorage.setItem(EXPORT_KEY, JSON.stringify(state));
  } catch {
    // A browser without storage simply asks again next time.
  }
}

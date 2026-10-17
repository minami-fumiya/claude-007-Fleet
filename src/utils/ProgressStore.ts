/**
 * Player progress that survives reloads: captain XP and fitted upgrades. Stored in localStorage
 * when available; every access is guarded so a blocked or missing storage only loses persistence.
 */

const STORAGE_KEY = 'ww2fleet.progress.v1';

export interface IProgress {
  /** Captain id → total XP */
  captainXp: Record<string, number>;
  /** Ship id → fitted upgrade ids */
  upgrades: Record<string, string[]>;
}

export function emptyProgress(): IProgress {
  return { captainXp: {}, upgrades: {} };
}

let memory: IProgress | null = null;

/** Parses stored JSON, ignoring anything malformed. */
export function parseProgress(raw: string | null): IProgress {
  if (!raw) return emptyProgress();
  try {
    const data = JSON.parse(raw) as Partial<IProgress>;
    const captainXp: Record<string, number> = {};
    for (const [id, xp] of Object.entries(data.captainXp ?? {})) {
      if (typeof xp === 'number' && Number.isFinite(xp)) captainXp[id] = xp;
    }
    const upgrades: Record<string, string[]> = {};
    for (const [id, list] of Object.entries(data.upgrades ?? {})) {
      if (Array.isArray(list)) upgrades[id] = list.filter((u): u is string => typeof u === 'string');
    }
    return { captainXp, upgrades };
  } catch {
    return emptyProgress();
  }
}

export function loadProgress(): IProgress {
  if (memory) return memory;
  let raw: string | null = null;
  try {
    raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  } catch {
    raw = null;
  }
  memory = parseProgress(raw);
  return memory;
}

export function saveProgress(progress: IProgress): void {
  memory = progress;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Storage full or blocked: keep the in-memory copy for this session.
  }
}

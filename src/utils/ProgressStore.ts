/**
 * Player progress that survives reloads: captain XP and fitted upgrades. Stored in localStorage
 * when available; every access is guarded so a blocked or missing storage only loses persistence.
 */

import { IDockJob, IResources } from '@/types/Progression';
import { resources, STARTING_RESOURCES } from '@/systems/ResourceSystem';

const STORAGE_KEY = 'ww2fleet.progress.v1';

export interface IProgress {
  /** Captain id → total XP */
  captainXp: Record<string, number>;
  /** Ship id → fitted upgrade ids */
  upgrades: Record<string, string[]>;
  resources: IResources;
  /** Ship id → HP fraction it came home with (absent = undamaged) */
  damage: Record<string, number>;
  docks: IDockJob[];
  /** Finished research ids */
  research: string[];
  /** Cleared campaign area ids */
  campaign: string[];
  /** Ship id → crew proficiency 0..100 */
  proficiency: Record<string, number>;
  /** Ship id → refit stage (0 = original) */
  refits: Record<string, number>;
}

export function emptyProgress(): IProgress {
  return { captainXp: {}, upgrades: {}, resources: { ...STARTING_RESOURCES }, damage: {}, docks: [], research: [], campaign: [], proficiency: {}, refits: {} };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

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
    const r = (data.resources ?? {}) as Partial<IResources>;
    const res = data.resources
      ? resources({ fuel: isNum(r.fuel) ? r.fuel : 0, ammo: isNum(r.ammo) ? r.ammo : 0, steel: isNum(r.steel) ? r.steel : 0, bauxite: isNum(r.bauxite) ? r.bauxite : 0 })
      : { ...STARTING_RESOURCES };
    const damage: Record<string, number> = {};
    for (const [id, f] of Object.entries(data.damage ?? {})) {
      if (isNum(f)) damage[id] = Math.min(1, Math.max(0, f));
    }
    const docks = (Array.isArray(data.docks) ? data.docks : []).filter(
      (d): d is IDockJob => typeof d?.shipId === 'string' && isNum(d?.endsAt),
    );
    const research = (Array.isArray(data.research) ? data.research : []).filter((id): id is string => typeof id === 'string');
    const campaign = (Array.isArray(data.campaign) ? data.campaign : []).filter((id): id is string => typeof id === 'string');
    const numbers = (src: unknown): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const [id, v] of Object.entries((src ?? {}) as Record<string, unknown>)) if (isNum(v)) out[id] = v;
      return out;
    };
    return {
      captainXp, upgrades, resources: res, damage, docks, research, campaign,
      proficiency: numbers(data.proficiency),
      refits: numbers(data.refits),
    };
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

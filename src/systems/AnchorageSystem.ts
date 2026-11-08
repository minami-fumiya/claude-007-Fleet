/**
 * 停泊地の設備 (#445, 0.0.70): what a place a ship lies at can do for it.
 *
 * - 入渠 (repair in a dock): the navy's home ports (軍港), and a forward base once its 泊地修理所 is built.
 *   A ship lying at sea, or at a forward base without one, sails to such a place first.
 * - 補給 (a full tank): every base of the navy (and the ports on the sea, 0.0.70-B).
 */
import { BASES, IBase, IBaseWorks, isForward, openBases, theaterFacility } from '@/systems/BaseSystem';
import { baseAnchor, IAnchoredFleet, IAnchorPlace, ISectorRef, seaSteps, shipPlace, WORLD_MAP } from '@/systems/OpenSeaSystem';
import { IRankProgress } from '@/systems/RankSystem';
import { Facilities } from '@/systems/FacilitySystem';

type DockProgress = IRankProgress & IBaseWorks & { nation: string; facilities?: Facilities; openSea: { anchors: IAnchoredFleet[] } };

const baseOf = (id: string | undefined): IBase | undefined => (id ? BASES.find((b) => b.id === id) : undefined);

/** Whether ships lying at `at` can be docked there. */
export function canDockAt(at: IAnchorPlace, progress: DockProgress): boolean {
  const base = baseOf(at.base);
  if (!base) return false;
  if (!isForward(base)) return true;
  return theaterFacility(progress, base.theaters?.[0], 'anchorage') > 0;
}

/** Why a ship can't be docked where it lies, or null when it can (入渠は入渠のある基地で). */
export function dockProblem(progress: DockProgress, shipId: string): string | null {
  const at = shipPlace(progress.openSea.anchors, shipId, progress.nation);
  if (canDockAt(at, progress)) return null;
  return at.base ? '入渠設備なし' : '洋上';
}

/** Whether a fleet lying at `at` fills its tank there: any of the navy's bases. */
export function canSupplyAt(at: IAnchorPlace): boolean {
  return baseOf(at.base) !== undefined;
}

/**
 * 帰投 (0.0.70): the navy's open base nearest by sea from `from` where a ship can be docked (the home port at worst).
 * A separated ship sails there; until the moving world (B1) it is there at once.
 */
export function nearestDock(progress: DockProgress, from: ISectorRef): IBase | undefined {
  const steps = seaSteps(from);
  let best: IBase | undefined;
  let bestSteps = Infinity;
  for (const b of openBases(progress)) {
    const at = baseAnchor(b.id);
    const s = WORLD_MAP.bases[b.id];
    if (!at || !s || !canDockAt(at, progress)) continue;
    const n = steps[s.r * WORLD_MAP.cols + s.c];
    if (n >= 0 && n < bestSteps) {
      best = b;
      bestSteps = n;
    }
  }
  return best ?? openBases(progress).find((b) => !isForward(b));
}

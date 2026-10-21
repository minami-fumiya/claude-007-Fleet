import type { IProgress } from '@/utils/ProgressStore';
import { SceneKeys } from '@/config/SceneKeys';
import { baseState, nationBases } from './BaseSystem';
import { claimableCount } from './QuestSystem';
import { sweepCharges } from './SweepSystem';

/**
 * お知らせ (#192, pure): what the admiral can do right now, for the strip on the home screen. Builds, repairs and
 * facilities finish on their own, so the strip counts what waits on the player: rewards to take, sweeps banked,
 * empty docks and a base ready to be built (captain books left the strip in 0.0.40, #303: the captain screen shows them).
 */

export type PendingId = 'quests' | 'sweeps' | 'docks' | 'baseWork';

export interface IPendingItem {
  id: PendingId;
  /** "任務 4" */
  label: string;
  count: number;
  /** Where a tap goes; 'quests' opens the sheet on the home screen */
  scene: string;
  /** Passed to the scene: 掃討 opens the map on the area with the most charges (#283) */
  data?: Record<string, unknown>;
}

export function pendingSummary(progress: IProgress, now: number, freeDocks: number): IPendingItem[] {
  const charged = progress.perfect.filter((id) => progress.campaign.includes(id)).map((id) => ({ id, n: sweepCharges(progress.sweepCharges[id], now) }));
  const sweeps = charged.reduce((n, a) => n + a.n, 0);
  const topSweep = charged.reduce<{ id: string; n: number } | null>((best, a) => (a.n > (best?.n ?? 0) ? a : best), null);
  const basesReady = nationBases(progress.nation).filter((b) => baseState(b, progress) === 'ready').length;
  const items: IPendingItem[] = [
    { id: 'quests', label: '任務', count: claimableCount(progress.quests, now), scene: SceneKeys.HOME },
    { id: 'sweeps', label: '掃討', count: sweeps, scene: SceneKeys.CAMPAIGN, data: topSweep ? { areaId: topSweep.id } : undefined },
    { id: 'docks', label: '空きドック', count: Math.max(0, freeDocks), scene: SceneKeys.SHIPYARD },
    { id: 'baseWork', label: '軍港の工事', count: basesReady, scene: SceneKeys.BASE },
  ];
  return items.filter((i) => i.count > 0);
}

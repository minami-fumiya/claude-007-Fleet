import type { IProgress } from '@/utils/ProgressStore';
import { SceneKeys } from '@/config/SceneKeys';
import { baseState, nationBases } from './BaseSystem';
import { claimableCount } from './QuestSystem';
import { sweepCharges } from './SweepSystem';

/**
 * お知らせ (#192, pure): what the admiral can do right now, for the strip on the home screen. Builds, repairs and
 * facilities finish on their own, so the strip counts what waits on the player: rewards to take, sweeps banked,
 * empty docks, captain books and a base ready to be built.
 */

export type PendingId = 'quests' | 'sweeps' | 'docks' | 'books' | 'baseWork';

export interface IPendingItem {
  id: PendingId;
  /** "任務 4" */
  label: string;
  count: number;
  /** Where a tap goes; 'quests' opens the sheet on the home screen */
  scene: string;
}

export function pendingSummary(progress: IProgress, now: number, freeDocks: number): IPendingItem[] {
  const sweeps = progress.perfect.filter((id) => progress.campaign.includes(id)).reduce((n, id) => n + sweepCharges(progress.sweepCharges[id], now), 0);
  const basesReady = nationBases(progress.nation).filter((b) => baseState(b, progress) === 'ready').length;
  const items: IPendingItem[] = [
    { id: 'quests', label: '任務', count: claimableCount(progress.quests, now), scene: SceneKeys.HOME },
    { id: 'sweeps', label: '掃討', count: sweeps, scene: SceneKeys.CAMPAIGN },
    { id: 'docks', label: '空きドック', count: Math.max(0, freeDocks), scene: SceneKeys.SHIPYARD },
    { id: 'books', label: '艦長教本', count: progress.items.captainBook, scene: SceneKeys.CAPTAIN },
    { id: 'baseWork', label: '軍港の工事', count: basesReady, scene: SceneKeys.BASE },
  ];
  return items.filter((i) => i.count > 0);
}

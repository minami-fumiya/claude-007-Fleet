import type { IProgress } from '@/utils/ProgressStore';
import { SceneKeys } from '@/config/SceneKeys';
import { baseState, nationBases } from './BaseSystem';
import { claimableCount } from './QuestSystem';
import { sweepCharges } from './SweepSystem';
import { focusStatus, focusTree } from './NationFocusSystem';
import { rankOf } from './RankSystem';
import campaignData from '@/data/campaign.json';
import type { ICampaignData } from '@/types/Campaign';
import { theatersFor } from './CampaignSystem';
import { anniversariesOn, anniversaryKey, specialState, weeklyArea } from './SpecialOpsSystem';

/**
 * お知らせ (#192, pure): what the admiral can do right now, for the strip on the home screen. Builds, repairs and
 * facilities finish on their own, so the strip counts what waits on the player: rewards to take, sweeps banked,
 * empty docks and a base ready to be built (captain books left the strip in 0.0.40, #303: the captain screen shows them).
 */

export type PendingId = 'quests' | 'sweeps' | 'docks' | 'baseWork' | 'expeditions' | 'focus' | 'counter' | 'focusDone' | 'special' | 'anniversary';

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
  const data = campaignData as ICampaignData;
  const special = weeklyArea(data.areas.filter((a) => theatersFor(data, progress.nation).some((t) => t.id === a.theater)), progress.campaign, now);
  const counter = progress.sea?.counter && progress.sea.counter.endsAt > now ? progress.sea.counter : null;
  const items: IPendingItem[] = [
    // 敵の反攻 (#50): a sea under attack, first; a tap opens the map on it.
    { id: 'counter', label: '敵の反攻', count: counter ? 1 : 0, scene: SceneKeys.CAMPAIGN, data: counter ? { areaId: counter.areaId } : undefined },
    { id: 'quests', label: '任務', count: claimableCount(progress.quests, now), scene: SceneKeys.HOME },
    { id: 'sweeps', label: '掃討', count: sweeps, scene: SceneKeys.CAMPAIGN, data: topSweep ? { areaId: topSweep.id } : undefined },
    { id: 'docks', label: '空きドック', count: Math.max(0, freeDocks), scene: SceneKeys.SHIPYARD },
    { id: 'baseWork', label: '軍港・基地の工事', count: basesReady, scene: SceneKeys.BASE },
    // 遠征 (#41): expeditions back, to take home.
    { id: 'expeditions', label: '遠征帰還', count: (progress.expeditions ?? []).filter((r) => r.endsAt <= now).length, scene: SceneKeys.EXPEDITION },
    // 方針完了 (#416): focuses finished since the 国家方針 screen was last opened.
    { id: 'focusDone', label: '方針完了', count: Math.max(0, (progress.focus?.done.length ?? 0) - (progress.focusSeen ?? progress.focus?.done.length ?? 0)), scene: SceneKeys.FOCUS },
    // 特別海域 (#416): this week's sea, not yet won; 記念日: today's battle, not yet won this year.
    { id: 'special', label: '特別海域', count: special && specialState(progress.specialOps, special, now) === 'open' ? 1 : 0, scene: SceneKeys.CAMPAIGN, data: special ? { areaId: special.id } : undefined },
    { id: 'anniversary', label: '記念日', count: anniversariesOn(now).filter((a) => a.scenario && a.nations.includes(progress.nation) && !(progress.specialOps?.anniversaries ?? []).includes(anniversaryKey(a, now))).length, scene: SceneKeys.SCENARIO },
    // 国家方針 (#49): none under way while one could start.
    { id: 'focus', label: '方針', count: focusReady(progress), scene: SceneKeys.FOCUS },
  ];
  return items.filter((i) => i.count > 0);
}

/** 1 when no national focus is under way and one could start now. */
function focusReady(progress: IProgress): number {
  const focus = progress.focus ?? { done: [], current: null };
  if (focus.current) return 0;
  const rank = rankOf(progress).index;
  return focusTree(progress.nation).some((n) => focusStatus(progress.nation, focus, n.id, rank, progress.resources) === 'ready') ? 1 : 0;
}

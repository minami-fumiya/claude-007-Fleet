import { isForward, nationBases } from './BaseSystem';
import campaignData from '@/data/campaign.json';

const THEATER_NAME: Record<string, string> = Object.fromEntries(campaignData.theaters.map((t) => [t.id, t.name]));
import { DOCK_UPGRADES } from './DockSystem';
import { examText, maxBuildGrade, RANKS, START_RANK } from './RankSystem';
import { FORMATION_ORDER, FORMATION_RULES } from './FormationRules';
import { expeditionsAt } from './ExpeditionSystem';
import { presetSlots } from './PresetSystem';
import { costCap } from './FleetCost';
import { supportSlots } from './FleetGroups';
import { areaDepth, recommendedRank } from './DifficultyCurve';
import { theatersFor } from './CampaignSystem';
import { Nation } from '@/types/Nation';
import { ICampaignData } from '@/types/Campaign';

/** One row of the rank list (#128): what a rank needs and what it brings. */
export interface IRankRow {
  index: number;
  name: string;
  minMerit: number;
  slots: number;
  grade: number;
  /** The fleet's sortie cost cap (#406) */
  costCap: number;
  /** Fleets that sail together (#426): the main fleet and the 支援艦隊 the rank opens */
  fleets: number;
  /** The most 友軍艦隊 that join a battle in the seas meant for this rank (#426), 0 when none do */
  allies: number;
  /** "ドック増設・軍港: 舞鶴鎮守府・昇進試験: …" */
  unlocks: string;
  /** 士官候補生 while the tutorial is off: listed, but nobody starts there */
  beforeStart: boolean;
}

/** The most ally fleets (#64) in one area of the nation's seas recommended for `rankIndex` (#426). */
export function allyFleetsAt(nation: string, rankIndex: number): number {
  const data = campaignData as unknown as ICampaignData;
  const theaters = new Set(theatersFor(data, nation as Nation).map((t) => t.id));
  let most = 0;
  for (const a of data.areas) {
    if (a.training || !theaters.has(a.theater) || recommendedRank(areaDepth(data, a, nation)).index !== rankIndex) continue;
    most = Math.max(most, (a.allies ?? []).filter((x) => !x.for || x.for.includes(nation)).length);
  }
  return most;
}

export function rankTable(nation: string): IRankRow[] {
  const bases = nationBases(nation);
  return RANKS.map((r) => {
    const unlocks: string[] = [];
    const docks = DOCK_UPGRADES.filter((d) => d.rank === r.index).length;
    if (docks > 0) unlocks.push('ドック増設');
    // Ports and forward bases (#373): a forward base names the sea it opens.
    for (const b of bases.filter((x) => x.unlockRank === r.index && r.index > 0)) unlocks.push(isForward(b) ? `基地の着工: ${b.name} (${THEATER_NAME[b.theaters?.[0] ?? ''] ?? ''})` : `軍港の着工: ${b.name}`);
    // 陣形 (#345): one more as the fleet grows.
    for (const f of FORMATION_ORDER.filter((x) => FORMATION_RULES[x].minRank === r.index && r.index > 0)) unlocks.push(`陣形: ${FORMATION_RULES[f].ja}`);
    // 遠征 (#359): one new expedition a rank.
    for (const e of expeditionsAt(r.index)) unlocks.push(`遠征: ${e.name}`);
    // 編成の保存枠 (#401): more saved fleets with rank.
    if (r.index > 0 && presetSlots(r.index) > presetSlots(r.index - 1)) unlocks.push(`編成の保存枠 ${presetSlots(r.index)}`);
    if (r.exam) unlocks.push(`昇進試験: ${examText(r.exam)}`);
    return {
      index: r.index, name: r.name, minMerit: r.minMerit, slots: r.slots, grade: maxBuildGrade(r.index), costCap: costCap(r.index),
      fleets: 1 + supportSlots(r.index), allies: allyFleetsAt(nation, r.index),
      unlocks: unlocks.join('・'), beforeStart: r.index < START_RANK,
    };
  });
}

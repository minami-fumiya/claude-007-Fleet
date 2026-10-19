import { nationBases } from './BaseSystem';
import { DOCK_UPGRADES } from './DockSystem';
import { examText, maxBuildGrade, RANKS, START_RANK } from './RankSystem';

/** One row of the rank list (#128): what a rank needs and what it brings. */
export interface IRankRow {
  index: number;
  name: string;
  minMerit: number;
  slots: number;
  grade: number;
  /** "ドック増設・軍港: 舞鶴鎮守府・昇進試験: …" */
  unlocks: string;
  /** 士官候補生 while the tutorial is off: listed, but nobody starts there */
  beforeStart: boolean;
}

export function rankTable(nation: string): IRankRow[] {
  const bases = nationBases(nation);
  return RANKS.map((r) => {
    const unlocks: string[] = [];
    const docks = DOCK_UPGRADES.filter((d) => d.rank === r.index).length;
    if (docks > 0) unlocks.push('ドック増設');
    for (const b of bases.filter((x) => x.unlockRank === r.index && r.index > 0)) unlocks.push(`軍港: ${b.name}`);
    if (r.exam) unlocks.push(`昇進試験: ${examText(r.exam)}`);
    return {
      index: r.index, name: r.name, minMerit: r.minMerit, slots: r.slots, grade: maxBuildGrade(r.index),
      unlocks: unlocks.join('・'), beforeStart: r.index < START_RANK,
    };
  });
}

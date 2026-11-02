import { ITechNode } from '@/types/Progression';
import { TECH_TREE } from './ResearchSystem';

/**
 * 造船研究 (#426, pure): the 造船 branch takes a little off every build's cost and time and every repair's time,
 * level by level (2% / 3% / 2% in turn). The bases' own discounts (#88 #146) multiply on top.
 */

type YardKey = 'buildCostMul' | 'buildTimeMul' | 'repairTimeMul';

function yardMul(done: readonly string[] | undefined, key: YardKey, tree: readonly ITechNode[]): number {
  if (!done || done.length === 0) return 1;
  return tree.reduce((m, n) => (done.includes(n.id) && n[key] ? m * (n[key] as number) : m), 1);
}

export function researchBuildCostMul(done: readonly string[] | undefined, tree: readonly ITechNode[] = TECH_TREE): number {
  return yardMul(done, 'buildCostMul', tree);
}

export function researchBuildTimeMul(done: readonly string[] | undefined, tree: readonly ITechNode[] = TECH_TREE): number {
  return yardMul(done, 'buildTimeMul', tree);
}

export function researchRepairTimeMul(done: readonly string[] | undefined, tree: readonly ITechNode[] = TECH_TREE): number {
  return yardMul(done, 'repairTimeMul', tree);
}

/** "建造費 -4%・建造時間 -3%" for the research screen's summary. */
export function shipyardLines(done: readonly string[], tree: readonly ITechNode[] = TECH_TREE): string[] {
  const pct = (m: number): number => Math.round((1 - m) * 100);
  const out: string[] = [];
  const cost = researchBuildCostMul(done, tree);
  const time = researchBuildTimeMul(done, tree);
  const repair = researchRepairTimeMul(done, tree);
  if (cost < 1) out.push(`建造費 -${pct(cost)}%`);
  if (time < 1) out.push(`建造時間 -${pct(time)}%`);
  if (repair < 1) out.push(`修理時間 -${pct(repair)}%`);
  return out;
}

import { Nation } from '@/types/Nation';
import { NATION_INFO, PLAYABLE_NATIONS } from '@/config/NationInfo';
import { IRankProgress, RANKS, rankOf } from './RankSystem';
import campaignData from '@/data/campaign.json';

/**
 * Nations open one step at a time (#134, pure). A new admiral picks one of four; the others open once that first
 * nation has made 少佐 or taken a whole theater, and France, Italy and the Soviet Union follow later conquests.
 * Nothing is stored: it is worked out from the nations' progress each time, and a nation already started is never
 * locked again (saves from before #134 keep everything they play).
 */

/** The four a new admiral chooses from. */
export const STARTER_NATIONS: Nation[] = [Nation.IJN, Nation.USN, Nation.RN, Nation.KM];

/** Rank the first nation needs before the other starters open (and the Soviet Union). */
export const UNLOCK_RANK = 6;

type Progress = IRankProgress & { merit: number };

export interface INationLock {
  unlocked: boolean;
  /** Why it is locked: "日本が少佐か戦域攻略で解放" ('' when open); any nation's conquests count for the others */
  condition: string;
  /** How far along the condition is: "いま 日本 大尉" ('' when open or not measurable) */
  progress: string;
}

const THEATERS = campaignData.theaters.map((t) => t.id);

/** A theater's final area (its last listed one). */
export function theaterFinal(theater: string): string | undefined {
  return campaignData.areas.filter((a) => a.theater === theater).pop()?.id;
}

function clearedTheater(p: Progress, theater: string): boolean {
  const last = theaterFinal(theater);
  return !!last && p.campaign.includes(last);
}

/** The nation the admiral started with: the most advanced one (most merit), in PLAYABLE_NATIONS order on a tie. */
export function firstNation(nations: Partial<Record<Nation, Progress>>): Nation | undefined {
  let best: Nation | undefined;
  for (const n of PLAYABLE_NATIONS) {
    const p = nations[n];
    if (p && (best === undefined || p.merit > (nations[best]?.merit ?? 0))) best = n;
  }
  return best;
}

/** Each playable nation's lock, from the started nations' progress. */
export function nationLocks(nations: Partial<Record<Nation, Progress>>): Record<Nation, INationLock> {
  const started = PLAYABLE_NATIONS.filter((n) => nations[n] !== undefined);
  const all = started.map((n) => ({ n, p: nations[n]! }));
  const first = firstNation(nations);
  const rankName = RANKS[UNLOCK_RANK].name;
  const anyRank = all.some(({ p }) => rankOf({ ...p, nation: undefined }).index >= UNLOCK_RANK);
  const anyTheater = (ids: string[]): boolean => all.some(({ p }) => ids.some((t) => clearedTheater(p, t)));
  const bestRank = all.map(({ n, p }) => ({ n, r: rankOf({ ...p, nation: undefined }) })).sort((a, b) => b.r.index - a.r.index)[0];
  const rankProgress = bestRank ? `いま ${NATION_INFO[bestRank.n].jaShort} ${bestRank.r.name}` : '';
  const out = {} as Record<Nation, INationLock>;
  for (const n of PLAYABLE_NATIONS) {
    const open = (condition: string, ok: boolean, progress = ''): INationLock => (ok ? { unlocked: true, condition: '', progress: '' } : { unlocked: false, condition, progress });
    if (nations[n]) {
      out[n] = open('', true);
    } else if (STARTER_NATIONS.includes(n)) {
      // No nation yet: the four starters are open. After the first pick, the others wait for its progress.
      const firstName = first ? NATION_INFO[first].jaShort : '';
      out[n] = open(`${firstName}が${rankName}か戦域攻略で解放`, started.length === 0 || anyRank || anyTheater(THEATERS), rankProgress);
    } else if (n === Nation.FR) {
      out[n] = open('大西洋か地中海の攻略で解放', anyTheater(['atlantic', 'mediterranean']));
    } else if (n === Nation.RM) {
      out[n] = open('地中海の攻略で解放', anyTheater(['mediterranean']));
    } else if (n === Nation.SU) {
      out[n] = open(`${rankName}への昇進で解放`, anyRank, rankProgress);
    } else {
      out[n] = open('', true);
    }
  }
  return out;
}

/** Nations that `after` opens and `before` did not (to announce them). */
export function newlyUnlocked(before: Record<Nation, INationLock>, after: Record<Nation, INationLock>): Nation[] {
  return PLAYABLE_NATIONS.filter((n) => !before[n].unlocked && after[n].unlocked);
}

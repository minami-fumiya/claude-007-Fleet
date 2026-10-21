import { IDockJob } from '@/types/Progression';
import { completeRepairs } from './DockSystem';
import { finishBaseWork, IBaseWork } from './BaseSystem';
import { Facilities, finishFacilities, IFacilityJob } from './FacilitySystem';
import { IQuestState, withQuestEvents } from './QuestSystem';

/**
 * Everything that ends with time, in one place (#310, pure): repairs, builds, facility jobs and base construction.
 * The scenes used to finish each on their own screen, so a timer could reach 0:00 where nothing picked it up (#275
 * #303: a build stuck at 残り 0:00 on the home screen after loading had already finished it). Every load runs this
 * (`progressView`), and a screen showing timers redraws when the counts it drew no longer match.
 */

export interface ITimerState {
  damage: Record<string, number>;
  docks: IDockJob[];
  builds: Array<{ shipId: string; endsAt: number; base?: string }>;
  ships: string[];
  shipBases?: Record<string, string>;
  facilities: Facilities;
  facilityJobs: IFacilityJob[];
  basesOpen?: string[];
  baseWork?: IBaseWork | null;
  quests: IQuestState;
}

export interface ITimersDone {
  /** Ships whose repair ended */
  repairs: string[];
  /** Ships whose build ended (they joined the fleet) */
  builds: string[];
  /** Facility levels raised */
  facilities: number;
  /** The base whose construction ended, if any */
  base: string | null;
}

/** Ships whose construction has finished join the fleet (#143), even if the game was closed meanwhile. */
export function finishBuilds<T extends Pick<ITimerState, 'builds' | 'ships' | 'shipBases'>>(np: T, now: number): T {
  const done = np.builds.filter((b) => b.endsAt <= now);
  if (done.length === 0) return np;
  // Each joins the base it was laid down at (#145).
  const shipBases = { ...(np.shipBases ?? {}) };
  for (const b of done) if (b.base && !np.ships.includes(b.shipId)) shipBases[b.shipId] = b.base;
  return { ...np, builds: np.builds.filter((b) => b.endsAt > now), ships: [...new Set([...np.ships, ...done.map((b) => b.shipId)])], ...(np.shipBases ? { shipBases } : {}) };
}

/** Finishes every timer that has run out by `now`; the same object back when none has. */
export function completeTimers<T extends ITimerState>(progress: T, now: number): { progress: T; done: ITimersDone } {
  const repairs = progress.docks.filter((d) => d.endsAt <= now).map((d) => d.shipId);
  const builds = progress.builds.filter((b) => b.endsAt <= now).map((b) => b.shipId);
  const facilities = progress.facilityJobs.filter((j) => j.endsAt <= now).length;
  const base = progress.baseWork && progress.baseWork.endsAt <= now ? progress.baseWork.base : null;
  const done: ITimersDone = { repairs, builds, facilities, base };
  if (repairs.length === 0 && builds.length === 0 && facilities === 0 && base === null) return { progress, done };
  let next: T = { ...progress, ...completeRepairs(progress, now) };
  next = finishBuilds(next, now);
  next = finishFacilities(next, now);
  next = finishBaseWork(next, now);
  // 竣工章 (#264) counts the ships that come out of the yard, wherever the build is noticed.
  if (builds.length > 0) next = withQuestEvents(next, [['buildDone', builds.length]], now);
  return { progress: next, done };
}

/** "入渠 2 / 建造 1": what a screen of timers drew, so it can tell when a load finished something (#310). */
export function timerKey(progress: Pick<ITimerState, 'docks' | 'builds' | 'facilityJobs' | 'baseWork'>): string {
  return `${progress.docks.length}/${progress.builds.length}/${progress.facilityJobs.length}/${progress.baseWork ? 1 : 0}`;
}

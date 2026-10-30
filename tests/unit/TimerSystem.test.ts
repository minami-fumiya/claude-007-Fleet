import { describe, it, expect } from 'vitest';
import { completeTimers, timerKey } from '@/systems/TimerSystem';
import { emptyProgress, progressView } from '@/utils/ProgressStore';
import { emptyQuestState } from '@/systems/QuestSystem';

const NOW = 1_700_000_000_000;

describe('timers end in one place (#310)', () => {
  const p = {
    ...emptyProgress(),
    damage: { a: 0.4, b: 0.3 },
    docks: [{ shipId: 'a', endsAt: NOW - 1 }, { shipId: 'b', endsAt: NOW + 60_000 }],
    builds: [{ shipId: 'x', endsAt: NOW }, { shipId: 'y', endsAt: NOW + 1 }],
    ships: ['a', 'b'],
    facilityJobs: [{ base: 'ijn_home', id: 'fuelTank' as const, level: 1, endsAt: NOW - 5 }],
    baseWork: { base: 'ijn_light', endsAt: NOW - 1 },
    quests: emptyQuestState(NOW),
  };

  it('finishes repairs, builds, facilities and a base together, whatever their order', () => {
    const { progress: q, done } = completeTimers(p, NOW);
    expect(done).toEqual({ repairs: ['a'], builds: ['x'], facilities: 1, base: 'ijn_light', focus: null });
    expect(q.docks.map((d) => d.shipId)).toEqual(['b']);
    expect(q.damage.a).toBeUndefined();
    expect(q.ships).toEqual(['a', 'b', 'x']);
    expect(q.builds.map((b) => b.shipId)).toEqual(['y']);
    expect(q.facilityJobs).toEqual([]);
    expect(q.facilities.ijn_home?.fuelTank).toBe(1);
    expect(q.basesOpen).toContain('ijn_light');
    expect(q.baseWork).toBeNull();
    // The build quests count a ship when it is finished (#381), with 竣工章.
    expect(q.quests.totals?.build).toBe(1);
    expect(q.quests.totals?.buildDone).toBe(1);
    // 竣工章 (#264) still counts a build finished by a load.
    expect(q.quests.totals.buildDone).toBe(1);
    expect(timerKey(q)).not.toBe(timerKey(p));
  });

  it('changes nothing before any timer runs out', () => {
    const early = { ...p, docks: [p.docks[1]], builds: [p.builds[1]], facilityJobs: [], baseWork: null };
    expect(completeTimers(early, NOW).progress).toBe(early);
  });

  it('a load finishes them, so no screen is left showing 0:00 (#303)', () => {
    const view = progressView({ version: 20, current: 'IJN', record: { medals: [] }, nations: { IJN: { ...p, nation: undefined } } } as never, NOW);
    expect(view.builds.map((b) => b.shipId)).toEqual(['y']);
    expect(view.docks.map((d) => d.shipId)).toEqual(['b']);
  });
});

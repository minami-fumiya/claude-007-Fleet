import { describe, it, expect } from 'vitest';
import { pendingSummary } from '@/systems/PendingSummary';
import { emptyNationProgress, IProgress } from '@/utils/ProgressStore';
import { emptyRecord } from '@/systems/RecordSystem';
import { activeQuests, claimableCount, recordQuestEvent } from '@/systems/QuestSystem';
import { Nation } from '@/types/Nation';
import { SceneKeys } from '@/config/SceneKeys';

const NOW = Date.UTC(2026, 9, 19, 16);
const HOUR = 3_600_000;
const base = (): IProgress => ({ ...emptyNationProgress(), nation: Nation.IJN, record: emptyRecord() });

describe('お知らせ (#192)', () => {
  it('a fresh save has nothing waiting but its empty dock', () => {
    expect(pendingSummary(base(), NOW, 0)).toEqual([]);
    expect(pendingSummary(base(), NOW, 1)).toEqual([{ id: 'docks', label: '空きドック', count: 1, scene: SceneKeys.SHIPYARD }]);
  });

  it('counts rewards to take, sweeps banked and captain books, each pointing at its screen', () => {
    const q = activeQuests('hourly', NOW)[0];
    const p: IProgress = {
      ...base(),
      quests: recordQuestEvent(base().quests, q.event, NOW, q.goal),
      campaign: ['p1', 'p2'],
      perfect: ['p1', 'p2'],
      sweepCharges: { p1: { charges: 0, at: NOW - 2 * HOUR }, p2: { charges: 0, at: NOW } },
      items: { fastRepair: 0, fastBuild: 0, captainBook: 2 },
    };
    const s = pendingSummary(p, NOW, 0);
    expect(claimableCount(p.quests, NOW)).toBeGreaterThan(0);
    expect(s.map((i) => [i.id, i.count])).toEqual([['quests', claimableCount(p.quests, NOW)], ['sweeps', 2], ['books', 2]]);
    expect(s.find((i) => i.id === 'sweeps')?.scene).toBe(SceneKeys.CAMPAIGN);
    // An hour on, p2 has one too.
    expect(pendingSummary(p, NOW + HOUR, 0).find((i) => i.id === 'sweeps')?.count).toBe(3);
  });
});

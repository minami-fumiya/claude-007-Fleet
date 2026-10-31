import { describe, it, expect } from 'vitest';
import { activeQuests, EVENT_WINDOW, emptyQuestState, gameWindow, isEventQuestFor, nextReset, QUESTS, questProgress, recordQuestEvent, setQuestEventClock } from '@/systems/QuestSystem';
import type { EventKind } from '@/systems/EventSystem';
import { EVENT_KINDS } from '@/systems/EventKinds';
import { MEDALS } from '@/systems/RecordSystem';

const T0 = Date.UTC(2026, 9, 23, 15, 0, 0);

describe('イベント限定任務 (#89)', () => {
  it('there is one for every kind of event, each moved only by its own event', () => {
    const events = QUESTS.filter((q) => q.kind === 'event');
    for (const k of EVENT_KINDS) expect(events.some((q) => q.event === `event_${k}`), k).toBe(true);
    // Each belongs to one kind of event (#385).
    for (const q of events) expect(EVENT_KINDS.includes(q.during as EventKind), q.id).toBe(true);
    expect(activeQuests('event', T0)).toEqual(events);
  });

  it('progress belongs to its hour (#344) and is gone in the next', () => {
    const q = QUESTS.find((x) => x.id === 'e_steel')!;
    let s = recordQuestEvent(emptyQuestState(), 'event_steel', T0, 1);
    expect(questProgress(s, q)).toBe(1);
    // Another event's wins don't count.
    s = recordQuestEvent(s, 'event_fuel', T0, 5);
    expect(questProgress(s, q)).toBe(1);
    expect(gameWindow(T0 + EVENT_WINDOW)).toBe(gameWindow(T0) + 1);
    expect(nextReset('event', T0)).toBe(T0 + EVENT_WINDOW);
    s = recordQuestEvent(s, 'event_steel', T0 + EVENT_WINDOW, 1);
    expect(questProgress(s, q)).toBe(1);
  });

  it('brings a medal', () => {
    for (const id of ['event_quest', 'event_quest_3']) expect(MEDALS.some((m) => m.id === id), id).toBe(true);
  });
});

describe('イベントの任務を各 10 件に (#385)', () => {
  it('every kind of event has ten quests, the last with a medal', () => {
    for (const k of EVENT_KINDS) {
      const own = QUESTS.filter((q) => isEventQuestFor(q, k));
      expect(own, k).toHaveLength(10);
      const last = own.find((q) => q.event === 'eventQuestClaim');
      expect(last?.medal && MEDALS.some((m) => m.id === last.medal), k).toBe(true);
    }
  });

  it('an ordinary win moves them only in their own event’s hour', () => {
    const q = QUESTS.find((x) => x.id === 'e_fuel_sortie')!;
    let running: EventKind | null = 'steel';
    setQuestEventClock(() => running);
    let s = recordQuestEvent(emptyQuestState(), 'sortie', T0, 2);
    expect(questProgress(s, q)).toBe(0);
    running = 'fuel';
    s = recordQuestEvent(s, 'sortie', T0, 2);
    expect(questProgress(s, q)).toBe(2);
    setQuestEventClock(() => null);
  });
});

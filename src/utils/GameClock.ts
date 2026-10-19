import { eventEffects, eventFor, IEventEffects, IGameEvent } from '@/systems/EventSystem';
import { IProgress, loadSave, saveProgress, loadProgress, saveSave } from '@/utils/ProgressStore';
import { QuestEvent, withQuestEvents } from '@/systems/QuestSystem';

/** How far the stored clock may lag before it is written again. */
const CLOCK_WRITE_MS = 60_000;

/**
 * The event running now (#89), keeping the save's newest-seen time up to date so a clock set back gets none.
 */
export function activeEvent(now: number = Date.now()): IGameEvent | null {
  const save = loadSave();
  const event = eventFor(now, save.lastSeenAt);
  if (now > save.lastSeenAt + CLOCK_WRITE_MS) saveSave({ ...save, lastSeenAt: now });
  return event;
}

export function activeEffects(now: number = Date.now()): IEventEffects {
  return eventEffects(activeEvent(now));
}

/** Records 任務 events (#52) on the current nation and saves. */
export function questEvents(events: Array<[QuestEvent, number]>, now: number = Date.now()): IProgress {
  const progress = loadProgress();
  const next = withQuestEvents(progress, events, now);
  if (next !== progress) saveProgress(next);
  return next;
}

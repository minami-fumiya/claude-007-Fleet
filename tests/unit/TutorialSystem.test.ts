import { describe, it, expect } from 'vitest';
import { advanceTutorial, applyTutorialEvent, currentStep, restartTutorial, skipTutorial, TUTORIAL_REWARD, TUTORIAL_STEPS, TUTORIAL_SUPPLY, TutorialEvent } from '@/systems/TutorialSystem';
import { emptySave, ISave, switchNation } from '@/utils/ProgressStore';
import { rankOf } from '@/systems/RankSystem';
import { Nation } from '@/types/Nation';

const fresh = (): ISave => switchNation(emptySave(), Nation.IJN, 'fubuki', 0);
const play = (save: ISave): ISave => {
  let s = save;
  for (const step of TUTORIAL_STEPS) s = applyTutorialEvent(s, step.advance).save;
  return s;
};

describe('TutorialSystem (#90)', () => {
  it('a new save starts at the first step; each step waits for its own event', () => {
    const s = fresh();
    expect(currentStep(s.tutorial)?.id).toBe('home');
    expect(advanceTutorial(s.tutorial, 'build')).toBe(s.tutorial);
    // Closing an explain-only step and doing the next thing still counts.
    expect(currentStep(advanceTutorial(s.tutorial, 'sortie'))?.id).toBe('battle');
    const next = advanceTutorial(s.tutorial, 'next');
    expect(currentStep(next)?.id).toBe('fleet');
    const events: TutorialEvent[] = ['next', 'sortie', 'battleEnd', 'research', 'build', 'firstClear'];
    for (const step of TUTORIAL_STEPS) expect(events).toContain(step.advance);
  });

  it('finishing promotes to 少尉 with the reward; the research step brings its supply', () => {
    const s = fresh();
    const before = s.nations.IJN!;
    expect(rankOf(before).name).toBe('士官候補生');
    const done = play(s);
    const np = done.nations.IJN!;
    expect(done.tutorial.done).toBe(true);
    expect(rankOf(np).name).toBe('少尉');
    expect(np.resources.fuel).toBe(before.resources.fuel + TUTORIAL_SUPPLY.fuel + TUTORIAL_REWARD.fuel);
    expect(applyTutorialEvent(fresh(), 'next').finished).toBe(false);
  });

  it('skipping ends it without the promotion; a replay pays nothing twice', () => {
    const skipped = skipTutorial(fresh());
    expect(currentStep(skipped.tutorial)).toBeNull();
    expect(rankOf(skipped.nations.IJN!).name).toBe('士官候補生');
    const done = play(fresh());
    const again = play(restartTutorial(done));
    expect(again.tutorial.done).toBe(true);
    expect(again.nations.IJN!.resources).toEqual(done.nations.IJN!.resources);
  });

  it('a finished tutorial ignores events', () => {
    const done = play(fresh());
    expect(applyTutorialEvent(done, 'next').advanced).toBe(false);
  });
});

import { IResources } from '@/types/Progression';
import type { ISave, ITutorialState } from '@/utils/ProgressStore';
import { addResources } from './ResourceSystem';
import { grantRankMerit, TUTORIAL_RANK } from './RankSystem';

/**
 * First-play tutorial (#90, pure). A new save walks through the game's loop step by step — home port, fleet,
 * battle, results, docks, research, building, refits and the first campaign area — and finishing it promotes the
 * admiral to 少尉 (#36). Steps advance on a "次へ" tap or when the player does the thing they describe. It can be
 * skipped (no promotion) and restarted from the help screen.
 */

/**
 * Off until the end of the alpha (#90): every new feature would need the steps updated, and the guide must point at
 * the exact buttons first. The logic and its tests stay so the tutorial can be finished then.
 */
export const TUTORIAL_ENABLED = false;

/** What moves a step on: the player tapping 次へ, or doing the step's action. */
export type TutorialEvent = 'next' | 'sortie' | 'battleEnd' | 'research' | 'build' | 'firstClear';

export interface ITutorialStep {
  id: string;
  title: string;
  text: string;
  advance: TutorialEvent;
}

export const TUTORIAL_STEPS: ITutorialStep[] = [
  {
    id: 'home', title: '鎮守府', advance: 'next',
    text: 'ここが拠点です。上に資源 (燃料・弾薬・鋼材・ボーキ)、下に入渠 (修理) があります。資源は時間がたつと回復します。',
  },
  {
    id: 'fleet', title: '編成と出撃', advance: 'sortie',
    text: '鎮守府の「演習」を開き、空いている枠をタップして艦を選びます。陣形を選んだら「出撃」。演習は無料で、艦も傷つきません。',
  },
  {
    id: 'battle', title: '戦闘', advance: 'battleEnd',
    text: '海面をタップ (またはスティック) で移動、敵をタップで目標を指定します。主砲は自動で撃ち、魚雷はボタンで発射。迷ったら「自動」、止めたい時は「一時停止」。敵を全滅させれば勝利です。',
  },
  {
    id: 'results', title: '戦闘結果', advance: 'next',
    text: '勝つと資源と戦功、艦長の経験値が手に入ります。戦功が貯まると昇進し、出撃枠・建造できる艦・ドックが増えます。',
  },
  {
    id: 'dock', title: '入渠', advance: 'next',
    text: '作戦で傷ついた艦は、鎮守府の「入渠」で修理します。ドックは昇進すると増設できます。',
  },
  {
    id: 'research', title: '研究', advance: 'research',
    text: '鎮守府の「工廠」→「研究」で研究を 1 つ進めましょう。研究で建造できる艦種や強化部品が増えます。チュートリアル用に資源を支給しました。',
  },
  {
    id: 'build', title: '建造', advance: 'build',
    text: '工廠の「建造」で艦を 1 隻建造しましょう。階級が上がるほど大きな艦を造れます。',
  },
  {
    id: 'refit', title: '改装', advance: 'next',
    text: '「改装」で艦を改造すると、強化部品を付ける枠が増えます (未改造は 1 枠)。部品は研究で増えます。',
  },
  {
    id: 'campaign', title: '作戦', advance: 'firstClear',
    text: '「作戦」で海域を 1 つ攻略しましょう。初回攻略で新しい艦と多くの戦功が手に入ります。',
  },
];

/** Resources handed out when the research step begins (enough for one research and one destroyer). */
export const TUTORIAL_SUPPLY: IResources = { fuel: 600, ammo: 600, steel: 800, bauxite: 300 };
/** Reward for finishing, on top of the promotion to 少尉. */
export const TUTORIAL_REWARD: IResources = { fuel: 500, ammo: 500, steel: 500, bauxite: 200 };

export function currentStep(state: ITutorialState): ITutorialStep | null {
  return state.done ? null : TUTORIAL_STEPS[Math.min(state.step, TUTORIAL_STEPS.length - 1)] ?? null;
}

/** "2 / 9" */
export function stepLabel(state: ITutorialState): string {
  return `${Math.min(state.step + 1, TUTORIAL_STEPS.length)} / ${TUTORIAL_STEPS.length}`;
}

/**
 * The state after `event`: past the step that waits for it. Steps that only explain (次へ) in between are passed
 * too, so closing a sheet without 次へ and then doing the next thing still counts; an action step never is.
 */
export function advanceTutorial(state: ITutorialState, event: TutorialEvent): ITutorialState {
  if (state.done) return state;
  let i = state.step;
  while (i < TUTORIAL_STEPS.length && TUTORIAL_STEPS[i].advance !== event) {
    if (TUTORIAL_STEPS[i].advance !== 'next') return state;
    i++;
  }
  if (i >= TUTORIAL_STEPS.length) return state;
  const next = i + 1;
  return next >= TUTORIAL_STEPS.length ? { ...state, step: next, done: true } : { ...state, step: next, done: false };
}

export interface ITutorialResult {
  save: ISave;
  /** The step moved on */
  advanced: boolean;
  /** The last step was just finished: promoted to 少尉 */
  finished: boolean;
}

/**
 * Applies `event` to a whole save: moves the tutorial on, hands out the research supply when that step starts, and
 * on the last step promotes the current nation to 少尉 with the finishing reward.
 */
export function applyTutorialEvent(save: ISave, event: TutorialEvent): ITutorialResult {
  const tutorial = advanceTutorial(save.tutorial, event);
  if (tutorial === save.tutorial) return { save, advanced: false, finished: false };
  let out: ISave = { ...save, tutorial };
  const nation = out.nations[out.current];
  // A tutorial replayed from ヘルプ hands out nothing a second time.
  const paid = save.tutorial.rewarded === true;
  const startsResearch = !paid && !tutorial.done && TUTORIAL_STEPS[tutorial.step]?.id === 'research';
  if (nation && startsResearch) {
    out = { ...out, nations: { ...out.nations, [out.current]: { ...nation, resources: addResources(nation.resources, TUTORIAL_SUPPLY) } } };
  }
  const np = out.nations[out.current];
  if (tutorial.done && np && !paid) {
    const promoted = grantRankMerit(np, TUTORIAL_RANK);
    out = {
      ...out,
      tutorial: { ...tutorial, rewarded: true },
      nations: { ...out.nations, [out.current]: { ...promoted, resources: addResources(promoted.resources, TUTORIAL_REWARD) } },
    };
  }
  return { save: out, advanced: true, finished: tutorial.done };
}

/** Skipping ends the tutorial without the promotion (it can be restarted from ヘルプ). */
export function skipTutorial(save: ISave): ISave {
  return { ...save, tutorial: { ...save.tutorial, done: true } };
}

/** Replays the tutorial from the start; a save that already finished it gets no second reward. */
export function restartTutorial(save: ISave): ISave {
  return { ...save, tutorial: { step: 0, done: false, rewarded: save.tutorial.rewarded } };
}

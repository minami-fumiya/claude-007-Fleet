import { Difficulty, isDifficulty } from './DifficultySystem';

/** Player settings (pure): the four sound channels (#105) and mute, touch controls and Fleet Builder defaults, kept apart from game progress. */

export interface ISettings {
  /** 0..100 */
  bgm: number;
  /** 0..100 */
  sfx: number;
  muted: boolean;
  /** Show the virtual movement stick on touch screens (#46); hidden, the flagship moves by sea taps and AUTO */
  joystick: boolean;
  /** Fleet Builder: keep the last exercise settings (opponent, mode, weather, time, enemy count) between visits (#108); off = start from the standard setup each time */
  keepExercise: boolean;
  /** 図鑑: show only what the nation has (#44); off shows everything, the rest as silhouettes */
  encyclopediaOwnedOnly: boolean;
  /** 改装: list every owned ship (#144); off lists only the fleet */
  customizeAll: boolean;
  /** The last version whose changes the title screen showed (#205); '' before 0.0.26 */
  lastSeenVersion: string;
  /** 難易度 (#100): campaign and exercise battles */
  difficulty: Difficulty;
  /** 動作情報 (#99): fps, objects and frame time in battle */
  showFps: boolean;
  /** フレームの上限 (#336): 0 = the screen's own rate, else 30 or 60 (30 saves the battery) */
  frameLimit: FrameLimit;
  /** 音の 4 系統 (#105): narration and battle commentary volumes 0..100, and each channel on or off */
  voice: number;
  commentary: number;
  bgmOn: boolean;
  sfxOn: boolean;
  voiceOn: boolean;
  commentaryOn: boolean;
  /** 国別 BGM (#93); off plays the old chord bed */
  nationalBgm: boolean;
  /** How often the battle is called (#106) */
  commentaryRate: CommentaryRate;
  /** Narration and commentary as text too (#106) */
  subtitles: boolean;
  /** 画面の揺れ (#107): weak by default (motion sickness) */
  shake: ShakeLevel;
  /** スマホの振動 (#107) */
  vibrate: boolean;
  /** 0.0.51 表示 (#94 #95): colour theme, readings after hard words, and which way up the screen is */
  theme: ThemeChoice;
  ruby: RubyLevel;
  orientation: OrientationChoice;
}

export type ThemeChoice = 'dark' | 'light' | 'system';
export const THEME_CHOICES: ThemeChoice[] = ['dark', 'light', 'system'];
export const THEME_LABEL: Record<ThemeChoice, string> = { dark: 'ダーク', light: 'ライト', system: '端末に合わせる' };

export type RubyLevel = 'off' | 'hard' | 'all';
export const RUBY_LEVELS: RubyLevel[] = ['off', 'hard', 'all'];
export const RUBY_LABEL: Record<RubyLevel, string> = { off: 'なし', hard: '難しい語のみ', all: 'すべて' };

export type OrientationChoice = 'auto' | 'portrait' | 'landscape';
export const ORIENTATION_CHOICES: OrientationChoice[] = ['auto', 'portrait', 'landscape'];
export const ORIENTATION_LABEL: Record<OrientationChoice, string> = { auto: '自動', portrait: '縦固定', landscape: '横固定' };

export type CommentaryRate = 'few' | 'normal' | 'many';
export const COMMENTARY_RATES: CommentaryRate[] = ['normal', 'many', 'few'];
export const COMMENTARY_RATE_LABEL: Record<CommentaryRate, string> = { few: '少ない', normal: '普通', many: '多い' };

export type ShakeLevel = 'off' | 'weak' | 'strong';
export const SHAKE_LEVELS: ShakeLevel[] = ['weak', 'strong', 'off'];
export const SHAKE_LABEL: Record<ShakeLevel, string> = { off: 'なし', weak: '弱', strong: '強' };

/** The next of a list of choices (the settings buttons cycle). */
export function nextChoice<T>(list: readonly T[], current: T): T {
  return list[(list.indexOf(current) + 1) % list.length];
}

export type FrameLimit = 0 | 30 | 60;
export const FRAME_LIMITS: FrameLimit[] = [0, 60, 30];

/** "端末" / "60" / "30" for the settings button. */
export function frameLimitLabel(limit: FrameLimit): string {
  return limit === 0 ? '上限 端末' : `上限 ${limit}`;
}

/** The next choice of the frame limit button. */
export function nextFrameLimit(limit: FrameLimit): FrameLimit {
  return FRAME_LIMITS[(FRAME_LIMITS.indexOf(limit) + 1) % FRAME_LIMITS.length];
}

export const DEFAULT_SETTINGS: ISettings = { bgm: 80, sfx: 80, muted: false, joystick: true, keepExercise: true, encyclopediaOwnedOnly: true, customizeAll: true, lastSeenVersion: '', difficulty: 'normal', showFps: false, frameLimit: 0,
  voice: 80, commentary: 80, bgmOn: true, sfxOn: true, voiceOn: true, commentaryOn: true, nationalBgm: true, commentaryRate: 'normal', subtitles: true, shake: 'weak', vibrate: true,
  theme: 'dark', ruby: 'off', orientation: 'auto',
};
export const VOLUME_STEP = 10;

export function clampVolume(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0;
}

export function stepVolume(v: number, steps: number): number {
  return clampVolume(v + steps * VOLUME_STEP);
}

/** Gain for a channel: its base level scaled by the volume, silent when muted or the channel is off (#105). */
export function channelGain(base: number, volume: number, muted: boolean, on = true): number {
  return muted || !on ? 0 : base * (clampVolume(volume) / 100);
}

/** Tolerant parse; `legacyMuted` is the pre-settings mute flag. */
export function parseSettings(raw: string | null, legacyMuted = false): ISettings {
  if (!raw) return { ...DEFAULT_SETTINGS, muted: legacyMuted };
  try {
    const d = JSON.parse(raw) as Partial<ISettings>;
    return {
      bgm: typeof d.bgm === 'number' ? clampVolume(d.bgm) : DEFAULT_SETTINGS.bgm,
      sfx: typeof d.sfx === 'number' ? clampVolume(d.sfx) : DEFAULT_SETTINGS.sfx,
      muted: typeof d.muted === 'boolean' ? d.muted : legacyMuted,
      joystick: typeof d.joystick === 'boolean' ? d.joystick : DEFAULT_SETTINGS.joystick,
      keepExercise: typeof d.keepExercise === 'boolean' ? d.keepExercise : DEFAULT_SETTINGS.keepExercise,
      encyclopediaOwnedOnly: typeof d.encyclopediaOwnedOnly === 'boolean' ? d.encyclopediaOwnedOnly : DEFAULT_SETTINGS.encyclopediaOwnedOnly,
      customizeAll: typeof d.customizeAll === 'boolean' ? d.customizeAll : DEFAULT_SETTINGS.customizeAll,
      lastSeenVersion: typeof d.lastSeenVersion === 'string' ? d.lastSeenVersion : DEFAULT_SETTINGS.lastSeenVersion,
      difficulty: isDifficulty(d.difficulty) ? d.difficulty : DEFAULT_SETTINGS.difficulty,
      showFps: typeof d.showFps === 'boolean' ? d.showFps : DEFAULT_SETTINGS.showFps,
      frameLimit: FRAME_LIMITS.includes(d.frameLimit as FrameLimit) ? (d.frameLimit as FrameLimit) : DEFAULT_SETTINGS.frameLimit,
      // 0.0.49 (#105 #106 #107): read with defaults, so older settings keep working.
      voice: typeof d.voice === 'number' ? clampVolume(d.voice) : DEFAULT_SETTINGS.voice,
      commentary: typeof d.commentary === 'number' ? clampVolume(d.commentary) : DEFAULT_SETTINGS.commentary,
      bgmOn: typeof d.bgmOn === 'boolean' ? d.bgmOn : DEFAULT_SETTINGS.bgmOn,
      sfxOn: typeof d.sfxOn === 'boolean' ? d.sfxOn : DEFAULT_SETTINGS.sfxOn,
      voiceOn: typeof d.voiceOn === 'boolean' ? d.voiceOn : DEFAULT_SETTINGS.voiceOn,
      commentaryOn: typeof d.commentaryOn === 'boolean' ? d.commentaryOn : DEFAULT_SETTINGS.commentaryOn,
      nationalBgm: typeof d.nationalBgm === 'boolean' ? d.nationalBgm : DEFAULT_SETTINGS.nationalBgm,
      commentaryRate: COMMENTARY_RATES.includes(d.commentaryRate as CommentaryRate) ? (d.commentaryRate as CommentaryRate) : DEFAULT_SETTINGS.commentaryRate,
      subtitles: typeof d.subtitles === 'boolean' ? d.subtitles : DEFAULT_SETTINGS.subtitles,
      shake: SHAKE_LEVELS.includes(d.shake as ShakeLevel) ? (d.shake as ShakeLevel) : DEFAULT_SETTINGS.shake,
      vibrate: typeof d.vibrate === 'boolean' ? d.vibrate : DEFAULT_SETTINGS.vibrate,
      // 0.0.51 (#94 #95)
      theme: THEME_CHOICES.includes(d.theme as ThemeChoice) ? (d.theme as ThemeChoice) : DEFAULT_SETTINGS.theme,
      ruby: RUBY_LEVELS.includes(d.ruby as RubyLevel) ? (d.ruby as RubyLevel) : DEFAULT_SETTINGS.ruby,
      orientation: ORIENTATION_CHOICES.includes(d.orientation as OrientationChoice) ? (d.orientation as OrientationChoice) : DEFAULT_SETTINGS.orientation,
    };
  } catch {
    return { ...DEFAULT_SETTINGS, muted: legacyMuted };
  }
}

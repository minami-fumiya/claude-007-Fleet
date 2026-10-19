/** Player settings (pure): sound volumes and mute, touch controls and Fleet Builder defaults, kept apart from game progress. */

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
}

export const DEFAULT_SETTINGS: ISettings = { bgm: 80, sfx: 80, muted: false, joystick: true, keepExercise: true, encyclopediaOwnedOnly: true, customizeAll: true };
export const VOLUME_STEP = 10;

export function clampVolume(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0;
}

export function stepVolume(v: number, steps: number): number {
  return clampVolume(v + steps * VOLUME_STEP);
}

/** Gain for a channel: its base level scaled by the volume, silent when muted. */
export function channelGain(base: number, volume: number, muted: boolean): number {
  return muted ? 0 : base * (clampVolume(volume) / 100);
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
    };
  } catch {
    return { ...DEFAULT_SETTINGS, muted: legacyMuted };
  }
}

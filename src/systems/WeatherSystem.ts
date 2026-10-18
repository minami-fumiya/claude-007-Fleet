import { IBattleConditions, TimeOfDay, Weather } from '@/types/Weather';

/** Weather and night (pure): the modifiers a battle's conditions apply, and random picks for them. */

const WEATHER: Record<Weather, { visionMul: number; aimError: number; speedMul: number; fogAlpha: number; fogColor: number }> = {
  [Weather.Clear]: { visionMul: 1, aimError: 0, speedMul: 1, fogAlpha: 0.55, fogColor: 0x020814 },
  [Weather.Overcast]: { visionMul: 0.85, aimError: 0.01, speedMul: 1, fogAlpha: 0.6, fogColor: 0x0a1424 },
  [Weather.Storm]: { visionMul: 0.7, aimError: 0.05, speedMul: 0.85, fogAlpha: 0.65, fogColor: 0x061020 },
  [Weather.Fog]: { visionMul: 0.45, aimError: 0.02, speedMul: 1, fogAlpha: 0.7, fogColor: 0x8496aa },
};

/** Night halves vision and darkens everything outside it. */
const NIGHT_VISION = 0.55;
const NIGHT_FOG_ALPHA = 0.82;
const NIGHT_COLOR = 0x01040c;
/** A ship that fires at night gives away its position to enemies this far away, for this long. */
export const MUZZLE_FLASH_RANGE = 1000;
export const MUZZLE_FLASH_MS = 1500;

export const WEATHER_LABEL: Record<Weather, string> = {
  [Weather.Clear]: '晴天',
  [Weather.Overcast]: '曇天',
  [Weather.Storm]: '嵐',
  [Weather.Fog]: '霧',
};
export const TIME_LABEL: Record<TimeOfDay, string> = {
  [TimeOfDay.Day]: '昼戦',
  [TimeOfDay.Night]: '夜戦',
};

export function battleConditions(weather: Weather, time: TimeOfDay): IBattleConditions {
  const w = WEATHER[weather];
  const night = time === TimeOfDay.Night;
  return {
    weather,
    time,
    visionMul: w.visionMul * (night ? NIGHT_VISION : 1),
    aimError: w.aimError,
    speedMul: w.speedMul,
    fogAlpha: night ? Math.max(w.fogAlpha, NIGHT_FOG_ALPHA) : w.fogAlpha,
    fogColor: night && weather !== Weather.Fog ? NIGHT_COLOR : w.fogColor,
  };
}

/** Random weather: mostly clear or overcast. `rng` returns [0, 1). */
export function randomWeather(rng: () => number = Math.random): Weather {
  const r = rng();
  if (r < 0.45) return Weather.Clear;
  if (r < 0.75) return Weather.Overcast;
  if (r < 0.9) return Weather.Storm;
  return Weather.Fog;
}

/** Random time of day: one battle in four at night. */
export function randomTime(rng: () => number = Math.random): TimeOfDay {
  return rng() < 0.25 ? TimeOfDay.Night : TimeOfDay.Day;
}

/** At night a ship that fired recently is visible to enemies within the muzzle flash range. */
export function revealedByFlash(time: TimeOfDay, lastFiredAt: number | undefined, now: number, distance: number): boolean {
  if (time !== TimeOfDay.Night || lastFiredAt === undefined) return false;
  return now - lastFiredAt <= MUZZLE_FLASH_MS && distance <= MUZZLE_FLASH_RANGE;
}

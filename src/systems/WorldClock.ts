/**
 * 世界の時計と天候 (#445, 0.0.72 段階 B1, pure).
 *
 * The world's clock runs at a real five minutes to the world hour (a world day is two real hours), counted from the
 * epoch so that every device and every load agree. The hour of the day is local: it follows the sector's longitude,
 * so it is night over the Pacific while it is day over the Atlantic. Weather comes as fronts (rain, fog, storm) that
 * drift east over the sectors; where none lies the sky is clear. Both are deterministic in time and place, so nothing
 * of them is saved.
 */
import { TimeOfDay, Weather } from '@/types/Weather';

/** A real five minutes to the world hour. */
export const WORLD_HOUR_MS = 5 * 60 * 1000;
export const WORLD_DAY_HOURS = 24;
/** Night from 20:00 to 05:00 local (nine hours of the twenty-four, 45 real minutes of the two-hour day). */
export const NIGHT_FROM = 20;
export const NIGHT_TO = 5;

/** World hours since the epoch (fractional). */
export function worldHours(now: number): number {
  return now / WORLD_HOUR_MS;
}

/** The local hour of the day (0..24) at a longitude: fifteen degrees to the hour, east ahead. */
export function localHour(now: number, lon: number): number {
  const h = (worldHours(now) + lon / 15) % WORLD_DAY_HOURS;
  return h < 0 ? h + WORLD_DAY_HOURS : h;
}

export function isNightHour(hour: number): boolean {
  return hour >= NIGHT_FROM || hour < NIGHT_TO;
}

export function timeOfDayAt(now: number, lon: number): TimeOfDay {
  return isNightHour(localHour(now, lon)) ? TimeOfDay.Night : TimeOfDay.Day;
}

/** 「14:20」 for a local hour. */
export function clockText(hour: number): string {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Real milliseconds until the local hour next turns from day to night or back. */
export function msToNextTurn(now: number, lon: number): number {
  const h = localHour(now, lon);
  const target = isNightHour(h) ? NIGHT_TO : NIGHT_FROM;
  const ahead = (target - h + WORLD_DAY_HOURS) % WORLD_DAY_HOURS;
  return Math.round(ahead * WORLD_HOUR_MS);
}

/**
 * 天候の前線: a band of weather drifting east. `c0` is its column at world hour 0, `speed` columns a world hour; it
 * covers rows `r0`..`r0 + rows` and `width` columns. A front lives `life` world hours, then starts again elsewhere
 * (its seed moves on), so the sky keeps changing.
 */
export interface IFront {
  id: string;
  weather: Weather;
  c: number;
  r0: number;
  rows: number;
  width: number;
}

/** Fronts across the world at once. */
export const FRONT_COUNT = 28;
/** Hours a front lasts before it moves on. */
export const FRONT_LIFE = 36;
/** Columns a front drifts in a world hour (about two sectors: a front crosses a sector in half an hour). */
export const FRONT_SPEED = 2;

function hash(n: number): number {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** Overcast (曇天) is the rain front. */
const FRONT_KINDS: readonly Weather[] = [Weather.Overcast, Weather.Overcast, Weather.Overcast, Weather.Fog, Weather.Storm, Weather.Storm];

/** The fronts over the world at `now` on a `cols` × `rows` grid. */
export function frontsAt(now: number, cols: number, rows: number): IFront[] {
  const hours = worldHours(now);
  const out: IFront[] = [];
  for (let i = 0; i < FRONT_COUNT; i++) {
    // Each front is offset in its life so that they don't all change together.
    const phase = hash(i * 7919 + 13) * FRONT_LIFE;
    const gen = Math.floor((hours + phase) / FRONT_LIFE);
    const age = hours + phase - gen * FRONT_LIFE;
    const seed = i * 104729 + gen * 15485863;
    const weather = FRONT_KINDS[Math.floor(hash(seed) * FRONT_KINDS.length)];
    const r0 = Math.floor(hash(seed + 1) * rows);
    const height = Math.round(rows * (0.06 + hash(seed + 2) * 0.1));
    const width = Math.round(cols * (0.03 + hash(seed + 3) * 0.05)) * (weather === Weather.Storm ? 1 : 2);
    const c = Math.floor(hash(seed + 4) * cols + age * FRONT_SPEED);
    out.push({ id: `front_${i}_${gen}`, weather, c: ((c % cols) + cols) % cols, r0, rows: Math.max(1, height), width: Math.max(2, width) });
  }
  return out;
}

/** Whether a front covers a sector (the columns wrap east to west). */
export function frontCovers(f: IFront, c: number, r: number, cols: number): boolean {
  if (r < f.r0 || r >= f.r0 + f.rows) return false;
  const d = (((c - f.c) % cols) + cols) % cols;
  return d < f.width;
}

const WEATHER_RANK: Record<Weather, number> = { [Weather.Clear]: 0, [Weather.Overcast]: 1, [Weather.Fog]: 2, [Weather.Storm]: 3 };

/** The weather over a sector: the worst front lying over it, clear where none does. */
export function weatherAt(now: number, c: number, r: number, cols: number, rows: number): Weather {
  let w = Weather.Clear;
  for (const f of frontsAt(now, cols, rows)) if (frontCovers(f, c, r, cols) && WEATHER_RANK[f.weather] > WEATHER_RANK[w]) w = f.weather;
  return w;
}

/** The sky over a sector of the world map: its weather, day or night, and the local hour. */
export interface ISeaSky {
  weather: Weather;
  time: TimeOfDay;
  hour: number;
}

export function seaSky(now: number, c: number, r: number, lon: number, cols: number, rows: number): ISeaSky {
  const hour = localHour(now, lon);
  return { weather: weatherAt(now, c, r, cols, rows), time: isNightHour(hour) ? TimeOfDay.Night : TimeOfDay.Day, hour };
}

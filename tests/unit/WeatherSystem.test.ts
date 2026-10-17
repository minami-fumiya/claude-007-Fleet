import { describe, it, expect } from 'vitest';
import { battleConditions, MUZZLE_FLASH_MS, MUZZLE_FLASH_RANGE, randomTime, randomWeather, revealedByFlash } from '@/systems/WeatherSystem';
import { TimeOfDay, Weather } from '@/types/Weather';

describe('WeatherSystem', () => {
  it('clear day changes nothing', () => {
    const c = battleConditions(Weather.Clear, TimeOfDay.Day);
    expect(c.visionMul).toBe(1);
    expect(c.aimError).toBe(0);
    expect(c.speedMul).toBe(1);
  });

  it('fog cuts vision the most, storms hurt aim and speed', () => {
    const fog = battleConditions(Weather.Fog, TimeOfDay.Day);
    const storm = battleConditions(Weather.Storm, TimeOfDay.Day);
    expect(fog.visionMul).toBeLessThan(storm.visionMul);
    expect(storm.aimError).toBeGreaterThan(fog.aimError);
    expect(storm.speedMul).toBeLessThan(1);
  });

  it('night shrinks vision and darkens the fog', () => {
    const day = battleConditions(Weather.Overcast, TimeOfDay.Day);
    const night = battleConditions(Weather.Overcast, TimeOfDay.Night);
    expect(night.visionMul).toBeLessThan(day.visionMul);
    expect(night.fogAlpha).toBeGreaterThan(day.fogAlpha);
  });

  it('picks weather and time from the rng', () => {
    expect(randomWeather(() => 0)).toBe(Weather.Clear);
    expect(randomWeather(() => 0.6)).toBe(Weather.Overcast);
    expect(randomWeather(() => 0.8)).toBe(Weather.Storm);
    expect(randomWeather(() => 0.95)).toBe(Weather.Fog);
    expect(randomTime(() => 0.1)).toBe(TimeOfDay.Night);
    expect(randomTime(() => 0.9)).toBe(TimeOfDay.Day);
  });

  it('muzzle flashes reveal shooters only at night, briefly and within range', () => {
    expect(revealedByFlash(TimeOfDay.Night, 1000, 1000 + MUZZLE_FLASH_MS, MUZZLE_FLASH_RANGE)).toBe(true);
    expect(revealedByFlash(TimeOfDay.Night, 1000, 1001 + MUZZLE_FLASH_MS, 10)).toBe(false);
    expect(revealedByFlash(TimeOfDay.Night, 1000, 1000, MUZZLE_FLASH_RANGE + 1)).toBe(false);
    expect(revealedByFlash(TimeOfDay.Day, 1000, 1000, 10)).toBe(false);
    expect(revealedByFlash(TimeOfDay.Night, undefined, 1000, 10)).toBe(false);
  });
});

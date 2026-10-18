export enum Weather {
  Clear = 'Clear',
  Overcast = 'Overcast',
  Storm = 'Storm',
  Fog = 'Fog',
}

export enum TimeOfDay {
  Day = 'Day',
  Night = 'Night',
}

/** What the weather and the time of day do to a battle. */
export interface IBattleConditions {
  weather: Weather;
  time: TimeOfDay;
  /** Multiplier on every ship's vision */
  visionMul: number;
  /** Extra random aim error on every shot (radians) */
  aimError: number;
  /** Multiplier on ship speed (heavy seas) */
  speedMul: number;
  /** 0..1 how dark the screen is outside vision */
  fogAlpha: number;
  /** Colour of the area outside vision (dark at night, pale in fog) */
  fogColor: number;
}

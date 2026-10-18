/** Circle in normalised map units: x, y in 0..1 of the world size, r in units of the world's shorter side. */
export interface IMapCircle {
  x: number;
  y: number;
  r: number;
}

/** A rectangle of sea where the current pushes ships (normalised rect, velocity in px/s). */
export interface ICurrentZone {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
}

/** Battle map (src/data/maps/*.json). Coordinates are normalised so a map fits either orientation. */
export interface IMapData {
  id: string;
  name: string;
  /** Each island is a cluster of overlapping circles */
  islands: IMapCircle[][];
  shoals: IMapCircle[];
  currents: ICurrentZone[];
}

/** A map resolved to world pixels. */
export interface IResolvedMap {
  islands: Array<Array<{ x: number; y: number; r: number }>>;
  shoals: Array<{ x: number; y: number; r: number }>;
  currents: Array<{ x: number; y: number; w: number; h: number; vx: number; vy: number }>;
}

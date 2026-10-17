export enum AircraftType {
  Fighter = 'Fighter',
  DiveBomber = 'DiveBomber',
  TorpedoBomber = 'TorpedoBomber',
  /** Floatplane carried by battleships and cruisers (scouting only) */
  Recon = 'Recon',
}

/** Carrier-borne aircraft that live in an air wing. */
export type CarrierAircraft = AircraftType.Fighter | AircraftType.DiveBomber | AircraftType.TorpedoBomber;

export const CARRIER_AIRCRAFT: CarrierAircraft[] = [AircraftType.Fighter, AircraftType.DiveBomber, AircraftType.TorpedoBomber];

/** Planes embarked on a carrier, by type (ship JSON `airWing`). */
export interface IAirWing {
  fighters: number;
  diveBombers: number;
  torpedoBombers: number;
}

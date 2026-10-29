import { ShipClass } from './ShipClass';

/**
 * 設計艦 (#51): a ship the player draws up from a hull and modules and names. Kept per nation in the save; the
 * registry turns each into an `IShipData` (DesignSystem.designShip) so it is built and fights like any other ship.
 */
export interface IShipDesign {
  /** `design_<nation lower>_<serial>`: the ship id it is built under */
  id: string;
  name: string;
  shipClass: ShipClass;
  /** Hull id (DesignSystem.HULLS) */
  hull: string;
  /** Weapon ids and fitting ids (装甲・機関・バルジ), one per slot */
  modules: string[];
}

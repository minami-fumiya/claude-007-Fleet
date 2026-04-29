import { FleetSystem } from '@/systems/FleetSystem';
import { Nation } from '@/types/Nation';
import { ShipClass } from '@/types/ShipClass';
import { IShipData } from '@/types/Ship';

const makeShip = (id: string, shipClass: ShipClass = ShipClass.Battleship): IShipData => ({
  id,
  name: id,
  nation: Nation.IJN,
  shipClass,
  hp: 400,
  armor: 50,
  speed: 120,
  weapons: ['46cm_main_gun'],
  spriteKey: id,
});

describe('FleetSystem', () => {
  it('createFleet builds fleet with correct structure', () => {
    const yamato = makeShip('yamato');
    const fleet = FleetSystem.createFleet('f1', '大和隊', Nation.IJN, [yamato, null], 0);
    expect(fleet.id).toBe('f1');
    expect(fleet.nation).toBe(Nation.IJN);
    expect(fleet.slots).toHaveLength(2);
    expect(fleet.flagshipIndex).toBe(0);
  });

  it('isValid returns true when at least one ship is present', () => {
    const fleet = FleetSystem.createFleet('f', 'F', Nation.IJN, [makeShip('a'), null, null], 0);
    expect(FleetSystem.isValid(fleet)).toBe(true);
  });

  it('isValid returns false when all slots are empty', () => {
    const fleet = FleetSystem.createFleet('f', 'F', Nation.IJN, [null, null, null], 0);
    expect(FleetSystem.isValid(fleet)).toBe(false);
  });

  it('getShips returns only non-null ships', () => {
    const yamato = makeShip('yamato');
    const takao = makeShip('takao', ShipClass.Cruiser);
    const fleet = FleetSystem.createFleet('f', 'F', Nation.IJN, [yamato, null, takao], 0);
    const ships = FleetSystem.getShips(fleet);
    expect(ships).toHaveLength(2);
    expect(ships.map((s) => s.id)).toEqual(['yamato', 'takao']);
  });

  it('getFlagship returns the ship at flagshipIndex', () => {
    const yamato = makeShip('yamato');
    const musashi = makeShip('musashi');
    const fleet = FleetSystem.createFleet('f', 'F', Nation.IJN, [yamato, musashi], 1);
    expect(FleetSystem.getFlagship(fleet)?.id).toBe('musashi');
  });

  it('getEscorts returns non-flagship non-null ships', () => {
    const yamato = makeShip('yamato');
    const takao = makeShip('takao', ShipClass.Cruiser);
    const fubuki = makeShip('fubuki', ShipClass.Destroyer);
    const fleet = FleetSystem.createFleet('f', 'F', Nation.IJN, [yamato, takao, fubuki], 0);
    const escorts = FleetSystem.getEscorts(fleet);
    expect(escorts).toHaveLength(2);
    expect(escorts.map((s) => s.id)).toEqual(['takao', 'fubuki']);
  });
});

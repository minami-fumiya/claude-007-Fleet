import { describe, it, expect } from 'vitest';
import { enemyFormation } from '@/systems/EnemyFormation';
import { Formation } from '@/types/Formation';
import { Nation } from '@/types/Nation';
import { ShipClass } from '@/types/ShipClass';

const { Battleship: BB, Carrier: CV, Cruiser: CA, Destroyer: DD, Submarine: SS } = ShipClass;

describe('敵の陣形 (#82)', () => {
  it('carriers on either side mean a ring', () => {
    expect(enemyFormation({ nation: Nation.USN, enemy: [CV, CA, DD], player: [BB], night: false })).toBe(Formation.Circle);
    expect(enemyFormation({ nation: Nation.IJN, enemy: [BB, CA, DD], player: [CV, DD], night: false })).toBe(Formation.Circle);
  });

  it('submarines against it bring a screen of hunters', () => {
    expect(enemyFormation({ nation: Nation.RN, enemy: [CA, DD, DD], player: [SS], night: false })).toBe(Formation.Echelon);
    expect(enemyFormation({ nation: Nation.RN, enemy: [DD, DD, DD, CA], player: [SS, SS], night: false })).toBe(Formation.LineAbreast);
  });

  it("otherwise each navy's own surface tactics; Japan screens its night actions", () => {
    expect(enemyFormation({ nation: Nation.IJN, enemy: [BB, CA, DD], player: [BB], night: false })).toBe(Formation.LineAhead);
    expect(enemyFormation({ nation: Nation.IJN, enemy: [BB, CA, DD], player: [BB], night: true })).toBe(Formation.Vanguard);
    expect(enemyFormation({ nation: Nation.USN, enemy: [CA, CA, DD], player: [CA], night: false })).toBe(Formation.DoubleLine);
    expect(enemyFormation({ nation: Nation.KM, enemy: [BB, DD], player: [BB], night: false })).toBe(Formation.LineAhead);
  });

  it('a lone ship needs none, and an area or scenario can name one', () => {
    expect(enemyFormation({ nation: Nation.USN, enemy: [CV], player: [CV], night: false })).toBe(Formation.LineAhead);
    expect(enemyFormation({ nation: Nation.USN, enemy: [CV, DD], player: [], night: false, named: Formation.Echelon })).toBe(Formation.Echelon);
  });
});

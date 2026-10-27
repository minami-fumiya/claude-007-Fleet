import { describe, it, expect } from 'vitest';
import { addGroundKills, bombardLineup, GROUND_KINDS, GROUND_WEAPONS, groundKillStats, groundWeaponsOf, HEAVY_DEPTH } from '@/systems/GroundSystem';
import { PLAYABLE_NATIONS } from '@/config/NationInfo';
import weapons from '@/data/weapons/weapons.json';
import special from '@/data/special.json';

describe('地上兵器 (#251)', () => {
  it('every navy has one of each kind, armed with weapons that exist', () => {
    const ids = new Set(weapons.weapons.map((w) => w.id));
    for (const n of PLAYABLE_NATIONS) {
      const own = groundWeaponsOf(n);
      expect(new Set(own.map((g) => g.kind)), n).toEqual(new Set(Object.keys(GROUND_KINDS)));
      for (const g of own) for (const w of g.weapons) expect(ids.has(w), `${g.id} ${w}`).toBe(true);
    }
    expect(new Set(GROUND_WEAPONS.map((g) => g.id)).size).toBe(GROUND_WEAPONS.length);
  });

  it('the island fields the enemy navy’s batteries; the harbour and airfield stay', () => {
    const early = bombardLineup(special.bombardLayout, 'ar4', 'SU', 2);
    expect(early.filter((id) => id === 'land_harbor' || id === 'land_airfield')).toEqual(['land_harbor', 'land_airfield']);
    expect(early.filter((id) => id.startsWith('gw_su_'))).toHaveLength(3);
    expect(early).not.toContain('gw_su_heavy_battery');
    const deep = bombardLineup(special.bombardLayout, 'ar4', 'SU', HEAVY_DEPTH);
    expect(deep.some((id) => id === 'gw_su_heavy_battery' || id === 'gw_su_railway')).toBe(true);
    // A navy without ground weapons keeps the shared battery.
    expect(bombardLineup(special.bombardLayout, 'x', 'XX', 1).filter((id) => id === 'land_battery')).toHaveLength(3);
  });

  it('counts what was destroyed for the book and the medals', () => {
    const k = addGroundKills({}, ['gw_ijn_aa', 'gw_ijn_aa', 'land_harbor', 'gw_usn_radar']);
    expect(k).toEqual({ gw_ijn_aa: 2, gw_usn_radar: 1 });
    expect(groundKillStats(k)).toEqual({ total: 3, kinds: 2 });
  });
});

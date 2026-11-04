import { describe, expect, it } from 'vitest';
import { ALL_MISSION_MEDALS, ALL_MISSIONS_DONE, RANKS, rankOf } from '@/systems/RankSystem';
import { branchNodes, buildUnlocked, migrateResearch, MID_BUILD_TECH, TECH_TREE } from '@/systems/ResearchSystem';
import { researchBuildCostMul, researchBuildTimeMul, researchRepairTimeMul, shipyardLines } from '@/systems/ShipyardResearch';
import { createSubmarineState, speedFactor, updateSubmarine } from '@/systems/SubmarineSystem';
import { buildState, rewardClassOpen, isRewardOnly } from '@/systems/ShipyardSystem';
import { classKey } from '@/systems/ShipOrder';
import { allyFleetsAt, rankTable } from '@/systems/RankTable';
import { MORALE_HIGH, MORALE_REST, restedMorale } from '@/systems/MoraleSystem';
import { EXPEDITION_PROFICIENCY_CAP, EXPEDITIONS, expeditionProficiencyGain, expeditionTraining } from '@/systems/ExpeditionSystem';
import { MEDALS } from '@/systems/RecordSystem';
import { QUEST_EVENTS } from '@/systems/QuestSystem';
import { generateEnemyFleet } from '@/systems/EnemyFleetGenerator';
import { twoLineBreak } from '@/utils/JaWrap';
import { shortResources } from '@/systems/ResourceSystem';
import { DARK_COLORS, LIGHT_COLORS } from '@/ui/theme';
import { emptyProgress, emptySave, parseSave } from '@/utils/ProgressStore';
import { ShipRegistry } from '@/systems/ShipRegistry';
import { BattleMode } from '@/types/Battle';
import { IShipData, ShipSubtype } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { Nation } from '@/types/Nation';

const SHIPS = Object.values(import.meta.glob('@/data/ships/*.json', { eager: true }) as Record<string, { ships: IShipData[] }>).flatMap((m) => m.ships);
const NATIONS = [Nation.IJN, Nation.USN, Nation.KM, Nation.RN, Nation.FR, Nation.RM, Nation.SU];

describe('0.0.61 一気の昇進をなくす (#426)', () => {
  it('a battle that meets two ranks\' conditions promotes once; the next rank counts from there', () => {
    const p = { merit: 10_000, campaign: [], rankStats: ALL_MISSIONS_DONE, record: { medals: ALL_MISSION_MEDALS } };
    expect(rankOf({ ...p, rankFloor: 3 }).index).toBe(4);
    expect(rankOf({ ...p, rankFloor: 4 }).index).toBe(5);
    // The save migrations read the rank without missions, as before.
    expect(rankOf({ ...p, rankFloor: 3 }, false).index).toBeGreaterThan(5);
  });
});

describe('0.0.61 建造の 10 段・造船・潜水 (#426)', () => {
  it('each step opens kinds that most navies have; every kind but plain destroyers and submarines is in 建造', () => {
    const steps = branchNodes(TECH_TREE, 'shipbuilding');
    expect(steps.map((n) => n.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const id of Object.values(MID_BUILD_TECH)) if (id) expect(steps.some((n) => n.id === id), id).toBe(true);
    // Every navy has ships to build at no fewer than eight of the eleven steps (Lv0 included, #428); the Soviet navy,
    // which built few kinds of ship, at six.
    for (const n of NATIONS) {
      const own = SHIPS.filter((s) => s.nation === n && !s.fictional && !s.designed);
      const steps0 = new Set(own.map((s) => {
        const tech = MID_BUILD_TECH[s.subtype ?? (s.shipClass === ShipClass.Carrier ? 'FleetCarrier' : s.shipClass === ShipClass.Cruiser ? ShipSubtype.LightCruiser : s.shipClass) as keyof typeof MID_BUILD_TECH];
        return tech ? steps.find((x) => x.id === tech)!.level : 0;
      }));
      expect(steps0.size, n).toBeGreaterThanOrEqual(n === Nation.SU ? 6 : 8);
    }
  });

  it('old research is read as the new step that holds it, so nothing that could be built is lost', () => {
    expect(migrateResearch(['build_aa_cruiser', 'build_battlecruiser', 'carrier_aircraft', 'build_submarine', 'gunnery_1'])).toEqual(['build_cruiser', 'build_battleship', 'build_armored_carrier', 'gunnery_1']);
    const raw = JSON.stringify({ ...emptySave(), nations: { IJN: { ...emptyProgress(), research: ['build_escort_carrier'] } } });
    expect(parseSave(raw).nations.IJN!.research).toEqual(['build_light_carrier']);
    expect(buildUnlocked({ shipClass: ShipClass.Carrier, subtype: ShipSubtype.EscortCarrier }, migrateResearch(['build_escort_carrier']))).toBe(true);
  });

  it('造船 takes off build cost, build time and repair time; 潜水 dives longer and runs faster under water', () => {
    const yard = branchNodes(TECH_TREE, 'shipyard').map((n) => n.id);
    expect(researchBuildCostMul(yard)).toBeLessThan(1);
    expect(researchBuildTimeMul(yard)).toBeLessThan(1);
    expect(researchRepairTimeMul(yard)).toBeLessThan(1);
    expect(researchBuildCostMul([])).toBe(1);
    expect(shipyardLines(yard).length).toBe(3);
    const sub = createSubmarineState(false, 1.5, 1.2);
    expect(sub.endurance).toBe(30);
    expect(speedFactor({ ...sub, submerged: true })).toBeCloseTo(0.72);
    // Twenty seconds under water no longer empties the air.
    expect(updateSubmarine({ ...sub, submerged: true }, 20, true).submerged).toBe(true);
  });

  it('seaplane tenders and large carriers are kinds of their own; no enemy fleet is led by a tender', () => {
    const tenders = SHIPS.filter((s) => s.subtype === ShipSubtype.SeaplaneTender);
    expect(tenders.map((s) => s.nation).sort()).toEqual(['FR', 'IJN', 'IJN', 'KM', 'RM', 'RN', 'USN']);
    expect(SHIPS.filter((s) => s.subtype === ShipSubtype.LargeCarrier).map((s) => s.id).sort()).toEqual(['franklin_d_roosevelt', 'kai_taiho', 'malta_cv', 'midway', 'shinano']);
    const reg = new ShipRegistry(SHIPS);
    for (let i = 0; i < 20; i++) expect(generateEnemyFleet(reg, Nation.RM, BattleMode.CarrierStrike, Math.random).some((s) => s.subtype === ShipSubtype.SeaplaneTender)).toBe(false);
  });

  it('a reward ship\'s class opens to building once one of its class is in the fleet (案 A)', () => {
    const reward = SHIPS.find((s) => s.nation === 'USN' && isRewardOnly(s) && SHIPS.some((x) => x !== s && x.nation === 'USN' && classKey(x) === classKey(s)))!;
    const sister = SHIPS.find((x) => x !== reward && x.nation === 'USN' && classKey(x) === classKey(reward))!;
    const roster = SHIPS.filter((s) => s.nation === 'USN');
    const p = { ...emptyProgress(), nation: Nation.USN, ships: ['fletcher'] };
    expect(rewardClassOpen(p, roster, reward)).toBe(false);
    expect(buildState(p, roster, reward)).toBe('reward');
    expect(rewardClassOpen({ ...p, ships: ['fletcher', sister.id] }, roster, reward)).toBe(true);
    expect(buildState({ ...p, ships: ['fletcher', sister.id] }, roster, reward)).not.toBe('reward');
  });
});

describe('0.0.61 階級一覧・士気・遠征 (#426)', () => {
  it('the rank list shows the fleets that sail together and the allies in the rank\'s seas', () => {
    const rows = rankTable(Nation.USN);
    expect(rows.map((r) => r.fleets)).toEqual(RANKS.map((r) => 1 + (r.index >= 6 ? 1 : 0) + (r.index >= 9 ? 1 : 0) + (r.index >= 12 ? 1 : 0)));
    expect(Math.max(...rows.map((r) => r.allies))).toBeGreaterThan(0);
    expect(allyFleetsAt(Nation.USN, 0)).toBe(0);
  });

  it('morale comes back faster: a sortie\'s 15 in half an hour, ★ from 50 in 100 minutes', () => {
    expect(restedMorale(MORALE_REST - 15, 30)).toBe(MORALE_REST);
    expect(restedMorale(MORALE_REST, 100)).toBe(MORALE_HIGH);
  });

  it('expeditions train their ships, up to 40, and it counts for a medal', () => {
    const exp = EXPEDITIONS[0];
    const run = { id: exp.id, shipIds: ['a', 'b'], endsAt: 100 };
    const r = expeditionTraining({ a: 10, b: EXPEDITION_PROFICIENCY_CAP }, [run], 200);
    expect(r.proficiency.a).toBe(10 + expeditionProficiencyGain(exp));
    expect(r.proficiency.b).toBe(EXPEDITION_PROFICIENCY_CAP);
    expect(r.gained).toBe(expeditionProficiencyGain(exp));
    expect(expeditionTraining({}, [run], 50).gained).toBe(0);
    expect(QUEST_EVENTS).toContain('expeditionProficiency');
  });

  it('every new thing has its medal', () => {
    const ids = MEDALS.map((m) => m.id);
    for (const id of ['sub_ace', 'sub_ace_2', 'tender_win', 'large_carrier_flag', 'expedition_training', 'help_reader']) expect(ids, id).toContain(id);
  });
});

describe('0.0.61 表示 (#425)', () => {
  it('long names break after a particle; narrow buttons read the short costs', () => {
    expect(twoLineBreak('潜水艦による通商破壊')).toBe(6);
    expect(shortResources({ fuel: 1200, ammo: 600, steel: 1800, bauxite: 300 })).toBe('燃1200 弾600 鋼1800 ボ300');
  });

  it('body text reads clearly on a panel in both themes (contrast)', () => {
    const lum = (hex: number): number => {
      const c = [16, 8, 0].map((s) => ((hex >> s) & 255) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const ratio = (a: number, b: number): number => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const c of [DARK_COLORS, LIGHT_COLORS]) {
      expect(ratio(c.muted, c.panel)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(c.dim, c.panel)).toBeGreaterThanOrEqual(3);
    }
  });

  it('the save remembers which screens\' help was read to the end, and reads old saves without it', () => {
    expect(parseSave(JSON.stringify(emptySave())).helpRead).toEqual([]);
    expect(parseSave(JSON.stringify({ ...emptySave(), helpRead: ['HomeScene', 'HomeScene'] })).helpRead).toEqual(['HomeScene']);
  });
});

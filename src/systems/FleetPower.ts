import { IShipData } from '@/types/Ship';
import { IShipModifiers, IUpgradeData, NO_MODIFIERS } from '@/types/Modifiers';
import { ICaptain } from '@/types/Captain';
import { Formation } from '@/types/Formation';
import { combineModifiers, upgradeModifiers, upgradeSlots } from './CustomizationSystem';
import { fleetPower, shipPower } from './DifficultyCurve';
import { REFIT_TABLE, refitModifiers } from './RefitSystem';
import { researchModifiers, TECH_TREE, unlockedUpgrades } from './ResearchSystem';
import { captainModifiers, ICaptainStats } from './CaptainSystem';
import { formationModifiers } from './FormationRules';
import { moraleModifiers, moraleOf } from './MoraleSystem';

/**
 * 自艦隊の戦力 (#280, pure): the admiral's fleet weighed like an area's enemy (HP × (1 + armor / 100), summed), with
 * each ship's remodel, fitted parts and finished research — so the two figures can be set side by side.
 */

export interface IFleetPowerProgress {
  research: string[];
  upgrades: Record<string, string[]>;
  refits: Record<string, number>;
  refitBranches: Record<string, string>;
  /** For 総戦力 (#342): the crews, the captains' learning and the morale; missing ones count for nothing */
  proficiency?: Record<string, number>;
  captainSkills?: Record<string, string[]>;
  captainStats?: Record<string, ICaptainStats>;
  captainBonus?: Record<string, string[]>;
  morale?: Record<string, number>;
  moraleAt?: Record<string, number>;
}

/** The fleet's strength with what the admiral has done to its ships. */
export function ownFleetPower(ships: readonly IShipData[], progress: IFleetPowerProgress, catalog: IUpgradeData[]): number {
  const parts = unlockedUpgrades(catalog, progress.research);
  const research = researchModifiers(TECH_TREE, progress.research);
  return fleetPower(ships.map((s) => {
    const stage = progress.refits[s.id] ?? 0;
    const m = combineModifiers(upgradeModifiers(progress.upgrades[s.id] ?? [], parts, upgradeSlots(stage)), research, refitModifiers(REFIT_TABLE, s, stage, progress.refitBranches[s.id]));
    return { hp: s.hp * m.hpMul, armor: s.armor + m.armorAdd };
  }));
}

/** 総戦力の内訳 (#342): what each source adds, in the order they are counted. */
export type PowerSource = 'refit' | 'research' | 'captain' | 'proficiency' | 'morale' | 'formation';
export const POWER_SOURCES: PowerSource[] = ['refit', 'research', 'captain', 'proficiency', 'morale', 'formation'];
export const POWER_SOURCE_LABEL: Record<PowerSource, string> = {
  refit: '改装', research: '研究', captain: '艦長', proficiency: '練度', morale: '士気', formation: '陣形',
};

export interface IPowerBreakdown {
  /** The ships as built: HP × armor, like an area's enemy */
  base: number;
  /** With every source */
  total: number;
  /** Share each source adds over the ones before it: 0.08 = +8% */
  steps: Record<PowerSource, number>;
}

/**
 * What modifiers do to a ship in battle, as one figure: its guns (power over reload), torpedoes and planes for the
 * attack, dodging for the defence. HP and armor are weighed in the ship's own figure.
 */
export function modifierValue(m: IShipModifiers): number {
  const attack = 0.6 * (m.gunPowerMul / m.gunReloadMul) + 0.2 * m.torpedoPowerMul + 0.2 * m.airPowerMul;
  return attack * (1 + 2 * m.evadeAdd);
}

/** A crew's proficiency as a figure: straighter shooting (aim error 1 → 0.5) and near misses (up to 15%). */
export function proficiencyValue(p: number): number {
  const q = Math.max(0, Math.min(100, p));
  return (1 + q / 200) * (1 + q * 0.003);
}

/**
 * 総戦力 (#342): the fleet with its refits and parts, research, captains, crews' proficiency, morale and formation,
 * and how much each adds. `captains` are the fleet's by slot (the first ship is the flagship).
 */
export function fleetPowerBreakdown(
  ships: readonly IShipData[], progress: IFleetPowerProgress, catalog: IUpgradeData[],
  opts: { captains?: readonly (ICaptain | null)[]; formation?: Formation; now?: number } = {},
): IPowerBreakdown {
  const parts = unlockedUpgrades(catalog, progress.research);
  const research = researchModifiers(TECH_TREE, progress.research);
  const now = opts.now ?? Date.now();
  const per = ships.map((s, i) => {
    const stage = progress.refits[s.id] ?? 0;
    const captain = opts.captains?.[i] ?? null;
    const mods: Record<PowerSource, IShipModifiers> = {
      refit: combineModifiers(upgradeModifiers(progress.upgrades[s.id] ?? [], parts, upgradeSlots(stage)), refitModifiers(REFIT_TABLE, s, stage, progress.refitBranches[s.id])),
      research,
      captain: captain ? captainModifiers(captain, {}, progress.captainSkills?.[captain.id] ?? [], progress.captainStats?.[captain.id], s.shipClass, progress.captainBonus?.[captain.id] ?? []) : NO_MODIFIERS,
      proficiency: NO_MODIFIERS,
      morale: progress.morale ? combineModifiers(moraleModifiers(moraleOf({ morale: progress.morale, moraleAt: progress.moraleAt ?? {} }, s.id, now))) : NO_MODIFIERS,
      formation: opts.formation ? combineModifiers(formationModifiers(opts.formation, i === 0)) : NO_MODIFIERS,
    };
    return { ship: s, mods, proficiency: progress.proficiency?.[s.id] ?? 0 };
  });
  const powerWith = (upTo: number): number => per.reduce((sum, p) => {
    const used = POWER_SOURCES.slice(0, upTo);
    const m = combineModifiers(...used.map((k) => p.mods[k]));
    const prof = used.includes('proficiency') ? proficiencyValue(p.proficiency) : 1;
    return sum + shipPower({ hp: p.ship.hp * m.hpMul, armor: p.ship.armor + m.armorAdd }) * modifierValue(m) * prof;
  }, 0);
  // totals[0] is the ships as built (no source), totals[i] with the first i sources.
  const totals = [0, ...POWER_SOURCES.map((_, i) => i + 1)].map(powerWith);
  const steps = Object.fromEntries(POWER_SOURCES.map((k, i) => [k, totals[i] > 0 ? totals[i + 1] / totals[i] - 1 : 0])) as Record<PowerSource, number>;
  return { base: Math.round(totals[0]), total: Math.round(totals[totals.length - 1]), steps };
}

/** "改装 +8%  研究 +6%  艦長 +7% …": the sources that add (or take) something. */
export function powerBreakdownText(b: IPowerBreakdown): string {
  return POWER_SOURCES.filter((k) => Math.abs(b.steps[k]) >= 0.005).map((k) => `${POWER_SOURCE_LABEL[k]} ${b.steps[k] >= 0 ? '+' : '−'}${Math.round(Math.abs(b.steps[k]) * 100)}%`).join('  ');
}

/** 寡兵の勝利章 (#280): a campaign win with a fleet at most this share of the enemy's strength. */
export const UNDERDOG_RATIO = 0.6;

export type PowerTone = 'danger' | 'even' | 'ahead';

/** Below 0.8× the enemy is a risk, 1.2× and up is comfortable. */
export function powerTone(own: number, enemy: number): PowerTone {
  const r = enemy > 0 ? own / enemy : Infinity;
  return r < 0.8 ? 'danger' : r < 1.2 ? 'even' : 'ahead';
}

/** "自艦隊 1,820 / 敵 1,560 (×1.17)". */
export function powerCompareText(own: number, enemy: number): string {
  const n = (v: number): string => v.toLocaleString('en-US');
  return `自艦隊 ${n(own)} / 敵 ${n(enemy)}${enemy > 0 ? ` (×${(own / enemy).toFixed(2)})` : ''}`;
}

import Phaser from 'phaser';
import campaignData from '@/data/campaign.json';
import { ICampaignArea, ICampaignData, Objective } from '@/types/Campaign';
import { IBattleInitData } from '@/types/Scene';
import { IShipData } from '@/types/Ship';
import { Formation } from '@/types/Formation';
import { ISortieState } from '@/types/Sortie';
import { Nation } from '@/types/Nation';
import { FleetSystem } from '@/systems/FleetSystem';
import { areaMode } from '@/systems/CampaignSystem';
import { hpFraction } from '@/systems/DockSystem';
import { addResources, formatResources, pay } from '@/systems/ResourceSystem';
import { battleNodes, NODE_LABEL, nextBattleIndex, nodesBetween, shipsForNextNode, sortieRoute } from '@/systems/SortieMapSystem';
import { DataLoader } from '@/utils/DataLoader';
import { loadProgress, saveProgress } from '@/utils/ProgressStore';

/** Registry key: notes from the route passed on the way to the next battle (shown once, on its results). */
const NOTES_KEY = 'sortie.notes';

/** The campaign sortie in progress (#53), kept in the nation's save so closing the game doesn't end it (#138). */
export function currentSortie(): ISortieState | null {
  return loadProgress().sortie ?? null;
}

function setSortie(state: ISortieState | null): void {
  saveProgress({ ...loadProgress(), sortie: state });
}

/** Marks the battle at the sortie's current node as settled (called as the battle ends). */
export function markSortieFought<T extends { sortie: ISortieState | null }>(progress: T): T {
  return progress.sortie ? { ...progress, sortie: { ...progress.sortie, fought: true } } : progress;
}

/** The ships of a sortie in progress (#138): they can't be docked, refitted or sent elsewhere until it ends. */
export function sortieShipIds(progress: { sortie: ISortieState | null }): string[] {
  return progress.sortie?.shipIds ?? [];
}

const areaById = (id: string): ICampaignArea | undefined => (campaignData as ICampaignData).areas.find((a) => a.id === id);

function battleInit(scene: Phaser.Scene, s: ISortieState): IBattleInitData | null {
  const area = areaById(s.areaId);
  const node = s.route[s.at];
  const registry = DataLoader.getRegistry(scene);
  if (!area || !node) return null;
  const ships = s.shipIds.map((id) => registry.byId(id)).filter((x): x is IShipData => x !== undefined);
  const enemy = (node.ships ?? []).map((id) => registry.byId(id)).filter((x): x is IShipData => x !== undefined);
  if (ships.length === 0 || enemy.length === 0) return null;
  const battles = battleNodes(s.route);
  const boss = node.kind === 'boss';
  return {
    playerFleet: FleetSystem.createFleet('player-fleet', '第一艦隊', s.nation, ships, 0),
    enemyFleet: FleetSystem.createFleet('enemy-fleet', 'Enemy Fleet', s.enemyNation, enemy, 0),
    mapKey: area.map,
    formation: s.formation,
    mode: areaMode(enemy),
    weather: area.weather,
    time: area.time,
    captainIds: s.captainIds,
    areaId: area.id,
    // Only the boss node has the area's own objective; the skirmishes before it are fights to the finish.
    objective: boss ? area.objective : Objective.Annihilate,
    sortie: { node: battles.indexOf(node) + 1, battles: battles.length, boss },
  };
}

/** Starts a campaign sortie at the route's first battle (the fleet's empty slots dropped). */
export function beginSortie(
  scene: Phaser.Scene, area: ICampaignArea, slots: (IShipData | null)[], captainIds: (string | null)[],
  formation: Formation, nation: Nation, enemyNation: Nation, enemy: IShipData[],
): IBattleInitData | null {
  const kept = slots.map((s, i) => ({ s, c: captainIds[i] ?? null })).filter((x) => x.s !== null);
  const route = sortieRoute(area, enemy);
  const state: ISortieState = {
    areaId: area.id, route, at: nextBattleIndex(route, 0), nation, enemyNation,
    shipIds: kept.map((x) => x.s!.id), captainIds: kept.map((x) => x.c), formation,
  };
  setSortie(state);
  return battleInit(scene, state);
}

export function endSortie(scene: Phaser.Scene): void {
  if (currentSortie()) setSortie(null);
  scene.registry.remove(NOTES_KEY);
}

/** Where a saved sortie stands, for the campaign map (#138). Null when there is nothing to continue. */
export interface IPendingSortie {
  areaId: string;
  /** "2 / 3" */
  node: number;
  battles: number;
  /** true: the last battle was fought and the fleet can advance; false: that battle is fought again */
  advance: boolean;
}

export function pendingSortie(scene: Phaser.Scene): IPendingSortie | null {
  const s = currentSortie();
  if (!s || !areaById(s.areaId)) return null;
  const battles = battleNodes(s.route);
  if (s.fought && !previewAdvance(scene)?.continuing.length) return null;
  const node = battles.indexOf(s.route[s.at]) + 1;
  return { areaId: s.areaId, node: s.fought ? node + 1 : node, battles: battles.length, advance: s.fought === true };
}

/** Picks a saved sortie back up (#138): advances after a fought battle, or fights the interrupted one again. */
export function resumeSortie(scene: Phaser.Scene): IBattleInitData | null {
  const s = currentSortie();
  if (!s) return null;
  if (s.fought) return advanceSortie(scene)?.init ?? null;
  return battleInit(scene, s);
}

/** What the route held before this battle (shown once, on its results). */
export function takeSortieNotes(scene: Phaser.Scene): string[] {
  const notes = (scene.registry.get(NOTES_KEY) as string[] | undefined) ?? [];
  scene.registry.remove(NOTES_KEY);
  return notes;
}

export interface IAdvancePreview {
  /** Ships that will fight on */
  continuing: string[];
  /** Names of ships dropping out (大破) */
  dropped: string[];
}

/** Who goes on to the next node, judged from the damage saved after the battle. */
export function previewAdvance(scene: Phaser.Scene): IAdvancePreview | null {
  const s = currentSortie();
  if (!s || nextBattleIndex(s.route, s.at + 1) < 0) return null;
  const progress = loadProgress();
  const continuing = shipsForNextNode(s.shipIds, (id) => hpFraction(progress, id));
  const registry = DataLoader.getRegistry(scene);
  const dropped = s.shipIds.filter((id) => !continuing.includes(id)).map((id) => registry.byId(id)?.name.replace(/\s*\(.*\)\s*$/, '') ?? id);
  return { continuing, dropped };
}

/**
 * 進撃: passes any supply cache / whirlpool on the way (their resources are applied now), drops 大破 ships and
 * returns the next battle. Null when no ship can go on or there is no next battle.
 */
export function advanceSortie(scene: Phaser.Scene): { init: IBattleInitData; notes: string[] } | null {
  const s = currentSortie();
  const preview = previewAdvance(scene);
  if (!s || !preview || preview.continuing.length === 0) return null;
  const notes: string[] = [];
  let progress = loadProgress();
  for (const node of nodesBetween(s.route, s.at)) {
    const loot = node.loot ?? {};
    if (node.kind === 'resource') {
      progress = { ...progress, resources: addResources(progress.resources, loot) };
      notes.push(`${NODE_LABEL.resource}: ${formatResources(loot)} を回収`);
    } else if (node.kind === 'whirlpool') {
      // A whirlpool takes what it can; it never blocks the advance.
      const left = pay(progress.resources, loot) ?? { ...progress.resources, fuel: 0 };
      progress = { ...progress, resources: left };
      notes.push(`${NODE_LABEL.whirlpool}: ${formatResources(loot)} を失った`);
    }
  }
  const keep = s.shipIds.map((id, i) => ({ id, c: s.captainIds[i] ?? null })).filter((x) => preview.continuing.includes(x.id));
  const next: ISortieState = { ...s, at: nextBattleIndex(s.route, s.at + 1), shipIds: keep.map((x) => x.id), captainIds: keep.map((x) => x.c), fought: false };
  saveProgress({ ...progress, sortie: next });
  scene.registry.set(NOTES_KEY, notes);
  const init = battleInit(scene, next);
  return init ? { init, notes } : null;
}


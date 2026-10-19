import Phaser from 'phaser';
import campaignData from '@/data/campaign.json';
import { ICampaignArea, ICampaignData, Objective } from '@/types/Campaign';
import { IBattleInitData } from '@/types/Scene';
import { IShipData } from '@/types/Ship';
import { Formation } from '@/types/Formation';
import { Nation } from '@/types/Nation';
import { FleetSystem } from '@/systems/FleetSystem';
import { areaMode } from '@/systems/CampaignSystem';
import { hpFraction } from '@/systems/DockSystem';
import { addResources, formatResources, pay } from '@/systems/ResourceSystem';
import { battleNodes, ISortieNode, NODE_LABEL, nextBattleIndex, nodesBetween, shipsForNextNode, sortieRoute } from '@/systems/SortieMapSystem';
import { DataLoader } from '@/utils/DataLoader';
import { loadProgress, saveProgress } from '@/utils/ProgressStore';

/** Registry key: the campaign sortie in progress (#53). Lost on reload, which only ends the sortie. */
const SORTIE_KEY = 'sortie.state';
const NOTES_KEY = 'sortie.notes';

interface ISortieState {
  areaId: string;
  route: ISortieNode[];
  /** Route index of the battle being fought */
  at: number;
  nation: Nation;
  enemyNation: Nation;
  shipIds: string[];
  captainIds: (string | null)[];
  formation: Formation;
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
  scene.registry.set(SORTIE_KEY, state);
  return battleInit(scene, state);
}

export function endSortie(scene: Phaser.Scene): void {
  scene.registry.remove(SORTIE_KEY);
  scene.registry.remove(NOTES_KEY);
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
  const s = scene.registry.get(SORTIE_KEY) as ISortieState | undefined;
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
  const s = scene.registry.get(SORTIE_KEY) as ISortieState | undefined;
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
  if (notes.length > 0) saveProgress(progress);
  const keep = s.shipIds.map((id, i) => ({ id, c: s.captainIds[i] ?? null })).filter((x) => preview.continuing.includes(x.id));
  const next: ISortieState = { ...s, at: nextBattleIndex(s.route, s.at + 1), shipIds: keep.map((x) => x.id), captainIds: keep.map((x) => x.c) };
  scene.registry.set(SORTIE_KEY, next);
  scene.registry.set(NOTES_KEY, notes);
  const init = battleInit(scene, next);
  return init ? { init, notes } : null;
}


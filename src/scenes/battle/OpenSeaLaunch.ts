import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import {
  FUEL_MAX, IAnchorPlace, ISectorRef, WORLD_MAP, areaBlock, findRoute, homeAnchor, routeFuel, routeLength, sectorAt, shipPlace,
} from '@/systems/OpenSeaSystem';
import { FleetSystem } from '@/systems/FleetSystem';
import { IShipData } from '@/types/Ship';
import { IBattleInitData } from '@/types/Scene';
import { Formation } from '@/types/Formation';
import { Nation } from '@/types/Nation';
import { DataLoader } from '@/utils/DataLoader';
import { SELECTION_KEY } from '@/utils/FleetSelection';
import { loadProgress } from '@/utils/ProgressStore';

/** Areas the open sea fights in 0.0.69 (案 2): the plain fights. The other objectives still sail from the 作戦 screen. */
export const OPEN_SEA_OBJECTIVES = ['Annihilate', 'SinkTargets'] as const;

interface ICandidate {
  ships: IShipData[];
  captainIds: (string | null)[];
  formation: Formation;
  at: IAnchorPlace;
  route: ISectorRef[];
}

/**
 * 作戦の一覧から (#445, 0.0.69): the fleet lying nearest the area sails for it by the autopilot. The candidates are
 * the groups lying away from home (停泊) and the fleet last set up in the builder (where its ships lie). Returns why
 * nobody can go, or null once the battle screen is on its way.
 */
export function launchToArea(scene: Phaser.Scene, areaId: string): string | null {
  const block = areaBlock(areaId);
  if (!block) return 'この海域は広い海の上にありません';
  const p = loadProgress();
  const registry = DataLoader.getRegistry(scene);
  const own = (ids: readonly string[]): IShipData[] => ids.filter((id) => p.ships.includes(id)).map((id) => registry.byId(id)).filter((s): s is IShipData => s !== undefined);
  const target = { c: block.c, r: block.r };
  const candidates: ICandidate[] = [];
  const consider = (ships: IShipData[], captainIds: (string | null)[], formation: Formation, at: IAnchorPlace): void => {
    if (ships.length === 0) return;
    const route = findRoute(sectorAt(at.x, at.y), target);
    if (route) candidates.push({ ships, captainIds, formation, at, route });
  };
  for (const a of p.openSea.anchors) {
    const ships = own(a.shipIds).slice(0, 6);
    consider(ships, ships.map(() => null), Formation.LineAhead, a.at);
  }
  // The builder's fleet, if its ships lie together.
  const sel = (scene.registry.get(SELECTION_KEY) as Partial<Record<Nation, { slotIds: (string | null)[]; captainIds?: (string | null)[]; formation?: Formation }>> | undefined)?.[p.nation];
  const chosen = own((sel?.slotIds ?? []).filter((id): id is string => !!id));
  const places = chosen.map((s) => shipPlace(p.openSea.anchors, s.id, p.nation));
  const home = homeAnchor(p.nation);
  if (chosen.length > 0 && places.every((pl) => pl.base === places[0].base && pl.x === places[0].x && pl.y === places[0].y)) {
    const caps = (sel?.slotIds ?? []).flatMap((id, i) => (id && chosen.some((s) => s.id === id) ? [sel?.captainIds?.[i] ?? null] : []));
    consider(chosen, caps, sel?.formation ?? Formation.LineAhead, places[0] ?? home);
  }
  if (candidates.length === 0) return '向かえる艦隊がありません。編成で艦隊を組むか、外洋の画面から艦隊を出してください';
  candidates.sort((a, b) => routeLength(a.route) - routeLength(b.route));
  const best = candidates[0];
  if (routeFuel(best.route) > FUEL_MAX) return `一番近い艦隊からも燃料が足りません (燃料 ${routeFuel(best.route)})。前線の基地に回航してください`;
  const init: IBattleInitData = {
    playerFleet: FleetSystem.createFleet('player-fleet', '第一艦隊', p.nation, best.ships, 0),
    enemyFleet: FleetSystem.createFleet('enemy-fleet', '—', p.nation, [], 0),
    mapKey: 'open-sea',
    formation: best.formation,
    captainIds: best.captainIds,
    openSea: true,
    openSeaFrom: best.at,
    openSeaRoute: best.route,
  };
  scene.scene.start(SceneKeys.BATTLE, init);
  return null;
}

/** The area blocks on the world map (for the data checks). */
export function areaIds(): string[] {
  return Object.keys(WORLD_MAP.areas);
}

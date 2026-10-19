import { ICampaignArea } from '@/types/Campaign';
import { IResources } from '@/types/Progression';
import { IShipData } from '@/types/Ship';
import { isFreeArea } from './CampaignSystem';

/**
 * Sortie routes (#53, pure): a campaign area is fought over several nodes — an escort skirmish, maybe a supply
 * cache or a whirlpool, then the main fleet (boss). After each won battle the admiral advances or withdraws; damage
 * carries over (it is kept in the docks' damage table), and badly damaged ships (大破) drop out of the fleet.
 * Only winning the boss node clears the area. A theater's free first area and small fleets stay one battle.
 */

export type SortieNodeKind = 'battle' | 'resource' | 'whirlpool' | 'boss';

export interface ISortieNode {
  kind: SortieNodeKind;
  /** Enemy ship ids for battle / boss nodes */
  ships?: string[];
  /** Resources gained (resource) or lost (whirlpool) on passing */
  loot?: Partial<IResources>;
}

/** A ship at or below this HP fraction is 大破 and leaves the fleet before the next battle. */
export const HEAVY_DAMAGE = 0.25;
/** Enemy fleets smaller than this are one battle. */
const MIN_ROUTE_FLEET = 3;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * The area's route: escorts (the lighter half of the enemy, at most three) first, then on some areas a supply
 * cache or a whirlpool (fixed per area), then the whole enemy fleet as the boss.
 */
export function sortieRoute(area: ICampaignArea, enemy: IShipData[]): ISortieNode[] {
  const boss: ISortieNode = { kind: 'boss', ships: enemy.map((s) => s.id) };
  if (isFreeArea(area) || enemy.length < MIN_ROUTE_FLEET) return [boss];
  const escorts = [...enemy].sort((a, b) => a.hp - b.hp).slice(0, Math.min(3, Math.ceil(enemy.length / 2)));
  const nodes: ISortieNode[] = [{ kind: 'battle', ships: escorts.map((s) => s.id) }];
  const n = enemy.length;
  switch (hash(area.id) % 3) {
    case 0: nodes.push({ kind: 'resource', loot: { fuel: 40 * n, ammo: 30 * n } }); break;
    case 1: nodes.push({ kind: 'whirlpool', loot: { fuel: 20 * n } }); break;
    default: break;
  }
  nodes.push(boss);
  return nodes;
}

/** Battle nodes only, in order (what the results count as "2 / 2"). */
export function battleNodes(route: ISortieNode[]): ISortieNode[] {
  return route.filter((n) => n.kind === 'battle' || n.kind === 'boss');
}

/** Index of the first battle node at or after `from`, or -1. */
export function nextBattleIndex(route: ISortieNode[], from: number): number {
  for (let i = Math.max(0, from); i < route.length; i++) if (route[i].kind === 'battle' || route[i].kind === 'boss') return i;
  return -1;
}

/** The non-battle nodes passed on the way from battle node `from` to the next battle (exclusive both ends). */
export function nodesBetween(route: ISortieNode[], from: number): ISortieNode[] {
  const to = nextBattleIndex(route, from + 1);
  return to < 0 ? [] : route.slice(from + 1, to);
}

/** Ships that may fight the next node: afloat and above 大破 (`hp` = HP fraction by ship id). */
export function shipsForNextNode(shipIds: string[], hp: (id: string) => number): string[] {
  return shipIds.filter((id) => hp(id) > HEAVY_DAMAGE);
}

export const NODE_LABEL: Record<SortieNodeKind, string> = {
  battle: '前哨戦',
  resource: '資源マス',
  whirlpool: '渦潮',
  boss: '主力艦隊',
};

import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, IS_PORTRAIT } from '@/config/GameConstants';
import { audio } from '@/systems/AudioSystem';
import { DataLoader } from '@/utils/DataLoader';
import { loadProgress } from '@/utils/ProgressStore';
import { areasOf, enemyNationFor, enemyShips, isCleared, isFreeArea, isUnlocked, theaterProgress, theatersFor } from '@/systems/CampaignSystem';
import { ownedIds, rewardShipFor } from '@/systems/ShipyardSystem';
import { kindLabel } from '@/systems/EncyclopediaSystem';
import { hasCapitalShips, kindBreakdown, kindGroups } from '@/systems/ShipKind';
import { formatResources } from '@/systems/ResourceSystem';
import { TIME_LABEL, WEATHER_LABEL } from '@/systems/WeatherSystem';
import { NATION_INFO } from '@/config/NationInfo';
import { ICampaignArea, ICampaignData, Objective, ITheater } from '@/types/Campaign';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, addPanel, UIButton } from '@/ui/components/UIKit';
import campaignData from '@/data/campaign.json';

/** Registry key: the area the Fleet Builder is preparing a sortie for. */
export const CAMPAIGN_AREA_KEY = 'campaign.area';

const DATA = campaignData as ICampaignData;

export const OBJECTIVE_LABEL: Record<Objective, string> = {
  [Objective.Annihilate]: '敵艦隊の殲滅',
  [Objective.Convoy]: '輸送船団の護衛',
  [Objective.Bombard]: '陸上目標の破壊',
  [Objective.SinkTargets]: '目標艦の撃沈',
  [Objective.Breakthrough]: '突入',
  [Objective.PreventEscape]: '脱出の阻止',
  [Objective.Delay]: '遅滞戦闘',
};

interface IRect { x: number; y: number; w: number; h: number }

const L = IS_PORTRAIT
  ? { tabsY: 172, map: { x: 16, y: 216, w: CANVAS_W - 32, h: 440 } as IRect, detail: { x: 16, y: 672, w: CANVAS_W - 32, h: CANVAS_H - 688 } as IRect }
  : { tabsY: 120, map: { x: 24, y: 160, w: 780, h: 540 } as IRect, detail: { x: 820, y: 160, w: 436, h: 540 } as IRect };
const NODE_R = IS_PORTRAIT ? 26 : 22;

/**
 * 作戦: the strategic map. Each theater is a chain of sea areas; clearing one unlocks the next.
 * Selecting an area shows its briefing; 出撃準備 opens the Fleet Builder for that operation.
 */
export class CampaignMapScene extends Phaser.Scene {
  private theater = DATA.theaters[0].id;
  /** Theaters the nation being played can fight in (#27) */
  private theaters: ITheater[] = [];
  private selected: ICampaignArea | null = null;
  private tabs: UIButton[] = [];
  private mapLayer: Phaser.GameObjects.GameObject[] = [];
  private detailLayer: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super({ key: SceneKeys.CAMPAIGN });
  }

  create(): void {
    audio.music('menu');
    this.tabs = [];
    this.mapLayer = [];
    this.detailLayer = [];
    addBackdrop(this, 'menu');
    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    new UIButton(this, back.x, back.y, '‹  鎮守府', () => this.scene.start(SceneKeys.HOME), {
      variant: 'secondary', width: back.w, height: back.h, fontSize: 15,
    });
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 104 : 60, '作戦 — 戦略地図', displayStyle(24)).setOrigin(0.5);

    this.theaters = theatersFor(DATA, loadProgress().nation);
    if (!this.theaters.some((t) => t.id === this.theater)) this.theater = this.theaters[0]?.id ?? DATA.theaters[0].id;
    const w = CANVAS_W - L.map.x * 2;
    const bw = (w - 8 * (this.theaters.length - 1)) / Math.max(1, this.theaters.length);
    this.tabs = this.theaters.map(
      (t, i) =>
        new UIButton(this, L.map.x + i * (bw + 8) + bw / 2, L.tabsY, '', () => this.selectTheater(t.id), {
          variant: 'secondary', width: bw, height: IS_PORTRAIT ? 54 : 38, fontSize: 15,
        }),
    );
    addPanel(this, L.map.x, L.map.y, L.map.w, L.map.h, { radius: 24, fillAlpha: 0.45, glow: 0.5 });
    addPanel(this, L.detail.x, L.detail.y, L.detail.w, L.detail.h, { radius: 24, fillAlpha: 0.6, glow: 0.6 });
    this.selectTheater(this.theater);
  }

  private selectTheater(id: string): void {
    this.theater = id;
    const cleared = loadProgress().campaign;
    this.theaters.forEach((t, i) => {
      const pct = Math.round(theaterProgress(DATA, t.id, cleared) * 100);
      this.tabs[i].setLabel(`${t.name}  ${pct}%`).setVariant(t.id === id ? 'primary' : 'secondary');
    });
    const areas = areasOf(DATA, id);
    this.selected = areas.find((a) => isUnlocked(a, cleared) && !isCleared(a, cleared)) ?? areas[0] ?? null;
    this.drawMap();
    this.drawDetail();
  }

  private nodePos(a: ICampaignArea): { x: number; y: number } {
    const m = L.map;
    const pad = 60;
    return { x: m.x + pad + a.x * (m.w - pad * 2), y: m.y + pad + a.y * (m.h - pad * 2) };
  }

  private drawMap(): void {
    for (const o of this.mapLayer) o.destroy();
    this.mapLayer = [];
    const cleared = loadProgress().campaign;
    const areas = areasOf(DATA, this.theater);
    const g = this.add.graphics();
    this.mapLayer.push(g);
    // Faint chart grid
    g.lineStyle(1, Colors.cyan, 0.06);
    for (let x = L.map.x + 40; x < L.map.x + L.map.w; x += 60) g.lineBetween(x, L.map.y + 10, x, L.map.y + L.map.h - 10);
    for (let y = L.map.y + 40; y < L.map.y + L.map.h; y += 60) g.lineBetween(L.map.x + 10, y, L.map.x + L.map.w - 10, y);
    // Routes
    for (const a of areas) {
      const to = this.nodePos(a);
      for (const r of a.requires) {
        const from = areas.find((x) => x.id === r);
        if (!from) continue;
        const p = this.nodePos(from);
        g.lineStyle(3, isCleared(from, cleared) ? Colors.cyan : Colors.muted, isCleared(from, cleared) ? 0.7 : 0.25);
        g.lineBetween(p.x, p.y, to.x, to.y);
      }
    }
    // Nodes
    areas.forEach((a, i) => {
      const { x, y } = this.nodePos(a);
      const done = isCleared(a, cleared);
      const open = isUnlocked(a, cleared);
      const color = done ? Colors.gold : open ? Colors.cyan : Colors.muted;
      const node = this.add.graphics();
      node.fillStyle(color, done || open ? 0.25 : 0.1);
      node.fillCircle(x, y, NODE_R);
      node.lineStyle(a === this.selected ? 4 : 2, color, open ? 1 : 0.4);
      node.strokeCircle(x, y, NODE_R);
      const label = this.add.text(x, y, done ? '✓' : String(i + 1), textStyle(16, done ? Css.gold : open ? Css.text : Css.dim, { fontStyle: 'bold' })).setOrigin(0.5);
      const name = this.add.text(x, y + NODE_R + 8, a.name, textStyle(12, open ? Css.text : Css.dim, { fontStyle: 'bold' })).setOrigin(0.5, 0);
      const hit = this.add.zone(x, y, NODE_R * 3, NODE_R * 3).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => {
        this.selected = a;
        this.drawMap();
        this.drawDetail();
      });
      this.mapLayer.push(node, label, name, hit);
      if (open && !done) {
        const pulse = this.add.circle(x, y, NODE_R).setStrokeStyle(2, Colors.cyan, 0.8);
        this.tweens.add({ targets: pulse, scale: 1.6, alpha: 0, duration: 1400, repeat: -1 });
        this.mapLayer.push(pulse);
      }
    });
  }

  private drawDetail(): void {
    for (const o of this.detailLayer) o.destroy();
    this.detailLayer = [];
    const a = this.selected;
    if (!a) return;
    const d = L.detail;
    const cleared = loadProgress().campaign;
    const open = isUnlocked(a, cleared);
    const x = d.x + 24;
    const wrap = { wordWrap: { width: d.w - 48, useAdvancedWrap: true } };
    const registry = DataLoader.getRegistry(this);
    const enemyNation = enemyNationFor(DATA, a, loadProgress().nation);
    const enemy = enemyShips(a, registry, enemyNation);
    // Kinds first, then the names under each kind (#68).
    const lineup = kindGroups(enemy.map((s) => ({ ...s, name: s.name.replace(/\s*\(.*\)\s*$/, '') })))
      .map((g) => `${g.kind}  ${g.names.join('・')}`)
      .join('\n');
    const map = DataLoader.getMap(this, a.map);
    // First-clear ship for the nation being played (#18).
    const progress = loadProgress();
    const roster = registry.byNation(progress.nation);
    const rewardShip = isCleared(a, cleared) ? undefined : rewardShipFor(a.rewardShip, roster, ownedIds(progress, roster));
    const reward = formatResources(a.reward) + (rewardShip ? `  +  ${rewardShip.name.replace(/\s*\(.*\)\s*$/, '')} (${kindLabel(rewardShip)})` : '');
    const lines: Array<[string, string]> = [
      ['目標', OBJECTIVE_LABEL[a.objective]],
      ['敵', `${NATION_INFO[enemyNation].ja} ${enemy.length} 隻 — ${kindBreakdown(enemy)}\n${lineup}`],
      ['海域', `${map.name}  ·  ${WEATHER_LABEL[a.weather]}  ·  ${TIME_LABEL[a.time]}${isFreeArea(a) ? '  ·  出撃無料' : ''}`],
      ['初回報酬', reward],
    ];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.detailLayer.push(o);
      return o;
    };
    add(this.add.text(x, d.y + 20, isCleared(a, cleared) ? '攻略済' : open ? '作戦' : '未解放', eyebrowStyle(11, isCleared(a, cleared) ? Css.gold : open ? Css.cyan : Css.dim)));
    const title = add(this.add.text(x, d.y + 44, a.name, displayStyle(24)));
    const desc = add(this.add.text(x, title.y + title.height + 10, a.description, textStyle(13, Css.muted, wrap)));
    let y = desc.y + desc.height + 18;
    for (const [k, v] of lines) {
      add(this.add.text(x, y, k, eyebrowStyle(10, Css.gold)));
      // Battleships, carriers or heavy cruisers in the enemy fleet show in gold.
      const strong = k === '敵' && hasCapitalShips(enemy);
      const t = add(this.add.text(x, y + (IS_PORTRAIT ? 26 : 18), v, textStyle(13, strong ? Css.gold : Css.text, { ...wrap, lineSpacing: 4 })));
      y = t.y + t.height + (IS_PORTRAIT ? 14 : 10);
    }
    const btn = add(
      new UIButton(this, d.x + d.w / 2, d.y + d.h - (IS_PORTRAIT ? 56 : 46), open ? '出撃準備  ›' : '前の海域を攻略してください', () => this.prepare(a), {
        variant: open ? 'gold' : 'secondary', width: d.w - 48, height: IS_PORTRAIT ? 76 : 60, fontSize: open ? 20 : 14,
      }),
    );
    btn.setEnabled(open);
  }

  private prepare(a: ICampaignArea): void {
    if (!isUnlocked(a, loadProgress().campaign)) return;
    this.registry.set(CAMPAIGN_AREA_KEY, a.id);
    this.scene.start(SceneKeys.FLEET_BUILDER);
  }
}

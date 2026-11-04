import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_H, CANVAS_W, IS_PORTRAIT } from '@/config/GameConstants';
import { NATION_INFO, PLAYABLE_NATIONS } from '@/config/NationInfo';
import { audio } from '@/systems/AudioSystem';
import { DataLoader } from '@/utils/DataLoader';
import { loadProgress, saveProgress } from '@/utils/ProgressStore';
import { SELECTION_KEY } from '@/utils/FleetSelection';
import { FleetSystem } from '@/systems/FleetSystem';
import { areaMode } from '@/systems/CampaignSystem';
import { formatResources } from '@/systems/ResourceSystem';
import { paySortie, sortieBlockers, sortieCostFor } from '@/systems/ProgressionSystem';
import { kindBreakdown } from '@/systems/ShipKind';
import { randomTime, randomWeather } from '@/systems/WeatherSystem';
import { hpFraction } from '@/systems/DockSystem';
import {
  dangerAt, distance, emptyWorld, endVoyage, HOME, ISpot, MAX_DANGER, reachProblem, RING, sailTo, startVoyage, SUPPLY_MAX,
  spotWon, supplyFor, WORLD_SIZE, worldEnemyFleet, worldGold, worldReward, worldSpots,
} from '@/systems/WorldSystem';
import { IBattleInitData } from '@/types/Scene';
import { Formation } from '@/types/Formation';
import { Nation } from '@/types/Nation';
import { IShipData } from '@/types/Ship';
import { Objective } from '@/types/Campaign';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, drawPanel, fitText, makeClickable, UIButton } from '@/ui/components/UIKit';
import { showScreenHelp } from '@/ui/components/ScreenHelpSheet';

/** Portrait: the chart on top, the panel under it; landscape: the chart on the left, the panel on the right. */
const L = IS_PORTRAIT
  ? { chart: { x: 30, y: 150, s: CANVAS_W - 60 }, panel: { x: 30, y: 150 + CANVAS_W - 60 + 20, w: CANVAS_W - 60, h: CANVAS_H - (150 + CANVAS_W - 60 + 20) - 30 }, bh: 64 }
  : { chart: { x: 40, y: 100, s: CANVAS_H - 130 }, panel: { x: 40 + CANVAS_H - 130 + 30, y: 100, w: CANVAS_W - (40 + CANVAS_H - 130 + 30) - 40, h: CANVAS_H - 130 }, bh: 52 };

interface ISelection {
  slotIds: (string | null)[];
  captainIds?: (string | null)[];
  formation?: Formation;
}

/**
 * 外洋 (#65 第 1 段階): the open sea round the home port. The fleet set up in the builder sails out, picks its fights
 * among the enemy groups at sea (stronger further out) and comes home before its supply runs out.
 */
export class WorldMapScene extends Phaser.Scene {
  private layer: Phaser.GameObjects.GameObject[] = [];
  private selected: string | null = null;
  private status = '';
  private bad = false;

  constructor() {
    super({ key: SceneKeys.WORLD });
  }

  create(): void {
    this.layer = [];
    this.selected = null;
    this.status = '';
    this.bad = false;
    showScreenHelp(this);
    audio.music('menu');
    addBackdrop(this, 'menu');
    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    new UIButton(this, back.x, back.y, '‹  鎮守府', () => this.scene.start(SceneKeys.HOME), { variant: 'secondary', width: back.w, height: back.h, fontSize: 15 });
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 100 : 46, '外洋', displayStyle(24)).setOrigin(0.5);
    this.draw();
  }

  private track<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.layer.push(o);
    return o;
  }

  private say(text: string, bad = false): void {
    this.status = text;
    this.bad = bad;
    this.draw();
  }

  private spots(): ISpot[] {
    const p = loadProgress();
    return worldSpots(Date.now(), p.nation, PLAYABLE_NATIONS);
  }

  /** Chart units → screen */
  private at(x: number, y: number): { x: number; y: number } {
    const k = L.chart.s / WORLD_SIZE;
    return { x: L.chart.x + x * k, y: L.chart.y + y * k };
  }

  private draw(): void {
    for (const o of this.layer) o.destroy();
    this.layer = [];
    const p = loadProgress();
    const world = p.world ?? emptyWorld();
    const voyage = world.voyage;
    const c = L.chart;
    this.track(drawPanel(this.add.graphics(), c.x, c.y, c.s, c.s, { radius: 16, fill: Colors.panel, fillAlpha: 0.55, rimAlpha: 0.3 }));
    // The danger rings round the port, drawn as arcs clipped to the chart.
    const g = this.track(this.add.graphics());
    const k = c.s / WORLD_SIZE;
    const home = this.at(HOME.x, HOME.y);
    for (let d = 1; d <= MAX_DANGER; d++) {
      const r = d * RING * k;
      g.lineStyle(1.5, d >= 8 ? Colors.danger : d >= 5 ? Colors.gold : Colors.cyan, 0.25 + d * 0.02);
      for (let a = Math.PI; a <= Math.PI * 2 + 0.001; a += Math.PI / 48) {
        const x1 = home.x + Math.cos(a) * r;
        const y1 = home.y + Math.sin(a) * r;
        const x2 = home.x + Math.cos(a + Math.PI / 96) * r;
        const y2 = home.y + Math.sin(a + Math.PI / 96) * r;
        const inside = (x: number, y: number): boolean => x >= c.x && x <= c.x + c.s && y >= c.y && y <= c.y + c.s;
        if (inside(x1, y1) && inside(x2, y2)) g.lineBetween(x1, y1, x2, y2);
      }
    }
    // The port
    g.fillStyle(Colors.gold, 1);
    g.fillCircle(home.x, home.y, 8);
    this.track(this.add.text(home.x, home.y + 12, NATION_INFO[p.nation].ja, eyebrowStyle(10, Css.gold)).setOrigin(0.5, 0));
    // The enemy groups at sea
    for (const s of this.spots()) {
      const won = spotWon(world, s.id);
      const pos = this.at(s.x, s.y);
      const pick = this.selected === s.id;
      const dot = this.track(this.add.container(pos.x, pos.y));
      const mark = this.add.graphics();
      mark.fillStyle(won ? Colors.success : s.danger >= 8 ? Colors.danger : s.danger >= 5 ? Colors.gold : Colors.cyan, won ? 0.5 : 0.9);
      mark.fillCircle(0, 0, pick ? 13 : 10);
      if (pick) {
        mark.lineStyle(2, Colors.gold, 1);
        mark.strokeCircle(0, 0, 18);
      }
      const label = this.add.text(0, 0, `${s.danger}`, textStyle(11, Css.bgDeep, { fontStyle: 'bold' })).setOrigin(0.5);
      dot.add([mark, label]);
      makeClickable(dot, 40, 40);
      dot.on('pointerup', () => {
        this.selected = s.id;
        this.status = '';
        this.draw();
      });
    }
    // The fleet
    if (voyage) {
      const f = this.at(voyage.x, voyage.y);
      g.fillStyle(Colors.success, 1);
      g.fillTriangle(f.x, f.y - 10, f.x - 8, f.y + 7, f.x + 8, f.y + 7);
      if (distance(voyage, HOME) > 1) {
        g.lineStyle(1, Colors.success, 0.5);
        g.lineBetween(home.x, home.y, f.x, f.y);
      }
    }
    this.drawPanelSide();
  }

  /** The fleet chosen in the builder (the session's last), its ships and why it can't sail. */
  private chosenFleet(): { ships: IShipData[]; captainIds: (string | null)[]; formation: Formation } {
    const p = loadProgress();
    const sel = (this.registry.get(SELECTION_KEY) as Partial<Record<Nation, ISelection>> | undefined)?.[p.nation];
    const registry = DataLoader.getRegistry(this);
    const ships: IShipData[] = [];
    const captainIds: (string | null)[] = [];
    (sel?.slotIds ?? []).forEach((id, i) => {
      const s = id && p.ships.includes(id) ? registry.byId(id) : undefined;
      if (s) {
        ships.push(s);
        captainIds.push(sel?.captainIds?.[i] ?? null);
      }
    });
    return { ships, captainIds, formation: sel?.formation ?? Formation.LineAhead };
  }

  private drawPanelSide(): void {
    const P = L.panel;
    const p = loadProgress();
    const world = p.world ?? emptyWorld();
    const voyage = world.voyage;
    this.track(drawPanel(this.add.graphics(), P.x, P.y, P.w, P.h, { radius: 16, fillAlpha: 0.6, rimAlpha: 0.25 }));
    const x = P.x + 18;
    const w = P.w - 36;
    const wrap = { wordWrap: { width: w, useAdvancedWrap: true }, lineSpacing: 3 };
    let y = P.y + 14;
    const line = (text: string, size = 13, color: string = Css.text): Phaser.GameObjects.Text => {
      const t = this.track(this.add.text(x, y, text, textStyle(size, color, wrap)));
      y += t.height + 8;
      return t;
    };
    this.track(this.add.text(x, y, voyage ? '航海中' : '軍港に停泊中', eyebrowStyle(11, voyage ? Css.success : Css.gold)));
    y += 22;
    const registry = DataLoader.getRegistry(this);
    if (voyage) {
      const ships = voyage.shipIds.map((id) => registry.byId(id)).filter((s): s is IShipData => s !== undefined);
      const hurt = ships.map((s) => `${s.name.replace(/\s*\(.*\)\s*$/, '')} ${Math.round(hpFraction(p, s.id) * 100)}%`).join('・');
      line(`補給 ${voyage.supply} / ${SUPPLY_MAX}  ·  危険度 ${dangerAt(voyage)}  ·  この航海の勝利 ${voyage.cleared.length}`, 14, Css.text);
      line(hurt, 12, Css.muted);
    } else {
      const fleet = this.chosenFleet();
      line(fleet.ships.length > 0 ? `出港する艦隊: ${fleet.ships.length} 隻 — ${kindBreakdown(fleet.ships)}` : '艦隊がありません。「編成」で艦隊を組んでから来てください', 13, fleet.ships.length > 0 ? Css.text : Css.danger);
    }
    line(`これまで: 勝利 ${world.wins}  ·  最も遠い勝利 危険度 ${world.best || '—'}`, 12, Css.muted);
    // The group picked on the chart
    const spot = this.spots().find((s) => s.id === this.selected);
    if (spot) {
      const roster = registry.byNation(spot.enemyNation);
      const enemy = worldEnemyFleet(roster, spot);
      this.track(this.add.text(x, y, `敵艦隊  危険度 ${spot.danger}`, eyebrowStyle(11, spot.danger >= 8 ? Css.danger : Css.gold)));
      y += 22;
      line(`${NATION_INFO[spot.enemyNation].ja} ${enemy.length} 隻 — ${kindBreakdown(enemy)}`, 13);
      line(`勝てば戦闘の報酬に加えて ${formatResources(worldReward(spot.danger))}・ゴールド ${worldGold(spot.danger)}`, 12, Css.cyan);
      if (spotWon(world, spot.id)) line('この敵艦隊には勝ちました (この 1 時間は戻らず、次の時間に新しい敵艦隊)', 12, Css.success);
      else if (voyage) {
        const problem = reachProblem(voyage, spot);
        line(problem ?? `ここまで補給 ${supplyFor(distance(voyage, spot))}・戦闘で 8・帰りに ${supplyFor(distance(spot, HOME))}`, 12, problem ? Css.danger : Css.muted);
      }
    } else {
      line('海図の敵艦隊をタップすると、強さと報酬が出ます。軍港から遠いほど強く、報酬も多くなります。', 12, Css.muted);
    }
    // The buttons, at the bottom of the panel
    const by = P.y + P.h - 16 - L.bh / 2;
    if (this.status) {
      const st = this.track(this.add.text(x, by - L.bh / 2 - 8, this.status, textStyle(12, this.bad ? Css.danger : Css.success, wrap)).setOrigin(0, 1));
      fitText(st, w);
    }
    const half = (w - 12) / 2;
    if (!voyage) {
      const fleet = this.chosenFleet();
      const blockers = fleet.ships.length > 0 ? sortieBlockers(p, fleet.ships, Date.now()) : ['艦隊がありません'];
      this.track(new UIButton(this, x + half / 2, by, '出港  ›', () => this.sail(), { variant: blockers.length === 0 ? 'gold' : 'secondary', width: half, height: L.bh, fontSize: 18 })).setEnabled(blockers.length === 0);
      this.track(new UIButton(this, x + w - half / 2, by, '編成', () => this.scene.start(SceneKeys.FLEET_BUILDER, { organize: true }), { variant: 'primary', width: half, height: L.bh, fontSize: 16 }));
      const cost = fleet.ships.length > 0 ? `出港の費用 ${formatResources(sortieCostFor(fleet.ships))}` : '';
      const note = blockers.length > 0 && fleet.ships.length > 0 ? `⚠ ${blockers[0]}` : cost;
      if (note && !this.status) {
        const t = this.track(this.add.text(x, by - L.bh / 2 - 8, note, textStyle(12, blockers.length > 0 ? Css.danger : Css.muted, wrap)).setOrigin(0, 1));
        fitText(t, w);
      }
      return;
    }
    const canFight = spot && !spotWon(world, spot.id) && !reachProblem(voyage, spot);
    this.track(new UIButton(this, x + half / 2, by, '交戦  ›', () => spot && this.fight(spot), { variant: canFight ? 'danger' : 'secondary', width: half, height: L.bh, fontSize: 18 })).setEnabled(!!canFight);
    this.track(new UIButton(this, x + w - half / 2, by, '帰港する', () => this.comeHome(), { variant: 'primary', width: half, height: L.bh, fontSize: 16 }));
  }

  private sail(): void {
    const fleet = this.chosenFleet();
    const p = loadProgress();
    if (fleet.ships.length === 0 || sortieBlockers(p, fleet.ships, Date.now()).length > 0) return;
    const paid = paySortie(p, fleet.ships);
    if (!paid) return;
    const world = { ...(paid.world ?? emptyWorld()), voyage: startVoyage(fleet.ships.map((s) => s.id), fleet.captainIds, fleet.formation, Date.now()) };
    saveProgress({ ...paid, world }, 'sortie');
    this.say(`出港しました (補給 ${SUPPLY_MAX})。海図の敵艦隊を選んで交戦します`);
  }

  private comeHome(): void {
    const p = loadProgress();
    saveProgress({ ...p, world: endVoyage(p.world ?? emptyWorld()) });
    this.selected = null;
    this.say('帰港しました');
  }

  private fight(spot: ISpot): void {
    const p = loadProgress();
    const world = p.world ?? emptyWorld();
    const voyage = world.voyage;
    if (!voyage || spotWon(world, spot.id)) return;
    const problem = reachProblem(voyage, spot);
    if (problem) {
      this.say(problem, true);
      return;
    }
    const registry = DataLoader.getRegistry(this);
    const ships = voyage.shipIds.map((id) => registry.byId(id)).filter((s): s is IShipData => s !== undefined);
    const enemy = worldEnemyFleet(registry.byNation(spot.enemyNation), spot);
    if (ships.length === 0 || enemy.length === 0) return;
    saveProgress({ ...p, world: { ...world, voyage: sailTo(voyage, spot) } });
    const init: IBattleInitData = {
      playerFleet: FleetSystem.createFleet('player-fleet', '第一艦隊', p.nation, ships, 0),
      enemyFleet: FleetSystem.createFleet('enemy-fleet', 'Enemy Fleet', spot.enemyNation, enemy, 0),
      mapKey: 'open-sea',
      formation: voyage.formation,
      mode: areaMode(enemy),
      weather: randomWeather(),
      time: randomTime(),
      captainIds: voyage.captainIds,
      objective: Objective.Annihilate,
      world: { spotId: spot.id, danger: spot.danger },
    };
    this.scene.start(SceneKeys.BATTLE, init);
  }
}

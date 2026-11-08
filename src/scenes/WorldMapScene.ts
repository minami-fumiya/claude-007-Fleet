import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_H, CANVAS_W, IS_PORTRAIT } from '@/config/GameConstants';
import { NATION_INFO, PLAYABLE_NATIONS } from '@/config/NationInfo';
import { audio } from '@/systems/AudioSystem';
import { fleetStart } from '@/systems/OpenSeaSystem';
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
  supplyFor, WORLD_SIZE, worldEnemyFleet, worldGold, worldReward, worldSpots, spotWon,
  callAtPort, clearOfFeatures, FEATURE_KIND, FEATURE_MARK, featureProblem, featureReady, FORT_GOLD, FORT_NATION, FORT_REWARD, fortDanger,
  IFeature, PORT_REPAIR, resourceReward, safeAround, safeDanger, visitResource, WORLD_SEA, worldFeatures,
  allyPatrol, controlledRings, CONTROL_REWARD_MUL, CONTROL_WINS, HISTORIC_GOLD, historicBattle, historicReady, IHistoric, IPatrol, patrolJoins, PATROL_ARRIVE_SEC,
  PATROL_RANGE, ringControlled, ringWins,
} from '@/systems/WorldSystem';
import { forceShips, playableScenarios, playableSides, setupFor } from '@/systems/ScenarioSystem';
import { setDamage } from '@/systems/DockSystem';
import { addResources, gainResources } from '@/systems/ResourceSystem';
import { holdCap } from '@/systems/FacilitySystem';
import { recordLedger } from '@/systems/LedgerSystem';
import { withQuestEvents } from '@/systems/QuestSystem';
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
    // 他国の海図 (#65 第 2 段階): each navy sails its own sea.
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 100 : 46, `外洋 — ${WORLD_SEA[loadProgress().nation]}`, displayStyle(24)).setOrigin(0.5);
    // 本当のオープンワールド (#445, 0.0.68): the battle screen sails the whole world from the home port (no enemy yet).
    new UIButton(this, CANVAS_W - back.x, back.y, '広い海へ  ›', () => this.openSea(), { variant: 'gold', width: back.w, height: back.h, fontSize: 15 });
    this.draw();
  }

  /** 広い海へ (#445): the fleet chosen puts out onto the world's ocean from where its ships lie (停泊). */
  private openSea(): void {
    const fleet = this.chosenFleet();
    const p = loadProgress();
    if (fleet.ships.length === 0) {
      this.say('編成で艦隊を組むと、広い海へ出られます', true);
      return;
    }
    if (p.world?.voyage) {
      this.say('外洋に出ている艦隊を帰港させてから出てください', true);
      return;
    }
    // 停泊 (0.0.69): the fleet puts to sea from where its ships lie (a base, or the point at sea they stopped at).
    const start = fleetStart(p.openSea.anchors, fleet.ships.map((s) => s.id), p.nation);
    if ('problem' in start) {
      this.say(start.problem, true);
      return;
    }
    const init: IBattleInitData = {
      playerFleet: FleetSystem.createFleet('player-fleet', '第一艦隊', p.nation, fleet.ships, 0),
      enemyFleet: FleetSystem.createFleet('enemy-fleet', '—', p.nation, [], 0),
      mapKey: 'open-sea',
      formation: fleet.formation,
      captainIds: fleet.captainIds,
      openSea: true,
      openSeaFrom: start.at,
    };
    this.scene.start(SceneKeys.BATTLE, init);
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

  /** This hour's groups, clear of the navy's places, and safer round a stronghold taken this week. */
  private spots(): ISpot[] {
    const p = loadProgress();
    const now = Date.now();
    const features = worldFeatures(p.nation);
    const safe = safeAround(p.world, features, now);
    const extra = [this.patrol(), ...(this.historic() ? [this.historic()!] : [])];
    return clearOfFeatures(worldSpots(now, p.nation, PLAYABLE_NATIONS), [...features, ...extra]).map((s) => ({ ...s, danger: safeDanger(s, safe) }));
  }

  /** 友軍の巡回 (#65 第 3 段階): the navy's own group at sea this hour. */
  private patrol(): IPatrol {
    return allyPatrol(Date.now(), worldFeatures(loadProgress().nation));
  }

  /** 史実の海戦: the day's battle the navy fought, clear of its places and the patrol. */
  private historic(): IHistoric | null {
    const p = loadProgress();
    const list = playableScenarios(DataLoader.getScenarios(this), p.nation);
    const features = worldFeatures(p.nation);
    return historicBattle(Date.now(), list, [...features, allyPatrol(Date.now(), features), HOME]);
  }

  private features(): IFeature[] {
    return worldFeatures(loadProgress().nation);
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
    const controlled = controlledRings(world, Date.now());
    for (let d = 1; d <= MAX_DANGER; d++) {
      const r = d * RING * k;
      // 制海権 (#65 第 3 段階): the rings the navy holds this week are drawn green and bold.
      const held = controlled.includes(d);
      g.lineStyle(held ? 3 : 1.5, held ? Colors.success : d >= 8 ? Colors.danger : d >= 5 ? Colors.gold : Colors.cyan, held ? 0.7 : 0.25 + d * 0.02);
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
    // The navy's places (#65 第 2 段階): ports, resource points and the enemy's stronghold, as squares.
    // The patrol (a green circle) and the day's historical battle (a violet square).
    const marks: Array<{ id: string; x: number; y: number; text: string; color: number; round: boolean; dim: boolean }> = [
      { ...this.patrol(), text: '友', color: Colors.success, round: true, dim: false },
      ...(this.historic() ? [{ ...this.historic()!, text: '史', color: Colors.cyan, round: false, dim: !historicReady(world, Date.now()) }] : []),
    ];
    for (const m of marks) {
      const pos = this.at(m.x, m.y);
      const box = this.track(this.add.container(pos.x, pos.y));
      const gfx = this.add.graphics();
      gfx.fillStyle(m.color, m.dim ? 0.35 : 0.95);
      if (m.round) gfx.fillCircle(0, 0, 12);
      else gfx.fillRoundedRect(-12, -12, 24, 24, 5);
      if (this.selected === m.id) {
        gfx.lineStyle(2, Colors.gold, 1);
        gfx.strokeCircle(0, 0, 18);
      }
      box.add([gfx, this.add.text(0, 0, m.text, textStyle(12, Css.bgDeep, { fontStyle: 'bold' })).setOrigin(0.5)]);
      makeClickable(box, 40, 40);
      box.on('pointerup', () => {
        this.selected = m.id;
        this.status = '';
        this.draw();
      });
    }
    for (const f of this.features()) {
      const pos = this.at(f.x, f.y);
      const ready = featureReady(world, f, Date.now());
      const pick = this.selected === f.id;
      const box = this.track(this.add.container(pos.x, pos.y));
      const mark = this.add.graphics();
      const color = f.kind === 'fort' ? Colors.danger : f.kind === 'port' ? Colors.gold : Colors.success;
      mark.fillStyle(color, ready ? 0.95 : 0.35);
      mark.fillRoundedRect(-12, -12, 24, 24, 5);
      if (pick) {
        mark.lineStyle(2, Colors.gold, 1);
        mark.strokeRoundedRect(-17, -17, 34, 34, 7);
      }
      const label = this.add.text(0, 0, FEATURE_MARK[f.kind], textStyle(12, Css.bgDeep, { fontStyle: 'bold' })).setOrigin(0.5);
      box.add([mark, label]);
      makeClickable(box, 40, 40);
      box.on('pointerup', () => {
        this.selected = f.id;
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
    // The group or place picked on the chart
    const spot = this.spots().find((s) => s.id === this.selected);
    const place = this.features().find((f) => f.id === this.selected);
    const patrol = this.patrol();
    const hist = this.historic();
    if (this.selected === patrol.id) {
      this.track(this.add.text(x, y, `友軍の巡回艦隊  危険度 ${patrol.danger}`, eyebrowStyle(11, Css.success)));
      y += 22;
      line(`${NATION_INFO[p.nation].ja}の巡回艦隊がこの 1 時間ここにいます。近く (${PATROL_RANGE} 以内) の敵艦隊と戦うと、戦闘の ${PATROL_ARRIVE_SEC} 秒後に加わります。`, 12, Css.cyan);
    } else if (hist && this.selected === hist.id) {
      this.track(this.add.text(x, y, `史実の海戦  危険度 ${hist.danger}`, eyebrowStyle(11, Css.cyan)));
      y += 22;
      line(hist.name, 14);
      line(`その海戦の敵艦隊と戦う。勝つと外洋の報酬に加えてゴールド ${HISTORIC_GOLD} (1 日に 1 回、日ごとに海戦が変わる)`, 12, Css.cyan);
      if (!historicReady(world, Date.now())) line('今日はもう勝ちました', 12, Css.success);
      else if (voyage) {
        const problem = reachProblem(voyage, hist);
        if (problem) line(problem, 12, Css.danger);
      }
    } else if (place) {
      const ready = featureReady(world, place, Date.now());
      this.track(this.add.text(x, y, `${FEATURE_KIND[place.kind]}  危険度 ${place.danger}`, eyebrowStyle(11, place.kind === 'fort' ? Css.danger : Css.gold)));
      y += 22;
      line(place.name, 14);
      const what = place.kind === 'port' ? `補給を ${SUPPLY_MAX} に戻し、艦の耐久を ${Math.round(PORT_REPAIR * 100)}% まで直す (1 時間に 1 回)`
        : place.kind === 'fort' ? `${NATION_INFO[FORT_NATION[p.nation]].ja}の要塞と守備艦隊に対地攻撃。落とすと ${formatResources(FORT_REWARD)}・ゴールド ${FORT_GOLD}、今週はまわりの敵艦隊が弱くなる (週に 1 回)`
          : `寄ると ${formatResources(resourceReward(place.kind, place.danger))} (1 時間に 1 回、戦闘なし)`;
      line(what, 12, Css.cyan);
      if (!ready) line(place.kind === 'fort' ? '今週はもう落としました' : 'この 1 時間はもう寄りました', 12, Css.success);
      else if (voyage) {
        const problem = featureProblem(voyage, place);
        if (problem) line(problem, 12, Css.danger);
      } else line('出港すると寄れます', 12, Css.muted);
    } else if (spot) {
      const roster = registry.byNation(spot.enemyNation);
      const enemy = worldEnemyFleet(roster, spot);
      this.track(this.add.text(x, y, `敵艦隊  危険度 ${spot.danger}`, eyebrowStyle(11, spot.danger >= 8 ? Css.danger : Css.gold)));
      y += 22;
      line(`${NATION_INFO[spot.enemyNation].ja} ${enemy.length} 隻 — ${kindBreakdown(enemy)}`, 13);
      line(`勝てば戦闘の報酬に加えて ${formatResources(worldReward(spot.danger))}・ゴールド ${worldGold(spot.danger)}`, 12, Css.cyan);
      // 制海権 and the patrol (#65 第 3 段階)
      line(ringControlled(world, spot.danger, Date.now()) ? `この輪は制海権あり: 敵が弱く、外洋の報酬 ×${CONTROL_REWARD_MUL}` : `この輪の制海権まで ${CONTROL_WINS - ringWins(world, spot.danger, Date.now())} 勝 (今週)`, 12, Css.muted);
      if (patrolJoins(patrol, spot)) line('友軍の巡回艦隊が加わります', 12, Css.success);
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
    if (hist && this.selected === hist.id) {
      const can = historicReady(world, Date.now()) && !reachProblem(voyage, hist);
      this.track(new UIButton(this, x + half / 2, by, '交戦  ›', () => this.fightHistoric(hist), { variant: can ? 'danger' : 'secondary', width: half, height: L.bh, fontSize: 18 })).setEnabled(can);
      this.track(new UIButton(this, x + w - half / 2, by, '帰港する', () => this.comeHome(), { variant: 'primary', width: half, height: L.bh, fontSize: 16 }));
      return;
    }
    if (place) {
      const can = featureReady(world, place, Date.now()) && !featureProblem(voyage, place);
      const label = place.kind === 'port' ? '入港  ›' : place.kind === 'fort' ? '攻撃  ›' : '回収  ›';
      this.track(new UIButton(this, x + half / 2, by, label, () => this.goTo(place), { variant: can ? (place.kind === 'fort' ? 'danger' : 'gold') : 'secondary', width: half, height: L.bh, fontSize: 18 })).setEnabled(can);
      this.track(new UIButton(this, x + w - half / 2, by, '帰港する', () => this.comeHome(), { variant: 'primary', width: half, height: L.bh, fontSize: 16 }));
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

  /** A port call, a resource point, or the attack on the stronghold. */
  private goTo(f: IFeature): void {
    const now = Date.now();
    let p = loadProgress();
    const world = p.world ?? emptyWorld();
    const voyage = world.voyage;
    if (!voyage || !featureReady(world, f, now)) return;
    const problem = featureProblem(voyage, f);
    if (problem) {
      this.say(problem, true);
      return;
    }
    if (f.kind === 'fort') {
      this.fight({ id: f.id, x: f.x, y: f.y, danger: fortDanger(), enemyNation: FORT_NATION[p.nation] }, true);
      return;
    }
    if (f.kind === 'port') {
      // 応急修理: every ship of the fleet up to PORT_REPAIR of its HP.
      for (const id of voyage.shipIds) if (hpFraction(p, id) < PORT_REPAIR) p = { ...p, ...setDamage(p, id, PORT_REPAIR) };
      saveProgress(withQuestEvents({ ...p, world: callAtPort(world, f, now) }, [['portCall', 1]], now));
      this.say(`${f.name} に入港: 補給 ${SUPPLY_MAX}・応急修理`);
      return;
    }
    const reward = resourceReward(f.kind, f.danger);
    const g = gainResources(p.resources, reward, holdCap(p.facilities));
    const ledger = recordLedger(recordLedger(p.ledger, 'battle', addResources(reward, g.lost, -1), now), 'overflow', g.lost, now);
    saveProgress(withQuestEvents({ ...p, resources: g.resources, ledger, world: visitResource(world, f, now) }, [['resourceRun', 1]], now));
    this.say(`${f.name}: ${formatResources(reward)}`);
  }

  /** A battle with a group at sea, or (`fort`) the stronghold's garrison and batteries on its island. */
  /** The day's historical battle: its enemy force, fought at sea. */
  private fightHistoric(hist: IHistoric): void {
    const p = loadProgress();
    const sc = DataLoader.getScenarios(this).find((s) => s.id === hist.scenarioId);
    const side = sc ? playableSides(sc, p.nation)[0] : undefined;
    const setup = sc && side !== undefined ? setupFor(sc, side) : null;
    if (!setup) return;
    const enemy = forceShips(setup.enemy, DataLoader.getRegistry(this));
    this.fight({ id: hist.id, x: hist.x, y: hist.y, danger: hist.danger, enemyNation: setup.enemy.nation as Nation }, false, enemy);
  }

  private fight(spot: ISpot, fort = false, fixedEnemy?: IShipData[]): void {
    const p = loadProgress();
    const world = p.world ?? emptyWorld();
    const voyage = world.voyage;
    if (!voyage || (!fort && spotWon(world, spot.id))) return;
    const problem = reachProblem(voyage, spot);
    if (problem) {
      this.say(problem, true);
      return;
    }
    const registry = DataLoader.getRegistry(this);
    const ships = voyage.shipIds.map((id) => registry.byId(id)).filter((s): s is IShipData => s !== undefined);
    const enemy = fixedEnemy ?? worldEnemyFleet(registry.byNation(spot.enemyNation), spot);
    // 友軍の巡回 (#65 第 3 段階): the navy's patrol joins a fight near it (none of the fleet's own ships in it).
    const patrol = this.patrol();
    const allyShips = patrolJoins(patrol, spot)
      ? worldEnemyFleet(registry.byNation(p.nation).filter((s) => !voyage.shipIds.includes(s.id)), { id: patrol.id, danger: Math.min(patrol.danger, 6) }).slice(0, 3)
      : [];
    if (ships.length === 0 || enemy.length === 0) return;
    saveProgress({ ...p, world: { ...world, voyage: sailTo(voyage, spot) } });
    const init: IBattleInitData = {
      playerFleet: FleetSystem.createFleet('player-fleet', '第一艦隊', p.nation, ships, 0),
      enemyFleet: FleetSystem.createFleet('enemy-fleet', 'Enemy Fleet', spot.enemyNation, enemy, 0),
      mapKey: fort ? 'atoll' : 'open-sea',
      formation: voyage.formation,
      mode: areaMode(enemy),
      weather: randomWeather(),
      time: randomTime(),
      captainIds: voyage.captainIds,
      objective: fort ? Objective.Bombard : Objective.Annihilate,
      world: {
        spotId: spot.id, danger: spot.danger, ...(fort ? { fort: true } : {}), ...(fixedEnemy ? { historic: true } : {}),
        ...(ringControlled(world, spot.danger, Date.now()) ? { controlled: true } : {}),
        ...(allyShips.length > 0 ? { ally: { name: '友軍の巡回艦隊', nation: p.nation, shipIds: allyShips.map((s) => s.id) } } : {}),
      },
    };
    this.scene.start(SceneKeys.BATTLE, init);
  }
}

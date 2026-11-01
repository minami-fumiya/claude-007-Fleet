import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, IS_PORTRAIT } from '@/config/GameConstants';
import { audio } from '@/systems/AudioSystem';
import { DataLoader } from '@/utils/DataLoader';
import { FleetSystem } from '@/systems/FleetSystem';
import { forceLineup, forceShips, playableScenarios, playableSides, SCENARIO_THEATER_LABEL, scenariosIn, setupFor } from '@/systems/ScenarioSystem';
import { loadProgress } from '@/utils/ProgressStore';
import { Nation } from '@/types/Nation';
import { TIME_LABEL, WEATHER_LABEL } from '@/systems/WeatherSystem';
import { NATION_INFO } from '@/config/NationInfo';
import { OBJECTIVE_LABEL } from '@/scenes/CampaignMapScene';
import { IScenario, ScenarioTheater } from '@/types/Scenario';
import { IBattleInitData } from '@/types/Scene';
import { Formation } from '@/types/Formation';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, addPanel, drawPanel, fitText, makeClickable, UIButton } from '@/ui/components/UIKit';
import { showScreenHelp } from '@/ui/components/ScreenHelpSheet';

interface IRect { x: number; y: number; w: number; h: number }

const L = IS_PORTRAIT
  ? { list: { x: 16, y: 150, w: CANVAS_W - 32, h: 340 } as IRect, cols: 2, rows: 2, cardH: 92, tabH: 44, navH: 44, detail: { x: 16, y: 500, w: CANVAS_W - 32, h: CANVAS_H - 516 } as IRect }
  : { list: { x: 24, y: 96, w: 380, h: 604 } as IRect, cols: 1, rows: 4, cardH: 104, tabH: 34, navH: 36, detail: { x: 420, y: 96, w: 836, h: 604 } as IRect };
const GAP = 10;
const CARD_W = (L.list.w - GAP * (L.cols - 1)) / L.cols;

/**
 * 史実シナリオ: pick a historical battle and a side. Fleets, positions, weather and the special victory
 * condition come from the scenario; the battle is an exhibition (no rewards or carried-over damage).
 */
export class ScenarioScene extends Phaser.Scene {
  private scenarios: IScenario[] = [];
  private selected = 0;
  private side = 0;
  private nation = '';
  /** List filter and page (#71): 13 scenarios, oldest first */
  private theater: ScenarioTheater | 'all' = 'all';
  private page = 0;
  private cardFrames: Array<{ g: Phaser.GameObjects.Graphics; index: number }> = [];
  private listLayer: Phaser.GameObjects.GameObject[] = [];
  private detail: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super({ key: SceneKeys.SCENARIO });
  }

  create(): void {
    // First-visit help (#61): drawn above the screen, so it can be made first.
    showScreenHelp(this);
    audio.music('menu');
    // Only the battles the nation fought in, from its own side (#224).
    this.nation = loadProgress().nation;
    this.scenarios = playableScenarios(DataLoader.getScenarios(this), this.nation);
    this.selected = 0;
    this.side = this.scenarios[0] ? playableSides(this.scenarios[0], this.nation)[0] ?? 0 : 0;
    this.theater = 'all';
    this.page = 0;
    this.cardFrames = [];
    this.detail = [];
    addBackdrop(this, 'menu');
    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    new UIButton(this, back.x, back.y, '‹  鎮守府', () => this.scene.start(SceneKeys.HOME), {
      variant: 'secondary', width: back.w, height: back.h, fontSize: 15,
    });
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 104 : 60, '史実シナリオ', displayStyle(24)).setOrigin(0.5);

    this.listLayer = [];
    addPanel(this, L.detail.x, L.detail.y, L.detail.w, L.detail.h, { radius: 24, fillAlpha: 0.6, glow: 0.6 });
    if (this.scenarios.length === 0) {
      const d = L.detail;
      this.add.text(d.x + d.w / 2, d.y + d.h / 2, `${NATION_INFO[this.nation as Nation]?.ja ?? ''}が出た史実シナリオは、まだありません。\n他の国に切り替えると、その国の海戦を遊べます。`, textStyle(15, Css.muted, { align: 'center', wordWrap: { width: d.w - 60, useAdvancedWrap: true } })).setOrigin(0.5);
      return;
    }
    this.drawList();
    this.refresh();
  }

  /** Theater tabs, a page of cards and the page buttons (#71). */
  drawList(): void {
    for (const o of this.listLayer) o.destroy();
    this.listLayer = [];
    this.cardFrames = [];
    const track = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.listLayer.push(o);
      return o;
    };
    const tabs: Array<ScenarioTheater | 'all'> = ['all', 'pacific', 'atlantic', 'mediterranean', 'arctic', 'baltic', 'blacksea'];
    const tw = (L.list.w - 6 * (tabs.length - 1)) / tabs.length;
    tabs.forEach((t, i) => {
      const n = scenariosIn(this.scenarios, t).length;
      track(new UIButton(this, L.list.x + i * (tw + 6) + tw / 2, L.list.y + L.tabH / 2, `${t === 'all' ? '全て' : SCENARIO_THEATER_LABEL[t]} ${n}`, () => {
        this.theater = t;
        this.page = 0;
        this.drawList();
      }, { variant: t === this.theater ? 'primary' : 'secondary', width: tw, height: L.tabH, fontSize: IS_PORTRAIT ? 13 : 12 }));
    });
    const list = scenariosIn(this.scenarios, this.theater);
    const perPage = L.cols * L.rows;
    const pages = Math.max(1, Math.ceil(list.length / perPage));
    this.page = Math.min(this.page, pages - 1);
    const top = L.list.y + L.tabH + GAP;
    list.slice(this.page * perPage, (this.page + 1) * perPage).forEach((sc, k) => {
      const i = this.scenarios.indexOf(sc);
      const col = k % L.cols;
      const row = Math.floor(k / L.cols);
      const r = { x: L.list.x + col * (CARD_W + GAP), y: top + row * (L.cardH + GAP), w: CARD_W, h: L.cardH };
      const frame = this.add.graphics();
      this.cardFrames.push({ g: frame, index: i });
      const date = this.add.text(18, 12, sc.date, eyebrowStyle(10, Css.gold));
      const sides = `${NATION_INFO[sc.forces.A.nation].jaShort} vs ${NATION_INFO[sc.forces.B.nation].jaShort}  ${sc.forces.A.ships.length} 対 ${sc.forces.B.ships.length}`;
      const vs = IS_PORTRAIT
        ? this.add.text(r.w - 16, 12, sides, textStyle(12, Css.muted)).setOrigin(1, 0)
        : this.add.text(18, r.h - 28, sides, textStyle(12, Css.muted));
      // Portrait: long country names (e.g. イタリア vs フランス) shrink rather than run into the date.
      const room = r.w - 16 - (date.x + date.width + 12);
      if (IS_PORTRAIT) fitText(vs, room);
      const title = this.add.text(18, IS_PORTRAIT ? 38 : 34, sc.name, displayStyle(IS_PORTRAIT ? 18 : 20));
      fitText(title, r.w - 30);
      // ★ for a scenario won from a side this nation plays (#200).
      const rec = loadProgress().record.scenarios?.[sc.id];
      const won = playableSides(sc, this.nation).some((si) => (rec?.wins[sc.sides[si].force] ?? 0) > 0);
      const star = this.add.text(r.w - 16, r.h - (IS_PORTRAIT ? 24 : 28), won ? '★ 勝利済み' : '', textStyle(11, Css.gold)).setOrigin(1, 0);
      const card = track(this.add.container(r.x, r.y, [frame, date, title, vs, star]));
      makeClickable(card, r.w, r.h);
      card.on('pointerup', () => {
        this.selected = i;
        this.side = playableSides(sc, this.nation)[0] ?? 0;
        this.refresh();
      });
    });
    if (pages > 1) {
      const ny = L.list.y + L.list.h - L.navH / 2;
      const nw = IS_PORTRAIT ? 120 : 90;
      track(new UIButton(this, L.list.x + L.list.w / 2 - nw - 40, ny, '‹ 前', () => {
        this.page = (this.page + pages - 1) % pages;
        this.drawList();
      }, { variant: 'secondary', width: nw, height: L.navH, fontSize: 13 }));
      track(this.add.text(L.list.x + L.list.w / 2, ny, `${this.page + 1} / ${pages}`, textStyle(13, Css.muted)).setOrigin(0.5));
      track(new UIButton(this, L.list.x + L.list.w / 2 + nw + 40, ny, '次 ›', () => {
        this.page = (this.page + 1) % pages;
        this.drawList();
      }, { variant: 'secondary', width: nw, height: L.navH, fontSize: 13 }));
    }
    this.drawFrames();
  }

  private drawFrames(): void {
    for (const { g, index } of this.cardFrames) {
      g.clear();
      const on = index === this.selected;
      drawPanel(g, 0, 0, CARD_W, L.cardH, { radius: 18, fill: on ? Colors.panelHi : Colors.panel, fillAlpha: on ? 0.9 : 0.5, rimAlpha: on ? 0.85 : 0.2, glow: on ? 1 : 0 });
    }
  }

  private refresh(): void {
    this.drawFrames();
    for (const o of this.detail) o.destroy();
    this.detail = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.detail.push(o);
      return o;
    };
    const sc = this.scenarios[this.selected];
    const d = L.detail;
    const x = d.x + 26;
    const w = d.w - 52;
    const wrap = { wordWrap: { width: w, useAdvancedWrap: true } };
    add(this.add.text(x, d.y + 20, `${sc.date}  ·  ${DataLoader.getMap(this, sc.map).name}  ·  ${WEATHER_LABEL[sc.weather]}  ·  ${TIME_LABEL[sc.time]}`, eyebrowStyle(10, Css.cyan)));
    const title = add(this.add.text(x, d.y + 44, sc.name, displayStyle(26)));
    const desc = add(this.add.text(x, title.y + title.height + 10, sc.description, textStyle(13, Css.muted, { ...wrap, lineSpacing: 4 })));
    let y = desc.y + desc.height + 18;

    // Side choice: only the nation's own side can be taken (#224); the other names the navy that plays it.
    const mine = playableSides(sc, this.nation);
    const bw = (w - 10) / sc.sides.length;
    sc.sides.forEach((side, i) => {
      const own = mine.includes(i);
      const label = own ? side.label : `${side.label}  (${NATION_INFO[sc.forces[side.force].nation].jaShort}で)`;
      const btn = add(
        new UIButton(this, x + i * (bw + 10) + bw / 2, y + (IS_PORTRAIT ? 28 : 22), label, () => {
          this.side = i;
          this.refresh();
        }, { variant: i === this.side ? 'primary' : 'secondary', width: bw, height: IS_PORTRAIT ? 56 : 44, fontSize: own ? 14 : 12 }),
      );
      btn.setEnabled(own);
    });
    y += IS_PORTRAIT ? 74 : 60;

    const setup = setupFor(sc, this.side)!;
    const registry = DataLoader.getRegistry(this);
    // Ships by kind (#196), not just names: a line per kind, then (when that runs into the note below) the kinds
    // as one paragraph, then the headline alone.
    const lineups = [setup.player, setup.enemy].map((f) => ({ nation: NATION_INFO[f.nation].ja, ...forceLineup(f, registry) }));
    const variants = [
      (l: (typeof lineups)[number]): string => `${l.nation}  ${l.headline}\n${l.lines.join('\n')}`,
      (l: (typeof lineups)[number]): string => `${l.nation}  ${l.headline}\n${l.lines.join('  /  ')}`,
      (l: (typeof lineups)[number]): string => `${l.nation}  ${l.headline}`,
    ];
    const limit = d.y + d.h - (IS_PORTRAIT ? 128 : 100) - 8;
    const top = y;
    for (const [vi, variant] of variants.entries()) {
      const placed: Phaser.GameObjects.Text[] = [];
      y = top;
      // 史実 (#200): what really happened, and this side's best battle so far.
      const best = loadProgress().record.scenarios?.[sc.id]?.best?.[setup.side.force];
      const rows: Array<[string, string]> = [
        ['勝利条件', `${OBJECTIVE_LABEL[setup.side.objective]} — ${setup.side.brief}`],
        ['味方', variant(lineups[0])],
        ['敵', variant(lineups[1])],
        ...(sc.history ? [['史実', `${sc.history.text}${best ? `\n最良の記録: ${best.victory ? '勝利' : '敗北'}・撃沈 ${best.sunk} 隻・損失 ${best.lost} 隻` : ''}`] as [string, string]] : []),
      ];
      for (const [k, v] of rows) {
        placed.push(this.add.text(x, y, k, eyebrowStyle(10, Css.gold)));
        const t = this.add.text(x, y + (IS_PORTRAIT ? 24 : 18), v, textStyle(13, Css.text, wrap));
        placed.push(t);
        y = t.y + t.height + 12;
      }
      if (y - 12 <= limit || vi === variants.length - 1) {
        placed.forEach(add);
        break;
      }
      placed.forEach((o) => o.destroy());
    }
    add(this.add.text(x, d.y + d.h - (IS_PORTRAIT ? 128 : 100), '※ 史実シナリオは演習扱い: 資源・損傷・熟練度は変化しません', textStyle(11, Css.dim)));
    add(
      new UIButton(this, d.x + d.w / 2, d.y + d.h - (IS_PORTRAIT ? 56 : 44), '作戦開始  ▶', () => this.start(sc), {
        variant: 'gold', width: w, height: IS_PORTRAIT ? 76 : 60, fontSize: 20,
      }),
    );
  }

  start(sc: IScenario): void {
    const setup = setupFor(sc, this.side);
    if (!setup || !playableSides(sc, this.nation).includes(this.side)) return;
    const registry = DataLoader.getRegistry(this);
    const data: IBattleInitData = {
      playerFleet: FleetSystem.createFleet('scenario-player', sc.name, setup.player.nation, forceShips(setup.player, registry), 0),
      enemyFleet: FleetSystem.createFleet('scenario-enemy', sc.name, setup.enemy.nation, forceShips(setup.enemy, registry), 0),
      mapKey: sc.map,
      formation: Formation.LineAhead,
      weather: sc.weather,
      time: sc.time,
      scenario: { id: sc.id, side: this.side },
    };
    this.scene.start(SceneKeys.BATTLE, data);
  }
}

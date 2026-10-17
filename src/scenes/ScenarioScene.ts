import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, IS_PORTRAIT } from '@/config/GameConstants';
import { audio } from '@/systems/AudioSystem';
import { DataLoader } from '@/utils/DataLoader';
import { FleetSystem } from '@/systems/FleetSystem';
import { forceShips, setupFor } from '@/systems/ScenarioSystem';
import { TIME_LABEL, WEATHER_LABEL } from '@/systems/WeatherSystem';
import { NATION_INFO } from '@/config/NationInfo';
import { OBJECTIVE_LABEL } from '@/scenes/CampaignMapScene';
import { IScenario } from '@/types/Scenario';
import { IBattleInitData } from '@/types/Scene';
import { Formation } from '@/types/Formation';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, addPanel, drawPanel, makeClickable, UIButton } from '@/ui/components/UIKit';

interface IRect { x: number; y: number; w: number; h: number }

const L = IS_PORTRAIT
  ? { list: { x: 16, y: 150, w: CANVAS_W - 32, h: 320 } as IRect, cols: 2, cardH: 100, detail: { x: 16, y: 486, w: CANVAS_W - 32, h: CANVAS_H - 502 } as IRect }
  : { list: { x: 24, y: 96, w: 380, h: 604 } as IRect, cols: 1, cardH: 110, detail: { x: 420, y: 96, w: 836, h: 604 } as IRect };
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
  private cardFrames: Phaser.GameObjects.Graphics[] = [];
  private detail: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super({ key: SceneKeys.SCENARIO });
  }

  create(): void {
    audio.music('menu');
    this.scenarios = DataLoader.getScenarios(this);
    this.selected = 0;
    this.side = 0;
    this.cardFrames = [];
    this.detail = [];
    addBackdrop(this, 'menu');
    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    new UIButton(this, back.x, back.y, '‹  鎮守府', () => this.scene.start(SceneKeys.HOME), {
      variant: 'secondary', width: back.w, height: back.h, fontSize: 15,
    });
    this.add.text(CANVAS_W / 2 + (IS_PORTRAIT ? 40 : 0), IS_PORTRAIT ? 28 : 26, 'HISTORICAL', eyebrowStyle(12)).setOrigin(0.5);
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 104 : 60, '史実シナリオ', displayStyle(24)).setOrigin(0.5);

    this.scenarios.forEach((sc, i) => {
      const col = i % L.cols;
      const row = Math.floor(i / L.cols);
      const r = { x: L.list.x + col * (CARD_W + GAP), y: L.list.y + row * (L.cardH + GAP), w: CARD_W, h: L.cardH };
      const frame = this.add.graphics();
      this.cardFrames.push(frame);
      const card = this.add.container(r.x, r.y, [
        frame,
        this.add.text(18, 14, sc.date, eyebrowStyle(10, Css.gold)),
        this.add.text(18, IS_PORTRAIT ? 40 : 36, sc.name, displayStyle(20)),
        IS_PORTRAIT
          ? this.add.text(r.w - 16, 14, `${NATION_INFO[sc.forces.A.nation].short} vs ${NATION_INFO[sc.forces.B.nation].short}`, textStyle(12, Css.muted)).setOrigin(1, 0)
          : this.add.text(18, r.h - 30, `${NATION_INFO[sc.forces.A.nation].short} vs ${NATION_INFO[sc.forces.B.nation].short}`, textStyle(12, Css.muted)),
      ]);
      makeClickable(card, r.w, r.h);
      card.on('pointerup', () => {
        this.selected = i;
        this.side = 0;
        this.refresh();
      });
    });
    addPanel(this, L.detail.x, L.detail.y, L.detail.w, L.detail.h, { radius: 24, fillAlpha: 0.6, glow: 0.6 });
    this.refresh();
  }

  private refresh(): void {
    this.cardFrames.forEach((g, i) => {
      g.clear();
      const on = i === this.selected;
      drawPanel(g, 0, 0, CARD_W, L.cardH, { radius: 18, fill: on ? Colors.panelHi : Colors.panel, fillAlpha: on ? 0.9 : 0.5, rimAlpha: on ? 0.85 : 0.2, glow: on ? 1 : 0 });
    });
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

    // Side choice
    const bw = (w - 10) / sc.sides.length;
    sc.sides.forEach((side, i) => {
      add(
        new UIButton(this, x + i * (bw + 10) + bw / 2, y + (IS_PORTRAIT ? 28 : 22), side.label, () => {
          this.side = i;
          this.refresh();
        }, { variant: i === this.side ? 'primary' : 'secondary', width: bw, height: IS_PORTRAIT ? 56 : 44, fontSize: 14 }),
      );
    });
    y += IS_PORTRAIT ? 74 : 60;

    const setup = setupFor(sc, this.side)!;
    const registry = DataLoader.getRegistry(this);
    const names = (ids: string[]): string => ids.map((id) => registry.byId(id)?.name.replace(/\s*\(.*\)\s*$/, '') ?? id).join('・');
    const rows: Array<[string, string]> = [
      ['勝利条件', `${OBJECTIVE_LABEL[setup.side.objective]} — ${setup.side.brief}`],
      ['味方', `${NATION_INFO[setup.player.nation].ja}  ${names(setup.player.ships)}`],
      ['敵', `${NATION_INFO[setup.enemy.nation].ja}  ${names(setup.enemy.ships)}`],
    ];
    for (const [k, v] of rows) {
      add(this.add.text(x, y, k, eyebrowStyle(10, Css.gold)));
      const t = add(this.add.text(x, y + (IS_PORTRAIT ? 24 : 18), v, textStyle(13, Css.text, wrap)));
      y = t.y + t.height + 12;
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
    if (!setup) return;
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

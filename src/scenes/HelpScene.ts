import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, IS_PORTRAIT } from '@/config/GameConstants';
import { CONTROLS } from '@/config/Controls';
import { audio } from '@/systems/AudioSystem';
import { CLASS_JA, CLASS_ORDER } from '@/systems/EncyclopediaSystem';
import { OBJECTIVE_LABEL } from '@/scenes/CampaignMapScene';
import { Objective } from '@/types/Campaign';
import { ShipClass } from '@/types/ShipClass';
import { Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, addPanel, UIButton } from '@/ui/components/UIKit';

const P = IS_PORTRAIT ? { x: 16, y: 210, w: CANVAS_W - 32, h: CANVAS_H - 226 } : { x: 140, y: 150, w: 1000, h: 550 };
const TABS_Y = IS_PORTRAIT ? 166 : 118;

const CLASS_HELP: Record<ShipClass, string> = {
  [ShipClass.Battleship]: '耐久と装甲が最も高く、大口径砲で遠くから撃ち合う艦隊の主力。速力は遅め。',
  [ShipClass.Cruiser]: '砲と魚雷を併せ持つ万能艦。戦艦より速く、駆逐艦より打たれ強い。',
  [ShipClass.Destroyer]: '高速で魚雷が主兵装。多くの艦は爆雷で潜水艦を攻撃できる。打たれ弱い。',
  [ShipClass.Carrier]: '艦載機 (戦闘機・艦爆・艦攻) で遠くの敵を攻撃する。砲戦は苦手で、機体は対空砲火で失われる。',
  [ShipClass.Submarine]: '潜航して魚雷で奇襲する。潜航中は砲弾が当たらず爆雷だけが有効。酸素が尽きると浮上する。',
};

const OBJECTIVE_HELP: Record<Objective, string> = {
  [Objective.Annihilate]: '敵の艦艇をすべて撃沈する。',
  [Objective.Convoy]: '輸送船 3 隻のうち 2 隻以上を東の端まで逃がす。2 隻失うと失敗。',
  [Objective.Bombard]: '島の砲台・港湾・飛行場をすべて砲撃で破壊する。魚雷は陸に届かない。',
  [Objective.SinkTargets]: '指定された敵艦を制限時間内に撃沈する。',
  [Objective.Breakthrough]: '旗艦を制限時間内に目標海域 (金色の円) へ入れる。',
  [Objective.PreventEscape]: '目標艦が脱出海域に入る前に撃沈する。',
  [Objective.Delay]: '制限時間まで敵を目標海域に入れない (撃沈しても勝利)。',
};

type Tab = 'controls' | 'classes' | 'objectives';
const TABS: Array<[Tab, string]> = [['controls', '操作'], ['classes', '艦種'], ['objectives', '作戦目標']];

/** ヘルプ: controls, ship classes and operation objectives at a glance. Every battle also ends with the flagship rule. */
export class HelpScene extends Phaser.Scene {
  private tab: Tab = 'controls';
  private dynamic: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super({ key: SceneKeys.HELP });
  }

  create(): void {
    audio.music('menu');
    this.dynamic = [];
    addBackdrop(this, 'menu');
    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    new UIButton(this, back.x, back.y, '‹  鎮守府', () => this.scene.start(SceneKeys.HOME), {
      variant: 'secondary', width: back.w, height: back.h, fontSize: 15,
    });
    this.add.text(CANVAS_W / 2 + (IS_PORTRAIT ? 40 : 0), IS_PORTRAIT ? 28 : 26, 'HELP', eyebrowStyle(12)).setOrigin(0.5);
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 100 : 60, 'ヘルプ', displayStyle(24)).setOrigin(0.5);
    addPanel(this, P.x, P.y, P.w, P.h, { radius: 24, fillAlpha: 0.6, glow: 0.6 });
    this.refresh();
  }

  private refresh(): void {
    for (const o of this.dynamic) o.destroy();
    this.dynamic = [];
    const bw = (P.w - 16) / TABS.length;
    TABS.forEach(([id, label], i) => {
      this.dynamic.push(
        new UIButton(this, P.x + i * (bw + 8) + bw / 2, TABS_Y, label, () => {
          this.tab = id;
          this.refresh();
        }, { variant: id === this.tab ? 'primary' : 'secondary', width: bw, height: IS_PORTRAIT ? 56 : 44, fontSize: 15 }),
      );
    });
    const rows: Array<[string, string]> =
      this.tab === 'controls'
        ? CONTROLS.map((c) => [c.label, c.text])
        : this.tab === 'classes'
          ? CLASS_ORDER.map((c) => [CLASS_JA[c], CLASS_HELP[c]])
          : [...Object.values(Objective).map((o): [string, string] => [OBJECTIVE_LABEL[o], OBJECTIVE_HELP[o]]), ['共通', '旗艦が撃沈されると、どの作戦でも敗北。']];
    const x = P.x + 28;
    const w = P.w - 56;
    const labelW = IS_PORTRAIT ? 0 : 150;
    let y = P.y + 24;
    for (const [label, text] of rows) {
      const l = this.add.text(x, y, label, eyebrowStyle(IS_PORTRAIT ? 12 : 13, Css.gold));
      const t = this.add.text(x + labelW, IS_PORTRAIT ? y + 24 : y, text, textStyle(IS_PORTRAIT ? 15 : 14, Css.text, {
        wordWrap: { width: w - labelW, useAdvancedWrap: true }, lineSpacing: 4,
      }));
      this.dynamic.push(l, t);
      y = t.y + t.height + (IS_PORTRAIT ? 22 : 16);
    }
  }
}

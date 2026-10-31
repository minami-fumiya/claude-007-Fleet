import Phaser from 'phaser';
import { restartTutorial, TUTORIAL_ENABLED } from '@/systems/TutorialSystem';
import { loadSave, saveSave } from '@/utils/ProgressStore';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, CANVAS_H, IS_PORTRAIT } from '@/config/GameConstants';
import { CONTROLS } from '@/config/Controls';
import { audio } from '@/systems/AudioSystem';
import { CLASS_JA, CLASS_ORDER } from '@/systems/EncyclopediaSystem';
import { OBJECTIVE_LABEL } from '@/scenes/CampaignMapScene';
import { Objective } from '@/types/Campaign';
import { FORMATION_ORDER, FORMATION_RULES } from '@/systems/FormationRules';
import { RANKS } from '@/systems/RankSystem';
import { A_HP_RATIO, B_HP_RATIO, HEAVY_DAMAGE, RANK_MERIT_MUL, RANK_REWARD_MUL, S_HP_RATIO, S_TIME_SHARE, SLOW_BATTLE_SEC } from '@/systems/BattleRank';
import { EVENT_NAME, EventKind, eventHelp } from '@/systems/EventSystem';
import { ShipClass } from '@/types/ShipClass';
import { Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, addPanel, UIButton } from '@/ui/components/UIKit';
import { ScrollList } from '@/ui/components/ScrollList';

const P = IS_PORTRAIT ? { x: 16, y: 240, w: CANVAS_W - 32, h: CANVAS_H - 256 } : { x: 140, y: 150, w: 1000, h: 550 };
const TABS_Y = IS_PORTRAIT ? 166 : 118;

const CLASS_HELP: Record<ShipClass, string> = {
  [ShipClass.Battleship]: '耐久と装甲が最も高く、大口径砲で遠くから撃ち合う艦隊の主力。速力は遅め。',
  [ShipClass.Cruiser]: '砲と魚雷を併せ持つ万能艦。戦艦より速く、駆逐艦より打たれ強い。',
  [ShipClass.Destroyer]: '高速で魚雷が主兵装。多くの艦は爆雷で潜水艦を攻撃できる。打たれ弱い。',
  [ShipClass.Carrier]: '艦載機 (戦闘機・艦爆・艦攻) で遠くの敵を攻撃する。砲戦は苦手で、機体は対空砲火で失われる。航空研究は空母の建造研究の後に進められる。',
  [ShipClass.Submarine]: '潜航して魚雷で奇襲する。潜航中は砲弾が当たらず爆雷だけが有効。酸素が尽きると浮上する。',
};

/** Classes and their sister ships (#85). */
const SISTER_HELP = '同じ級 (例: 金剛型) の艦は性能が同じで、艦名だけが違う。図鑑の各艦に同型艦の一覧がある。';

const OBJECTIVE_HELP: Record<Objective, string> = {
  [Objective.Annihilate]: '敵の艦艇をすべて撃沈する。',
  [Objective.Convoy]: '輸送船 3 隻のうち 2 隻以上を東の端まで逃がす。2 隻失うと失敗。',
  [Objective.Bombard]: '島の砲台・港湾・飛行場をすべて砲撃で破壊する。魚雷は陸に届かない。',
  [Objective.SinkTargets]: '指定された敵艦を制限時間内に撃沈する。',
  [Objective.Breakthrough]: '旗艦を制限時間内に目標海域 (金色の円) へ入れる。',
  [Objective.PreventEscape]: '目標艦が脱出海域に入る前に撃沈する。',
  [Objective.Delay]: '制限時間まで敵を目標海域に入れない (撃沈しても勝利)。',
};

/** The formations (#197, from #61): every one, what it does and the rank that opens it. */
function formationHelp(): Array<[string, string]> {
  return FORMATION_ORDER.map((f) => {
    const r = FORMATION_RULES[f];
    return [r.ja, `${r.summary}${r.minRank > 0 ? `  (${RANKS[r.minRank]?.name ?? ''}から)` : ''}`];
  });
}

/** 評価 S〜D (#295), from BattleRank's own numbers (#316). */
function rankHelp(): Array<[string, string]> {
  const pct = (v: number): string => `${Math.round(v * 100)}%`;
  return [
    ['S', `喪失なし・残り耐久 ${pct(S_HP_RATIO)} 以上・大破 (耐久 ${pct(HEAVY_DAMAGE)} 以下) なし・制限時間の ${Math.round(S_TIME_SHARE * 3)}/3 以内 (制限なしは ${SLOW_BATTLE_SEC} 秒)。初めての S で掃討が開き、報酬艦か艦長が入る`],
    ['A', `喪失なし・残り耐久 ${pct(A_HP_RATIO)} 以上`],
    ['B', `喪失 1 隻まで、または残り耐久 ${pct(B_HP_RATIO)} 以上`],
    ['C', 'それ以外の勝利'],
    ['D', '敗北'],
    ['報酬', `資源 S +${Math.round((RANK_REWARD_MUL.S - 1) * 100)}%・A +${Math.round((RANK_REWARD_MUL.A - 1) * 100)}%、戦功 S +${Math.round((RANK_MERIT_MUL.S - 1) * 100)}%。結果の画面に「S まで: …」と足りない所が出る`],
  ];
}

/** How a battle works beyond the controls (#316). */
const BATTLE_HELP: Array<[string, string]> = [
  ['弾種', '自動・徹甲弾・榴弾。徹甲弾は装甲の厚い艦に、榴弾は薄い艦と火災に強い。切り替えると装填し直す'],
  ['火災・浸水', '榴弾は火災、魚雷は浸水を起こしやすい。燃えている間・浸水している間は耐久が減り続ける'],
  ['大破', '耐久 25% 以下。全艦が大破すると、作戦は進撃できずに終わる。入渠で直す'],
  ['飛行場', '対地攻撃の海域にある。攻撃隊を出してくるので、先に壊すと楽になる'],
  ['超兵器', '超兵器出現のイベント中と、戦域の最後の海域の先にある超兵器海域に現れる巨大艦。主砲・機関・艦橋を壊すと弱る。沈めると設計図の断片を落とす'],
  ['敵の陣形', '敵も陣形を組む。海域の詳細に、予想される陣形が出る'],
  ['消耗品', '艦種ごとに 2 つあり、研究で開く (応急修理・煙幕・機関全開・対空弾幕・索敵)。使える回数と待ち時間がある。敵も 1 回ずつ使う'],
  ['士気', '50 が基準。出撃で下がり、勝つと上がり、時間で戻る。70 以上は回避が上がり装填が速く、30 未満はその逆'],
  ['支援艦隊・友軍', '少佐から、編成 2・3 の艦隊を任務付きで一緒に出せる。決まった海域では、途中で友軍が来援する'],
  ['艦載機', '1 編隊 6 機。各国の最初の機種も開発が要る (最初の空母で戦闘機は無料)。開発していない種類は旧式機で飛ぶ。敵の空母は、その艦の年代の機種を使う'],
  ['地上兵器', '対地攻撃の島には、敵の国の要塞砲・高射砲陣地・魚雷艇基地などが並ぶ。壊すと図鑑の「特殊」に載る'],
  ['基地航空隊', 'その戦域の前進基地に建てると、戦闘の始めの 20 秒は敵の位置が全部分かる。Lv2・Lv3 では攻撃隊 (急降下爆撃機と雷撃機) が 1・2 回来援する'],
  ['泊地修理所', 'その戦域の前進基地に建てると、作戦の途中の戦闘の後に、全艦の耐久が少し戻る (+5/10/15%)'],
  ['艦の固有スキル', '有名な艦は、史実にもとづく固有スキルを持つ。幸運 (被弾を無効に)・不屈 (耐久 30% 以下で装甲が上がる) が働くと艦の上に表示される。改二で 1.5 倍'],
  ['艦隊技術', '艦を集めて改装・育成すると、同じ国・同じ艦種の艦がすべて少し強くなる (図鑑の艦艇タブで確認)'],
  ['実況と字幕', '戦闘の様子を声と字幕で伝える。音量・頻度・字幕は設定の「音」で変えられる。結果の画面の「戦闘ログ」で見返せる'],
];

type Tab = 'controls' | 'classes' | 'formations' | 'objectives' | 'ranks' | 'battle' | 'events';
const TABS: Array<[Tab, string]> = [
  ['controls', '操作'], ['classes', '艦種'], ['formations', '陣形'], ['objectives', '作戦目標'], ['ranks', '評価'], ['battle', '戦闘'], ['events', 'イベント'],
];

/** ヘルプ: controls, ship classes and operation objectives at a glance. Every battle also ends with the flagship rule. */
export class HelpScene extends Phaser.Scene {
  private tab: Tab = 'controls';
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  /** The tab's rows scroll when they are taller than the panel (portrait, the battle tab) */
  private list: ScrollList | null = null;

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
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 100 : 60, 'ヘルプ', displayStyle(24)).setOrigin(0.5);
    // Replays the first-play tutorial from the home port (#90); off until the tutorial is finished.
    const tw = 230;
    if (TUTORIAL_ENABLED) new UIButton(this, CANVAS_W - 20 - tw / 2, back.y, 'チュートリアルをもう一度', () => {
      saveSave(restartTutorial(loadSave()));
      this.registry.remove('tutorial.seen');
      this.scene.start(SceneKeys.HOME);
    }, { variant: 'secondary', width: tw, height: back.h, fontSize: 13 });
    addPanel(this, P.x, P.y, P.w, P.h, { radius: 24, fillAlpha: 0.6, glow: 0.6 });
    this.refresh();
  }

  private refresh(): void {
    for (const o of this.dynamic) o.destroy();
    this.dynamic = [];
    this.list?.destroy();
    this.list = null;
    // Seven tabs (#316): one row in landscape, two in portrait.
    const perRow = IS_PORTRAIT ? 4 : TABS.length;
    const bw = (P.w - 8 * (perRow - 1)) / perRow;
    const th = IS_PORTRAIT ? 44 : 44;
    TABS.forEach(([id, label], i) => {
      const row = Math.floor(i / perRow);
      this.dynamic.push(
        new UIButton(this, P.x + (i % perRow) * (bw + 8) + bw / 2, TABS_Y - (IS_PORTRAIT ? 26 : 0) + row * (th + 8), label, () => {
          this.tab = id;
          this.refresh();
        }, { variant: id === this.tab ? 'primary' : 'secondary', width: bw, height: th, fontSize: IS_PORTRAIT ? 15 : 14 }),
      );
    });
    const rows: Array<[string, string]> =
      this.tab === 'controls'
        ? CONTROLS.map((c) => [c.label, c.text])
        : this.tab === 'classes'
          ? [...CLASS_ORDER.map((c): [string, string] => [CLASS_JA[c], CLASS_HELP[c]]), ['同型艦', SISTER_HELP]]
          : this.tab === 'formations'
            ? formationHelp()
            : this.tab === 'ranks'
              ? rankHelp()
              : this.tab === 'battle'
                ? BATTLE_HELP
                : this.tab === 'events'
                  ? [...(Object.keys(EVENT_NAME) as EventKind[]).map((k): [string, string] => [EVENT_NAME[k], eventHelp(k)]), ['予定', '1 時間ごとに 1 つ開催 (同じものは続かない)。鎮守府の上の「予定」で先の予定を見られる'], ['任務', 'イベントごとに 10 件。その時間だけ進み、時間が変わると消える。6 件達成すると最後の 1 件 (勲章付き) が達成になる']]
                  : [...Object.values(Objective).map((o): [string, string] => [OBJECTIVE_LABEL[o], OBJECTIVE_HELP[o]]), ['共通', '旗艦が撃沈されると、どの作戦でも敗北。']];
    const x = P.x + 28;
    const w = P.w - 56;
    const labelW = IS_PORTRAIT ? 0 : 150;
    const top = P.y + 24;
    const list = new ScrollList(this, { x, y: top, w, h: P.y + P.h - 16 - top });
    this.list = list;
    let y = 0;
    for (const [label, text] of rows) {
      const l = this.add.text(0, y, label, eyebrowStyle(IS_PORTRAIT ? 12 : 13, Css.gold));
      const t = this.add.text(labelW, IS_PORTRAIT ? y + 24 : y, text, textStyle(IS_PORTRAIT ? 15 : 14, Css.text, {
        wordWrap: { width: w - labelW - 12, useAdvancedWrap: true }, lineSpacing: 4,
      }));
      list.add(l).add(t);
      y = t.y + t.height + (IS_PORTRAIT ? 22 : 16);
    }
    list.setContentHeight(y);
  }
}

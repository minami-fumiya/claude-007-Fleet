import Phaser from 'phaser';
import { SceneKeys } from '@/config/SceneKeys';
import { CANVAS_W, IS_PORTRAIT } from '@/config/GameConstants';
import { audio } from '@/systems/AudioSystem';
import { boughtThisHour, buy, canBuy, dailyDeal, priceOf, sell, SELL, SELL_HOURLY, sellKey, SHOP_ENTRIES, shopRefillMs, ShopRefusal } from '@/systems/GoldSystem';
import { holdCap } from '@/systems/FacilitySystem';
import { addResources, formatResources, gainResources, RESOURCE_KEYS, RESOURCE_LABEL } from '@/systems/ResourceSystem';
import { recordLedger } from '@/systems/LedgerSystem';
import { addItems, formatItems, withQuestEvents } from '@/systems/QuestSystem';
import { loadProgress, saveProgress, walletOf } from '@/utils/ProgressStore';
import { Colors, Css, displayStyle, eyebrowStyle, textStyle } from '@/ui/theme';
import { addBackdrop, drawPanel, UIButton } from '@/ui/components/UIKit';
import { ResourceBar } from '@/ui/components/ResourceBar';
import { showScreenHelp } from '@/ui/components/ScreenHelpSheet';
import { IResources } from '@/types/Progression';

const L = IS_PORTRAIT
  ? { bar: { x: 16, y: 150, w: CANVAS_W - 32 }, barCols: 2, info: 290, top: 350, cols: 3, cardH: 128, gap: 12, left: 16, sellY: 1000 }
  : { bar: { x: 24, y: 96, w: CANVAS_W - 48 }, barCols: 4, info: 166, top: 206, cols: 5, cardH: 118, gap: 10, left: 24, sellY: 640 };
const CARD_W = (CANVAS_W - L.left * 2 - L.gap * (L.cols - 1)) / L.cols;

const REFUSAL: Record<Exclude<ShopRefusal, null>, string> = { gold: 'ゴールド不足', limit: '本日分は終了', cap: '保有上限' };

/**
 * ショップ (#183): gold for resources and items, a day's limit of each, one お買い得品 a day; spare resources sell
 * back. Nothing here costs real money.
 */
export class ShopScene extends Phaser.Scene {
  private bar!: ResourceBar;
  private layer: Phaser.GameObjects.GameObject[] = [];
  private status = '';

  constructor() {
    super({ key: SceneKeys.SHOP });
  }

  create(): void {
    showScreenHelp(this);
    audio.music('menu');
    addBackdrop(this, 'menu');
    const back = IS_PORTRAIT ? { x: 100, y: 46, w: 172, h: 60 } : { x: 92, y: 44, w: 136, h: 44 };
    new UIButton(this, back.x, back.y, '‹  鎮守府', () => this.scene.start(SceneKeys.HOME), { variant: 'secondary', width: back.w, height: back.h, fontSize: 15 });
    this.add.text(CANVAS_W / 2, IS_PORTRAIT ? 100 : 60, 'ショップ', displayStyle(24)).setOrigin(0.5);
    this.bar = new ResourceBar(this, L.bar.x, L.bar.y, L.bar.w, L.barCols);
    this.draw();
  }

  private track<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.layer.push(o);
    return o;
  }

  private draw(): void {
    for (const o of this.layer) o.destroy();
    this.layer = [];
    const now = Date.now();
    const p = loadProgress();
    const w = walletOf(p);
    const cap = holdCap(p.facilities);
    this.bar.refresh(p.resources, cap);
    const deal = dailyDeal(now);
    this.track(this.add.text(L.left, L.info, `ゴールド ${w.gold.toLocaleString('en-US')}`, textStyle(20, Css.gold, { fontStyle: 'bold' })));
    this.track(this.add.text(CANVAS_W - L.left, L.info + 4, `本日のお買い得: ${deal.name} 3 割引`, textStyle(12, Css.muted)).setOrigin(1, 0));
    if (this.status) this.track(this.add.text(L.left, L.info + 32, this.status, textStyle(12, Css.success)));
    SHOP_ENTRIES.forEach((e, i) => {
      const x = L.left + (i % L.cols) * (CARD_W + L.gap);
      const y = L.top + Math.floor(i / L.cols) * (L.cardH + L.gap);
      const isDeal = e.id === deal.id;
      this.track(drawPanel(this.add.graphics(), x, y, CARD_W, L.cardH, { radius: 14, fillAlpha: 0.6, rim: isDeal ? Colors.gold : undefined, rimAlpha: isDeal ? 0.8 : 0.2 }));
      this.track(this.add.text(x + 14, y + 10, e.name, textStyle(15, Css.text, { fontStyle: 'bold' })));
      this.track(this.add.text(x + CARD_W - 14, y + 12, e.hourly !== undefined ? `あと ${Math.max(0, e.hourly - boughtThisHour(w, e.id, now))} 回` : '制限なし', textStyle(11, Css.muted)).setOrigin(1, 0));
      const what = e.give ? formatResources(e.give) : formatItems(e.items ?? {});
      this.track(this.add.text(x + 14, y + 34, what, textStyle(12, Css.muted)));
      const price = priceOf(e, now);
      this.track(this.add.text(x + 14, y + 54, `${price} G${isDeal ? ` (通常 ${e.price})` : ''}`, textStyle(13, isDeal ? Css.gold : Css.cyan, { fontStyle: 'bold' })));
      const refusal = canBuy(w, e, p.resources, cap, now);
      this.track(new UIButton(this, x + CARD_W / 2, y + L.cardH - (IS_PORTRAIT ? 24 : 20), refusal ? REFUSAL[refusal] : '買う', () => this.buy(e.id), {
        variant: refusal ? 'secondary' : 'gold', width: CARD_W - 28, height: IS_PORTRAIT ? 36 : 28, fontSize: 13,
      })).setEnabled(refusal === null);
    });
    // 売る: spare resources back to gold, as often as there is enough (#296), below the last row of cards.
    const rows = Math.ceil(SHOP_ENTRIES.length / L.cols);
    const sellY = Math.max(L.sellY, L.top + rows * (L.cardH + L.gap) + (IS_PORTRAIT ? 34 : 26) + 6);
    this.track(this.add.text(L.left, sellY - (IS_PORTRAIT ? 34 : 26), `資源を売る (${SELL.amount.toLocaleString('en-US')} ずつ・各 1 時間 ${SELL_HOURLY} 回)  ·  補充まで ${Math.ceil(shopRefillMs(now) / 60_000)} 分`, eyebrowStyle(11, Css.gold)));
    const bw = (CANVAS_W - L.left * 2 - L.gap * 3) / 4;
    RESOURCE_KEYS.forEach((k, i) => {
      const left = SELL_HOURLY - boughtThisHour(w, sellKey(k), now);
      const enough = p.resources[k] >= SELL.amount && left > 0;
      this.track(new UIButton(this, L.left + i * (bw + L.gap) + bw / 2, sellY + 20, `${RESOURCE_LABEL[k]} → ${SELL.rates[k]} G (${left})`, () => this.sell(k), {
        variant: 'primary', width: bw, height: IS_PORTRAIT ? 48 : 40, fontSize: 13,
      })).setEnabled(enough);
    });
  }

  private buy(id: string): void {
    const now = Date.now();
    const p = loadProgress();
    const entry = SHOP_ENTRIES.find((e) => e.id === id);
    if (!entry) return;
    const r = buy(walletOf(p), entry, p.resources, holdCap(p.facilities), now);
    if (!r) return;
    const g = gainResources(p.resources, r.give, holdCap(p.facilities));
    // Ledger (#137): what the shop gave comes in as its own line.
    const ledger = recordLedger(p.ledger, 'shop', addResources(r.give, g.lost, -1), now);
    saveProgress(withQuestEvents({ ...p, wallet: r.wallet, resources: g.resources, items: addItems(p.items, r.items), ledger }, [['shopBuy', 1]], now));
    this.status = `${entry.name} を買いました (${priceOf(entry, now)} G)`;
    this.draw();
  }

  private sell(kind: keyof IResources): void {
    const now = Date.now();
    const p = loadProgress();
    const r = sell(walletOf(p), kind, p.resources, now);
    if (!r) return;
    const ledger = recordLedger(p.ledger, 'shopSell', { [kind]: SELL.amount }, now);
    saveProgress(withQuestEvents({ ...p, wallet: r.wallet, resources: r.resources, ledger }, [['shopSell', 1]], now));
    this.status = `${RESOURCE_LABEL[kind]} ${SELL.amount.toLocaleString('en-US')} を ${r.gold} G で売りました`;
    this.draw();
  }
}

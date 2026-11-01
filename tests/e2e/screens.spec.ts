import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

/** The last released version's save (tests/fixtures/saves): a release must load it without losing anything. */
const PREVIOUS_SAVE = readFileSync(join(process.cwd(), 'tests', 'fixtures', 'saves', 'save-0.0.32.json'), 'utf8');

/**
 * Screen smoke tests (#101). Each screen is opened straight from `window.game` with a seeded save, then checked for
 * page errors and for visible text running off the canvas sideways (the usual sign of a layout that doesn't fit).
 */

type GameWindow = Window & { game?: { scene: unknown } };

/** A mid-game Japanese save: several ships, some research, cleared areas, a damaged ship. */
const SAVE = {
  version: 5,
  tutorial: { step: 0, done: true },
  current: 'IJN',
  record: { sorties: 5 },
  nations: {
    IJN: {
      resources: { fuel: 5000, ammo: 5000, steel: 5000, bauxite: 2000 },
      regenAt: 0,
      damage: { nagato: 0.4 },
      docks: [],
      research: ['build_cruiser', 'build_heavy_cruiser', 'gunnery_1'],
      ships: ['yamato', 'nagato', 'takao', 'sendai', 'fubuki', 'yukikaze', 'akagi', 'i19'],
      upgrades: {},
      refits: {},
      proficiency: { yamato: 45 },
      captainXp: {},
      campaign: ['p1', 'p2', 'p3'],
      presets: [],
      merit: 300,
      rankFloor: 0,
      docksOwned: 2,
    },
  },
};

const SCREENS = [
  'MainMenuScene', 'HomeScene', 'FleetBuilderScene', 'CampaignMapScene', 'ScenarioScene', 'ArsenalScene',
  'ShipyardScene', 'CustomizationScene', 'EncyclopediaScene', 'RecordScene', 'SettingsScene', 'HelpScene',
  'CaptainScene', 'BaseScene', 'ShopScene', 'ItemScene', 'ExpeditionScene', 'DevelopScene', 'FocusScene', 'DesignScene',
];

/** `lastSeen`: the version whose 更新内容 (#205) counts as read; the default hides the sheet so screens stay clear. */
async function boot(page: Page, layout: string, save: object = SAVE, lastSeen = '99.0.0', settings: object = {}): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?layout=${layout}`);
  await page.waitForFunction(() => (window as GameWindow).game !== undefined, null, { timeout: 60_000 });
  await page.evaluate(([s, seen, extra]) => {
    const data = s as typeof SAVE;
    localStorage.setItem('ww2fleet.progress.v2', JSON.stringify({ ...data, nations: { ...data.nations, IJN: { ...data.nations.IJN, regenAt: Date.now() } } }));
    localStorage.setItem('ww2fleet.settings.v1', JSON.stringify({ ...(extra as object), lastSeenVersion: seen }));
  }, [save, lastSeen, settings] as const);
  await page.reload();
  await page.waitForFunction(() => {
    const g = (window as unknown as { game?: Phaser.Game }).game;
    return g?.scene.getScene('MainMenuScene')?.sys.settings.active === true;
  }, null, { timeout: 60_000 });
  return errors;
}

/** Stops every other running scene and (re)starts `key`. */
async function open(page: Page, key: string, data: object = {}): Promise<void> {
  await page.evaluate(([k, d]) => {
    const g = (window as unknown as { game: Phaser.Game }).game;
    // Starting a running scene restarts it, so only the others are stopped.
    g.scene.getScenes(true).filter((s) => s.scene.key !== k).forEach((s) => s.scene.stop());
    g.scene.start(k as string, d as object);
  }, [key, data] as const);
  await page.waitForFunction((k) => (window as unknown as { game: Phaser.Game }).game.scene.getScene(k)?.sys.settings.active === true, key);
  await page.waitForTimeout(700);
}

/**
 * Visible texts of `key` sticking out of the canvas, as "text (left..right, top..bottom)". Sideways always counts;
 * below the bottom edge counts on screens that don't scroll (the settings once ran off the bottom, 0.0.12). Rows
 * inside masked scrolling lists are skipped.
 */
async function overflowingTexts(page: Page, key: string): Promise<string[]> {
  return page.evaluate((k) => {
    const g = (window as unknown as { game: Phaser.Game }).game;
    const scene = g.scene.getScene(k);
    const w = g.scale.width;
    const h = g.scale.height;
    const scrolls = scene.cameras.main.useBounds;
    const out: string[] = [];
    const visit = (o: Phaser.GameObjects.GameObject, visible: boolean): void => {
      const v = visible && (o as unknown as { visible?: boolean }).visible !== false && ((o as unknown as { alpha?: number }).alpha ?? 1) > 0;
      if ((o as unknown as { mask?: unknown }).mask) return;
      if (o.type === 'Container') {
        (o as Phaser.GameObjects.Container).list.forEach((c) => visit(c, v));
        return;
      }
      const t = o as Phaser.GameObjects.Text;
      if (!v || o.type !== 'Text' || t.text.trim() === '') return;
      const b = t.getBounds();
      const below = !scrolls && t.scrollFactorY !== 0 ? b.bottom > h + 2 : t.scrollFactorY === 0 && b.bottom > h + 2;
      if (b.left < -2 || b.right > w + 2 || below) out.push(`${t.text.replace(/\n/g, ' ')} (${Math.round(b.left)}..${Math.round(b.right)}, ${Math.round(b.top)}..${Math.round(b.bottom)})`);
    };
    scene.children.list.forEach((o) => visit(o, true));
    return out;
  }, key);
}

/**
 * 文字の最小サイズ (#406): texts of `key` drawn smaller than `min` canvas px once every scale on the way is counted
 * (a text squeezed with setScale to fit, inside a scaled container). The theme's own floor (uiFontSize) keeps the
 * nominal sizes up; this catches what a layout shrank afterwards.
 */
async function tinyTexts(page: Page, key: string, min = 12): Promise<string[]> {
  return page.evaluate(({ k, m }) => {
    const scene = (window as unknown as { game: Phaser.Game }).game.scene.getScene(k);
    const out: string[] = [];
    const visit = (o: Phaser.GameObjects.GameObject, scale: number, visible: boolean): void => {
      const v = visible && (o as unknown as { visible?: boolean }).visible !== false && ((o as unknown as { alpha?: number }).alpha ?? 1) > 0;
      const own = (o as unknown as { scaleY?: number }).scaleY ?? 1;
      if (o.type === 'Container') {
        (o as Phaser.GameObjects.Container).list.forEach((c) => visit(c, scale * own, v));
        return;
      }
      const t = o as Phaser.GameObjects.Text;
      if (!v || o.type !== 'Text' || t.text.trim() === '') return;
      const px = parseFloat(String(t.style.fontSize)) * scale * own;
      if (px < m - 0.01) out.push(`${t.text.replace(/\n/g, ' ').slice(0, 30)} (${px.toFixed(1)}px)`);
    };
    scene.children.list.forEach((o) => visit(o, 1, true));
    return out;
  }, { k: key, m: min });
}

/**
 * Wrapped texts of `key` whose second or later line starts with a character a Japanese line may not start with
 * (#248 禁則処理): "。", "、", small kana, "ー", closing brackets; or a line that ends inside a word (#349).
 */
async function badLineStarts(page: Page, key: string): Promise<string[]> {
  return page.evaluate((k) => {
    const scene = (window as unknown as { game: Phaser.Game }).game.scene.getScene(k);
    const banned = '、。・ーっゃゅょッャュョ）」』';
    const out: string[] = [];
    const visit = (o: Phaser.GameObjects.GameObject): void => {
      if (o.type === 'Container') {
        (o as Phaser.GameObjects.Container).list.forEach(visit);
        return;
      }
      const t = o as Phaser.GameObjects.Text;
      if (o.type !== 'Text' || !t.style.wordWrapWidth) return;
      const lines = t.getWrappedText(t.text);
      // Lines break between phrases (#349): not inside a run of hiragana ("上限ま | で") or of kanji ("上 | 限").
      const hira = /[\u3041-\u309f]/;
      const kanji = /[\u4e00-\u9fff]/;
      const particles = 'をがはにでとのへもや';
      lines.forEach((line, i) => {
        if (i === 0 || line.length === 0 || t.text.includes(`\n${line}`)) return;
        const end = lines[i - 1].slice(-1);
        // A space in the text there is a fine place ("大火力章 | 三等").
        const atSpace = t.text.includes(`${end} ${line[0]}`);
        const midWord = !atSpace && ((hira.test(end) && hira.test(line[0]) && !particles.includes(end)) || (kanji.test(end) && kanji.test(line[0])));
        if (banned.includes(line[0]) || midWord) out.push(`${lines[i - 1]} | ${line}`);
      });
    };
    scene.children.list.forEach(visit);
    return out;
  }, key);
}

/**
 * Visible texts that overlap another visible text (#163): "a × b" for each pair crossing by more than a few pixels both
 * ways. Only texts at the same depth count: a sheet over the screen, or content scrolling under a fixed bar, is meant
 * to cover what lies beneath. Masked (scroll list) texts are left out like in overflowingTexts.
 */
async function overlappingTexts(page: Page, key: string): Promise<string[]> {
  return page.evaluate((k) => {
    const g = (window as unknown as { game: Phaser.Game }).game;
    const scene = g.scene.getScene(k);
    // Buttons count as boxes too (#182): a text running under a button's face is hidden even if it misses the label.
    const boxes: Array<{ text: string; b: Phaser.Geom.Rectangle; depth: number; owner: unknown }> = [];
    const visit = (o: Phaser.GameObjects.GameObject, visible: boolean, depth: number, owner: unknown): void => {
      const v = visible && (o as unknown as { visible?: boolean }).visible !== false && ((o as unknown as { alpha?: number }).alpha ?? 1) > 0.05;
      if ((o as unknown as { mask?: unknown }).mask) return;
      if (o.type === 'Container') {
        const c = o as Phaser.GameObjects.Container;
        const label = c.list.find((x) => x.type === 'Text') as Phaser.GameObjects.Text | undefined;
        // The button's face is its hit area (its bounds also take in the glow around it).
        const hit = c.input?.hitArea as Phaser.Geom.Rectangle | undefined;
        if (v && hit && label) {
          const m = c.getWorldTransformMatrix();
          // Container hit areas are measured from the container's top-left (its display origin back from x, y).
          const face = new Phaser.Geom.Rectangle(m.tx + (hit.x - c.displayOriginX) * m.scaleX, m.ty + (hit.y - c.displayOriginY) * m.scaleY, hit.width * m.scaleX, hit.height * m.scaleY);
          boxes.push({ text: `[${label.text.replace(/\n/g, ' ').slice(0, 16)}]`, b: face, depth, owner: c });
        }
        c.list.forEach((x) => visit(x, v, depth, c.input ? c : owner));
        return;
      }
      const t = o as Phaser.GameObjects.Text;
      if (!v || o.type !== 'Text' || t.text.trim() === '') return;
      boxes.push({ text: t.text.replace(/\n/g, ' ').slice(0, 24), b: t.getBounds(), depth, owner });
    };
    scene.children.list.forEach((o) => visit(o, true, (o as unknown as { depth: number }).depth, undefined));
    const out: string[] = [];
    const SLACK = 3;
    boxes.forEach((a, i) => {
      for (const c of boxes.slice(i + 1)) {
        if (c.depth !== a.depth) continue;
        // A button and its own label, or two buttons (they may share a frame), are not a clash.
        if ((a.owner && a.owner === c.owner) || (a.text.startsWith('[') && c.text.startsWith('['))) continue;
        const w = Math.min(a.b.right, c.b.right) - Math.max(a.b.left, c.b.left);
        const h = Math.min(a.b.bottom, c.b.bottom) - Math.max(a.b.top, c.b.top);
        if (w > SLACK && h > SLACK) out.push(`${a.text} × ${c.text}`);
      }
    });
    return out;
  }, key);
}

/**
 * Texts running out of the card they start in (#355): the gold card's "入手" ran past its bottom edge, a research card's
 * conditions over its cost line. A card is a panel drawn by addPanel (it keeps its frame as data); a text belongs to the
 * smallest card holding its top-left corner, on the same layer and scrolling the same way.
 */
async function textsOutOfCards(page: Page, key: string): Promise<string[]> {
  return page.evaluate((k) => {
    const g = (window as unknown as { game: Phaser.Game }).game;
    const scene = g.scene.getScene(k);
    type Frame = { x: number; y: number; w: number; h: number };
    const out: string[] = [];
    // Cards and texts are matched inside one parent (the scene or a container), in that parent's coordinates.
    const check = (list: Phaser.GameObjects.GameObject[]): void => {
      const cards: Array<Frame & { depth: number; sf: number }> = [];
      const texts: Phaser.GameObjects.Text[] = [];
      for (const o of list) {
        const v = (o as unknown as { visible?: boolean }).visible !== false && ((o as unknown as { alpha?: number }).alpha ?? 1) > 0.05;
        if (!v || (o as unknown as { mask?: unknown }).mask) continue;
        if (o.type === 'Container') check((o as Phaser.GameObjects.Container).list);
        const frame = o.type === 'Graphics' ? (o.getData('panel') as Frame | undefined) : undefined;
        if (frame) {
          const gr = o as Phaser.GameObjects.Graphics;
          cards.push({ x: frame.x + gr.x, y: frame.y + gr.y, w: frame.w, h: frame.h, depth: gr.depth, sf: gr.scrollFactorY });
        }
        if (o.type === 'Text' && (o as Phaser.GameObjects.Text).text.trim() !== '') texts.push(o as Phaser.GameObjects.Text);
      }
      for (const t of texts) {
        const left = t.x - t.displayOriginX;
        const top = t.y - t.displayOriginY;
        const right = left + t.displayWidth;
        const bottom = top + t.displayHeight;
        const home = cards
          .filter((c) => c.sf === t.scrollFactorY && c.depth <= t.depth && left + 1 >= c.x && left + 1 <= c.x + c.w && top + 1 >= c.y && top + 1 <= c.y + c.h)
          .sort((a, c) => a.w * a.h - c.w * c.h)[0];
        if (home && (bottom > home.y + home.h + 3 || right > home.x + home.w + 3)) out.push(`${t.text.replace(/\n/g, ' ').slice(0, 24)} (${Math.round(bottom)} > ${Math.round(home.y + home.h)})`);
      }
    };
    check(scene.children.list);
    return out;
  }, key);
}

test.describe('screens', () => {
  test('every menu screen opens without errors or text off the canvas', async ({ page }, info) => {
    // Fourteen screens, each checked for overflow and overlaps.
    test.setTimeout(240_000);
    const layout = info.project.metadata.layout as string;
    const errors = await boot(page, layout);
    for (const key of SCREENS) {
      await open(page, key);
      expect(await overflowingTexts(page, key), `${key} (${layout})`).toEqual([]);
      expect(await overlappingTexts(page, key), `${key} overlaps (${layout})`).toEqual([]);
      expect(await badLineStarts(page, key), `${key} line breaks (${layout})`).toEqual([]);
      expect(await textsOutOfCards(page, key), `${key} out of cards (${layout})`).toEqual([]);
      await page.screenshot({ path: info.outputPath(`${key}.png`) });
    }
    expect(errors).toEqual([]);
  });

  test('the shipyard rank line and the research button never overlap, for every class (#182)', async ({ page }, info) => {
    const layout = info.project.metadata.layout as string;
    const errors = await boot(page, layout, { ...SAVE, version: 7, seenHelp: ['ShipyardScene'] });
    await open(page, 'ShipyardScene');
    for (const cls of ['Destroyer', 'Submarine', 'Cruiser', 'Carrier', 'Battleship']) {
      await page.evaluate((c) => {
        const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('ShipyardScene') as unknown as { shipClass: string; refresh(): void };
        s.shipClass = c;
        s.refresh();
      }, cls);
      expect(await overflowingTexts(page, 'ShipyardScene'), `${cls} (${layout})`).toEqual([]);
      expect(await overlappingTexts(page, 'ShipyardScene'), `${cls} overlaps (${layout})`).toEqual([]);
    }
    await page.screenshot({ path: info.outputPath('shipyard-battleship.png') });
    expect(errors).toEqual([]);
  });

  test('the scenario list pages through the nation\'s battles and a 7-vs-7 one starts from its side (#71 #224)', async ({ page }, info) => {
    const layout = info.project.metadata.layout as string;
    const errors = await boot(page, layout, { ...SAVE, version: 7, seenHelp: ['ScenarioScene'] });
    await open(page, 'ScenarioScene');
    const listed = await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('ScenarioScene') as unknown as {
        scenarios: Array<{ id: string; forces: Record<string, { nation: string }>; sides: Array<{ force: string }> }>; selected: number; side: number; theater: string; page: number; drawList(): void; refresh(): void;
      };
      s.theater = 'pacific';
      s.page = 1;
      s.selected = s.scenarios.findIndex((x) => x.id === 'leyte-gulf');
      const sc = s.scenarios[s.selected];
      s.side = sc.sides.findIndex((d) => sc.forces[d.force].nation === 'IJN');
      s.drawList();
      s.refresh();
      return s.scenarios.length;
    });
    // Only the battles Japan fought in (#224).
    expect(listed).toBe(8);
    expect(await overflowingTexts(page, 'ScenarioScene'), `scenarios (${layout})`).toEqual([]);
    expect(await overlappingTexts(page, 'ScenarioScene'), `scenarios overlaps (${layout})`).toEqual([]);
    await page.screenshot({ path: info.outputPath('scenarios.png') });
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('ScenarioScene') as unknown as { scenarios: unknown[]; selected: number; start(sc: unknown): void };
      s.start(s.scenarios[s.selected]);
    });
    await page.waitForFunction(() => (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene')?.sys.settings.active === true);
    await page.waitForTimeout(2500);
    const sizes = await page.evaluate(() => {
      const b = (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene') as unknown as { escorts: unknown[]; enemies: unknown[] };
      return { mine: b.escorts.length + 1, enemy: b.enemies.length };
    });
    expect(sizes).toEqual({ mine: 7, enemy: 7 });
    await page.screenshot({ path: info.outputPath('scenario-battle.png') });
    expect(errors).toEqual([]);
  });

  test('every scenario and side lists its ships by kind and fits (#196)', async ({ page }, info) => {
    test.setTimeout(240_000);
    const layout = info.project.metadata.layout as string;
    const errors = await boot(page, layout, { ...SAVE, version: 7, seenHelp: ['ScenarioScene'] });
    await open(page, 'ScenarioScene');
    type S = { scenarios: Array<{ id: string; sides: unknown[] }>; selected: number; side: number; theater: string; drawList(): void; refresh(): void; detail: Array<{ type: string; text?: string }> };
    const count = await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('ScenarioScene') as unknown as S).scenarios.length);
    const problems: string[] = [];
    for (let i = 0; i < count; i++) {
      for (let side = 0; side < 2; side++) {
        const text = await page.evaluate(([idx, sd]) => {
          const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('ScenarioScene') as unknown as S;
          s.selected = idx;
          s.side = sd;
          s.refresh();
          return s.detail.filter((o) => o.type === 'Text').map((o) => o.text ?? '').join('|');
        }, [i, side] as const);
        if (!/隻 — /.test(text)) problems.push(`${i}/${side}: no kind headline`);
        const over = [...await overflowingTexts(page, 'ScenarioScene'), ...await overlappingTexts(page, 'ScenarioScene')];
        if (over.length > 0) problems.push(`${i}/${side}: ${over.join(', ')}`);
      }
    }
    await page.screenshot({ path: info.outputPath('scenario-lineup.png') });
    expect(problems, layout).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('a save full of ships, captains and cleared areas still fits every screen (#163)', async ({ page }, info) => {
    // Fourteen screens, each checked for overflow and overlaps.
    test.setTimeout(240_000);
    const layout = info.project.metadata.layout as string;
    const read = (f: string): { ships?: Array<{ id: string; fictional?: boolean }> } => JSON.parse(readFileSync(join(process.cwd(), 'src', 'data', f), 'utf8'));
    const ships = read('ships/ijn.json').ships!.filter((s) => !s.fictional).map((s) => s.id);
    const captains = (JSON.parse(readFileSync(join(process.cwd(), 'src', 'data', 'captains.json'), 'utf8')) as { captains?: Array<{ id: string; nation: string }> } | Array<{ id: string; nation: string }>);
    const ijnCaptains = (Array.isArray(captains) ? captains : captains.captains ?? []).filter((c) => c.nation === 'IJN').map((c) => c.id);
    const campaign = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'm1', 'm2', 'm3', 'm4'];
    const heavy = {
      ...SAVE,
      version: 7,
      seenHelp: SCREENS,
      nations: { IJN: { ...SAVE.nations.IJN, ships, captains: ijnCaptains, captainXp: Object.fromEntries(ijnCaptains.map((id, i) => [id, i * 40_000])), campaign, merit: 20_000, proficiency: Object.fromEntries(ships.map((id) => [id, 80])) } },
    };
    const errors = await boot(page, layout, heavy);
    for (const key of SCREENS) {
      await open(page, key);
      expect.soft(await overflowingTexts(page, key), `${key} (${layout})`).toEqual([]);
      expect(await overlappingTexts(page, key), `${key} overlaps (${layout})`).toEqual([]);
    }
    expect(errors).toEqual([]);
  });

  test('30 captains: the list filters and sorts, the fleet picks a captain from the best fits (#209 #185)', async ({ page }, info) => {
    const layout = info.project.metadata.layout as string;
    const ijn = (JSON.parse(readFileSync(join(process.cwd(), 'src', 'data', 'captains.json'), 'utf8')) as { captains: Array<{ id: string; nation: string }> })
      .captains.filter((c) => c.nation === 'IJN').map((c) => c.id);
    const save = { ...SAVE, version: 15, seenHelp: ['CaptainScene', 'FleetBuilderScene'], nations: { IJN: { ...SAVE.nations.IJN, captains: ijn } } };
    const errors = await boot(page, layout, save);
    await open(page, 'CaptainScene');
    type Cap = { openFilter(): void; filter: string; sort: string; refresh(): void };
    const cap = (): Promise<void> => page.waitForTimeout(200);
    expect(await overflowingTexts(page, 'CaptainScene'), `captains (${layout})`).toEqual([]);
    await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('CaptainScene') as unknown as Cap).openFilter());
    await cap();
    expect(await overflowingTexts(page, 'CaptainScene'), `filter sheet (${layout})`).toEqual([]);
    await page.screenshot({ path: info.outputPath('captain-filter.png') });
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('CaptainScene') as unknown as Cap & { closeSheet(): void };
      s.closeSheet();
      s.filter = 'apt:Destroyer';
      s.sort = 'level';
      s.refresh();
    });
    await cap();
    expect(await overflowingTexts(page, 'CaptainScene'), `filtered (${layout})`).toEqual([]);
    expect(await overlappingTexts(page, 'CaptainScene'), `filtered overlaps (${layout})`).toEqual([]);
    await page.screenshot({ path: info.outputPath('captain-filtered.png') });
    // The fleet builder: a sheet of the best fits instead of cycling through all 30.
    await open(page, 'FleetBuilderScene');
    const picked = await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('FleetBuilderScene') as unknown as {
        ships: Array<{ id: string }>; openPicker(i: number): void; pickShip(s: { id: string }): void; openCaptainPicker(i: number): void;
      };
      s.openPicker(0);
      s.pickShip(s.ships.find((x) => x.id === 'fubuki')!);
      s.openCaptainPicker(0);
      return true;
    });
    expect(picked).toBe(true);
    await cap();
    expect(await overflowingTexts(page, 'FleetBuilderScene'), `captain picker (${layout})`).toEqual([]);
    await page.screenshot({ path: info.outputPath('fleet-captain-picker.png') });
    expect(errors).toEqual([]);
  });

  test('the last remodel stage takes a direction: 改三甲・乙・丙 (#86)', async ({ page }, info) => {
    const layout = info.project.metadata.layout as string;
    const save = {
      ...SAVE, version: 16, seenHelp: ['CustomizationScene'],
      nations: { IJN: { ...SAVE.nations.IJN, refits: { fubuki: 2 }, proficiency: { fubuki: 100 }, resources: { fuel: 9000, ammo: 9000, steel: 9000, bauxite: 4000 } } },
    };
    const errors = await boot(page, layout, save);
    await open(page, 'CustomizationScene', { returnTo: 'HomeScene', scope: 'all', shipId: 'fubuki' });
    type C = { openBranches(): void; chooseBranch(id: string): void };
    await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('CustomizationScene') as unknown as C).openBranches());
    await page.waitForTimeout(300);
    expect(await overflowingTexts(page, 'CustomizationScene'), `branches (${layout})`).toEqual([]);
    await page.screenshot({ path: info.outputPath('refit-branches.png') });
    await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('CustomizationScene') as unknown as C).chooseBranch('asw'));
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ww2fleet.progress.v2')!).nations.IJN as { refits: Record<string, number>; refitBranches: Record<string, string> });
    expect(stored.refits.fubuki).toBe(3);
    expect(stored.refitBranches.fubuki).toBe('asw');
    await page.waitForTimeout(300);
    expect(await overflowingTexts(page, 'CustomizationScene'), `after (${layout})`).toEqual([]);
    await page.screenshot({ path: info.outputPath('refit-branched.png') });
    expect(errors).toEqual([]);
  });

  test('the strategic map shows the training areas and the Black Sea (#202)', async ({ page }, info) => {
    const layout = info.project.metadata.layout as string;
    const errors = await boot(page, layout, { ...SAVE, version: 16, seenHelp: ['CampaignMapScene'] });
    await open(page, 'CampaignMapScene');
    expect(await overflowingTexts(page, 'CampaignMapScene'), `pacific (${layout})`).toEqual([]);
    expect(await overlappingTexts(page, 'CampaignMapScene'), `pacific overlaps (${layout})`).toEqual([]);
    await page.screenshot({ path: info.outputPath('map-training.png') });
    // A Soviet admiral with every base open: the Baltic and the Black Sea, then the seas of 0.0.35 (#250).
    const su = { ...SAVE, version: 16, current: 'SU', seenHelp: ['CampaignMapScene'], nations: { SU: { ...SAVE.nations.IJN, ships: ['gnevny'], campaign: ['b1'], basesOpen: ['su_light', 'su_cruiser', 'su_heavy'] } } };
    await page.evaluate((save) => localStorage.setItem('ww2fleet.progress.v2', JSON.stringify(save)), su);
    await page.reload();
    await page.waitForFunction(() => (window as unknown as { game?: Phaser.Game }).game?.scene.getScenes(true).length);
    await open(page, 'CampaignMapScene');
    const tabs = await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('CampaignMapScene') as unknown as { theaters: Array<{ id: string }>; selectTheater?(id: string): void };
      return s.theaters.map((t) => t.id);
    });
    // The Soviet order (#293): the Baltic first, then the seas its bases open one by one.
    expect(tabs).toEqual(['baltic', 'north_pacific', 'blacksea', 'arctic']);
    expect(await overflowingTexts(page, 'CampaignMapScene'), `SU (${layout})`).toEqual([]);
    await page.screenshot({ path: info.outputPath('map-su.png') });
    // Only Kronstadt open (#282): the seas it reaches; the rest wait for their bases.
    await page.evaluate((save) => localStorage.setItem('ww2fleet.progress.v2', JSON.stringify(save)), { ...su, nations: { SU: { ...su.nations.SU, basesOpen: [] } } });
    await page.reload();
    await page.waitForFunction(() => (window as unknown as { game?: Phaser.Game }).game?.scene.getScenes(true).length);
    await open(page, 'CampaignMapScene');
    const near = await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('CampaignMapScene') as unknown as { theaters: Array<{ id: string }> }).theaters.map((t) => t.id));
    expect(near).toEqual(['baltic']);
    expect(await overflowingTexts(page, 'CampaignMapScene'), `SU first base (${layout})`).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('自動編成 fills the fleet, the sheet and the footer fit, the picker sorts by morale (#357)', async ({ page }, info) => {
    const layout = info.project.metadata.layout as string;
    const errors = await boot(page, layout, { ...SAVE, seenHelp: ['FleetBuilderScene'] });
    await open(page, 'FleetBuilderScene');
    await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('FleetBuilderScene') as unknown as { openAutoSheet(): void }).openAutoSheet());
    await page.waitForTimeout(300);
    expect(await overflowingTexts(page, 'FleetBuilderScene'), `auto sheet (${layout})`).toEqual([]);
    await page.screenshot({ path: info.outputPath('auto-sheet.png') });
    const filled = await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('FleetBuilderScene') as unknown as { autoShips(c: boolean): void; closeDetail(): void; slots: Array<{ id: string } | null>; captainIds: Array<string | null> };
      s.closeDetail();
      s.autoShips(true);
      return { ships: s.slots.filter((x) => x).length, captains: s.captainIds.filter((x) => x).length };
    });
    expect(filled.ships).toBeGreaterThan(0);
    await page.waitForTimeout(300);
    expect(await overflowingTexts(page, 'FleetBuilderScene'), `auto fleet (${layout})`).toEqual([]);
    expect(await overlappingTexts(page, 'FleetBuilderScene'), `auto fleet overlaps (${layout})`).toEqual([]);
    await page.screenshot({ path: info.outputPath('auto-fleet.png') });
    // The picker with the morale sort: the sort row (five buttons now) fits.
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('FleetBuilderScene') as unknown as { sort: string; openPicker(i: number): void };
      s.sort = 'Morale';
      s.openPicker(1);
    });
    await page.waitForTimeout(300);
    expect(await overflowingTexts(page, 'FleetBuilderScene'), `picker (${layout})`).toEqual([]);
    expect(await overlappingTexts(page, 'FleetBuilderScene'), `picker overlaps (${layout})`).toEqual([]);
    await page.screenshot({ path: info.outputPath('picker-morale.png') });
    expect(errors).toEqual([]);
  });

  test('the fleet power breakdown opens from the footer and fits (#342)', async ({ page }, info) => {
    const layout = info.project.metadata.layout as string;
    const errors = await boot(page, layout);
    await open(page, 'FleetBuilderScene');
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('FleetBuilderScene') as unknown as {
        ships: Array<{ id: string }>; openPicker(i: number): void; pickShip(s: { id: string }): void; openPowerDetail(): void;
      };
      s.openPicker(0);
      s.pickShip(s.ships.find((x) => x.id === 'yamato')!);
      s.openPowerDetail();
    });
    await page.waitForTimeout(300);
    expect(await overflowingTexts(page, 'FleetBuilderScene'), `power detail (${layout})`).toEqual([]);
    await page.screenshot({ path: info.outputPath('power-detail.png') });
    expect(errors).toEqual([]);
  });

  test('a sortie: pick ships, deploy, pause and resume the battle', async ({ page }, info) => {
    const errors = await boot(page, info.project.metadata.layout as string);
    await open(page, 'FleetBuilderScene');
    // The slot picker (#77): one ship per slot, never the same ship twice (#76).
    const fleet = await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('FleetBuilderScene') as unknown as {
        ships: Array<{ id: string }>; slots: Array<{ id: string } | null>;
        openPicker(i: number): void; pickShip(s: { id: string }): void; refresh(): void; moveUp(i: number): void;
      };
      const pick = (slot: number, id: string): void => { s.openPicker(slot); s.pickShip(s.ships.find((x) => x.id === id)!); };
      pick(0, 'yamato');
      pick(1, 'fubuki');
      // Picking a ship already in the fleet swaps the two slots (#147).
      pick(1, 'yamato');
      const swapped = s.slots.map((x) => x?.id ?? null);
      // ▲ moves a ship one slot up.
      s.moveUp(1);
      return { swapped, after: s.slots.map((x) => x?.id ?? null) };
    });
    expect(fleet.swapped.slice(0, 2)).toEqual(['fubuki', 'yamato']);
    expect(fleet.after.slice(0, 2)).toEqual(['yamato', 'fubuki']);
    await page.screenshot({ path: info.outputPath('builder.png') });
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('FleetBuilderScene') as unknown as { startBattle(): void };
      s.startBattle();
    });
    await page.waitForFunction(() => (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene')?.sys.settings.active === true);
    await page.waitForTimeout(2500);
    // Pause (#79): the battle clock stops while paused.
    const paused = await page.evaluate(async () => {
      const b = (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene') as unknown as { setPaused(p: boolean): void; battleNow(): number };
      b.setPaused(true);
      const before = b.battleNow();
      await new Promise((r) => setTimeout(r, 600));
      const after = b.battleNow();
      b.setPaused(false);
      return after - before;
    });
    expect(paused).toBe(0);
    // The pause sheet shows the objective and progress (#189), inside the sheet and above its buttons.
    const sheet = await page.evaluate(() => {
      const b = (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene') as unknown as {
        setPaused(p: boolean): void; pauseLayer: Phaser.GameObjects.GameObject[];
      };
      b.setPaused(true);
      const info = b.pauseLayer.find((o) => o.type === 'Text' && (o as Phaser.GameObjects.Text).text.startsWith('作戦目標')) as Phaser.GameObjects.Text;
      const buttons = b.pauseLayer.filter((o) => o.type === 'Container') as Phaser.GameObjects.Container[];
      const r = info.getBounds();
      return { text: info.text, bottom: r.bottom, firstButtonTop: Math.min(...buttons.map((c) => c.y - c.height / 2)) };
    });
    await page.screenshot({ path: info.outputPath('battle-paused.png') });
    expect(sheet.text).toContain('経過');
    expect(sheet.text).toContain('敵艦  撃沈');
    expect(sheet.bottom).toBeLessThan(sheet.firstButtonTop);
    await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene') as unknown as { setPaused(p: boolean): void }).setPaused(false));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: info.outputPath('battle.png') });
    expect(errors).toEqual([]);
  });

  test('the 図鑑 and the 改装 screen open each other on the same ship (#178)', async ({ page }, info) => {
    const errors = await boot(page, info.project.metadata.layout as string);
    type G = { game: Phaser.Game };
    const shipId = await page.evaluate(() => JSON.parse(localStorage.getItem('ww2fleet.progress.v2')!).nations.IJN.ships.at(-1) as string);
    await open(page, 'EncyclopediaScene', { tab: 'ships', id: shipId });
    expect(await page.evaluate(() => ((window as unknown as G).game.scene.getScene('EncyclopediaScene') as unknown as { selectedId: string }).selectedId)).toBe(shipId);
    expect(await overflowingTexts(page, 'EncyclopediaScene')).toEqual([]);
    expect(await overlappingTexts(page, 'EncyclopediaScene')).toEqual([]);
    await page.screenshot({ path: info.outputPath('encyclopedia-ship.png') });
    const press = (key: string, label: string): Promise<void> => page.evaluate(([k, l]) => {
      const scene = (window as unknown as G).game.scene.getScene(k);
      const btn = scene.children.list.find((o) => o.type === 'Container' && (o as Phaser.GameObjects.Container).list.some((c) => (c as Phaser.GameObjects.Text).text?.startsWith(l)));
      btn!.emit('pointerdown');
      btn!.emit('pointerup');
    }, [key, label] as const);
    await press('EncyclopediaScene', '改装・改造');
    await page.waitForFunction(() => (window as unknown as G).game.scene.getScene('CustomizationScene')?.sys.settings.active === true);
    await page.waitForTimeout(500);
    const refit = await page.evaluate(() => {
      const s = (window as unknown as G).game.scene.getScene('CustomizationScene') as unknown as { ships: Array<{ id: string }>; selected: number };
      return s.ships[s.selected].id;
    });
    expect(refit).toBe(shipId);
    await page.screenshot({ path: info.outputPath('refit-from-encyclopedia.png') });
    await press('CustomizationScene', '図鑑');
    await page.waitForFunction(() => (window as unknown as G).game.scene.getScene('EncyclopediaScene')?.sys.settings.active === true);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => ((window as unknown as G).game.scene.getScene('EncyclopediaScene') as unknown as { selectedId: string }).selectedId)).toBe(shipId);
    expect(errors).toEqual([]);
  });

  test('the captain screen tells how captains join, without naming who is next (#179 #215)', async ({ page }, info) => {
    const errors = await boot(page, info.project.metadata.layout as string, { ...SAVE, version: 7, seenHelp: ['CaptainScene'] });
    await open(page, 'CaptainScene');
    await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('CaptainScene') as unknown as { openRecruitInfo(): void }).openRecruitInfo());
    await page.waitForTimeout(300);
    await page.screenshot({ path: info.outputPath('captain-recruits.png') });
    expect(await overflowingTexts(page, 'CaptainScene')).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('help lists every formation, and the title copy fits (#197)', async ({ page }, info) => {
    const errors = await boot(page, info.project.metadata.layout as string, { ...SAVE, version: 7, seenHelp: ['HelpScene'] });
    expect(await overflowingTexts(page, 'MainMenuScene')).toEqual([]);
    // The title (#198): the sea moves, the main button names the nation and rank to go back to, nothing overlaps.
    expect(await overlappingTexts(page, 'MainMenuScene'), 'title overlaps').toEqual([]);
    const title = await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('MainMenuScene');
      const texts: string[] = [];
      const visit = (o: Phaser.GameObjects.GameObject): void => {
        if (o.type === 'Text') texts.push((o as Phaser.GameObjects.Text).text);
        if (o.type === 'Container') (o as Phaser.GameObjects.Container).list.forEach(visit);
      };
      s.children.list.forEach(visit);
      return texts;
    });
    expect(title.some((t) => /^日本 · .+ で続ける$/.test(t))).toBe(true);
    expect(title).toContain('SEVEN  SEAS  FLEET');
    await page.waitForTimeout(1800);
    await page.screenshot({ path: info.outputPath('title.png') });
    await open(page, 'HelpScene');
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('HelpScene') as unknown as { tab: string; refresh(): void };
      s.tab = 'formations';
      s.refresh();
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: info.outputPath('help-formations.png') });
    expect(await overflowingTexts(page, 'HelpScene')).toEqual([]);
    expect(await overlappingTexts(page, 'HelpScene')).toEqual([]);
    // The tabs added in 0.0.40 (#316): ranks, battle and events fit too.
    for (const tab of ['ranks', 'battle', 'events']) {
      await page.evaluate((t) => {
        const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('HelpScene') as unknown as { tab: string; refresh(): void };
        s.tab = t;
        s.refresh();
      }, tab);
      await page.waitForTimeout(200);
      await page.screenshot({ path: info.outputPath(`help-${tab}.png`) });
      expect(await overflowingTexts(page, 'HelpScene'), tab).toEqual([]);
      expect(await overlappingTexts(page, 'HelpScene'), tab).toEqual([]);
    }
    expect(errors).toEqual([]);
  });

  test('the name search opens the game\'s own box, suggests names and filters the list (#308)', async ({ page }, info) => {
    const errors = await boot(page, info.project.metadata.layout as string, { ...SAVE, seenHelp: SCREENS });
    await open(page, 'FleetBuilderScene');
    // The box the list's 名前で検索 opens, with names to suggest.
    await page.evaluate(() => {
      void import('/src/ui/components/FilterBar.ts').then((m) => m.askShipName('', ['吹雪', '長門', '金剛']).then((q: string | null) => {
        (window as unknown as { searched?: string | null }).searched = q;
      }));
    });
    const box = page.locator('[data-role=text-input]');
    await box.waitFor();
    await box.fill('吹');
    await expect(page.locator('#text-input-sheet button', { hasText: '吹雪' })).toBeVisible();
    await page.screenshot({ path: info.outputPath('search-box.png') });
    await page.locator('#text-input-sheet button', { hasText: '吹雪' }).click();
    await page.waitForFunction(() => (window as unknown as { searched?: string | null }).searched !== undefined);
    expect(await page.evaluate(() => (window as unknown as { searched?: string | null }).searched)).toBe('吹雪');
    await expect(page.locator('#text-input-sheet')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('a 艦長教本 goes to the captain the player picks, and traits show their progress (#199)', async ({ page }, info) => {
    const save = { ...SAVE, version: 13, seenHelp: ['CaptainScene'], nations: { IJN: { ...SAVE.nations.IJN, captains: ['ijn_sakai', 'ijn_murase'], items: { fastRepair: 0, fastBuild: 0, captainBook: 1 } } } };
    const errors = await boot(page, info.project.metadata.layout as string, save);
    await open(page, 'CaptainScene');
    await page.screenshot({ path: info.outputPath('captain-book.png') });
    expect(await overflowingTexts(page, 'CaptainScene')).toEqual([]);
    expect(await overlappingTexts(page, 'CaptainScene')).toEqual([]);
    const r = await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('CaptainScene') as unknown as {
        selectedId: string; useBook(c: { id: string; name: string }): void; children: { list: Array<{ type: string; text?: string }> };
      };
      const xp = (): number => JSON.parse(localStorage.getItem('ww2fleet.progress.v2')!).nations.IJN.captainXp[s.selectedId] ?? 0;
      const traits = s.children.list.some((o) => o.type === 'Text' && /夜戦巧者\s+\d+ \/ 3/.test(o.text ?? ''));
      const before = xp();
      s.useBook({ id: s.selectedId, name: '' });
      return { gained: xp() - before, books: JSON.parse(localStorage.getItem('ww2fleet.progress.v2')!).nations.IJN.items.captainBook, traits };
    });
    expect(r).toEqual({ gained: 1000, books: 0, traits: true });
    expect(errors).toEqual([]);
  });

  test('a new version shows its 更新内容 on the title once (#205)', async ({ page }, info) => {
    const layout = info.project.metadata.layout as string;
    const errors = await boot(page, layout, SAVE, '0.0.20-alpha');
    type M = { changesLayer: unknown[]; children: { list: Array<{ type: string; list?: Array<{ text?: string }>; emit(e: string): void }> } };
    const shown = await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('MainMenuScene') as unknown as M).changesLayer.length);
    expect(shown).toBeGreaterThan(0);
    await page.screenshot({ path: info.outputPath('changes.png') });
    expect(await overflowingTexts(page, 'MainMenuScene')).toEqual([]);
    // 閉じる marks the version seen; the next visit shows nothing.
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('MainMenuScene') as unknown as M;
      const close = s.children.list.find((o) => o.type === 'Container' && (o.list ?? []).some((c) => c.text === '閉じる'))!;
      close.emit('pointerdown');
      close.emit('pointerup');
    });
    const seen = await page.evaluate(() => JSON.parse(localStorage.getItem('ww2fleet.settings.v1')!).lastSeenVersion as string);
    expect(seen).toMatch(/^0\.0\.\d+-alpha/);
    await page.reload();
    await page.waitForFunction(() => (window as unknown as { game?: Phaser.Game }).game?.scene.getScene('MainMenuScene')?.sys.settings.active === true);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('MainMenuScene') as unknown as M).changesLayer.length)).toBe(0);
    expect(errors).toEqual([]);
  });

  test("today's and tomorrow's event schedule opens from the home banner and fits (#218)", async ({ page }, info) => {
    const errors = await boot(page, info.project.metadata.layout as string, { ...SAVE, version: 7, seenHelp: ['HomeScene'] });
    await open(page, 'HomeScene');
    for (const ahead of [0, 1]) {
      await page.evaluate((a) => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('HomeScene') as unknown as { openEventSchedule(n: number): void }).openEventSchedule(a), ahead);
      await page.waitForTimeout(300);
      await page.screenshot({ path: info.outputPath(`events-${ahead}.png`) });
      expect(await overflowingTexts(page, 'HomeScene'), `day +${ahead}`).toEqual([]);
    }
    expect(errors).toEqual([]);
  });

  test('the strategic map opens the base screen, whose back button returns to the map (#220)', async ({ page }, info) => {
    const errors = await boot(page, info.project.metadata.layout as string, { ...SAVE, version: 7, seenHelp: ['CampaignMapScene', 'BaseScene'] });
    await open(page, 'CampaignMapScene');
    type G = { game: Phaser.Game };
    const press = (key: string, label: string): Promise<void> => page.evaluate(([k, l]) => {
      const scene = (window as unknown as G).game.scene.getScene(k);
      const btn = scene.children.list.find((o) => o.type === 'Container' && (o as Phaser.GameObjects.Container).list.some((c) => (c as Phaser.GameObjects.Text).text?.includes(l)))!;
      btn.emit('pointerdown');
      btn.emit('pointerup');
    }, [key, label] as const);
    await press('CampaignMapScene', '軍港');
    await page.waitForFunction(() => (window as unknown as G).game.scene.getScene('BaseScene')?.sys.settings.active === true);
    await page.waitForTimeout(400);
    await page.screenshot({ path: info.outputPath('map-to-base.png') });
    await press('BaseScene', '戦略地図');
    await page.waitForFunction(() => (window as unknown as G).game.scene.getScene('CampaignMapScene')?.sys.settings.active === true);
    expect(errors).toEqual([]);
  });

  test('編成 from the menu moves on to 作戦 or 演習 instead of a sortie (#109)', async ({ page }, info) => {
    const errors = await boot(page, info.project.metadata.layout as string);
    await open(page, 'FleetBuilderScene', { organize: true });
    await page.screenshot({ path: info.outputPath('organize.png') });
    const organize = await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('FleetBuilderScene') as unknown as { organizeOnly: boolean; startBtn: { list: Array<{ text?: string }> } };
      return { organize: s.organizeOnly, label: s.startBtn.list.map((o) => o.text).filter(Boolean).join('') };
    });
    expect(organize).toEqual({ organize: true, label: '作戦へ  ›' });
    expect(errors).toEqual([]);
  });

  test('a new save plays without a tutorial (postponed to the end of the alpha, #90)', async ({ page }, info) => {
    const fresh = { ...SAVE, tutorial: { step: 0, done: false }, nations: { IJN: { ...SAVE.nations.IJN, merit: 0, ships: ['fubuki'], campaign: [] } } };
    const errors = await boot(page, info.project.metadata.layout as string, fresh);
    await open(page, 'HomeScene');
    expect(await page.evaluate(() => (window as unknown as { game: Phaser.Game }).game.registry.get('tutorial.seen'))).toBeUndefined();
    expect(errors).toEqual([]);
  });

  test("the previous release's save loads with its fleet (CLAUDE.md: セーブデータを消さない)", async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/?layout=${info.project.metadata.layout as string}`);
    await page.waitForFunction(() => (window as GameWindow).game !== undefined, null, { timeout: 60_000 });
    await page.evaluate((raw) => { localStorage.clear(); localStorage.setItem('ww2fleet.progress.v2', raw); }, PREVIOUS_SAVE);
    await page.reload();
    await page.waitForFunction(() => (window as unknown as { game?: Phaser.Game }).game?.scene.getScene('MainMenuScene')?.sys.settings.active === true, null, { timeout: 60_000 });
    await open(page, 'HomeScene');
    const stored = await page.evaluate(() => {
      const save = JSON.parse(localStorage.getItem('ww2fleet.progress.v2') ?? '{}') as { version?: number; nations?: Record<string, { ships: string[] }> };
      const backups = JSON.parse(localStorage.getItem('ww2fleet.progress.backups') ?? '[]') as Array<{ reason: string }>;
      return { version: save.version ?? 0, ships: save.nations?.IJN?.ships ?? [], backups: backups.map((b) => b.reason) };
    });
    const before = (JSON.parse(PREVIOUS_SAVE) as { nations: { IJN: { ships: string[] } } }).nations.IJN.ships;
    expect(stored.ships).toEqual(expect.arrayContaining(before));
    // An older format is backed up before it is migrated; the same format is loaded as is.
    if ((JSON.parse(PREVIOUS_SAVE) as { version: number }).version < stored.version) expect(stored.backups).toContain('migration');
    await page.screenshot({ path: info.outputPath('previous-save-home.png') });
    expect(errors).toEqual([]);
  });

  test('the encyclopedia shows every tab, owned-only and everything (#43 #44 #91)', async ({ page }, info) => {
    const errors = await boot(page, info.project.metadata.layout as string);
    await open(page, 'EncyclopediaScene');
    for (const tab of ['ships', 'captains', 'aircraft', 'equipment', 'ground', 'music']) {
      for (const ownedOnly of [true, false]) {
        await page.evaluate(([t, o]) => {
          const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('EncyclopediaScene') as unknown as { tab: string; ownedOnly: boolean; selectedId: string; refresh(): void };
          s.tab = t as string;
          s.ownedOnly = o as boolean;
          s.selectedId = '';
          s.refresh();
        }, [tab, ownedOnly] as const);
        expect(await overflowingTexts(page, 'EncyclopediaScene'), `${tab} ${ownedOnly}`).toEqual([]);
      }
      await page.screenshot({ path: info.outputPath(`encyclopedia-${tab}.png`) });
    }
    expect(errors).toEqual([]);
  });

  test('軍港と基地 (0.0.50): the forward bases tab, a base with facilities and a locked one fit (#373)', async ({ page }, info) => {
    const layout = info.project.metadata.layout as string;
    const save = {
      ...SAVE, version: 23, seenHelp: ['HomeScene', 'BaseScene'],
      nations: { IJN: { ...SAVE.nations.IJN, merit: 900, rankFloor: 8, campaign: ['p1', 'p2', 'p3', 'np1', 'np2', 'np3'], basesOpen: ['ijn_light', 'ijn_fb_north_pacific'], baseWork: null, facilities: { ijn_fb_north_pacific: { supply: 2, baseAir: 1 } }, facilityJobs: [] } },
    };
    const errors = await boot(page, layout, save);
    await open(page, 'BaseScene');
    for (const id of ['ijn_fb_north_pacific', 'ijn_fb_mediterranean']) {
      await page.evaluate((b) => {
        const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('BaseScene') as unknown as { tab: string; selectedId: string; refresh(): void };
        s.tab = 'forward';
        s.selectedId = b;
        s.refresh();
      }, id);
      await page.waitForTimeout(200);
      expect(await overflowingTexts(page, 'BaseScene'), `${id} (${layout})`).toEqual([]);
      expect(await overlappingTexts(page, 'BaseScene'), `${id} overlaps (${layout})`).toEqual([]);
      await page.screenshot({ path: info.outputPath(`forward-${id}.png`) });
    }
    expect(errors).toEqual([]);
  });

  test('home: menu tabs, the base picker and first-visit help (#61 #88)', async ({ page }, info) => {
    const layout = info.project.metadata.layout as string;
    const errors = await boot(page, layout, { ...SAVE, version: 7, seenHelp: [] });
    await open(page, 'HomeScene');
    // A screen not seen yet explains itself once.
    expect(await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('HomeScene');
      return s.children.list.some((o) => (o as Phaser.GameObjects.Text).text === 'はじめての画面');
    })).toBe(true);
    await page.screenshot({ path: info.outputPath('home-help.png') });
    for (const tab of ['sortie', 'fleet', 'arsenal', 'record', 'other']) {
      await page.evaluate((t) => {
        const g = (window as unknown as { game: Phaser.Game }).game;
        g.registry.set('home.tab', t);
        (g.scene.getScene('HomeScene') as unknown as { buildMenu(): void }).buildMenu();
      }, tab);
      expect(await overflowingTexts(page, 'HomeScene'), `${tab} (${layout})`).toEqual([]);
    }
    // 軍港 (#145 / #146): bases, their theaters and facilities.
    await open(page, 'BaseScene');
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('BaseScene') as unknown as { build(b: { id: string }, id: string): void };
      s.build({ id: 'ijn_home' }, 'fuelTank');
    });
    const jobs = await page.evaluate(() => JSON.parse(localStorage.getItem('ww2fleet.progress.v2')!).nations.IJN.facilityJobs as Array<{ id: string }>);
    expect(jobs.map((j) => j.id)).toEqual(['fuelTank']);
    expect(await overflowingTexts(page, 'BaseScene'), `bases (${layout})`).toEqual([]);
    await page.screenshot({ path: info.outputPath('home-bases.png') });
    expect(errors).toEqual([]);
  });

  test('a new base is built before it opens, and quest rewards wait at the holding cap (#217 #221)', async ({ page }, info) => {
    const layout = info.project.metadata.layout as string;
    // A 0.0.28 save: only the first base built, every resource at its cap, one 高速建造材.
    const full = { fuel: 10000, ammo: 10000, steel: 10000, bauxite: 5000 };
    const save = {
      ...SAVE, version: 15, seenHelp: ['HomeScene', 'BaseScene', 'CampaignMapScene'],
      nations: { IJN: { ...SAVE.nations.IJN, rankFloor: 2, campaign: ['p1', 'p2', 'p3'], resources: full, basesOpen: [], baseWork: null, items: { fastRepair: 0, fastBuild: 1, captainBook: 0 } } },
    };
    const errors = await boot(page, layout, save);
    type G = { game: Phaser.Game };
    const press = (key: string, label: string): Promise<void> => page.evaluate(([k, l]) => {
      const scene = (window as unknown as G).game.scene.getScene(k);
      const btn = scene.children.list.find((o) => o.type === 'Container' && (o as Phaser.GameObjects.Container).list.some((c) => (c as Phaser.GameObjects.Text).text?.includes(l)))!;
      btn.emit('pointerdown');
      btn.emit('pointerup');
    }, [key, label] as const);
    const stored = (): Promise<{ basesOpen: string[]; baseWork: { base: string } | null; resources: typeof full }> =>
      page.evaluate(() => JSON.parse(localStorage.getItem('ww2fleet.progress.v2')!).nations.IJN);
    await open(page, 'BaseScene');
    await page.evaluate(() => {
      const s = (window as unknown as G).game.scene.getScene('BaseScene') as unknown as { selectedId: string; refresh(): void };
      s.selectedId = 'ijn_light';
      s.refresh();
    });
    await press('BaseScene', '着工');
    expect((await stored()).baseWork?.base).toBe('ijn_light');
    await page.waitForTimeout(300);
    expect(await overflowingTexts(page, 'BaseScene'), `base work (${layout})`).toEqual([]);
    expect(await overlappingTexts(page, 'BaseScene'), `base work overlaps (${layout})`).toEqual([]);
    await page.screenshot({ path: info.outputPath('base-work.png') });
    await press('BaseScene', '高速建造材で完成');
    expect((await stored()).basesOpen).toContain('ijn_light');
    await page.screenshot({ path: info.outputPath('base-opened.png') });
    // Resources back at the cap: the bar says so and the quest board still fits.
    await page.evaluate((r) => {
      const raw = JSON.parse(localStorage.getItem('ww2fleet.progress.v2')!);
      raw.nations.IJN.resources = r;
      localStorage.setItem('ww2fleet.progress.v2', JSON.stringify(raw));
    }, full);
    await page.reload();
    await page.waitForFunction(() => (window as unknown as { game?: Phaser.Game }).game?.scene.getScenes(true).length);
    await open(page, 'HomeScene');
    await page.evaluate(() => ((window as unknown as G).game.scene.getScene('HomeScene') as unknown as { openQuests(k: string): void }).openQuests('hourly'));
    await page.waitForTimeout(300);
    expect(await overflowingTexts(page, 'HomeScene'), `quests at the cap (${layout})`).toEqual([]);
    await page.screenshot({ path: info.outputPath('quests-at-cap.png') });
    expect(errors).toEqual([]);
  });

  test('quests, sweeping a won area and the event line (#52 #57 #89 #158)', async ({ page }, info) => {
    const layout = info.project.metadata.layout as string;
    const save = { ...SAVE, version: 8, nations: { IJN: { ...SAVE.nations.IJN, perfect: ['p2'] } } };
    const errors = await boot(page, layout, save);
    await open(page, 'HomeScene');
    // 'event' (#385): the running event's ten quests.
    for (const kind of ['hourly', 'daily', 'weekly', 'event', 'once', 'rank']) {
      await page.evaluate((k) => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('HomeScene') as unknown as { openQuests(k: string): void }).openQuests(k), kind);
      expect(await overflowingTexts(page, 'HomeScene'), `${kind} (${layout})`).toEqual([]);
      expect(await overlappingTexts(page, 'HomeScene'), `${kind} overlaps (${layout})`).toEqual([]);
      await page.screenshot({ path: info.outputPath(`quests-${kind}.png`) });
    }
    await page.screenshot({ path: info.outputPath('quests.png') });
    await open(page, 'CampaignMapScene');
    const swept = await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('CampaignMapScene') as unknown as { selectArea(id: string): void; sweep(a: unknown): void; selected: unknown; status: string };
      s.selectArea('p2');
      s.sweep(s.selected);
      const stored = JSON.parse(localStorage.getItem('ww2fleet.progress.v2') ?? '{}') as { nations: { IJN: { quests: { totals: Record<string, number> } } } };
      return { status: s.status, sweeps: stored.nations.IJN.quests.totals.sweep };
    });
    expect(swept.status).toContain('掃討完了');
    expect(swept.sweeps).toBe(1);
    expect(await overflowingTexts(page, 'CampaignMapScene'), `sweep (${layout})`).toEqual([]);
    // The result sits above the buttons and the briefing makes room (#297).
    expect(await overlappingTexts(page, 'CampaignMapScene'), `sweep overlaps (${layout})`).toEqual([]);
    await page.screenshot({ path: info.outputPath('sweep.png') });
    expect(errors).toEqual([]);
  });

  test('notices on the home screen, ten quests a tab with claim-all, and the record by kind of battle (#192 #180 #177)', async ({ page }, info) => {
    const layout = info.project.metadata.layout as string;
    // Every hourly quest of this hour finished (the board shows ten of the pool, #180).
    const now = Date.now();
    const day = Math.floor((now - 15 * 3_600_000) / 86_400_000);
    const hourly = (JSON.parse(readFileSync(join(process.cwd(), 'src', 'data', 'quests.json'), 'utf8')) as { quests: Array<{ id: string; kind: string; goal: number }> }).quests.filter((q) => q.kind === 'hourly');
    const quests = { hour: Math.floor(now / 3_600_000), day, week: Math.floor((day + 4) / 7), progress: Object.fromEntries(hourly.map((q) => [q.id, q.goal])), claimed: [], totals: {} };
    // v17: the v8 step would reset the quests; the v18 step opens p2 for sweeping, full.
    const save = { ...SAVE, version: 17, nations: { IJN: { ...SAVE.nations.IJN, perfect: ['p2'], quests, items: { fastRepair: 0, fastBuild: 0, captainBook: 1 } } } };
    const errors = await boot(page, layout, save);
    await open(page, 'HomeScene');
    const texts = (): Promise<string[]> => page.evaluate(() => {
      const out: string[] = [];
      const visit = (o: Phaser.GameObjects.GameObject): void => {
        if (o.type === 'Text') out.push((o as Phaser.GameObjects.Text).text);
        if (o.type === 'Container') (o as Phaser.GameObjects.Container).list.forEach(visit);
      };
      (window as unknown as { game: Phaser.Game }).game.scene.getScene('HomeScene').children.list.forEach(visit);
      return out;
    });
    // お知らせ (#192): rewards to take, sweeps banked (an area open before 0.0.31 starts full; shown on the 作戦
    // button, no longer in the strip); the captain book stays off it (#303).
    const labels = await texts();
    expect(labels.some((t) => /^任務 \d+$/.test(t)), `quest notice (${layout})`).toBe(true);
    expect(labels.some((t) => t === '掃討 3'), `sweep notice (${layout})`).toBe(true);
    expect(labels.some((t) => t.startsWith('艦長教本')), `no book notice (${layout})`).toBe(false);
    // #243: the notices have a strip of their own, above the dock panel (its title row is the panel's top).
    const placed = await page.evaluate(() => {
      const scene = (window as unknown as { game: Phaser.Game }).game.scene.getScene('HomeScene');
      const textOf = (o: Phaser.GameObjects.GameObject): string | undefined => (o.type === 'Text' ? (o as Phaser.GameObjects.Text).text : undefined);
      const chip = scene.children.list.find((o) => o.type === 'Container' && (o as Phaser.GameObjects.Container).list.some((x) => /^任務 \d+$/.test(textOf(x) ?? ''))) as Phaser.GameObjects.Container | undefined;
      const title = scene.children.list.find((o) => textOf(o) === '入渠 — 損傷艦の修理') as Phaser.GameObjects.Text | undefined;
      return { chipBottom: chip ? chip.y + chip.height / 2 : NaN, titleTop: title ? title.y : NaN };
    });
    expect(placed.chipBottom, `notices above the docks (${layout})`).toBeLessThan(placed.titleTop - 20);
    expect(await overflowingTexts(page, 'HomeScene'), `home (${layout})`).toEqual([]);
    expect(await overlappingTexts(page, 'HomeScene'), `home overlaps (${layout})`).toEqual([]);
    await page.screenshot({ path: info.outputPath('home-notices.png') });
    // まとめて受け取る (#180): the ten on the hourly tab in one press.
    await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('HomeScene') as unknown as { openQuests(k: string): void }).openQuests('hourly'));
    expect(await overflowingTexts(page, 'HomeScene'), `quests (${layout})`).toEqual([]);
    expect(await overlappingTexts(page, 'HomeScene'), `quests overlaps (${layout})`).toEqual([]);
    await page.screenshot({ path: info.outputPath('quests-claim-all.png') });
    const claimed = await page.evaluate(() => {
      const scene = (window as unknown as { game: Phaser.Game }).game.scene.getScene('HomeScene');
      const btn = scene.children.list.find((o) => o.type === 'Container' && (o as Phaser.GameObjects.Container).list.some((x) => x.type === 'Text' && (x as Phaser.GameObjects.Text).text.startsWith('まとめて受け取る')));
      btn?.emit('pointerdown');
      btn?.emit('pointerup');
      const stored = JSON.parse(localStorage.getItem('ww2fleet.progress.v2') ?? '{}') as { nations: { IJN: { quests: { claimed: string[]; totals: Record<string, number> } } } };
      return { found: btn !== undefined, claimed: stored.nations.IJN.quests.claimed.length, total: stored.nations.IJN.quests.totals.questClaim ?? 0 };
    });
    expect(claimed.found).toBe(true);
    expect(claimed.claimed).toBe(10);
    expect(claimed.total).toBe(10);
    // The record: each tab fits.
    await open(page, 'RecordScene');
    for (const mode of ['all', 'campaign', 'exercise', 'scenario']) {
      await page.evaluate((m) => {
        const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('RecordScene') as unknown as { mode: string; buildStats(r: unknown): void };
        s.mode = m;
        s.buildStats(JSON.parse(localStorage.getItem('ww2fleet.progress.v2') ?? '{}').record);
      }, mode);
      expect(await overflowingTexts(page, 'RecordScene'), `record ${mode} (${layout})`).toEqual([]);
      expect(await overlappingTexts(page, 'RecordScene'), `record ${mode} overlaps (${layout})`).toEqual([]);
      await page.screenshot({ path: info.outputPath(`record-${mode}.png`) });
    }
    expect(errors).toEqual([]);
  });

  test('captains: pick a skill for a slot, confirm it, and see it in the colour-coded bonus (#130 / #131)', async ({ page }, info) => {
    const save = { ...SAVE, version: 7, seenHelp: ['CaptainScene'], nations: { IJN: { ...SAVE.nations.IJN, captainXp: { ijn_sakai: 60_000 }, captainSkills: { ijn_sakai: ['Torpedo'] } } } };
    const errors = await boot(page, info.project.metadata.layout as string, save);
    await open(page, 'CaptainScene', { id: 'ijn_sakai' });
    await page.screenshot({ path: info.outputPath('captain.png') });
    expect(await overflowingTexts(page, 'CaptainScene')).toEqual([]);
    expect(await overlappingTexts(page, 'CaptainScene'), 'overlaps').toEqual([]);
    type Scene = { openPicker(c: unknown, slot: number): void; confirmLearn(c: unknown, slot: number, s: string): void; applyLearn(c: unknown, slot: number, s: string): void; owned(): Array<{ id: string }> };
    const call = (fn: string, slot: number, skill?: string) => page.evaluate(([f, i, k]) => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('CaptainScene') as unknown as Scene & Record<string, (...a: unknown[]) => void>;
      s[f as string](s.owned().find((c) => c.id === 'ijn_sakai'), i, k);
    }, [fn, slot, skill] as const);
    await call('openPicker', 0);
    await page.screenshot({ path: info.outputPath('captain-picker.png') });
    // Replacing 雷撃 asks first and names what it drops.
    await call('confirmLearn', 0, 'Night');
    await page.screenshot({ path: info.outputPath('captain-confirm.png') });
    await call('applyLearn', 0, 'Night');
    const learned = await page.evaluate(() => JSON.parse(localStorage.getItem('ww2fleet.progress.v2')!).nations.IJN.captainSkills.ijn_sakai);
    expect(learned).toEqual(['Night']);
    expect(errors).toEqual([]);
  });

  test('改装 lists every owned ship, steps through them and opens the ship list (#144)', async ({ page }, info) => {
    const errors = await boot(page, info.project.metadata.layout as string, { ...SAVE, version: 7, seenHelp: ['CustomizationScene'] });
    await open(page, 'CustomizationScene', { returnTo: 'HomeScene', scope: 'all' });
    const count = await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('CustomizationScene') as unknown as { ships: unknown[] };
      return s.ships.length;
    });
    expect(count).toBe(SAVE.nations.IJN.ships.length);
    await page.screenshot({ path: info.outputPath('customize.png') });
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('CustomizationScene') as unknown as { openShipList(): void };
      s.openShipList();
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: info.outputPath('customize-list.png') });
    expect(await overflowingTexts(page, 'CustomizationScene')).toEqual([]);
    expect(await overlappingTexts(page, 'CustomizationScene'), 'overlaps').toEqual([]);
    expect(errors).toEqual([]);
  });

  test('建造 takes time: lay down a ship, see the countdown, finish it with a 高速建造材 (#143)', async ({ page }, info) => {
    const errors = await boot(page, info.project.metadata.layout as string, { ...SAVE, version: 7, seenHelp: ['ShipyardScene', 'HomeScene', 'RecordScene'] });
    await open(page, 'ShipyardScene');
    const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('ww2fleet.progress.v2')!).nations.IJN as { builds: Array<{ shipId: string }>; ships: string[]; items: { fastBuild: number } });
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('ShipyardScene') as unknown as { build(ship: unknown): void; classShips(): Array<{ id: string }> };
      const target = s.classShips().find((x) => x.id === 'mutsuki');
      s.build(target);
    });
    let np = await read();
    expect(np.builds.map((b) => b.shipId)).toEqual(['mutsuki']);
    expect(np.ships).not.toContain('mutsuki');
    await page.waitForTimeout(300);
    await page.screenshot({ path: info.outputPath('shipyard-building.png') });
    // Tapping it again spends a 高速建造材 (migrated saves get two).
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('ShipyardScene') as unknown as { build(ship: unknown): void; classShips(): Array<{ id: string }> };
      s.build(s.classShips().find((x) => x.id === 'mutsuki'));
    });
    np = await read();
    expect(np.ships).toContain('mutsuki');
    expect(np.items.fastBuild).toBe(1);
    await open(page, 'HomeScene');
    await page.screenshot({ path: info.outputPath('home-docks.png') });
    // The build's cost shows in the ledger (#137).
    await open(page, 'RecordScene', { view: 'ledger' });
    await page.screenshot({ path: info.outputPath('ledger.png') });
    expect(await overflowingTexts(page, 'RecordScene')).toEqual([]);
    expect(await overlappingTexts(page, 'RecordScene'), 'overlaps').toEqual([]);
    expect(errors).toEqual([]);
  });

  test('nations open step by step: the others wait for the first nation (#134)', async ({ page }, info) => {
    const errors = await boot(page, info.project.metadata.layout as string, { ...SAVE, version: 7, seenHelp: ['HomeScene'] });
    await open(page, 'HomeScene');
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('HomeScene') as unknown as { openNationPicker(closable: boolean): void; selectNation(n: string): void };
      s.openNationPicker(true);
      // A locked nation can't be picked.
      s.selectNation('USN');
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: info.outputPath('nations-locked.png') });
    const current = await page.evaluate(() => JSON.parse(localStorage.getItem('ww2fleet.progress.v2')!).current);
    expect(current).toBe('IJN');
    expect(errors).toEqual([]);
  });

  test('the backup list opens as a sheet that fits the screen (#157)', async ({ page }, info) => {
    const errors = await boot(page, info.project.metadata.layout as string, { ...SAVE, version: 7, seenHelp: [] });
    await page.evaluate(() => {
      const raw = localStorage.getItem('ww2fleet.progress.v2')!;
      const list = Array.from({ length: 5 }, (_, i) => ({ at: Date.now() - i * 3_600_000, version: 9, reason: i % 2 ? 'migration' : 'reset', raw }));
      localStorage.setItem('ww2fleet.progress.backups', JSON.stringify(list));
    });
    await open(page, 'SettingsScene');
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('SettingsScene') as unknown as { backupsOpen: boolean; refresh(): void };
      s.backupsOpen = true;
      s.refresh();
    });
    await page.waitForTimeout(300);
    expect(await overflowingTexts(page, 'SettingsScene')).toEqual([]);
    expect(await overlappingTexts(page, 'SettingsScene')).toEqual([]);
    await page.screenshot({ path: info.outputPath('backups.png') });
    expect(errors).toEqual([]);
  });

  test('a bombardment: the airfield sends its planes at the fleet (#83)', async ({ page }, info) => {
    const errors = await boot(page, info.project.metadata.layout as string);
    await page.evaluate(() => (window as unknown as { game: Phaser.Game }).game.scene.start('BattleScene', { objective: 'Bombard', mapKey: 'atoll' }));
    await page.waitForFunction(() => (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene')?.sys.settings.active === true);
    type B = { setPaused(p: boolean): void; landTargets: Array<{ stats: { name: string } }>; enemyAir: { squadrons: Array<{ alive: boolean }>; hasCarrier(s: unknown): boolean } };
    const airfields = await page.evaluate(() => {
      const b = (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene') as unknown as B;
      b.setPaused(false);
      return b.landTargets.filter((t) => b.enemyAir.hasCarrier(t)).length;
    });
    expect(airfields).toBe(1);
    // A strike goes up once the fleet is within reach; give it time.
    await page.waitForFunction(() => {
      const b = (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene') as unknown as B;
      return b.enemyAir.squadrons.some((s) => s.alive);
    }, null, { timeout: 60_000 });
    await page.screenshot({ path: info.outputPath('airfield-strike.png') });
    expect(errors).toEqual([]);
  });

  test('a superweapon leads the enemy fleet and loses its parts as it is worn down (#148)', async ({ page }, info) => {
    const errors = await boot(page, info.project.metadata.layout as string);
    await page.evaluate(() => (window as unknown as { game: Phaser.Game }).game.scene.start('BattleScene', { superweapon: true, mapKey: 'open-sea' }));
    await page.waitForFunction(() => (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene')?.sys.settings.active === true);
    type S = { stats: { name: string; currentHp: number; maxHp: number }; scale: number; criticals: Record<string, number> };
    type B = { setPaused(p: boolean): void; superweapon: S | null; enemies: S[]; breakParts(s: S, before: number): void };
    const giant = await page.evaluate(() => {
      const b = (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene') as unknown as B;
      b.setPaused(false);
      const sw = b.superweapon!;
      // Down to 40%: the turrets and the engines give way.
      sw.stats.currentHp = sw.stats.maxHp * 0.4;
      b.breakParts(sw, 1);
      return { name: sw.stats.name, first: b.enemies[0] === sw, scale: sw.scale, crits: Object.keys(sw.criticals).sort() };
    });
    expect(giant.first).toBe(true);
    expect(giant.scale).toBeGreaterThan(1);
    expect(giant.crits).toEqual(['Engine', 'MainGun']);
    await page.waitForTimeout(500);
    await page.screenshot({ path: info.outputPath('superweapon.png') });
    expect(errors).toEqual([]);
  });

  test('a campaign sortie fights its escorts first, then advances to the main fleet (#53)', async ({ page }, info) => {
    const errors = await boot(page, info.project.metadata.layout as string);
    await page.evaluate(() => (window as unknown as { game: Phaser.Game }).game.registry.set('campaign.area', 'p5'));
    await open(page, 'FleetBuilderScene');
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('FleetBuilderScene') as unknown as {
        ships: Array<{ id: string }>; openPicker(i: number): void; pickShip(s: { id: string }): void; startBattle(): void;
      };
      s.openPicker(0);
      s.pickShip(s.ships.find((x) => x.id === 'yamato')!);
      s.startBattle();
    });
    await page.waitForFunction(() => (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene')?.sys.settings.active === true);
    const first = await page.evaluate(() => {
      const b = (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene') as unknown as { battleData: { sortie: unknown }; setPaused(p: boolean): void; triggerGameOver(v: boolean): void };
      const sortie = b.battleData.sortie;
      b.setPaused(false);
      b.triggerGameOver(true);
      return sortie;
    });
    expect(first).toEqual({ node: 1, battles: 2, boss: false });
    await page.waitForFunction(() => (window as unknown as { game: Phaser.Game }).game.scene.getScene('ResultsScene')?.sys.settings.active === true, null, { timeout: 60_000 });
    await page.screenshot({ path: info.outputPath('sortie-advance.png') });
    expect(await page.evaluate(() => {
      const r = (window as unknown as { game: Phaser.Game }).game.scene.getScene('ResultsScene');
      const btn = r.children.list.find((o) => ((o as Phaser.GameObjects.Container).list ?? []).some((c) => (c as Phaser.GameObjects.Text).text?.startsWith('進撃')));
      btn?.emit('pointerdown');
      btn?.emit('pointerup');
      return btn !== undefined;
    })).toBe(true);
    await page.waitForFunction(() => (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene')?.sys.settings.active === true);
    const second = await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene') as unknown as { battleData: { sortie: unknown } }).battleData.sortie);
    expect(second).toEqual({ node: 2, battles: 2, boss: true });
    expect(errors).toEqual([]);
  });

  test('a sortie left after its first battle is continued from the map after a reload (#138)', async ({ page }, info) => {
    const layout = info.project.metadata.layout as string;
    const errors = await boot(page, layout);
    await page.evaluate(() => (window as unknown as { game: Phaser.Game }).game.registry.set('campaign.area', 'p5'));
    await open(page, 'FleetBuilderScene');
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('FleetBuilderScene') as unknown as {
        ships: Array<{ id: string }>; openPicker(i: number): void; pickShip(s: { id: string }): void; startBattle(): void;
      };
      s.openPicker(0);
      s.pickShip(s.ships.find((x) => x.id === 'yamato')!);
      s.startBattle();
    });
    await page.waitForFunction(() => (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene')?.sys.settings.active === true);
    await page.evaluate(() => {
      const b = (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene') as unknown as { setPaused(p: boolean): void; triggerGameOver(v: boolean): void };
      b.setPaused(false);
      b.triggerGameOver(true);
    });
    await page.waitForFunction(() => (window as unknown as { game: Phaser.Game }).game.scene.getScene('ResultsScene')?.sys.settings.active === true, null, { timeout: 60_000 });
    // Close the game on the results screen: the sortie is in the save.
    await page.reload();
    await page.waitForFunction(() => (window as unknown as { game?: Phaser.Game }).game?.scene.getScene('MainMenuScene')?.sys.settings.active === true, null, { timeout: 60_000 });
    await open(page, 'CampaignMapScene');
    await page.screenshot({ path: info.outputPath('sortie-resume.png') });
    expect(await overflowingTexts(page, 'CampaignMapScene')).toEqual([]);
    expect(await overlappingTexts(page, 'CampaignMapScene'), 'overlaps').toEqual([]);
    await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('CampaignMapScene') as unknown as { resume(): void }).resume());
    await page.waitForFunction(() => (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene')?.sys.settings.active === true);
    const node = await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene') as unknown as { battleData: { sortie: unknown } }).battleData.sortie);
    expect(node).toEqual({ node: 2, battles: 2, boss: true });
    expect(errors).toEqual([]);
  });

  test('rank list, nation reset and the version on the title (#128 #129 #136)', async ({ page }, info) => {
    const layout = info.project.metadata.layout as string;
    const errors = await boot(page, layout);
    await open(page, 'HomeScene');
    await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('HomeScene') as unknown as { openRanks(): void }).openRanks());
    expect(await overflowingTexts(page, 'HomeScene'), `ranks (${layout})`).toEqual([]);
    expect(await overlappingTexts(page, 'HomeScene'), `ranks overlaps (${layout})`).toEqual([]);
    await page.screenshot({ path: info.outputPath('ranks.png') });
    await open(page, 'SettingsScene');
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('SettingsScene') as unknown as { nationResetOpen: boolean; resetOneNation(n: string): void };
      s.nationResetOpen = true;
      s.resetOneNation('IJN');
    });
    expect(await overflowingTexts(page, 'SettingsScene'), `nation reset (${layout})`).toEqual([]);
    await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('SettingsScene') as unknown as { resetOneNation(n: string): void }).resetOneNation('IJN'));
    const left = await page.evaluate(() => Object.keys((JSON.parse(localStorage.getItem('ww2fleet.progress.v2') ?? '{}') as { nations: object }).nations));
    expect(left).not.toContain('IJN');
    await open(page, 'MainMenuScene');
    expect(await page.evaluate(() => (window as unknown as { game: Phaser.Game }).game.scene.getScene('MainMenuScene').children.list.some((o) => /^v\d/.test((o as Phaser.GameObjects.Text).text ?? '')))).toBe(true);
    expect(errors).toEqual([]);
  });
});

/**
 * 量が最大のセーブ (#286): every Japanese ship, captain and research, eight docks full, a long damaged list, every
 * area cleared. Layout bugs that only show with a lot of data (the damaged list #275, captain traits #276) are caught
 * here on every screen, in both orientations.
 */
function maxSave(): object {
  const read = (...p: string[]): { [k: string]: unknown } => JSON.parse(readFileSync(join(process.cwd(), 'src', 'data', ...p), 'utf8'));
  const ships = (read('ships', 'ijn.json').ships as Array<{ id: string }>).map((s) => s.id);
  const captains = (read('captains.json').captains as Array<{ id: string; nation: string }>).filter((c) => c.nation === 'IJN').map((c) => c.id);
  const tech = (read('tech-tree.json').tech as Array<{ id: string }>).map((n) => n.id);
  const areas = (read('campaign.json').areas as Array<{ id: string }>).map((a) => a.id);
  const bases = (read('bases.json').bases as Array<{ id: string; nation: string }>).filter((b) => b.nation === 'IJN').map((b) => b.id);
  const later = Date.now() + 3_600_000;
  const damaged = ships.slice(0, 24);
  return {
    ...SAVE,
    nations: {
      IJN: {
        ...SAVE.nations.IJN,
        resources: { fuel: 99000, ammo: 99000, steel: 99000, bauxite: 99000 },
        ships,
        research: tech,
        campaign: areas,
        perfect: areas,
        merit: 999_999,
        captains,
        captainStats: { [captains[0]]: { nightSinks: 9, subSinks: 9, sinks: 99, heavySurvivals: 9 } },
        damage: Object.fromEntries(damaged.map((id) => [id, 0.3])),
        docks: damaged.slice(0, 6).map((shipId) => ({ shipId, endsAt: later })),
        builds: [],
        docksOwned: 8,
        basesOpen: bases,
        items: { fastRepair: 99, fastBuild: 99, captainBook: 99 },
        // 0.0.48: every upgrade in hand, every carrier model, an ace, the blueprints and every ground weapon destroyed.
        equipment: Object.fromEntries((read('upgrades.json').upgrades as Array<{ id: string }>).map((u) => [u.id, 99])),
        aircraftDev: (read('aircraft.json').aircraft as Array<{ id: string }>).map((a) => a.id),
        pilots: { akagi: { skill: 100, kills: 999, ace: '岩本徹三' } },
        blueprints: 99,
        groundKills: Object.fromEntries((read('ground-weapons.json').groundWeapons as Array<{ id: string }>).map((g) => [g.id, 9])),
      },
    },
  };
}

test('量が最大のセーブ: every screen fits with every ship, captain and research (#286)', async ({ page }, info) => {
  test.setTimeout(240_000);
  const layout = info.project.metadata.layout as string;
  const errors = await boot(page, layout, { ...maxSave(), seenHelp: SCREENS });
  for (const key of SCREENS) {
    await open(page, key);
    expect(await overflowingTexts(page, key), `${key} (${layout})`).toEqual([]);
  }
  // Every dock and damaged ship on its own row of one scrolling list (#297), its end reachable; the captain's
  // traits (#276) open as a sheet that fits.
  await open(page, 'HomeScene');
  const rows = await page.evaluate(() => {
    const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('HomeScene') as unknown as { dockList: { content: Phaser.GameObjects.Container; setOffset(o: number): void } };
    s.dockList.setOffset(1e6);
    return s.dockList.content.list.length;
  });
  expect(rows, `one row a dock and a damaged ship (${layout})`).toBe(24);
  await page.waitForTimeout(300);
  await page.screenshot({ path: info.outputPath('max-damaged.png') });
  expect(await overflowingTexts(page, 'HomeScene')).toEqual([]);
  expect(await overlappingTexts(page, 'HomeScene'), `docks overlaps (${layout})`).toEqual([]);
  await open(page, 'CaptainScene');
  await page.screenshot({ path: info.outputPath('max-captain.png') });
  expect(await overflowingTexts(page, 'CaptainScene')).toEqual([]);
  expect(errors).toEqual([]);
});

test('装備と資材 (0.0.48): development, carrier models, scrapping and the superweapon sea (#55 #87 #42 #148)', async ({ page }, info) => {
  test.setTimeout(240_000);
  const layout = info.project.metadata.layout as string;
  const save = {
    ...SAVE, version: 7, seenHelp: SCREENS,
    nations: { IJN: { ...SAVE.nations.IJN, research: [...SAVE.nations.IJN.research, 'torpedo_3', 'aviation_3', 'radar_1', 'armor_1'], ships: [...SAVE.nations.IJN.ships, 'kongo'], equipment: {} } },
  };
  const errors = await boot(page, layout, save);
  type Develop = { mode: string; draw(): void; developRandom(): void };
  // 装備: the arsenal makes one, the stock holds it.
  await open(page, 'DevelopScene');
  await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('DevelopScene') as unknown as Develop).developRandom());
  await page.waitForTimeout(300);
  const stock = await page.evaluate(() => JSON.parse(localStorage.getItem('ww2fleet.progress.v2')!).nations.IJN.equipment as Record<string, number>);
  // おまかせ開発 is a lucky dip since #401: one copy, or two when lucky.
  expect([1, 2], `one copy made (${layout})`).toContain(Object.values(stock).reduce((a, b) => a + b, 0));
  expect(await overflowingTexts(page, 'DevelopScene'), `equipment (${layout})`).toEqual([]);
  expect(await overlappingTexts(page, 'DevelopScene'), `equipment overlaps (${layout})`).toEqual([]);
  // 航空機: the carrier's models and the navy's list.
  await page.evaluate(() => {
    const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('DevelopScene') as unknown as Develop;
    s.mode = 'aircraft';
    s.draw();
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: info.outputPath('develop-aircraft.png') });
  expect(await overflowingTexts(page, 'DevelopScene'), `aircraft (${layout})`).toEqual([]);
  expect(await overlappingTexts(page, 'DevelopScene'), `aircraft overlaps (${layout})`).toEqual([]);
  expect(await textsOutOfCards(page, 'DevelopScene'), `aircraft cards (${layout})`).toEqual([]);
  // 解体: the first tap asks, the second scraps.
  await open(page, 'ShipyardScene');
  const left = await page.evaluate(() => {
    const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('ShipyardScene') as unknown as { build(ship: unknown): void };
    const kongo = { id: 'kongo', name: '金剛 (Kongo)', nation: 'IJN', shipClass: 'Battleship', hp: 0, armor: 0, speed: 0, weapons: [], spriteKey: 'kongo' };
    s.build(kongo);
    s.build(kongo);
    return JSON.parse(localStorage.getItem('ww2fleet.progress.v2')!).nations.IJN.ships as string[];
  });
  expect(left, `kongo scrapped (${layout})`).not.toContain('kongo');
  expect(await overflowingTexts(page, 'ShipyardScene'), `shipyard after scrapping (${layout})`).toEqual([]);
  // 超兵器海域: the final area's sortie row holds three buttons that fit.
  const finalSave = { ...save, nations: { IJN: { ...save.nations.IJN, campaign: ['p1', 'p2', 'p3', 'p4', 'p5', 'p7', 'p10', 'p8', 'p9', 'p6'], perfect: ['p6'] } } };
  await boot(page, layout, finalSave);
  await open(page, 'CampaignMapScene');
  await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('CampaignMapScene') as unknown as { selectArea(id: string): void }).selectArea('p6'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: info.outputPath('superweapon-sea.png') });
  expect(await overflowingTexts(page, 'CampaignMapScene'), `superweapon sea (${layout})`).toEqual([]);
  expect(await overlappingTexts(page, 'CampaignMapScene'), `superweapon sea overlaps (${layout})`).toEqual([]);
  expect(errors).toEqual([]);
});

test('音 (0.0.49): every settings tab fits, the sound settings save (#105 #107)', async ({ page }, info) => {
  const layout = info.project.metadata.layout as string;
  const errors = await boot(page, layout, { ...SAVE, version: 7, seenHelp: SCREENS });
  await open(page, 'SettingsScene');
  for (const tab of ['sound', 'play', 'display', 'data']) {
    await page.evaluate((t) => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('SettingsScene') as unknown as { tab: string; refresh(): void };
      s.tab = t;
      s.refresh();
    }, tab);
    await page.waitForTimeout(200);
    await page.screenshot({ path: info.outputPath(`settings-${tab}.png`) });
    expect(await overflowingTexts(page, 'SettingsScene'), `${tab} (${layout})`).toEqual([]);
    expect(await overlappingTexts(page, 'SettingsScene'), `${tab} overlaps (${layout})`).toEqual([]);
  }
  await page.evaluate(() => {
    const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('SettingsScene') as unknown as { change(p: object): void };
    s.change({ commentaryOn: false, shake: 'off', nationalBgm: false });
  });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ww2fleet.settings.v1')!) as Record<string, unknown>);
  expect(stored).toMatchObject({ commentaryOn: false, shake: 'off', nationalBgm: false });
  expect(errors).toEqual([]);
});

test('記録と艦の個性 (0.0.51): career, titles, fleet technology and the display settings fit (#92 #56 #94)', async ({ page }, info) => {
  const layout = info.project.metadata.layout as string;
  const errors = await boot(page, layout, { ...SAVE, version: 7, seenHelp: SCREENS });
  await open(page, 'RecordScene', { view: 'career' });
  await page.screenshot({ path: info.outputPath('record-career.png') });
  expect(await overflowingTexts(page, 'RecordScene'), `career (${layout})`).toEqual([]);
  await open(page, 'RecordScene', { view: 'titles' });
  await page.screenshot({ path: info.outputPath('record-titles.png') });
  expect(await overflowingTexts(page, 'RecordScene'), `titles (${layout})`).toEqual([]);
  await open(page, 'EncyclopediaScene');
  await page.evaluate(() => {
    const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('EncyclopediaScene') as unknown as { techView: boolean; tab: string; refresh(): void };
    s.tab = 'ships';
    s.techView = true;
    s.refresh();
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: info.outputPath('fleet-tech.png') });
  expect(await overflowingTexts(page, 'EncyclopediaScene'), `fleet tech (${layout})`).toEqual([]);
  expect(errors).toEqual([]);
});

test('表示 (0.0.51): the light theme draws every menu screen, and readings follow hard words (#94)', async ({ page }, info) => {
  const layout = info.project.metadata.layout as string;
  const errors = await boot(page, layout, { ...SAVE, version: 7, seenHelp: SCREENS }, '99.0.0', { theme: 'light', ruby: 'all' });
  const texts: string[] = [];
  for (const key of ['HomeScene', 'EncyclopediaScene', 'SettingsScene', 'RecordScene']) {
    await open(page, key);
    await page.screenshot({ path: info.outputPath(`light-${key}.png`) });
    texts.push(...(await page.evaluate((k) => {
      const g = (window as unknown as { game: Phaser.Game }).game;
      return g.scene.getScene(k).children.list.filter((o) => o.type === 'Text').map((o) => (o as Phaser.GameObjects.Text).text);
    }, key)));
  }
  // 横須賀鎮守府〈ちんじゅふ〉 on the home screen; never on a button label.
  expect(texts.some((t) => t.includes('鎮守府〈ちんじゅふ〉'))).toBe(true);
  expect(errors).toEqual([]);
});

test('史実 (0.0.51): France, the Soviet Union and Italy each have battles of their own that start (#317)', async ({ page }, info) => {
  test.setTimeout(240_000);
  const layout = info.project.metadata.layout as string;
  for (const [nation, id] of [['FR', 'mers-el-kebir'], ['SU', 'tallinn'], ['RM', 'second-sirte']] as const) {
    // The nation being played picks the scenarios (#224).
    const errors = await boot(page, layout, { ...SAVE, version: 7, seenHelp: SCREENS, current: nation, nations: { ...SAVE.nations, [nation]: { ...SAVE.nations.IJN, ships: [], campaign: [], regenAt: Date.now() } } });
    await open(page, 'ScenarioScene');
    const listed = await page.evaluate(([scId, n]) => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('ScenarioScene') as unknown as {
        scenarios: Array<{ id: string; forces: Record<string, { nation: string }>; sides: Array<{ force: string }> }>; selected: number; side: number; refresh(): void;
      };
      s.selected = Math.max(0, s.scenarios.findIndex((x) => x.id === scId));
      const sc = s.scenarios[s.selected];
      // The side of the navy being played.
      s.side = sc.sides.findIndex((d) => sc.forces[d.force].nation === n);
      s.refresh();
      return s.scenarios.map((x) => x.id);
    }, [id, nation] as const);
    expect(listed, nation).toContain(id);
    await page.screenshot({ path: info.outputPath(`scenarios-${nation}.png`) });
    expect(await overflowingTexts(page, 'ScenarioScene'), `${nation} (${layout})`).toEqual([]);
    await page.evaluate(() => {
      const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('ScenarioScene') as unknown as { scenarios: unknown[]; selected: number; start(sc: unknown): void };
      s.start(s.scenarios[s.selected]);
    });
    await page.waitForFunction(() => (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene')?.sys.settings.active === true);
    await page.waitForTimeout(1500);
    const sizes = await page.evaluate(() => {
      const b = (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene') as unknown as { escorts: unknown[]; enemies: unknown[] };
      return { mine: b.escorts.length + 1, enemy: b.enemies.length };
    });
    expect(sizes.mine, nation).toBeGreaterThan(0);
    expect(sizes.enemy, nation).toBeGreaterThan(0);
    await page.screenshot({ path: info.outputPath(`scenario-battle-${nation}.png`) });
    expect(errors, nation).toEqual([]);
  }
});

test('方針・設計・改修 (0.0.52): national focus, a design built, equipment improved and a gun swapped (#49 #51 #309 #368)', async ({ page }, info) => {
  test.setTimeout(240_000);
  const layout = info.project.metadata.layout as string;
  const save = {
    ...SAVE, version: 7, seenHelp: SCREENS,
    nations: { IJN: { ...SAVE.nations.IJN, rankFloor: 13, resources: { fuel: 20000, ammo: 20000, steel: 20000, bauxite: 8000 }, equipment: { fire_director: 2 }, research: [...SAVE.nations.IJN.research, 'fire_control'] } },
  };
  const errors = await boot(page, layout, save);
  const stored = (): Promise<Record<string, unknown>> => page.evaluate(() => JSON.parse(localStorage.getItem('ww2fleet.progress.v2')!).nations.IJN as Record<string, unknown>);
  // 国家方針: the first focus starts and its clock shows.
  await open(page, 'FocusScene');
  const started = await page.evaluate(() => ((window as unknown as { game: Phaser.Game }).game.scene.getScene('FocusScene') as unknown as { startFirst(): boolean }).startFirst());
  expect(started, `a focus starts (${layout})`).toBe(true);
  await page.waitForTimeout(300);
  expect(((await stored()).focus as { current: { id: string } }).current.id).toBe('ijn_expand');
  await page.screenshot({ path: info.outputPath('focus.png') });
  expect(await overflowingTexts(page, 'FocusScene'), `focus (${layout})`).toEqual([]);
  expect(await overlappingTexts(page, 'FocusScene'), `focus overlaps (${layout})`).toEqual([]);
  // 設計: a destroyer drawn up, named and saved; the shipyard lists it.
  await open(page, 'DesignScene');
  await page.evaluate(() => {
    const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('DesignScene') as unknown as { sampleDesign(): void; save(): void };
    s.sampleDesign();
    s.save();
  });
  await page.waitForTimeout(300);
  const designs = (await stored()).designs as Array<{ id: string; name: string }>;
  expect(designs.map((d) => d.name), `design saved (${layout})`).toEqual(['試作駆逐艦']);
  await page.screenshot({ path: info.outputPath('design.png') });
  expect(await overflowingTexts(page, 'DesignScene'), `design (${layout})`).toEqual([]);
  expect(await overlappingTexts(page, 'DesignScene'), `design overlaps (${layout})`).toEqual([]);
  await open(page, 'ShipyardScene');
  expect(await overflowingTexts(page, 'ShipyardScene'), `shipyard (${layout})`).toEqual([]);
  // 改修: ★1 on the fire director.
  await open(page, 'DevelopScene', { mode: 'improve' });
  await page.evaluate(() => {
    const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('DevelopScene') as unknown as { improveOne(u: { id: string }): void };
    s.improveOne({ id: 'fire_director', name: '射撃指揮装置', description: '', effects: { gunReloadMul: 0.9 }, cost: { ammo: 150, steel: 150, bauxite: 50 } } as never);
  });
  await page.waitForTimeout(300);
  expect(((await stored()).equipStars as Record<string, number>).fire_director, `improved (${layout})`).toBe(1);
  await page.screenshot({ path: info.outputPath('improve.png') });
  expect(await overflowingTexts(page, 'DevelopScene'), `improve (${layout})`).toEqual([]);
  expect(await overlappingTexts(page, 'DevelopScene'), `improve overlaps (${layout})`).toEqual([]);
  // 型の載せ替え: Nagato's card shows on the 改装 screen.
  await open(page, 'CustomizationScene', { returnTo: 'HomeScene', scope: 'all', shipId: 'nagato' });
  await page.screenshot({ path: info.outputPath('swap.png') });
  expect(await overflowingTexts(page, 'CustomizationScene'), `swap (${layout})`).toEqual([]);
  expect(await overlappingTexts(page, 'CustomizationScene'), `swap overlaps (${layout})`).toEqual([]);
  // The home menu with 方針 in the arsenal tab.
  await open(page, 'HomeScene');
  await page.evaluate(() => {
    const g = (window as unknown as { game: Phaser.Game }).game;
    g.registry.set('home.tab', 'arsenal');
    g.scene.getScene('HomeScene').scene.restart();
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: info.outputPath('home-arsenal.png') });
  expect(await overflowingTexts(page, 'HomeScene'), `home arsenal (${layout})`).toEqual([]);
  expect(errors).toEqual([]);
});

test('不具合と表示 (0.0.53): research cards never overlap, locked areas and bases stay hidden, the 竣工 notice opens 改装 (#381 #382)', async ({ page }, info) => {
  test.setTimeout(240_000);
  const layout = info.project.metadata.layout as string;
  const save = {
    ...SAVE, version: 7, seenHelp: SCREENS,
    nations: { IJN: { ...SAVE.nations.IJN, rankFloor: 8, research: ['build_cruiser', 'gunnery_1', 'gunnery_2', 'torpedo_1', 'armor_1', 'engine_1', 'fire_control', 'aa_1', 'radar_1'] } },
  };
  const errors = await boot(page, layout, save);
  // 研究: every branch, every card — no two texts of a card overlap, none leaves its card (#381).
  await open(page, 'ArsenalScene');
  const hits = await page.evaluate(() => {
    type Card = { node: { id: string; branch: string }; frame: Phaser.GameObjects.Graphics; w: number; h: number };
    const v = ((window as unknown as { game: Phaser.Game }).game.scene.getScene('ArsenalScene') as unknown as { view: { tree: Array<{ branch: string }>; cards: Card[]; select(b: string): void } }).view;
    const out: string[] = [];
    for (const b of [...new Set(v.tree.map((n) => n.branch))]) {
      v.select(b);
      for (const c of v.cards) {
        const box = c.frame.parentContainer;
        const texts = box.list.filter((o): o is Phaser.GameObjects.Text => o.type === 'Text' && (o as Phaser.GameObjects.Text).text !== '');
        for (let i = 0; i < texts.length; i++) {
          const a = texts[i].getBounds();
          if (a.bottom > box.y + c.h + 1 || a.right > box.x + c.w + 1) out.push(`${c.node.id}: out [${texts[i].text}]`);
          for (let j = i + 1; j < texts.length; j++) {
            const z = texts[j].getBounds();
            if (a.right > z.left + 1 && z.right > a.left + 1 && a.bottom > z.top + 1 && z.bottom > a.top + 1) out.push(`${c.node.id}: [${texts[i].text}] × [${texts[j].text}]`);
          }
        }
      }
    }
    return out;
  });
  expect(hits, `research cards (${layout})`).toEqual([]);
  // 作戦: only open areas are drawn (#382) — p1〜p3 cleared, so the map shows no area past the next ones.
  await open(page, 'CampaignMapScene');
  const drawn = await page.evaluate(() => {
    const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('CampaignMapScene') as unknown as { mapLayer: Phaser.GameObjects.GameObject[] };
    return s.mapLayer.filter((o) => o.type === 'Zone').length;
  });
  const open1 = await page.evaluate(async () => {
    const { isUnlocked, areasOf } = await import('/src/systems/CampaignSystem.ts');
    const data = (await import('/src/data/campaign.json')).default;
    const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('CampaignMapScene') as unknown as { theater: string };
    const cleared = JSON.parse(localStorage.getItem('ww2fleet.progress.v2')!).nations.IJN.campaign as string[];
    return { open: areasOf(data, s.theater).filter((a: never) => isUnlocked(a, cleared)).length, all: areasOf(data, s.theater).length };
  });
  expect(drawn, `campaign nodes (${layout})`).toBe(open1.open);
  expect(open1.open).toBeLessThan(open1.all);
  await page.screenshot({ path: info.outputPath('campaign-hidden.png') });
  expect(await overflowingTexts(page, 'CampaignMapScene'), `campaign (${layout})`).toEqual([]);
  // 軍港・基地: none listed that the rank or an earlier sea still keeps out (#382).
  await open(page, 'BaseScene');
  const locked = await page.evaluate(async () => {
    const { baseState } = await import('/src/systems/BaseSystem.ts');
    const ps = await import('/src/utils/ProgressStore.ts');
    const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('BaseScene') as unknown as { listed(t: 'port' | 'forward'): Array<{ id: string }> };
    const p = ps.loadProgress();
    return [...s.listed('port'), ...s.listed('forward')].filter((b) => baseState(b as never, p) === 'locked').length;
  });
  expect(locked, `bases (${layout})`).toBe(0);
  expect(await overflowingTexts(page, 'BaseScene'), `bases (${layout})`).toEqual([]);
  // 竣工: the notice reads 竣工 › 改装 and opens the new ship there (#382).
  await open(page, 'HomeScene');
  await page.evaluate(() => {
    const g = (window as unknown as { game: Phaser.Game }).game;
    g.registry.set('home.built', 1);
    g.registry.set('home.builtShip', 'yukikaze');
    g.scene.getScene('HomeScene').scene.restart();
  });
  await page.waitForTimeout(700);
  const chip = await page.evaluate(() => {
    const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('HomeScene');
    return s.children.list.some((o) => (o as Phaser.GameObjects.Container).list?.some?.((t) => (t as Phaser.GameObjects.Text).text?.startsWith?.('竣工 › 改装')));
  });
  expect(chip, `notice (${layout})`).toBe(true);
  expect(errors).toEqual([]);
});

test('図鑑と音楽室 (0.0.54): ships met open their page with the sunk count, the tunes heard play (#383 #384 #387)', async ({ page }, info) => {
  test.setTimeout(180_000);
  const layout = info.project.metadata.layout as string;
  const save = {
    ...SAVE, version: 7, seenHelp: SCREENS,
    record: { sorties: 5, encountered: ['iowa', 'gw_usn_seaplane_base', 'sw_usn'], kills: { iowa: 2, sw_usn: 1 }, tunesHeard: ['ijn', 'ijn_battle', 'mood_night'] },
  };
  const errors = await boot(page, layout, save);
  await open(page, 'EncyclopediaScene');
  const pick = async (tab: string, nation: string, id: string): Promise<string[]> => page.evaluate(([t, n, i]) => {
    const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('EncyclopediaScene') as unknown as { tab: string; nation: string; ownedOnly: boolean; selectedId: string; refresh(): void; children: Phaser.GameObjects.DisplayList };
    s.tab = t;
    s.nation = n;
    s.ownedOnly = true;
    s.selectedId = i;
    s.refresh();
    return s.children.list.filter((o) => o.type === 'Text').map((o) => (o as Phaser.GameObjects.Text).text);
  }, [tab, nation, id] as const);
  // 会敵 (#384): Iowa, never owned, has its page, its sunk count and how it comes.
  const iowa = await pick('ships', 'USN', 'iowa');
  expect(iowa.some((t) => t.includes('会敵') && t.includes('撃沈 2')), `iowa (${layout})`).toBe(true);
  expect(iowa.some((t) => t.startsWith('アイオワ'))).toBe(true);
  expect(await overflowingTexts(page, 'EncyclopediaScene'), `ships (${layout})`).toEqual([]);
  await page.screenshot({ path: info.outputPath('book-met.png') });
  // A ground weapon met, and the superweapon met and sunk.
  const sea = await pick('ground', 'USN', 'gw_usn_seaplane_base');
  expect(sea.some((t) => t === '水上機基地')).toBe(true);
  const giant = await pick('ground', 'USN', 'sw_usn');
  expect(giant.some((t) => t.includes('撃沈 1'))).toBe(true);
  expect(await overflowingTexts(page, 'EncyclopediaScene'), `ground (${layout})`).toEqual([]);
  // 音楽室 (#383): the tunes heard, the play button starts one and stops it.
  const tunes = await pick('music', 'IJN', 'ijn_battle');
  expect(tunes.some((t) => t.includes('(50%)'))).toBe(true);
  expect(await overflowingTexts(page, 'EncyclopediaScene'), `music (${layout})`).toEqual([]);
  expect(await overlappingTexts(page, 'EncyclopediaScene'), `music (${layout})`).toEqual([]);
  const playing = await page.evaluate(async () => {
    const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('EncyclopediaScene') as unknown as { children: Phaser.GameObjects.DisplayList };
    const btn = s.children.list.find((o) => (o as Phaser.GameObjects.Container).list?.some?.((t) => (t as Phaser.GameObjects.Text).text?.includes?.('聴く'))) as Phaser.GameObjects.Container | undefined;
    btn?.emit('pointerdown');
    btn?.emit('pointerup');
    const { audio } = await import('/src/systems/AudioSystem.ts');
    return audio.previewing;
  });
  expect(playing).toBe('ijn_battle');
  await page.screenshot({ path: info.outputPath('book-music.png') });
  expect(errors).toEqual([]);
});

test('不具合と表示 (0.0.56): research summary above the cards, the support sheet, two-column refit and develop lists (#394 #395)', async ({ page }, info) => {
  test.setTimeout(300_000);
  const layout = info.project.metadata.layout as string;
  const tech = JSON.parse(readFileSync('src/data/tech-tree.json', 'utf8')).tech.map((n: { id: string }) => n.id) as string[];
  const fleet = ['yamato', 'nagato', 'mutsu', 'takao', 'atago', 'sendai', 'fubuki', 'yukikaze'];
  const save = {
    ...SAVE, version: 8, seenHelp: SCREENS,
    nations: { IJN: {
      ...SAVE.nations.IJN, research: tech, rankFloor: 9, merit: 99999, ships: [...SAVE.nations.IJN.ships, 'mutsu', 'atago', 'kongo', 'haruna'],
      equipment: { gun_fcs: 2, torpedo_oxygen: 1 }, refits: { yamato: 2, nagato: 1 },
      presets: [
        { slotIds: fleet.slice(0, 4), captainIds: [null, null, null, null], formation: 'LineAhead' },
        { slotIds: ['nagato', 'kongo', 'haruna', 'sendai', 'fubuki', 'yukikaze'], captainIds: [null, null, null, null, null, null], formation: 'LineAhead' },
        null,
      ],
      support: [{ preset: 1, mission: 'strike' }],
    } },
  };
  const errors = await boot(page, layout, save);
  // 研究 (#394): every branch with everything researched — the summary stays above the cards, no card text overlaps.
  await open(page, 'ArsenalScene');
  const research = await page.evaluate(() => {
    const sc = (window as unknown as { game: Phaser.Game }).game.scene.getScene('ArsenalScene') as unknown as { view: { tree: Array<{ branch: string }>; cards: Array<{ node: { id: string }; frame: Phaser.GameObjects.Graphics; w: number; h: number }>; select(b: string): void; summary: Phaser.GameObjects.Text } };
    const out: string[] = [];
    for (const b of [...new Set(sc.view.tree.map((n) => n.branch))]) {
      sc.view.select(b);
      const top = Math.min(...sc.view.cards.map((c) => c.frame.parentContainer.y));
      if (sc.view.summary.getBounds().bottom > top) out.push(`${b}: summary runs into the cards`);
      for (const c of sc.view.cards) {
        const box = c.frame.parentContainer;
        const texts = box.list.filter((o): o is Phaser.GameObjects.Text => o.type === 'Text' && (o as Phaser.GameObjects.Text).text !== '');
        texts.forEach((t, i) => texts.slice(i + 1).forEach((u) => {
          const a = t.getBounds();
          const z = u.getBounds();
          if (a.right > z.left + 1 && z.right > a.left + 1 && a.bottom > z.top + 1 && z.bottom > a.top + 1) out.push(`${c.node.id}: [${t.text}] × [${u.text}]`);
        }));
      }
    }
    return out;
  });
  expect(research, `research (${layout})`).toEqual([]);
  // 支援艦隊 (#394): the sheet with a long setup fits, and a ship of the main fleet is named as left out.
  await open(page, 'FleetBuilderScene');
  await page.evaluate(() => {
    const s = (window as unknown as { game: Phaser.Game }).game.scene.getScene('FleetBuilderScene') as unknown as { openSupport(): void };
    s.openSupport();
  });
  expect(await overflowingTexts(page, 'FleetBuilderScene'), `support (${layout})`).toEqual([]);
  expect(await overlappingTexts(page, 'FleetBuilderScene'), `support (${layout})`).toEqual([]);
  await page.screenshot({ path: info.outputPath('support.png') });
  // 改装・開発 (#395): two columns on a phone, nothing leaves its card.
  for (const key of ['CustomizationScene', 'DevelopScene']) {
    await open(page, key);
    expect(await overflowingTexts(page, key), `${key} (${layout})`).toEqual([]);
    expect(await textsOutOfCards(page, key), `${key} (${layout})`).toEqual([]);
    await page.screenshot({ path: info.outputPath(`${key}.png`) });
  }
  expect(errors).toEqual([]);
});

test('戦闘の隊形 (0.0.57): an exercise with 支援艦隊 meets as many enemy fleets, which keep together behind their flagships (#400 #404)', async ({ page }, info) => {
  const layout = info.project.metadata.layout as string;
  const errors = await boot(page, layout);
  await page.evaluate(async () => {
    const game = (window as unknown as { game: Phaser.Game }).game;
    const { DataLoader } = await import('/src/utils/DataLoader.ts');
    const reg = DataLoader.getRegistry(game.scene.getScene('MainMenuScene'));
    const pick = (ids: string[]) => ids.map((id) => reg.byId(id)).filter((s) => s !== undefined);
    game.scene.start('BattleScene', {
      mapKey: 'open-sea',
      support: [{ ships: pick(['fubuki', 'ayanami', 'akatsuki']), captainIds: [null, null, null], mission: 'strike' }],
      enemySupport: [pick(['fletcher', 'benson', 'gleaves'])],
    });
  });
  await page.waitForFunction(() => (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene')?.sys.settings.active === true);
  type Ship = { x: number; y: number; isAlive: boolean };
  type B = { setPaused(p: boolean): void; enemies: Ship[]; groups: Array<{ owned: boolean; ships: Ship[] }> };
  const counts = await page.evaluate(() => {
    const b = (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene') as unknown as B;
    b.setPaused(false);
    return { enemies: b.enemies.length, groups: b.groups.filter((g) => g.owned).map((g) => g.ships.length) };
  });
  // The default exercise enemy plus the three of its 支援艦隊.
  expect(counts.groups).toEqual([3]);
  expect(counts.enemies).toBeGreaterThanOrEqual(4);
  // Let them sail a while: the 支援艦隊 stays within reach of its own flagship.
  await page.waitForTimeout(8000);
  const spread = await page.evaluate(() => {
    const b = (window as unknown as { game: Phaser.Game }).game.scene.getScene('BattleScene') as unknown as B;
    const g = b.groups.find((x) => x.owned)!;
    const lead = g.ships.find((s) => s.isAlive)!;
    return Math.max(...g.ships.filter((s) => s.isAlive).map((s) => Math.hypot(s.x - lead.x, s.y - lead.y)));
  });
  expect(spread).toBeLessThan(600);
  await page.screenshot({ path: info.outputPath('exercise-fleets.png') });
  expect(errors).toEqual([]);
});

test('文字の最小サイズ (0.0.59): no menu screen draws a text below 12 canvas px (#406)', async ({ page }, info) => {
  test.setTimeout(240_000);
  const layout = info.project.metadata.layout as string;
  const errors = await boot(page, layout, { ...SAVE, version: 7, seenHelp: SCREENS });
  const tiny: string[] = [];
  for (const key of SCREENS) {
    await open(page, key);
    tiny.push(...(await tinyTexts(page, key)).map((t) => `${key}: ${t}`));
  }
  console.log(`TINY ${layout} ${tiny.length}\n${tiny.join('\n')}`);
  expect(tiny, `small texts (${layout})`).toEqual([]);
  expect(errors).toEqual([]);
});

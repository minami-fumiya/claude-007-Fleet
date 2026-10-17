/**
 * Every non-ASCII character the UI can draw. Web fonts are split into unicode-range slices,
 * so the loader asks for exactly these glyphs before the game starts; otherwise canvas text
 * drawn early would fall back to a system font and never re-render.
 *
 * Kept in sync by tests/unit/fontGlyphs.test.ts — add any new characters it reports.
 */
export const UI_GLYPHS =
  '·×—…‹←→↓▶◎★⚓✕、。いかがきくさしすせたっつてでとなにのびぶへべまみよらるれろをィイウクスタッテトプホマリル・一三上下並中主久二以件作備再出列利制前力加動勝単可右向吹和回国地大太存守左帝平広式弾形後成戦戻握撃撤操放敵方旋旗時条権武残殲沈法洋海準滅火点照狙用甲画砲移第素続総編縦翔耐能艦蔵衛装複覧護軍輪追退速連進選酸間闘陣隊隻雄集雪雷面高魚鶴！';

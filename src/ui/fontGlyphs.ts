/**
 * Every non-ASCII character the UI can draw. Web fonts are split into unicode-range slices,
 * so the loader asks for exactly these glyphs before the game starts; otherwise canvas text
 * drawn early would fall back to a system font and never re-render.
 *
 * Kept in sync by tests/unit/fontGlyphs.test.ts — add any new characters it reports.
 */
export const UI_GLYPHS =
  '·×—…‹←→↓▶◎★⚓✕、。えかがきくさしすせたっつてでとなにのびぶへべまもよらりるれろをアィイウェエオカガクグゲスセタチッツテトドナノヒビピフプベペボマモャラリルレロワン・ー一三上下両並中主久二交以件伊作備内再出切列利制前副力加動勝単可右吹和回国地型大太存守定対射尾左帝平広式弾形後急成戦戻手投指換握撃撤操攻放敵方旋旗時替条標権機武残殲気水沈法洋浮海準滅潜火点照爆狙用甲目相砲移程第米素続緊総編縦翔耐能自航艦英蔵行衛装複覧護軍輪追退速連進選酸間闘陣隊隻雄集雪雷高魚鶴！';

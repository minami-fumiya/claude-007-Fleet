/**
 * Every non-ASCII character the UI can draw. Web fonts are split into unicode-range slices,
 * so the loader asks for exactly these glyphs before the game starts; otherwise canvas text
 * drawn early would fall back to a system font and never re-render.
 *
 * Kept in sync by tests/unit/fontGlyphs.test.ts — add any new characters it reports.
 */
export const UI_GLYPHS =
  '·×—…‹›←→↓−▲▶▼◎★⚓✕、。いえかがきくさしすせたっつてでとなにのはびぶへべまみもよらりるれろをんァアィイウェエォオカガキギクグゲコサシジスズセゼタダチッツテデトドナニノバパヒビピフブプヘベペホボマミメモャヤュョラリルレロワンヴ・ー一三上下不世両並中主久二井交以件任伊作修健備入全内再出切列利制前剛副力加効動勝化単可右向吹命和回国地坂型城填増大太奥存守宕定対射尾島川左帝平広式強弾当形後応急悟愛成戦戻手投指探換握揮撃撤操改攻放敵料方旋旗早時替有材村条根標権機武残殲気水沈法洋浮海渠源準滅潜瀬火点照燃爆狙班理用甲界発目相研砲破移程究空第管米素続緊総編縦置翔耐能自航艦良英蔵薬行術衛装複視覧解設護賀資赤足軍輪追退透速連進選部酸金銃鋼長門間関闘陣陸隊隻雄集雪雷電風高魚鶴！';

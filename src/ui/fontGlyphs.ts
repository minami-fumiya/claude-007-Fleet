/**
 * Every non-ASCII character the UI can draw. Web fonts are split into unicode-range slices,
 * so the loader asks for exactly these glyphs before the game starts; otherwise canvas text
 * drawn early would fall back to a system font and never re-render.
 *
 * Kept in sync by tests/unit/fontGlyphs.test.ts — add any new characters it reports.
 */
export const UI_GLYPHS =
  '·×—…‹›←→↓−▲▶▼◎★⚓⚠✕、。あいえかがきくさしすせたっつてでとなにのはびぶへべまみもよらりるれろをんァアィイウェエォオカガキギクグゲコサシジスズセゼタダチッツテデトドナニノバパヒビピフブプヘベペホボマミムメモャヤュョラリルレロワンヴ・ー一三上下不世両並中主久二井交他令以件任伊位作修健備傷充入全内再出切列利制前剛副力加効動勝化単可右司向吹命和回国地坂型城填増夜大天太奥存守宕定対射小尾島嵐川工左帝平広府廠式強弾当形後得応急悟愛成戦戻手技投指探提換握揮損撃撤操改攻放敵料方旋旗早昼時晴曇替有未材村条根標権機武残殲気水沈法洋浮海済渠源準滅潜瀬火点照燃爆狙獲班理用甲界発目相研砲破移程究空第管米素続緊総編縦置翔耐能自航舵艦良英蔵薬行術衛装補複要視覧解設護賀資赤足軍載輪追退透速連進達選部酸金銃鋼鎮長門間関闘陣陸隊隻雄集雪雷電霧風高魚鶴！';

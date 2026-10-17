/**
 * Every non-ASCII character the UI can draw. Web fonts are split into unicode-range slices,
 * so the loader asks for exactly these glyphs before the game starts; otherwise canvas text
 * drawn early would fall back to a system font and never re-render.
 *
 * Kept in sync by tests/unit/fontGlyphs.test.ts — add any new characters it reports.
 */
export const UI_GLYPHS =
  '·×—…‹›←→↓−▲▶▼◎★⚓⚠✓✕、。々あいえかがきくけさしじすせただちっつてでとなにのはびぶへべまみむもよらりるれろをんァアィイウェエォオカガキギクグゲコサシジスズセゼタダチッツテデトドナニノバパヒビピフブプヘベペホボマミムメモャヤュョヨラリルレロワンヴ・ー一三上下不世両並中主久乗二井交他令以件任伊伏位作修健備傷充入全内再出切列初利制前剛副力加効動勝化北南単可台右司向吹命和哨喪回団図国地坂型城域報場塞填増壊外夜大天太失奥存守宕定対射小尾岸峡島嵐川巡工左巨帝平広府廠式強弾当形待後得必応急悟愛成戦戻手技投抜指捉捕掃排探提換握揮損撃撤操改攻放敗敵料方施旋旗早昼時晴曇替有未材村条根標権機止武残殲母気水決沈沖沿法洋浮海済渠港湾源準滅演潜瀬火点照燃爆狙狼獲班理環用甲界略発目相研砲破礁移程究空突第管米素続緊総編縦置群習翔耐能脅脱自航舵船艦良英蔵薬行術衛装補複襲西要視覧解討設諸護賀資赤足路軍載輪輸迎追退送透逐通速連進過達選部酬酸金銃鋼鎮長門開間関闘陣除陰陸隊隻雄集雪雷電霧音風飛駆高魚鶴！';

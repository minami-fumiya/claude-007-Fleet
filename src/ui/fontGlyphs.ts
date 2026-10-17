/**
 * Every non-ASCII character the UI can draw. Web fonts are split into unicode-range slices,
 * so the loader asks for exactly these glyphs before the game starts; otherwise canvas text
 * drawn early would fall back to a system font and never re-render.
 *
 * Kept in sync by tests/unit/fontGlyphs.test.ts — add any new characters it reports.
 */
export const UI_GLYPHS =
  '·×—…‹›※←→↓−▲▶▼◎★⚓⚠✓✕、。々あいうえかがきくぐけさしじすせそただちっつてでとなにのはびぶへべまみむもよらりるれろをんァアィイウェエォオカガキギクグゲコサシジスズセゼタダチッツテデトドナニノバパヒビピフブプヘベペホボマミムメモャヤュョヨラリルレロワンヴ・ー一三上下不世両並中主久乗了二井交他代令以件任伊伏位作修健備傷充先入全兵内再出切列初利制前剛副力加効動勝化北南単反受可台史右号司同向吹味命和哨商喪回団図国地坂型城域執報場塞填増壊士変外夜大天太失奇奥始存守完宕定実対射小尾局岸峡島嵐川巡工左巨帝平年広府度廠式強弾当形役待後得必応急悟愛成戦戻手扱技投抜択拗指振捉捕掃排探提換握揮損撃撤操改攻放敗敵料新方施旋旗日早昼時晴暗曇替最月有未末本材村条東栗根標模権機次止武残殲段母気水決沈沖沿法洋浮海済渠港湾源準滅滞演潜瀬火点照熟燃爆狙狼獲班現理環用田甲界略発目相研砲破礁移程稼究空突第管米精級素終続緊総編練縦置群習翔耐能脅脱自航般舵船艦良英蔵薬行術衛装補複襲西要覆規視覧解討設読諸護賀資赤足路軍転載輪輸迎追退送逃透逐通速造連進遅遇過達遭選部酬酸金銃鋭鋼鎮長門開間関闘阻降限陣除陰陸隊階隻雄集雪雷電霧音風飛駆高魚鶴！';

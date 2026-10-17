# Imperial Japanese Navy (帝国海軍) — Ship Roster

Source of truth: `src/data/ships/ijn.json`. Stats use the game scale (Yamato = HP 800 / armor 65 / speed 120), not historical units.

| id | 艦名 | 艦種 | HP | 装甲 | 速力 | 武装 |
|---|---|---|---|---|---|---|
| `yamato` | 大和 (Yamato) | Battleship | 800 | 65 | 120 | 46cm 三式弾, 15.5cm 3 連装副砲 |
| `musashi` | 武蔵 (Musashi) | Battleship | 785 | 63 | 118 | 46cm 三式弾, 15.5cm 3 連装副砲 |
| `nagato` | 長門 (Nagato) | Battleship | 690 | 58 | 130 | 41cm 連装砲, 12cm 単装砲 |
| `mutsu` | 陸奥 (Mutsu) | Battleship | 680 | 57 | 130 | 41cm 連装砲, 12cm 単装砲 |
| `kongo` | 金剛 (Kongo) | Battleship | 610 | 45 | 170 | 35.6cm 連装砲, 12cm 単装砲 |
| `takao` | 高雄 (Takao) | Cruiser | 400 | 40 | 180 | 20cm 連装砲, 93式酸素魚雷 |
| `atago` | 愛宕 (Atago) | Cruiser | 400 | 40 | 180 | 20cm 連装砲, 93式酸素魚雷 |
| `tone` | 利根 (Tone) | Cruiser | 385 | 38 | 178 | 20cm 連装砲, 93式酸素魚雷 |
| `fubuki` | 吹雪 (Fubuki) | Destroyer | 210 | 15 | 240 | 12cm 単装砲, 93式酸素魚雷, 爆雷投射機 |
| `shimakaze` | 島風 (Shimakaze) | Destroyer | 200 | 14 | 265 | 12cm 単装砲, 93式酸素魚雷, 爆雷投射機 |
| `yukikaze` | 雪風 (Yukikaze) | Destroyer | 215 | 15 | 240 | 12cm 単装砲, 93式酸素魚雷, 爆雷投射機 |
| `shokaku` | 翔鶴 (Shokaku) | Carrier | 495 | 30 | 150 | 12cm 単装砲 |
| `akagi` | 赤城 (Akagi) | Carrier | 545 | 32 | 145 | 12cm 単装砲 |
| `kaga` | 加賀 (Kaga) | Carrier | 560 | 34 | 135 | 12cm 単装砲 |
| `i19` | 伊19 (I-19) | Submarine | 150 | 6 | 155 | 95式酸素魚雷 (潜水艦) |
| `i400` | 伊400 (I-400) | Submarine | 175 | 7 | 140 | 95式酸素魚雷 (潜水艦) |

## Weapons

| id | 名称 | 種別 | 火力 | 射程 | 装填 (ms) | 弾速 |
|---|---|---|---|---|---|---|
| `46cm_main_gun` | 46cm 三式弾 | ShellAP | 120 | 600 | 1500 | 600 |
| `15_5cm_triple` | 15.5cm 3 連装副砲 | ShellHE | 46 | 460 | 950 | 550 |
| `41cm_main_gun` | 41cm 連装砲 | ShellAP | 110 | 580 | 1550 | 590 |
| `12cm_gun` | 12cm 単装砲 | ShellHE | 35 | 400 | 800 | 520 |
| `36cm_main_gun` | 35.6cm 連装砲 | ShellAP | 95 | 560 | 1400 | 600 |
| `20cm_twin_gun` | 20cm 連装砲 | ShellAP | 65 | 500 | 1200 | 550 |
| `torpedo_type93` | 93式酸素魚雷 | Torpedo | 200 | 350 | 4000 | 300 |
| `depth_charge` | 爆雷投射機 | DepthCharge | 140 | 80 | 2200 | 0 |
| `type95_torpedo` | 95式酸素魚雷 (潜水艦) | Torpedo | 150 | 380 | 8000 | 270 |

## Notes

- 酸素魚雷 (93式 / 95式) は全国籍で最も火力が高い。
- 伊19 は Sprint 4 で追加した潜水艦。

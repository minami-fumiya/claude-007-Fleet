# Imperial Japanese Navy (帝国海軍) — Ship Roster

Source of truth: `src/data/ships/ijn.json`. Stats use the game scale (Yamato = HP 500 / armor 65 / speed 120), not historical units.

| id | 艦名 | 艦種 | HP | 装甲 | 速力 | 武装 |
|---|---|---|---|---|---|---|
| `yamato` | 大和 (Yamato) | Battleship | 500 | 65 | 120 | 46cm 三式弾 |
| `musashi` | 武蔵 (Musashi) | Battleship | 490 | 63 | 118 | 46cm 三式弾 |
| `takao` | 高雄 (Takao) | Cruiser | 250 | 40 | 180 | 20cm 連装砲 |
| `fubuki` | 吹雪 (Fubuki) | Destroyer | 130 | 15 | 240 | 12cm 単装砲, 93式酸素魚雷, 爆雷投射機 |
| `shokaku` | 翔鶴 (Shokaku) | Carrier | 310 | 30 | 150 | 12cm 単装砲 |
| `i19` | 伊19 (I-19) | Submarine | 95 | 6 | 155 | 95式酸素魚雷 (潜水艦) |

## Weapons

| id | 名称 | 種別 | 火力 | 射程 | 装填 (ms) | 弾速 |
|---|---|---|---|---|---|---|
| `46cm_main_gun` | 46cm 三式弾 | ShellAP | 120 | 600 | 1500 | 600 |
| `20cm_twin_gun` | 20cm 連装砲 | ShellAP | 65 | 500 | 1200 | 550 |
| `12cm_gun` | 12cm 単装砲 | ShellHE | 35 | 400 | 800 | 520 |
| `torpedo_type93` | 93式酸素魚雷 | Torpedo | 200 | 350 | 4000 | 300 |
| `depth_charge` | 爆雷投射機 | DepthCharge | 140 | 60 | 3000 | 0 |
| `type95_torpedo` | 95式酸素魚雷 (潜水艦) | Torpedo | 210 | 380 | 5000 | 270 |

## Notes

- 酸素魚雷 (93式 / 95式) は全国籍で最も火力が高い。
- 伊19 は Sprint 4 で追加した潜水艦。

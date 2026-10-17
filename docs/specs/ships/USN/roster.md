# United States Navy (米国海軍) — Ship Roster

Source of truth: `src/data/ships/usn.json`. Stats use the game scale (Yamato = HP 500 / armor 65 / speed 120), not historical units.

| id | 艦名 | 艦種 | HP | 装甲 | 速力 | 武装 |
|---|---|---|---|---|---|---|
| `iowa` | アイオワ (Iowa) | Battleship | 470 | 58 | 160 | 16in Mk.7 主砲, 5in/38 両用砲 |
| `north_carolina` | ノースカロライナ (North Carolina) | Battleship | 440 | 56 | 135 | 16in Mk.6 主砲, 5in/38 両用砲 |
| `baltimore` | ボルチモア (Baltimore) | Cruiser | 260 | 42 | 175 | 8in Mk.12 主砲, 5in/38 両用砲 |
| `fletcher` | フレッチャー (Fletcher) | Destroyer | 140 | 14 | 250 | 5in/38 両用砲, Mk.15 魚雷, 爆雷投射機 |
| `essex` | エセックス (Essex) | Carrier | 330 | 28 | 165 | 5in/38 両用砲 |
| `gato` | ガトー (Gato) | Submarine | 90 | 6 | 150 | Mk.14 魚雷 (潜水艦) |

## Weapons

| id | 名称 | 種別 | 火力 | 射程 | 装填 (ms) | 弾速 |
|---|---|---|---|---|---|---|
| `16in_mk7` | 16in Mk.7 主砲 | ShellAP | 115 | 650 | 1500 | 620 |
| `5in_38` | 5in/38 両用砲 | ShellHE | 32 | 420 | 700 | 540 |
| `16in_mk6` | 16in Mk.6 主砲 | ShellAP | 105 | 620 | 1600 | 600 |
| `8in_mk12` | 8in Mk.12 主砲 | ShellAP | 62 | 520 | 1150 | 560 |
| `mk15_torpedo` | Mk.15 魚雷 | Torpedo | 170 | 320 | 4500 | 280 |
| `depth_charge` | 爆雷投射機 | DepthCharge | 140 | 60 | 3000 | 0 |
| `mk14_torpedo` | Mk.14 魚雷 (潜水艦) | Torpedo | 180 | 380 | 5000 | 260 |

## Notes

- 遠距離砲戦が得意 (16in 主砲の射程 650 は全艦中最長)。
- 空母 Essex の艦載機は Sprint 5 で実装。現状は 5in 両用砲のみ。

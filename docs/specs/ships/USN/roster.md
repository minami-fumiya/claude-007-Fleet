# United States Navy (米国海軍) — Ship Roster

Source of truth: `src/data/ships/usn.json`. Stats use the game scale (Yamato = HP 800 / armor 65 / speed 120), not historical units.

| id | 艦名 | 艦種 | HP | 装甲 | 速力 | 武装 |
|---|---|---|---|---|---|---|
| `iowa` | アイオワ (Iowa) | Battleship | 750 | 58 | 160 | 16in Mk.7 主砲, 5in/38 両用砲 |
| `north_carolina` | ノースカロライナ (North Carolina) | Battleship | 705 | 56 | 135 | 16in Mk.6 主砲, 5in/38 両用砲 |
| `missouri` | ミズーリ (Missouri) | Battleship | 750 | 58 | 160 | 16in Mk.7 主砲, 5in/38 両用砲 |
| `new_jersey` | ニュージャージー (New Jersey) | Battleship | 750 | 58 | 160 | 16in Mk.7 主砲, 5in/38 両用砲 |
| `south_dakota` | サウスダコタ (South Dakota) | Battleship | 725 | 58 | 135 | 16in Mk.6 主砲, 5in/38 両用砲 |
| `montana` | モンタナ (Montana) | Battleship (架空) | 830 | 63 | 135 | 16in Mk.7 4連装砲, 5in/38 両用砲 |
| `baltimore` | ボルチモア (Baltimore) | Cruiser (重巡洋艦) | 415 | 42 | 175 | 8in Mk.12 主砲, 5in/38 両用砲 |
| `des_moines` | デ・モイン (Des Moines) | Cruiser (重巡洋艦) | 450 | 44 | 170 | 8in Mk.16 速射砲, 5in/38 両用砲 |
| `cleveland` | クリーブランド (Cleveland) | Cruiser (軽巡洋艦) | 400 | 36 | 172 | 6in/47 Mk.16 砲, 5in/38 両用砲 |
| `atlanta` | アトランタ (Atlanta) | Cruiser (軽巡洋艦) | 360 | 30 | 182 | 5in/38 連装両用砲, Mk.15 魚雷 |
| `fletcher` | フレッチャー (Fletcher) | Destroyer | 225 | 14 | 250 | 5in/38 両用砲, Mk.15 魚雷, 爆雷投射機 |
| `gearing` | ギアリング (Gearing) | Destroyer | 240 | 14 | 245 | 5in/38 両用砲, Mk.15 魚雷, 爆雷投射機 |
| `sumner` | アレン・M・サムナー (Allen M. Sumner) | Destroyer | 235 | 14 | 245 | 5in/38 連装両用砲, Mk.15 魚雷, 爆雷投射機 |
| `buckley` | バックレイ (Buckley) | Destroyer (海防艦) | 205 | 11 | 190 | 3in/50 砲, Mk.15 魚雷, 爆雷投射機 |
| `essex` | エセックス (Essex) | Carrier | 530 | 28 | 165 | 5in/38 両用砲 |
| `enterprise` | エンタープライズ (Enterprise) | Carrier | 510 | 27 | 170 | 5in/38 両用砲 |
| `midway` | ミッドウェイ (Midway) | Carrier | 575 | 36 | 155 | 5in/38 両用砲 |
| `yorktown` | ヨークタウン (Yorktown) | Carrier | 505 | 27 | 165 | 5in/38 両用砲 |
| `independence` | インディペンデンス (Independence) | Carrier (軽空母) | 465 | 22 | 170 | 5in/38 両用砲 |
| `casablanca` | カサブランカ (Casablanca) | Carrier (護衛空母) | 455 | 15 | 120 | 5in/38 両用砲 |
| `gato` | ガトー (Gato) | Submarine | 145 | 6 | 150 | Mk.14 魚雷 (潜水艦) |
| `balao` | バラオ (Balao) | Submarine | 150 | 7 | 150 | Mk.14 魚雷 (潜水艦) |

## Weapons

| id | 名称 | 種別 | 火力 | 射程 | 装填 (ms) | 弾速 |
|---|---|---|---|---|---|---|
| `16in_mk7` | 16in Mk.7 主砲 | ShellAP | 115 | 650 | 1500 | 620 |
| `5in_38` | 5in/38 両用砲 | ShellHE | 32 | 420 | 700 | 540 |
| `16in_mk6` | 16in Mk.6 主砲 | ShellAP | 105 | 620 | 1600 | 600 |
| `16in_mk7_quad` | 16in Mk.7 4連装砲 | ShellAP | 115 | 650 | 1300 | 620 |
| `8in_mk12` | 8in Mk.12 主砲 | ShellAP | 62 | 520 | 1150 | 560 |
| `8in_mk16` | 8in Mk.16 速射砲 | ShellAP | 66 | 530 | 800 | 570 |
| `6in_47` | 6in/47 Mk.16 砲 | ShellHE | 47 | 470 | 800 | 560 |
| `5in_38_twin` | 5in/38 連装両用砲 | ShellHE | 33 | 420 | 550 | 540 |
| `mk15_torpedo` | Mk.15 魚雷 | Torpedo | 170 | 320 | 4500 | 280 |
| `depth_charge` | 爆雷投射機 | DepthCharge | 140 | 80 | 2200 | 0 |
| `3in_50` | 3in/50 砲 | ShellHE | 26 | 380 | 600 | 500 |
| `mk14_torpedo` | Mk.14 魚雷 (潜水艦) | Torpedo | 130 | 380 | 8000 | 260 |

## Notes

- 遠距離砲戦が得意 (16in 主砲の射程 650 は全艦中最長)。
- 空母 Essex の艦載機は Sprint 5 で実装。現状は 5in 両用砲のみ。
- 架空艦 (`fictional: true`) は工廠の研究「架空艦計画」で建造可能になり、敵艦隊には出現しない (Sprint 10)。

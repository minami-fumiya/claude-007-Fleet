# Regia Marina (イタリア海軍) — Ship Roster

Source of truth: `src/data/ships/rm.json`. Stats use the game scale (Yamato = HP 800 / armor 65 / speed 120), not historical units.

| id | 艦名 | 艦種 | HP | 装甲 | 速力 | 武装 |
|---|---|---|---|---|---|---|
| `vittorio_veneto` | ヴィットリオ・ヴェネト (Vittorio Veneto) | Battleship | 760 | 61 | 150 | 38.1cm 50 口径 3 連装砲, 15.2cm 55 口径砲 |
| `roma` | ローマ (Roma) | Battleship | 765 | 61 | 148 | 38.1cm 50 口径 3 連装砲, 15.2cm 55 口径砲 |
| `conte_di_cavour` | コンテ・ディ・カヴール (Conte di Cavour) | Battleship | 630 | 48 | 135 | 32cm 44 口径砲, 12cm 50 口径連装砲 |
| `zara` | ザラ (Zara) | Cruiser (重巡洋艦) | 425 | 43 | 168 | 20.3cm 連装砲, 10cm 47 口径連装高角砲 |
| `trento` | トレント (Trento) | Cruiser (重巡洋艦) | 390 | 34 | 180 | 20.3cm 連装砲, 53.3cm SI 270 魚雷 |
| `garibaldi` | ジュゼッペ・ガリバルディ (Giuseppe Garibaldi) | Cruiser (軽巡洋艦) | 360 | 32 | 172 | 15.2cm 55 口径砲, 53.3cm SI 270 魚雷 |
| `aviere` | アヴィエーレ (Aviere) | Destroyer | 215 | 14 | 245 | 12cm 50 口径連装砲, 53.3cm SI 270 魚雷, 爆雷投射機 |
| `maestrale` | マエストラーレ (Maestrale) | Destroyer | 205 | 14 | 240 | 12cm 50 口径連装砲, 53.3cm SI 270 魚雷, 爆雷投射機 |
| `aquila` | アクィラ (Aquila) | Carrier (架空) | 520 | 30 | 165 | 13.5cm 45 口径砲 |
| `marcello` | マルチェロ (Marcello) | Submarine | 150 | 6 | 145 | 53.3cm 魚雷 (潜水艦) |

## Weapons

| id | 名称 | 種別 | 火力 | 射程 | 装填 (ms) | 弾速 |
|---|---|---|---|---|---|---|
| `381mm_m1934` | 38.1cm 50 口径 3 連装砲 | ShellAP | 112 | 620 | 1500 | 620 |
| `152mm_m1934` | 15.2cm 55 口径砲 | ShellHE | 46 | 470 | 900 | 550 |
| `320mm_m1936` | 32cm 44 口径砲 | ShellAP | 90 | 560 | 1300 | 600 |
| `120mm_m1926` | 12cm 50 口径連装砲 | ShellHE | 35 | 410 | 800 | 520 |
| `203mm_ansaldo` | 20.3cm 連装砲 | ShellAP | 64 | 520 | 1200 | 560 |
| `100mm_m1928` | 10cm 47 口径連装高角砲 | ShellHE | 30 | 400 | 700 | 520 |
| `533mm_si270` | 53.3cm SI 270 魚雷 | Torpedo | 165 | 320 | 4500 | 285 |
| `depth_charge` | 爆雷投射機 | DepthCharge | 140 | 80 | 2200 | 0 |
| `135mm_m1938` | 13.5cm 45 口径砲 | ShellHE | 38 | 430 | 850 | 530 |
| `533mm_sub_torpedo` | 53.3cm 魚雷 (潜水艦) | Torpedo | 125 | 370 | 8000 | 255 |

## Notes

- Littorio 級 (Vittorio Veneto・Roma) は 38.1cm 砲の高速戦艦。Conte di Cavour は近代化改装された旧式戦艦。
- Aquila は完成直前で終戦を迎えたため架空艦 (`fictional: true`)。機動部隊戦では戦艦が旗艦になる。
- Zara は魚雷を持たない代わりに 10cm 高角砲で対駆逐艦火力を確保。
- AI (`TACTICS[RM]`): 距離を取って戦い、損傷すると早めに離脱する (現存艦隊主義)。

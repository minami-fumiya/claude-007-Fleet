# Marine nationale (フランス海軍) — Ship Roster

Source of truth: `src/data/ships/fr.json`. Stats use the game scale (Yamato = HP 800 / armor 65 / speed 120), not historical units.

| id | 艦名 | 艦種 | HP | 装甲 | 速力 | 武装 |
|---|---|---|---|---|---|---|
| `richelieu` | リシュリュー (Richelieu) | Battleship | 765 | 62 | 150 | 38cm Mle1935 4 連装砲, 15.2cm Mle1930 砲 |
| `dunkerque` | ダンケルク (Dunkerque) | Battleship (巡洋戦艦) | 640 | 52 | 170 | 33cm Mle1931 4 連装砲, 13cm Mle1932 両用砲 |
| `strasbourg` | ストラスブール (Strasbourg) | Battleship (巡洋戦艦) | 650 | 53 | 170 | 33cm Mle1931 4 連装砲, 13cm Mle1932 両用砲 |
| `algerie` | アルジェリー (Algérie) | Cruiser (重巡洋艦) | 420 | 42 | 172 | 20.3cm Mle1924 主砲, 55cm 23DT 魚雷 |
| `dupleix` | デュプレクス (Dupleix) | Cruiser (重巡洋艦) | 390 | 34 | 178 | 20.3cm Mle1924 主砲, 55cm 23DT 魚雷 |
| `la_galissonniere` | ラ・ガリソニエール (La Galissonnière) | Cruiser (軽巡洋艦) | 350 | 30 | 180 | 15.2cm Mle1930 砲, 55cm 23DT 魚雷 |
| `le_fantasque` | ル・ファンタスク (Le Fantasque) | Destroyer | 235 | 14 | 265 | 13.86cm Mle1929 砲, 55cm 23DT 魚雷, 爆雷投射機 |
| `mogador` | モガドール (Mogador) | Destroyer | 240 | 14 | 255 | 13.86cm Mle1929 砲, 55cm 23DT 魚雷, 爆雷投射機 |
| `bearn` | ベアルン (Béarn) | Carrier | 490 | 30 | 115 | 15.5cm Mle1920 砲 |
| `surcouf` | シュルクーフ (Surcouf) | Submarine | 175 | 7 | 135 | 55cm 魚雷 (潜水艦) |

## Weapons

| id | 名称 | 種別 | 火力 | 射程 | 装填 (ms) | 弾速 |
|---|---|---|---|---|---|---|
| `380mm_m1935` | 38cm Mle1935 4 連装砲 | ShellAP | 110 | 620 | 1450 | 610 |
| `152mm_m1930` | 15.2cm Mle1930 砲 | ShellHE | 46 | 460 | 900 | 550 |
| `330mm_m1931` | 33cm Mle1931 4 連装砲 | ShellAP | 88 | 560 | 1150 | 620 |
| `130mm_m1932` | 13cm Mle1932 両用砲 | ShellHE | 36 | 420 | 800 | 540 |
| `203mm_m1924` | 20.3cm Mle1924 主砲 | ShellAP | 63 | 510 | 1200 | 560 |
| `550mm_torpedo` | 55cm 23DT 魚雷 | Torpedo | 170 | 330 | 4500 | 285 |
| `138mm_m1929` | 13.86cm Mle1929 砲 | ShellHE | 40 | 420 | 950 | 530 |
| `depth_charge` | 爆雷投射機 | DepthCharge | 140 | 80 | 2200 | 0 |
| `155mm_m1920` | 15.5cm Mle1920 砲 | ShellHE | 45 | 440 | 1000 | 540 |
| `550mm_sub_torpedo` | 55cm 魚雷 (潜水艦) | Torpedo | 125 | 370 | 8000 | 255 |

## Notes

- 戦艦は 4 連装砲塔を前部に集中配置した設計 (Richelieu・Dunkerque)。Dunkerque 級は巡洋戦艦 (`BattleCruiser`) として表示する。
- 大型駆逐艦 (contre-torpilleur) の Le Fantasque・Mogador は高速で砲力が高い。
- Béarn は低速の旧式空母。Surcouf は 20.3cm 砲を持つ潜水巡洋艦だが、ゲームでは魚雷のみ。
- AI (`TACTICS[FR]`): 主力艦を狙う高速の砲撃戦 (Sprint 12)。

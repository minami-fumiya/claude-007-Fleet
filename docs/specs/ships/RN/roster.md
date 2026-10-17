# Royal Navy (英国海軍) — Ship Roster

Source of truth: `src/data/ships/rn.json`. Stats use the game scale (Yamato = HP 800 / armor 65 / speed 120), not historical units.

| id | 艦名 | 艦種 | HP | 装甲 | 速力 | 武装 |
|---|---|---|---|---|---|---|
| `hood` | フッド (Hood) | Battleship | 720 | 50 | 160 | 15in Mk.I 主砲, 4.5in Mk.I 両用砲 |
| `king_george_v` | キング・ジョージ5世 (King George V) | Battleship | 735 | 60 | 140 | 14in Mk.VII 4 連装砲, 4.5in Mk.I 両用砲 |
| `warspite` | ウォースパイト (Warspite) | Battleship | 690 | 56 | 128 | 15in Mk.I 主砲, 6in Mk.XXIII 砲 |
| `rodney` | ロドニー (Rodney) | Battleship | 750 | 60 | 115 | 16in Mk.I 主砲, 6in Mk.XXIII 砲 |
| `lion` | ライオン (Lion) | Battleship (架空) | 820 | 61 | 150 | 16in Mk.II 主砲, 4.5in Mk.I 両用砲 |
| `belfast` | ベルファスト (Belfast) | Cruiser | 410 | 38 | 180 | 6in Mk.XXIII 砲, Mk.VIII 魚雷 |
| `southampton` | サウサンプトン (Southampton) | Cruiser | 385 | 36 | 178 | 6in Mk.XXIII 砲, Mk.VIII 魚雷 |
| `cossack` | コサック (Cossack) | Destroyer | 225 | 14 | 245 | 4.7in Mk.XII 砲, Mk.VIII 魚雷, 爆雷投射機 |
| `javelin` | ジャベリン (Javelin) | Destroyer | 215 | 14 | 245 | 4.7in Mk.XII 砲, Mk.VIII 魚雷, 爆雷投射機 |
| `illustrious` | イラストリアス (Illustrious) | Carrier | 510 | 40 | 150 | 4.5in Mk.I 両用砲 |
| `ark_royal` | アーク・ロイヤル (Ark Royal) | Carrier | 495 | 30 | 160 | 4.5in Mk.I 両用砲 |
| `truant` | トルーアント (Truant) | Submarine | 150 | 6 | 150 | Mk.VIII 魚雷 (潜水艦) |
| `upholder` | アップホルダー (Upholder) | Submarine | 135 | 5 | 140 | Mk.VIII 魚雷 (潜水艦) |

## Weapons

| id | 名称 | 種別 | 火力 | 射程 | 装填 (ms) | 弾速 |
|---|---|---|---|---|---|---|
| `15in_mk1` | 15in Mk.I 主砲 | ShellAP | 100 | 590 | 1500 | 600 |
| `4_5in_mk1` | 4.5in Mk.I 両用砲 | ShellHE | 30 | 420 | 700 | 540 |
| `14in_mk7` | 14in Mk.VII 4 連装砲 | ShellAP | 98 | 580 | 1300 | 600 |
| `6in_mk23` | 6in Mk.XXIII 砲 | ShellHE | 48 | 480 | 850 | 560 |
| `16in_mk1` | 16in Mk.I 主砲 | ShellAP | 110 | 600 | 1650 | 580 |
| `16in_mk2` | 16in Mk.II 主砲 | ShellAP | 116 | 630 | 1450 | 600 |
| `mk8_torpedo` | Mk.VIII 魚雷 | Torpedo | 165 | 330 | 4500 | 280 |
| `4_7in_mk12` | 4.7in Mk.XII 砲 | ShellHE | 33 | 410 | 750 | 530 |
| `depth_charge` | 爆雷投射機 | DepthCharge | 140 | 80 | 2200 | 0 |
| `mk8_sub_torpedo` | Mk.VIII 魚雷 (潜水艦) | Torpedo | 125 | 370 | 8000 | 255 |

## Notes

- 戦艦は射程・火力のバランス型。King George V の 14in 4 連装砲は装填が速い。
- Illustrious は装甲飛行甲板のため空母としては装甲が厚い。
- ファイル名は他国に合わせて `rn.json` (Todo の `royal-navy.json` から変更)。
- 架空艦 (`fictional: true`) は工廠の研究「架空艦計画」で建造可能になり、敵艦隊には出現しない (Sprint 10)。

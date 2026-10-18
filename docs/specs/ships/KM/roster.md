# Kriegsmarine (ドイツ海軍) — Ship Roster

Source of truth: `src/data/ships/km.json`. Stats use the game scale (Yamato = HP 800 / armor 65 / speed 120), not historical units.

| id | 艦名 | 艦種 | HP | 装甲 | 速力 | 武装 |
|---|---|---|---|---|---|---|
| `bismarck` | ビスマルク (Bismarck) | Battleship | 770 | 62 | 145 | 38cm SK C/34 主砲, 15cm SK C/28 副砲 |
| `tirpitz` | ティルピッツ (Tirpitz) | Battleship | 775 | 63 | 143 | 38cm SK C/34 主砲, 15cm SK C/28 副砲 |
| `scharnhorst` | シャルンホルスト (Scharnhorst) | Battleship (巡洋戦艦) | 640 | 55 | 175 | 28cm SK C/34 主砲, 15cm SK C/28 副砲 |
| `gneisenau` | グナイゼナウ (Gneisenau) | Battleship (巡洋戦艦) | 640 | 55 | 173 | 28cm SK C/34 主砲, 15cm SK C/28 副砲 |
| `h39` | H級 (H-39) | Battleship (架空) | 830 | 64 | 150 | 40.6cm SK C/34 主砲, 15cm SK C/28 副砲 |
| `prinz_eugen` | プリンツ・オイゲン (Prinz Eugen) | Cruiser (重巡洋艦) | 410 | 41 | 178 | 20.3cm SK C/34 主砲, G7a 魚雷 |
| `admiral_hipper` | アドミラル・ヒッパー (Admiral Hipper) | Cruiser (重巡洋艦) | 400 | 40 | 176 | 20.3cm SK C/34 主砲, G7a 魚雷 |
| `deutschland` | ドイッチュラント (Deutschland) | Cruiser (重巡洋艦) | 430 | 38 | 160 | 28cm SK C/28 主砲, 15cm SK C/28 副砲 |
| `admiral_graf_spee` | アドミラル・グラーフ・シュペー (Admiral Graf Spee) | Cruiser (重巡洋艦) | 425 | 38 | 160 | 28cm SK C/28 主砲, 15cm SK C/28 副砲 |
| `blucher` | ブリュッヒャー (Blücher) | Cruiser (重巡洋艦) | 400 | 40 | 175 | 20.3cm SK C/34 主砲, G7a 魚雷 |
| `nurnberg` | ニュルンベルク (Nürnberg) | Cruiser (軽巡洋艦) | 350 | 30 | 180 | 15cm SK C/25 砲, G7a 魚雷 |
| `emden` | エムデン (Emden) | Cruiser (軽巡洋艦) | 330 | 26 | 165 | 15cm SK C/16 砲, G7a 魚雷 |
| `z1` | Z1 レーベレヒト・マース (Z1) | Destroyer | 215 | 15 | 235 | 12.7cm SK C/34 砲, G7a 魚雷, 爆雷投射機 |
| `z23` | Z23 (Z23) | Destroyer | 225 | 15 | 230 | 15cm TbtsK C/36 砲, G7a 魚雷, 爆雷投射機 |
| `z20` | Z20 カール・ガルスター (Z20) | Destroyer | 215 | 15 | 235 | 12.7cm SK C/34 砲, G7a 魚雷, 爆雷投射機 |
| `graf_zeppelin` | グラーフ・ツェッペリン (Graf Zeppelin) | Carrier | 480 | 32 | 150 | 15cm SK C/28 副砲 |
| `u_boat_viic` | U ボート VIIC 型 (Type VIIC) | Submarine | 135 | 5 | 145 | G7e 魚雷 (潜水艦) |
| `u_boat_ixc` | U ボート IXC 型 (Type IXC) | Submarine | 150 | 6 | 150 | G7e 魚雷 (潜水艦) |
| `u_boat_xxi` | U ボート XXI 型 (Type XXI) | Submarine | 160 | 6 | 165 | G7e 魚雷 (潜水艦) |

## Weapons

| id | 名称 | 種別 | 火力 | 射程 | 装填 (ms) | 弾速 |
|---|---|---|---|---|---|---|
| `38cm_skc34` | 38cm SK C/34 主砲 | ShellAP | 108 | 600 | 1400 | 600 |
| `15cm_skc28` | 15cm SK C/28 副砲 | ShellHE | 45 | 450 | 1000 | 540 |
| `28cm_skc34` | 28cm SK C/34 主砲 | ShellAP | 85 | 540 | 1100 | 640 |
| `40_6cm_skc34` | 40.6cm SK C/34 主砲 | ShellAP | 120 | 630 | 1450 | 610 |
| `20cm_skc34` | 20.3cm SK C/34 主砲 | ShellAP | 64 | 520 | 1150 | 560 |
| `g7a_torpedo` | G7a 魚雷 | Torpedo | 175 | 330 | 4500 | 290 |
| `28cm_skc28` | 28cm SK C/28 主砲 | ShellAP | 80 | 530 | 1250 | 610 |
| `15cm_skc25` | 15cm SK C/25 砲 | ShellHE | 46 | 460 | 900 | 550 |
| `15cm_skc16` | 15cm SK C/16 砲 | ShellHE | 44 | 450 | 950 | 540 |
| `12cm_skc34` | 12.7cm SK C/34 砲 | ShellHE | 34 | 400 | 800 | 520 |
| `depth_charge` | 爆雷投射機 | DepthCharge | 140 | 80 | 2200 | 0 |
| `15cm_tbk_c36` | 15cm TbtsK C/36 砲 | ShellHE | 44 | 440 | 1050 | 530 |
| `g7e_torpedo` | G7e 魚雷 (潜水艦) | Torpedo | 125 | 360 | 8000 | 250 |

## Notes

- 戦艦は装甲が厚く、巡洋艦 Prinz Eugen も魚雷を装備。
- Graf Zeppelin は史実では未完成のため架空扱い。艦載機は Sprint 5。
- 架空艦 (`fictional: true`) は工廠の研究「架空艦計画」で建造可能になり、敵艦隊には出現しない (Sprint 10)。

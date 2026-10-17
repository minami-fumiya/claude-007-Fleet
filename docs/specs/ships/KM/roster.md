# Kriegsmarine (ドイツ海軍) — Ship Roster

Source of truth: `src/data/ships/km.json`. Stats use the game scale (Yamato = HP 500 / armor 65 / speed 120), not historical units.

| id | 艦名 | 艦種 | HP | 装甲 | 速力 | 武装 |
|---|---|---|---|---|---|---|
| `bismarck` | ビスマルク (Bismarck) | Battleship | 480 | 62 | 145 | 38cm SK C/34 主砲, 15cm SK C/28 副砲 |
| `tirpitz` | ティルピッツ (Tirpitz) | Battleship | 485 | 63 | 143 | 38cm SK C/34 主砲, 15cm SK C/28 副砲 |
| `prinz_eugen` | プリンツ・オイゲン (Prinz Eugen) | Cruiser | 255 | 41 | 178 | 20.3cm SK C/34 主砲, G7a 魚雷 |
| `z1` | Z1 レーベレヒト・マース (Z1) | Destroyer | 135 | 15 | 235 | 12.7cm SK C/34 砲, G7a 魚雷, 爆雷投射機 |
| `graf_zeppelin` | グラーフ・ツェッペリン (Graf Zeppelin) | Carrier | 300 | 32 | 150 | 15cm SK C/28 副砲 |
| `u_boat_viic` | U ボート VIIC 型 (Type VIIC) | Submarine | 85 | 5 | 145 | G7e 魚雷 (潜水艦) |

## Weapons

| id | 名称 | 種別 | 火力 | 射程 | 装填 (ms) | 弾速 |
|---|---|---|---|---|---|---|
| `38cm_skc34` | 38cm SK C/34 主砲 | ShellAP | 108 | 600 | 1400 | 600 |
| `15cm_skc28` | 15cm SK C/28 副砲 | ShellHE | 45 | 450 | 1000 | 540 |
| `20cm_skc34` | 20.3cm SK C/34 主砲 | ShellAP | 64 | 520 | 1150 | 560 |
| `g7a_torpedo` | G7a 魚雷 | Torpedo | 175 | 330 | 4500 | 290 |
| `12cm_skc34` | 12.7cm SK C/34 砲 | ShellHE | 34 | 400 | 800 | 520 |
| `depth_charge` | 爆雷投射機 | DepthCharge | 140 | 60 | 3000 | 0 |
| `g7e_torpedo` | G7e 魚雷 (潜水艦) | Torpedo | 170 | 360 | 4800 | 250 |

## Notes

- 戦艦は装甲が厚く、巡洋艦 Prinz Eugen も魚雷を装備。
- Graf Zeppelin は史実では未完成のため架空扱い。艦載機は Sprint 5。

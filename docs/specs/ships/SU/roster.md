# Soviet Navy (ソ連海軍) — Ship Roster

Source of truth: `src/data/ships/su.json`. Stats use the game scale (Yamato = HP 800 / armor 65 / speed 120), not historical units.

| id | 艦名 | 艦種 | HP | 装甲 | 速力 | 武装 |
|---|---|---|---|---|---|---|
| `marat` | マラート (Marat) | Battleship | 680 | 52 | 125 | 30.5cm 52 口径 3 連装砲, 12cm 50 口径砲 |
| `oktyabrskaya_revolutsiya` | オクチャブリスカヤ・レボリューツィヤ (Oktyabrskaya Revolutsiya) | Battleship | 690 | 53 | 125 | 30.5cm 52 口径 3 連装砲, 12cm 50 口径砲 |
| `sovetsky_soyuz` | ソビエツキー・ソユーズ (Sovetsky Soyuz) | Battleship (架空) | 840 | 64 | 140 | 40.6cm B-37 3 連装砲, 15.2cm B-38 砲 |
| `kirov` | キーロフ (Kirov) | Cruiser (軽巡洋艦) | 400 | 34 | 180 | 18cm B-1-P 主砲, 53-38 魚雷 |
| `maxim_gorky` | マクシム・ゴーリキー (Maxim Gorky) | Cruiser (軽巡洋艦) | 405 | 35 | 178 | 18cm B-1-P 主砲, 53-38 魚雷 |
| `tashkent` | タシュケント (Tashkent) | Destroyer | 230 | 14 | 260 | 13cm B-13 砲, 53-38 魚雷, 爆雷投射機 |
| `gnevny` | グネフヌイ (Gnevny) | Destroyer | 210 | 14 | 240 | 13cm B-13 砲, 53-38 魚雷, 爆雷投射機 |
| `project71` | 71号計画空母 (Project 71) | Carrier (軽空母 · 架空) | 470 | 22 | 160 | 10cm B-34 両用砲 |
| `shch` | Shch 型潜水艦 (Shchuka) | Submarine | 140 | 5 | 140 | 53-38 魚雷 (潜水艦) |
| `s13` | S-13 (S-13) | Submarine | 150 | 6 | 150 | 53-38 魚雷 (潜水艦) |

## Weapons

| id | 名称 | 種別 | 火力 | 射程 | 装填 (ms) | 弾速 |
|---|---|---|---|---|---|---|
| `305mm_obukhov` | 30.5cm 52 口径 3 連装砲 | ShellAP | 94 | 570 | 1050 | 610 |
| `120mm_vickers` | 12cm 50 口径砲 | ShellHE | 34 | 400 | 800 | 520 |
| `406mm_b37` | 40.6cm B-37 3 連装砲 | ShellAP | 120 | 640 | 1450 | 600 |
| `152mm_b38` | 15.2cm B-38 砲 | ShellHE | 46 | 460 | 950 | 550 |
| `180mm_b1p` | 18cm B-1-P 主砲 | ShellAP | 58 | 530 | 1000 | 600 |
| `53_38_torpedo` | 53-38 魚雷 | Torpedo | 165 | 320 | 4500 | 285 |
| `130mm_b13` | 13cm B-13 砲 | ShellHE | 38 | 420 | 900 | 530 |
| `depth_charge` | 爆雷投射機 | DepthCharge | 140 | 80 | 2200 | 0 |
| `100mm_b34` | 10cm B-34 両用砲 | ShellHE | 30 | 410 | 700 | 520 |
| `53_38_sub_torpedo` | 53-38 魚雷 (潜水艦) | Torpedo | 125 | 360 | 8000 | 250 |

## Notes

- Gangut 級 (Marat・Oktyabrskaya Revolutsiya) は 30.5cm 砲 12 門の手数で、他国の旗艦と釣り合うよう装填を速くしている (balance.md)。
- 空母は存在しなかったため、71 号計画空母は架空艦 (`fictional: true`)。Sovetsky Soyuz も未完成のため架空艦。
- 架空艦は工廠の研究「架空艦計画」で建造可能になり、敵艦隊には出現しない。機動部隊戦では戦艦が旗艦になる。
- AI (`TACTICS[SU]`): 接近して最後まで戦う (撤退しにくい)。

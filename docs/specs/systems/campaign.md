# Campaign & Operations Spec (Sprint 8)

Implementation: `src/data/campaign.json`, `CampaignSystem.ts`, `ObjectiveSystem.ts`, `MapSystem.ts` (pure, tested),
`CampaignMapScene`, battle maps in `src/data/maps/*.json`, convoy / shore target data in `src/data/special.json`.

## Flow
鎮守府 → 作戦 (strategic map) → select an area → 出撃準備 → Fleet Builder shows the operation briefing (the enemy,
map, weather and time come from the area) → battle → results show 海域攻略 / 作戦失敗 → 作戦地図へ戻る.
`演習` (free battle) keeps the old opponent / mode / weather pickers. Cleared areas are saved in `progress.campaign`.

## Theaters
| Theater | Areas (in order) |
|---|---|
| 太平洋 (vs USN) | 南洋前哨 → 諸島沖海戦 → 輸送船団護衛 (convoy) → 海峡夜戦 (night) → 機動部隊決戦 (carrier) → 環礁要塞攻略 (bombard) |
| 大西洋 (vs KM) | 群狼の海 (ASW) → 北大西洋船団 (convoy, storm) → ビスマルク追撃 (storm) → 沿岸要塞砲撃 (bombard, fog) → フィヨルドの巨艦 (night) |
| 地中海 (vs RN, Sprint 10) | マルタ沖船団 (convoy vs subs) → シドラ湾夜戦 (night) → タラント港砲撃 (bombard) → セイロン沖海戦 (carrier, インド洋) → 東洋艦隊決戦 |
An area unlocks when every area in `requires` is cleared; the first clear pays the area's `reward`.

## Objectives (`ObjectiveSystem`)
| Objective | Victory | Defeat |
|---|---|---|
| Annihilate | every enemy warship sunk | flagship sunk |
| Convoy | ≥ 2 of the 3 merchant ships escape off the east edge (or every attacker is sunk with ≥ 2 still afloat) | flagship sunk, or 2 merchant ships lost |
| Bombard | every shore target destroyed (enemy ships may remain) | flagship sunk |

- **Convoy**: 3 unarmed 輸送船 (HP 170, speed 75) start on the west edge with the escort fleet beside them and steer east
  (around islands). The enemy AI scores convoy ships +0.6, so it goes for them first.
- **Bombard**: 3 沿岸砲台 (fire back, 540 px), a 港湾施設 and a 飛行場 on the biggest island. Torpedoes can't reach them;
  shells fly over land, torpedoes stop on it.
- The HUD shows the objective's progress under the weather chip.

## Battle maps (`MapSystem`)
Maps use normalised coordinates (x, y in 0..1 of the world; r in units of the shorter side) so they fit both the
landscape (2400×1440) and portrait (1440×2240) worlds. Tiled was not used (no editor in this environment).
| Map | Features |
|---|---|
| open-sea | none |
| archipelago | three islands with shoal water |
| strait | two large islands forming a channel, a northward current through it |
| atoll | a large island (bombard target), two islets, an eastward current band |
| convoy-route | islands top and bottom, an eastward current along the route |

- Islands are solid (static circle bodies); ships collide, AI / AUTO / waypoint steering looks 170 px ahead and turns
  to the nearest clear heading. The joystick stays direct.
- Shoals halve speed. Currents displace ships every frame (px/s).

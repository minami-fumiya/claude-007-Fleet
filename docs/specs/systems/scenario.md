# Historical Scenarios Spec (Sprint 9)

Implementation: `src/data/scenarios/*.json` (loaded in PreloadScene, cached as `scenarios`), `ScenarioSystem.ts` and
`ObjectiveSystem.ts` (pure, tested), `ScenarioScene`, scenario setup in `BattleScene`.

## Flow
鎮守府 → 史実 → pick a scenario and a side → 作戦開始 → battle → results (再戦 / 史実シナリオへ戻る).
Scenarios are exhibitions, in both directions: ships start fresh (full HP, proficiency 0, no upgrades / research /
refits; captains still apply), and nothing — resources, damage, captain XP, proficiency, service record — is saved.

## Data (`IScenario`)
| Field | Meaning |
|---|---|
| `map`, `weather`, `time` | Fixed battle conditions |
| `forces.A` / `forces.B` | Nation, ship ids (flagship first) and one normalised placement `{x, y, angle}` per ship |
| `sides[]` | Playable sides: which force, label, `objective`, `brief`, and optional `targets`, `zone`, `timeLimitSec`, `enemyGoesForZone` |

Placements and zones use normalised coordinates (`x`, `y` of the world size, `r` of the shorter side), like maps.
A test checks every placement and zone is at sea in both the landscape and portrait worlds.

## Scenarios
| Scenario | Map / conditions | Sides |
|---|---|---|
| ミッドウェー海戦 | open-sea, clear, day — 赤城・加賀・利根 vs Enterprise・Essex・Fletcher | Both: SinkTargets (the enemy carriers) in 6 min |
| レイテ沖海戦 | strait, overcast, day — 大和・長門・金剛 vs Enterprise・Fletcher・Gearing | IJN: Breakthrough to レイテ湾 in 5 min · USN: Delay (keep 大和 out of the zone for 4 min, or sink it) |
| 第三次ソロモン海戦 (Sprint 10) | archipelago, clear, night — 金剛 (霧島の代役)・愛宕・吹雪 vs North Carolina (Washington の代役)・Fletcher ×2 | IJN: Breakthrough to 飛行場沖 (diagonal across the islands, 5 min) · USN: Delay (keep 金剛 out for 4 min, or sink it) |
| 北岬沖海戦 (Sprint 10) | open-sea, overcast, night — Scharnhorst alone vs KGV (Duke of York の代役)・Belfast・Javelin closing from both flanks | RN: PreventEscape (sink Scharnhorst before it reaches ノルウェー沿岸, 5 min) · KM: Breakthrough |
| ビスマルク追撃戦 | open-sea, storm, day — Bismarck・Prinz Eugen vs KGV・Hood・Cossack | RN: PreventEscape (sink Bismarck before it reaches the escape area, 5 min) · KM: Breakthrough |

## Objectives (`evaluateObjective`)
Losing the player flagship is always a defeat.

| Objective | Victory | Defeat |
|---|---|---|
| SinkTargets | every target sunk | time up |
| Breakthrough | player flagship inside the zone | time up |
| PreventEscape | every target sunk | a target reaches the zone, or time up |
| Delay | time up, or the target sunk | a target reaches the zone |

- `enemyGoesForZone`: the AI steers its ships at the zone (`AISystem.goal`) instead of hunting, firing at whatever
  is in range on the way.
- The HUD shows the objective text with the remaining time; the zone is drawn on the sea as a dashed gold ring.

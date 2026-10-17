# Captain Spec (Sprint 5)

Implementation: `src/types/Captain.ts`, `src/data/captains.json`, `src/systems/CaptainSystem.ts` (pure, tested),
progress in `src/utils/ProgressStore.ts`.

## Roster
Three captains per nation, one per speciality (fictional names). Assigned per fleet slot in the Fleet Builder:
tap 艦長を任命 to cycle through the nation's free captains (a captain commands one ship at a time).

## Levels
| Level | Total XP |
|---|---|
| 1 | 0 |
| 2 | 100 |
| 3 | 300 |
| 4 | 600 |
| n | 100 × n(n−1)/2 (max 10) |

## Battle XP
`40 + 30 × enemies sunk (by the fleet) + 60 if victorious`, ×1.2 for the flagship's captain, ×0.5 if their ship sank.
Shown on the results screen (gold with ▲ LEVEL UP when a level is gained) and saved immediately.

## Specialities (bonus scales with level `lv`)
| Skill | 表示 | Effect |
|---|---|---|
| Gunnery | 砲術 | gun firepower ×(1 + 0.03·lv), gun reload ×(1 − 0.01·lv) |
| Torpedo | 水雷 | torpedo firepower ×(1 + 0.04·lv) |
| Engineering | 機関 | speed ×(1 + 0.02·lv), HP ×(1 + 0.01·lv) |

Captain bonuses combine with upgrades (`CustomizationSystem.combineModifiers`) and apply to player ships at battle start.

# Customization (改装) Spec (Sprint 5)

Implementation: `src/types/Modifiers.ts`, `src/data/upgrades.json`, `src/systems/CustomizationSystem.ts` (pure, tested),
`src/scenes/CustomizationScene.ts` (the planned `ui/CustomizationPanel.ts` was folded into the scene).

## Flow
Fleet Builder → 改装 › → choose one of the fleet's ships → tap upgrades to fit / remove (2 slots per ship) →
‹ 編成へ. Fitted upgrades are saved per ship id in the player's progress (localStorage) and the status panel
previews base → modified values.

## Upgrades
| id | 名称 | Effect |
|---|---|---|
| `fire_director` | 射撃指揮装置 | gun reload ×0.9 |
| `heavy_shells` | 強装薬 | gun firepower ×1.12, gun reload ×1.05 |
| `torpedo_mod` | 魚雷改良 | torpedo firepower ×1.15 |
| `extra_armor` | 追加装甲 | armor +8, speed ×0.95 |
| `boiler` | 機関強化 | speed ×1.08 |
| `damage_control` | 応急修理班 | HP ×1.1 |
| `radar` | 水上レーダー | vision ×1.2 |
| `aa_guns` | 対空機銃増設 | AA strength ×1.4 |

## Modifier model
`IShipModifiers` = multipliers (HP, speed, gun power, gun reload, torpedo power, vision, AA) + armor addition.
Sources are combined by multiplying multipliers and adding additions; `applyToStats` / `applyToWeapons` produce
the battle copies (weapon ids are kept so each weapon keeps its own reload timer).

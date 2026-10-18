# Proficiency & Remodel Spec (Sprint 9)

Implementation: `ProficiencySystem.ts`, `RefitSystem.ts` (pure, tested), `src/data/refits.json`,
remodel panel in `CustomizationScene`, application in `BattleScene`. Saved in `progress.proficiency` / `progress.refits`.

## Proficiency (熟練度, 0–100 per ship)
- Gain after every campaign / free battle: `(10 + 4·sunk + 6·victory) × (survived ? 1 : 0.5) × max(0.1, 1 − p/150)`,
  rounded and clamped to 100. Gains slow as the crew improves.
- Effects: aim error × `1 − p/200` (veteran crews shoot twice as tight); incoming shells and torpedoes miss
  with chance `p × 0.0015` (max 15%).
- Labels: 新兵 < 20 ≤ 一般 < 50 ≤ 熟練 < 80 ≤ 精鋭.

## Remodel (改造) — Sprint 12: 改三 and special refits
Three stages per ship class (改 → 改二 → 改三). Each needs proficiency (30 / 70 / 90) and resources; a stage's effects
replace the previous stage's (not stacked) and combine with upgrades, research and captains through `IShipModifiers`.

| Class | 改 | 改二 | 改三 |
|---|---|---|---|
| Battleship | HP ×1.08, armor +3, guns ×1.05 | HP ×1.16, armor +6, guns ×1.1, AA ×1.3 | HP ×1.22, armor +7, guns ×1.14, reload ×0.96, AA ×1.5 |
| Cruiser | HP ×1.08, guns ×1.06, torpedoes ×1.05 | HP ×1.15, guns ×1.12, torpedoes ×1.1, AA ×1.25 | HP ×1.2, guns ×1.16, torpedoes ×1.14, AA ×1.4, vision ×1.05 |
| Destroyer | HP ×1.1, torpedoes ×1.08, speed ×1.03 | HP ×1.2, torpedoes ×1.16, speed ×1.05, guns ×1.08 | HP ×1.26, torpedoes ×1.22, speed ×1.06, guns ×1.1, sonar ×1.15, depth charges ×1.15 |
| Carrier | HP ×1.08, armor +3, AA ×1.2 | HP ×1.16, armor +6, AA ×1.45, vision ×1.1 | HP ×1.22, armor +8, AA ×1.6, vision ×1.12, air attack ×1.1, planes +1 |
| Submarine | HP ×1.1, torpedoes ×1.1 | HP ×1.2, torpedoes ×1.2, speed ×1.05 | HP ×1.25, torpedoes ×1.26, speed ×1.07 |

Costs are in `refits.json`. Remodelled ships are named with the suffix (`大和改三 (Yamato)`).

### Upgrade slots
Slots grow with the remodel stage: **2 → 3 (改) → 4 (改二 / 改三)** (`upgradeSlots(stage)` in `CustomizationSystem`).
`upgradeModifiers` / `toggleUpgrade` take the slot count; the battle and the refit screen pass `upgradeSlots(stage)`.

### Special refits (特別改装)
`refits.json` → `ships[shipId]` lists overrides of a class stage (`stage` 1–3) for one ship. An override may set
`suffix`, `cost`, `minProficiency`, `effects` (absolute, like class stages), a `label` (shown in the refit screen),
`swap` (`[{ from, to }]`, `to: null` removes the weapon; swaps of every reached stage apply) and `airWing`
(an embarked air wing from that stage on). Ids that are not in the ship data are ignored, so other workstreams' ships
(伊勢 / 日向) can be listed ahead of time. `refitShipData(table, ship, stage)` returns the rebuilt `IShipData`
(weapons, air wing) used by `BattleScene` and the refit preview; scenarios use the original build.

| Ship | Stage | Special refit |
|---|---|---|
| 大和 / 武蔵 | 改三 | 対空兵装強化: `15_5cm_triple` → `12cm_gun`, AA ×2.2 |
| 長門 | 改三 | 主砲射撃指揮の近代化: guns ×1.16, reload ×0.94 |
| 金剛 | 改二 / 改三 | 高速戦艦: speed ×1.06 / ×1.08 |
| 伊勢 / 日向 (if present) | 改三 | 航空戦艦: guns ×0.95, AA ×1.9, air wing 2 fighters + 3 dive bombers |
| アイオワ | 改三 | Mk.38 射撃管制レーダー: reload ×0.93, AA ×2.0, vision ×1.12 |
| ノースカロライナ | 改三 | 対空・射撃管制レーダー: AA ×2.0 |
| ビスマルク | 改三 | 防御強化: HP ×1.26, armor +10 |
| ティルピッツ | 改三 | 北の要塞: HP ×1.28, armor +10, AA ×1.9, speed ×0.97 |
| フッド | 改三 | 水平防御の大改装: HP ×1.28, armor +12 |
| キング・ジョージ5世 | 改三 | Type 284 レーダー射撃管制: reload ×0.93, vision ×1.15 |
| エンタープライズ | 改三 | 最終状態: air attack ×1.12, re-arm ×0.9, planes +1, night vision ×1.1 |
| 翔鶴 | 改三 | 装甲空母化: HP ×1.24, armor +12, air attack ×1.12, planes +1 |
| 赤城 | 改三 | 航空艤装の近代化: re-arm ×0.88, planes +1 |
| プリンツ・オイゲン | 改三 | レーダーと対空兵装: AA ×1.6, vision ×1.15 |
| 島風 | 改三 | 15 射線: torpedoes ×1.32, speed ×1.08 |
| 雪風 | 改三 | 幸運艦: HP ×1.3, sonar ×1.25, depth charges ×1.25 |

Balance: a special 改三 stays within ±25% (duel ratio) of the plain class 改三 on the same ship
(`tests/unit/ProgressionBalance.test.ts`).

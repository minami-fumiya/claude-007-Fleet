# Proficiency & Remodel Spec (Sprint 9)

Implementation: `ProficiencySystem.ts`, `RefitSystem.ts` (pure, tested), `src/data/refits.json`,
remodel panel in `CustomizationScene`, application in `BattleScene`. Saved in `progress.proficiency` / `progress.refits`.

## Proficiency (熟練度, 0–100 per ship)
- Gain after every campaign / free battle: `(10 + 4·sunk + 6·victory) × (survived ? 1 : 0.5) × max(0.1, 1 − p/150)`,
  rounded and clamped to 100. Gains slow as the crew improves.
- Effects: aim error × `1 − p/200` (veteran crews shoot twice as tight); incoming shells and torpedoes miss
  with chance `p × 0.0015` (max 15%).
- Labels: 新兵 < 20 ≤ 一般 < 50 ≤ 熟練 < 80 ≤ 精鋭.

## Remodel (改造)
Two stages per ship class (改 → 改二). Each needs proficiency (30 / 70) and resources; a stage's effects replace
the previous stage's (not stacked) and combine with upgrades, research and captains through `IShipModifiers`.

| Class | 改 | 改二 |
|---|---|---|
| Battleship | HP ×1.08, armor +3, guns ×1.05 | HP ×1.16, armor +6, guns ×1.1, AA ×1.3 |
| Cruiser | HP ×1.08, guns ×1.06, torpedoes ×1.05 | HP ×1.15, guns ×1.12, torpedoes ×1.1, AA ×1.25 |
| Destroyer | HP ×1.1, torpedoes ×1.08, speed ×1.03 | HP ×1.2, torpedoes ×1.16, speed ×1.05, guns ×1.08 |
| Carrier | HP ×1.08, armor +3, AA ×1.2 | HP ×1.16, armor +6, AA ×1.45, vision ×1.1 |
| Submarine | HP ×1.1, torpedoes ×1.1 | HP ×1.2, torpedoes ×1.2, speed ×1.05 |

Costs are in `refits.json`. Remodelled ships are named with the suffix (`大和改二 (Yamato)`).

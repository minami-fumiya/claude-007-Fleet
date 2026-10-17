# Fictional Ships, Service Record & Medals Spec (Sprint 10)

## Fictional ships (架空艦)
Implementation: `fictional: true` on ship JSON, `availableShips` / `FICTIONAL_TECH` in `ResearchSystem.ts`,
`EnemyFleetGenerator` filter, encyclopedia badge.

| Nation | Ship | Main guns | HP / armor / speed |
|---|---|---|---|
| IJN | 超大和型 (A-150) | 51cm 連装砲 (fp 135, reload 1750) | 880 / 70 / 120 |
| USN | モンタナ (Montana) | 16in Mk.7 4連装砲 (fp 115, reload 1300) | 830 / 63 / 135 |
| KM | H級 (H-39) | 40.6cm SK C/34 (fp 120, reload 1450) | 830 / 64 / 150 |
| RN | ライオン (Lion) | 16in Mk.II (fp 116, reload 1450) | 820 / 61 / 150 |

- Hidden from the Fleet Builder until the research **架空艦計画** (requires 砲術研究 II + ダメージコントロール;
  弾薬 2000 / 鋼材 3000 / ボーキ 600) is done. Never generated for the enemy and not used by campaign areas.
- Balance tests: each beats its nation's best historical battleship in the duel model (ratio 0.6–0.95) and the four
  stay within 0.7–1.4 of each other. The historical-balance invariants exclude them.

## Service record (戦績)
Implementation: `RecordSystem.ts` (pure, tested), `progress.record`, `RecordScene` (鎮守府 → 戦績).

Every campaign / free battle (not historical scenarios) adds: sortie, victory, perfect victory (no ship lost),
enemy warships sunk by class (convoy ships and shore targets don't count), damage dealt (sum of the player's
damage log) and best single-battle damage, ships lost.

## Medals
Checked after each battle; new ones are saved and shown on the results screen (`勲章授与 …`).

| Medal | Condition |
|---|---|
| 初陣勝利章 | first victory |
| 歴戦章 | 20 sorties |
| 完全勝利章 | 5 victories without losing a ship |
| 武功章 | 30 enemy ships sunk |
| 戦艦撃沈章 / 空母撃沈章 / 対潜章 | 5 battleships / 3 carriers / 5 submarines sunk |
| 大火力章 | 3000 damage in one battle |
| 太平洋 / 大西洋 / 地中海制覇章 | every area of that campaign theater cleared |

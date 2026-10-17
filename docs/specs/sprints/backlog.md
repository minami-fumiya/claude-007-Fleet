# Backlog — 未割り当てタスク

Tasks not yet assigned to a sprint. Review before each sprint planning.

## Deferred from Sprint Planning

- [ ] Custom domain configuration for Vercel
- [ ] Multiplayer support via WebSocket (Sprint 10+ TBD)
- [ ] Leaderboard / Achievement system
- [ ] Save/Load game state (localStorage)
- [x] Mobile touch control support (PR #11 / #12 で実装済み)
- [ ] Accessibility: color-blind mode, screen reader labels
- [ ] Performance profiling pass (60 fps target on mid-range hardware)
- [ ] Localization: English language toggle

## Deferred from Sprint 3

Sprint 3 は専用システム (FleetSystem / FormationSystem / EscortAISystem) + 5 隻構成で実装したため、
当初 `Todo.md` に計画していた以下は未実装のまま持ち越し。

- [ ] 艦種別エンティティ (`Battleship.ts` / `Cruiser.ts` / `Destroyer.ts` / `Carrier.ts` / `Submarine.ts`)
- [ ] IJN ロースター拡充 (長門 / 陸奥 / 金剛 / 愛宕 / 利根 / 島風 / 雪風 / 赤城 / 加賀 / 伊400 等)
- [ ] `src/entities/weapons/Torpedo.ts` (魚雷エンティティ。武器データ `torpedo_type93` は定義済み)
- [ ] 武器 JSON の分割 (`torpedoes.json` / `main-guns.json` / `secondary.json`)
- [ ] `src/ui/FleetPanel.ts` / `src/ui/components/ShipCard.ts`
- [ ] `docs/specs/ships/IJN/` 仕様書一式

# Nation Progress Spec (Sprint 12, WS-D: #15 #18 #25 #27 #28 #29 #30)

Implementation: `ProgressStore.ts` (save v2), `ResourceSystem.ts` (regen), `RankSystem.ts`, `ShipyardSystem.ts`,
`ProgressionSystem.ts` (exercise rules), `EnemyFleetGenerator.exerciseEnemyFleet`, scenes `HomeScene` (nation picker),
`ShipyardScene` (工廠 › 建造), `FleetBuilderScene`, `BattleScene`. All rules are pure and tested
(`NationProgress`, `RankSystem`, `ShipyardSystem`, `ExerciseRules`, `EarlyGameLoop` tests).

## Save v2 (#27) — `ww2fleet.progress.v2`
```
ISave {
  version: 2,
  current: Nation,                       // nation being played (its slot may not exist on a brand-new save)
  nations: { [Nation]?: INationProgress },
  record: IServiceRecord                 // shared by every nation (medals too); settings stay in their own key
}
INationProgress { resources, regenAt, damage, docks, research, ships /* owned ids */, upgrades, refits,
                  proficiency, captainXp, campaign /* cleared areas */, merit, rankFloor, docksOwned }
```
- Scenes use an `IProgress` **view** = current nation's slot + `nation` + shared `record`. `loadProgress()` returns it
  (with regeneration applied, saved straight away when it changed); `saveProgress(view)` writes it back into the
  view's own nation slot. Accessors: `currentNation(save)`, `progressView`, `withProgress`, `switchNation`,
  `isStarted`, `startedNations`, `loadSave` / `saveSave`.
- Nations are handled generically (`Nation` enum / `PLAYABLE_NATIONS`); new nations need no store change.
- **Migration**: when no v2 key exists the v1 key (`ww2fleet.progress.v1`, flat object) is read and migrated: every
  field goes into the IJN slot, which owns the whole IJN roster (fictional ships stay gated by 架空艦計画), the record
  becomes the shared record. The v1 key is never written or deleted. Save codes hold the whole v2 save; old (v1)
  codes are migrated the same way. `parseSave` / `parseProgress` stay tolerant of malformed data.

## New nation (#18 / #28)
- Picking a nation for the first time (鎮守府 → `日本 ▸ 切替`, or the picker that opens on a brand-new save) creates its
  slot: resources 0, one starter destroyer (first historical destroyer in the nation's data: 吹雪 / Fletcher / Z1 /
  Cossack), regeneration starting now. An empty ship list always falls back to the starter.

## Natural regeneration (#28)
| | fuel | ammo | steel | bauxite |
|---|---|---|---|---|
| per minute | +6 | +4 | +4 | +1 |
Up to 1500 each (`REGEN_CAP`); a resource at or above the cap is untouched (rewards may exceed it). Based on the stored
epoch `regenAt` like dock timers, so it runs while the game is closed. The home port shows the next tick countdown.

## Sorties (#15 / #28)
| | Cost | Docked ships | Start HP | Damage kept | Resource reward | Aircraft cost | XP / proficiency / record |
|---|---|---|---|---|---|---|---|
| 演習 (free battle) | free | allowed | full | no | ×0.5 | none | yes |
| Campaign, first area of a theater | free | blocked | carried over | yes | full | yes | yes |
| Campaign, other areas | per class | blocked | carried over | yes | full | yes | yes |
A battle is an exercise when it has neither `areaId` nor `scenario` (`isExercise`). Historical scenarios are unchanged.

## Ownership and the shipyard (#18 / #29)
The Fleet Builder lists only the current nation's owned ships (fictional ones still need research). Ships come from:
1. **建造** (工廠 › 建造 tab, `ShipyardScene`): one of each ship; cost from class × HP (+ armour for steel), rounded to
   tens, fictional ×1.3. Class gates: `build_cruiser`, `build_battleship` (needs build_cruiser), `build_carrier`,
   `build_submarine` (destroyers need none); the research is offered on the tab itself.
2. **First-clear reward**: each campaign area has `rewardShip` (a class); the nation gets its cheapest unowned historical
   ship of that class (else of any class). Shown in the briefing and on the results screen.

| Per HP | fuel | ammo | steel (HP + 5×armour) | bauxite |
|---|---|---|---|---|
| Destroyer | 0.5 | 0.5 | 0.8 | — |
| Submarine | 0.6 | 0.6 | 0.8 | — |
| Cruiser | 0.8 | 0.9 | 1.2 | 0.1 |
| Carrier | 1.0 | 0.5 | 1.2 | 1.2 |
| Battleship | 1.2 | 1.5 | 1.8 | 0.1 |
e.g. 雪風 110/110/230/0, 高雄 320/360/720/40, 大和 960/1200/2030/80.

## Admiral rank (#30 / #25 / #36)
Rank comes from **merit (戦功)**, not from the number of cleared areas. Merit: first clear of an area +100, repeat
campaign victory +15, exercise victory +5, plus +1 per enemy sunk (max +10); defeats earn nothing (`meritFor`).

| # | Rank | Merit | Slots | Exam | Unlocks |
|---|---|---|---|---|---|
| 0 | 士官候補生 | 0 | 1 | | grade 0 ships |
| 1 | 准尉 | 30 | 1 | | |
| 2 | 少尉 | 80 | 2 | | grade 1, 梯形陣, 2nd dock |
| 3 | 中尉 | 150 | 2 | | |
| 4 | 大尉 | 250 | 3 | | grade 2, 単横陣 |
| 5 | 准佐 | 350 | 3 | | |
| 6 | 少佐 | 500 | 4 | | 3rd dock |
| 7 | 中佐 | 650 | 4 | | grade 3, 警戒陣 |
| 8 | 大佐 | 850 | 5 | | 4th dock |
| 9 | 准将 | 1000 | 5 | a theater's final area | grade 4 |
| 10 | 少将 | 1300 | 6 | | |
| 11 | 中将 | 1650 | 6 | | grade 5 |
| 12 | 大将 | 2050 | 7 | | |
| 13 | 元帥 | 2500 | 8 | every final area of the nation's theaters | |

Ranks are climbed in order: a missing exam stops the climb at 大佐 / 大将. Finishing the tutorial (#90) raises merit to
少尉's 80. Saves from before #36 (v4 → v5) get 100 merit per cleared area and a `rankFloor` that keeps their old slots
and buildable grade (old 少佐 → 少尉, 中佐 → 少尉, 大佐 → 大尉, 少将 → 中佐, 中将 → 准将, 大将 → 中将).
Grade = number of HP marks (250, 400, 520, 700, 780) the ship exceeds; fictional ships are grade 5.

## Docks (#38)
A new admiral has 1 dock. The 2nd / 3rd / 4th cost fuel 200 · steel 300 / fuel 500 · steel 800 / fuel 1,000 · steel
1,500 and need 少尉 / 少佐 / 大佐 (`nextDock`, `buildDock`). Old saves keep 2.

## Reward-only ships (#39)
`src/data/reward-ships.json` maps nation → area → ship. Those ships can't be built (`buildState` = `reward`, the
shipyard names the area); the area's first clear grants them. Other first clears grant the cheapest buildable ship
of the area's reward class.

## Bases / 軍港 (#88, save v7)
- `src/data/bases.json`: four bases per nation. `INationProgress.base` holds the one in use ('' or unknown/locked = the nation's first, `BaseSystem.currentBase`).
- Unlock by rank: start / 少尉 (2) / 少佐 (6) / 大佐 (8). Moving is free (鎮守府 → 艦隊 → 軍港); the home title shows the base name.
- Bonuses (multipliers): first base repair time ×0.8; destroyer + submarine build ×0.8; cruiser build ×0.85 + research ×0.9; battleship + carrier build ×0.85.
  Applied in `buildCostAt` (ShipyardSystem), `canResearch` / `research` (`costMul`), `repairTimeMs` / `startRepair` (`timeMul`).
- Later (#88): docks and ships per base, fuel by distance to the sortie area.

## Home menu and first-visit help (#61, save v7)
- `src/systems/HomeMenu.ts`: 出撃 (作戦・演習・史実) / 艦隊 (編成・改装・艦長・軍港) / 工廠 (研究・建造) / 記録 (図鑑・戦績・ヘルプ・設定). The last tab is kept in the registry (`home.tab`).
- `src/data/screen-help.json` + `ScreenHelpSheet`: a screen explains itself the first time it opens; `ISave.seenHelp` lists those shown.
  The v6 → v7 migration marks every screen that had help in 0.0.14 as seen (`EXISTING_PLAYER_HELP`), so only new screens explain themselves to existing players. 設定 → 「画面の説明をもう一度表示」 clears the list.

## Quests / 任務 (#52, save v8)
- `src/data/quests.json` + `QuestSystem`: daily (reset 05:00 JST = 20:00 UTC), weekly (Monday 05:00 JST), once. `INationProgress.quests = { day, week, progress, claimed }`.
- Events: sortie / win / nightWin / sink / sinkCarrier / sinkSubmarine / sinkBattleship (battle end, sweep), repair (dock), build, research, refit, sweep.

## Sweep / 掃討 (#57, save v8)
- A campaign win with every ship alive adds the area to `perfect`. At most `SWEEPS_PER_DAY` (3) sweeps per area per game day (`INationProgress.sweeps`, save v9). `sweepArea` pays `sweepCost` (sortie cost of a fleet the enemy's size), gives 80% of a win's reward, campaign-win merit and quest events. No damage, proficiency or first-clear reward.

## Limited-time events (#89, save v8)
- `EventSystem.eventAt(now)`: three-hour windows from 05:00 JST, hashed into double (a theater's reward x2) / steel (+50%) / training (proficiency and captain XP x1.5) / repair (cost and time x0.5) / none (60%).
- `ISave.lastSeenAt` guards against a clock set back (`eventFor`). `GameClock.activeEvent` keeps it updated.

## Sortie routes (#53)
- `SortieMapSystem.sortieRoute(area, enemy)`: one boss node for a theater's free first area or fewer than 3 enemies; else
  skirmish (the lightest half, at most 3) → per-area resource / whirlpool / nothing (hash of the id) → boss (whole fleet, the area's objective).
- `utils/SortieFlow`: the sortie in progress lives in the registry (`sortie.state`); `advanceSortie` applies in-between nodes,
  drops ships at or below `HEAVY_DAMAGE` (0.25, from the saved damage) and starts the next battle. Only the boss win clears the area.

## Enemy fleet sizes (#25)
Campaign areas grow along each theater: 太平洋 1·2·3·4·6·7, 大西洋 1·2·3·5·8, 地中海 1·2·3·5·7. Free battle: opponent
size 同数 or 1–20 ships; each enemy mirrors the class of the player's ship in that position (extras mirror the smallest),
picking the enemy ship of that class closest in HP; ASW = submarines, carrier battle leads with a carrier.

## Early loop (tested in `EarlyGameLoop.test.ts`)
New nation: 1 destroyer, 0 resources → the free first area (1 enemy) or a free 演習 is always available. Worst case
(sunk, 大破, broke): an exercise still works and regeneration pays the repair (≈ 26 min for a destroyer at 10%).
First clear → 少尉 (2 slots, 100 merit) + a second ship + 300–400 of each resource, enough to build another destroyer and pay the
second area's sortie.

# Balance Notes (Sprint 7)

## Tools
- `src/systems/BalanceModel.ts` — analytic model: expected DPS of a loadout against a target
  (gun hit rate 45%, torpedo hit rate 30%, damage formula from `CombatSystem`), time-to-kill and duel ratio.
- `tests/unit/Balance.test.ts` — invariants the data must keep:
  1. Battleship DPS vs a reference battleship (armor 60) within ±25% of the class median.
  2. Every battleship, cruiser and destroyer deals ≥ 20 DPS to a destroyer (no helpless ships).
  3. Each nation's strongest battleship duels every other nation's within a 0.7–1.4 time-to-kill ratio.
  4. HP ordering by class: battleship > carrier > cruiser > destroyer > submarine (weakest of a class beats the strongest of the next).
  5. Destroyers are faster than cruisers, cruisers than battleships (on average).
- Browser runs: AUTO battles started directly in `BattleScene` via the dev-only `window.game` (Playwright).

## Changes made
| Change | Why |
|---|---|
| Yamato / Musashi gain `15_5cm_triple` secondaries | Main gun only: weakest anti-destroyer DPS of any battleship (failed invariant 2) |
| Takao gains Type 93 torpedoes | Half the DPS of sister ship Atago |
| Kongo HP 360 → 380, Midway 380 → 360 | Battleship / carrier HP ordering |
| AI torpedo aim error 0.12 rad (guns 0.05) | Slow torpedoes with perfect lead hit almost every time: a flagship lost 260 HP in 2.5 s |
| (Sprint 4) 2-torpedo salvos share firePower; sub torpedoes 8 s reload; depth charge 0.8 s fuse / 110 px | ASW and torpedo spikes |

## AUTO battle results (BB + CA + DD each side, clear day)
| Player | Enemy | Result | Enemy sunk | Own afloat | Time |
|---|---|---|---|---|---|
| IJN | USN | Defeat | 2/3 | 2/3 | 43 s |
| USN | KM | Defeat | 2/3 | 2/3 | 47 s |
| KM | RN | Victory | 3/3 | 3/3 | 39 s |
| RN | IJN | Defeat | 2/3 | 2/3 | 33 s |
| USN | IJN | Victory | 3/3 | 3/3 | 34 s |
| IJN | KM | Victory | 3/3 | 2/3 | 37 s |

Even 3-to-3 fights split 3–3 and every defeat was close (the flagship, which the enemy AI focuses, sank with
two enemies already gone). A player steering manually (dodging torpedoes, keeping range) should win most.

## Known gaps
- Carriers' gun DPS is near zero by design (their weapon is the air wing, not modelled here).
- Submarines are judged by ASW battles instead (see `submarine.md`).

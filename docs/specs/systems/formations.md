# Formations (#59)

Formations place the escorts around the flagship (`FormationSystem`, up to 7 escorts) and change how the fleet
fights (`FormationRules`). Every formation trades something: no formation beats another at everything (tested).

| Formation | Placement | Effect (whole fleet unless noted) | Flagship screening | Unlocked at |
|---|---|---|---|---|
| 単縦陣 Line ahead | one line astern | guns ×1.10, evasion −3% | — | start |
| 複縦陣 Double line | two lines astern | guns ×1.03, torpedoes ×1.05, evasion +3% | — | start |
| 輪形陣 Circle | ring around the flagship | AA ×1.5, guns ×0.85 | −0.25 | start |
| 梯形陣 Echelon | diagonal to starboard | depth charges ×1.2, sonar ×1.15, evasion +5%, guns ×0.92 | — | rank index 1 (中佐) |
| 単横陣 Line abreast | side by side | depth charges ×1.4, sonar ×1.3, guns ×0.75, torpedoes ×0.9 | — | rank index 2 (大佐) |
| 警戒陣 Vanguard | 3 escorts ahead, the rest astern | guns ×0.85; escorts evasion +12%, flagship +6% | −0.3 | rank index 3 (少将) |

- Effects are `IShipModifiers` combined with upgrades, research, refits and the captain. Evasion (`evadeAdd`) is
  added to the crew's proficiency dodge chance when a shell or torpedo hits.
- Screening is added to the enemy AI's priority for the player's flagship (`ai.md`).
- A saved selection or preset with a formation the rank does not allow yet falls back to line ahead.
- Enemy fleets do not use formations yet.

# Aircraft Spec (Sprint 5)

Implementation: `AirWingSystem.ts` / `AirCombat.ts` (pure, unit tested), `entities/aircraft/Squadron.ts`,
`AirOpsSystem.ts` (one per side), wired in `BattleScene`.

## Air wing
Carriers list their planes in the ship JSON:
```json
"airWing": { "fighters": 4, "diveBombers": 4, "torpedoBombers": 4 }
```
| Rule | Value |
|---|---|
| Squadron size | up to 3 planes per launch |
| Re-arm after landing | 18 s |
| Shot-down planes | gone for the battle |
| Carrier sunk | planes in the air are lost |

## Squadrons
| Type | Speed | Role |
|---|---|---|
| 戦闘機 Fighter | 320 | CAP: orbits its carrier (r = 130), intercepts raids within 420 px of the carrier, returns after 45 s |
| 急降下爆撃機 DiveBomber | 250 | Flies over the target; each plane's bomb (`aerial_bomb`, Bomb 65) hits with 55% |
| 雷撃機 TorpedoBomber | 230 | Releases one `aerial_torpedo` (Torpedo 75) per plane 180 px short, leading the target |

Bombers retarget the nearest visible surface ship if theirs sinks or disappears, else fly home.
Submerged submarines and ships hidden by fog / off sonar can't be targeted.

## Air combat (`AirCombat`)
- **AA**: every surfaced enemy ship within 220 px fires; kills/s = Σ strength × 0.18.
  Strength: Battleship 1.0, Cruiser 0.85, Carrier 0.7, Destroyer 0.6, Submarine 0.1.
- **Dogfights**: fighters fight planes within 70 px. Kills/s per plane:
  fighter → fighter 0.35, fighter → bomber 0.6, bomber → fighter 0.08 (rear gunners).
- Losses accumulate as fractional damage (deterministic): every whole point downs one plane.

## Who launches
- Every carrier keeps one fighter squadron up as CAP when fighters are ready.
- AI carriers (enemy, player escorts) launch dive + torpedo squadrons at the best visible target
  (AI v2 target scoring) within 1500 px whenever none of their bombers are aloft.
- Player flagship carrier: `F` key / 攻撃隊 button sends the ready bombers at the current target.
  On touch or with AUTO on it strikes automatically. In AUTO it holds 850 px from its target.
- AI carriers hold position as if their reach were 1000 px, so they stay behind the gun line.

## Battle mode
Fleet Builder → 機動部隊: the enemy fleet is a carrier, a cruiser and a destroyer of the chosen nation.

## Recon floatplanes and fog of war (`VisionSystem`, `ReconSystem`, `ui/FogOfWar`)
- Each side only sees enemy surface ships inside its vision; hidden ships are not drawn, have no
  label / edge marker and can't be targeted (shells still hit them if fired blind).
- Vision: Battleship / Cruiser 650 px, Carrier / Destroyer 600, surfaced submarine 450, submerged
  (periscope) 300, any aircraft 260 px around it. Submerged boats still need sonar to be seen.
- Every battleship and cruiser keeps one floatplane up: it circles an orbit 420 px ahead of its ship
  (r = 260) and sees a 650 px cone (±40°) along its flight path. AA can shoot it down; a spare
  launches 20 s later.
- The player's screen is darkened outside the player's vision (RenderTexture with the vision cut out).
- AUTO with nothing in sight sails towards the middle of the sea; AI ships patrol there too.

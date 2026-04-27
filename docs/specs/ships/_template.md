# Ship Data Template

## Metadata
| Field | Type | Example |
|---|---|---|
| `id` | string | `"ijn_yamato"` |
| `name` | string | `"大和 (Yamato)"` |
| `nation` | Nation enum | `"IJN"` |
| `class` | ShipClass enum | `"Battleship"` |
| `tier` | number (1-5) | `5` |

## Base Stats
| Field | Type | Description |
|---|---|---|
| `hp` | number | Max hit points |
| `armor` | number | Damage reduction stat |
| `speed` | number | Max movement speed (px/s) |
| `turnRate` | number | Rotation speed (deg/s) |
| `range` | number | Detection / engagement range |

## Weapons
Array of weapon references:
```json
{
  "weaponId": "main_gun_46cm",
  "mounts": 3,
  "barrelsPerMount": 3,
  "angle": [-90, 90]
}
```

## Example Entry (Yamato)
```json
{
  "id": "ijn_yamato",
  "name": "大和",
  "nation": "IJN",
  "class": "Battleship",
  "tier": 5,
  "hp": 69720,
  "armor": 410,
  "speed": 27,
  "turnRate": 3.0,
  "range": 42000,
  "weapons": [
    { "weaponId": "main_46cm_triple", "mounts": 3, "barrelsPerMount": 3, "angle": [-90, 90] },
    { "weaponId": "secondary_155mm_triple", "mounts": 4, "barrelsPerMount": 3, "angle": [-120, 120] }
  ],
  "sprite": "assets/ships/ijn/yamato.png"
}
```

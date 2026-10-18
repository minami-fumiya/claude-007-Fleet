# Settings, Help & Save Management Spec (Sprint 11)

Implementation: `SettingsSystem.ts` and `SaveCodec.ts` (pure, tested), `AudioSystem` (applies settings),
`SettingsScene` (from the title screen and the base), `HelpScene` (from the base), `src/config/Controls.ts`.

## Settings (`ww2fleet.settings.v1`, separate from progress)
| Setting | Range | Default |
|---|---|---|
| BGM volume | 0–100 (steps of 10 with −/+, or tap the bar for steps of 5) | 80 |
| SFX volume | 0–100 | 80 |
| Mute | on / off (also the in-battle 音 button and `M`) | off |

Channel gain = base × volume / 100, or 0 when muted. The bases were raised so the default 80 sounds as loud as the
game did before volume settings. The old `ww2fleet.audio.muted` flag is read once as the initial mute.

## Save codes
- Export: `WW2F1:` + base64 (UTF-8) of the progress JSON. Copied to the clipboard; if the clipboard API is not
  available, the code is shown in a prompt for manual copying.
- Import: paste into a prompt. Whitespace is ignored; the prefix, base64 and JSON object shape are checked, then
  the data goes through the tolerant `parseProgress`. Invalid codes change nothing.
- Reset: press twice (the first press warns what will be lost; any other action disarms it). Settings are kept.

## Help
Three tabs: 操作 (same table as the title screen's 操作方法, per input style), 艦種 (role of each class),
作戦目標 (win condition of every objective, plus "losing the flagship always loses").

## Fleet Builder defaults (#108)
`keepExercise` (default on): the exercise opponent, battle type, weather, time and enemy count are kept between
visits. Off (毎回ランダム): every visit starts them from random again; the fleet itself is always kept.

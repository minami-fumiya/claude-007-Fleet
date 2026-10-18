# Captain Spec (Sprint 5)

Implementation: `src/types/Captain.ts`, `src/data/captains.json`, `src/systems/CaptainSystem.ts` (pure, tested),
progress in `src/utils/ProgressStore.ts`.

## Roster
Eight captains per nation (7 nations, 56 in all), one per speciality. Assigned per fleet slot in the Fleet Builder:
tap 艦長を任命 to cycle through the nation's free captains (a captain commands one ship at a time).

The Sprint 5 captains (fictional names, 砲術・水雷・機関) keep their ids so saved XP carries over. Sprint 12 (#24) adds
historically grounded officers for the five new specialities, and all eight for France, the USSR and Italy:

| Nation | 砲術 | 水雷 | 機関 | 航空 | 対潜 | 夜戦 | 索敵 | 応急 |
|---|---|---|---|---|---|---|---|---|
| IJN | 坂井 悟 | 村瀬 健 | 早川 透 | 山口 多聞 | 大井 篤 | 三川 軍一 | 木村 昌福 | 能村 次郎 |
| USN | J. ミラー | R. カーター | T. ヘイズ | C. マクラスキー | D. ギャラリー | J. オルデンドルフ | J. ロシュフォート | E. バックマスター |
| KM | K. ヴェーバー | H. ブラウン | F. フォーゲル | H. ガイスラー | F. ボンテ | G. プリーン | B. ロゲ | H. ブリンクマン |
| RN | A. ヒューズ | E. クラーク | W. グラント | L. ライスター | F. J. ウォーカー | A. B. カニンガム | F. ウェイク=ウォーカー | D. ボイド |
| FR | P. マルザン | E. ミュズリエ | J. ド・ラボルド | P. バルジョ | P. オーボワノー | M. ジャンスール | J. ドクー | R. ゴドフロワ |
| SU | V. トリブツ | A. マリネスコ | N. クズネツォフ | B. サフォーノフ | A. ゴロフコ | F. オクチャブリスキー | I. イサコフ | L. ウラジーミルスキー |
| RM | I. カンピオーニ | L. デ・ラ・ペンネ | A. イアキーノ | I. バルボ | A. ダ・ザーラ | C. ベルガミーニ | J. V. ボルゲーゼ | A. リッカルディ |

## Levels
| Level | Total XP |
|---|---|
| 1 | 0 |
| 2 | 100 |
| 3 | 300 |
| 4 | 600 |
| n | 100 × n(n−1)/2 (max 10) |

## Battle XP
`40 + 30 × enemies sunk (by the fleet) + 60 if victorious`, ×1.2 for the flagship's captain, ×0.5 if their ship sank.
Shown on the results screen (gold with ▲ LEVEL UP when a level is gained) and saved immediately.

## Specialities (bonus scales with level `lv`)
| Skill | 表示 | Effect |
|---|---|---|
| Gunnery | 砲術 | gun firepower ×(1 + 0.03·lv), gun reload ×(1 − 0.01·lv) |
| Torpedo | 水雷 | torpedo firepower ×(1 + 0.04·lv) |
| Engineering | 機関 | speed ×(1 + 0.02·lv), HP ×(1 + 0.01·lv) |
| Aviation | 航空 | air wing bombs / aerial torpedoes ×(1 + 0.04·lv) (`airPowerMul`), AA ×(1 + 0.03·lv) |
| ASW | 対潜 | depth charge firePower ×(1 + 0.05·lv) (`aswMul`), vision ×(1 + 0.01·lv) |
| Night | 夜戦 | night battles only: vision ×(1 + 0.05·lv), guns ×(1 + 0.02·lv), torpedoes ×(1 + 0.03·lv); no effect by day |
| Recon | 索敵 | vision ×(1 + 0.04·lv) |
| Damecon | 応急 | HP ×(1 + 0.02·lv), armor +⌊lv / 2⌋ |

`captainModifiers(captain, { night })` takes the battle's time of day for 夜戦. `aswMul` is applied by `applyToWeapons`
(depth charges); `airPowerMul` is copied onto the carrier (`BaseShip.airPowerMul`) and scales its squadrons' bomb and
aerial-torpedo damage in `AirOpsSystem`. Both are ordinary `IShipModifiers` fields, so upgrades / research can use them too.

Captain bonuses combine with upgrades (`CustomizationSystem.combineModifiers`) and apply to player ships at battle start.

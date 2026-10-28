# 軍港と前進基地 (Ports and forward bases, 0.0.50, #373 #371)

Implementation: `src/data/bases.json`, `BaseSystem.ts`, `FacilitySystem.ts`, `ProgressionSystem.ts` (supply),
`SortieFlow.ts` (anchorage), `BattleScene.ts` (base air group), `ExpeditionSystem.ts` (sea expeditions),
`SaveMigration.ts` (v22 → v23), scene `BaseScene` (軍港タブ / 基地タブ).

## 分け方
| | 軍港 (port) | 前進基地 (forward base) |
|---|---|---|
| 数 | 各国 4 (本国) | 国が戦う戦域の数 − 1 (本国の海を除く) |
| 役割 | 建造・研究・入渠の割引、ドック、資源の施設 | 遠い戦域を 1 つ開き、その戦域での作戦を助ける |
| 開く条件 | 階級 | 階級 + 前の基地の戦域で 3 海域を攻略 (開く順は `theaterOrder`) |
| 工事 | `BASE_WORKS` (30〜50 分) | `FORWARD_WORKS` (5〜18 分、安い) |
| 施設 | 共通 4 種 + 固有 (従来通り、1 軍港 2 つ同時) | 5 種、すべて Lv0 から、1 基地で同時に 1 つ |
| id | `<navy>_home` など | `<navy>_fb_<theater>` (`isForwardBaseId`) |

本国の海 (軍港の `theaters`) は最初から出撃できる。割引は無い。

## 基地の施設 (`FORWARD_FACILITIES`)
| 施設 | 最大 | 効果 | 1 Lv の費用 | 時間 |
|---|---|---|---|---|
| 補給廠 | 3 | その戦域への出撃・掃討の燃料・弾薬 −10 / −15 / −20% (`SUPPLY_OFF`, `supplyMul`) | 燃 150 弾 150 鋼 150 | 3 分 |
| 泊地修理所 | 3 | その戦域の作戦で、途中の戦闘の後に残る全艦の耐久 +5 / +10 / +15% (`ANCHORAGE_REPAIR`) | 燃 200 鋼 300 | 5 分 |
| 基地航空隊 | 3 | Lv1: 戦闘の始め 20 秒は全域が見える / Lv2: 攻撃隊 (急降下 3・雷撃 2) が 25 秒に 1 回 / Lv3: 70 秒にもう 1 回 | 燃 200 鋼 200 ボ 200 | 5 分 |
| 前線工作所 | 3 | 研究費 −2%・修理時間 −3% × Lv。全基地の合計で、軍港の割引と同じ上限の中 (`FRONT_SHOP`) | 燃 150 弾 100 鋼 250 | 4 分 |
| 前進遠征拠点 | 2 | Lv1: その海の遠征 `ex_sea_<theater>` が開く / Lv2: その遠征の報酬 +20% (`OUTPOST_REWARD_MUL`) | 燃 100 弾 100 鋼 200 | 4 分 |

費用と時間は Lv が上がるほど増える (`facilityCost` / `facilityMinutes`)。勲章による上限は無い。

## 海の遠征 (`ex_sea_<theater>`)
90 分・4 隻・駆逐 2 以上。報酬は合計 850〜900 (1 時間 600 以下)。階級の条件は無く、前進遠征拠点 Lv1 で出る。
本国の海の分は作らない (バルト海は基地の無い海)。

## 戦域 (0.0.50 で追加)
- 英国: 南太平洋 (シンガポール、中将)、北太平洋 (香港、大将)。
- フランス: 南太平洋 (カムラン湾、少将)。
- 新しい戦域の報酬艦は `reward-ships.json` (英 p3/p5/p6/p8・np5/np7/np8/np9、仏 p5/p8/p9)。

## 元帥の試験
`examAreas` は、その国が戦う全戦域の全海域 (日・伊・ソ 40、米・仏 50、独 60、英 70)。既に元帥の人はそのまま。

## セーブ (v22 → v23)
- 旧版で前進の役だった港 (`usn_iceland`, `km_lapallice`, `km_penang`, `rn_trinco`) は基地 id に読み替え。施設の Lv は
  本国の軍港へ移す (上限 5、固有施設の Lv は捨てる)。工事中の仕事・ドックも本国の軍港へ。
- 開いていた港の戦域 (`LEGACY_PORT_SEA`) の基地は、開いた状態で始まる。

## 勲章
基地開設章 (`forward_base` 1 / 3 / 5)、前線整備章 (`front_works` 5 / 15 / 30、基地の施設の工事)、
基地航空隊章 (`base_air` 3 / 15 / 50、来援した攻撃隊の数)。

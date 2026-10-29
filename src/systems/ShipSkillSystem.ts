import { ADDITIVE_MODIFIERS, IShipModifiers, NO_MODIFIERS } from '@/types/Modifiers';
import { combineModifiers } from './CustomizationSystem';

/**
 * 艦の固有スキル (#58, pure): famous ships carry a skill from their own history. It works on the player's ship only,
 * beside the captain's (#45), and grows by half again once the ship is remodelled to 改二 (refit stage 2).
 *
 * - `mods`: always on, folded into the ship's modifiers.
 * - `luck`: the chance a hit does nothing at all (幸運艦).
 * - `lastStand`: armour added once the ship is down to LAST_STAND_HP of its HP (不屈).
 */
export interface IShipSkill {
  ship: string;
  name: string;
  /** Where the skill comes from, one line */
  origin: string;
  mods?: Partial<IShipModifiers>;
  luck?: number;
  lastStand?: number;
}

/** HP fraction at or under which a 不屈 skill wakes up. */
export const LAST_STAND_HP = 0.3;
/** How much stronger a skill is from 改二 on. */
export const SKILL_REMODEL_MUL = 1.5;
/** The refit stage that strengthens the skill (改二). */
export const SKILL_REMODEL_STAGE = 2;

export const SHIP_SKILLS: readonly IShipSkill[] = [
  // 日本
  { ship: 'yamato', name: '46cm 主砲', origin: '世界最大の艦砲を積んだ戦艦', mods: { gunPowerMul: 1.08 } },
  { ship: 'musashi', name: '不沈艦', origin: 'シブヤン海で魚雷 20 本・爆弾 17 発に耐えた', mods: { hpMul: 1.06 }, lastStand: 8 },
  { ship: 'nagato', name: '連合艦隊旗艦', origin: '長く連合艦隊の旗艦を務め、終戦まで生き残った', mods: { gunReloadMul: 0.95 } },
  { ship: 'kongo', name: '高速戦艦', origin: '巡洋戦艦から改装され、空母と共に戦った', mods: { speedMul: 1.06 } },
  { ship: 'shimakaze', name: '最速の駆逐艦', origin: '40 ノットを超えた日本最速の駆逐艦', mods: { speedMul: 1.08, evadeAdd: 0.02 } },
  { ship: 'yukikaze', name: '幸運艦', origin: '十数回の海戦を戦い抜き、ほぼ無傷で終戦を迎えた', luck: 0.12 },
  { ship: 'shigure', name: '佐世保の時雨', origin: 'スリガオ海峡でただ 1 隻生き残った', luck: 0.08 },
  { ship: 'ayanami', name: '鬼神', origin: '第三次ソロモン海戦の夜戦で、単艦で米駆逐艦隊と渡り合った', mods: { nightAimMul: 0.85, gunPowerMul: 1.04 } },
  { ship: 'chokai', name: '夜戦の名手', origin: '第一次ソロモン海戦で、夜襲を率いた旗艦', mods: { nightAimMul: 0.85, nightVisionMul: 1.1 } },
  { ship: 'jintsu', name: '不撓の神通', origin: 'コロンバンガラ島沖で集中砲火を浴びながら照射を続けた', lastStand: 8 },
  { ship: 'kitakami', name: '重雷装艦', origin: '魚雷発射管 40 門を積んだ', mods: { torpedoPowerMul: 1.08 } },
  { ship: 'tone', name: '索敵の目', origin: '水上機を多く積み、艦隊の目となった', mods: { visionMul: 1.1 } },
  { ship: 'akizuki', name: '防空の要', origin: '長 10cm 砲で艦隊を空から守った', mods: { aaMul: 1.1 } },
  { ship: 'akagi', name: '機動部隊旗艦', origin: '真珠湾攻撃を率いた空母', mods: { airPowerMul: 1.06 } },
  { ship: 'zuikaku', name: '幸運の空母', origin: '開戦から 1944 年まで、主な空母戦をすべて戦った', mods: { rearmMul: 0.95 }, luck: 0.06 },
  { ship: 'hiryu', name: '最後の反撃', origin: 'ミッドウェーで僚艦が沈む中、ヨークタウンに反撃した', lastStand: 6, mods: { airPowerMul: 1.03 } },
  { ship: 'i19', name: '一撃三隻', origin: '1 回の雷撃で空母ワスプなど 3 隻に命中させた', mods: { torpedoPowerMul: 1.1 } },
  // 米国
  { ship: 'enterprise', name: 'ラッキー E', origin: '太平洋戦争のほぼすべての空母戦を戦い抜いた', mods: { airPowerMul: 1.06 }, luck: 0.06 },
  { ship: 'yorktown', name: '不屈のヨークタウン', origin: '珊瑚海で傷つきながら、3 日の修理でミッドウェーへ出た', lastStand: 8 },
  { ship: 'essex', name: '空母の決定版', origin: '量産された大型空母の 1 番艦', mods: { rearmMul: 0.94 } },
  { ship: 'iowa', name: '高速戦艦', origin: '33 ノットで空母に随伴できた戦艦', mods: { speedMul: 1.05 } },
  { ship: 'washington', name: 'レーダー射撃', origin: '第三次ソロモン海戦の夜戦で霧島を沈めた', mods: { nightAimMul: 0.85 } },
  { ship: 'south_dakota', name: '対空の盾', origin: '南太平洋海戦で多くの敵機を落とした', mods: { aaMul: 1.12 } },
  { ship: 'helena', name: '夜戦の先駆', origin: '新しいレーダーで夜戦を何度も戦った', mods: { visionMul: 1.08 } },
  { ship: 'atlanta', name: '防空巡洋艦', origin: '5 インチ連装砲 8 基で艦隊を守った', mods: { aaMul: 1.1 } },
  { ship: 'johnston', name: 'サマール沖の突撃', origin: '戦艦大和を含む艦隊へ、駆逐艦で突撃した', lastStand: 6, mods: { torpedoPowerMul: 1.04 } },
  { ship: 'laffey_dd724', name: '沈まない艦', origin: '沖縄で特攻機 6 機・爆弾 4 発を受けても沈まなかった', lastStand: 8 },
  { ship: 'fletcher', name: '名艦の 1 番艦', origin: '15 個の従軍星章を得た', luck: 0.06 },
  { ship: 'tang', name: '最多撃沈潜水艦', origin: '米潜水艦で最も多くの船を沈めた', mods: { torpedoPowerMul: 1.08 } },
  { ship: 'archerfish', name: '信濃撃沈', origin: '世界最大の空母・信濃を沈めた', mods: { torpedoPowerMul: 1.06, sonarMul: 1.05 } },
  // ドイツ
  { ship: 'bismarck', name: '不屈', origin: '最後の戦いで集中砲火を浴びても、なかなか沈まなかった', lastStand: 10 },
  { ship: 'tirpitz', name: '北方の孤独な女王', origin: 'ノルウェーの泊地で連合軍を引きつけ続けた', mods: { hpMul: 1.05 } },
  { ship: 'scharnhorst', name: '長距離射撃', origin: '空母グローリアスに 24km 先から命中させた', mods: { gunPowerMul: 1.06 } },
  { ship: 'prinz_eugen', name: '幸運のプリンツ', origin: 'ビスマルク追撃戦を生き延び、終戦まで残った', luck: 0.1 },
  { ship: 'deutschland', name: 'ポケット戦艦', origin: '巡洋艦の船体に 28cm 砲を積んだ', mods: { gunPowerMul: 1.05 } },
  { ship: 'admiral_scheer', name: '通商破壊の雄', origin: '大西洋とインド洋で 17 隻を沈めた', mods: { visionMul: 1.1 } },
  { ship: 'u_boat_viic', name: '狼群', origin: '群れで船団を襲った大西洋の主力', mods: { torpedoPowerMul: 1.06 } },
  // 英国
  { ship: 'warspite', name: '長距離命中', origin: 'カラブリア沖で 24km 先の伊戦艦に命中させた', mods: { gunPowerMul: 1.06 } },
  { ship: 'hood', name: 'マイティ・フッド', origin: '20 年にわたり英国海軍の象徴だった', mods: { gunReloadMul: 0.96 } },
  { ship: 'rodney', name: 'ビスマルク追撃', origin: '16 インチ砲でビスマルクを撃ち続けた', mods: { gunPowerMul: 1.06 } },
  { ship: 'duke_of_york', name: '北岬の勝者', origin: '夜の北岬沖でシャルンホルストを沈めた', mods: { nightAimMul: 0.85 } },
  { ship: 'belfast', name: '北岬のレーダー', origin: 'レーダーでシャルンホルストを捉えた', mods: { visionMul: 1.1 } },
  { ship: 'exeter', name: 'ラプラタの殊勲', origin: 'ラプラタ沖でグラーフ・シュペーと撃ち合い、大破しても戦った', lastStand: 6 },
  { ship: 'illustrious', name: '装甲飛行甲板', origin: 'マルタ沖で爆弾 6 発を受けても沈まなかった', mods: { hpMul: 1.06 } },
  { ship: 'ark_royal', name: 'ビスマルクの舵', origin: 'ソードフィッシュの魚雷でビスマルクの舵を壊した', mods: { airPowerMul: 1.06 } },
  { ship: 'jervis', name: '幸運のジャーヴィス', origin: '多くの海戦を戦い、敵の攻撃で 1 人も失わなかった', luck: 0.1 },
  { ship: 'upholder', name: '地中海の狩人', origin: '英潜水艦で最も多くの戦果を挙げた', mods: { torpedoPowerMul: 1.06 } },
  // フランス
  { ship: 'richelieu', name: '38cm 四連装', origin: '主砲を前部に集めた新鋭戦艦', mods: { gunPowerMul: 1.05 } },
  { ship: 'dunkerque', name: '高速戦艦', origin: '通商破壊艦を追うために造られた', mods: { speedMul: 1.04 } },
  { ship: 'le_fantasque', name: '最速の大型駆逐艦', origin: '45 ノットの記録を持つ', mods: { speedMul: 1.08 } },
  { ship: 'jean_bart', name: '未完の戦艦', origin: '未完成のまま、カサブランカで米戦艦と撃ち合った', lastStand: 8 },
  { ship: 'surcouf', name: '巨大潜水艦', origin: '20.3cm 連装砲を積んだ潜水艦', mods: { gunPowerMul: 1.06 } },
  // イタリア
  { ship: 'vittorio_veneto', name: '不屈のヴェネト', origin: 'マタパン岬沖で魚雷を受けても港へ戻った', lastStand: 8 },
  { ship: 'littorio', name: 'タラントの再起', origin: 'タラント空襲で大破した後、修理されて戦列に戻った', mods: { hpMul: 1.05 } },
  { ship: 'duca_degli_abruzzi', name: '最強の軽巡', origin: 'イタリア軽巡の最終型', mods: { gunReloadMul: 0.95 } },
  { ship: 'zara', name: '重装甲巡洋艦', origin: '条約の限度を超える厚い装甲を持った', mods: { armorAdd: 3 } },
  // ソ連
  { ship: 'marat', name: '沈まぬ砲台', origin: '港で着底した後も、レニングラードを砲撃で守った', lastStand: 10 },
  { ship: 'kirov', name: 'レニングラードの盾', origin: '包囲されたレニングラードで対空戦を続けた', mods: { aaMul: 1.08 } },
  { ship: 'tashkent', name: '青の巡洋艦', origin: '43 ノットを出した嚮導駆逐艦', mods: { speedMul: 1.08 } },
  { ship: 'soobrazitelny', name: '黒海の幸運艦', origin: '黒海で多くの作戦に出て、1 人の戦死者も出さなかった', luck: 0.1 },
  { ship: 's13', name: 'グストロフ撃沈', origin: 'バルト海で大型客船を沈めた', mods: { torpedoPowerMul: 1.1 } },
];

export function skillOf(shipId: string): IShipSkill | undefined {
  return SHIP_SKILLS.find((s) => s.ship === shipId);
}

/** 1, or SKILL_REMODEL_MUL from 改二. */
export function skillStrength(stage: number): number {
  return stage >= SKILL_REMODEL_STAGE ? SKILL_REMODEL_MUL : 1;
}

/** The skill's always-on modifiers at the ship's refit stage: each bonus grows by `strength`. */
export function skillModifiers(skill: IShipSkill | undefined, stage: number): IShipModifiers {
  if (!skill?.mods) return { ...NO_MODIFIERS };
  const k = skillStrength(stage);
  const out: Partial<IShipModifiers> = {};
  for (const [key, v] of Object.entries(skill.mods) as Array<[keyof IShipModifiers, number]>) {
    out[key] = ADDITIVE_MODIFIERS.includes(key) ? v * k : 1 + (v - 1) * k;
  }
  return combineModifiers(out);
}

export function luckChance(skill: IShipSkill | undefined, stage: number): number {
  return (skill?.luck ?? 0) * skillStrength(stage);
}

export function lastStandArmor(skill: IShipSkill | undefined, stage: number): number {
  return Math.round((skill?.lastStand ?? 0) * skillStrength(stage));
}

/** How each bonus reads (pct is the size of the change in percent). */
const MOD_LABEL: Partial<Record<keyof IShipModifiers, (pct: number) => string>> = {
  hpMul: (n) => `耐久 +${n}%`, speedMul: (n) => `速力 +${n}%`, gunPowerMul: (n) => `砲撃 +${n}%`, gunReloadMul: (n) => `主砲の装填 ${n}% 短縮`,
  torpedoPowerMul: (n) => `雷撃 +${n}%`, visionMul: (n) => `索敵 +${n}%`, aaMul: (n) => `対空 +${n}%`, airPowerMul: (n) => `航空攻撃 +${n}%`,
  rearmMul: (n) => `艦載機の再出撃 ${n}% 短縮`, sonarMul: (n) => `ソナー +${n}%`, nightAimMul: (n) => `夜戦の照準のぶれ −${n}%`,
  nightVisionMul: (n) => `夜の索敵 +${n}%`, evadeAdd: (n) => `回避 +${n}%`,
};

/** What the skill does, as shown in the encyclopedia and the fleet builder, at the ship's refit stage. */
export function skillText(skill: IShipSkill, stage: number): string {
  const k = skillStrength(stage);
  const parts: string[] = [];
  for (const [key, v] of Object.entries(skill.mods ?? {}) as Array<[keyof IShipModifiers, number]>) {
    if (key === 'armorAdd') parts.push(`装甲 +${Math.round(v * k)}`);
    else if (key === 'evadeAdd') parts.push(MOD_LABEL.evadeAdd!(Math.round(v * k * 100)));
    else {
      const label = MOD_LABEL[key];
      if (label) parts.push(label(Math.round(Math.abs(v - 1) * k * 100)));
    }
  }
  if (skill.luck) parts.push(`被弾を ${Math.round(skill.luck * k * 100)}% の確率で無効にする`);
  if (skill.lastStand) parts.push(`耐久 ${Math.round(LAST_STAND_HP * 100)}% 以下で装甲 +${lastStandArmor(skill, stage)}`);
  return parts.join('・');
}

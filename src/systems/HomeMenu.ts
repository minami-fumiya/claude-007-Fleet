import { SceneKeys } from '@/config/SceneKeys';

/**
 * 鎮守府 menu (#61, pure): the screens grouped under four tabs so the home port doesn't show every button at once.
 * The tab last used is remembered for the session.
 */

export type HomeTab = 'sortie' | 'fleet' | 'arsenal' | 'record';

export interface IHomeMenuItem {
  label: string;
  /** One short line under the label */
  caption: string;
  scene: string;
  variant: 'gold' | 'primary' | 'secondary';
  data?: Record<string, unknown>;
  /** Opens a sheet on the home screen instead of a scene */
  action?: 'quests' | 'ranks';
}

export interface IHomeMenuTab {
  id: HomeTab;
  label: string;
  items: IHomeMenuItem[];
}

export const HOME_MENU: IHomeMenuTab[] = [
  {
    id: 'sortie', label: '出撃', items: [
      { label: '作戦', caption: '海域を攻略', scene: SceneKeys.CAMPAIGN, variant: 'gold' },
      { label: '演習', caption: '無傷で練習', scene: SceneKeys.FLEET_BUILDER, variant: 'primary' },
      { label: '史実', caption: '史実の海戦', scene: SceneKeys.SCENARIO, variant: 'primary' },
      { label: '任務', caption: '日替わりの目標', scene: SceneKeys.HOME, variant: 'secondary', action: 'quests' },
    ],
  },
  {
    id: 'fleet', label: '艦隊', items: [
      // Fleet only, then on to 作戦 or 演習 (#109). The fleet is kept between visits.
      { label: '編成', caption: '艦と艦長', scene: SceneKeys.FLEET_BUILDER, variant: 'gold', data: { organize: true } },
      { label: '改装', caption: '改造と部品', scene: SceneKeys.CUSTOMIZATION, variant: 'primary' },
      { label: '艦長', caption: 'スキルと成長', scene: SceneKeys.CAPTAIN, variant: 'primary' },
      { label: '軍港', caption: '移動と施設', scene: SceneKeys.BASE, variant: 'secondary' },
    ],
  },
  {
    id: 'arsenal', label: '工廠', items: [
      { label: '研究', caption: '艦種と部品', scene: SceneKeys.ARSENAL, variant: 'gold' },
      { label: '建造', caption: '新しい艦', scene: SceneKeys.SHIPYARD, variant: 'primary' },
      // ゴールドとショップ (#183)
      { label: 'ショップ', caption: 'ゴールドで交換', scene: SceneKeys.SHOP, variant: 'primary' },
    ],
  },
  {
    id: 'record', label: '記録', items: [
      { label: '図鑑', caption: '艦・艦長・機', scene: SceneKeys.ENCYCLOPEDIA, variant: 'primary', data: { tab: 'ships' } },
      { label: '戦績', caption: '戦いの記録', scene: SceneKeys.RECORD, variant: 'primary' },
      // 持っているアイテム (#184)
      { label: 'アイテム', caption: '所持品', scene: SceneKeys.ITEMS, variant: 'primary' },
      { label: '階級', caption: '昇進の条件', scene: SceneKeys.HOME, variant: 'primary', action: 'ranks' },
      { label: 'ヘルプ', caption: '遊び方', scene: SceneKeys.HELP, variant: 'secondary' },
      { label: '設定', caption: '音・保存', scene: SceneKeys.SETTINGS, variant: 'secondary' },
    ],
  },
];

export const DEFAULT_HOME_TAB: HomeTab = 'sortie';

export function homeTab(id: unknown): IHomeMenuTab {
  return HOME_MENU.find((t) => t.id === id) ?? HOME_MENU[0];
}

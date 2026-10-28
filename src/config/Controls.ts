import { IS_PORTRAIT } from './GameConstants';

/** Battle controls for the current input style, shown on the title screen and in the help. */
export const CONTROLS: Array<{ label: string; text: string }> = IS_PORTRAIT
  ? [
      { label: '移動', text: '海をタップした地点へ航行。左下のスティックでも操作できます' },
      { label: '目標', text: '敵艦をタップすると攻撃目標に指定' },
      { label: '砲撃', text: '射程内の目標へ自動で砲撃' },
      { label: 'AUTO', text: 'ON にすると自動で敵を追尾し、戦闘します' },
      { label: '魚雷', text: '魚雷ボタンで発射。射程内の目標へは自動でも発射します' },
      { label: '潜航', text: '潜水艦は潜航ボタンで潜航・浮上。潜航中は爆雷しか当たりません' },
      { label: '弾種', text: '弾種ボタンで 自動 → 徹甲弾 → 榴弾。榴弾は火災を起こしやすい' },
      { label: '消耗品', text: '応急修理・煙幕などのボタンで使用。回数と待ち時間があり、研究で開きます' },
    ]
  : [
      { label: '移動', text: 'W / S で前進・後退、A / D で旋回' },
      { label: '砲撃', text: 'マウスで照準、クリックで砲撃' },
      { label: 'AUTO', text: 'ボタンで自動航行・自動砲撃に切り替え' },
      { label: '魚雷', text: 'E キーまたはボタンで照準方向へ魚雷を発射' },
      { label: '潜航', text: 'Q キーで潜水艦が潜航・浮上 (潜航中は爆雷のみ有効)' },
      { label: '航空', text: 'F キーで空母の攻撃隊を発艦、M キーで音の ON / OFF' },
      { label: '弾種', text: '弾種ボタンで 自動 → 徹甲弾 → 榴弾。P / ESC で一時停止' },
      { label: '消耗品', text: '1 / 2 キーで応急修理・煙幕などを使用 (回数と待ち時間あり、研究で開く)' },
    ];

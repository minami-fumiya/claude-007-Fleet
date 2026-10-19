/**
 * Captain roster generator (#209): fills every nation up to 30 captains in src/data/captains.json.
 * Hand-written captains are kept; generated ones (ids ending in _gNN) are rebuilt from the tables below on every run,
 * so the output is deterministic. Run with `npx vite-node scripts/gen-captains.ts`.
 *
 * Each speciality gets 3 captains (4 for 砲術・水雷・航空). Within a speciality they differ in which class they suit
 * (aptitude S) and in how their abilities grow (early / steady / late), so 30 captains are not 30 copies.
 * The generated captains are fictional: no real person's record is claimed.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Aptitude, CaptainSkill, ICaptainData } from '@/types/Captain';
import { ShipClass } from '@/types/ShipClass';

const FILE = join(process.cwd(), 'src', 'data', 'captains.json');
const PER_NATION = 30;
const NATIONS = ['IJN', 'USN', 'KM', 'RN', 'FR', 'SU', 'RM'] as const;
type NationId = (typeof NATIONS)[number];

/** How many captains each speciality ends up with. */
const TARGET: Record<CaptainSkill, number> = {
  [CaptainSkill.Gunnery]: 4, [CaptainSkill.Torpedo]: 4, [CaptainSkill.Aviation]: 4,
  [CaptainSkill.Engineering]: 3, [CaptainSkill.AntiAir]: 3, [CaptainSkill.ASW]: 3,
  [CaptainSkill.Night]: 3, [CaptainSkill.Recon]: 3, [CaptainSkill.Damecon]: 3,
};

/** Aptitude twists for the 2nd, 3rd and 4th captain of a speciality, with the bio line that explains them. */
const VARIANTS: Record<CaptainSkill, Array<{ aptitude: Partial<Record<ShipClass, Aptitude>>; bio: string }>> = {
  [CaptainSkill.Gunnery]: [
    { aptitude: { Cruiser: 'S' }, bio: '重巡洋艦の砲術長から艦長に上がった。速射で敵の巡洋艦を押さえ込む。' },
    { aptitude: { Destroyer: 'A' }, bio: '駆逐艦の主砲で敵機と小艦艇を払う指揮に慣れている。' },
    { aptitude: { Carrier: 'B' }, bio: '空母の護衛にも就いた砲術家だ。どの艦に乗っても砲の扱いは確かだ。' },
  ],
  [CaptainSkill.Torpedo]: [
    { aptitude: { Cruiser: 'S' }, bio: '水雷戦隊の旗艦、軽巡洋艦を率いて夜の雷撃戦を指揮した。' },
    { aptitude: { Submarine: 'S' }, bio: '潜水艦で通商破壊に従事した。潜望鏡越しの雷撃を得意とする。' },
    { aptitude: { Battleship: 'B' }, bio: '大型艦の水雷長も務めた。どの艦でも魚雷の扱いに通じている。' },
  ],
  [CaptainSkill.Aviation]: [
    { aptitude: { Cruiser: 'A' }, bio: '水上機を積む巡洋艦の艦長として、偵察と弾着観測を指揮した。' },
    { aptitude: { Battleship: 'B' }, bio: '航空戦艦の運用を研究した。艦載機と砲の両方に目が利く。' },
    { aptitude: { Destroyer: 'B' }, bio: '空母の直衛駆逐艦から航空に転じた。艦載機の発着を手早くこなす。' },
  ],
  [CaptainSkill.Engineering]: [
    { aptitude: { Battleship: 'S' }, bio: '高速戦艦の機関長を務めた。巨艦を思うままに走らせる。' },
    { aptitude: { Carrier: 'A' }, bio: '空母の機関を預かった。発艦に必要な速力を切らさない。' },
  ],
  [CaptainSkill.AntiAir]: [
    { aptitude: { Battleship: 'S' }, bio: '戦艦の副砲・高角砲を束ねて艦隊の防空を担った。' },
    { aptitude: { Carrier: 'A' }, bio: '空母の対空砲火を指揮した。急降下爆撃から飛行甲板を守る。' },
  ],
  [CaptainSkill.ASW]: [
    { aptitude: { Carrier: 'A' }, bio: '護衛空母とともに潜水艦狩りの部隊を指揮した。' },
    { aptitude: { Cruiser: 'A' }, bio: '軽巡洋艦で護衛部隊を率い、船団を潜水艦から守った。' },
  ],
  [CaptainSkill.Night]: [
    { aptitude: { Cruiser: 'S' }, bio: '重巡洋艦で夜戦に挑み、照明弾の下での砲雷撃戦を得意とする。' },
    { aptitude: { Battleship: 'A' }, bio: '戦艦の夜間射撃を磨いた。暗闇でも主砲を外さない。' },
  ],
  [CaptainSkill.Recon]: [
    { aptitude: { Submarine: 'S' }, bio: '潜水艦で敵艦隊の動きを探った。見つからずに見つける術に長ける。' },
    { aptitude: { Destroyer: 'A' }, bio: '駆逐艦で前路哨戒に就いた。敵影をいち早く捉える。' },
  ],
  [CaptainSkill.Damecon]: [
    { aptitude: { Carrier: 'S' }, bio: '空母の応急長を務めた。被弾した飛行甲板を素早く直す。' },
    { aptitude: { Cruiser: 'S' }, bio: '巡洋艦で何度も被弾から生還した。浸水を止める手際は随一だ。' },
  ],
};

/** The plain bio of a speciality, for its first generated captain. */
const BIO: Record<CaptainSkill, string> = {
  [CaptainSkill.Gunnery]: '戦艦の砲術畑を歩んだ士官だ。遠距離砲戦の指揮を得意とする。',
  [CaptainSkill.Torpedo]: '駆逐艦で水雷戦を重ねた。肉薄しての雷撃を恐れない。',
  [CaptainSkill.Aviation]: '空母の飛行長から艦長に上がった。攻撃隊の発艦を手早くまとめる。',
  [CaptainSkill.Engineering]: '機関科の出身で、艦の速力と持久力を引き出す。',
  [CaptainSkill.AntiAir]: '高角砲と機銃の射撃指揮を研究した。敵機の侵入路を読むのがうまい。',
  [CaptainSkill.ASW]: '護衛艦で船団を守った。聴音と爆雷の連携に長ける。',
  [CaptainSkill.Night]: '夜間の訓練を重ねた。闇の中での見張りと奇襲を得意とする。',
  [CaptainSkill.Recon]: '索敵と見張りに優れた士官だ。敵を先に見つけて戦いを有利に運ぶ。',
  [CaptainSkill.Damecon]: '応急指揮に長けた。被弾しても艦を沈ませない。',
};

/** Surnames (and initials or given names) per nation; fictional combinations, unique within the roster. */
const NAMES: Record<NationId, { family: string[]; given: string[]; western: boolean }> = {
  IJN: {
    family: ['青木', '石川', '上田', '大野', '岡田', '加藤', '木村', '久保', '小島', '斎藤', '佐野', '柴田', '杉山', '高木', '竹内', '千葉', '土屋', '中川', '西田', '野口', '浜田', '平野', '福田', '星野', '前田', '松尾', '宮本', '森本'],
    given: ['健一', '正雄', '義男', '武', '茂', '博', '勇', '清', '実', '進', '隆', '浩二', '昭', '修', '秀夫', '光男', '和夫', '敏夫', '一郎', '次郎', '三郎'],
    western: false,
  },
  USN: {
    family: ['ベイカー', 'カーター', 'ドーソン', 'エヴァンズ', 'フォスター', 'グラント', 'ヘイズ', 'アイヴス', 'ジョーダン', 'ケラー', 'ローソン', 'モーガン', 'オーウェン', 'パーカー', 'クイン', 'リード', 'サットン', 'タッカー', 'ウォーカー', 'ブルックス', 'コリンズ', 'ダンカン', 'エリス', 'フレミング'],
    given: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'L', 'M', 'P', 'R', 'S', 'T', 'W'],
    western: true,
  },
  KM: {
    family: ['アーベル', 'バウアー', 'ディートリヒ', 'エッカート', 'フィッシャー', 'ゲルラッハ', 'ハルトマン', 'イェーガー', 'クライン', 'ランゲ', 'マイヤー', 'ノイマン', 'オットー', 'ペーターゼン', 'リヒター', 'シュミット', 'トーマ', 'ウルリヒ', 'ヴァーグナー', 'ツィンマー', 'ベルガー', 'ホフマン', 'ケスラー', 'レーマン'],
    given: ['A', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'O', 'P', 'R', 'S', 'W'],
    western: true,
  },
  RN: {
    family: ['アシュトン', 'ベネット', 'クラーク', 'ダグラス', 'エヴァレット', 'フェアファクス', 'グレアム', 'ハリントン', 'アイアランド', 'ジャーヴィス', 'ケンドール', 'ラングリー', 'モンロー', 'ノリス', 'オズボーン', 'ペンバートン', 'ラドクリフ', 'スタンリー', 'トレヴァー', 'ウェントワース', 'ヤードリー', 'ブラッドショー', 'カーライル', 'ドレイトン'],
    given: ['A', 'C', 'D', 'E', 'G', 'H', 'J', 'M', 'N', 'P', 'R', 'T', 'W'],
    western: true,
  },
  FR: {
    family: ['アルノー', 'ブラン', 'シャルパンティエ', 'デュボワ', 'フォンテーヌ', 'ジラール', 'ユベール', 'ジャカール', 'ルフェーヴル', 'マルシャン', 'ノエル', 'ペラン', 'ルソー', 'シモン', 'トマ', 'ヴィダル', 'ゴーティエ', 'ルメール', 'ベルナール', 'ロラン', 'ギャルニエ', 'ルブラン', 'モンテイユ', 'バルビエ'],
    given: ['A', 'C', 'E', 'F', 'G', 'H', 'J', 'L', 'M', 'P', 'R', 'Y'],
    western: true,
  },
  SU: {
    family: ['アントノフ', 'ベロフ', 'ドミトリエフ', 'エゴロフ', 'フョードロフ', 'グロモフ', 'イワノフ', 'カルポフ', 'レベデフ', 'ニキーチン', 'オルロフ', 'ポポフ', 'ソコロフ', 'チトフ', 'ヴォロノフ', 'ザイツェフ', 'ゴルベフ', 'クリモフ', 'セミョーノフ', 'パヴロフ', 'ボリソフ', 'ステパノフ', 'ミロノフ', 'コズロフ'],
    given: ['A', 'B', 'D', 'G', 'I', 'K', 'L', 'M', 'N', 'P', 'S', 'V', 'Y'],
    western: true,
  },
  RM: {
    family: ['アルベルティ', 'ベネデッティ', 'カルーソ', 'デ・ルカ', 'エスポージト', 'ファッブリ', 'ガッリ', 'イオリオ', 'ロンバルディ', 'マリーニ', 'ネーリ', 'オルシーニ', 'パルミエーリ', 'リッチ', 'サンナ', 'テスタ', 'ヴィターレ', 'ゼッカ', 'コロンボ', 'ジェンティーレ', 'モレッティ', 'ルッソ', 'カルボーネ', 'フェラーリ'],
    given: ['A', 'C', 'D', 'E', 'F', 'G', 'L', 'M', 'P', 'R', 'S', 'V'],
    western: true,
  },
};

/** Ability growth by position: steady, then early and late bloomers in turn. */
const GROWTHS: Array<ICaptainData['growth']> = [undefined, 'early', 'late'];

function surnameOf(name: string, western: boolean): string {
  return western ? name.replace(/^[A-Z]\.\s*/, '') : name.split(' ')[0];
}

const data = JSON.parse(readFileSync(FILE, 'utf8')) as { captains: ICaptainData[] };
const kept = data.captains.filter((c) => !/_g\d+$/.test(c.id));
const out: ICaptainData[] = [...kept];
for (const nation of NATIONS) {
  const pool = NAMES[nation];
  const mine = kept.filter((c) => c.nation === nation);
  // No surname twice in the whole roster, across navies too (a USN and an RN Grant would read as one person).
  const used = new Set(kept.map((c) => surnameOf(c.name, /^[A-Z]\./.test(c.name))));
  const families = pool.family.filter((f) => !used.has(f));
  let n = 0;
  for (const skill of Object.keys(TARGET) as CaptainSkill[]) {
    const have = mine.filter((c) => c.skill === skill).length;
    for (let k = have; k < TARGET[skill]; k++) {
      const family = families[n];
      if (!family) throw new Error(`${nation}: not enough surnames`);
      const given = pool.given[(n * 11 + 3) % pool.given.length];
      const variant = k >= 1 ? VARIANTS[skill][(k - 1) % VARIANTS[skill].length] : undefined;
      n++;
      const captain: ICaptainData = {
        id: `${nation.toLowerCase()}_g${String(n).padStart(2, '0')}`,
        name: pool.western ? `${given}. ${family}` : `${family} ${given}`,
        nation: nation as ICaptainData['nation'],
        skill,
        bio: variant?.bio ?? BIO[skill],
      };
      if (variant) captain.aptitude = variant.aptitude;
      const growth = GROWTHS[n % GROWTHS.length];
      if (growth) captain.growth = growth;
      out.push(captain);
    }
  }
  const total = out.filter((c) => c.nation === nation).length;
  if (total !== PER_NATION) throw new Error(`${nation}: ${total} captains, expected ${PER_NATION}`);
}

const line = (c: ICaptainData): string => `    ${JSON.stringify(c).replace(/^\{/, '{ ').replace(/\}$/, ' }').replace(/,"/g, ', "').replace(/":/g, '": ')}`;
writeFileSync(FILE, `{\n  "captains": [\n${out.map(line).join(',\n')}\n  ]\n}\n`);
console.log(`${out.length} captains (${out.length - kept.length} generated)`);

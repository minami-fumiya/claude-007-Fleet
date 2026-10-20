/**
 * Sister ships (#85): each class's ships share their lead ship's performance and differ only in name, so the data
 * keeps one hand-written entry per class (the lead) and this script adds the rest. Generated entries carry
 * `sisterOf` and are rebuilt on every run from the tables below. Run with `npx vite-node scripts/gen-ships.ts`.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { IShipData } from '@/types/Ship';

/** lead id → [class label, [id, Japanese name, romanised / English name][]] */
type Table = Record<string, [string, Array<[string, string, string]>]>;

const IJN: Table = {
  kongo: ['金剛型戦艦', [['hiei', '比叡', 'Hiei'], ['haruna', '榛名', 'Haruna'], ['kirishima', '霧島', 'Kirishima']]],
  fuso: ['扶桑型戦艦', [['yamashiro', '山城', 'Yamashiro']]],
  ise: ['伊勢型戦艦', [['hyuga', '日向', 'Hyuga']]],
  unryu: ['雲龍型航空母艦', [['amagi', '天城', 'Amagi'], ['katsuragi', '葛城', 'Katsuragi']]],
  junyo: ['隼鷹型航空母艦', [['hiyo', '飛鷹', 'Hiyo']]],
  zuiho: ['祥鳳型航空母艦', [['shoho', '祥鳳', 'Shoho']]],
  chitose: ['千歳型航空母艦', [['chiyoda', '千代田', 'Chiyoda']]],
  takao: ['高雄型重巡洋艦', [['maya', '摩耶', 'Maya'], ['chokai', '鳥海', 'Chokai']]],
  myoko: ['妙高型重巡洋艦', [['nachi', '那智', 'Nachi'], ['ashigara', '足柄', 'Ashigara'], ['haguro', '羽黒', 'Haguro']]],
  mogami: ['最上型重巡洋艦', [['mikuma', '三隈', 'Mikuma'], ['suzuya', '鈴谷', 'Suzuya'], ['kumano', '熊野', 'Kumano']]],
  tone: ['利根型重巡洋艦', [['chikuma', '筑摩', 'Chikuma']]],
  furutaka: ['古鷹型重巡洋艦', [['kako', '加古', 'Kako']]],
  aoba: ['青葉型重巡洋艦', [['kinugasa', '衣笠', 'Kinugasa']]],
  tenryu: ['天龍型軽巡洋艦', [['tatsuta', '龍田', 'Tatsuta']]],
  kuma: ['球磨型軽巡洋艦', [['tama', '多摩', 'Tama'], ['kitakami', '北上', 'Kitakami'], ['oi', '大井', 'Oi'], ['kiso', '木曾', 'Kiso']]],
  nagara: ['長良型軽巡洋艦', [['isuzu', '五十鈴', 'Isuzu'], ['natori', '名取', 'Natori'], ['yura', '由良', 'Yura'], ['kinu', '鬼怒', 'Kinu'], ['abukuma', '阿武隈', 'Abukuma']]],
  sendai: ['川内型軽巡洋艦', [['jintsu', '神通', 'Jintsu'], ['naka', '那珂', 'Naka']]],
  agano: ['阿賀野型軽巡洋艦', [['noshiro', '能代', 'Noshiro'], ['yahagi', '矢矧', 'Yahagi'], ['sakawa', '酒匂', 'Sakawa']]],
  mutsuki: ['睦月型駆逐艦', [['kisaragi', '如月', 'Kisaragi'], ['yayoi', '弥生', 'Yayoi'], ['uzuki', '卯月', 'Uzuki'], ['satsuki', '皐月', 'Satsuki'], ['minazuki', '水無月', 'Minazuki'], ['fumizuki', '文月', 'Fumizuki'], ['nagatsuki', '長月', 'Nagatsuki'], ['kikuzuki', '菊月', 'Kikuzuki'], ['mikazuki', '三日月', 'Mikazuki'], ['mochizuki', '望月', 'Mochizuki'], ['yuzuki', '夕月', 'Yuzuki']]],
  fubuki: ['吹雪型駆逐艦', [['shirayuki', '白雪', 'Shirayuki'], ['hatsuyuki', '初雪', 'Hatsuyuki'], ['miyuki', '深雪', 'Miyuki'], ['murakumo', '叢雲', 'Murakumo'], ['shinonome', '東雲', 'Shinonome'], ['usugumo', '薄雲', 'Usugumo'], ['shirakumo', '白雲', 'Shirakumo'], ['isonami', '磯波', 'Isonami'], ['uranami', '浦波', 'Uranami'], ['ayanami', '綾波', 'Ayanami'], ['shikinami', '敷波', 'Shikinami'], ['asagiri', '朝霧', 'Asagiri'], ['yugiri', '夕霧', 'Yugiri'], ['amagiri', '天霧', 'Amagiri'], ['sagiri', '狭霧', 'Sagiri'], ['oboro', '朧', 'Oboro'], ['akebono', '曙', 'Akebono'], ['sazanami', '漣', 'Sazanami'], ['ushio', '潮', 'Ushio']]],
  akatsuki: ['暁型駆逐艦', [['hibiki', '響', 'Hibiki'], ['ikazuchi', '雷', 'Ikazuchi'], ['inazuma', '電', 'Inazuma']]],
  hatsuharu: ['初春型駆逐艦', [['nenohi', '子日', 'Nenohi'], ['wakaba', '若葉', 'Wakaba'], ['hatsushimo', '初霜', 'Hatsushimo'], ['ariake', '有明', 'Ariake'], ['yugure', '夕暮', 'Yugure']]],
  shiratsuyu: ['白露型駆逐艦', [['shigure', '時雨', 'Shigure'], ['murasame', '村雨', 'Murasame'], ['yudachi', '夕立', 'Yudachi'], ['harusame', '春雨', 'Harusame'], ['samidare', '五月雨', 'Samidare'], ['umikaze', '海風', 'Umikaze'], ['yamakaze', '山風', 'Yamakaze'], ['kawakaze', '江風', 'Kawakaze'], ['suzukaze', '涼風', 'Suzukaze']]],
  asashio: ['朝潮型駆逐艦', [['oshio', '大潮', 'Oshio'], ['michishio', '満潮', 'Michishio'], ['arashio', '荒潮', 'Arashio'], ['asagumo', '朝雲', 'Asagumo'], ['yamagumo', '山雲', 'Yamagumo'], ['minegumo', '峯雲', 'Minegumo'], ['natsugumo', '夏雲', 'Natsugumo'], ['arare', '霰', 'Arare'], ['kasumi', '霞', 'Kasumi']]],
  yukikaze: ['陽炎型駆逐艦', [['kagero', '陽炎', 'Kagero'], ['shiranui', '不知火', 'Shiranui'], ['kuroshio', '黒潮', 'Kuroshio'], ['oyashio', '親潮', 'Oyashio'], ['hayashio', '早潮', 'Hayashio'], ['natsushio', '夏潮', 'Natsushio'], ['hatsukaze', '初風', 'Hatsukaze'], ['amatsukaze', '天津風', 'Amatsukaze'], ['tokitsukaze', '時津風', 'Tokitsukaze'], ['urakaze', '浦風', 'Urakaze'], ['isokaze', '磯風', 'Isokaze'], ['hamakaze', '浜風', 'Hamakaze'], ['tanikaze', '谷風', 'Tanikaze'], ['nowaki', '野分', 'Nowaki'], ['arashi', '嵐', 'Arashi'], ['hagikaze', '萩風', 'Hagikaze'], ['maikaze', '舞風', 'Maikaze'], ['akigumo', '秋雲', 'Akigumo']]],
  yugumo: ['夕雲型駆逐艦', [['makigumo', '巻雲', 'Makigumo'], ['kazagumo', '風雲', 'Kazagumo'], ['naganami', '長波', 'Naganami'], ['takanami', '高波', 'Takanami'], ['onami', '大波', 'Onami'], ['kiyonami', '清波', 'Kiyonami'], ['tamanami', '玉波', 'Tamanami'], ['suzunami', '涼波', 'Suzunami'], ['fujinami', '藤波', 'Fujinami'], ['hayanami', '早波', 'Hayanami'], ['hamanami', '浜波', 'Hamanami'], ['okinami', '沖波', 'Okinami'], ['kishinami', '岸波', 'Kishinami'], ['asashimo', '朝霜', 'Asashimo'], ['hayashimo', '早霜', 'Hayashimo'], ['akishimo', '秋霜', 'Akishimo'], ['kiyoshimo', '清霜', 'Kiyoshimo']]],
  akizuki: ['秋月型駆逐艦', [['teruzuki', '照月', 'Teruzuki'], ['suzutsuki', '涼月', 'Suzutsuki'], ['hatsuzuki', '初月', 'Hatsuzuki'], ['niizuki', '新月', 'Niizuki'], ['wakatsuki', '若月', 'Wakatsuki'], ['shimotsuki', '霜月', 'Shimotsuki'], ['fuyutsuki', '冬月', 'Fuyutsuki'], ['harutsuki', '春月', 'Harutsuki'], ['yoizuki', '宵月', 'Yoizuki']]],
  matsu: ['松型駆逐艦', [['take', '竹', 'Take'], ['ume', '梅', 'Ume'], ['momo', '桃', 'Momo'], ['kiri', '桐', 'Kiri'], ['sugi', '杉', 'Sugi'], ['kaya', '榧', 'Kaya']]],
  etorofu: ['択捉型海防艦', [['matsuwa', '松輪', 'Matsuwa'], ['sado', '佐渡', 'Sado'], ['oki', '隠岐', 'Oki'], ['mutsure', '六連', 'Mutsure'], ['iki', '壱岐', 'Iki'], ['tsushima', '対馬', 'Tsushima']]],
  i19: ['乙型潜水艦', [['i15', '伊15', 'I-15'], ['i17', '伊17', 'I-17'], ['i21', '伊21', 'I-21'], ['i25', '伊25', 'I-25'], ['i26', '伊26', 'I-26']]],
  i168: ['海大型潜水艦', [['i169', '伊169', 'I-169'], ['i171', '伊171', 'I-171']]],
  i400: ['伊400型潜水艦', [['i401', '伊401', 'I-401']]],
};

const USN: Table = {
  new_york: ['ニューヨーク級戦艦', [['texas', 'テキサス', 'Texas']]],
  nevada: ['ネヴァダ級戦艦', [['oklahoma', 'オクラホマ', 'Oklahoma']]],
  pennsylvania: ['ペンシルヴェニア級戦艦', [['arizona', 'アリゾナ', 'Arizona']]],
  new_mexico: ['ニューメキシコ級戦艦', [['mississippi', 'ミシシッピ', 'Mississippi'], ['idaho', 'アイダホ', 'Idaho']]],
  tennessee: ['テネシー級戦艦', [['california', 'カリフォルニア', 'California']]],
  colorado: ['コロラド級戦艦', [['maryland', 'メリーランド', 'Maryland'], ['west_virginia', 'ウェストヴァージニア', 'West Virginia']]],
  north_carolina: ['ノースカロライナ級戦艦', [['washington', 'ワシントン', 'Washington']]],
  south_dakota: ['サウスダコタ級戦艦', [['indiana', 'インディアナ', 'Indiana'], ['massachusetts', 'マサチューセッツ', 'Massachusetts'], ['alabama', 'アラバマ', 'Alabama']]],
  iowa: ['アイオワ級戦艦', [['wisconsin', 'ウィスコンシン', 'Wisconsin']]],
  lexington: ['レキシントン級航空母艦', [['saratoga', 'サラトガ', 'Saratoga']]],
  yorktown: ['ヨークタウン級航空母艦', [['hornet', 'ホーネット', 'Hornet']]],
  essex: ['エセックス級航空母艦', [['intrepid', 'イントレピッド', 'Intrepid'], ['franklin', 'フランクリン', 'Franklin'], ['bunker_hill', 'バンカー・ヒル', 'Bunker Hill'], ['hancock', 'ハンコック', 'Hancock'], ['ticonderoga', 'タイコンデロガ', 'Ticonderoga'], ['bennington', 'ベニントン', 'Bennington'], ['randolph', 'ランドルフ', 'Randolph'], ['shangri_la', 'シャングリラ', 'Shangri-La'], ['bon_homme_richard', 'ボノム・リシャール', 'Bon Homme Richard'], ['antietam', 'アンティータム', 'Antietam']]],
  midway: ['ミッドウェイ級航空母艦', [['franklin_d_roosevelt', 'フランクリン・D・ルーズベルト', 'Franklin D. Roosevelt']]],
  independence: ['インディペンデンス級航空母艦', [['princeton', 'プリンストン', 'Princeton'], ['belleau_wood', 'ベロー・ウッド', 'Belleau Wood'], ['cowpens', 'カウペンス', 'Cowpens'], ['monterey', 'モントレー', 'Monterey'], ['cabot', 'カボット', 'Cabot'], ['bataan', 'バターン', 'Bataan'], ['san_jacinto', 'サン・ジャシント', 'San Jacinto']]],
  casablanca: ['カサブランカ級護衛空母', [['liscome_bay', 'リスカム・ベイ', 'Liscome Bay'], ['gambier_bay', 'ガンビア・ベイ', 'Gambier Bay'], ['st_lo', 'セント・ロー', 'St. Lo'], ['kalinin_bay', 'カリニン・ベイ', 'Kalinin Bay']]],
  bogue: ['ボーグ級護衛空母', [['card', 'カード', 'Card'], ['core', 'コア', 'Core'], ['block_island', 'ブロック・アイランド', 'Block Island']]],
  pensacola: ['ペンサコーラ級重巡洋艦', [['salt_lake_city', 'ソルトレイクシティ', 'Salt Lake City']]],
  northampton: ['ノーザンプトン級重巡洋艦', [['chester', 'チェスター', 'Chester'], ['louisville', 'ルイビル', 'Louisville'], ['chicago', 'シカゴ', 'Chicago'], ['houston', 'ヒューストン', 'Houston'], ['augusta', 'オーガスタ', 'Augusta']]],
  portland: ['ポートランド級重巡洋艦', [['indianapolis', 'インディアナポリス', 'Indianapolis']]],
  new_orleans: ['ニューオーリンズ級重巡洋艦', [['astoria', 'アストリア', 'Astoria'], ['minneapolis', 'ミネアポリス', 'Minneapolis'], ['tuscaloosa', 'タスカルーサ', 'Tuscaloosa'], ['san_francisco', 'サンフランシスコ', 'San Francisco'], ['quincy', 'クインシー', 'Quincy'], ['vincennes', 'ヴィンセンス', 'Vincennes']]],
  baltimore: ['ボルチモア級重巡洋艦', [['boston', 'ボストン', 'Boston'], ['canberra', 'キャンベラ', 'Canberra'], ['pittsburgh', 'ピッツバーグ', 'Pittsburgh'], ['saint_paul', 'セントポール', 'Saint Paul'], ['bremerton', 'ブレマートン', 'Bremerton'], ['fall_river', 'フォールリバー', 'Fall River'], ['macon', 'メイコン', 'Macon']]],
  des_moines: ['デ・モイン級重巡洋艦', [['salem', 'セーラム', 'Salem']]],
  omaha: ['オマハ級軽巡洋艦', [['milwaukee', 'ミルウォーキー', 'Milwaukee'], ['cincinnati', 'シンシナティ', 'Cincinnati'], ['raleigh', 'ローリー', 'Raleigh'], ['detroit', 'デトロイト', 'Detroit'], ['richmond', 'リッチモンド', 'Richmond'], ['concord', 'コンコード', 'Concord'], ['trenton', 'トレントン', 'Trenton'], ['marblehead', 'マーブルヘッド', 'Marblehead'], ['memphis', 'メンフィス', 'Memphis']]],
  brooklyn: ['ブルックリン級軽巡洋艦', [['philadelphia', 'フィラデルフィア', 'Philadelphia'], ['savannah', 'サバンナ', 'Savannah'], ['nashville', 'ナッシュビル', 'Nashville'], ['phoenix', 'フェニックス', 'Phoenix'], ['boise', 'ボイシ', 'Boise'], ['honolulu', 'ホノルル', 'Honolulu'], ['helena', 'ヘレナ', 'Helena'], ['st_louis', 'セントルイス', 'St. Louis']]],
  cleveland: ['クリーブランド級軽巡洋艦', [['columbia', 'コロンビア', 'Columbia'], ['montpelier', 'モントピリア', 'Montpelier'], ['denver', 'デンバー', 'Denver'], ['santa_fe', 'サンタフェ', 'Santa Fe'], ['birmingham', 'バーミングハム', 'Birmingham'], ['mobile', 'モービル', 'Mobile'], ['biloxi', 'ビロクシ', 'Biloxi'], ['miami', 'マイアミ', 'Miami']]],
  atlanta: ['アトランタ級軽巡洋艦', [['juneau', 'ジュノー', 'Juneau'], ['san_diego', 'サンディエゴ', 'San Diego'], ['san_juan', 'サンファン', 'San Juan'], ['oakland', 'オークランド', 'Oakland']]],
  farragut: ['ファラガット級駆逐艦', [['dewey', 'デューイ', 'Dewey'], ['hull', 'ハル', 'Hull'], ['macdonough', 'マクドノー', 'Macdonough'], ['worden', 'ウォーデン', 'Worden'], ['dale', 'デイル', 'Dale'], ['monaghan', 'モナハン', 'Monaghan'], ['aylwin', 'エイルウィン', 'Aylwin']]],
  porter: ['ポーター級駆逐艦', [['selfridge', 'セルフリッジ', 'Selfridge'], ['mcdougal', 'マクドゥガル', 'McDougal'], ['winslow', 'ウィンスロー', 'Winslow'], ['phelps', 'フェルプス', 'Phelps'], ['clark', 'クラーク', 'Clark'], ['moffett', 'モフェット', 'Moffett'], ['balch', 'バルチ', 'Balch']]],
  mahan: ['マハン級駆逐艦', [['cummings', 'カミングス', 'Cummings'], ['drayton', 'ドレイトン', 'Drayton'], ['lamson', 'ラムソン', 'Lamson'], ['flusser', 'フラッサー', 'Flusser'], ['reid', 'リード', 'Reid'], ['case', 'ケース', 'Case'], ['cassin', 'カッシン', 'Cassin'], ['shaw', 'ショー', 'Shaw'], ['tucker', 'タッカー', 'Tucker'], ['downes', 'ダウンズ', 'Downes'], ['cushing', 'カッシング', 'Cushing'], ['perkins', 'パーキンス', 'Perkins'], ['smith', 'スミス', 'Smith'], ['preston', 'プレストン', 'Preston']]],
  sims: ['シムス級駆逐艦', [['hughes', 'ヒューズ', 'Hughes'], ['anderson', 'アンダーソン', 'Anderson'], ['hammann', 'ハムマン', 'Hammann'], ['mustin', 'マスティン', 'Mustin'], ['russell', 'ラッセル', 'Russell'], ['obrien', 'オブライエン', "O'Brien"], ['walke', 'ウォーク', 'Walke'], ['morris', 'モリス', 'Morris'], ['roe', 'ロー', 'Roe'], ['wainwright', 'ウェインライト', 'Wainwright'], ['buck', 'バック', 'Buck']]],
  benson: ['ベンソン級駆逐艦', [['mayo', 'メイヨー', 'Mayo'], ['gleaves', 'グリーブス', 'Gleaves'], ['niblack', 'ニブラック', 'Niblack'], ['laffey', 'ラフィー', 'Laffey'], ['woodworth', 'ウッドワース', 'Woodworth'], ['livermore', 'リバモア', 'Livermore'], ['eberle', 'エバール', 'Eberle']]],
  fletcher: ['フレッチャー級駆逐艦', [['obannon', 'オバノン', "O'Bannon"], ['nicholas', 'ニコラス', 'Nicholas'], ['de_haven', 'デヘイヴン', 'De Haven'], ['johnston', 'ジョンストン', 'Johnston'], ['hoel', 'ホーエル', 'Hoel'], ['heermann', 'ヒーアマン', 'Heermann'], ['kidd', 'キッド', 'Kidd'], ['the_sullivans', 'ザ・サリヴァンズ', 'The Sullivans'], ['radford', 'ラドフォード', 'Radford'], ['jenkins', 'ジェンキンス', 'Jenkins']]],
  sumner: ['アレン・M・サムナー級駆逐艦', [['laffey_dd724', 'ラフィー (2 代目)', 'Laffey (DD-724)'], ['english', 'イングリッシュ', 'English'], ['ingraham', 'イングラハム', 'Ingraham'], ['moale', 'モール', 'Moale']]],
  gato: ['ガトー級潜水艦', [['wahoo', 'ワフー', 'Wahoo'], ['flasher', 'フラッシャー', 'Flasher'], ['harder', 'ハーダー', 'Harder'], ['silversides', 'シルバーサイズ', 'Silversides'], ['growler', 'グロウラー', 'Growler'], ['trigger', 'トリガー', 'Trigger'], ['barb', 'バーブ', 'Barb'], ['drum', 'ドラム', 'Drum']]],
  balao: ['バラオ級潜水艦', [['tang', 'タング', 'Tang'], ['archerfish', 'アーチャーフィッシュ', 'Archerfish'], ['batfish', 'バットフィッシュ', 'Batfish'], ['spadefish', 'スペードフィッシュ', 'Spadefish']]],
};

/** France, Italy and the USSR build few ships of their own (#168 → #85): their cruisers and up first. */
const FR: Table = {
  richelieu: ['リシュリュー級戦艦', [['jean_bart', 'ジャン・バール', 'Jean Bart']]],
  dupleix: ['シュフラン級重巡洋艦', [['suffren', 'シュフラン', 'Suffren'], ['colbert', 'コルベール', 'Colbert'], ['foch', 'フォッシュ', 'Foch']]],
  la_galissonniere: ['ラ・ガリソニエール級軽巡洋艦', [['jean_de_vienne', 'ジャン・ド・ヴィエンヌ', 'Jean de Vienne'], ['marseillaise', 'マルセイエーズ', 'Marseillaise'], ['gloire', 'グロワール', 'Gloire'], ['montcalm', 'モンカルム', 'Montcalm'], ['georges_leygues', 'ジョルジュ・レイグ', 'Georges Leygues']]],
  le_fantasque: ['ル・ファンタスク級駆逐艦', [['le_terrible', 'ル・テリブル', 'Le Terrible'], ['le_triomphant', 'ル・トリオンファン', 'Le Triomphant'], ['l_indomptable', "ランドンターブル", "L'Indomptable"], ['le_malin', 'ル・マラン', 'Le Malin'], ['l_audacieux', 'ロダシュー', "L'Audacieux"]]],
  mogador: ['モガドール級駆逐艦', [['volta', 'ヴォルタ', 'Volta']]],
};

const RM: Table = {
  vittorio_veneto: ['リットリオ級戦艦', [['littorio', 'リットリオ', 'Littorio']]],
  conte_di_cavour: ['コンテ・ディ・カヴール級戦艦', [['giulio_cesare', 'ジュリオ・チェーザレ', 'Giulio Cesare']]],
  zara: ['ザラ級重巡洋艦', [['fiume', 'フィウメ', 'Fiume'], ['gorizia', 'ゴリツィア', 'Gorizia'], ['pola', 'ポーラ', 'Pola']]],
  trento: ['トレント級重巡洋艦', [['trieste', 'トリエステ', 'Trieste']]],
  garibaldi: ['ドゥカ・デッリ・アブルッツィ級軽巡洋艦', [['duca_degli_abruzzi', 'ドゥカ・デッリ・アブルッツィ', 'Duca degli Abruzzi']]],
  montecuccoli: ['モンテクッコリ級軽巡洋艦', [['muzio_attendolo', 'ムツィオ・アッテンドーロ', 'Muzio Attendolo']]],
  maestrale: ['マエストラーレ級駆逐艦', [['libeccio', 'リベッチオ', 'Libeccio'], ['grecale', 'グレカーレ', 'Grecale'], ['scirocco', 'シロッコ', 'Scirocco']]],
  aviere: ['ソルダティ級駆逐艦', [['artigliere', 'アルティリエーレ', 'Artigliere'], ['ascari', 'アスカリ', 'Ascari'], ['bersagliere', 'ベルサリエーレ', 'Bersagliere'], ['carabiniere', 'カラビニエーレ', 'Carabiniere'], ['corazziere', 'コラッツィエーレ', 'Corazziere'], ['granatiere', 'グラナティエーレ', 'Granatiere'], ['lanciere', 'ランチエーレ', 'Lanciere'], ['alpino', 'アルピーノ', 'Alpino']]],
};

const SU: Table = {
  kirov: ['キーロフ級軽巡洋艦', [['voroshilov', 'ヴォロシーロフ', 'Voroshilov']]],
  maxim_gorky: ['マクシム・ゴーリキー級軽巡洋艦', [['molotov', 'モロトフ', 'Molotov'], ['kalinin', 'カリーニン', 'Kalinin'], ['kaganovich', 'カガノーヴィチ', 'Kaganovich']]],
  gnevny: ['グネフヌイ級駆逐艦', [['grozny', 'グロズヌイ', 'Grozny'], ['gromky', 'グロムキー', 'Gromky'], ['gremyashchy', 'グレミャーシチー', 'Gremyashchy'], ['stremitelny', 'ストレミーチェリヌイ', 'Stremitelny']]],
};

/** Britain and Germany (#85 stage 2): the sisters of the classes already in the data. */
const RN: Table = {
  king_george_v: ['キング・ジョージ5世級戦艦', [['prince_of_wales', 'プリンス・オブ・ウェールズ', 'Prince of Wales'], ['duke_of_york', 'デューク・オブ・ヨーク', 'Duke of York'], ['anson', 'アンソン', 'Anson'], ['howe', 'ハウ', 'Howe']]],
  queen_elizabeth: ['クイーン・エリザベス級戦艦', [['valiant', 'ヴァリアント', 'Valiant'], ['barham', 'バーラム', 'Barham'], ['malaya', 'マレーヤ', 'Malaya']]],
  renown: ['レナウン級巡洋戦艦', [['repulse', 'レパルス', 'Repulse']]],
  illustrious: ['イラストリアス級航空母艦', [['victorious', 'ヴィクトリアス', 'Victorious'], ['formidable', 'フォーミダブル', 'Formidable']]],
  southampton: ['タウン級軽巡洋艦', [['newcastle', 'ニューカッスル', 'Newcastle'], ['sheffield', 'シェフィールド', 'Sheffield'], ['glasgow', 'グラスゴー', 'Glasgow'], ['birmingham_rn', 'バーミンガム', 'Birmingham'], ['manchester', 'マンチェスター', 'Manchester'], ['liverpool', 'リヴァプール', 'Liverpool'], ['gloucester', 'グロスター', 'Gloucester']]],
  belfast: ['エディンバラ級軽巡洋艦', [['edinburgh', 'エディンバラ', 'Edinburgh']]],
  dorsetshire: ['ノーフォーク級重巡洋艦', [['norfolk', 'ノーフォーク', 'Norfolk']]],
  dido: ['ダイドー級軽巡洋艦', [['naiad', 'ナイアド', 'Naiad'], ['phoebe', 'フィービ', 'Phoebe'], ['sirius', 'シリアス', 'Sirius'], ['euryalus', 'ユーライアラス', 'Euryalus'], ['cleopatra', 'クレオパトラ', 'Cleopatra']]],
  cossack: ['トライバル級駆逐艦', [['afridi', 'アフリディ', 'Afridi'], ['ashanti', 'アシャンティ', 'Ashanti'], ['maori', 'マオリ', 'Maori'], ['sikh', 'シーク', 'Sikh'], ['zulu', 'ズールー', 'Zulu'], ['tartar', 'タータ', 'Tartar'], ['eskimo', 'エスキモー', 'Eskimo'], ['bedouin', 'ベドウィン', 'Bedouin']]],
  javelin: ['J 級駆逐艦', [['jervis', 'ジャーヴィス', 'Jervis'], ['jupiter', 'ジュピター', 'Jupiter'], ['juno', 'ジュノー', 'Juno'], ['janus', 'ジェーナス', 'Janus'], ['jackal', 'ジャッカル', 'Jackal']]],
  black_swan: ['ブラック・スワン級スループ', [['starling', 'スターリング', 'Starling'], ['wren', 'レン', 'Wren'], ['woodpecker', 'ウッドペッカー', 'Woodpecker']]],
};

const KM: Table = {
  deutschland: ['ドイッチュラント級装甲艦', [['admiral_scheer', 'アドミラル・シェーア', 'Admiral Scheer']]],
  z1: ['1934 型駆逐艦', [['z2', 'Z2 ゲオルク・ティーレ', 'Z2'], ['z3', 'Z3 マックス・シュルツ', 'Z3'], ['z4', 'Z4 リヒャルト・バイツェン', 'Z4']]],
  z20: ['1936 型駆逐艦', [['z17', 'Z17 ディーター・フォン・レーダー', 'Z17'], ['z18', 'Z18 ハンス・リューデマン', 'Z18'], ['z19', 'Z19 ヘルマン・キュンネ', 'Z19'], ['z21', 'Z21 ヴィルヘルム・ハイドカンプ', 'Z21'], ['z22', 'Z22 アントン・シュミット', 'Z22']]],
  z23: ['1936A 型駆逐艦', [['z24', 'Z24', 'Z24'], ['z25', 'Z25', 'Z25'], ['z26', 'Z26', 'Z26'], ['z27', 'Z27', 'Z27']]],
};

const TABLES: Record<string, Table> = { ijn: IJN, usn: USN, fr: FR, rm: RM, su: SU, rn: RN, km: KM };

for (const [file, table] of Object.entries(TABLES)) {
  const path = join(process.cwd(), 'src', 'data', 'ships', `${file}.json`);
  const data = JSON.parse(readFileSync(path, 'utf8')) as { ships: IShipData[] };
  const kept = data.ships.filter((s) => !s.sisterOf);
  // A sister keeps the number it was given (#249); a new one gets its own from scripts/gen-numbers.ts.
  const numbers = new Map(data.ships.filter((s) => s.sisterOf && s.no !== undefined).map((s) => [s.id, s.no]));
  const ids = new Set(kept.map((s) => s.id));
  const out = [...kept];
  for (const [leadId, [label, sisters]] of Object.entries(table)) {
    const lead = kept.find((s) => s.id === leadId);
    if (!lead) throw new Error(`${file}: no lead ship ${leadId}`);
    const leadName = lead.name.replace(/\s*\(.*\)\s*$/, '');
    for (const [id, ja, en] of sisters) {
      if (ids.has(id)) throw new Error(`${file}: duplicate id ${id}`);
      ids.add(id);
      const { description: _d, no: _n, id: _id, ...stats } = lead;
      const no = numbers.get(id);
      out.push({ id, ...(no !== undefined ? { no } : {}), ...stats, name: `${ja} (${en})`, description: `${label}の同型艦。性能は${leadName}と同じ。`, sisterOf: leadId });
    }
  }
  writeFileSync(path, JSON.stringify({ ...data, ships: out }, null, 2) + '\n');
  console.log(`${file}: ${out.length} ships (${out.length - kept.length} sisters)`);
}

/**
 * SpectatorCrowd 隨機對白池
 * 兩組權重抽取：使用者原稿（PRIMARY，權重高）+ Opus 補稿（SECONDARY，權重低）
 * 80% 機率從 PRIMARY 抽、20% 從 SECONDARY 抽
 */

export const SPECTATOR_QUOTES_PRIMARY: readonly string[] = [
  '本來老闆說要帶客人去吃懷石，誰知道他不小心在廁所尿到外面被發現，現在只能吃這間了',
  '最近公司獸人案表現滿出色的，請全團隊吃大香腸搂',
  '吼！蘇董上次REVIEW的時候吃過說好吃，結果現在每次REVIEW都要吃是怎樣？',
  '欸老闆我午休只到一點半你動作可不可以快一點？',
  '因為公司開源節流，現在製作人會議結束之後的聚餐都只能點這家了',
  '台灣最美的風景是腸',
  '新人聚餐依舊是這家實惠的好味道',
  '老闆我的不切，比較...習慣...整根吃啦>/////',
  '欸老闆，最近的怎麼都不太粗阿？我要粗的阿',
  '單單漢堡的超長熱狗真的.......輸了',
  '我要買給劉老闆吃的你小心一點不要給我烤焦了欸?',
  '這香腸好誇張應該有18/6? 我以後來要要來',
  '老闆你們有外送嗎? 中農四樓有送嗎?',
  '窩天甜都在吃熱狗，偶爾我也想吃持看香唱',
];

export const SPECTATOR_QUOTES_SECONDARY: readonly string[] = [
  '老闆 我這根吃完要去談 200 萬合約 大根一點',
  '請了半天假就為了來排 同事吹爆',
  '加蒜頭 加爆 等下要進公司燻死那個機車主管',
  '老闆你這香腸 撐起整個夜市的尊嚴',
  '跟同事打賭 30 秒內出餐 賭 200',
  '從南港特地騎來的 別給我烤普通的喔',
  '老闆你節奏感超好 是不是業餘鼓手',
  '打包 5 根 公司加班 大家肚子餓爆',
  '噓⋯⋯不要讓我老婆知道我來吃這個',
  '老闆又是我 這禮拜第四次了',
  '等等等 我要拍 IG 你擺好看一點啦',
  '朋友說來這吃完會通靈 蛤',
  '老婆問我這麼晚在哪 我說加班 其實在這',
];

/**
 * 加權隨機抽取對白：80% 從 PRIMARY、20% 從 SECONDARY
 */
export function pickRandomQuote(): string {
  const usePrimary = Math.random() < 0.8;
  const pool = usePrimary ? SPECTATOR_QUOTES_PRIMARY : SPECTATOR_QUOTES_SECONDARY;
  return pool[Math.floor(Math.random() * pool.length)];
}

// 向下相容：舊代碼若仍 import SPECTATOR_QUOTES，提供合併陣列
export const SPECTATOR_QUOTES: readonly string[] = [
  ...SPECTATOR_QUOTES_PRIMARY,
  ...SPECTATOR_QUOTES_SECONDARY,
];

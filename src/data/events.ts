export interface EventChoice {
  text: string;
  emoji: string;
  resultText: string;
  effects: {
    money?: number;
    reputation?: number;
    trafficBonus?: number;
    skipDay?: boolean;
  };
}

export interface GameEvent {
  id: string;
  name: string;
  emoji: string;
  category: 'customer' | 'gangster' | 'positive';
  description: string;
  choices: EventChoice[];
  minDay: number;
}

export const GAME_EVENTS: GameEvent[] = [
  // 5 difficult customers
  {
    id: 'costco-guy',
    name: 'Costco比價哥',
    emoji: '🤓',
    category: 'customer',
    description: '一個戴眼鏡的大叔走過來，拿起你的香腸端詳了一下...\n\n「這在 Costco 一包才 $199 耶，你一根賣這麼貴？」',
    minDay: 1,
    choices: [
      { text: '算你便宜 $5', emoji: '😅', resultText: '大叔滿意地買了一根，嘴裡還是念念有詞。', effects: { money: -5, reputation: 1 } },
      { text: 'Costco 有我烤的好吃嗎？', emoji: '😤', resultText: '大叔瞪了你一眼，轉身離去。但旁邊的人被你霸氣吸引，多買了幾根。', effects: { reputation: 3 } },
      { text: '送蒜蓉醬和解', emoji: '🧄', resultText: '大叔嚐了一口：「嗯...這醬不錯，好吧原諒你。」還多買了兩根。', effects: { money: -3, reputation: 3 } },
    ],
  },
  {
    id: 'food-critic',
    name: '美食評論家',
    emoji: '📝',
    category: 'customer',
    description: '一個拿著筆記本的人走到攤前，似乎在打分數...\n\n「我是某美食部落格的編輯，可以試吃嗎？」',
    minDay: 3,
    choices: [
      { text: '免費請他吃最好的', emoji: '🌟', resultText: '他吃了一口，眼睛一亮：「這會上我的推薦清單！」', effects: { money: -35, reputation: 8 } },
      { text: '跟其他客人一樣付錢', emoji: '💰', resultText: '他付了錢，默默吃完。評論中性，不好不壞。', effects: { reputation: 2 } },
      { text: '趕走他', emoji: '🚫', resultText: '他在部落格寫了一篇負評...「態度極差，不推薦。」', effects: { reputation: -10 } },
    ],
  },
  {
    id: 'drunk-uncle',
    name: '醉漢大叔',
    emoji: '🍺',
    category: 'customer',
    description: '一個滿臉通紅的大叔搖搖晃晃走過來，酒味撲鼻...\n\n「老...老闆，來十根！不對...來一根就好...」',
    minDay: 2,
    choices: [
      { text: '幫他叫計程車', emoji: '🚕', resultText: '大叔感動得痛哭流涕，掏出 $200 塞給你：「你是好人...」', effects: { money: 200, reputation: 5 } },
      { text: '賣他一根就好', emoji: '🌭', resultText: '大叔吃完就趴在攤前睡著了，嚇跑了幾個客人。', effects: { money: 35, reputation: -3 } },
      { text: '請他離開', emoji: '👋', resultText: '大叔嘟嘟囔囔走了。其他客人鬆了口氣。', effects: { reputation: 1 } },
    ],
  },
  {
    id: 'instagram-karen',
    name: 'IG打卡姐',
    emoji: '📸',
    category: 'customer',
    description: '一個穿著時尚的女生走過來，手機鏡頭對準你的攤車...\n\n「老闆～我粉絲五萬耶，給我免費吃可以幫你宣傳喔！」',
    minDay: 2,
    choices: [
      { text: '免費請她吃', emoji: '🆓', resultText: '她拍了十五分鐘的照片，標註你的攤位。客人確實多了一些。', effects: { money: -35, trafficBonus: 0.2 } },
      { text: '打折就好', emoji: '🏷️', resultText: '她不太開心，但還是買了。發了一篇普通的限時動態。', effects: { money: -10, reputation: 1 } },
      { text: '五萬粉絲？我有五萬根香腸', emoji: '💪', resultText: '她氣呼呼地走了，但旁邊的攤販都拍手叫好。', effects: { reputation: 2 } },
    ],
  },
  {
    id: 'kid-tantrum',
    name: '熊孩子',
    emoji: '👶',
    category: 'customer',
    description: '一個小孩指著你的攤車大喊：「我要吃！我要吃！」\n他媽媽尷尬地看著你...小孩已經開始在地上打滾了。',
    minDay: 1,
    choices: [
      { text: '送他一根小的', emoji: '🎁', resultText: '小孩破涕為笑，媽媽感激地多買了三根。「謝謝老闆！」', effects: { money: -15, reputation: 4 } },
      { text: '堅持要付錢', emoji: '💵', resultText: '媽媽付了錢，小孩還是不開心，哭聲引來側目。', effects: { money: 35, reputation: -2 } },
      { text: '表演翻香腸特技', emoji: '🎪', resultText: '你花式翻了一根香腸，小孩看傻了停止哭鬧。圍觀群眾紛紛鼓掌買單。', effects: { reputation: 5, trafficBonus: 0.1 } },
    ],
  },
  // 3 gangster events (minDay 5+)
  {
    id: 'protection-fee',
    name: '收保護費',
    emoji: '🕶️',
    category: 'gangster',
    description: '兩個穿黑衣的壯漢走過來，其中一個掏出一根牙籤叼著...\n\n「老闆，我們是附近的...社區管理委員會。每個月的管理費該繳了。」',
    minDay: 5,
    choices: [
      { text: '乖乖交 $300', emoji: '💸', resultText: '壯漢滿意地點點頭：「很上道。以後有事找我們。」你獲得了...某種保護？', effects: { money: -300, reputation: -2 } },
      { text: '跟他們理論', emoji: '🗣️', resultText: '壯漢們面面相覷，最後笑了：「有種！但下次可沒這麼好說話。」', effects: { reputation: 5 } },
      { text: '報警', emoji: '🚔', resultText: '警察來了，壯漢早就溜了。但你隱約覺得他們會記住這件事...', effects: { reputation: 3 } },
    ],
  },
  {
    id: 'territory-threat',
    name: '地盤警告',
    emoji: '⚠️',
    category: 'gangster',
    description: '你的攤車上被貼了一張紙條：\n\n「這是我的地盤。明天別來了。——隔壁老王」\n\n看來有人不太歡迎你的生意越做越好。',
    minDay: 7,
    choices: [
      { text: '照常營業，不理他', emoji: '😎', resultText: '什麼事也沒發生。也許只是虛張聲勢。但你多裝了一個監視器以防萬一。', effects: { reputation: 3 } },
      { text: '找對方談談', emoji: '🤝', resultText: '原來是隔壁賣滷味的，覺得你搶了他客人。你們約好互相推薦。', effects: { reputation: 5, trafficBonus: 0.05 } },
      { text: '以牙還牙', emoji: '👊', resultText: '你在他攤位貼了更大的紙條。結果引發攤販公約糾紛，大家都不開心。', effects: { reputation: -5 } },
    ],
  },
  {
    id: 'gang-offer',
    name: '大哥入股',
    emoji: '🤵',
    category: 'gangster',
    description: '一輛黑色賓士停在你攤位前，車窗搖下來...\n\n「小老闆，我觀察你很久了。你的手藝不錯，要不要讓我投資你？五五分帳。」',
    minDay: 10,
    choices: [
      { text: '接受投資', emoji: '🤝', resultText: '大哥的人脈讓你的客源暴增。但以後賺的錢要分一半出去...', effects: { money: 2000, trafficBonus: 0.3 } },
      { text: '婉拒', emoji: '🙅', resultText: '大哥笑了笑：「有骨氣。那就靠自己吧。」車窗緩緩搖上。', effects: { reputation: 5 } },
      { text: '反提議三七分', emoji: '💼', resultText: '大哥挑了挑眉：「有意思...好，七你三我，但你欠我一個人情。」', effects: { money: 1000, reputation: 3 } },
    ],
  },
  // 3 positive events
  {
    id: 'food-festival',
    name: '美食節',
    emoji: '🎪',
    category: 'positive',
    description: '今天夜市舉辦美食節！到處掛滿燈籠，人潮比平常多了好幾倍。\n\n「歡迎光臨第 87 屆夜市美食嘉年華～」',
    minDay: 3,
    choices: [
      { text: '加量不加價', emoji: '📣', resultText: '大排長龍！今天生意好到手都烤痠了。', effects: { trafficBonus: 0.4, reputation: 3 } },
      { text: '趁機漲價', emoji: '💰', resultText: '客人雖多，但看到價格都猶豫了一下。賺是有賺，但口碑...', effects: { money: 200, reputation: -3 } },
      { text: '推出美食節限定', emoji: '🌟', resultText: '「美食節特別版」讓客人眼睛一亮，紛紛拍照打卡。', effects: { money: 100, reputation: 5, trafficBonus: 0.2 } },
    ],
  },
  {
    id: 'celebrity-visit',
    name: '名人來訪',
    emoji: '⭐',
    category: 'positive',
    description: '天啊！那個人是...是那個很紅的YouTuber！他走向你的攤位...\n\n「老闆，聽說你的香腸很厲害，我要拍影片！」',
    minDay: 5,
    choices: [
      { text: '全力配合拍攝', emoji: '🎬', resultText: '影片上傳後爆紅！「夜市隱藏美食」標題讓你的攤位成為朝聖地。', effects: { reputation: 15, trafficBonus: 0.3 } },
      { text: '低調處理', emoji: '🤫', resultText: '他拍了一小段，效果普通。但至少沒有打擾到其他客人。', effects: { reputation: 5 } },
      { text: '要求先付錢再拍', emoji: '💵', resultText: 'YouTuber 翻白眼走了。你錯過了免費宣傳的機會。', effects: { reputation: -3 } },
    ],
  },
  {
    id: 'rain-bonus',
    name: '雷陣雨',
    emoji: '🌧️',
    category: 'positive',
    description: '突然下起大雨！路上的行人紛紛往有遮蔽的攤位躲。\n你的攤車剛好有遮雨棚，人群擠了過來。',
    minDay: 1,
    choices: [
      { text: '提供避雨 + 熱香腸', emoji: '☂️', resultText: '「下雨天吃熱香腸最讚了！」人們排隊購買，你忙到腳軟。', effects: { trafficBonus: 0.5, reputation: 5 } },
      { text: '正常營業', emoji: '🌭', resultText: '多了些客人，但沒有特別利用這個機會。', effects: { trafficBonus: 0.2 } },
      { text: '提早收攤', emoji: '🏠', resultText: '你收了攤，少了今天的收入，但至少不用淋雨。', effects: { money: -100 } },
    ],
  },
];

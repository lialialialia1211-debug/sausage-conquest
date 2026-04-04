export interface EventChoice {
  text: string;
  emoji: string;
  resultText: string;
  effects: {
    money?: number;
    reputation?: number;
    trafficBonus?: number;
    skipDay?: boolean;
    undergroundRep?: number;
    chaosPoints?: number;
    managementFeePaid?: number;
    blacklistBank?: boolean;
    unlockBlackMarket?: boolean;
  };
}

export interface GameEvent {
  id: string;
  name: string;
  emoji: string;
  category: 'customer' | 'gangster' | 'positive' | 'underground' | 'social' | 'chaos';
  description: string;
  choices: EventChoice[];
  minDay: number;
}

export const GAME_EVENTS: GameEvent[] = [
  // 5 difficult customers
  {
    id: 'costco-guy',
    name: 'Costco比價哥',
    emoji: '',
    category: 'customer',
    description: '一個戴眼鏡的大叔走過來，拿起你的香腸端詳了一下...\n\n「這在 Costco 一包才 $199 耶，你一根賣這麼貴？」',
    minDay: 1,
    choices: [
      { text: '算你便宜 $5', emoji: '', resultText: '大叔滿意地買了一根，嘴裡還是念念有詞。', effects: { money: -5, reputation: 1 } },
      { text: 'Costco 有我烤的好吃嗎？', emoji: '', resultText: '大叔瞪了你一眼，轉身離去。但旁邊的人被你霸氣吸引，多買了幾根。', effects: { reputation: 3 } },
      { text: '送蒜蓉醬和解', emoji: '', resultText: '大叔嚐了一口：「嗯...這醬不錯，好吧原諒你。」還多買了兩根。', effects: { money: -3, reputation: 3 } },
    ],
  },
  {
    id: 'food-critic',
    name: '美食評論家',
    emoji: '',
    category: 'customer',
    description: '一個拿著筆記本的人走到攤前，似乎在打分數...\n\n「我是某美食部落格的編輯，可以試吃嗎？」',
    minDay: 3,
    choices: [
      { text: '免費請他吃最好的', emoji: '', resultText: '他吃了一口，眼睛一亮：「這會上我的推薦清單！」', effects: { money: -35, reputation: 8 } },
      { text: '跟其他客人一樣付錢', emoji: '', resultText: '他付了錢，默默吃完。評論中性，不好不壞。', effects: { reputation: 2 } },
      { text: '趕走他', emoji: '', resultText: '他在部落格寫了一篇負評...「態度極差，不推薦。」', effects: { reputation: -10 } },
    ],
  },
  {
    id: 'drunk-uncle',
    name: '醉漢大叔',
    emoji: '',
    category: 'customer',
    description: '一個滿臉通紅的大叔搖搖晃晃走過來，酒味撲鼻...\n\n「老...老闆，來十根！不對...來一根就好...」',
    minDay: 2,
    choices: [
      { text: '幫他叫計程車', emoji: '', resultText: '大叔感動得痛哭流涕，掏出 $200 塞給你：「你是好人...」', effects: { money: 200, reputation: 5 } },
      { text: '賣他一根就好', emoji: '', resultText: '大叔吃完就趴在攤前睡著了，嚇跑了幾個客人。', effects: { money: 35, reputation: -3 } },
      { text: '請他離開', emoji: '', resultText: '大叔嘟嘟囔囔走了。其他客人鬆了口氣。', effects: { reputation: 1 } },
    ],
  },
  {
    id: 'instagram-karen',
    name: 'IG打卡姐',
    emoji: '',
    category: 'customer',
    description: '一個穿著時尚的女生走過來，手機鏡頭對準你的攤車...\n\n「老闆～我粉絲五萬耶，給我免費吃可以幫你宣傳喔！」',
    minDay: 2,
    choices: [
      { text: '免費請她吃', emoji: '', resultText: '她拍了十五分鐘的照片，標註你的攤位。客人確實多了一些。', effects: { money: -35, trafficBonus: 0.2 } },
      { text: '打折就好', emoji: '', resultText: '她不太開心，但還是買了。發了一篇普通的限時動態。', effects: { money: -10, reputation: 1 } },
      { text: '五萬粉絲？我有五萬根香腸', emoji: '', resultText: '她氣呼呼地走了，但旁邊的攤販都拍手叫好。', effects: { reputation: 2 } },
    ],
  },
  {
    id: 'kid-tantrum',
    name: '熊孩子',
    emoji: '',
    category: 'customer',
    description: '一個小孩指著你的攤車大喊：「我要吃！我要吃！」\n他媽媽尷尬地看著你...小孩已經開始在地上打滾了。',
    minDay: 1,
    choices: [
      { text: '送他一根小的', emoji: '', resultText: '小孩破涕為笑，媽媽感激地多買了三根。「謝謝老闆！」', effects: { money: -15, reputation: 4 } },
      { text: '堅持要付錢', emoji: '', resultText: '媽媽付了錢，小孩還是不開心，哭聲引來側目。', effects: { money: 35, reputation: -2 } },
      { text: '表演翻香腸特技', emoji: '', resultText: '你花式翻了一根香腸，小孩看傻了停止哭鬧。圍觀群眾紛紛鼓掌買單。', effects: { reputation: 5, trafficBonus: 0.1 } },
    ],
  },
  // 3 gangster events (minDay 5+)
  {
    id: 'protection-fee',
    name: '收保護費',
    emoji: '',
    category: 'gangster',
    description: '兩個穿黑衣的壯漢走過來，其中一個掏出一根牙籤叼著...\n\n「老闆，我們是附近的...社區管理委員會。每個月的管理費該繳了。」',
    minDay: 5,
    choices: [
      { text: '乖乖交 $300', emoji: '', resultText: '壯漢滿意地點點頭：「很上道。以後有事找我們。」你獲得了...某種保護？', effects: { money: -300, reputation: -2 } },
      { text: '跟他們理論', emoji: '', resultText: '壯漢們面面相覷，最後笑了：「有種！但下次可沒這麼好說話。」', effects: { reputation: 5 } },
      { text: '報警', emoji: '', resultText: '警察來了，壯漢早就溜了。但你隱約覺得他們會記住這件事...', effects: { reputation: 3 } },
    ],
  },
  {
    id: 'territory-threat',
    name: '地盤警告',
    emoji: '',
    category: 'gangster',
    description: '你的攤車上被貼了一張紙條：\n\n「這是我的地盤。明天別來了。——隔壁老王」\n\n看來有人不太歡迎你的生意越做越好。',
    minDay: 7,
    choices: [
      { text: '照常營業，不理他', emoji: '', resultText: '什麼事也沒發生。也許只是虛張聲勢。但你多裝了一個監視器以防萬一。', effects: { reputation: 3 } },
      { text: '找對方談談', emoji: '', resultText: '原來是隔壁賣滷味的，覺得你搶了他客人。你們約好互相推薦。', effects: { reputation: 5, trafficBonus: 0.05 } },
      { text: '以牙還牙', emoji: '', resultText: '你在他攤位貼了更大的紙條。結果引發攤販公約糾紛，大家都不開心。', effects: { reputation: -5 } },
    ],
  },
  {
    id: 'gang-offer',
    name: '大哥入股',
    emoji: '',
    category: 'gangster',
    description: '一輛黑色賓士停在你攤位前，車窗搖下來...\n\n「小老闆，我觀察你很久了。你的手藝不錯，要不要讓我投資你？五五分帳。」',
    minDay: 10,
    choices: [
      { text: '接受投資', emoji: '', resultText: '大哥的人脈讓你的客源暴增。但以後賺的錢要分一半出去...', effects: { money: 2000, trafficBonus: 0.3 } },
      { text: '婉拒', emoji: '', resultText: '大哥笑了笑：「有骨氣。那就靠自己吧。」車窗緩緩搖上。', effects: { reputation: 5 } },
      { text: '反提議三七分', emoji: '', resultText: '大哥挑了挑眉：「有意思...好，七你三我，但你欠我一個人情。」', effects: { money: 1000, reputation: 3 } },
    ],
  },
  // 8 new events (underground / social / chaos)
  {
    id: 'management-fee-weekly',
    name: '管理費到期',
    emoji: '',
    category: 'underground',
    description: '戴紅臂章的管理員阿姨翻著收據本走過來：「這週的管理費 $500，麻煩一下。」',
    minDay: 7,
    choices: [
      {
        text: '乖乖付 $500',
        emoji: '',
        resultText: '乖乖繳錢，世界和平。阿姨在你攤位前留下一個微笑。',
        effects: { money: -500, reputation: 1, managementFeePaid: 500 },
      },
      {
        text: '據理力爭',
        emoji: '',
        resultText: '你拍桌子大聲理論，阿姨臉色難看地走了。聽說下週要加倍...',
        effects: { undergroundRep: 5, chaosPoints: 2, reputation: -2 },
      },
      {
        text: '強硬抵制',
        emoji: '',
        resultText: '你當著所有攤販的面把收據撕了。傳說今晚會有人來找你麻煩...',
        effects: { undergroundRep: 12, reputation: -5, chaosPoints: 3 },
      },
      {
        text: '假倒閉換牌',
        emoji: '',
        resultText: '你連夜換了招牌，對外宣稱前老闆跑路了。管理費歸零，但30%的老客人不認得你了。',
        effects: { undergroundRep: 8, chaosPoints: 4, reputation: -15 },
      },
    ],
  },
  {
    id: 'inspector-surprise',
    name: '稽查員突擊',
    emoji: '',
    category: 'underground',
    description: '一個穿制服的人推開人群走向你的攤位，手上拿著筆記本和相機。「例行衛生檢查，請出示營業許可。」',
    minDay: 3,
    choices: [
      {
        text: '配合檢查',
        emoji: '',
        resultText: '你的攤位乾淨整潔，稽查員點點頭：「不錯，繼續保持。」',
        effects: { reputation: 3 },
      },
      {
        text: '塞紅包 $200',
        emoji: '',
        resultText: '稽查員把紅包收進口袋，在報告上寫了「合格」就走了。',
        effects: { money: -200, undergroundRep: 5, chaosPoints: 3 },
      },
      {
        text: '假裝不是老闆',
        emoji: '',
        resultText: '你指著隔壁攤：「老闆出去了，我只是工讀生。」稽查員半信半疑地走了。',
        effects: { chaosPoints: 1 },
      },
    ],
  },
  {
    id: 'influencer-livestream',
    name: '網紅直播中',
    emoji: '',
    category: 'social',
    description: '一個拿著環形燈的年輕人對著手機：「家人們！我現在在一個超神秘的香腸攤！」你的攤位正在被直播給十萬粉絲看。',
    minDay: 4,
    choices: [
      {
        text: '表演花式烤香腸',
        emoji: '',
        resultText: '你表演了一手翻香腸特技，直播間刷了一排「太帥了」。明天客人會暴增！',
        effects: { reputation: 8, trafficBonus: 0.3 },
      },
      {
        text: '低調回應',
        emoji: '',
        resultText: '你微笑點頭繼續烤，彈幕寫著「老闆很chill」。',
        effects: { reputation: 2 },
      },
      {
        text: '搶他手機丟進油鍋',
        emoji: '',
        resultText: '手機在油鍋裡滋滋作響，直播間最後畫面是你猙獰的臉。你上了熱搜 #香腸攤暴徒',
        effects: { reputation: -15, undergroundRep: 10, chaosPoints: 5 },
      },
    ],
  },
  {
    id: 'competitor-spy',
    name: '競業臥底',
    emoji: '',
    category: 'underground',
    description: '你注意到一個戴墨鏡的人已經在你攤位前站了半小時，不斷偷看你的烤架和調料。',
    minDay: 6,
    choices: [
      {
        text: '假裝沒看到',
        emoji: '',
        resultText: '你繼續烤，假裝不知道。他記下了你的配方比例就離開了。',
        effects: {},
      },
      {
        text: '故意用錯配方讓他偷',
        emoji: '',
        resultText: '你故意把糖當鹽撒，他認真記下筆記。明天對手的香腸會很好笑。',
        effects: { undergroundRep: 5, chaosPoints: 2, trafficBonus: 0.1 },
      },
      {
        text: '正面對質',
        emoji: '',
        resultText: '你走過去一把扯掉他的墨鏡：「以為我不知道你是誰？」他嚇得轉身就跑。',
        effects: { reputation: -3, undergroundRep: 8, chaosPoints: 2 },
      },
    ],
  },
  {
    id: 'media-crisis-exposed',
    name: '記者深挖',
    emoji: '',
    category: 'social',
    description: '一個記者攔住你：「我們收到線報，你的攤位疑似涉及地下交易。請問你有什麼要回應的？」你的雙面人生被盯上了。',
    minDay: 14,
    choices: [
      {
        text: '全盤否認',
        emoji: '',
        resultText: '「完全沒有的事。」記者露出意味深長的笑容，你知道這不會是最後一次。',
        effects: { reputation: -10 },
      },
      {
        text: '公開認錯',
        emoji: '',
        resultText: '你流著眼淚開記者會道歉。地下的人覺得你是叛徒，但市民開始同情你。',
        effects: { reputation: -20, undergroundRep: -30, chaosPoints: 0 },
      },
      {
        text: '反過來收買記者',
        emoji: '',
        resultText: '「記者先生，這篇報導值多少？」他收了錢，報導變成了正面的美食特輯。',
        effects: { money: -500, undergroundRep: 15, chaosPoints: 5 },
      },
    ],
  },
  {
    id: 'employee-strike',
    name: '員工罷工',
    emoji: '',
    category: 'social',
    description: '你的工讀生們聚在一起，舉著用紙箱做的牌子：「加薪！加薪！不加薪就不翻香腸！」',
    minDay: 10,
    choices: [
      {
        text: '加薪 50%',
        emoji: '',
        resultText: '你大手一揮：「每人加薪50%！」工讀生們歡呼，今天士氣大增，工作效率提升。',
        effects: { money: -200, reputation: 5 },
      },
      {
        text: '你們都被開除',
        emoji: '',
        resultText: '你一個個指著他們：「不想做就滾！」他們哭著離開了，但攤位沒人幫忙了...',
        effects: { reputation: -5, undergroundRep: 3, chaosPoints: 2 },
      },
      {
        text: '假裝跟他們一起罷工',
        emoji: '',
        resultText: '你拿起牌子跟他們一起喊：「對！老闆太黑心了！」工讀生們一臉困惑：「...你就是老闆啊？」',
        effects: { undergroundRep: 5, chaosPoints: 3 },
      },
    ],
  },
  {
    id: 'expired-ingredient-gamble',
    name: '過期食材賭局',
    emoji: '',
    category: 'chaos',
    description: '冰箱裡發現一批過期三天的食材。丟掉可惜，用了有風險。你的良心和荷包正在天人交戰。',
    minDay: 5,
    choices: [
      {
        text: '果斷丟掉',
        emoji: '',
        resultText: '你把過期食材全倒了。雖然心痛，但良心過得去。',
        effects: { money: -100, reputation: 2 },
      },
      {
        text: '賭了！混進去賣',
        emoji: '',
        resultText: '你閉上眼把過期食材混進去了。60%沒事、30%差評、10%食物中毒... 結果...',
        effects: { money: -50, reputation: -3, chaosPoints: 3, undergroundRep: 3 },
      },
      {
        text: '加工後賣到黑市',
        emoji: '',
        resultText: '你把過期食材重新包裝，賣給了黑市的人。賺了一點，也髒了一點。',
        effects: { undergroundRep: 8, chaosPoints: 4, money: 80 },
      },
    ],
  },
  {
    id: 'underground-delivery',
    name: '神秘外送單',
    emoji: '',
    category: 'underground',
    description: '手機響了，一個沙啞的聲音：「聽說你的香腸不錯。我們需要 50 根送到一個地址，不要問為什麼。酬勞優渥。」',
    minDay: 8,
    choices: [
      {
        text: '接單！',
        emoji: '',
        resultText: '你連夜趕工 50 根香腸送到指定地點。門打開的那一刻，你看到裡面坐了一桌穿西裝的人... 不敢多看，收錢走人。',
        effects: { money: 300, undergroundRep: 10, chaosPoints: 3 },
      },
      {
        text: '太危險了',
        emoji: '',
        resultText: '你禮貌地拒絕了。電話那頭沉默了三秒後掛斷。你祈禱他們不會記仇。',
        effects: { reputation: 2 },
      },
      {
        text: '報警',
        emoji: '',
        resultText: '你報了警。警察破獲了一個地下賭場，你收到了市長的感謝狀。但江湖上傳開了你是抓耙仔...',
        effects: { reputation: 10, undergroundRep: -15, chaosPoints: 1 },
      },
    ],
  },
  // 3 positive events
  {
    id: 'food-festival',
    name: '美食節',
    emoji: '',
    category: 'positive',
    description: '今天夜市舉辦美食節！到處掛滿燈籠，人潮比平常多了好幾倍。\n\n「歡迎光臨第 87 屆夜市美食嘉年華～」',
    minDay: 3,
    choices: [
      { text: '加量不加價', emoji: '', resultText: '大排長龍！今天生意好到手都烤痠了。', effects: { trafficBonus: 0.4, reputation: 3 } },
      { text: '趁機漲價', emoji: '', resultText: '客人雖多，但看到價格都猶豫了一下。賺是有賺，但口碑...', effects: { money: 200, reputation: -3 } },
      { text: '推出美食節限定', emoji: '', resultText: '「美食節特別版」讓客人眼睛一亮，紛紛拍照打卡。', effects: { money: 100, reputation: 5, trafficBonus: 0.2 } },
    ],
  },
  {
    id: 'celebrity-visit',
    name: '名人來訪',
    emoji: '',
    category: 'positive',
    description: '天啊！那個人是...是那個很紅的YouTuber！他走向你的攤位...\n\n「老闆，聽說你的香腸很厲害，我要拍影片！」',
    minDay: 5,
    choices: [
      { text: '全力配合拍攝', emoji: '', resultText: '影片上傳後爆紅！「夜市隱藏美食」標題讓你的攤位成為朝聖地。', effects: { reputation: 15, trafficBonus: 0.3 } },
      { text: '低調處理', emoji: '', resultText: '他拍了一小段，效果普通。但至少沒有打擾到其他客人。', effects: { reputation: 5 } },
      { text: '要求先付錢再拍', emoji: '', resultText: 'YouTuber 翻白眼走了。你錯過了免費宣傳的機會。', effects: { reputation: -3 } },
    ],
  },
  {
    id: 'rain-bonus',
    name: '雷陣雨',
    emoji: '',
    category: 'positive',
    description: '突然下起大雨！路上的行人紛紛往有遮蔽的攤位躲。\n你的攤車剛好有遮雨棚，人群擠了過來。',
    minDay: 1,
    choices: [
      { text: '提供避雨 + 熱香腸', emoji: '', resultText: '「下雨天吃熱香腸最讚了！」人們排隊購買，你忙到腳軟。', effects: { trafficBonus: 0.5, reputation: 5 } },
      { text: '正常營業', emoji: '', resultText: '多了些客人，但沒有特別利用這個機會。', effects: { trafficBonus: 0.2 } },
      { text: '提早收攤', emoji: '', resultText: '你收了攤，少了今天的收入，但至少不用淋雨。', effects: { money: -100 } },
    ],
  },
];

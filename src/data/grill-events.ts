import type { GrillEvent } from '../types';
import { gameState } from '../state/GameState';

const GRILL_EVENT_IMAGE_KEYS: Record<string, string> = {
  karen: 'karen-alert',
  thug: 'event-thugs',
  beggar: 'event-drunk-uncle',
  inspector: 'event-inspector',
  'costco-guy': 'event-costco-guy',
  'food-critic': 'event-food-critic',
  'competitor-spy': 'karen-alert',
  'expired-ingredient-gamble': 'karen-alert',
  'protection-fee': 'event-thugs',
  'territory-threat': 'event-thugs',
  'gang-offer': 'event-thugs',
  'underground-delivery': 'event-thugs',
  'management-fee-weekly': 'event-inspector',
  'inspector-surprise': 'event-inspector',
  'media-crisis-exposed': 'event-food-critic',
  'food-festival': 'event-food-festival',
  'celebrity-visit': 'event-food-festival',
};

const GRILL_EVENT_CATEGORY_IMAGE_KEYS: Record<GrillEvent['category'], string> = {
  nuisance: 'karen-alert',
  thug: 'event-thugs',
  beggar: 'event-drunk-uncle',
  authority: 'event-inspector',
};

export function getGrillEventImageKey(event: GrillEvent): string {
  return GRILL_EVENT_IMAGE_KEYS[event.id] ?? GRILL_EVENT_CATEGORY_IMAGE_KEYS[event.category];
}

export const GRILL_EVENTS: GrillEvent[] = [
  // ── 奧客 (Karen) ─────────────────────────────────────────────────────────────
  {
    id: 'karen',
    name: '奧客大嬸',
    emoji: '',
    category: 'nuisance',
    description: '一個大嬸衝到攤位前，指著香腸大喊：「這什麼東西！我上次吃完拉三天！」（她根本沒來過）',
    minDay: 1,
    choices: [
      {
        emoji: '',
        text: '誠懇道歉送她一根',
        outcomes: [
          {
            probability: 1,
            resultText: '她吃完說「嗯...還行」走了',
            effects: { loseSausages: 1, reputation: 2 },
          },
        ],
      },
      {
        emoji: '',
        text: '「阿姨，我們上禮拜才開始賣的欸」',
        outcomes: [
          {
            probability: 0.5,
            resultText: '她臉紅紅地自己走了',
            effects: { reputation: 3 },
          },
          {
            probability: 0.5,
            resultText: '她愈鬧愈大，引來路人圍觀',
            effects: { reputation: -5, money: -100 },
          },
        ],
      },
      {
        emoji: '',
        text: '遞出一根碳化香腸：「這根特別招待」',
        outcomes: [
          {
            probability: 0.8,
            resultText: '她咬一口臉都綠了',
            effects: { reputation: -3 },
          },
          {
            probability: 0.2,
            resultText: '居然說焦香味很讚，成為常客',
            effects: { reputation: 5 },
          },
        ],
      },
    ],
  },

  // ── 流氓客 (Thug) ─────────────────────────────────────────────────────────────
  {
    id: 'thug',
    name: '刺青小哥',
    emoji: '',
    category: 'thug',
    description: '三個刺青小哥晃過來，其中一個拍了你的攤車：「兄弟，在這擺攤要懂規矩啊。」',
    minDay: 3,
    choices: [
      {
        emoji: '',
        text: '乖乖交保護費',
        outcomes: [
          {
            probability: 1,
            resultText: '他們點頭離開，三天內不會再來',
            effects: {
              money: -200,
              noMoreEventType: 'thug',
              noMoreDays: 3,
            },
          },
        ],
      },
      {
        emoji: '',
        text: '「我跟巷口阿龍很熟」',
        outcomes: [
          {
            probability: 0.4,
            resultText: '他們互看一眼，識趣地走了',
            effects: {},
          },
          {
            probability: 0.6,
            resultText: '他們翻你攤位洩憤',
            effects: { money: -300, loseSausages: 2 },
          },
        ],
      },
      {
        emoji: '',
        text: '拿起烤夾：「來啊！一對三我也不怕！」',
        outcomes: [
          {
            probability: 0.3,
            resultText: '圍觀群眾瘋狂鼓掌，你成了夜市英雄',
            effects: { reputation: 5, trafficBonus: 0.2 },
          },
          {
            probability: 0.7,
            resultText: '他們把你的烤架翻了',
            effects: { loseGrillSausages: 999, money: -500 },
          },
        ],
      },
    ],
  },

  // ── 乞丐 (Beggar) ─────────────────────────────────────────────────────────────
  {
    id: 'beggar',
    name: '流浪阿伯',
    emoji: '',
    category: 'beggar',
    description: '一個蓬頭垢面的老伯伯蹲在攤位旁，眼巴巴地看著烤架上的香腸。',
    minDay: 1,
    choices: [
      {
        emoji: '',
        text: '「阿伯，這根請你」',
        outcomes: [
          {
            probability: 1,
            resultText: '阿伯感動到眼眶泛紅',
            effects: { loseSausages: 1, reputation: 3 },
          },
        ],
      },
      {
        emoji: '',
        text: '假裝沒看到',
        outcomes: [
          {
            probability: 0.8,
            resultText: '阿伯默默離開，什麼都沒發生',
            effects: {},
          },
          {
            probability: 0.2,
            resultText: '他偷偷在部落格寫了一篇推薦文',
            effects: { reputation: 10, money: 500 },
          },
        ],
      },
      {
        emoji: '',
        text: '「阿伯，要不要來幫我翻香腸？」',
        outcomes: [
          {
            probability: 1,
            resultText: '阿伯捲起袖子幹勁十足（但技術堪憂）',
            effects: { extraSlot: true, loseSausages: 1 },
          },
        ],
      },
    ],
  },

  // ── 夜市管理員 (Night Market Manager) ─────────────────────────────────────────
  {
    id: 'inspector',
    name: '夜市管理員',
    emoji: '',
    category: 'authority',
    description: '戴紅臂章的管理員阿姨走過來，掏出一本皺巴巴的收據本：「規費還沒繳喔，三百塊。」',
    minDay: 5,
    choices: [
      {
        emoji: '',
        text: '正常繳費',
        outcomes: [
          {
            probability: 1,
            resultText: '乖乖繳錢，世界和平',
            effects: { money: -300 },
          },
        ],
      },
      {
        emoji: '',
        text: '「阿姨我剛才繳過了欸」（裝傻）',
        outcomes: [
          {
            probability: 0.3,
            resultText: '她翻了半天找不到紀錄，半信半疑走了',
            effects: {},
          },
          {
            probability: 0.7,
            resultText: '她在收據本上找到你的名字，怒加罰款',
            effects: { money: -600 },
          },
        ],
      },
      {
        emoji: '',
        text: '拿一根香腸往她臉上丟',
        outcomes: [
          {
            probability: 1,
            resultText: '隔壁攤販全體起立鼓掌，你成了夜市傳奇',
            effects: {
              loseSausages: 1,
              reputation: -10,
              money: -500,
              trafficBonus: 0.3,
            },
          },
        ],
      },
      {
        emoji: '',
        text: '「阿姨，這兩根頂級香腸請你帶回去」',
        outcomes: [
          {
            probability: 1,
            resultText: '她笑得合不攏嘴，幫你在管理員群組說好話',
            effects: {
              loseSausages: 2,
              reputation: 5,
              noMoreEventType: 'authority',
              noMoreDays: 5,
            },
          },
        ],
      },
    ],
  },
];

// ── 從 events.ts 遷移的 13 個事件（原 GameEvent → GrillEvent 格式）──────────────

// category mapping:
//   customer  → nuisance   (costco-guy, food-critic)
//   gangster  → thug       (protection-fee, territory-threat, gang-offer)
//   underground(管理費/稽查) → authority  (management-fee-weekly, inspector-surprise)
//   underground(其他)       → thug       (underground-delivery)
//   chaos     → nuisance   (expired-ingredient-gamble)
//   underground(競業)       → nuisance   (competitor-spy)
//   social    → authority  (media-crisis-exposed)
//   positive  → beggar     (food-festival, celebrity-visit)
//
// effects mapping:
//   trafficBonus / money / reputation / undergroundRep / chaosPoints /
//   managementFeePaid / blacklistBank / unlockBlackMarket → 直接保留
//   skipDay → 砍掉（13 個事件均無此鍵）

GRILL_EVENTS.push(
  // ── nuisance：奧客系 ──────────────────────────────────────────────────────────
  {
    id: 'costco-guy',
    name: 'Costco比價哥',
    emoji: '',
    category: 'nuisance',
    description: '一個戴眼鏡的大叔走過來，拿起你的香腸端詳了一下...\n\n「這在 Costco 一包才 $199 耶，你一根賣這麼貴？」',
    minDay: 1,
    choices: [
      {
        emoji: '',
        text: '算你便宜 $5',
        outcomes: [{ probability: 1, resultText: '大叔滿意地買了一根，嘴裡還是念念有詞。', effects: { money: -5, reputation: 1 } }],
      },
      {
        emoji: '',
        text: 'Costco 有我烤的好吃嗎？',
        outcomes: [{ probability: 1, resultText: '大叔瞪了你一眼，轉身離去。但旁邊的人被你霸氣吸引，多買了幾根。', effects: { reputation: 3 } }],
      },
      {
        emoji: '',
        text: '送蒜蓉醬和解',
        outcomes: [{ probability: 1, resultText: '大叔嚐了一口：「嗯...這醬不錯，好吧原諒你。」還多買了兩根。', effects: { money: -3, reputation: 3 } }],
      },
    ],
  },
  {
    id: 'food-critic',
    name: '美食評論家',
    emoji: '',
    category: 'nuisance',
    description: '一個拿著筆記本的人走到攤前，似乎在打分數...\n\n「我是某美食部落格的編輯，可以試吃嗎？」',
    minDay: 3,
    choices: [
      {
        emoji: '',
        text: '免費請他吃最好的',
        outcomes: [{ probability: 1, resultText: '他吃了一口，眼睛一亮：「這會上我的推薦清單！」', effects: { money: -35, reputation: 8 } }],
      },
      {
        emoji: '',
        text: '跟其他客人一樣付錢',
        outcomes: [{ probability: 1, resultText: '他付了錢，默默吃完。評論中性，不好不壞。', effects: { reputation: 2 } }],
      },
      {
        emoji: '',
        text: '趕走他',
        outcomes: [{ probability: 1, resultText: '他在部落格寫了一篇負評...「態度極差，不推薦。」', effects: { reputation: -10 } }],
      },
    ],
  },
  {
    id: 'competitor-spy',
    name: '競業臥底',
    emoji: '',
    category: 'nuisance',
    description: '你注意到一個戴墨鏡的人已經在你攤位前站了半小時，不斷偷看你的烤架和調料。',
    minDay: 6,
    choices: [
      {
        emoji: '',
        text: '假裝沒看到',
        outcomes: [{ probability: 1, resultText: '你繼續烤，假裝不知道。他記下了你的配方比例就離開了。', effects: {} }],
      },
      {
        emoji: '',
        text: '故意用錯配方讓他偷',
        outcomes: [{ probability: 1, resultText: '你故意把糖當鹽撒，他認真記下筆記。明天對手的香腸會很好笑。', effects: { undergroundRep: 5, chaosPoints: 2, trafficBonus: 0.1 } }],
      },
      {
        emoji: '',
        text: '正面對質',
        outcomes: [{ probability: 1, resultText: '你走過去一把扯掉他的墨鏡：「以為我不知道你是誰？」他嚇得轉身就跑。', effects: { reputation: -3, undergroundRep: 8, chaosPoints: 2 } }],
      },
    ],
  },
  {
    id: 'expired-ingredient-gamble',
    name: '過期食材賭局',
    emoji: '',
    category: 'nuisance',
    description: '冰箱裡發現一批過期三天的食材。丟掉可惜，用了有風險。你的良心和荷包正在天人交戰。',
    minDay: 5,
    choices: [
      {
        emoji: '',
        text: '果斷丟掉',
        outcomes: [{ probability: 1, resultText: '你把過期食材全倒了。雖然心痛，但良心過得去。', effects: { money: -100, reputation: 2 } }],
      },
      {
        emoji: '',
        text: '賭了！混進去賣',
        outcomes: [{ probability: 1, resultText: '你閉上眼把過期食材混進去了。60%沒事、30%差評、10%食物中毒... 結果...', effects: { money: -50, reputation: -3, chaosPoints: 3, undergroundRep: 3 } }],
      },
      {
        emoji: '',
        text: '加工後賣到黑市',
        outcomes: [{ probability: 1, resultText: '你把過期食材重新包裝，賣給了黑市的人。賺了一點，也髒了一點。', effects: { undergroundRep: 8, chaosPoints: 4, money: 80 } }],
      },
    ],
  },

  // ── thug：流氓系 ─────────────────────────────────────────────────────────────
  {
    id: 'protection-fee',
    name: '收保護費',
    emoji: '',
    category: 'thug',
    description: '兩個穿黑衣的壯漢走過來，其中一個掏出一根牙籤叼著...\n\n「老闆，我們是附近的...社區管理委員會。每個月的管理費該繳了。」',
    minDay: 5,
    choices: [
      {
        emoji: '',
        text: '乖乖交 $300',
        outcomes: [{ probability: 1, resultText: '壯漢滿意地點點頭：「很上道。以後有事找我們。」你獲得了...某種保護？', effects: { money: -300, reputation: -2 } }],
      },
      {
        emoji: '',
        text: '跟他們理論',
        outcomes: [{ probability: 1, resultText: '壯漢們面面相覷，最後笑了：「有種！但下次可沒這麼好說話。」', effects: { reputation: 5 } }],
      },
      {
        emoji: '',
        text: '報警',
        outcomes: [{ probability: 1, resultText: '警察來了，壯漢早就溜了。但你隱約覺得他們會記住這件事...', effects: { reputation: 3 } }],
      },
    ],
  },
  {
    id: 'territory-threat',
    name: '地盤警告',
    emoji: '',
    category: 'thug',
    description: '你的攤車上被貼了一張紙條：\n\n「這是我的地盤。明天別來了。——隔壁老王」\n\n看來有人不太歡迎你的生意越做越好。',
    minDay: 7,
    choices: [
      {
        emoji: '',
        text: '照常營業，不理他',
        outcomes: [{ probability: 1, resultText: '什麼事也沒發生。也許只是虛張聲勢。但你多裝了一個監視器以防萬一。', effects: { reputation: 3 } }],
      },
      {
        emoji: '',
        text: '找對方談談',
        outcomes: [{ probability: 1, resultText: '原來是隔壁賣滷味的，覺得你搶了他客人。你們約好互相推薦。', effects: { reputation: 5, trafficBonus: 0.05 } }],
      },
      {
        emoji: '',
        text: '以牙還牙',
        outcomes: [{ probability: 1, resultText: '你在他攤位貼了更大的紙條。結果引發攤販公約糾紛，大家都不開心。', effects: { reputation: -5 } }],
      },
    ],
  },
  {
    id: 'gang-offer',
    name: '大哥入股',
    emoji: '',
    category: 'thug',
    description: '一輛黑色賓士停在你攤位前，車窗搖下來...\n\n「小老闆，我觀察你很久了。你的手藝不錯，要不要讓我投資你？五五分帳。」',
    minDay: 10,
    choices: [
      {
        emoji: '',
        text: '接受投資',
        outcomes: [{ probability: 1, resultText: '大哥的人脈讓你的客源暴增。但以後賺的錢要分一半出去...', effects: { money: 2000, trafficBonus: 0.3 } }],
      },
      {
        emoji: '',
        text: '婉拒',
        outcomes: [{ probability: 1, resultText: '大哥笑了笑：「有骨氣。那就靠自己吧。」車窗緩緩搖上。', effects: { reputation: 5 } }],
      },
      {
        emoji: '',
        text: '反提議三七分',
        outcomes: [{ probability: 1, resultText: '大哥挑了挑眉：「有意思...好，七你三我，但你欠我一個人情。」', effects: { money: 1000, reputation: 3 } }],
      },
    ],
  },
  {
    id: 'underground-delivery',
    name: '神秘外送單',
    emoji: '',
    category: 'thug',
    description: '手機響了，一個沙啞的聲音：「聽說你的香腸不錯。我們需要 50 根送到一個地址，不要問為什麼。酬勞優渥。」',
    minDay: 8,
    choices: [
      {
        emoji: '',
        text: '接單！',
        outcomes: [{ probability: 1, resultText: '你連夜趕工 50 根香腸送到指定地點。門打開的那一刻，你看到裡面坐了一桌穿西裝的人... 不敢多看，收錢走人。', effects: { money: 300, undergroundRep: 10, chaosPoints: 3 } }],
      },
      {
        emoji: '',
        text: '太危險了',
        outcomes: [{ probability: 1, resultText: '你禮貌地拒絕了。電話那頭沉默了三秒後掛斷。你祈禱他們不會記仇。', effects: { reputation: 2 } }],
      },
      {
        emoji: '',
        text: '報警',
        outcomes: [{ probability: 1, resultText: '你報了警。警察破獲了一個地下賭場，你收到了市長的感謝狀。但江湖上傳開了你是抓耙仔...', effects: { reputation: 10, undergroundRep: -15, chaosPoints: 1 } }],
      },
    ],
  },

  // ── authority：官方系 ─────────────────────────────────────────────────────────
  {
    id: 'management-fee-weekly',
    name: '管理費到期',
    emoji: '',
    category: 'authority',
    description: '戴紅臂章的管理員阿姨翻著收據本走過來：「這週的管理費 $500，麻煩一下。」',
    minDay: 7,
    choices: [
      {
        emoji: '',
        text: '乖乖付 $500',
        outcomes: [{ probability: 1, resultText: '乖乖繳錢，世界和平。阿姨在你攤位前留下一個微笑。', effects: { money: -500, reputation: 1, managementFeePaid: 500 } }],
      },
      {
        emoji: '',
        text: '據理力爭',
        outcomes: [{ probability: 1, resultText: '你拍桌子大聲理論，阿姨臉色難看地走了。聽說下週要加倍...', effects: { undergroundRep: 5, chaosPoints: 2, reputation: -2 } }],
      },
      {
        emoji: '',
        text: '強硬抵制',
        outcomes: [{ probability: 1, resultText: '你當著所有攤販的面把收據撕了。傳說今晚會有人來找你麻煩...', effects: { undergroundRep: 12, reputation: -5, chaosPoints: 3 } }],
      },
      {
        emoji: '',
        text: '假倒閉換牌',
        outcomes: [{ probability: 1, resultText: '你連夜換了招牌，對外宣稱前老闆跑路了。管理費歸零，但30%的老客人不認得你了。', effects: { undergroundRep: 8, chaosPoints: 4, reputation: -15 } }],
      },
    ],
  },
  {
    id: 'inspector-surprise',
    name: '稽查員突擊',
    emoji: '',
    category: 'authority',
    description: '一個穿制服的人推開人群走向你的攤位，手上拿著筆記本和相機。「例行衛生檢查，請出示營業許可。」',
    minDay: 3,
    choices: [
      {
        emoji: '',
        text: '配合檢查',
        outcomes: [{ probability: 1, resultText: '你的攤位乾淨整潔，稽查員點點頭：「不錯，繼續保持。」', effects: { reputation: 3 } }],
      },
      {
        emoji: '',
        text: '塞紅包 $200',
        outcomes: [{ probability: 1, resultText: '稽查員把紅包收進口袋，在報告上寫了「合格」就走了。', effects: { money: -200, undergroundRep: 5, chaosPoints: 3 } }],
      },
      {
        emoji: '',
        text: '假裝不是老闆',
        outcomes: [{ probability: 1, resultText: '你指著隔壁攤：「老闆出去了，我只是工讀生。」稽查員半信半疑地走了。', effects: { chaosPoints: 1 } }],
      },
    ],
  },
  {
    id: 'media-crisis-exposed',
    name: '記者深挖',
    emoji: '',
    category: 'authority',
    description: '一個記者攔住你：「我們收到線報，你的攤位疑似涉及地下交易。請問你有什麼要回應的？」你的雙面人生被盯上了。',
    minDay: 14,
    choices: [
      {
        emoji: '',
        text: '全盤否認',
        outcomes: [{ probability: 1, resultText: '「完全沒有的事。」記者露出意味深長的笑容，你知道這不會是最後一次。', effects: { reputation: -10 } }],
      },
      {
        emoji: '',
        text: '公開認錯',
        outcomes: [{ probability: 1, resultText: '你流著眼淚開記者會道歉。地下的人覺得你是叛徒，但市民開始同情你。', effects: { reputation: -20, undergroundRep: -30, chaosPoints: 0 } }],
      },
      {
        emoji: '',
        text: '反過來收買記者',
        outcomes: [{ probability: 1, resultText: '「記者先生，這篇報導值多少？」他收了錢，報導變成了正面的美食特輯。', effects: { money: -500, undergroundRep: 15, chaosPoints: 5 } }],
      },
    ],
  },

  // ── beggar：正面/機緣系（原 positive category）─────────────────────────────────
  {
    id: 'food-festival',
    name: '美食節',
    emoji: '',
    category: 'beggar',
    description: '今天夜市舉辦美食節！到處掛滿燈籠，人潮比平常多了好幾倍。\n\n「歡迎光臨第 87 屆夜市美食嘉年華～」',
    minDay: 3,
    choices: [
      {
        emoji: '',
        text: '加量不加價',
        outcomes: [{ probability: 1, resultText: '大排長龍！今天生意好到手都烤痠了。', effects: { trafficBonus: 0.4, reputation: 3 } }],
      },
      {
        emoji: '',
        text: '趁機漲價',
        outcomes: [{ probability: 1, resultText: '客人雖多，但看到價格都猶豫了一下。賺是有賺，但口碑...', effects: { money: 200, reputation: -3 } }],
      },
      {
        emoji: '',
        text: '推出美食節限定',
        outcomes: [{ probability: 1, resultText: '「美食節特別版」讓客人眼睛一亮，紛紛拍照打卡。', effects: { money: 100, reputation: 5, trafficBonus: 0.2 } }],
      },
    ],
  },
  {
    id: 'celebrity-visit',
    name: '名人來訪',
    emoji: '',
    category: 'beggar',
    description: '天啊！那個人是...是那個很紅的YouTuber！他走向你的攤位...\n\n「老闆，聽說你的香腸很厲害，我要拍影片！」',
    minDay: 5,
    choices: [
      {
        emoji: '',
        text: '全力配合拍攝',
        outcomes: [{ probability: 1, resultText: '影片上傳後爆紅！「夜市隱藏美食」標題讓你的攤位成為朝聖地。', effects: { reputation: 15, trafficBonus: 0.3 } }],
      },
      {
        emoji: '',
        text: '低調處理',
        outcomes: [{ probability: 1, resultText: '他拍了一小段，效果普通。但至少沒有打擾到其他客人。', effects: { reputation: 5 } }],
      },
      {
        emoji: '',
        text: '要求先付錢再拍',
        outcomes: [{ probability: 1, resultText: 'YouTuber 翻白眼走了。你錯過了免費宣傳的機會。', effects: { reputation: -3 } }],
      },
    ],
  },
);

/**
 * Pick a random eligible grill event for the current day.
 * Respects minDay requirements and active cooldowns from gameState.grillEventCooldowns.
 *
 * @param day - current game day
 * @param recentEventIds - event IDs already triggered this session (avoid repeats in one day)
 * @returns a random eligible GrillEvent, or null if none qualify
 */
export function rollGrillEvent(day: number, recentEventIds: string[] = []): GrillEvent | null {
  const cooldowns = gameState.grillEventCooldowns ?? {};

  const eligible = GRILL_EVENTS.filter(event => {
    // Must meet minimum day requirement
    if (day < event.minDay) return false;
    // Must not be on cooldown (cooldown stores the day it expires)
    const cooldownExpiry = cooldowns[event.category] ?? 0;
    if (day < cooldownExpiry) return false;
    // Skip events already triggered this grilling session
    if (recentEventIds.includes(event.id)) return false;
    return true;
  });

  if (eligible.length === 0) return null;

  return eligible[Math.floor(Math.random() * eligible.length)];
}

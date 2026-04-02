// activities.ts — Away activities the player can do while workers manage the grill

export interface AwayActivity {
  id: string;
  name: string;
  emoji: string;
  description: string;
  duration: number;         // seconds of grill time consumed
  minDay: number;
  requiresBlackMarket?: boolean;
  outcomes: AwayOutcome[];
}

export interface AwayOutcome {
  probability: number;      // 0-1, should sum to 1 for all outcomes
  resultText: string;
  effects: {
    money?: number;
    reputation?: number;
    undergroundRep?: number;
    chaosPoints?: number;
    trafficBonus?: number;       // boost customer flow for remaining grill time
    battleBonus?: number;        // +damage% for next battle
    scareCustomers?: number;     // remove N customers from opponent (flavor)
    loseReputation?: number;     // if caught
    openBlackMarket?: boolean;   // open black market panel after
  };
}

export const AWAY_ACTIVITIES: AwayActivity[] = [
  {
    id: 'recruit-customers',
    name: '招攬客人',
    emoji: '📢',
    description: '站在路口大喊「好吃的烤香腸喔！」吸引路人過來',
    duration: 15,
    minDay: 1,
    outcomes: [
      {
        probability: 0.7,
        resultText: '你的叫賣聲響徹整條街，好幾個路人被吸引過來了！',
        effects: { trafficBonus: 0.3, reputation: 1 },
      },
      {
        probability: 0.2,
        resultText: '你喊到聲音沙啞，但效果還不錯，有一些人好奇地走過來。',
        effects: { trafficBonus: 0.15 },
      },
      {
        probability: 0.1,
        resultText: '隔壁攤販嫌你太吵，跟你對罵了一場。圍觀群眾反而變多了...',
        effects: { trafficBonus: 0.4, reputation: -2, undergroundRep: 2 },
      },
    ],
  },
  {
    id: 'scout-competitor',
    name: '考察對手攤位',
    emoji: '🔍',
    description: '偷偷走到對手攤位觀察他們的價格、烤法和生意狀況',
    duration: 20,
    minDay: 1,
    outcomes: [
      {
        probability: 0.5,
        resultText: '你成功觀察到對手的定價策略和烤制手法，下次戰鬥會更有把握！',
        effects: { battleBonus: 0.2 },
      },
      {
        probability: 0.3,
        resultText: '對手的工讀生認出你了，但你已經看到他們的進貨清單。有用！',
        effects: { battleBonus: 0.1, reputation: -1 },
      },
      {
        probability: 0.2,
        resultText: '你裝成客人點了一根，居然超好吃... 偷學到了一點訣竅。',
        effects: { battleBonus: 0.15, money: -30 },
      },
    ],
  },
  {
    id: 'sabotage-rival',
    name: '搗亂對手攤位',
    emoji: '💣',
    description: '趁對手不注意，偷偷搞一些小破壞... 道德感正在叫你停手',
    duration: 25,
    minDay: 3,
    outcomes: [
      {
        probability: 0.4,
        resultText: '你趁亂在對手的醬料裡多加了三倍的鹽。今晚他們的客人臉色會很精彩。',
        effects: { undergroundRep: 8, chaosPoints: 3, scareCustomers: 5 },
      },
      {
        probability: 0.3,
        resultText: '你成功把對手價目表上的價格偷偷改高了 50%。客人看到紛紛搖頭離去。',
        effects: { undergroundRep: 5, chaosPoints: 2, trafficBonus: 0.2 },
      },
      {
        probability: 0.2,
        resultText: '被對手當場抓到！他追了你三條街，你跑得比香腸還快。',
        effects: { reputation: -8, undergroundRep: 3, chaosPoints: 4 },
      },
      {
        probability: 0.1,
        resultText: '你不小心打翻了對手的瓦斯罐，整個攤位起火了！消防車都來了！',
        effects: { reputation: -15, undergroundRep: 15, chaosPoints: 8, money: -200 },
      },
    ],
  },
  {
    id: 'patrol-market',
    name: '巡邏夜市',
    emoji: '🚶',
    description: '在夜市裡四處晃晃，看看有什麼有趣的事情發生',
    duration: 15,
    minDay: 1,
    outcomes: [
      {
        probability: 0.3,
        resultText: '你在地上撿到一個紅包！裡面有 $100，今天是你的幸運日。',
        effects: { money: 100 },
      },
      {
        probability: 0.25,
        resultText: '遇到一個老伯跟你分享了烤香腸的祕訣：「火候要溫柔，跟對女朋友一樣。」',
        effects: { reputation: 2 },
      },
      {
        probability: 0.2,
        resultText: '你看到有人在賣可疑的調味料，交換了聯絡方式。地下管道 +1',
        effects: { undergroundRep: 5 },
      },
      {
        probability: 0.15,
        resultText: '不小心踩到一攤水滑倒了，路人都在笑你。丟臉但沒受傷。',
        effects: { reputation: -2 },
      },
      {
        probability: 0.1,
        resultText: '你撞見管理員在收受賄賂！拍了照片。「這照片很值錢喔...」',
        effects: { undergroundRep: 10, chaosPoints: 2 },
      },
    ],
  },
  {
    id: 'black-market-visit',
    name: '去黑市找貨',
    emoji: '💀',
    description: '趁工讀生顧攤，你溜進暗巷找黑市供應商',
    duration: 20,
    minDay: 5,
    requiresBlackMarket: true,
    outcomes: [
      {
        probability: 1.0,
        resultText: '你來到了熟悉的暗巷...',
        effects: { openBlackMarket: true },
      },
    ],
  },
  {
    id: 'street-performance',
    name: '街頭表演',
    emoji: '🎪',
    description: '在攤位前面耍烤夾雜技，用翻香腸的技術來吸引圍觀人群',
    duration: 20,
    minDay: 2,
    outcomes: [
      {
        probability: 0.4,
        resultText: '你的烤夾雜耍吸引了一大群人！有人還拍影片上傳，你要紅了！',
        effects: { reputation: 5, trafficBonus: 0.4 },
      },
      {
        probability: 0.3,
        resultText: '表演中規中矩，但有小朋友覺得你很厲害，拉著爸媽來買。',
        effects: { trafficBonus: 0.2, reputation: 2 },
      },
      {
        probability: 0.2,
        resultText: '烤夾飛出去砸到路人的珍珠奶茶... 你賠了一杯。',
        effects: { money: -60, reputation: -3 },
      },
      {
        probability: 0.1,
        resultText: '你的表演太精彩了，一個綜藝節目的星探留了名片給你！',
        effects: { reputation: 10, money: 200, trafficBonus: 0.5 },
      },
    ],
  },
  {
    id: 'beg-supplies',
    name: '跟隔壁攤借食材',
    emoji: '🙏',
    description: '厚著臉皮去隔壁攤借一點食材，反正鄰居嘛',
    duration: 10,
    minDay: 1,
    outcomes: [
      {
        probability: 0.5,
        resultText: '隔壁大姐爽快地給了你一些食材：「下次記得還啊！」',
        effects: { money: 50, reputation: 1 },  // money represents saved ingredient cost
      },
      {
        probability: 0.3,
        resultText: '「借？上次的還沒還呢！」大姐一臉嫌棄但還是給了你一點。',
        effects: { money: 20, reputation: -1 },
      },
      {
        probability: 0.2,
        resultText: '大姐不在，她的工讀生偷偷給你拿了一堆。「噓，別說是我。」',
        effects: { money: 80, undergroundRep: 2 },
      },
    ],
  },
];

/**
 * Get available activities for the current game state.
 * Filtering by minDay and requiresBlackMarket is done by the caller (GrillScene),
 * which has direct access to gameState without creating a circular dependency.
 */
export function getAvailableActivities(): AwayActivity[] {
  return AWAY_ACTIVITIES;
}

/**
 * Roll an outcome for an activity based on probabilities.
 * Uses cumulative distribution so probabilities do not need to be perfectly summed.
 */
export function rollActivityOutcome(activity: AwayActivity): AwayOutcome {
  const roll = Math.random();
  let cumulative = 0;
  for (const outcome of activity.outcomes) {
    cumulative += outcome.probability;
    if (roll < cumulative) return outcome;
  }
  return activity.outcomes[activity.outcomes.length - 1];
}

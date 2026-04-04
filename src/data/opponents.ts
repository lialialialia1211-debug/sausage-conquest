// AI opponent definitions for territory battles

export interface Opponent {
  id: string;
  name: string;
  emoji: string;
  gridSlot: number;
  difficulty: number;        // 1-5
  unitCount: number;         // how many sausages they field
  appearDay: number;         // which day this opponent first shows up
  pricingStrategy: 'cheap' | 'premium' | 'balanced';
  image?: string;
  dialogue: {
    beforeBattle: string;
    win: string;
    lose: string;
    greeting: string;        // shown when opponent first appears
  };
}

export const OPPONENTS: Opponent[] = [
  {
    id: 'toilet-uncle',
    name: '廁所阿伯',
    emoji: '',
    image: 'opponent-toilet-uncle.png',
    gridSlot: 2,
    difficulty: 1,
    unitCount: 3,
    appearDay: 1, // tier 2
    pricingStrategy: 'cheap',
    dialogue: {
      beforeBattle: '你也想搶我廁所旁的位子？',
      win: '嘿嘿，這位子的味道不是每個人都受得了的',
      lose: '算了...廁所旁也不是什麼好位子',
      greeting: '要上廁所嗎？旁邊就是',
    },
  },
  {
    id: 'alley-gang',
    name: '暗巷兄弟',
    emoji: '',
    image: 'opponent-alley-gang.png',
    gridSlot: 3,
    difficulty: 1,
    unitCount: 3,
    appearDay: 3, // tier 3
    pricingStrategy: 'cheap',
    dialogue: {
      beforeBattle: '暗巷是我們的地盤，識相的就讓開',
      win: '暗巷裡的生意，你做不來的',
      lose: '可惡...沒想到你還挺有種',
      greeting: '嘿，要不要來點「特別」的香腸？',
    },
  },
  {
    id: 'uncle',
    name: '烤香腸阿伯',
    emoji: '',
    image: 'opponent-uncle.png',
    gridSlot: 4,
    difficulty: 2,
    unitCount: 4,
    appearDay: 5, // tier 4
    pricingStrategy: 'balanced',
    dialogue: {
      beforeBattle: '年輕人，烤香腸可不是你想的那麼簡單',
      win: '薑還是老的辣，回去多練練吧',
      lose: '不錯嘛年輕人...後生可畏啊',
      greeting: '來來來，阿伯的香腸最正宗',
    },
  },
  {
    id: 'influencer',
    name: '網紅弟',
    emoji: '',
    image: 'opponent-influencer.png',
    gridSlot: 5,
    difficulty: 2,
    unitCount: 4,
    appearDay: 7, // tier 5
    pricingStrategy: 'balanced',
    dialogue: {
      beforeBattle: '家人們看好了！我要現場教訓這個搶位的！',
      win: '哈哈哈直播間的兄弟們看到了嗎！',
      lose: '切...先關直播...別錄了別錄了！',
      greeting: '歡迎來到我的直播攤位～',
    },
  },
  {
    id: 'fat-sister',
    name: '胖姐',
    emoji: '',
    image: 'opponent-fat-sister.png',
    gridSlot: 6,
    difficulty: 3,
    unitCount: 5,
    appearDay: 9, // tier 6
    pricingStrategy: 'premium',
    dialogue: {
      beforeBattle: '廟口這個位子可是我用命拚來的！',
      win: '姐在這夜市賣了二十年，你還嫩了點',
      lose: '什麼！居然輸給你這個菜鳥！',
      greeting: '要吃好料的就來姐這邊',
    },
  },
  {
    id: 'student',
    name: '大學生創業仔',
    emoji: '',
    image: 'opponent-student.png',
    gridSlot: 7,
    difficulty: 3,
    unitCount: 4,
    appearDay: 11, // tier 7
    pricingStrategy: 'cheap',
    dialogue: {
      beforeBattle: '我可是商學院第一名畢業的！理論上我不會輸！',
      win: '看吧！數據分析的力量！',
      lose: '這...教授沒教過這種情況...',
      greeting: '用數據說話，我的定價策略最優化',
    },
  },
  {
    id: 'sausage-prince',
    name: '香腸王子',
    emoji: '',
    image: 'opponent-sausage-prince.png',
    gridSlot: 8,
    difficulty: 4,
    unitCount: 5,
    appearDay: 13, // tier 8
    pricingStrategy: 'premium',
    dialogue: {
      beforeBattle: '你知道我為什麼叫王子嗎？因為國王的位子我還沒搶到',
      win: '王子的實力，你領教了吧',
      lose: '沒關係...王子終究會成為國王的',
      greeting: '品嚐王子等級的香腸吧',
    },
  },
  {
    id: 'sausage-king',
    name: '腸哥',
    emoji: '',
    image: 'opponent-sausage-king.png',
    gridSlot: 9,
    difficulty: 5,
    unitCount: 5,
    appearDay: 15, // tier 9 (final boss)
    pricingStrategy: 'premium',
    dialogue: {
      beforeBattle: '能走到這裡，你確實有兩下子。但夜市之王只有一個',
      win: '這就是王者的差距',
      lose: '不可能...我竟然...你是什麼怪物...',
      greeting: '...',
    },
  },
];

export const OPPONENT_MAP: Record<string, typeof OPPONENTS[0]> = Object.fromEntries(
  OPPONENTS.map(o => [o.id, o])
);

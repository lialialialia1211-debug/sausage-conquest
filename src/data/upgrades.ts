// Shop data for cart upgrades and marketing items.

export interface CartUpgrade {
  id: string;
  name: string;
  emoji: string;
  image?: string;
  cost: number;
  description: string;
  effect: Record<string, number>;
}

export interface MarketingItem {
  id: string;
  name: string;
  emoji: string;
  image?: string;
  cost: number;
  description: string;
  effect: Record<string, number>;
}

export const CART_UPGRADES: CartUpgrade[] = [
  {
    id: 'grill-expand',
    name: '雙排節奏烤架',
    emoji: '',
    image: 'upgrade-grill-expand.png',
    cost: 1000,
    description: '烤網容量 +2。滿架時繼續敲擊音符會更快把香腸推進保溫區，降低斷拍壓力。',
    effect: { grillSlots: 2, rhythmPressureRelief: 1 },
  },
  {
    id: 'mini-fridge',
    name: '節拍保鮮箱',
    emoji: '',
    image: 'upgrade-mini-fridge.png',
    cost: 800,
    description: '隔夜庫存損耗 -10%。早上進貨更有意義，保留更多明日可轉成音符的香腸。',
    effect: { spoilReduction: 0.1, stockStability: 1 },
  },
  {
    id: 'neon-sign',
    name: '節奏霓虹招牌',
    emoji: '',
    image: 'upgrade-neon-sign.png',
    cost: 600,
    description: '今日與後續客流 +15%。客人進場更密，COMBO 出餐更容易轉成收入。',
    effect: { trafficBonus: 0.15, rhythmCustomerFlow: 1 },
  },
  {
    id: 'seating',
    name: '候拍座位區',
    emoji: '',
    image: 'upgrade-seating.png',
    cost: 1200,
    description: '平均客單 +20%。客人等待容錯提升，適合高難度音符密集段。',
    effect: { spendBonus: 0.2, patienceBuffer: 1 },
  },
  {
    id: 'auto-grill',
    name: '自動出拍打包機',
    emoji: '',
    image: 'upgrade-auto-grill.png',
    cost: 3500,
    description: '保溫區每 3 秒自動出餐。把注意力留給 D/F 判定與滿架加熱。',
    effect: { autoFlip: 1, autoServeTempo: 1 },
  },
];

export const MARKETING_ITEMS: MarketingItem[] = [
  {
    id: 'flyer',
    name: '節拍傳單',
    emoji: '',
    image: 'marketing-flyer.png',
    cost: 50,
    description: '當日客流 +10%。開局就有更多等待客人，不讓出餐節奏空轉。',
    effect: { dailyTraffic: 0.1 },
  },
  {
    id: 'discount-sign',
    name: '拍點特價牌',
    emoji: '',
    image: 'marketing-discount-sign.png',
    cost: 30,
    description: '購買意願 +15%。命中節奏後更容易把保溫區香腸轉成現金。',
    effect: { buyRate: 0.15 },
  },
  {
    id: 'free-sample',
    name: '試吃暖拍',
    emoji: '',
    image: 'marketing-free-sample.png',
    cost: 80,
    description: '當日聲望 +5。降低失誤後的負評壓力，適合挑戰高密度曲段。',
    effect: { reputation: 5 },
  },
  {
    id: 'sausagebox',
    name: '盲抽香腸箱',
    emoji: '',
    image: 'marketing-sausagebox.png',
    cost: 100,
    description: '花 $20 抽一次特殊香腸，補足早上沒買到的音符材料。',
    effect: { sausagebox: 1 },
  },
];

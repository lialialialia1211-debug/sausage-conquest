// upgrades.ts — shop data for cart upgrades and marketing items

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
  { id: 'grill-expand', name: '烤架擴充', emoji: '', image: 'upgrade-grill-expand.png', cost: 1000, description: '同時烤制 +2 格', effect: { grillSlots: 2 } },
  { id: 'mini-fridge', name: '迷你冰箱', emoji: '', image: 'upgrade-mini-fridge.png', cost: 800, description: '隔夜損耗降為 10%', effect: { spoilReduction: 0.1 } },
  { id: 'neon-sign', name: '霓虹招牌', emoji: '', image: 'upgrade-neon-sign.png', cost: 600, description: '基礎客流 +15%', effect: { trafficBonus: 0.15 } },
  { id: 'seating', name: '座位區', emoji: '', image: 'upgrade-seating.png', cost: 1200, description: '平均消費 +20%', effect: { spendBonus: 0.2 } },
  {
    id: 'auto-grill',
    name: '自動打包機',
    emoji: '',
    image: 'upgrade-auto-grill.png',
    description: '自動把保溫區的香腸打包給客人，零延遲出餐！',
    cost: 3500,
    effect: { autoFlip: 1 },
  },
];

export const MARKETING_ITEMS: MarketingItem[] = [
  { id: 'flyer', name: '傳單', emoji: '', image: 'marketing-flyer.png', cost: 50, description: '今日客流 +10%', effect: { dailyTraffic: 0.1 } },
  { id: 'discount-sign', name: '特價牌', emoji: '', image: 'marketing-discount-sign.png', cost: 30, description: '購買率 +15%', effect: { buyRate: 0.15 } },
  { id: 'free-sample', name: '免費試吃', emoji: '', image: 'marketing-free-sample.png', cost: 80, description: '今日聲望 +5', effect: { reputation: 5 } },
  { id: 'sausagebox', name: '摸香腸箱', emoji: '', image: 'marketing-sausagebox.png', cost: 100, description: '客人付 $20 摸一次，莊家永遠贏', effect: { sausagebox: 1 } },
];

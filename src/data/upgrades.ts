// upgrades.ts — shop data for cart upgrades and marketing items

export interface CartUpgrade {
  id: string;
  name: string;
  emoji: string;
  cost: number;
  description: string;
  effect: Record<string, number>;
}

export interface MarketingItem {
  id: string;
  name: string;
  emoji: string;
  cost: number;
  description: string;
  effect: Record<string, number>;
}

export const CART_UPGRADES: CartUpgrade[] = [
  { id: 'grill-expand', name: '烤架擴充', emoji: '🔧', cost: 1000, description: '同時烤制 +2 格', effect: { grillSlots: 2 } },
  { id: 'mini-fridge', name: '迷你冰箱', emoji: '❄️', cost: 800, description: '隔夜損耗降為 10%', effect: { spoilReduction: 0.1 } },
  { id: 'neon-sign', name: '霓虹招牌', emoji: '💡', cost: 600, description: '基礎客流 +15%', effect: { trafficBonus: 0.15 } },
  { id: 'seating', name: '座位區', emoji: '🪑', cost: 1200, description: '平均消費 +20%', effect: { spendBonus: 0.2 } },
];

export const MARKETING_ITEMS: MarketingItem[] = [
  { id: 'flyer', name: '傳單', emoji: '📣', cost: 50, description: '今日客流 +10%', effect: { dailyTraffic: 0.1 } },
  { id: 'discount-sign', name: '特價牌', emoji: '🏷️', cost: 30, description: '購買率 +15%', effect: { buyRate: 0.15 } },
  { id: 'free-sample', name: '免費試吃', emoji: '🍢', cost: 80, description: '今日聲望 +5', effect: { reputation: 5 } },
  { id: 'sausagebox', name: '摸香腸箱', emoji: '🎰', cost: 100, description: '客人付 $20 摸一次，莊家永遠贏', effect: { sausagebox: 1 } },
];

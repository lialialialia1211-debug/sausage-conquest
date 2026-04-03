// Delivery mission definitions for 腸征天下

export interface DeliveryMission {
  id: string;
  clientName: string;
  clientEmoji: string;
  description: string;
  requiredSausages: number; // how many to deliver
  reward: number;           // cash reward
  riskLevel: number;        // 1–3
  minDay: number;
  undergroundRepRequired: number;
}

export const DELIVERY_MISSIONS: DeliveryMission[] = [
  {
    id: 'late-night-party',
    clientName: '深夜派對',
    clientEmoji: '🎉',
    description: '有人辦通宵派對，需要 10 根香腸送到指定地址',
    requiredSausages: 10,
    reward: 200,
    riskLevel: 1,
    minDay: 3,
    undergroundRepRequired: 0,
  },
  {
    id: 'yakuza-dinner',
    clientName: '神秘晚宴',
    clientEmoji: '🕴️',
    description: '一桌穿西裝的人要 20 根最好的香腸，不要問為什麼',
    requiredSausages: 20,
    reward: 500,
    riskLevel: 2,
    minDay: 5,
    undergroundRepRequired: 10,
  },
  {
    id: 'school-event',
    clientName: '學校園遊會',
    clientEmoji: '🏫',
    description: '附近國小園遊會需要 30 根香腸，限時供應',
    requiredSausages: 30,
    reward: 400,
    riskLevel: 1,
    minDay: 4,
    undergroundRepRequired: 0,
  },
  {
    id: 'underground-fight',
    clientName: '地下擂台賽',
    clientEmoji: '🥊',
    description: '地下格鬥場需要 15 根香腸當獎品，酬勞優渥',
    requiredSausages: 15,
    reward: 600,
    riskLevel: 3,
    minDay: 8,
    undergroundRepRequired: 20,
  },
  {
    id: 'tv-show',
    clientName: '美食節目',
    clientEmoji: '📺',
    description: '電視台要拍美食特輯，需要 25 根品質最好的',
    requiredSausages: 25,
    reward: 800,
    riskLevel: 1,
    minDay: 10,
    undergroundRepRequired: 0,
  },
];

export function getAvailableDeliveries(): DeliveryMission[] {
  const gs = (globalThis as any).__gameState;
  if (!gs) return DELIVERY_MISSIONS.filter((d) => d.minDay <= 1);
  return DELIVERY_MISSIONS.filter(
    (d) => d.minDay <= gs.day && d.undergroundRepRequired <= (gs.undergroundRep ?? 0),
  );
}

/** Return the total sausage count across all inventory slots. */
export function getTotalInventorySausages(inventory: Record<string, number>): number {
  return Object.values(inventory).reduce((sum, qty) => sum + (qty > 0 ? qty : 0), 0);
}

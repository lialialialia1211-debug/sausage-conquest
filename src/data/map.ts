// Night market grid data — 10 slots for the evening location selection phase

export interface GridSlot {
  id: number;          // 0-9
  name: string;        // Location name
  rent: number;        // Daily rent $200-800
  baseTraffic: number; // Base customer traffic 30-80
  owner: 'player' | 'opponent' | 'empty';
  opponentId?: string; // If occupied by AI opponent
}

export const GRID_SLOTS: GridSlot[] = [
  { id: 0, name: '入口旁',    rent: 210, baseTraffic: 50, owner: 'empty' },
  { id: 1, name: '廟口',      rent: 400, baseTraffic: 70, owner: 'empty' },
  { id: 2, name: '轉角',      rent: 280, baseTraffic: 55, owner: 'empty' },
  { id: 3, name: '小吃街中段', rent: 350, baseTraffic: 65, owner: 'opponent', opponentId: 'uncle' },
  { id: 4, name: '停車場旁',  rent: 80,  baseTraffic: 30, owner: 'empty' },
  { id: 5, name: '遊戲區',    rent: 245, baseTraffic: 45, owner: 'empty' },
  { id: 6, name: '飲料街',    rent: 315, baseTraffic: 60, owner: 'empty' },
  { id: 7, name: '網美牆',    rent: 490, baseTraffic: 75, owner: 'opponent', opponentId: 'influencer' },
  { id: 8, name: '後段',      rent: 175, baseTraffic: 35, owner: 'empty' },
  { id: 9, name: '出口旁',    rent: 210, baseTraffic: 40, owner: 'empty' },
];

// AI opponent display info
export const OPPONENT_INFO: Record<string, { emoji: string; name: string }> = {
  uncle:      { emoji: '🧓', name: '阿伯' },
  influencer: { emoji: '📱', name: '網紅弟' },
};

// Returns slots available for player selection (empty or already owned by player)
export function getAvailableSlots(): GridSlot[] {
  return GRID_SLOTS.filter(slot => slot.owner === 'empty' || slot.owner === 'player');
}

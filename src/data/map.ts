// Night market grid data — 9 linear tiers representing location progression

import { gameState } from '../state/GameState';

export interface GridSlot {
  id: number;
  name: string;
  emoji: string;
  rent: number;
  baseTraffic: number;
  trafficMultiplier: number;  // tier-based multiplier
  tier: number;               // 1-9
  description: string;
  opponentId: string;         // who occupies this slot initially
  opponentDifficulty: number; // 1-5
}

export const GRID_SLOTS: GridSlot[] = [
  { id: 1, name: '停車場角落', emoji: '', rent: 0,   baseTraffic: 20, trafficMultiplier: 1.0,  tier: 1, description: '沒人會來的鬼地方',       opponentId: '',              opponentDifficulty: 0 },
  { id: 2, name: '廁所旁邊',   emoji: '', rent: 80,  baseTraffic: 25, trafficMultiplier: 1.15, tier: 2, description: '臭味和香味交織',           opponentId: 'toilet-uncle',  opponentDifficulty: 1 },
  { id: 3, name: '暗巷口',     emoji: '', rent: 120, baseTraffic: 30, trafficMultiplier: 1.3,  tier: 3, description: '陰暗但有常客',             opponentId: 'alley-gang',    opponentDifficulty: 1 },
  { id: 4, name: '水溝邊',     emoji: '', rent: 160, baseTraffic: 35, trafficMultiplier: 1.45, tier: 4, description: '偶爾飄來異味',             opponentId: 'uncle',         opponentDifficulty: 2 },
  { id: 5, name: '十字路口',   emoji: '', rent: 220, baseTraffic: 45, trafficMultiplier: 1.6,  tier: 5, description: '四面八方的人流',           opponentId: 'influencer',    opponentDifficulty: 2 },
  { id: 6, name: '廟口前',     emoji: '', rent: 300, baseTraffic: 50, trafficMultiplier: 1.8,  tier: 6, description: '拜拜完就想吃東西',         opponentId: 'fat-sister',    opponentDifficulty: 3 },
  { id: 7, name: '夜市入口',   emoji: '', rent: 380, baseTraffic: 55, trafficMultiplier: 2.0,  tier: 7, description: '第一眼就看到你',           opponentId: 'student',       opponentDifficulty: 3 },
  { id: 8, name: '舞台旁',     emoji: '', rent: 350, baseTraffic: 65, trafficMultiplier: 2.3,  tier: 8, description: '表演散場客人超多',         opponentId: 'sausage-prince', opponentDifficulty: 4 },
  { id: 9, name: '夜市正中央', emoji: '', rent: 400, baseTraffic: 75, trafficMultiplier: 3.0,  tier: 9, description: '夜市的心臟，人流最密集',   opponentId: 'sausage-king',  opponentDifficulty: 5 },
];

// AI opponent display info
export const OPPONENT_INFO: Record<string, { emoji: string; name: string }> = {
  uncle:          { emoji: '', name: '阿伯' },
  influencer:     { emoji: '', name: '網紅弟' },
  'toilet-uncle': { emoji: '', name: '廁所阿伯' },
  'alley-gang':   { emoji: '', name: '暗巷幫' },
  'fat-sister':   { emoji: '', name: '胖姐' },
  student:        { emoji: '', name: '學生仔' },
  'sausage-prince': { emoji: '', name: '香腸王子' },
  'sausage-king': { emoji: '', name: '香腸大王' },
};

// Returns the slot matching a given tier
export function getSlotByTier(tier: number): GridSlot | undefined {
  return GRID_SLOTS.find(s => s.tier === tier);
}

// Returns the slot currently occupied by the player
export function getPlayerSlot(): GridSlot {
  return GRID_SLOTS.find(s => s.tier === gameState.playerSlot) || GRID_SLOTS[0];
}

// Returns slots available for player progression (tiers above current player tier)
export function getAvailableSlots(): GridSlot[] {
  return GRID_SLOTS.filter(slot => slot.tier >= gameState.playerSlot);
}

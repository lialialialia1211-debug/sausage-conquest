import { EventBus } from '../utils/EventBus';
import type { GamePhase, LoanState, SaleRecord } from '../types';

// Single source of truth for all game state
// Always create new objects rather than mutating (immutability principle)
export const gameState = {
  day: 1,
  money: 5000,
  reputation: 50,
  phase: 'boot' as GamePhase,
  inventory: {} as Record<string, number>,
  map: {} as Record<number, string>,
  upgrades: {} as Record<string, boolean>,
  loans: {
    active: null,
    bankBlacklisted: false,
  } as LoanState,
  stats: {
    totalSausagesSold: 0,
    totalRevenue: 0,
    totalExpenses: 0,
    battlesWon: 0,
    battlesLost: 0,
  } as Record<string, number>,
  dailyExpenses: 0,
  selectedSlot: -1 as number,
  prices: {} as Record<string, number>,
  // Temporary daily sales log — GrillScene writes, SummaryScene reads
  dailySalesLog: [] as SaleRecord[],
  // Temporary grill stats for today — GrillScene writes, SummaryScene reads
  dailyGrillStats: { perfect: 0, ok: 0, raw: 0, burnt: 0 } as { perfect: number; ok: number; raw: number; burnt: number },
  // Unlocked sausage types (starts with 3 base types)
  unlockedSausages: ['black-pig', 'flying-fish-roe', 'garlic-bomb'] as string[],
  // AI opponent tracking
  activeOpponents: [] as string[],
  defeatedOpponents: [] as string[],
};

// Update state and notify UI via EventBus
export function updateGameState(updates: Partial<typeof gameState>): void {
  Object.assign(gameState, updates);
  EventBus.emit('state-updated', { ...gameState });
}

export function advanceDay(): void {
  updateGameState({ day: gameState.day + 1 });
}

export function addMoney(amount: number): void {
  updateGameState({ money: gameState.money + amount });
}

export function spendMoney(amount: number): boolean {
  if (gameState.money < amount) return false;
  updateGameState({ money: gameState.money - amount });
  return true;
}

export function changeReputation(delta: number): void {
  const newRep = Math.max(0, Math.min(100, gameState.reputation + delta));
  updateGameState({ reputation: newRep });
}

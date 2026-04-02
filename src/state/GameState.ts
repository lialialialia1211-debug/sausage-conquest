import { EventBus } from '../utils/EventBus';
import type { GamePhase, LoanState, SaleRecord, WarmingSausage } from '../types';

// Single source of truth for all game state
// Always create new objects rather than mutating (immutability principle)
export const gameState = {
  day: 1,
  money: 8000,
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
    totalPerfect: 0,
    totalBurnt: 0,
    totalLoansRepaid: 0,
  } as Record<string, number>,
  dailyExpenses: 0,
  selectedSlot: -1 as number,
  prices: {} as Record<string, number>,
  // Temporary daily sales log — GrillScene writes, SummaryScene reads
  dailySalesLog: [] as SaleRecord[],
  // Temporary grill stats for today — GrillScene writes, SummaryScene reads
  dailyGrillStats: { perfect: 0, ok: 0, raw: 0, burnt: 0, 'half-cooked': 0, 'slightly-burnt': 0, carbonized: 0 } as { perfect: number; ok: number; raw: number; burnt: number; 'half-cooked': number; 'slightly-burnt': number; carbonized: number },
  // Warming zone: sausages removed from grill awaiting service
  warmingZone: [] as WarmingSausage[],
  // Waste tracking at end of day
  dailyWaste: { grillRemaining: 0, warmingRemaining: 0 } as { grillRemaining: number; warmingRemaining: number },
  // Unlocked sausage types (starts with 3 base types)
  unlockedSausages: ['black-pig', 'flying-fish-roe', 'garlic-bomb'] as string[],
  // AI opponent tracking
  activeOpponents: [] as string[],
  defeatedOpponents: [] as string[],
  // Daily event effects (reset each day)
  dailyTrafficBonus: 0,
  skipDay: false,
};

// Update state and notify UI via EventBus
export function updateGameState(updates: Partial<typeof gameState>): void {
  Object.assign(gameState, updates);
  EventBus.emit('state-updated', { ...gameState });
}

export function advanceDay(): void {
  // Carry over warming zone sausages as overnight items (don't discard)
  const overnightSausages = gameState.warmingZone.map(ws => ({
    ...ws,
    isOvernight: true,
    warmingState: 'cold' as const,
  }));

  updateGameState({
    day: gameState.day + 1,
    dailyExpenses: 0,
    dailySalesLog: [],
    dailyGrillStats: { perfect: 0, ok: 0, raw: 0, burnt: 0, 'half-cooked': 0, 'slightly-burnt': 0, carbonized: 0 },
    warmingZone: overnightSausages,
    dailyWaste: { grillRemaining: 0, warmingRemaining: 0 },
    dailyTrafficBonus: 0,
    skipDay: false,
  });
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

import { EventBus } from '../utils/EventBus';
import type { GamePhase, LoanState } from '../types';

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
  } as Record<string, number>,
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

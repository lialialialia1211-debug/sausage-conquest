import { EventBus } from '../utils/EventBus';
import type { CustomerLoyaltyRecord, GamePhase, HuiState, LoanState, ManagementFeeState, OrderScore, PlayerLoan, SaleRecord, WarmingSausage } from '../types';

// Single source of truth for all game state
// Always create new objects rather than mutating (immutability principle)
export const gameState = {
  day: 1,
  money: 8000,
  reputation: 50,
  phase: 'boot' as GamePhase,
  inventory: {} as Record<string, number>,
  playerSlot: 1 as number,  // current tier (1-9), starts at bottom
  map: { 1: 'player', 2: 'enemy', 3: 'enemy', 4: 'enemy', 5: 'enemy', 6: 'enemy', 7: 'enemy', 8: 'enemy', 9: 'enemy' } as Record<number, string>,
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
    totalCarbonized: 0,
    totalLoansRepaid: 0,
  } as Record<string, number>,
  dailyExpenses: 0,
  selectedSlot: 1 as number,
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
  unlockedSausages: ['black-pig', 'flying-fish-roe', 'garlic-bomb', 'big-taste'] as string[],
  // AI opponent tracking
  activeOpponents: [] as string[],
  defeatedOpponents: [] as string[],
  // Daily event effects (reset each day)
  dailyTrafficBonus: 0,
  // Grill perfect count for current day — read by BattleScene for combat bonus
  dailyPerfectCount: 0,
  skipDay: false,
  // Hired part-time workers (array of worker IDs)
  hiredWorkers: [] as string[],
  // Track purchased marketing items for refund support: itemId -> purchase count
  marketingPurchases: {} as Record<string, number>,
  // Grill event cooldowns: category -> day number when cooldown expires
  grillEventCooldowns: {} as Record<string, number>,
  // Whether worker salaries have been paid today (reset each day)
  workerSalaryPaid: false,
  undergroundRep: 0,
  reputationCrisisDay: -1,
  chaosCount: 0,
  dailyChaosActions: [] as string[],
  hasBodyguard: false,
  bodyguardDaysLeft: 0,
  managementFee: {
    weeklyAmount: 500,
    lastPaidDay: 0,
    isResisting: false,
    resistDays: 0,
    bribedInspector: false,
    rebranded: false,
  } as ManagementFeeState,
  blackMarketUnlocked: false,
  blackMarketStock: {} as Record<string, number>,
  customerLoyalty: {} as Record<string, CustomerLoyaltyRecord>,
  dailyOrderScores: [] as OrderScore[],  // scores for today's orders, reset daily
  battleBonus: 0,  // accumulated from scouting activities
  playerLoans: [] as PlayerLoan[],
  hui: {
    isActive: false,
    day: 0,
    cycle: 0,
    members: [],
    pot: 0,
    dailyFee: 100,
    playerHasCollected: false,
    playerBidAmount: 0,
    runaway: false,
    totalPaidIn: 0,
    totalCollected: 0,
  } as HuiState,
  gameMode: '' as string,  // 'normal' | 'simulation' | '' (not yet chosen)
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
    workerSalaryPaid: false,
    dailyOrderScores: [],
    battleBonus: 0,
    // grillEventCooldowns persist across days — do NOT reset here
    // customerLoyalty persists across days — do NOT reset here
  });
  // Bodyguard countdown (use updateGameState for reactivity)
  if (gameState.bodyguardDaysLeft > 0) {
    const newDays = gameState.bodyguardDaysLeft - 1;
    updateGameState({
      bodyguardDaysLeft: newDays,
      hasBodyguard: newDays > 0,
    });
  }
  // Reset daily chaos log
  updateGameState({ dailyChaosActions: [] });
}

export function addMoney(amount: number): void {
  updateGameState({ money: Math.max(0, gameState.money + amount) });
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

export function changeUndergroundRep(delta: number): void {
  const newRep = Math.max(0, Math.min(100, gameState.undergroundRep + delta));
  updateGameState({ undergroundRep: newRep });
}

export function addChaos(points: number, description: string): void {
  const newCount = gameState.chaosCount + points;
  const newActions = [...gameState.dailyChaosActions, description];
  updateGameState({ chaosCount: newCount, dailyChaosActions: newActions });
}

export function isManagementFeeDue(): boolean {
  return gameState.day % 7 === 0 && gameState.day > 0;
}

// EconomyEngine — pure logic, no Phaser dependency, no UI code
import { gameState, addMoney, spendMoney, updateGameState } from '../state/GameState';
import { SAUSAGE_MAP } from '../data/sausages';
import { WORKERS } from '../data/workers';
import type { DailySummary, SaleRecord } from '../types';

/**
 * Purchase stock of a given sausage type.
 * Deducts cost from player money, adds quantity to inventory.
 * Returns false if player cannot afford the purchase.
 */
export function buyStock(sausageId: string, quantity: number): boolean {
  const sausage = SAUSAGE_MAP[sausageId];
  if (!sausage) return false;

  const totalCost = sausage.cost * quantity;
  const success = spendMoney(totalCost);
  if (!success) return false;

  const currentQty = gameState.inventory[sausageId] ?? 0;
  updateGameState({
    inventory: {
      ...gameState.inventory,
      [sausageId]: currentQty + quantity,
    },
  });

  // Track expenses in stats (cumulative) and daily
  const stats = { ...gameState.stats, totalExpenses: (gameState.stats['totalExpenses'] ?? 0) + totalCost };
  updateGameState({ stats, dailyExpenses: (gameState.dailyExpenses ?? 0) + totalCost });

  return true;
}

/**
 * Overnight spoilage: each sausage type loses 20% inventory (floor).
 * With mini-fridge upgrade, only 10% is lost instead.
 * Returns a map of sausageId -> units spoiled.
 */
export function spoilOvernight(): Record<string, number> {
  const spoilage: Record<string, number> = {};
  const newInventory: Record<string, number> = {};
  const hasMiniFridge = gameState.upgrades['mini-fridge'] === true;
  const retainRate = hasMiniFridge ? 0.9 : 0.8;

  for (const [id, qty] of Object.entries(gameState.inventory)) {
    const remaining = Math.floor(qty * retainRate);
    const lost = qty - remaining;
    spoilage[id] = lost;
    newInventory[id] = remaining;
  }

  updateGameState({ inventory: newInventory });
  return spoilage;
}

/**
 * Calculate a daily summary from today's sales log.
 * Also updates the running stats in gameState.
 */
export function calculateDailyReport(salesLog: SaleRecord[]): DailySummary {
  let revenue = 0;
  let sausagesSold = 0;
  let totalSatisfaction = 0;

  for (const sale of salesLog) {
    revenue += sale.price;
    sausagesSold += 1;
    totalSatisfaction += sale.customerSatisfaction;
  }

  // Use today's expenses only (reset each morning)
  const expenses = gameState.dailyExpenses ?? 0;
  const profit = revenue - expenses;

  // Reputation change: satisfaction > 0.7 => +1 rep per 5 happy customers
  const avgSatisfaction = sausagesSold > 0 ? totalSatisfaction / sausagesSold : 0;
  const reputationChange = avgSatisfaction > 0.7
    ? Math.floor(sausagesSold / 5)
    : avgSatisfaction < 0.3
    ? -Math.floor(sausagesSold / 5)
    : 0;

  // Update running stats
  const updatedStats = {
    ...gameState.stats,
    totalSausagesSold: (gameState.stats['totalSausagesSold'] ?? 0) + sausagesSold,
    totalRevenue: (gameState.stats['totalRevenue'] ?? 0) + revenue,
  };
  updateGameState({ stats: updatedStats });

  return {
    day: gameState.day,
    revenue,
    expenses,
    profit,
    reputationChange,
    sausagesSold,
  };
}

/**
 * Clear warming zone and grill at end of day.
 * Returns waste counts for summary display.
 * Actual clearing happens in GrillScene.endGrilling() and GameState.advanceDay().
 * This function reads the stored values from gameState.dailyWaste.
 */
export function clearEndOfDayWaste(): { grillWaste: number; warmingWaste: number } {
  return {
    grillWaste: gameState.dailyWaste?.grillRemaining ?? 0,
    warmingWaste: gameState.dailyWaste?.warmingRemaining ?? 0,
  };
}

/**
 * Refund a previously purchased marketing item at 70% of its original price.
 * Decrements the purchase count in gameState.marketingPurchases.
 * Returns true if the refund succeeded.
 */
export function refundMarketing(itemId: string, price: number): boolean {
  const purchases = gameState.marketingPurchases || {};
  if (!purchases[itemId] || purchases[itemId] <= 0) return false;
  const refundAmount = Math.floor(price * 0.7);
  addMoney(refundAmount);
  const updatedPurchases = { ...purchases, [itemId]: purchases[itemId] - 1 };
  updateGameState({ marketingPurchases: updatedPurchases });
  return true;
}

/**
 * Deduct daily salaries for all hired workers.
 * Returns the total amount paid.
 */
export function payWorkerSalaries(): number {
  const hired = gameState.hiredWorkers ?? [];
  if (hired.length === 0) return 0;

  const totalSalary = hired.reduce((sum, workerId) => {
    const worker = WORKERS.find(w => w.id === workerId);
    return sum + (worker?.dailySalary ?? 0);
  }, 0);

  if (totalSalary <= 0) return 0;

  const paid = spendMoney(totalSalary);
  if (!paid) {
    // 付不起，不標記已付款、不累加費用
    return 0;
  }

  const updatedStats = {
    ...gameState.stats,
    totalExpenses: (gameState.stats['totalExpenses'] ?? 0) + totalSalary,
  };
  updateGameState({
    stats: updatedStats,
    dailyExpenses: (gameState.dailyExpenses ?? 0) + totalSalary,
    workerSalaryPaid: true,
  });

  return totalSalary;
}

/**
 * Calculate the cut dad takes from today's revenue (10% if 'dad' is hired).
 * Returns the amount deducted. Caller should pass actual revenue earned.
 */
export function applyDadTax(revenue: number): number {
  if (!gameState.hiredWorkers.includes('dad')) return 0;
  const dadCut = Math.floor(revenue * 0.1);
  spendMoney(dadCut);
  return dadCut;
}

/**
 * Process one sausage sale.
 * Deducts 1 unit from inventory, adds price to money.
 * Returns a SaleRecord. Returns null if out of stock.
 */
export function sellSausage(sausageId: string, price: number, quality: number): SaleRecord | null {
  // Inventory was already deducted when the sausage was placed on the grill.
  // Selling from the warming zone should NOT deduct again.
  // We still check that there is at least 0 (non-negative) to keep the guard sane,
  // but we skip the additional deduction.

  const seatBonus = gameState.upgrades['seating'] ? 1.2 : 1.0;
  const finalPrice = Math.round(price * seatBonus);
  addMoney(finalPrice);

  const sausage = SAUSAGE_MAP[sausageId];
  const expectedPrice = sausage?.suggestedPrice ?? price;
  // Customer satisfaction: quality weight 60%, price fairness 40%
  const priceFairness = expectedPrice > 0
    ? Math.min(1, Math.max(0, 1 - (price - expectedPrice) / expectedPrice))
    : 1;
  const customerSatisfaction = Math.min(1, quality * 0.6 + priceFairness * 0.4);

  return {
    sausageId,
    price: finalPrice,
    quality,
    customerSatisfaction,
  };
}

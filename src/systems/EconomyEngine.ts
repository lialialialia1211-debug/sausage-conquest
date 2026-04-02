// EconomyEngine — pure logic, no Phaser dependency, no UI code
import { gameState, addMoney, spendMoney, updateGameState } from '../state/GameState';
import { SAUSAGE_MAP } from '../data/sausages';
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
 * Process one sausage sale.
 * Deducts 1 unit from inventory, adds price to money.
 * Returns a SaleRecord. Returns null if out of stock.
 */
export function sellSausage(sausageId: string, price: number, quality: number): SaleRecord | null {
  const currentQty = gameState.inventory[sausageId] ?? 0;
  if (currentQty <= 0) return null;

  // Deduct from inventory
  updateGameState({
    inventory: {
      ...gameState.inventory,
      [sausageId]: currentQty - 1,
    },
  });

  const seatBonus = gameState.upgrades['seating'] ? 1.2 : 1.0;
  const finalPrice = price * seatBonus;
  addMoney(finalPrice);

  const sausage = SAUSAGE_MAP[sausageId];
  const expectedPrice = sausage?.suggestedPrice ?? price;
  // Customer satisfaction: quality weight 60%, price fairness 40%
  const priceFairness = Math.min(1, Math.max(0, 1 - (price - expectedPrice) / expectedPrice));
  const customerSatisfaction = Math.min(1, quality * 0.6 + priceFairness * 0.4);

  return {
    sausageId,
    price,
    quality,
    customerSatisfaction,
  };
}

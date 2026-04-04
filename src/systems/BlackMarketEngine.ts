// BlackMarketEngine — pure logic, no Phaser dependency, no UI code
import type { BlackMarketItem } from '../types';
import { gameState, updateGameState, spendMoney, changeReputation, changeUndergroundRep, addChaos } from '../state/GameState';
import { EventBus } from '../utils/EventBus';

export const BLACK_MARKET_ITEMS: BlackMarketItem[] = [
  {
    id: 'mystery-meat',
    name: '神秘肉（來路不明）',
    emoji: '',
    cost: 8,
    qualityBonus: 0,
    catchChance: 0.25,
    chaosPoints: 2,
  },
  {
    id: 'super-spice',
    name: '違禁香料（讓人上癮）',
    emoji: '',
    cost: 50,
    qualityBonus: 0.3,
    catchChance: 0.4,
    chaosPoints: 3,
  },
  {
    id: 'expired-luxury',
    name: '過期高檔食材',
    emoji: '',
    cost: 20,
    qualityBonus: 0.15,
    catchChance: 0.2,
    chaosPoints: 2,
  },
  {
    id: 'rival-recipe',
    name: '競業偷來的配方',
    emoji: '',
    cost: 150,
    qualityBonus: 0.5,
    catchChance: 0.1,
    chaosPoints: 5,
  },
];

/**
 * Returns true if the black market is available to the player.
 * Either explicitly unlocked via flag, or auto-unlocked on day 5+ with enough underground rep.
 */
export function isBlackMarketUnlocked(): boolean {
  return gameState.blackMarketUnlocked || (gameState.day >= 5 && gameState.undergroundRep >= 10);
}

/**
 * Checks unlock conditions and sets the blackMarketUnlocked flag if met.
 * Returns true only on the transition frame (i.e., the moment it first unlocks).
 */
export function checkAndUnlockBlackMarket(): boolean {
  if (!gameState.blackMarketUnlocked && gameState.day >= 5 && gameState.undergroundRep >= 10) {
    updateGameState({ blackMarketUnlocked: true });
    return true; // just unlocked
  }
  return false;
}

/**
 * Attempts to purchase a black market item.
 * Deducts money, updates stock, adds chaos and underground rep.
 * May trigger the inspector if the player is caught (unless inspector is bribed).
 */
export function buyBlackMarket(itemId: string, quantity: number = 1): { success: boolean; caught: boolean; message: string } {
  const item = BLACK_MARKET_ITEMS.find(i => i.id === itemId);
  if (!item) return { success: false, caught: false, message: '找不到商品' };

  const totalCost = item.cost * quantity;
  if (!spendMoney(totalCost)) return { success: false, caught: false, message: '錢不夠' };

  // Add to stock
  const stock = { ...(gameState.blackMarketStock || {}) };
  stock[itemId] = (stock[itemId] || 0) + quantity;
  updateGameState({ blackMarketStock: stock });

  // Chaos and underground rep
  addChaos(item.chaosPoints * quantity, `購買黑市商品：${item.name} ×${quantity}`);
  changeUndergroundRep(2 * quantity);

  // Check if caught (unless inspector is bribed)
  const caught = Math.random() < item.catchChance && !gameState.managementFee.bribedInspector;
  if (caught) {
    EventBus.emit('inspector-triggered');
    return { success: true, caught: true, message: `買到了，但是被稽查員盯上了！` };
  }

  return { success: true, caught: false, message: `成功購入 ${item.name} ×${quantity}` };
}

/**
 * Consumes one unit of a black market item from stock and returns its quality bonus.
 * Returns { used: false, qualityBonus: 0 } if the item is not in stock.
 */
export function useBlackMarketItem(itemId: string): { used: boolean; qualityBonus: number } {
  const stock = gameState.blackMarketStock || {};
  if (!stock[itemId] || stock[itemId] <= 0) return { used: false, qualityBonus: 0 };

  const item = BLACK_MARKET_ITEMS.find(i => i.id === itemId);
  if (!item) return { used: false, qualityBonus: 0 };

  const newStock = { ...stock };
  newStock[itemId]--;
  if (newStock[itemId] <= 0) delete newStock[itemId];
  updateGameState({ blackMarketStock: newStock });

  return { used: true, qualityBonus: item.qualityBonus };
}

/**
 * Performs a fake closure rebrand (假倒閉換牌).
 * Sacrifices 30% of current reputation to reset management fee resistance
 * and gain underground rep and chaos points.
 */
export function doRebrand(): void {
  const reputationLost = Math.floor(gameState.reputation * 0.3);
  changeReputation(-reputationLost);
  const newFee = { ...gameState.managementFee };
  newFee.lastPaidDay = gameState.day;
  newFee.isResisting = false;
  newFee.rebranded = true;
  updateGameState({ managementFee: newFee });
  addChaos(4, '假倒閉換牌');
  changeUndergroundRep(8);
}

/**
 * Looks up a black market item by its id.
 * Returns undefined if no match is found.
 */
export function getBlackMarketItemById(id: string): BlackMarketItem | undefined {
  return BLACK_MARKET_ITEMS.find(i => i.id === id);
}

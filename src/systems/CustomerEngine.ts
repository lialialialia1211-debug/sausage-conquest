// CustomerEngine — pure logic, no Phaser dependency, no UI code
import type { Customer, BattleType } from '../types';
import { SAUSAGE_MAP, SAUSAGE_TYPES } from '../data/sausages';
import { gameState } from '../state/GameState';

let customerIdCounter = 0;

/**
 * Generate a queue of customers for a grid slot.
 * Base count driven by footTraffic (1-5); marketingBonus scales it up.
 */
export function generateCustomers(gridFootTraffic: number, marketingBonus: number): Customer[] {
  // Base count: footTraffic * 3, scaled by marketing
  const baseCount = Math.round(gridFootTraffic * 3 * (1 + marketingBonus));
  const customers: Customer[] = [];

  const battleTypes: BattleType[] = ['normal', 'ranged', 'aoe', 'tank', 'assassin', 'support'];

  for (let i = 0; i < baseCount; i++) {
    // Random max price: 80-150% of typical price range
    const maxPriceMultiplier = 0.8 + Math.random() * 0.7;
    const unlockedPrices = SAUSAGE_TYPES
      .filter(s => gameState.unlockedSausages.includes(s.id))
      .map(s => s.suggestedPrice);
    const avgExpectedPrice = unlockedPrices.length > 0
      ? unlockedPrices.reduce((sum, p) => sum + p, 0) / unlockedPrices.length
      : 38;
    const maxPrice = Math.round(avgExpectedPrice * maxPriceMultiplier);

    // ~30% of customers have a type preference
    const hasPreference = Math.random() < 0.3;
    const preferredType = hasPreference
      ? battleTypes[Math.floor(Math.random() * battleTypes.length)]
      : undefined;

    customers.push({
      id: `customer-${++customerIdCounter}`,
      patience: 10 + Math.random() * 20, // 10-30 seconds
      preferredType,
      maxPrice,
    });
  }

  return customers;
}

/**
 * Determine whether a customer will buy a sausage at the given price/quality.
 *
 * purchaseChance = baseAttraction × priceFactor × marketingBonus × qualityScore
 *   baseAttraction = gridFootTraffic × (1 + neighborEffect)
 *   priceFactor = 1 - (price - expectedPrice) / expectedPrice × 2
 *   marketingBonus = 1 + sum of marketing effects
 *   qualityScore = grilling quality average (0.5 ~ 1.5)
 */
export function willBuy(
  customer: Customer,
  sausageId: string,
  price: number,
  qualityScore: number,
  gridFootTraffic: number = 3,
  neighborEffect: number = 0,
  marketingEffects: number[] = [],
): boolean {
  const sausage = SAUSAGE_MAP[sausageId];
  if (!sausage) return false;

  // Hard cap: never buy above personal max price
  if (price > customer.maxPrice) return false;

  const expectedPrice = sausage.suggestedPrice;

  // baseAttraction: normalized 0-1 from footTraffic (1-5)
  const baseAttraction = (gridFootTraffic / 5) * (1 + neighborEffect);

  // priceFactor drops sharply above expected price
  const priceDelta = (price - expectedPrice) / expectedPrice;
  const priceFactor = Math.max(0, 1 - priceDelta * 2);

  // marketingBonus
  const marketingBonus = 1 + marketingEffects.reduce((sum, e) => sum + e, 0);

  // qualityScore clamped
  const clampedQuality = Math.max(0.1, Math.min(1.5, qualityScore));

  // Bonus for preferred type match
  const preferenceBonus = customer.preferredType === sausage.battle.type ? 1.2 : 1.0;

  const purchaseChance = baseAttraction * priceFactor * marketingBonus * clampedQuality * preferenceBonus;

  return Math.random() < Math.min(0.95, purchaseChance);
}

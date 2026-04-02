// CustomerEngine — pure logic, no Phaser dependency, no UI code
import type { Customer, BattleType, CustomerPersonality } from '../types';
import { SAUSAGE_MAP, SAUSAGE_TYPES } from '../data/sausages';
import { gameState } from '../state/GameState';

let customerIdCounter = 0;

/**
 * Generate a queue of customers for a grid slot.
 * Base count driven by footTraffic (1-5); marketingBonus scales it up.
 */
export function generateCustomers(gridFootTraffic: number, marketingBonus: number): Customer[] {
  // Base count: footTraffic * 3, scaled by marketing
  let baseCount = Math.round(gridFootTraffic * 3 * (1 + marketingBonus));

  // Worker 'mei' brings in more customers (+30% traffic)
  if (gameState.hiredWorkers.includes('mei')) {
    baseCount = Math.round(baseCount * 1.3);
  }

  // Cap at 80 customers per session
  baseCount = Math.min(baseCount, 80);

  const customers: Customer[] = [];

  const battleTypes: BattleType[] = ['normal', 'ranged', 'aoe', 'tank', 'assassin', 'support'];

  // Track whether an enforcer has been assigned this generation pass
  let enforcerAssigned = false;

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

    // Personality assignment
    let personality: CustomerPersonality = 'normal';
    let isVIP: boolean | undefined;

    if (gameState.day % 7 === 5 && i === 0 && !enforcerAssigned) {
      // First customer on enforcer day is always an enforcer
      personality = 'enforcer';
      enforcerAssigned = true;
    } else {
      const roll = Math.random();
      if (roll < 0.15) {
        personality = 'karen';
      } else if (roll < 0.23) {
        personality = 'fatcat';
        isVIP = true;
      } else if (roll < 0.28 && gameState.day >= 3) {
        personality = 'inspector';
      } else if (roll < 0.32 && gameState.day >= 6) {
        personality = 'spy';
      } else if (roll < 0.35 && gameState.day >= 4) {
        personality = 'influencer';
      } else {
        personality = 'normal';
      }
    }

    customers.push({
      id: `customer-${++customerIdCounter}`,
      patience: 30 + Math.random() * 30, // 30-60 seconds
      preferredType,
      maxPrice,
      personality,
      ...(isVIP !== undefined ? { isVIP } : {}),
    });
  }

  // Guarantee at least 20 customers regardless of footTraffic/marketing
  while (customers.length < 20) {
    const maxPriceMultiplier = 0.8 + Math.random() * 0.7;
    const unlockedPrices = SAUSAGE_TYPES
      .filter(s => gameState.unlockedSausages.includes(s.id))
      .map(s => s.suggestedPrice);
    const avgExpectedPrice = unlockedPrices.length > 0
      ? unlockedPrices.reduce((sum, p) => sum + p, 0) / unlockedPrices.length
      : 38;
    const maxPrice = Math.round(avgExpectedPrice * maxPriceMultiplier);
    const battleTypes: BattleType[] = ['normal', 'ranged', 'aoe', 'tank', 'assassin', 'support'];
    const hasPreference = Math.random() < 0.3;
    const preferredType = hasPreference
      ? battleTypes[Math.floor(Math.random() * battleTypes.length)]
      : undefined;
    customers.push({
      id: `customer-${++customerIdCounter}`,
      patience: 12 + Math.random() * 13,
      preferredType,
      maxPrice,
      personality: 'normal',
    });
  }

  return customers;
}

/**
 * Returns a display emoji for a given customer personality.
 * Useful for UI layers that need a quick visual indicator.
 */
export function getPersonalityEmoji(personality: CustomerPersonality): string {
  const map: Record<CustomerPersonality, string> = {
    normal: '😊',
    karen: '🤬',
    enforcer: '🔪',
    inspector: '📋',
    fatcat: '🤑',
    spy: '🕵️',
    influencer: '📱',
  };
  return map[personality] || '😊';
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
  let priceFactor = Math.max(0, 1 - priceDelta * 2);

  // If price is within ±20% of suggested, guarantee at least 0.8 factor
  if (Math.abs(priceDelta) <= 0.2) priceFactor = Math.max(0.8, priceFactor);

  // Harsh penalty for extreme overpricing (>150% of suggested)
  if (priceDelta > 0.5) priceFactor = Math.max(0, priceFactor * 0.3);

  // marketingBonus
  const marketingBonus = 1 + marketingEffects.reduce((sum, e) => sum + e, 0);

  // qualityScore clamped
  const clampedQuality = Math.max(0.1, Math.min(1.5, qualityScore));

  // Bonus for preferred type match
  const preferenceBonus = customer.preferredType === sausage.battle.type ? 1.2 : 1.0;

  const purchaseChance = baseAttraction * priceFactor * marketingBonus * clampedQuality * preferenceBonus;

  return Math.random() < Math.max(0.4, Math.min(0.95, purchaseChance));
}

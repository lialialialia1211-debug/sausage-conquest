// CustomerEngine — pure logic, no Phaser dependency, no UI code
import type { Customer, BattleType, CustomerPersonality, CustomerOrder, LoyaltyBadge } from '../types';
import { SAUSAGE_MAP, SAUSAGE_TYPES } from '../data/sausages';
import { CONDIMENTS } from '../data/condiments';
import { gameState } from '../state/GameState';
import { getReturningCustomers, getOrCreateLoyalty, getLoyaltyPatienceMult } from './LoyaltyEngine';

let customerIdCounter = 0;

export function resetCustomerEngine(): void {
  customerIdCounter = 0;
}

/**
 * Generate a random order for a customer based on the current day.
 * Sausage types unlock progressively; condiments are chosen at random.
 */
function generateOrder(day: number, personality?: string): CustomerOrder {
  // Get unlocked sausage types based on day
  const unlocked: string[] = ['black-pig', 'flying-fish-roe', 'garlic-bomb'];
  if (day >= 5) unlocked.push('cheese');
  if (day >= 8) unlocked.push('squidink');
  if (day >= 12) unlocked.push('mala');

  let sausageType: string;

  // Some personalities have preferences
  if (personality === 'karen') {
    // Karens always order the most expensive available
    sausageType = unlocked.reduce((a, b) => {
      const sa = SAUSAGE_TYPES.find(s => s.id === a);
      const sb = SAUSAGE_TYPES.find(s => s.id === b);
      return (sa?.suggestedPrice || 0) > (sb?.suggestedPrice || 0) ? a : b;
    });
  } else if (personality === 'fatcat') {
    // VIPs want premium or special sausages
    const premium = unlocked.filter(id => {
      const s = SAUSAGE_TYPES.find(s => s.id === id);
      return s && (s.cost >= 30 || s.specialEffect);
    });
    sausageType = premium.length > 0
      ? premium[Math.floor(Math.random() * premium.length)]
      : unlocked[Math.floor(Math.random() * unlocked.length)];
  } else if (personality === 'influencer') {
    // Influencers want photogenic food (special effect sausages)
    const special = unlocked.filter(id => SAUSAGE_TYPES.find(s => s.id === id)?.specialEffect);
    sausageType = special.length > 0
      ? special[Math.floor(Math.random() * special.length)]
      : unlocked[Math.floor(Math.random() * unlocked.length)];
  } else {
    // Normal random selection
    sausageType = unlocked[Math.floor(Math.random() * unlocked.length)];
  }

  // Pick 0-3 condiments
  const condimentCount = Math.floor(Math.random() * 4); // 0, 1, 2, or 3
  const availableCondiments = CONDIMENTS.map(c => c.id);
  const shuffled = [...availableCondiments].sort(() => Math.random() - 0.5);
  const condiments = shuffled.slice(0, condimentCount);

  return { sausageType, condiments };
}

/**
 * Generate a queue of customers for a grid slot.
 * Base count driven by footTraffic (1-5); marketingBonus scales it up.
 */
export function generateCustomers(gridFootTraffic: number, marketingBonus: number): Customer[] {
  // Base multiplier scales with day: 0.8x day1, grows to 3x by day 20
  const dayMultiplier = 0.8 + Math.min(2.2, (gameState.day - 1) * 0.11);
  let baseCount = Math.round(gridFootTraffic * dayMultiplier * (1 + marketingBonus));

  // Worker 'mei' brings in more customers (+30% traffic)
  if (gameState.hiredWorkers.includes('mei')) {
    baseCount = Math.round(baseCount * 1.3);
  }

  // Cap scales with day: 15 on day 1, up to 80 by day 20
  const dayCap = Math.min(80, 15 + (gameState.day - 1) * 3);
  baseCount = Math.min(baseCount, dayCap);

  const customers: Customer[] = [];

  // Compute average price for loyalty-based max-price scaling
  const allUnlockedPrices = SAUSAGE_TYPES
    .filter(s => gameState.unlockedSausages.includes(s.id))
    .map(s => s.suggestedPrice);
  const avgPrice = allUnlockedPrices.length > 0
    ? allUnlockedPrices.reduce((sum, p) => sum + p, 0) / allUnlockedPrices.length
    : 38;

  // Inject returning loyal customers before the main generation loop
  const returningIds = getReturningCustomers(Math.min(5, Math.floor(baseCount * 0.2)));
  for (const loyaltyId of returningIds) {
    const { record } = getOrCreateLoyalty(loyaltyId);
    const patienceMult = getLoyaltyPatienceMult(record.badge);

    const returningCustomer: Customer = {
      id: `customer-${++customerIdCounter}`,
      patience: (30 + Math.random() * 30) * patienceMult,
      maxPrice: Math.round(avgPrice * (1.2 + (record.badge === 'gold' ? 0.5 : record.badge === 'silver' ? 0.3 : 0.1))),
      personality: 'normal' as CustomerPersonality,
      order: generateOrder(gameState.day, 'normal'),
      loyaltyId,
      loyaltyBadge: record.badge,
    };

    customers.push(returningCustomer);
  }

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
    // Higher tiers attract wealthier customers
    const tierPremium = 1 + (gameState.playerSlot - 1) * 0.08; // tier 1 = 1.0x, tier 9 = 1.64x
    const maxPrice = Math.round(avgExpectedPrice * maxPriceMultiplier * tierPremium);

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

    const { id: loyaltyId } = getOrCreateLoyalty();
    // Higher tiers attract customers happy to wait at popular spots
    const tierPatienceBonus = 1 + (gameState.playerSlot - 1) * 0.05; // tier 1 = 1.0, tier 9 = 1.4
    customers.push({
      id: `customer-${++customerIdCounter}`,
      patience: (30 + Math.random() * 30) * tierPatienceBonus,
      preferredType,
      maxPrice,
      personality,
      order: generateOrder(gameState.day, personality),
      loyaltyId,
      loyaltyBadge: 'none' as LoyaltyBadge,
      ...(isVIP !== undefined ? { isVIP } : {}),
    });
  }

  // Guarantee minimum customers: 6 on day 1, scales to 20 by day 10
  const minGuarantee = Math.min(20, 6 + (gameState.day - 1) * 1.5);
  while (customers.length < minGuarantee) {
    const maxPriceMultiplier = 0.8 + Math.random() * 0.7;
    const unlockedPrices = SAUSAGE_TYPES
      .filter(s => gameState.unlockedSausages.includes(s.id))
      .map(s => s.suggestedPrice);
    const avgExpectedPrice = unlockedPrices.length > 0
      ? unlockedPrices.reduce((sum, p) => sum + p, 0) / unlockedPrices.length
      : 38;
    // Higher tiers attract wealthier customers
    const tierPremium = 1 + (gameState.playerSlot - 1) * 0.08; // tier 1 = 1.0x, tier 9 = 1.64x
    const maxPrice = Math.round(avgExpectedPrice * maxPriceMultiplier * tierPremium);
    const battleTypes: BattleType[] = ['normal', 'ranged', 'aoe', 'tank', 'assassin', 'support'];
    const hasPreference = Math.random() < 0.3;
    const preferredType = hasPreference
      ? battleTypes[Math.floor(Math.random() * battleTypes.length)]
      : undefined;
    const { id: loyaltyId } = getOrCreateLoyalty();
    // Higher tiers attract customers happy to wait at popular spots
    const tierPatienceBonus = 1 + (gameState.playerSlot - 1) * 0.05; // tier 1 = 1.0, tier 9 = 1.4
    customers.push({
      id: `customer-${++customerIdCounter}`,
      patience: (12 + Math.random() * 13) * tierPatienceBonus,
      preferredType,
      maxPrice,
      personality: 'normal',
      order: generateOrder(gameState.day, 'normal'),
      loyaltyId,
      loyaltyBadge: 'none' as LoyaltyBadge,
    });
  }

  return customers;
}

/**
 * Returns a display emoji for a given customer personality.
 * Useful for UI layers that need a quick visual indicator.
 */
export function getPersonalityEmoji(_personality: CustomerPersonality): string {
  return '';
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

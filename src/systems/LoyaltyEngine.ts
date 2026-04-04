// LoyaltyEngine — pure logic, no Phaser dependency
// Manages customer loyalty records and badge progression

import type { CustomerLoyaltyRecord, LoyaltyBadge } from '../types';
import { gameState, updateGameState } from '../state/GameState';

// Pool of random Taiwanese names for generating regulars
const NAME_POOL = [
  '阿明', '小美', '阿華', '大頭', '小胖', '阿嬤', '阿公',
  '小陳', '老王', '阿芬', '小林', '大壯', '阿珠', '小黃',
  '阿國', '秀英', '志明', '春嬌', '阿西', '小馬',
  '阿德', '麗麗', '建仔', '美玲', '阿海', '小花',
  '大雄', '靜香', '胖虎', '小夫',
];

const EMOJI_POOL = [''];  // emoji removed

/**
 * Get or create a loyalty record for a customer.
 * Returns the loyaltyId and record.
 */
export function getOrCreateLoyalty(loyaltyId?: string): { id: string; record: CustomerLoyaltyRecord } {
  const loyalty = { ...(gameState.customerLoyalty || {}) };

  if (loyaltyId && loyalty[loyaltyId]) {
    return { id: loyaltyId, record: loyalty[loyaltyId] };
  }

  // Create new customer
  const id = loyaltyId || `cust_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const name = NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)];
  const emoji = EMOJI_POOL[Math.floor(Math.random() * EMOJI_POOL.length)];

  const record: CustomerLoyaltyRecord = {
    name,
    emoji,
    visits: 0,
    totalStars: 0,
    badge: 'none',
    lastVisitDay: gameState.day,
  };

  loyalty[id] = record;
  updateGameState({ customerLoyalty: loyalty });

  return { id, record };
}

/**
 * Record a visit and add stars. Returns updated record.
 */
export function recordVisit(loyaltyId: string, starsEarned: number): CustomerLoyaltyRecord {
  const loyalty = { ...(gameState.customerLoyalty || {}) };
  const record = loyalty[loyaltyId];
  if (!record) return getOrCreateLoyalty(loyaltyId).record;

  const updated: CustomerLoyaltyRecord = {
    ...record,
    visits: record.visits + 1,
    totalStars: record.totalStars + starsEarned,
    lastVisitDay: gameState.day,
    badge: calculateBadge(record.totalStars + starsEarned),
  };

  loyalty[loyaltyId] = updated;
  updateGameState({ customerLoyalty: loyalty });

  return updated;
}

/**
 * Calculate badge based on total accumulated stars.
 * 10 stars = bronze, 25 stars = silver, 50 stars = gold
 */
function calculateBadge(totalStars: number): LoyaltyBadge {
  if (totalStars >= 50) return 'gold';
  if (totalStars >= 25) return 'silver';
  if (totalStars >= 10) return 'bronze';
  return 'none';
}

/**
 * Get returning customers for today.
 * Customers who visited recently are more likely to return.
 * Returns array of loyaltyIds that should appear today.
 */
export function getReturningCustomers(maxCount: number): string[] {
  const loyalty = gameState.customerLoyalty || {};
  const candidates = Object.entries(loyalty)
    .filter(([_, r]) => {
      // Higher badge = more likely to return
      const daysSince = gameState.day - r.lastVisitDay;
      if (daysSince <= 0) return false; // already visited today
      if (r.badge === 'gold') return daysSince <= 7;
      if (r.badge === 'silver') return daysSince <= 5;
      if (r.badge === 'bronze') return daysSince <= 3;
      return daysSince <= 2 && Math.random() < 0.3; // new customers rarely return
    })
    .map(([id]) => id);

  // Shuffle and take maxCount
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  return candidates.slice(0, maxCount);
}

/**
 * Get badge display info
 */
export function getBadgeInfo(badge: LoyaltyBadge): { emoji: string; name: string; tipMult: number } {
  const map: Record<LoyaltyBadge, { emoji: string; name: string; tipMult: number }> = {
    'none': { emoji: '', name: '', tipMult: 1.0 },
    'bronze': { emoji: '', name: '銅牌常客', tipMult: 1.3 },
    'silver': { emoji: '', name: '銀牌常客', tipMult: 1.6 },
    'gold': { emoji: '', name: '金牌常客', tipMult: 2.0 },
  };
  return map[badge];
}

/**
 * Get patience multiplier based on badge (loyal customers are more patient)
 */
export function getLoyaltyPatienceMult(badge: LoyaltyBadge): number {
  const map: Record<LoyaltyBadge, number> = {
    'none': 1.0,
    'bronze': 1.15,
    'silver': 1.3,
    'gold': 1.5,
  };
  return map[badge];
}

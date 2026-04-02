// OrderEngine — pure logic, no Phaser dependency
// Handles order scoring and tip calculation

import type { OrderScore, CustomerOrder, LoyaltyBadge, WarmingSausage } from '../types';

/**
 * Score a completed order based on grill quality, warming state, condiment accuracy, and wait time.
 */
export function scoreOrder(
  warmingSausage: WarmingSausage,
  customerOrder: CustomerOrder,
  appliedCondiments: string[],
  remainingPatienceRatio: number,  // 0-1, how much patience is left
  loyaltyBadge: LoyaltyBadge,
  basePrice: number,
): OrderScore {
  // 1. Grill Score (0-100): based on grillQuality string
  const grillScoreMap: Record<string, number> = {
    'perfect': 100,
    'ok': 70,
    'slightly-burnt': 50,
    'half-cooked': 40,
    'burnt': 20,
    'raw': 10,
    'carbonized': 0,
  };
  const grillScore = grillScoreMap[warmingSausage.grillQuality] ?? 50;

  // 2. Warming Score (0-100): based on warmingState
  const warmingScoreMap: Record<string, number> = {
    'perfect-warm': 100,
    'ok-warm': 70,
    'cold': 30,
  };
  const warmingScore = warmingScoreMap[warmingSausage.warmingState] ?? 50;

  // 3. Condiment Score (0-100): based on accuracy
  const condimentScore = calculateCondimentScore(customerOrder.condiments, appliedCondiments);

  // 4. Wait Score (0-100): based on remaining patience
  const waitScore = Math.round(remainingPatienceRatio * 100);

  // 5. Total Score: weighted average
  // Grill 30%, Condiment 30%, Warming 20%, Wait 20%
  const totalScore = Math.round(
    grillScore * 0.3 + condimentScore * 0.3 + warmingScore * 0.2 + waitScore * 0.2
  );

  // 6. Stars (1-5)
  const stars = totalToStars(totalScore);

  // 7. Tip calculation
  const tipAmount = calculateTip(totalScore, loyaltyBadge, basePrice);

  return { grillScore, warmingScore, condimentScore, waitScore, totalScore, stars, tipAmount };
}

/**
 * Calculate condiment accuracy score.
 * Perfect match (same items in same order) = 100
 * Same items wrong order = 70
 * Missing or extra condiments reduce score
 */
function calculateCondimentScore(wanted: string[], applied: string[]): number {
  if (wanted.length === 0 && applied.length === 0) return 100;
  if (wanted.length === 0 && applied.length > 0) return 60; // added unwanted stuff
  if (wanted.length > 0 && applied.length === 0) return 10; // forgot condiments entirely

  // Check how many wanted condiments are present
  let matchCount = 0;
  let orderBonus = 0;

  for (let i = 0; i < wanted.length; i++) {
    const idx = applied.indexOf(wanted[i]);
    if (idx !== -1) {
      matchCount++;
      if (idx === i) orderBonus++; // correct position
    }
  }

  // Extra condiments penalty
  const extraCount = applied.filter(a => !wanted.includes(a)).length;

  const matchRatio = matchCount / wanted.length; // 0-1
  const orderRatio = wanted.length > 0 ? orderBonus / wanted.length : 1; // 0-1
  const extraPenalty = extraCount * 15; // -15 per extra

  // Score: 60% from having right condiments, 30% from correct order, 10% base
  const score = Math.round(matchRatio * 60 + orderRatio * 30 + 10 - extraPenalty);
  return Math.max(0, Math.min(100, score));
}

/**
 * Convert total score (0-100) to stars (1-5)
 */
function totalToStars(score: number): number {
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 55) return 3;
  if (score >= 35) return 2;
  return 1;
}

/**
 * Calculate tip amount based on score, loyalty badge, and base price.
 * Tips are now a significant income source.
 */
function calculateTip(totalScore: number, badge: LoyaltyBadge, basePrice: number): number {
  // Base tip multiplier: 0 at score 30, scales to 1.0 at score 100
  const baseMult = Math.max(0, (totalScore - 30) / 70);

  // Badge multiplier
  const badgeMult: Record<LoyaltyBadge, number> = {
    'none': 1.0,
    'bronze': 1.3,
    'silver': 1.6,
    'gold': 2.0,
  };

  // Tip = basePrice × baseMult × badgeMult, rounded
  const tip = Math.round(basePrice * baseMult * badgeMult[badge]);
  return tip;
}

/**
 * Generate a star display string: ★★★☆☆
 */
export function starsToString(stars: number): string {
  return '★'.repeat(stars) + '☆'.repeat(5 - stars);
}

/**
 * Get score color for display (hex number for Phaser)
 */
export function getScoreColor(totalScore: number): number {
  if (totalScore >= 90) return 0xffcc00; // gold
  if (totalScore >= 75) return 0x44ff44; // green
  if (totalScore >= 55) return 0x44aaff; // blue
  if (totalScore >= 35) return 0xff8844; // orange
  return 0xff4444; // red
}

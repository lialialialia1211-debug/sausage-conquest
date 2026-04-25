// OrderEngine — pure logic, no Phaser dependency
// Handles order scoring and tip calculation

import type { OrderScore, CustomerOrder, LoyaltyBadge, WarmingSausage } from '../types';

/**
 * Score a completed order based on grill quality, warming state, condiment accuracy, and wait time.
 */
export function scoreOrder(
  warmingSausage: WarmingSausage,
  customerOrder: CustomerOrder,
  appliedGarlic: boolean,
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
  let grillScore = grillScoreMap[warmingSausage.grillQuality] ?? 50;

  // Wave 4b: 雙面熟度差 > 35 → grillScore 降一級
  if (warmingSausage.unevenPenalty) {
    const grillOrder = ['carbonized', 'raw', 'burnt', 'half-cooked', 'slightly-burnt', 'ok', 'perfect'];
    const currentIdx = grillOrder.indexOf(warmingSausage.grillQuality);
    if (currentIdx > 0) {
      const demotedQuality = grillOrder[currentIdx - 1];
      grillScore = grillScoreMap[demotedQuality] ?? grillScore;
    }
  }

  // 2. Warming Score (0-100): based on warmingState
  const warmingScoreMap: Record<string, number> = {
    'perfect-warm': 100,
    'ok-warm': 70,
    'cold': 30,
  };
  const warmingScore = warmingScoreMap[warmingSausage.warmingState] ?? 50;

  // 3. Condiment Score (0-100): garlic match = 100, mismatch = 0
  const condimentScore = calculateCondimentScore(customerOrder.wantGarlic, appliedGarlic);

  // 4. Wait Score (0-100): based on remaining patience
  const waitScore = Math.round(remainingPatienceRatio * 100);

  // 5. Total Score: weighted average
  // Grill 30%, Condiment 30%, Warming 20%, Wait 20%
  let totalScore = Math.round(
    grillScore * 0.3 + condimentScore * 0.3 + warmingScore * 0.2 + waitScore * 0.2
  );

  // Wave 4b: 刷過油 → 最終分數 ×1.15（四捨五入），上限 100
  if (warmingSausage.oilBrushed) {
    totalScore = Math.min(100, Math.round(totalScore * 1.15));
  }

  // 6. Stars (1-5)
  const stars = totalToStars(totalScore);

  // 7. Tip calculation
  const tipAmount = calculateTip(totalScore, loyaltyBadge, basePrice);

  return { grillScore, warmingScore, condimentScore, waitScore, totalScore, stars, tipAmount };
}

/**
 * Calculate condiment accuracy score (garlic only).
 * Exact boolean match = 100, mismatch = 0.
 */
function calculateCondimentScore(wantGarlic: boolean, appliedGarlic: boolean): number {
  return wantGarlic === appliedGarlic ? 100 : 0;
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

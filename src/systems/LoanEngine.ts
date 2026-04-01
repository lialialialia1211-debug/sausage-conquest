// LoanEngine — pure logic, no Phaser dependency, no UI code
import { gameState, addMoney, spendMoney, changeReputation, updateGameState } from '../state/GameState';
import { LOAN_CONFIGS } from '../data/loans';
import type { ActiveLoan, LoanDailyResult } from '../types';

/**
 * Check whether the player can take a loan from the given lender.
 */
export function canBorrow(lender: 'bank' | 'shark'): { canBorrow: boolean; reason?: string } {
  const config = LOAN_CONFIGS[lender];

  // Cannot hold two loans simultaneously
  if (gameState.loans.active !== null) {
    return { canBorrow: false, reason: '你還有未還清的借款，先處理舊債再說' };
  }

  if (lender === 'bank') {
    if (gameState.loans.bankBlacklisted) {
      return { canBorrow: false, reason: '你已被銀行列入黑名單，永久拒絕往來' };
    }
    if (gameState.reputation < config.requiresReputation) {
      return {
        canBorrow: false,
        reason: `信譽不足（需 ${config.requiresReputation}，現在 ${gameState.reputation}）`,
      };
    }
  }

  return { canBorrow: true };
}

/**
 * Issue a loan. Deducts upfront fee (shark only), records loan in gameState.
 * Returns false if ineligible or amount exceeds maximum.
 */
export function takeLoan(lender: 'bank' | 'shark', amount: number): boolean {
  const eligibility = canBorrow(lender);
  if (!eligibility.canBorrow) return false;

  const config = LOAN_CONFIGS[lender];
  if (amount <= 0 || amount > config.maxAmount) return false;

  // Calculate what player actually receives after upfront fee (shark: 九出十三歸)
  const received = Math.floor(amount * (1 - config.upfrontFeeRate));
  // totalOwed: bank accrues interest daily; shark is flat multiplier at time of repayment
  const totalOwed = lender === 'shark'
    ? Math.ceil(amount * config.repayMultiplier)
    : amount; // bank interest accrued daily via processDaily

  addMoney(received);

  const loan: ActiveLoan = {
    lender,
    principal: amount,
    totalOwed,
    dayTaken: gameState.day,
    dueDay: gameState.day + config.termDays,
    overdueDays: 0,
  };

  updateGameState({
    loans: {
      ...gameState.loans,
      active: loan,
    },
  });

  return true;
}

/**
 * Process daily loan effects: accrue bank interest or check overdue status.
 * Should be called once per day at end-of-day.
 */
export function processDaily(): LoanDailyResult {
  const { active } = gameState.loans;

  if (!active) {
    return { interestAccrued: 0, isOverdue: false, overdueDays: 0 };
  }

  const config = LOAN_CONFIGS[active.lender];
  const isOverdue = gameState.day > active.dueDay;
  let interestAccrued = 0;
  let penalty: string | undefined;
  let gameOver = false;

  if (active.lender === 'bank') {
    // Accrue daily interest on outstanding balance
    interestAccrued = Math.ceil(active.totalOwed * config.dailyRate);
    const updatedLoan: ActiveLoan = {
      ...active,
      totalOwed: active.totalOwed + interestAccrued,
      overdueDays: isOverdue ? active.overdueDays + 1 : active.overdueDays,
    };

    if (isOverdue) {
      const overdueDays = updatedLoan.overdueDays;
      changeReputation(-5);
      penalty = `銀行逾期第 ${overdueDays} 天：信譽 -5`;

      if (overdueDays >= 5) {
        updateGameState({
          loans: { active: updatedLoan, bankBlacklisted: true },
        });
        penalty = '銀行已將你列入永久黑名單';
      } else {
        updateGameState({ loans: { ...gameState.loans, active: updatedLoan } });
      }
    } else {
      updateGameState({ loans: { ...gameState.loans, active: updatedLoan } });
    }

    return { interestAccrued, isOverdue, overdueDays: updatedLoan.overdueDays, penalty };
  }

  // Loan shark overdue logic
  if (isOverdue) {
    const newOverdueDays = active.overdueDays + 1;
    const updatedLoan: ActiveLoan = { ...active, overdueDays: newOverdueDays };

    if (newOverdueDays <= 3) {
      // Day 1-3: +5% compound interest daily + threatening calls
      const extraInterest = Math.ceil(active.totalOwed * 0.05);
      updatedLoan.totalOwed = active.totalOwed + extraInterest;
      interestAccrued = extraInterest;
      penalty = `地下錢莊電話催款（逾期第 ${newOverdueDays} 天）：利息 +5%，欠款 $${updatedLoan.totalOwed}`;
    } else if (newOverdueDays <= 7) {
      // Day 4-7: stall destroyed (1-day shutdown), goons visit
      penalty = `打手上門！攤位被砸，停業一天（逾期第 ${newOverdueDays} 天）`;
    } else if (newOverdueDays <= 14) {
      // Day 8-14: lose 1 territory + 50% inventory stolen
      const newInventory: Record<string, number> = {};
      for (const [id, qty] of Object.entries(gameState.inventory)) {
        newInventory[id] = Math.floor(qty * 0.5);
      }
      updateGameState({ inventory: newInventory });
      penalty = `流氓搶走一半庫存、奪走一塊地盤（逾期第 ${newOverdueDays} 天）`;
    } else {
      // Day 15+: GAME OVER
      gameOver = true;
      penalty = '你消失在夜市裡，有人說你去當漁工了...';
    }

    updateGameState({ loans: { ...gameState.loans, active: updatedLoan } });

    return { interestAccrued, isOverdue: true, overdueDays: newOverdueDays, penalty, gameOver };
  }

  return { interestAccrued: 0, isOverdue: false, overdueDays: 0 };
}

/**
 * Repay the active loan in full.
 * Returns false if no active loan or insufficient funds.
 */
export function repayLoan(): boolean {
  const { active } = gameState.loans;
  if (!active) return false;

  const success = spendMoney(active.totalOwed);
  if (!success) return false;

  updateGameState({
    loans: {
      ...gameState.loans,
      active: null,
    },
  });

  return true;
}

/**
 * Return a human-readable description of the penalty for overdue days (shark loan).
 */
export function getOverduePenalty(overdueDays: number): string {
  if (overdueDays <= 0) return '準時還款，地下錢莊老闆對你微笑點頭';
  if (overdueDays <= 3) return `逾期 ${overdueDays} 天：每天加 5% 利息，電話不斷`;
  if (overdueDays <= 7) return `逾期 ${overdueDays} 天：打手登門，攤位被砸，停業一天`;
  if (overdueDays <= 14) return `逾期 ${overdueDays} 天：搶走一半庫存，奪走一塊地盤`;
  return '逾期 15 天以上：你消失在夜市裡，有人說你去當漁工了...';
}

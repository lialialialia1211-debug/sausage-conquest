import type { PlayerLoan } from '../types';
import { gameState, updateGameState, spendMoney, addMoney, changeReputation, changeUndergroundRep, addChaos } from '../state/GameState';

// Re-export for convenience of UI layer
export type { PlayerLoan };

// NPC borrowers who might come asking for money
const POTENTIAL_BORROWERS = [
  { name: '賣臭豆腐的老張', emoji: '🫕', reliability: 0.8, maxAmount: 500 },
  { name: '炸雞排小妹', emoji: '🍗', reliability: 0.6, maxAmount: 800 },
  { name: '彈珠台阿伯', emoji: '🎯', reliability: 0.4, maxAmount: 1000 },
  { name: '套圈圈大叔', emoji: '⭕', reliability: 0.5, maxAmount: 600 },
  { name: '賣珍奶的小陳', emoji: '🧋', reliability: 0.75, maxAmount: 400 },
] as const;

export function isLoanSharkUnlocked(): boolean {
  return gameState.undergroundRep >= 60;
}

/**
 * Get a random borrower who wants to borrow money.
 * Called each day to see if someone comes asking.
 * Returns null if feature is locked or no one shows up today (60% chance).
 */
export function getRandomBorrower(): { name: string; emoji: string; reliability: number; requestAmount: number } | null {
  if (!isLoanSharkUnlocked()) return null;
  // 40% chance someone comes asking each day
  if (Math.random() > 0.4) return null;

  const b = POTENTIAL_BORROWERS[Math.floor(Math.random() * POTENTIAL_BORROWERS.length)];
  const requestAmount = Math.round(b.maxAmount * (0.5 + Math.random() * 0.5));
  return { name: b.name, emoji: b.emoji, reliability: b.reliability, requestAmount };
}

/**
 * Lend money to an NPC. Player sets the interest rate.
 * Returns the created PlayerLoan or null if player lacks funds.
 */
export function lendMoney(
  borrowerName: string,
  borrowerEmoji: string,
  principal: number,
  interestRate: number,
  reliability: number,
): PlayerLoan | null {
  if (!spendMoney(principal)) return null;

  const loan: PlayerLoan = {
    id: `ploan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    borrowerName,
    borrowerEmoji,
    principal,
    interestRate,
    totalOwed: Math.round(principal * (1 + interestRate)),
    dayLent: gameState.day,
    dueDay: gameState.day + 5,
    status: 'active',
    reliability,
  };

  const loans = [...(gameState.playerLoans ?? []), loan];
  updateGameState({ playerLoans: loans });
  changeUndergroundRep(3);
  addChaos(2, `放高利貸 $${principal} 給${borrowerName}`);

  return loan;
}

/**
 * Process all active player loans daily. Called during morning.
 * Returns messages describing what happened to each due loan.
 */
export function processPlayerLoans(): string[] {
  const loans = [...(gameState.playerLoans ?? [])];
  const messages: string[] = [];

  for (const loan of loans) {
    if (loan.status !== 'active') continue;

    if (gameState.day >= loan.dueDay) {
      const willPay = Math.random() < loan.reliability;

      if (willPay) {
        addMoney(loan.totalOwed);
        loan.status = 'repaid';
        messages.push(
          `${loan.borrowerEmoji} ${loan.borrowerName} 還錢了！收到 $${loan.totalOwed}（本金 $${loan.principal} + 利息 $${loan.totalOwed - loan.principal}）`,
        );
      } else {
        loan.status = 'defaulted';
        messages.push(
          `${loan.borrowerEmoji} ${loan.borrowerName} 賴帳了！欠你 $${loan.totalOwed} 不還！`,
        );
      }
    }
  }

  updateGameState({ playerLoans: loans });
  return messages;
}

/**
 * Seize a defaulted borrower's stall ("收攤位").
 * Gains underground rep, loses public reputation, adds chaos.
 */
export function seizeBorrowerStall(loanId: string): string {
  const loans = [...(gameState.playerLoans ?? [])];
  const loan = loans.find(l => l.id === loanId);
  if (!loan || loan.status !== 'defaulted') return '找不到這筆賴帳紀錄';

  loan.status = 'seized';
  updateGameState({ playerLoans: loans });

  changeReputation(-5);
  changeUndergroundRep(10);
  addChaos(4, `收走${loan.borrowerName}的攤位`);

  return `你帶著旺財去收走了${loan.borrowerEmoji}${loan.borrowerName}的攤位。\n他哭著離開了夜市...\n聲望 -5 | 地下聲望 +10`;
}

/**
 * Forgive a defaulted loan (write it off).
 * Gains public reputation as a generous person.
 */
export function forgiveLoan(loanId: string): string {
  const loans = [...(gameState.playerLoans ?? [])];
  const loan = loans.find(l => l.id === loanId);
  if (!loan || loan.status !== 'defaulted') return '找不到這筆紀錄';

  loan.status = 'repaid'; // mark as resolved
  updateGameState({ playerLoans: loans });

  changeReputation(3);

  return `你大方地免除了${loan.borrowerEmoji}${loan.borrowerName}的債務。\n他感激涕零：「大哥，我這條命是你的！」\n聲望 +3`;
}

/**
 * Send the dog (旺財) to collect debt.
 * 60% chance the borrower pays up, 40% chance they flee.
 */
export function sendDogToCollect(loanId: string): string {
  const loans = [...(gameState.playerLoans ?? [])];
  const loan = loans.find(l => l.id === loanId);
  if (!loan || loan.status !== 'defaulted') return '找不到這筆紀錄';

  const success = Math.random() < 0.6;

  if (success) {
    addMoney(loan.totalOwed);
    loan.status = 'repaid';
    changeUndergroundRep(5);
    addChaos(2, '派旺財討債成功');
    updateGameState({ playerLoans: loans });
    return `🐕 旺財衝進${loan.borrowerEmoji}${loan.borrowerName}的攤位狂吠！\n對方嚇到當場掏出 $${loan.totalOwed} 還你。\n地下聲望 +5`;
  } else {
    loan.status = 'repaid'; // resolved but no money recovered
    changeUndergroundRep(3);
    addChaos(3, '派旺財討債但人跑了');
    updateGameState({ playerLoans: loans });
    return `🐕 旺財追了三條街...但${loan.borrowerEmoji}${loan.borrowerName}翻牆跑了。\n這筆債只能當學費了。\n地下聲望 +3`;
  }
}

/**
 * Get all loans that still need player attention (active or defaulted).
 */
export function getPlayerLoansSummary(): PlayerLoan[] {
  return (gameState.playerLoans ?? []).filter(l => l.status === 'active' || l.status === 'defaulted');
}

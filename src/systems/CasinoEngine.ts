// CasinoEngine — underground casino game logic, no Phaser dependency, no UI code
import { gameState, spendMoney, addMoney, changeReputation, changeUndergroundRep, addChaos } from '../state/GameState';

export type CasinoGame = 'dice' | 'traffic-guess' | 'all-in';

export interface CasinoBet {
  game: CasinoGame;
  amount: number;
  choice?: 'big' | 'small' | 'high' | 'low'; // for dice/traffic
}

export interface CasinoResult {
  won: boolean;
  payout: number;      // amount won (0 if lost)
  resultText: string;
  effectText: string;  // side effects description
}

// Track consecutive wins/losses for streak events
let consecutiveWins = 0;
let consecutiveLosses = 0;

export function resetCasinoEngine(): void {
  consecutiveWins = 0;
  consecutiveLosses = 0;
}

/**
 * Place a bet at the underground casino.
 * Deducts the bet amount from player money, resolves the game,
 * pays out winnings, and applies streak side effects.
 */
export function placeBet(bet: CasinoBet): CasinoResult {
  if (!spendMoney(bet.amount)) {
    return { won: false, payout: 0, resultText: '錢不夠下注！', effectText: '' };
  }

  addChaos(1, `賭場下注 $${bet.amount}`);
  changeUndergroundRep(1);

  let result: CasinoResult;

  switch (bet.game) {
    case 'dice':
      result = playDice(bet);
      break;
    case 'traffic-guess':
      result = playTrafficGuess(bet);
      break;
    case 'all-in':
      result = playAllIn(bet);
      break;
    default:
      result = { won: false, payout: 0, resultText: '未知賭局', effectText: '' };
  }

  // Track streaks
  if (result.won) {
    consecutiveWins++;
    consecutiveLosses = 0;
  } else {
    consecutiveLosses++;
    consecutiveWins = 0;
  }

  // Streak events
  if (consecutiveWins >= 3) {
    changeReputation(2);
    changeUndergroundRep(5);
    result.effectText += '\n連贏三局！「賭神」稱號傳遍夜市！聲望+2 地下聲望+5';
    consecutiveWins = 0;
  }
  if (consecutiveLosses >= 3) {
    changeReputation(-3);
    addChaos(3, '連輸三局被砸攤');
    result.effectText += '\n連輸三局！追債的人砸了你的攤位！聲望-3 混沌+3';
    consecutiveLosses = 0;
  }

  return result;
}

/**
 * 骰子大小 — 2x payout.
 * Roll 2 dice. Big = 7–12, Small = 2–6.
 */
function playDice(bet: CasinoBet): CasinoResult {
  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;
  const total = die1 + die2;
  const isBig = total >= 7;
  const playerChose = bet.choice ?? 'big';
  const won = (playerChose === 'big' && isBig) || (playerChose === 'small' && !isBig);

  const payout = won ? bet.amount * 2 : 0;
  if (won) addMoney(payout);

  return {
    won,
    payout,
    resultText: `骰子：${die1} + ${die2} = ${total}（${isBig ? '大' : '小'}）\n你押${playerChose === 'big' ? '大' : '小'}，${won ? '贏了！' : '輸了...'}`,
    effectText: won ? `獲得 $${payout}` : `失去 $${bet.amount}`,
  };
}

/**
 * 猜客流 — 3x payout.
 * Guess if tomorrow's customer count will be high (>30) or low (<=30).
 * Slightly favors the "low" outcome (55% chance).
 */
function playTrafficGuess(bet: CasinoBet): CasinoResult {
  const actualHigh = Math.random() < 0.30; // 30% win chance for 3x payout (~-10% EV house edge)
  const playerChose = bet.choice ?? 'high';
  const won = (playerChose === 'high' && actualHigh) || (playerChose === 'low' && !actualHigh);

  const payout = won ? bet.amount * 3 : 0;
  if (won) addMoney(payout);

  return {
    won,
    payout,
    resultText: `明日客流預測：${actualHigh ? '旺日！客人爆滿' : '冷清...門可羅雀'}\n你猜${playerChose === 'high' ? '旺' : '冷'}，${won ? '猜對了！' : '猜錯了...'}`,
    effectText: won ? `獲得 $${payout}（3倍）` : `失去 $${bet.amount}`,
  };
}

/**
 * 全押梭哈 — 5x or nothing.
 * 20% chance to win 5x, 80% lose everything.
 */
function playAllIn(bet: CasinoBet): CasinoResult {
  const won = Math.random() < 0.2;
  const payout = won ? bet.amount * 5 : 0;
  if (won) addMoney(payout);

  const resultText = won
    ? '全押梭哈：翻開底牌... 四條A！！！你贏了！'
    : '全押梭哈：翻開底牌... 一堆雜牌。莊家笑了。';

  return {
    won,
    payout,
    resultText,
    effectText: won
      ? `獲得 $${payout}（5倍！）老天有眼！`
      : `失去 $${bet.amount}... 早知道就去買香腸了`,
  };
}

/**
 * Check if the casino is available (unlocks after Day 3).
 */
export function isCasinoAvailable(): boolean {
  return gameState.day >= 3;
}

/**
 * Get min/max bet limits based on current player money.
 */
export function getBetLimits(): { min: number; max: number } {
  return {
    min: 50,
    max: Math.min(gameState.money, 2000),
  };
}

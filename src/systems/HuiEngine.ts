import type { HuiMember } from '../types';
import { gameState, updateGameState, spendMoney, addMoney, changeReputation, changeUndergroundRep, addChaos } from '../state/GameState';

const NPC_MEMBERS: Omit<HuiMember, 'hasCollected' | 'isPlayer'>[] = [
  { id: 'hui-auntie', name: '賣滷味的阿姨', emoji: '', reliability: 0.95 },
  { id: 'hui-uncle', name: '烤玉米阿伯', emoji: '', reliability: 0.85 },
  { id: 'hui-young', name: '賣雞排的小哥', emoji: '', reliability: 0.7 },
  { id: 'hui-granny', name: '賣藥燉排骨的阿嬤', emoji: '', reliability: 0.98 },
];

/**
 * Join a new hui (rotating credit association)
 */
export function joinHui(): boolean {
  if (gameState.hui.isActive) return false; // already in one

  const members: HuiMember[] = [
    { id: 'player', name: '你', emoji: '', reliability: 1, hasCollected: false, isPlayer: true },
    ...NPC_MEMBERS.map(m => ({ ...m, hasCollected: false, isPlayer: false })),
  ];

  updateGameState({
    hui: {
      isActive: true,
      day: 0,
      cycle: 1,
      members,
      pot: 0,
      dailyFee: 100,
      playerHasCollected: false,
      playerBidAmount: 0,
      runaway: false,
      totalPaidIn: 0,
      totalCollected: 0,
    },
  });
  return true;
}

/**
 * Process daily hui payment. Called during advanceDay or morning.
 * Returns a message about what happened.
 */
export function processHuiDaily(): { message: string; needsBidding: boolean } | null {
  if (!gameState.hui.isActive || gameState.hui.runaway) return null;

  const hui = { ...gameState.hui };
  hui.day++;

  // Player pays daily fee
  if (!spendMoney(hui.dailyFee)) {
    // Can't afford — forced to leave the hui, lose all paid-in money
    return {
      message: `繳不出會費 $${hui.dailyFee}！你被踢出互助會，已繳的 $${hui.totalPaidIn} 全部泡湯了。`,
      needsBidding: false,
    };
  }
  hui.totalPaidIn += hui.dailyFee;

  // NPCs pay (some might skip based on reliability)
  let npcPaid = 0;
  let npcDefaulted = '';
  for (const member of hui.members) {
    if (member.isPlayer || member.hasCollected) continue;
    if (Math.random() < member.reliability) {
      npcPaid += hui.dailyFee;
    } else {
      npcDefaulted += `${member.emoji}${member.name} 今天沒繳會費！`;
    }
  }

  // Player + paying NPCs contribute
  hui.pot += hui.dailyFee + npcPaid; // player's fee + npc fees

  // Every 5 days = bidding day (but not on day 0)
  const needsBidding = hui.day > 0 && hui.day % 5 === 0;

  let message = `互助會第 ${hui.day} 天：繳了 $${hui.dailyFee}，會金累積 $${hui.pot}`;
  if (npcDefaulted) message += `\n${npcDefaulted}`;
  if (needsBidding) message += '\n今天是開標日！';

  updateGameState({ hui });
  return { message, needsBidding };
}

/**
 * Get NPC bid amounts for the current auction.
 * NPCs who haven't collected yet will bid.
 */
export function getNpcBids(): Array<{ member: HuiMember; bid: number }> {
  const hui = gameState.hui;
  const eligible = hui.members.filter(m => !m.isPlayer && !m.hasCollected);

  return eligible.map(m => {
    // NPCs bid 5-20% of the pot as interest
    const interestRate = 0.05 + Math.random() * 0.15;
    const bid = Math.round(hui.pot * interestRate);
    return { member: m, bid };
  }).sort((a, b) => b.bid - a.bid);
}

/**
 * Player places a bid. Returns result.
 */
export function playerBid(bidAmount: number): {
  won: boolean;
  message: string;
  payout: number;
} {
  const hui = { ...gameState.hui };
  const npcBids = getNpcBids();
  const highestNpc = npcBids.length > 0 ? npcBids[0] : null;

  if (hui.playerHasCollected) {
    return { won: false, message: '你已經標過了，這輪不能再標。', payout: 0 };
  }

  const won = !highestNpc || bidAmount >= highestNpc.bid;

  if (won) {
    // Player wins: gets pot minus their bid (bid = interest paid to others)
    const payout = hui.pot - bidAmount;
    addMoney(payout);
    hui.playerHasCollected = true;
    hui.totalCollected += payout;
    hui.pot = 0;
    hui.day = 0; // reset day counter for next cycle
    hui.cycle++;

    // Mark player as collected
    const playerMember = hui.members.find(m => m.isPlayer);
    if (playerMember) playerMember.hasCollected = true;

    updateGameState({ hui });
    return {
      won: true,
      message: `你以 $${bidAmount} 利息得標！\n拿到會金 $${payout}（扣除利息 $${bidAmount}）`,
      payout,
    };
  } else {
    // NPC wins
    const winner = highestNpc!.member;
    winner.hasCollected = true;
    hui.pot = 0;
    hui.day = 0;
    hui.cycle++;

    updateGameState({ hui });
    return {
      won: false,
      message: `${winner.emoji}${winner.name} 以 $${highestNpc!.bid} 利息搶標成功！\n你的會金繼續累積到下一輪。`,
      payout: 0,
    };
  }
}

/**
 * Player skips bidding this round.
 */
export function skipBid(): string {
  const npcBids = getNpcBids();
  const hui = { ...gameState.hui };

  if (npcBids.length > 0) {
    const winner = npcBids[0];
    winner.member.hasCollected = true;
    hui.pot = 0;
    hui.day = 0;
    hui.cycle++;
    updateGameState({ hui });
    return `${winner.member.emoji}${winner.member.name} 得標，拿走了會金。你等下一輪再標。`;
  }

  return '沒有人出價，會金保留到下一輪。';
}

/**
 * Player runs away with whatever they've collected + current pot.
 * Severe consequences.
 */
export function runAwayFromHui(): string {
  const hui = { ...gameState.hui };
  const stolenAmount = hui.pot;

  addMoney(stolenAmount);
  changeReputation(-20);
  changeUndergroundRep(15);
  addChaos(8, '跑會仔！捲款潛逃');

  hui.isActive = false;
  hui.runaway = true;
  hui.pot = 0;

  updateGameState({ hui });

  return `你捲走了會金 $${stolenAmount} 跑路了！\n全夜市的攤販都在找你...\n聲望 -20 | 地下聲望 +15 | 混沌 +8`;
}

/**
 * Check if the hui has ended (all members collected)
 */
export function isHuiComplete(): boolean {
  const hui = gameState.hui;
  if (!hui.isActive) return false;
  return hui.members.every(m => m.hasCollected);
}

/**
 * Leave hui normally after completion
 */
export function leaveHui(): void {
  updateGameState({
    hui: { ...gameState.hui, isActive: false },
  });
}

/**
 * Get hui status summary
 */
export function getHuiSummary(): string {
  const hui = gameState.hui;
  if (!hui.isActive) return '尚未加入互助會';

  const collected = hui.members.filter(m => m.hasCollected).length;
  return `互助會：第 ${hui.cycle} 輪 Day ${hui.day}/5 | 會金 $${hui.pot} | 已標 ${collected}/5`;
}

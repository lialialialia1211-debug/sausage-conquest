import { GAME_EVENTS, type GameEvent, type EventChoice } from '../data/events';
import { gameState, addMoney, spendMoney, changeReputation, updateGameState, changeUndergroundRep, addChaos } from '../state/GameState';

let recentEventIds: string[] = []; // track last 3 events to avoid repeats

export function rollDailyEvents(): GameEvent[] {
  // Exclude special scheduled events from the normal random pool
  const SCHEDULED_EVENT_IDS = ['management-fee-weekly', 'media-crisis-exposed'];

  const eligible = GAME_EVENTS.filter(e =>
    e.minDay <= gameState.day &&
    !recentEventIds.includes(e.id) &&
    !SCHEDULED_EVENT_IDS.includes(e.id)
  );

  const maxEvents = gameState.day <= 3 ? 1 : 2;
  // Increased event frequency: 15% chance of no events (was 30%)
  const count = eligible.length === 0
    ? 0
    : Math.random() < 0.15 ? 0 : Math.min(maxEvents, Math.floor(Math.random() * 2) + 1);

  // Shuffle and pick, then deduplicate by event ID
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  let picked = shuffled.slice(0, count);
  picked = picked.filter((e, i, arr) => arr.findIndex(x => x.id === e.id) === i);

  // Update recent tracking
  picked.forEach(e => {
    recentEventIds.push(e.id);
    if (recentEventIds.length > 3) recentEventIds.shift();
  });

  // Inject management-fee-weekly every 7 days
  if (gameState.day % 7 === 0 && gameState.day > 0) {
    const feeEvent = GAME_EVENTS.find(e => e.id === 'management-fee-weekly');
    if (feeEvent) picked.unshift(feeEvent);
  }

  // Inject media-crisis-exposed when both reps are high and crisis not yet triggered
  if (
    gameState.reputation > 70 &&
    gameState.undergroundRep > 70 &&
    (gameState.reputationCrisisDay ?? -1) < 0
  ) {
    const crisisEvent = GAME_EVENTS.find(e => e.id === 'media-crisis-exposed');
    if (crisisEvent) picked.push(crisisEvent);
  }

  // Final deduplication: remove any event that appears more than once (by ID)
  // This covers cases where a scheduled injection duplicates a randomly selected event
  const deduped = picked.filter((e, i, arr) => arr.findIndex(x => x.id === e.id) === i);

  return deduped;
}

export function applyEventChoice(event: GameEvent, choiceIndex: number): EventChoice {
  const choice = event.choices[choiceIndex];

  if (choice.effects.money !== undefined) {
    if (choice.effects.money > 0) {
      addMoney(choice.effects.money);
    } else {
      const paid = spendMoney(Math.abs(choice.effects.money));
      if (!paid) {
        // Can't afford — deduct whatever money remains, then continue with other effects
        if (gameState.money > 0) {
          spendMoney(gameState.money);
        }
      }
    }
  }

  if (choice.effects.reputation !== undefined) changeReputation(choice.effects.reputation);

  if (choice.effects.trafficBonus !== undefined) {
    updateGameState({ dailyTrafficBonus: (gameState.dailyTrafficBonus ?? 0) + choice.effects.trafficBonus });
  }

  if (choice.effects.skipDay === true) {
    updateGameState({ skipDay: true });
  }

  // New effect fields
  if (choice.effects.undergroundRep) {
    changeUndergroundRep(choice.effects.undergroundRep);
  }

  if (choice.effects.chaosPoints) {
    addChaos(choice.effects.chaosPoints, `事件：${event.name}`);
  }

  if (choice.effects.managementFeePaid) {
    const newFee = { ...gameState.managementFee };
    newFee.lastPaidDay = gameState.day;
    newFee.isResisting = false;
    newFee.resistDays = 0;
    updateGameState({ managementFee: newFee });
  }

  if (choice.effects.unlockBlackMarket) {
    updateGameState({ blackMarketUnlocked: true });
  }

  // Media crisis: record the day it first fires
  if (event.id === 'media-crisis-exposed') {
    updateGameState({ reputationCrisisDay: gameState.day });
  }

  // management-fee-weekly choice C (index 2): set isResisting
  if (event.id === 'management-fee-weekly' && choiceIndex === 2) {
    const newFee = { ...gameState.managementFee };
    newFee.isResisting = true;
    newFee.resistDays = (newFee.resistDays || 0) + 1;
    updateGameState({ managementFee: newFee });
  }

  // management-fee-weekly choice D (index 3): rebrand logic
  if (event.id === 'management-fee-weekly' && choiceIndex === 3) {
    const repLost = Math.floor(gameState.reputation * 0.3);
    changeReputation(-repLost);
    const newFee = { ...gameState.managementFee };
    newFee.lastPaidDay = gameState.day;
    newFee.isResisting = false;
    newFee.rebranded = true;
    updateGameState({ managementFee: newFee });
  }

  return choice;
}

export function resetEventTracking(): void {
  recentEventIds = [];
}

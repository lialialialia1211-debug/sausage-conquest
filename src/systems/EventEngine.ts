import { GAME_EVENTS, type GameEvent, type EventChoice } from '../data/events';
import { gameState, addMoney, spendMoney, changeReputation } from '../state/GameState';

let recentEventIds: string[] = []; // track last 3 events to avoid repeats

export function rollDailyEvents(): GameEvent[] {
  const eligible = GAME_EVENTS.filter(e =>
    e.minDay <= gameState.day &&
    !recentEventIds.includes(e.id)
  );

  if (eligible.length === 0) return [];

  const maxEvents = gameState.day <= 3 ? 1 : 2;
  const count = Math.random() < 0.3 ? 0 : Math.min(maxEvents, Math.floor(Math.random() * 3));

  // Shuffle and pick
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, count);

  // Update recent tracking
  picked.forEach(e => {
    recentEventIds.push(e.id);
    if (recentEventIds.length > 3) recentEventIds.shift();
  });

  return picked;
}

export function applyEventChoice(event: GameEvent, choiceIndex: number): EventChoice {
  const choice = event.choices[choiceIndex];
  if (choice.effects.money !== undefined) {
    if (choice.effects.money > 0) addMoney(choice.effects.money);
    else spendMoney(Math.abs(choice.effects.money));
  }
  if (choice.effects.reputation !== undefined) changeReputation(choice.effects.reputation);
  return choice;
}

export function resetEventTracking(): void {
  recentEventIds = [];
}

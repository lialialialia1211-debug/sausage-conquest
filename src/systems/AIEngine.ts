// AIEngine — opponent AI logic: daily processing, team generation, neighbor effects
import { OPPONENTS, OPPONENT_MAP, type Opponent } from '../data/opponents';
import { gameState } from '../state/GameState';

// Check which opponents should be active based on current day
export function getActiveOpponents(): Opponent[] {
  return OPPONENTS.filter(o => o.appearDay <= gameState.day);
}

// Check if a new opponent appears today (returns the opponent or null)
export function checkNewOpponent(): Opponent | null {
  return OPPONENTS.find(o => o.appearDay === gameState.day) ?? null;
}

// Process AI daily: update map ownership, AI expansion
export function processAIDaily(): void {
  const active = getActiveOpponents();
  for (const opp of active) {
    // Ensure their home grid is occupied
    if (!gameState.map[opp.gridSlot] || gameState.map[opp.gridSlot] !== opp.id) {
      // Only occupy if player doesn't own it
      if (gameState.map[opp.gridSlot] !== 'player') {
        gameState.map[opp.gridSlot] = opp.id;
      }
    }
  }
}

// Get AI battle team based on opponent difficulty (simplified for new map system)
export function getAIBattleTeam(opponentId: string): string[] {
  const opp = OPPONENT_MAP[opponentId];
  if (!opp) return ['black-pig', 'black-pig', 'black-pig'];

  const pool = ['black-pig', 'flying-fish-roe', 'garlic-bomb', 'cheese', 'squidink', 'mala'];
  const team: string[] = [];
  for (let i = 0; i < opp.unitCount; i++) {
    team.push(pool[i % Math.min(pool.length, opp.difficulty + 2)]);
  }
  return team;
}

// Calculate neighbor effect on player's traffic based on adjacent opponent pricing strategies
export function calcNeighborEffect(playerGrid: number): number {
  let modifier = 1.0;
  const adjacent = [playerGrid - 1, playerGrid + 1].filter(i => i >= 0 && i < 10);

  for (const idx of adjacent) {
    const owner = gameState.map[idx];
    if (owner && owner !== 'player') {
      const opp = OPPONENT_MAP[owner];
      if (opp) {
        switch (opp.pricingStrategy) {
          case 'cheap':
            modifier -= 0.05;
            break;
          case 'premium':
            modifier -= 0.15;
            break;
          default:
            modifier -= 0.10;
            break;
        }
      }
    }
  }

  return Math.max(0.5, modifier);
}

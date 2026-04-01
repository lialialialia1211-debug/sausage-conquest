import { ACHIEVEMENTS, type Achievement } from '../data/achievements';
import { gameState } from '../state/GameState';

// Track which achievements are unlocked (persists in memory during game session)
const unlockedSet = new Set<string>();

// Check all achievements, return newly unlocked ones
export function checkAchievements(): Achievement[] {
  const newlyUnlocked: Achievement[] = [];

  for (const ach of ACHIEVEMENTS) {
    if (unlockedSet.has(ach.id)) continue;

    try {
      if (ach.condition(gameState)) {
        unlockedSet.add(ach.id);
        newlyUnlocked.push(ach);
      }
    } catch {
      // condition check failed, skip
    }
  }

  return newlyUnlocked;
}

// Get all achievements with their unlock status
export function getAllAchievements(): Array<Achievement & { unlocked: boolean }> {
  return ACHIEVEMENTS.map((a) => ({
    ...a,
    unlocked: unlockedSet.has(a.id),
  }));
}

// Reset achievements (for new game)
export function resetAchievements(): void {
  unlockedSet.clear();
}

// Get count of unlocked achievements
export function getUnlockedCount(): number {
  return unlockedSet.size;
}

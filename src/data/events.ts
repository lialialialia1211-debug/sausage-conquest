export interface EventChoice {
  text: string;
  emoji: string;
  resultText: string;
  effects: {
    money?: number;
    reputation?: number;
    trafficBonus?: number;
    skipDay?: boolean;
    undergroundRep?: number;
    chaosPoints?: number;
    managementFeePaid?: number;
    blacklistBank?: boolean;
    unlockBlackMarket?: boolean;
  };
}

export interface GameEvent {
  id: string;
  name: string;
  emoji: string;
  category: 'customer' | 'gangster' | 'positive' | 'underground' | 'social' | 'chaos';
  description: string;
  choices: EventChoice[];
  minDay: number;
}

// All events have been migrated to GRILL_EVENTS in src/data/grill-events.ts.
// Keeping empty array to avoid breaking existing imports in EventEngine / EventScene.
export const GAME_EVENTS: GameEvent[] = [];

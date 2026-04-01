// Global type definitions

export type GamePhase = 'boot' | 'morning' | 'evening' | 'grill' | 'battle' | 'event' | 'summary' | 'shop';

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  cost: number;
}

export interface MapSlot {
  id: number;
  owner: string;       // 'player' | 'enemy' | 'neutral'
  price: number;
  footTraffic: number; // 1-5
}

export interface DailySummary {
  day: number;
  revenue: number;
  expenses: number;
  profit: number;
  reputationChange: number;
  sausagesSold: number;
}

export interface PanelEvent {
  panel: string;
  data?: Record<string, unknown>;
}

export interface MorningDoneEvent {
  purchases: InventoryItem[];
}

export interface EveningDoneEvent {
  selectedSlot: number;
  price: number;
}

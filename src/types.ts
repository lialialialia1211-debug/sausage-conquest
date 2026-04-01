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

// ── Sausage types ──────────────────────────────────────────────────────────────

export type BattleType = 'normal' | 'ranged' | 'aoe' | 'tank' | 'assassin' | 'support';

export interface SausageBattleStats {
  hp: number;
  atk: number;
  spd: number;
  type: BattleType;
}

export interface SausageType {
  id: string;
  name: string;
  emoji: string;
  cost: number;
  suggestedPrice: number;
  grillDifficulty: number; // 1-3 stars
  description: string;
  battle: SausageBattleStats;
}

// ── Sale & customer types ──────────────────────────────────────────────────────

export interface SaleRecord {
  sausageId: string;
  price: number;
  quality: number;          // 0.5 ~ 1.5
  customerSatisfaction: number; // 0 ~ 1
}

export interface Customer {
  id: string;
  patience: number;         // seconds willing to wait
  preferredType?: BattleType;
  maxPrice: number;
}

// ── Loan types ─────────────────────────────────────────────────────────────────

export interface LoanConfig {
  lender: 'bank' | 'shark';
  label: string;
  dailyRate: number;
  maxAmount: number;
  termDays: number;
  requiresReputation: number;
  upfrontFeeRate: number;
  repayMultiplier: number;
}

export interface ActiveLoan {
  lender: 'bank' | 'shark';
  principal: number;
  totalOwed: number;
  dayTaken: number;
  dueDay: number;
  overdueDays: number;
}

export interface LoanDailyResult {
  interestAccrued: number;
  isOverdue: boolean;
  overdueDays: number;
  penalty?: string;
  gameOver?: boolean;
}

export interface LoanState {
  active: ActiveLoan | null;
  bankBlacklisted: boolean;
}

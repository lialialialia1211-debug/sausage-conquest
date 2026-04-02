// Global type definitions

export type GamePhase = 'boot' | 'morning' | 'evening' | 'grill' | 'battle' | 'event' | 'summary' | 'shop' | 'ending';

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

// ── Warming zone types ─────────────────────────────────────────────────────────

export interface WarmingSausage {
  id: string;
  sausageTypeId: string;
  grillQuality: string;  // quality when removed from grill
  qualityScore: number;  // base quality multiplier from grill
  timeInWarming: number; // seconds since placed in warming zone
  warmingState: 'perfect-warm' | 'ok-warm' | 'cold';
  isOvernight?: boolean; // true if carried over from previous day
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

// ── Worker types ───────────────────────────────────────────────────────────────

// Worker (part-time employee)
export interface Worker {
  id: string;
  name: string;
  emoji: string;
  description: string;
  cost: number;        // one-time hire cost
  dailySalary: number; // daily pay
  buff: string;        // description of benefit
  debuff: string;      // description of downside
}

// ── Grill event types ──────────────────────────────────────────────────────────

// Mid-grill event (happens during grilling)
export interface GrillEvent {
  id: string;
  name: string;
  emoji: string;
  category: 'nuisance' | 'thug' | 'beggar' | 'authority';
  description: string;
  minDay: number;
  choices: GrillEventChoice[];
}

export interface GrillEventChoice {
  emoji: string;
  text: string;
  // Each outcome has a probability. If multiple outcomes, they are rolled.
  outcomes: GrillEventOutcome[];
}

export interface GrillEventOutcome {
  probability: number;  // 0-1, outcomes for a choice should sum to 1
  resultText: string;
  effects: {
    money?: number;
    reputation?: number;
    trafficBonus?: number;
    loseSausages?: number;       // lose N from warming zone
    loseGrillSausages?: number;  // lose N (or 'all') from grill
    extraSlot?: boolean;         // temporary +1 grill slot
    noMoreEventType?: string;    // prevent this event category for N days
    noMoreDays?: number;
  };
}

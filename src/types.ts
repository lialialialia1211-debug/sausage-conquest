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

export interface SausageSpecialEffect {
  id: string;
  name: string;
  description: string;
  triggerText: string;       // text shown when effect triggers (customer reaction)
  customerReaction: string;  // emoji animation to show on the customer
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
  specialEffect?: SausageSpecialEffect;
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
  personality: CustomerPersonality;
  isVIP?: boolean;
  order?: CustomerOrder;       // what they want to order
  loyaltyId?: string;          // links to loyalty record
  loyaltyBadge?: LoyaltyBadge; // current badge for display
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
export interface WorkerGrillSkill {
  canGrill: boolean;
  speed: number;          // 0-1, multiplier
  flipAccuracy: number;   // 0-1, chance of flipping at right time
  burnChance: number;     // 0-1, chance of distraction per action
  description: string;
}

export interface Worker {
  id: string;
  name: string;
  emoji: string;
  description: string;
  cost: number;        // one-time hire cost
  dailySalary: number; // daily pay
  buff: string;        // description of benefit
  debuff: string;      // description of downside
  grillSkill: WorkerGrillSkill;
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
    undergroundRep?: number;
    chaosPoints?: number;
    managementFeePaid?: number;
    blacklistBank?: boolean;
    unlockBlackMarket?: boolean;
  };
}

// ── 客人個性系統 ──
export type CustomerPersonality =
  | 'normal'      // 普通客人
  | 'karen'       // 奧客
  | 'enforcer'    // 地頭蛇手下
  | 'inspector'   // 食安稽查員
  | 'fatcat'      // 冤大頭 VIP
  | 'spy'         // 競業臥底
  | 'influencer'; // 網紅

// ── 戰鬥系統 ──
export type CombatAction = 'push' | 'splash' | 'pan' | 'bodyguard' | 'fake_slip' | 'bribe';

export interface CombatOutcome {
  success: boolean;
  moneyDelta: number;
  repDelta: number;
  undergroundRepDelta: number;
  witnessEffect: number;
  resultText: string;
  chaosPoints: number;
}

// ── 黑市系統 ──
export interface BlackMarketItem {
  id: string;
  name: string;
  emoji: string;
  cost: number;
  qualityBonus: number;   // 0.0–0.5
  catchChance: number;    // 0.0–1.0
  chaosPoints: number;
}

// ── 管理費狀態 ──
export interface ManagementFeeState {
  weeklyAmount: number;
  lastPaidDay: number;
  isResisting: boolean;
  resistDays: number;
  bribedInspector: boolean;
  rebranded: boolean;
}

// ── 事件 category 擴充 ──
export type EventCategory =
  | 'customer' | 'gangster' | 'positive'
  | 'underground' | 'social' | 'chaos';

// ── 訂單系統 ──
export interface CustomerOrder {
  sausageType: string;       // which sausage type they want (id from sausages.ts)
  condiments: string[];      // condiment IDs they want, in preferred order (1-3 items)
}

// ── 每單評分 ──
export interface OrderScore {
  grillScore: number;        // 0-100, grill quality
  warmingScore: number;      // 0-100, warming state
  condimentScore: number;    // 0-100, condiment accuracy
  waitScore: number;         // 0-100, remaining patience
  totalScore: number;        // weighted average
  stars: number;             // 1-5 stars
  tipAmount: number;         // calculated tip
}

// ── 客人忠誠度 ──
export type LoyaltyBadge = 'none' | 'bronze' | 'silver' | 'gold';

export interface CustomerLoyaltyRecord {
  name: string;              // display name
  emoji: string;             // character emoji
  visits: number;            // total visits
  totalStars: number;        // accumulated stars from all orders
  badge: LoyaltyBadge;       // current loyalty tier
  lastVisitDay: number;      // last day they visited
}

// ── 放高利貸系統 ──
export interface PlayerLoan {
  id: string;
  borrowerName: string;
  borrowerEmoji: string;
  principal: number;
  interestRate: number;
  totalOwed: number;
  dayLent: number;
  dueDay: number;
  status: 'active' | 'repaid' | 'defaulted' | 'seized';
  reliability: number;
}

// ── 標會系統 ──
export interface HuiMember {
  id: string;
  name: string;
  emoji: string;
  reliability: number;    // 0-1, chance they actually pay (1.0 = always pays)
  hasCollected: boolean;  // whether they already collected the pot
  isPlayer: boolean;
}

export interface HuiState {
  isActive: boolean;        // whether player has joined a hui
  day: number;              // which day of the hui cycle (1-5)
  cycle: number;            // which 5-day cycle (1, 2, 3...)
  members: HuiMember[];     // 5 members
  pot: number;              // current accumulated pot
  dailyFee: number;         // $100 per day
  playerHasCollected: boolean;  // player already took the pot
  playerBidAmount: number;  // player's last bid (0 if not bidding)
  runaway: boolean;         // player ran away with the money
  totalPaidIn: number;      // how much player has paid in total
  totalCollected: number;   // how much player has collected
}

// ── 自走棋戰鬥系統 ──
export type ChessPieceType = 'normal' | 'ranged' | 'aoe' | 'tank' | 'assassin' | 'support';

export interface ChessPiece {
  id: string;
  sausageId: string;       // links to SAUSAGE_TYPES
  name: string;
  emoji: string;
  type: ChessPieceType;
  hp: number;
  maxHp: number;
  atk: number;
  spd: number;
  stars: number;           // 0 = base, 1 = ★1 (×1.5), 2 = ★2 (×2.5)
  gridX: number;           // position on battlefield
  gridY: number;
  team: 'player' | 'opponent';
  isAlive: boolean;
}

export interface AutoChessState {
  playerPieces: ChessPiece[];
  opponentPieces: ChessPiece[];
  playerHp: number;        // base HP = 20
  opponentHp: number;
  round: number;
  maxRounds: number;       // 20
  phase: 'prep' | 'battle' | 'done';
  battleLog: string[];
  budget: number;          // remaining battle budget for buying pieces
}

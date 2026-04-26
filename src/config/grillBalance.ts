export type GrillDifficulty = 'hardcore' | 'casual' | undefined;

export interface GrillBalanceInput {
  day: number;
  tier: number;
  difficulty: GrillDifficulty;
  hasNeonSign?: boolean;
}

export interface ServiceComboConfig {
  interval: number;
  noteCount: number;
  noteSpacing: number;
  protectBuffer: number;
}

export interface AutoServeConfig {
  interval: number;
  minBurst: number;
  maxBurst: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getSessionDuration(tier: number): number {
  if (tier <= 3) return 75;
  if (tier <= 6) return 90;
  return 105;
}

export function getInitialArrivalInterval(input: GrillBalanceInput): number {
  const dayPressure = Math.min(1, (input.day - 1) / 14) * 4;
  const tierPressure = Math.min(1, (input.tier - 1) / 8) * 1.25;
  const neonPressure = input.hasNeonSign ? 1 : 0;
  const difficultyRelief =
    input.difficulty === 'casual' ? 0.75 :
    input.difficulty === 'hardcore' ? -0.5 :
    0;

  const rawInterval = 10 - dayPressure - tierPressure - neonPressure + difficultyRelief;
  return clamp(rawInterval * 0.6, 2.4, 7.5);
}

export function getBandArrivalInterval(args: {
  chartDuration: number;
  totalNotes: number;
  averageSausagesPerOrder: number;
  bandLabel: string;
  difficulty: GrillDifficulty;
}): number {
  const targetOrders = Math.ceil(args.totalNotes / args.averageSausagesPerOrder);
  const baseInterval = args.chartDuration / Math.max(1, targetOrders);
  const bandMultiplier =
    args.bandLabel === 'extreme' ? 0.84 :
    args.bandLabel === 'hard' ? 0.92 :
    args.bandLabel === 'medium' ? 1.0 :
    1.08;
  const difficultyMultiplier =
    args.difficulty === 'casual' ? 1.12 :
    args.difficulty === 'hardcore' ? 0.92 :
    1;

  return clamp(baseInterval * bandMultiplier * difficultyMultiplier, 2, 8);
}

export function getCustomerBatchRange(input: GrillBalanceInput): { min: number; max: number } {
  const dayMax = input.day >= 15 ? 6 : input.day >= 6 ? 5 : 4;
  const tierBonus = input.tier >= 7 ? 1 : 0;
  const difficultyBonus =
    input.difficulty === 'hardcore' ? 1 :
    input.difficulty === 'casual' ? -1 :
    0;

  return {
    min: input.day >= 15 && input.difficulty !== 'casual' ? 3 : 2,
    max: clamp(dayMax + tierBonus + difficultyBonus, 3, 7),
  };
}

export function getServiceComboConfig(input: GrillBalanceInput): ServiceComboConfig {
  const lateTier = input.tier >= 7;
  return {
    interval: input.difficulty === 'casual' ? 18 : lateTier || input.difficulty === 'hardcore' ? 12 : 15,
    noteCount: input.difficulty === 'casual' ? 5 : lateTier || input.difficulty === 'hardcore' ? 7 : 6,
    noteSpacing: input.difficulty === 'casual' ? 0.17 : 0.15,
    protectBuffer: input.difficulty === 'hardcore' ? 0.35 : 0.45,
  };
}

export function getAutoServeConfig(hasAutoGrill: boolean): AutoServeConfig {
  return hasAutoGrill
    ? { interval: 0.75, minBurst: 3, maxBurst: 3 }
    : { interval: 3, minBurst: 1, maxBurst: 2 };
}

export function getMaxSessionEvents(input: GrillBalanceInput): number {
  const base = input.day >= 12 || input.tier >= 6 ? 3 : 2;
  return input.difficulty === 'hardcore' ? base + 1 : base;
}

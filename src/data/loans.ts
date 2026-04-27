import type { LoanConfig } from '../types';

export const BANK_LOAN: LoanConfig = {
  lender: 'bank',
  label: '銀行',
  dailyRate: 0.00016, // ~6% annual
  maxAmount: 3000,
  termDays: 10,
  requiresReputation: 0,
  upfrontFeeRate: 0,
  repayMultiplier: 1, // exact principal + accrued interest
};

export const SHARK_LOAN: LoanConfig = {
  lender: 'shark',
  label: '地下錢莊',
  dailyRate: 0, // flat repay multiplier instead
  maxAmount: 5000,
  termDays: 10,
  requiresReputation: 0,
  upfrontFeeRate: 0.1, // 九出十三歸：拿九成，還十三成
  repayMultiplier: 1.3,
};

export const LOAN_CONFIGS: Record<'bank' | 'shark', LoanConfig> = {
  bank: BANK_LOAN,
  shark: SHARK_LOAN,
};

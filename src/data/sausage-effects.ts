import type { SausageSpecialEffect } from '../types';

export interface SpecialEffectResult {
  feedbackText: string;       // what to show as floating text
  customerEmoji: string;      // emoji shown on the served customer
  // Effects on game state:
  scareCount?: number;        // remove N customers from queue
  scareSpecialOnly?: boolean; // only scare special personality customers
  patienceBoostNext?: number; // next N customers get patience multiplier
  patienceBoostAmount?: number; // multiplier for patience boost (e.g., 1.5)
  patienceResetAll?: boolean; // reset ALL waiting customers' patience to full
  patiencePenaltyAll?: number; // multiply all waiting customers' patience by this (e.g., 0.8)
  tipMultiplierNext?: number; // next N serves get tip multiplier
  tipMultiplierAmount?: number; // the multiplier (e.g., 2.0)
  reputationDelta?: number;
}

// Re-export SausageSpecialEffect for convenience
export type { SausageSpecialEffect };

export const SAUSAGE_EFFECTS: Record<string, SpecialEffectResult> = {
  'big-taste': {
    feedbackText: '客人臉紅了...「下次我還要來！」',
    customerEmoji: '',
    patienceBoostNext: 1,
    patienceBoostAmount: 1.3,
    reputationDelta: 1,
    // +1 customer traffic handled in GrillScene (add 1 to pending queue)
    // +1 fan handled via loyalty (record extra star)
  },
  'big-wrap-small': {
    feedbackText: '客人嚼了幾口...「下面怎麼硬硬的？」',
    customerEmoji: '',
    patiencePenaltyAll: 0.85,
    reputationDelta: -1,
  },
  'great-wall': {
    feedbackText: '整條街的人都在拍照！「這太扯了吧！」',
    customerEmoji: '',
    patienceResetAll: true,
    reputationDelta: 3,
    // +2 customer traffic handled in GrillScene
  },
};

export function getSpecialEffect(sausageTypeId: string): SpecialEffectResult | null {
  return SAUSAGE_EFFECTS[sausageTypeId] || null;
}

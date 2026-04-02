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
  'wasabi-bomb': {
    feedbackText: '💚 客人噴淚了！旁邊的人嚇到跑掉',
    customerEmoji: '😭💦',
    scareCount: 1,
    reputationDelta: 2,
  },
  'love-sausage': {
    feedbackText: '💕 客人陷入戀愛了！粉紅泡泡感染全場',
    customerEmoji: '😍💕',
    patienceBoostNext: 1,
    patienceBoostAmount: 1.5,
  },
  'ghost-pepper': {
    feedbackText: '👻🔥 客人原地噴火！特殊客人嚇跑了',
    customerEmoji: '🥵🔥',
    scareCount: 1,
    scareSpecialOnly: true,
    patiencePenaltyAll: 0.8,
  },
  'truffle': {
    feedbackText: '🖤✨ 客人驚為天人！接下來的客人小費翻倍',
    customerEmoji: '🤩✨',
    tipMultiplierNext: 3,
    tipMultiplierAmount: 2.0,
  },
  'rainbow': {
    feedbackText: '🌈🎶 客人開始唱歌跳舞！全場嗨起來',
    customerEmoji: '🥳🎶',
    patienceResetAll: true,
    reputationDelta: 1,
  },
};

export function getSpecialEffect(sausageTypeId: string): SpecialEffectResult | null {
  return SAUSAGE_EFFECTS[sausageTypeId] || null;
}

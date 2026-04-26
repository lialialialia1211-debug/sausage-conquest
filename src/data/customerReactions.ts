// Customer reaction lines — triggered by slow service or impatient waiting
// S7.6: restored from 9693ea7, renamed from customerComments.ts
// COUNTER_ATTACKS removed — counter-attack system砍掉 (S5.2)

export type ReactionCategory = 'slow' | 'impatient';

export const CUSTOMER_REACTIONS: Record<ReactionCategory, string[]> = {
  slow: [
    '到底在摸什麼',
    '我等很久了欸！',
    '是在擺爛嗎',
    '老闆你是不是在滑手機',
    '排這麼久是在排演唱會嗎',
  ],
  impatient: [
    '快點好嗎',
    '我趕時間啊',
    '還要多久...',
    '你是不是忘記我了',
  ],
};

// Customer commentary lines — triggered by grill performance
export const CUSTOMER_COMMENTS = {
  burnt: [
    '會不會烤啊',
    '這是木炭嗎？我付錢吃碳的？',
    '焦成這樣也敢端出來',
    '你是不是故意的',
  ],
  raw: [
    '這是生的吧',
    '有沒有熟啊？再烤一下好嗎',
    '我不吃生的欸',
    '你確定這能吃？',
  ],
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

// Counter-attack options
export const COUNTER_ATTACKS = [
  {
    id: 'charcoal',
    label: '招待滾燙木炭',
    description: '客人被燙傷報警',
    moneyPenalty: 500,
    repPenalty: 5,
    chaosPoints: 2,
    feedback: '客人被燙傷了！警察來了...',
    feedbackColor: '#ff2222',
  },
  {
    id: 'throw-sausage',
    label: '拿香腸丟他',
    description: '香腸直擊客人臉',
    moneyPenalty: 0,
    repPenalty: 2,
    chaosPoints: 1,
    feedback: '香腸正中紅心！客人落荒而逃',
    feedbackColor: '#ffaa00',
  },
];

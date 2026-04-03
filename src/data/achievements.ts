// Achievement definitions for 腸征天下

export interface Achievement {
  id: string;
  name: string;
  emoji: string;
  description: string;
  joke: string; // funny subtitle
  condition: (state: any) => boolean; // takes gameState
  image?: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_sale',
    name: '第一桶金',
    emoji: '💰',
    description: '完成第一天營業',
    joke: '就這？',
    condition: (s) => s.day >= 2,
    image: 'badge-first_gold.png',
  },
  {
    id: 'perfect_10',
    name: '烤肉之神',
    emoji: '🔥',
    description: '累計完美烤制 50 根',
    joke: '火候拿捏大師',
    condition: (s) => (s.stats?.totalPerfect ?? 0) >= 50,
    image: 'badge-grill_master.png',
  },
  {
    id: 'arsonist',
    name: '縱火犯',
    emoji: '🧯',
    description: '累計燒焦 30 根',
    joke: '消防局已通報',
    condition: (s) => (s.stats?.totalBurnt ?? 0) >= 30,
    image: 'badge-arsonist.png',
  },
  {
    id: 'millionaire',
    name: '百萬腸商',
    emoji: '💎',
    description: '金錢超過 $10,000',
    joke: '香腸界的郭台銘',
    condition: (s) => s.money >= 10000,
    image: 'badge-millionaire.png',
  },
  {
    id: 'bankrupt_once',
    name: '翻車了',
    emoji: '💀',
    description: '破產一次',
    joke: '創業維艱',
    condition: (s) => s.money <= 0,
    image: 'badge-bankrupt.png',
  },
  {
    id: 'loan_shark',
    name: '欠債大王',
    emoji: '🦈',
    description: '向地下錢莊借款',
    joke: '九出十三歸你也敢',
    condition: (s) => s.loans?.active?.lender === 'shark',
    image: 'badge-debt_king.png',
  },
  {
    id: 'debt_free',
    name: '無債一身輕',
    emoji: '🕊️',
    description: '還清所有貸款',
    joke: '自由的感覺真好',
    condition: (s) => (s.stats?.totalLoansRepaid ?? 0) > 0 && !s.loans?.active,
    image: 'badge-debt_free.png',
  },
  {
    id: 'turf_3',
    name: '小有地盤',
    emoji: '🏴',
    description: '佔領 3 格',
    joke: '開始有勢力了',
    condition: (s) => countPlayerGrids(s) >= 3,
    image: 'badge-small_territory.png',
  },
  {
    id: 'turf_7',
    name: '半壁江山',
    emoji: '⚔️',
    description: '佔領 7 格',
    joke: '離霸主不遠了',
    condition: (s) => countPlayerGrids(s) >= 7,
    image: 'badge-half_empire.png',
  },
  {
    id: 'night_king',
    name: '夜市之王',
    emoji: '👑',
    description: '佔領 10 格',
    joke: '你就是傳說',
    condition: (s) => countPlayerGrids(s) >= 10,
    image: 'badge-nightmarket_king.png',
  },
  {
    id: 'survivor_10',
    name: '十日生存',
    emoji: '📅',
    description: '存活 10 天',
    joke: '竟然沒倒',
    condition: (s) => s.day >= 10,
    image: 'badge-ten_days.png',
  },
  {
    id: 'survivor_20',
    name: '二十日老手',
    emoji: '🎖️',
    description: '存活 20 天',
    joke: '夜市老鳥了',
    condition: (s) => s.day >= 20,
    image: 'badge-twenty_days.png',
  },
  {
    id: 'battle_ace',
    name: '常勝將軍',
    emoji: '🏆',
    description: '贏得 5 場戰鬥',
    joke: '戰無不勝',
    condition: (s) => (s.stats?.battlesWon ?? 0) >= 5,
    image: 'badge-undefeated.png',
  },
  {
    id: 'rich_start',
    name: '理財達人',
    emoji: '📈',
    description: '第 5 天前存到 $8,000',
    joke: '巴菲特看了都想學',
    condition: (s) => s.day <= 5 && s.money >= 8000,
    image: 'badge-finance_master.png',
  },
  {
    id: 'all_types',
    name: '品種蒐集家',
    emoji: '🌈',
    description: '解鎖全部 6 種香腸',
    joke: '什麼腸都有',
    condition: (s) => (s.unlockedSausages?.length ?? 0) >= 6,
    image: 'badge-variety_collector.png',
  },
];

function countPlayerGrids(state: any): number {
  if (!state.map) return 0;
  return Object.values(state.map).filter((v) => v === 'player').length;
}

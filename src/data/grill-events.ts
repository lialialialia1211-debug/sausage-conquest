import type { GrillEvent } from '../types';
import { gameState } from '../state/GameState';

export const GRILL_EVENTS: GrillEvent[] = [
  // ── 奧客 (Karen) ─────────────────────────────────────────────────────────────
  {
    id: 'karen',
    name: '奧客大嬸',
    emoji: '😤',
    category: 'nuisance',
    description: '一個大嬸衝到攤位前，指著香腸大喊：「這什麼東西！我上次吃完拉三天！」（她根本沒來過）',
    minDay: 1,
    choices: [
      {
        emoji: '🙏',
        text: '誠懇道歉送她一根',
        outcomes: [
          {
            probability: 1,
            resultText: '她吃完說「嗯...還行」走了',
            effects: { loseSausages: 1, reputation: 2 },
          },
        ],
      },
      {
        emoji: '🤔',
        text: '「阿姨，我們上禮拜才開始賣的欸」',
        outcomes: [
          {
            probability: 0.5,
            resultText: '她臉紅紅地自己走了',
            effects: { reputation: 3 },
          },
          {
            probability: 0.5,
            resultText: '她愈鬧愈大，引來路人圍觀',
            effects: { reputation: -5, money: -100 },
          },
        ],
      },
      {
        emoji: '🖤',
        text: '遞出一根碳化香腸：「這根特別招待」',
        outcomes: [
          {
            probability: 0.8,
            resultText: '她咬一口臉都綠了',
            effects: { reputation: -3 },
          },
          {
            probability: 0.2,
            resultText: '居然說焦香味很讚，成為常客',
            effects: { reputation: 5 },
          },
        ],
      },
    ],
  },

  // ── 流氓客 (Thug) ─────────────────────────────────────────────────────────────
  {
    id: 'thug',
    name: '刺青小哥',
    emoji: '😈',
    category: 'thug',
    description: '三個刺青小哥晃過來，其中一個拍了你的攤車：「兄弟，在這擺攤要懂規矩啊。」',
    minDay: 3,
    choices: [
      {
        emoji: '💸',
        text: '乖乖交保護費',
        outcomes: [
          {
            probability: 1,
            resultText: '他們點頭離開，三天內不會再來',
            effects: {
              money: -200,
              noMoreEventType: 'thug',
              noMoreDays: 3,
            },
          },
        ],
      },
      {
        emoji: '😏',
        text: '「我跟巷口阿龍很熟」',
        outcomes: [
          {
            probability: 0.4,
            resultText: '他們互看一眼，識趣地走了',
            effects: {},
          },
          {
            probability: 0.6,
            resultText: '他們翻你攤位洩憤',
            effects: { money: -300, loseSausages: 2 },
          },
        ],
      },
      {
        emoji: '🔧',
        text: '拿起烤夾：「來啊！一對三我也不怕！」',
        outcomes: [
          {
            probability: 0.3,
            resultText: '圍觀群眾瘋狂鼓掌，你成了夜市英雄',
            effects: { reputation: 5, trafficBonus: 0.2 },
          },
          {
            probability: 0.7,
            resultText: '他們把你的烤架翻了',
            effects: { loseGrillSausages: 999, money: -500 },
          },
        ],
      },
    ],
  },

  // ── 乞丐 (Beggar) ─────────────────────────────────────────────────────────────
  {
    id: 'beggar',
    name: '流浪阿伯',
    emoji: '🧓',
    category: 'beggar',
    description: '一個蓬頭垢面的老伯伯蹲在攤位旁，眼巴巴地看著烤架上的香腸。',
    minDay: 1,
    choices: [
      {
        emoji: '🍢',
        text: '「阿伯，這根請你」',
        outcomes: [
          {
            probability: 1,
            resultText: '阿伯感動到眼眶泛紅',
            effects: { loseSausages: 1, reputation: 3 },
          },
        ],
      },
      {
        emoji: '👀',
        text: '假裝沒看到',
        outcomes: [
          {
            probability: 0.8,
            resultText: '阿伯默默離開，什麼都沒發生',
            effects: {},
          },
          {
            probability: 0.2,
            resultText: '他偷偷在部落格寫了一篇推薦文',
            effects: { reputation: 10, money: 500 },
          },
        ],
      },
      {
        emoji: '💪',
        text: '「阿伯，要不要來幫我翻香腸？」',
        outcomes: [
          {
            probability: 1,
            resultText: '阿伯捲起袖子幹勁十足（但技術堪憂）',
            effects: { extraSlot: true, loseSausages: 1 },
          },
        ],
      },
    ],
  },

  // ── 夜市管理員 (Night Market Manager) ─────────────────────────────────────────
  {
    id: 'inspector',
    name: '夜市管理員',
    emoji: '📋',
    category: 'authority',
    description: '戴紅臂章的管理員阿姨走過來，掏出一本皺巴巴的收據本：「規費還沒繳喔，三百塊。」',
    minDay: 5,
    choices: [
      {
        emoji: '💴',
        text: '正常繳費',
        outcomes: [
          {
            probability: 1,
            resultText: '乖乖繳錢，世界和平',
            effects: { money: -300 },
          },
        ],
      },
      {
        emoji: '🤷',
        text: '「阿姨我剛才繳過了欸」（裝傻）',
        outcomes: [
          {
            probability: 0.3,
            resultText: '她翻了半天找不到紀錄，半信半疑走了',
            effects: {},
          },
          {
            probability: 0.7,
            resultText: '她在收據本上找到你的名字，怒加罰款',
            effects: { money: -600 },
          },
        ],
      },
      {
        emoji: '🍡',
        text: '拿一根香腸往她臉上丟',
        outcomes: [
          {
            probability: 1,
            resultText: '隔壁攤販全體起立鼓掌，你成了夜市傳奇',
            effects: {
              loseSausages: 1,
              reputation: -10,
              money: -500,
              trafficBonus: 0.3,
            },
          },
        ],
      },
      {
        emoji: '🎁',
        text: '「阿姨，這兩根頂級香腸請你帶回去」',
        outcomes: [
          {
            probability: 1,
            resultText: '她笑得合不攏嘴，幫你在管理員群組說好話',
            effects: {
              loseSausages: 2,
              reputation: 5,
              noMoreEventType: 'authority',
              noMoreDays: 5,
            },
          },
        ],
      },
    ],
  },
];

/**
 * Pick a random eligible grill event for the current day.
 * Respects minDay requirements and active cooldowns from gameState.grillEventCooldowns.
 *
 * @param day - current game day
 * @param recentEventIds - event IDs already triggered this session (avoid repeats in one day)
 * @returns a random eligible GrillEvent, or null if none qualify
 */
export function rollGrillEvent(day: number, recentEventIds: string[] = []): GrillEvent | null {
  const cooldowns = gameState.grillEventCooldowns ?? {};

  const eligible = GRILL_EVENTS.filter(event => {
    // Must meet minimum day requirement
    if (day < event.minDay) return false;
    // Must not be on cooldown (cooldown stores the day it expires)
    const cooldownExpiry = cooldowns[event.category] ?? 0;
    if (day < cooldownExpiry) return false;
    // Skip events already triggered this grilling session
    if (recentEventIds.includes(event.id)) return false;
    return true;
  });

  if (eligible.length === 0) return null;

  return eligible[Math.floor(Math.random() * eligible.length)];
}

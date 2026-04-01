import type { SausageType } from '../types';

export const SAUSAGE_TYPES: SausageType[] = [
  {
    id: 'black-pig',
    name: '原味黑豬',
    emoji: '🐷',
    cost: 15,
    suggestedPrice: 35,
    grillDifficulty: 1,
    description: '不敗的經典，從沒讓人失望過',
    battle: {
      hp: 100,
      atk: 20,
      spd: 10,
      type: 'normal',
    },
  },
  {
    id: 'flying-fish-roe',
    name: '飛魚卵腸',
    emoji: '🐟',
    cost: 25,
    suggestedPrice: 50,
    grillDifficulty: 2,
    description: '卵會在嘴裡爆開，客人表情很精彩',
    battle: {
      hp: 70,
      atk: 35,
      spd: 15,
      type: 'ranged',
    },
  },
  {
    id: 'garlic-bomb',
    name: '蒜味轟炸',
    emoji: '🧄',
    cost: 12,
    suggestedPrice: 30,
    grillDifficulty: 1,
    description: '吃完嘴臭驅散隔壁攤客人，一石二鳥',
    battle: {
      hp: 80,
      atk: 25,
      spd: 12,
      type: 'aoe',
    },
  },
];

export const SAUSAGE_MAP: Record<string, SausageType> = Object.fromEntries(
  SAUSAGE_TYPES.map((s) => [s.id, s])
);

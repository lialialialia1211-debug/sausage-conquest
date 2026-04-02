export interface Condiment {
  id: string;
  name: string;
  emoji: string;
  description: string;
}

export const CONDIMENTS: Condiment[] = [
  { id: 'garlic-paste', name: '蒜泥', emoji: '🧄', description: '經典台式蒜泥，烤香腸的靈魂伴侶' },
  { id: 'wasabi', name: '芥末醬', emoji: '🟢', description: '嗆辣芥末，吃了會噴淚' },
  { id: 'chili-sauce', name: '辣椒醬', emoji: '🌶️', description: '自製辣椒醬，香辣夠勁' },
  { id: 'sauerkraut', name: '酸菜', emoji: '🥬', description: '醃漬酸菜，解膩神器' },
  { id: 'onion-dice', name: '洋蔥丁', emoji: '🧅', description: '新鮮洋蔥丁，清甜爽口' },
  { id: 'basil', name: '九層塔', emoji: '🌿', description: '台式香草，提味增香' },
  { id: 'soy-paste', name: '醬油膏', emoji: '🫘', description: '甜鹹醬油膏，經典沾醬' },
  { id: 'peanut', name: '花生粉', emoji: '🥜', description: '香噴噴花生粉，甜香酥脆' },
];

export function getCondimentById(id: string): Condiment | undefined {
  return CONDIMENTS.find(c => c.id === id);
}

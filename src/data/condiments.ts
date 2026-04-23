export interface Condiment {
  id: string;
  name: string;
  emoji: string;
  image?: string;
  description: string;
}

export const CONDIMENTS: Condiment[] = [
  { id: 'garlic-paste', name: '蒜泥', emoji: '🧄', image: 'condiment-garlic-paste.png', description: '經典台式蒜泥，烤香腸的靈魂伴侶' },
];

export function getCondimentById(id: string): Condiment | undefined {
  return CONDIMENTS.find(c => c.id === id);
}

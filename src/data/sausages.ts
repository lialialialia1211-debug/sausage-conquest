import type { SausageType } from '../types';

export const SAUSAGE_TYPES: SausageType[] = [
  {
    id: 'flying-fish-roe',
    name: '飛魚卵腸',
    emoji: '',
    image: 'sausage-flying-fish-roe.png',
    cost: 20,
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
    id: 'cheese',
    name: '起司爆漿',
    emoji: '',
    image: 'sausage-cheese.png',
    cost: 30,
    suggestedPrice: 60,
    grillDifficulty: 3,
    description: '完美區間超窄，但爆漿瞬間客人會尖叫',
    battle: { hp: 60, atk: 40, spd: 8, type: 'tank' },
  },
  {
    id: 'big-taste',
    name: '大嚐莖',
    emoji: '',
    image: 'sausage-big-taste.png',
    cost: 15,
    suggestedPrice: 40,
    grillDifficulty: 1,
    description: '粗大飽滿的一根，吃過的都說還想再來',
    battle: { hp: 90, atk: 25, spd: 11, type: 'normal' },
    specialEffect: {
      id: 'big-taste',
      name: '回味無窮',
      description: '客人臉紅說下次還來，客流+1 粉絲+1',
      triggerText: '客人咬了一口，臉瞬間紅了...「這...下次我還要來！」',
      customerReaction: '',
    },
  },
  {
    id: 'big-wrap-small',
    name: '大腸包小腸',
    emoji: '',
    image: 'sausage-big-wrap-small.png',
    cost: 22,
    suggestedPrice: 50,
    grillDifficulty: 2,
    description: '大腸裡面塞小腸，吃了會覺得下面硬硬的',
    battle: { hp: 110, atk: 20, spd: 8, type: 'tank' },
    specialEffect: {
      id: 'big-wrap-small',
      name: '硬硬的感覺',
      description: '客人覺得不太對勁，耐心下降，小生氣',
      triggerText: '客人嚼了幾口，表情逐漸微妙...「怎麼覺得下面硬硬的？」',
      customerReaction: '',
    },
  },
  {
    id: 'great-wall',
    name: '萬里腸城',
    emoji: '',
    image: 'sausage-great-wall.png',
    cost: 50,
    suggestedPrice: 100,
    grillDifficulty: 3,
    description: '一整排迷你香腸串成城牆，氣勢磅礴',
    battle: { hp: 150, atk: 15, spd: 5, type: 'tank' },
    specialEffect: {
      id: 'great-wall',
      name: '城牆震撼',
      description: '路人瘋狂拍照上傳，聲望+3 全場客人耐心回滿',
      triggerText: '客人舉起那排香腸城牆，整條街的人都掏出手機拍照！「這什麼東西也太扯了吧！」',
      customerReaction: '',
    },
  },
];

export const SAUSAGE_MAP: Record<string, SausageType> = Object.fromEntries(
  SAUSAGE_TYPES.map((s) => [s.id, s])
);

export const INITIAL_SAUSAGES: string[] = [
  'flying-fish-roe', 'cheese', 'big-taste', 'big-wrap-small', 'great-wall'
];

import type { Worker } from '../types';

export const WORKERS: Worker[] = [
  {
    id: 'adi',
    name: '阿弟｜補拍烤手',
    emoji: '',
    image: 'ui/worker-adi-rhythm.png',
    description: '幫你顧一排烤網，讓高密度音符段不會瞬間塞爆。',
    cost: 500,
    dailySalary: 30,
    buff: '烤網容量 +1，滿架壓力較低',
    debuff: '15% 機率手忙腳亂，今日結算多一筆混亂紀錄',
    grillSkill: { canGrill: true, speed: 1.0, flipAccuracy: 0.85, burnChance: 0.15, description: '普通補拍型，適合新手撐過中段密集音符。' },
  },
  {
    id: 'mei',
    name: '小美｜節奏叫號員',
    emoji: '',
    image: 'ui/worker-mei-service.png',
    description: '負責排隊與叫號，讓客人一直銜接，不讓保溫區出餐空轉。',
    cost: 800,
    dailySalary: 50,
    buff: '客流穩定度 +30%，等待客人較不容易斷層',
    debuff: '10% 機率把特殊客人叫太早，增加事件壓力',
    grillSkill: { canGrill: false, speed: 0, flipAccuracy: 0, burnChance: 0, description: '不碰烤網，專門維持客人節奏。' },
  },
  {
    id: 'wangcai',
    name: '旺財｜場控看門犬',
    emoji: '',
    image: 'ui/worker-wangcai-luck.png',
    description: '擋掉一部分麻煩客，但偶爾也會嚇跑一般客人。',
    cost: 300,
    dailySalary: 10,
    buff: '50% 機率阻止戰鬥/找碴事件',
    debuff: '10% 機率嚇跑剛進場客人，可能讓出餐節奏短暫變空',
    grillSkill: { canGrill: false, speed: 0, flipAccuracy: 0, burnChance: 0, description: '場控型，不提升判定但降低事件干擾。' },
  },
  {
    id: 'dad',
    name: '老爸｜慢火穩拍師',
    emoji: '',
    image: 'ui/worker-dad-steady.png',
    description: '慢但穩，適合把 Good/Great 的香腸穩定送到可賣熟度。',
    cost: 1200,
    dailySalary: 0,
    buff: '翻烤準確率高，燒焦機率低',
    debuff: '每日抽成 10% 營收',
    grillSkill: { canGrill: true, speed: 0.5, flipAccuracy: 0.95, burnChance: 0.05, description: '穩定控火型，降低 MISS 後的烤網災情。' },
  },
];

export function getWorkerById(id: string): Worker | undefined {
  return WORKERS.find(w => w.id === id);
}

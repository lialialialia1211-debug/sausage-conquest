import type { Worker } from '../types';

export const WORKERS: Worker[] = [
  {
    id: 'adi',
    name: '高中阿迪仔',
    emoji: '',
    image: 'worker-adi.png',
    description: '翹課來打工的高中生，手腳快但三不五時就在滑手機',
    cost: 500,
    dailySalary: 30,
    buff: '烤架 +1 格',
    debuff: '15% 機率滑手機忘記翻面（隨機一根 +20 熟度）',
    grillSkill: { canGrill: true, speed: 1.0, flipAccuracy: 0.85, burnChance: 0.15, description: '手腳快但常滑手機' },
  },
  {
    id: 'mei',
    name: '中輟學生妹',
    emoji: '',
    image: 'worker-mei.png',
    description: '染著一頭粉紅色頭髮，客人都被她吸引過來',
    cost: 800,
    dailySalary: 50,
    buff: '客流量 +30%',
    debuff: '10% 機率偷吃保溫箱的香腸',
    grillSkill: { canGrill: false, speed: 0, flipAccuracy: 0, burnChance: 0, description: '不會烤，但會幫忙出餐' },
  },
  {
    id: 'wangcai',
    name: '巷口的旺財',
    emoji: '',
    image: 'worker-wangcai.png',
    description: '忠心耿耿的流浪狗，在攤位旁邊趴著就是最好的保鏢',
    cost: 300,
    dailySalary: 10,  // dog food cost
    buff: '50% 機率嚇跑奧客和流氓',
    debuff: '10% 機率對普通客人亂吠（客人嚇跑）',
    grillSkill: { canGrill: false, speed: 0, flipAccuracy: 0, burnChance: 0, description: '牠是狗' },
  },
  {
    id: 'dad',
    name: '在家看電視的老爸',
    emoji: '',
    image: 'worker-dad.png',
    description: '本來在家看政論節目，被你拖來幫忙顧保溫箱',
    cost: 1200,
    dailySalary: 0,  // takes a cut from daily revenue instead
    buff: '保溫箱衰退速度減半',
    debuff: '每日營收抽 10% 當零用錢',
    grillSkill: { canGrill: true, speed: 0.5, flipAccuracy: 0.95, burnChance: 0.05, description: '慢工出細活，品質穩定' },
  },
];

export function getWorkerById(id: string): Worker | undefined {
  return WORKERS.find(w => w.id === id);
}

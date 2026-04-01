// AI opponent definitions for territory battles

export interface Opponent {
  id: string;
  name: string;
  emoji: string;
  description: string;
  gridSlot: number;
  preferredTypes: string[];  // sausage type IDs they prefer to use
  difficulty: number;        // 1-5
  unitCount: number;         // how many sausages they field
  dialogue: {
    beforeBattle: string;
    win: string;
    lose: string;
  };
}

export const OPPONENTS: Opponent[] = [
  {
    id: 'uncle',
    name: '阿伯',
    emoji: '🧓',
    description: '在這條街賣了三十年香腸的老師傅，眼神犀利，皮膚像香腸一樣棕褐。',
    gridSlot: 3,
    preferredTypes: ['black-pig'],
    difficulty: 1,
    unitCount: 3,
    dialogue: {
      beforeBattle: '年輕人，香腸就是要原味啦！你那花俏的不行！',
      win: '哎呀輸了⋯⋯難得你有幾分本事，老夫認了。',
      lose: '老薑還是辣的！下次再來，老夫在等你！',
    },
  },
  {
    id: 'influencer',
    name: '網紅弟',
    emoji: '📱',
    description: '每道香腸先拍照再吃，粉絲百萬，手機比鏟子用得熟。',
    gridSlot: 7,
    preferredTypes: ['flying-fish-roe'],
    difficulty: 2,
    unitCount: 4,
    dialogue: {
      beforeBattle: '先拍照再打！等我開直播⋯⋯好，開始！📸',
      win: '我的粉絲不會原諒你的⋯⋯負評轟炸預備！',
      lose: '這一幕超讚，謝謝素材！馬上剪輯上傳！',
    },
  },
];

export const OPPONENT_MAP: Record<string, Opponent> = Object.fromEntries(
  OPPONENTS.map(o => [o.id, o])
);

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
  appearDay: number;         // which day this opponent first shows up
  pricingStrategy: 'cheap' | 'premium' | 'balanced';
  dialogue: {
    beforeBattle: string;
    win: string;
    lose: string;
    greeting: string;        // shown when opponent first appears
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
    appearDay: 1,
    pricingStrategy: 'balanced',
    dialogue: {
      beforeBattle: '年輕人，香腸就是要原味啦！你那花俏的不行！',
      win: '哎呀輸了⋯⋯難得你有幾分本事，老夫認了。',
      lose: '老薑還是辣的！下次再來，老夫在等你！',
      greeting: '這條街是老夫的地盤，小鬼頭給我識相一點！',
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
    appearDay: 1,
    pricingStrategy: 'balanced',
    dialogue: {
      beforeBattle: '先拍照再打！等我開直播⋯⋯好，開始！📸',
      win: '我的粉絲不會原諒你的⋯⋯負評轟炸預備！',
      lose: '這一幕超讚，謝謝素材！馬上剪輯上傳！',
      greeting: '哇你好，我幫你免費打廣告，前提是⋯⋯你閃遠一點！',
    },
  },
  {
    id: 'fat-sister',
    name: '胖姐',
    emoji: '👩‍🍳',
    description: '街口最資深的大姐頭，圍裙油亮，嗓門比鐵板還響，客人都叫她「姐」。',
    gridSlot: 1,
    preferredTypes: ['garlic-bomb', 'black-pig'],
    difficulty: 3,
    unitCount: 5,
    appearDay: 5,
    pricingStrategy: 'premium',
    dialogue: {
      beforeBattle: '小孩仔，姐姐教你做人！你這攤擺在這，是要跟姐搶飯碗喔？',
      win: '哼，叫你不聽！回去再練個十年再來，姐在這等你啦！',
      lose: '喲，有幾把刷子嘛⋯⋯算你厲害，但別讓姐再看到你！',
      greeting: '新來的？姐跟你說，這條街有規矩，新人要乖乖排隊啦！',
    },
  },
  {
    id: 'student',
    name: '大學生',
    emoji: '🎓',
    description: '商學院畢業，創業計畫做了三十頁，實際煎過的香腸只有一條。',
    gridSlot: 5,
    preferredTypes: ['flying-fish-roe'],
    difficulty: 2,
    unitCount: 3,
    appearDay: 10,
    pricingStrategy: 'cheap',
    dialogue: {
      beforeBattle: '根據我的市場分析⋯⋯我們的 KPI 是贏你。不、不是怕你！只是策略上需要暖機！',
      win: '這個⋯⋯算是 pivot 失敗？我、我要回去修改商業模式了！',
      lose: '數據顯示⋯⋯您的勝率呈現統計顯著優勢。恭、恭喜您！',
      greeting: '您好！我在執行一個創新的差異化定位策略。請問您是潛在競爭威脅嗎？',
    },
  },
  {
    id: 'sausage-king',
    name: '腸哥',
    emoji: '👑',
    description: '傳說中的街頭香腸王，從不現身，今天卻親自出馬。他的攤車甚至沒有招牌。',
    gridSlot: 0,
    preferredTypes: ['black-pig', 'garlic-bomb', 'flying-fish-roe', 'cheese', 'squidink', 'mala'],
    difficulty: 5,
    unitCount: 5,
    appearDay: 20,
    pricingStrategy: 'premium',
    dialogue: {
      beforeBattle: '我聽說有人在搶我的地盤。⋯⋯是你？好。今天讓你見識一下，什麼叫做「腸道真理」。',
      win: '你輸了，但沒有輸掉尊嚴。回去，繼續修練。這條街，以後還是要靠人才的。',
      lose: '⋯⋯。你贏了。這條街，就交給你了。但記住，香腸不只是生意。',
      greeting: '哦？有個年輕人在這條街搞出名堂了？我得親眼看看。',
    },
  },
];

export const OPPONENT_MAP: Record<string, Opponent> = Object.fromEntries(
  OPPONENTS.map(o => [o.id, o])
);

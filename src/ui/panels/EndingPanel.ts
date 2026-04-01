// EndingPanel — 遊戲結局面板 (pure DOM, no Phaser)
import { EventBus } from '../../utils/EventBus';
import { gameState, updateGameState } from '../../state/GameState';
import { GRID_SLOTS } from '../../data/map';

export type EndingType = 'bankrupt' | 'loan-shark' | 'territory-win' | 'day30';

export interface EndingData {
  type: EndingType;
  dayssurvived: number;
  totalRevenue: number;
}

interface EndingConfig {
  emoji: string;
  title: string;
  dramatic: string;
  grade?: string;
}

function getDay30Grade(playerSlots: number): { grade: string; title: string } {
  if (playerSlots >= 10) return { grade: 'S', title: '夜市之王！' };
  if (playerSlots >= 7)  return { grade: 'A', title: '夜市大亨' };
  if (playerSlots >= 4)  return { grade: 'B', title: '小有名氣的攤販' };
  if (playerSlots >= 2)  return { grade: 'C', title: '普通攤販' };
  return { grade: 'F', title: '苦苦掙扎的小販' };
}

function buildEndingConfig(type: EndingType): EndingConfig {
  const playerSlots = GRID_SLOTS.filter(s => gameState.map[s.id] === 'player').length;

  switch (type) {
    case 'bankrupt':
      return {
        emoji: '💀',
        title: '破產',
        dramatic: '你的攤車被法拍了。不過別擔心，隔壁大腸包小腸哥說可以收你當學徒。',
      };
    case 'loan-shark':
      return {
        emoji: '🦈',
        title: '地下錢莊 GAME OVER',
        dramatic: '你消失在夜市裡，有人說你去當漁工了...',
      };
    case 'territory-win': {
      return {
        emoji: '👑',
        title: '稱霸夜市！',
        dramatic: '你成功稱霸夜市！各大媒體爭相報導：「從被裁員到夜市王，香腸大亨的逆襲之路」',
      };
    }
    case 'day30': {
      const { grade, title } = getDay30Grade(playerSlots);
      return {
        emoji: grade === 'S' ? '🏆' : grade === 'A' ? '🥇' : grade === 'B' ? '🥈' : grade === 'C' ? '🥉' : '😢',
        title: `評等 ${grade}`,
        dramatic: title,
        grade,
      };
    }
  }
}

export class EndingPanel {
  private panel: HTMLElement;

  constructor(data: EndingData) {
    this.panel = document.createElement('div');
    this.panel.className = 'game-panel ui-interactive ending-panel';

    const config = buildEndingConfig(data.type);
    const playerSlots = GRID_SLOTS.filter(s => gameState.map[s.id] === 'player').length;

    // Emoji
    const emojiEl = document.createElement('div');
    emojiEl.className = 'ending-emoji';
    emojiEl.textContent = config.emoji;
    this.panel.appendChild(emojiEl);

    // Title
    const titleEl = document.createElement('div');
    titleEl.className = 'panel-title neon-flicker ending-title';
    titleEl.textContent = config.title;
    this.panel.appendChild(titleEl);

    // Dramatic text
    const dramaticEl = document.createElement('div');
    dramaticEl.className = 'ending-dramatic';
    dramaticEl.textContent = config.dramatic;
    this.panel.appendChild(dramaticEl);

    // Stats summary
    const statsEl = this.buildStats(data, playerSlots);
    this.panel.appendChild(statsEl);

    // Restart button
    const btnCenter = document.createElement('div');
    btnCenter.className = 'btn-center';
    btnCenter.style.marginTop = '24px';

    const btn = document.createElement('button');
    btn.className = 'btn-neon';
    btn.textContent = '重新開始';
    btn.addEventListener('click', () => {
      this.resetAndRestart();
    });
    btnCenter.appendChild(btn);
    this.panel.appendChild(btnCenter);
  }

  private buildStats(data: EndingData, playerSlots: number): HTMLElement {
    const el = document.createElement('div');
    el.className = 'ending-stats';

    const items = [
      { label: '存活天數', value: `${data.dayssurvived} 天` },
      { label: '累計營收', value: `$${data.totalRevenue}` },
      { label: '最終版圖', value: `${playerSlots} / ${GRID_SLOTS.length} 格` },
    ];

    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'ending-stats-row';

      const label = document.createElement('span');
      label.className = 'ending-stats-label';
      label.textContent = item.label;

      const value = document.createElement('span');
      value.className = 'ending-stats-value';
      value.textContent = item.value;

      row.appendChild(label);
      row.appendChild(value);
      el.appendChild(row);
    });

    return el;
  }

  private resetAndRestart(): void {
    // Reset all gameState fields to initial values
    updateGameState({
      day: 1,
      money: 5000,
      reputation: 50,
      phase: 'boot',
      inventory: {},
      map: {},
      upgrades: {},
      loans: {
        active: null,
        bankBlacklisted: false,
      },
      stats: {
        totalSausagesSold: 0,
        totalRevenue: 0,
        totalExpenses: 0,
      },
      dailyExpenses: 0,
      selectedSlot: -1,
      prices: {},
      dailySalesLog: [],
      dailyGrillStats: { perfect: 0, ok: 0, raw: 0, burnt: 0 },
    });

    EventBus.emit('restart-game', {});
  }

  getElement(): HTMLElement {
    return this.panel;
  }
}

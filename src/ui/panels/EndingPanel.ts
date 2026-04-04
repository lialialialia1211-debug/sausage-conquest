// EndingPanel — 遊戲結局面板 (pure DOM, no Phaser)
import { EventBus } from '../../utils/EventBus';
import { gameState, updateGameState } from '../../state/GameState';
import { GRID_SLOTS } from '../../data/map';
import { INITIAL_SAUSAGES } from '../../data/sausages';
import { resetAchievements } from '../../systems/AchievementEngine';
import { resetEventTracking } from '../../systems/EventEngine';

export type EndingType = 'bankrupt' | 'loan-shark' | 'territory-win' | 'day20';

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

function calculateGrillPR(stats: typeof gameState.stats): { score: number; pr: number; title: string; titleEmoji: string } {
  const total = stats['totalSausagesSold'] || 1; // avoid division by zero
  const perfectRatio = (stats['totalPerfect'] || 0) / total;
  const burntRatio = ((stats['totalBurnt'] || 0) + (stats['totalCarbonized'] || 0)) / total;
  const okRatio = 1 - perfectRatio - burntRatio;

  // Score 0-100
  let score = Math.round(perfectRatio * 100 - burntRatio * 60 - okRatio * 20);
  score = Math.max(0, Math.min(100, score));

  // PR mapping
  let pr: number;
  if (score >= 90) pr = 99;
  else if (score >= 75) pr = 90 + Math.floor(Math.random() * 9);
  else if (score >= 60) pr = 70 + Math.floor(Math.random() * 20);
  else if (score >= 45) pr = 50 + Math.floor(Math.random() * 20);
  else if (score >= 30) pr = 25 + Math.floor(Math.random() * 25);
  else pr = Math.floor(Math.random() * 25);

  // Title
  let title: string;
  let titleEmoji: string;
  if (pr >= 99) { title = '香腸霸主'; titleEmoji = ''; }
  else if (pr >= 90) { title = '大腸今'; titleEmoji = ''; }
  else if (pr >= 70) { title = '競爭力尚可'; titleEmoji = ''; }
  else if (pr >= 50) { title = '你確定要創業?'; titleEmoji = ''; }
  else if (pr >= 25) { title = '回家洗洗睡'; titleEmoji = ''; }
  else { title = '廢物東西'; titleEmoji = ''; }

  return { score, pr, title, titleEmoji };
}

function getDay20Grade(playerSlot: number): { grade: string; gradeEmoji: string; title: string } {
  if (playerSlot >= 9) return { grade: 'S', gradeEmoji: '', title: '夜市之王' };
  if (playerSlot >= 7) return { grade: 'A', gradeEmoji: '', title: '呼聲最高的挑戰者' };
  if (playerSlot >= 4) return { grade: 'B', gradeEmoji: '', title: '中段班老闆' };
  if (playerSlot >= 2) return { grade: 'C', gradeEmoji: '', title: '還在掙扎中' };
  return { grade: 'F', gradeEmoji: '', title: '原地踏步二十天' };
}

function buildEndingConfig(type: EndingType): EndingConfig {
  switch (type) {
    case 'bankrupt':
      return {
        emoji: '',
        title: '破產',
        dramatic: '你的攤車被法拍了。不過別擔心，隔壁大腸包小腸哥說可以收你當學徒。',
      };
    case 'loan-shark':
      return {
        emoji: '',
        title: '地下錢莊 GAME OVER',
        dramatic: '你消失在夜市裡，有人說你去當漁工了...',
      };
    case 'territory-win': {
      return {
        emoji: '',
        title: '稱霸夜市！',
        dramatic: '你從夜市最角落的停車場一路殺到正中央，成為真正的夜市之王！',
      };
    }
    case 'day20': {
      const slot = gameState.playerSlot || 1;
      const { grade, gradeEmoji, title } = getDay20Grade(slot);
      return {
        emoji: gradeEmoji,
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
    const statsEl = this.buildStats(data);
    this.panel.appendChild(statsEl);

    // PR leaderboard section
    const prEl = this.buildPRSection();
    this.panel.appendChild(prEl);

    // Restart button
    const btnCenter = document.createElement('div');
    btnCenter.className = 'btn-center';
    btnCenter.style.marginTop = '24px';

    const btn = document.createElement('button');
    btn.className = 'btn-neon';
    btn.textContent = '重新開始';
    btn.addEventListener('click', () => {
      btn.disabled = true;
      this.resetAndRestart();
    });
    btnCenter.appendChild(btn);
    this.panel.appendChild(btnCenter);
  }

  private buildStats(data: EndingData): HTMLElement {
    const el = document.createElement('div');
    el.className = 'ending-stats';

    const finalSlot = gameState.playerSlot || 1;
    const finalSlotData = GRID_SLOTS.find(s => s.tier === finalSlot) || GRID_SLOTS[0];

    const items = [
      { label: '存活天數', value: `${data.dayssurvived ?? gameState.day} 天` },
      { label: '累計營收', value: `$${data.totalRevenue}` },
      { label: '最終位置', value: `第 ${finalSlot} 層 — ${finalSlotData.name}` },
      { label: '烤制香腸', value: `${gameState.stats['totalSausagesSold'] ?? 0} 根` },
      { label: '戰鬥紀錄', value: `${gameState.stats['battlesWon'] ?? 0} 勝 ${gameState.stats['battlesLost'] ?? 0} 敗` },
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

  private buildPRSection(): HTMLElement {
    const { score, pr, title } = calculateGrillPR(gameState.stats);

    const totalSold = gameState.stats['totalSausagesSold'] || 0;
    const totalPerfect = gameState.stats['totalPerfect'] || 0;
    const totalBurnt = gameState.stats['totalBurnt'] || 0;
    const totalCarbonized = gameState.stats['totalCarbonized'] || 0;
    const totalOk = Math.max(0, totalSold - totalPerfect - totalBurnt - totalCarbonized);

    // PR color based on tier
    let prColor: string;
    if (pr >= 99) prColor = '#ffd700';
    else if (pr >= 90) prColor = '#00cc88';
    else if (pr >= 70) prColor = '#4488ff';
    else if (pr >= 50) prColor = '#ff8800';
    else if (pr >= 25) prColor = '#888888';
    else prColor = '#ff4444';

    const section = document.createElement('div');
    section.className = 'pr-section';
    section.style.cssText = [
      'margin-top: 20px',
      'padding: 16px',
      'border: 1px solid #333',
      'border-radius: 8px',
      'background: rgba(0,0,0,0.4)',
    ].join('; ');

    // Header
    const header = document.createElement('h3');
    header.style.cssText = 'margin: 0 0 12px 0; text-align: center; font-size: 16px; color: #fff;';
    header.textContent = '烤香腸熟練度報告';
    section.appendChild(header);

    // Stats breakdown
    const statsDiv = document.createElement('div');
    statsDiv.className = 'pr-stats';
    statsDiv.style.cssText = 'display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: #ccc; margin-bottom: 12px;';

    const statRows = [
      `完美出品：${totalPerfect} 根`,
      `普通：${totalOk} 根`,
      `燒焦：${totalBurnt} 根`,
      `碳化：${totalCarbonized} 根`,
    ];
    statRows.forEach(text => {
      const row = document.createElement('div');
      row.style.textAlign = 'center';
      row.textContent = text;
      statsDiv.appendChild(row);
    });
    section.appendChild(statsDiv);

    // Score line (small, above PR)
    const scoreEl = document.createElement('div');
    scoreEl.style.cssText = 'font-size: 13px; text-align: center; color: #999; margin-bottom: 4px;';
    scoreEl.textContent = `熟練度評分：${score} / 100`;
    section.appendChild(scoreEl);

    // PR number
    const prNumber = document.createElement('div');
    prNumber.className = 'pr-score';
    prNumber.style.cssText = `font-size: 48px; text-align: center; margin: 8px 0; color: ${prColor}; font-weight: bold;`;
    prNumber.textContent = `PR ${pr}`;
    section.appendChild(prNumber);

    // Title
    const prTitle = document.createElement('div');
    prTitle.className = 'pr-title';
    prTitle.style.cssText = `font-size: 24px; text-align: center; font-weight: bold; color: ${prColor};`;
    prTitle.textContent = title;
    section.appendChild(prTitle);

    // Simulation mode badge
    if (gameState.gameMode === 'simulation') {
      const simBadge = document.createElement('div');
      simBadge.style.cssText = 'color: #00cc88; font-size: 12px; text-align: center; margin-top: 8px;';
      simBadge.textContent = '模擬模式下達成';
      section.appendChild(simBadge);
    }

    // Shame text: simulation mode AND PR < 50
    if (gameState.gameMode === 'simulation' && pr < 50) {
      // Inject fadeIn keyframes if not already present
      if (!document.getElementById('pr-fadein-style')) {
        const style = document.createElement('style');
        style.id = 'pr-fadein-style';
        style.textContent = '@keyframes prFadeIn { from { opacity: 0; } to { opacity: 1; } }';
        document.head.appendChild(style);
      }

      const shameEl = document.createElement('div');
      shameEl.className = 'shame-text';
      shameEl.style.cssText = [
        'color: #ff4444',
        'font-size: 16px',
        'text-align: center',
        'margin-top: 12px',
        'animation: prFadeIn 2s ease-in',
      ].join('; ');
      shameEl.textContent = '連香腸都烤不好的你，還有什麼臉說你很努力了';
      section.appendChild(shameEl);
    }

    return section;
  }

  private resetAndRestart(): void {
    // Reset all gameState fields to initial values (matches GrillScene.resetFullGameState)
    updateGameState({
      day: 1,
      money: 8000,
      reputation: 50,
      phase: 'boot',
      playerSlot: 1,
      inventory: {},
      map: { 1: 'player', 2: 'enemy', 3: 'enemy', 4: 'enemy', 5: 'enemy', 6: 'enemy', 7: 'enemy', 8: 'enemy', 9: 'enemy' },
      upgrades: {},
      prices: {},
      selectedSlot: 1,
      unlockedSausages: [...INITIAL_SAUSAGES],
      hiredWorkers: [],
      marketingPurchases: {},
      grillEventCooldowns: {},
      workerSalaryPaid: false,
      undergroundRep: 0,
      reputationCrisisDay: -1,
      chaosCount: 0,
      dailyChaosActions: [],
      hasBodyguard: false,
      bodyguardDaysLeft: 0,
      blackMarketUnlocked: false,
      blackMarketStock: {},
      customerLoyalty: {},
      dailyOrderScores: [],
      battleBonus: 0,
      playerLoans: [],
      gameMode: '',
      dailyExpenses: 0,
      dailySalesLog: [],
      dailyGrillStats: { perfect: 0, ok: 0, raw: 0, burnt: 0, 'half-cooked': 0, 'slightly-burnt': 0, carbonized: 0 },
      warmingZone: [],
      dailyWaste: { grillRemaining: 0, warmingRemaining: 0 },
      dailyTrafficBonus: 0,
      skipDay: false,
      activeOpponents: [],
      defeatedOpponents: [],
      stats: {
        totalSausagesSold: 0,
        totalRevenue: 0,
        totalExpenses: 0,
        battlesWon: 0,
        battlesLost: 0,
        totalPerfect: 0,
        totalBurnt: 0,
        totalCarbonized: 0,
        totalLoansRepaid: 0,
      },
      loans: { active: null, bankBlacklisted: false },
      managementFee: { weeklyAmount: 500, lastPaidDay: 0, isResisting: false, resistDays: 0, bribedInspector: false, rebranded: false },
      hui: { isActive: false, day: 0, cycle: 0, members: [], pot: 0, dailyFee: 100, playerHasCollected: false, playerBidAmount: 0, runaway: false, totalPaidIn: 0, totalCollected: 0 },
    });

    resetAchievements();
    resetEventTracking();
    EventBus.emit('restart-game', {});
  }

  getElement(): HTMLElement {
    return this.panel;
  }

  destroy(): void {
    this.panel.remove();
  }
}

// SummaryPanel — 每日結算面板 (pure DOM, no Phaser)
import { EventBus } from '../../utils/EventBus';
import { gameState } from '../../state/GameState';
import { GRID_SLOTS } from '../../data/map';
import type { SaleRecord, DailySummary } from '../../types';

export interface GrillStats {
  perfect: number;
  ok: number;
  raw: number;
  burnt: number;
}

export interface SummaryData {
  salesLog: SaleRecord[];
  dailyReport: DailySummary;
  grillStats: GrillStats;
}

const CUSTOMER_REVIEWS = [
  '這香腸跟我前男友一樣，外焦內生',
  '老闆你確定這不是橡皮擦？',
  '吃完覺得人生充滿希望',
  '蒜味太重，我女朋友拒絕跟我說話了',
  '這價格在 Costco 可以買一整包',
  '烤得剛好，但排隊排到我都想自己開攤了',
  '墨魚口味讓我嘴巴像抹了煤炭，但超好吃',
  '比我前公司的尾牙餐好吃一百倍',
  '終於知道什麼叫做小確幸了',
  '下次來要帶朋友，這種好事不能自己獨佔',
  '老闆長得不帥但香腸很帥',
  '願意為了這條香腸再被裁員一次',
];

export class SummaryPanel {
  private panel: HTMLElement;

  constructor(data: SummaryData) {
    this.panel = document.createElement('div');
    this.panel.className = 'game-panel ui-interactive summary-panel';

    const { dailyReport, grillStats, salesLog } = data;
    const isBankrupt = gameState.money <= 0;

    // Title
    const titleEl = document.createElement('div');
    titleEl.className = 'panel-title neon-flicker';
    titleEl.textContent = '今日結算';
    this.panel.appendChild(titleEl);

    // Day header
    const dayHeader = document.createElement('div');
    dayHeader.className = 'summary-day-header';
    dayHeader.textContent = `Day ${dailyReport.day} 結算報告`;
    this.panel.appendChild(dayHeader);

    // Revenue breakdown box
    const revenueBox = this.buildRevenueBox(dailyReport);
    this.panel.appendChild(revenueBox);

    // Grill stats
    const grillStatsEl = this.buildGrillStats(grillStats);
    this.panel.appendChild(grillStatsEl);

    // Territory count
    const territoryEl = this.buildTerritoryRow();
    this.panel.appendChild(territoryEl);

    // Customer review quote
    const reviewEl = this.buildReview(salesLog);
    this.panel.appendChild(reviewEl);

    // Loan warning
    if (gameState.loans.active) {
      const daysLeft = gameState.loans.active.dueDay - gameState.day;
      if (daysLeft <= 3 && daysLeft > 0) {
        const loanWarn = document.createElement('div');
        loanWarn.className = 'summary-bankrupt-warning';
        loanWarn.style.borderColor = '#ff6600';
        loanWarn.style.color = '#ff9944';
        loanWarn.textContent = `借款還有 ${daysLeft} 天到期！應還 $${gameState.loans.active.totalOwed}`;
        this.panel.appendChild(loanWarn);
      } else if (daysLeft <= 0) {
        const loanWarn = document.createElement('div');
        loanWarn.className = 'summary-bankrupt-warning';
        loanWarn.textContent = `借款已逾期！趕快去商店還款！`;
        this.panel.appendChild(loanWarn);
      }
    }

    // Low money hint
    if (gameState.money < 200 && !gameState.loans.active) {
      const hintEl = document.createElement('div');
      hintEl.className = 'summary-bankrupt-warning';
      hintEl.style.borderColor = '#4488ff';
      hintEl.style.color = '#6699ff';
      hintEl.textContent = '資金快見底了！去商店的「資金周轉」借點錢？';
      this.panel.appendChild(hintEl);
    }

    // Bankrupt warning
    if (isBankrupt) {
      const warnEl = document.createElement('div');
      warnEl.className = 'summary-bankrupt-warning';
      warnEl.textContent = '資金歸零！再不想辦法就完了！';
      this.panel.appendChild(warnEl);
    }

    // Button
    const btnCenter = document.createElement('div');
    btnCenter.className = 'btn-center';
    btnCenter.style.marginTop = '20px';

    const btn = document.createElement('button');
    btn.className = 'btn-neon';
    btn.textContent = '迎接明天';
    btn.addEventListener('click', () => {
      EventBus.emit('summary-done', {});
    });
    btnCenter.appendChild(btn);
    this.panel.appendChild(btnCenter);
  }

  private buildRevenueBox(report: DailySummary): HTMLElement {
    const box = document.createElement('div');
    box.className = 'summary-revenue-box';

    const title = document.createElement('div');
    title.className = 'summary-section-title';
    title.textContent = '營收明細';
    box.appendChild(title);

    const rows: Array<{ label: string; value: number; color?: string }> = [
      { label: '今日營收', value: report.revenue },
      { label: '進貨成本', value: -report.expenses, color: '#ff6666' },
      { label: '今日淨利', value: report.profit, color: report.profit >= 0 ? '#39ff14' : '#ff4444' },
    ];

    rows.forEach((row, idx) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'summary-revenue-row';
      if (idx === rows.length - 1) {
        rowEl.classList.add('summary-revenue-row--total');
      }

      const label = document.createElement('span');
      label.className = 'summary-rev-label';
      label.textContent = row.label;

      const value = document.createElement('span');
      value.className = 'summary-rev-value';
      value.textContent = `$${Math.abs(row.value)}`;
      if (row.color) {
        value.style.color = row.color;
        value.style.textShadow = `0 0 6px ${row.color}88`;
      }
      if (idx === 1) {
        value.textContent = `-$${Math.abs(row.value)}`;
      }

      rowEl.appendChild(label);
      rowEl.appendChild(value);
      box.appendChild(rowEl);
    });

    return box;
  }

  private buildGrillStats(stats: GrillStats): HTMLElement {
    const el = document.createElement('div');
    el.className = 'summary-grill-stats';

    const title = document.createElement('div');
    title.className = 'summary-section-title';
    title.textContent = '烤制統計';
    el.appendChild(title);

    const statsRow = document.createElement('div');
    statsRow.className = 'summary-grill-row';

    const items = [
      { label: '完美', count: stats.perfect, emoji: '✨' },
      { label: '普通', count: stats.ok, emoji: '' },
      { label: '半生', count: stats.raw, emoji: '' },
      { label: '焦', count: stats.burnt, emoji: '' },
    ];

    items.forEach(item => {
      const chip = document.createElement('span');
      chip.className = 'summary-grill-chip';
      chip.textContent = `${item.label}${item.emoji} ×${item.count}`;
      statsRow.appendChild(chip);
    });

    el.appendChild(statsRow);
    return el;
  }

  private buildTerritoryRow(): HTMLElement {
    const playerSlots = GRID_SLOTS.filter(s => gameState.map[s.id] === 'player').length;
    const totalSlots = GRID_SLOTS.length;

    const el = document.createElement('div');
    el.className = 'summary-territory';
    el.textContent = `版圖：${playerSlots} / ${totalSlots} 格`;
    return el;
  }

  private buildReview(salesLog: SaleRecord[]): HTMLElement {
    const el = document.createElement('div');
    el.className = 'summary-review';

    let review: string;
    if (salesLog.length === 0) {
      review = '今天沒有客人，攤位像鬧鬼一樣安靜';
    } else {
      review = CUSTOMER_REVIEWS[Math.floor(Math.random() * CUSTOMER_REVIEWS.length)];
    }

    el.textContent = `「${review}」`;
    return el;
  }

  getElement(): HTMLElement {
    return this.panel;
  }
}

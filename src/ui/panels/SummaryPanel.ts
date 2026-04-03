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
  'half-cooked': number;
  'slightly-burnt': number;
  carbonized: number;
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

    // Revenue + grill stats side by side (flex row)
    const revenueBox = this.buildRevenueBox(dailyReport);
    const grillStatsEl = this.buildGrillStats(grillStats);

    const flexRow = document.createElement('div');
    flexRow.style.cssText = 'display:flex; gap:12px;';
    revenueBox.style.flex = '1';
    grillStatsEl.style.flex = '1';
    flexRow.appendChild(revenueBox);
    flexRow.appendChild(grillStatsEl);
    this.panel.appendChild(flexRow);

    // Slot tier info
    const slotInfoEl = this.buildSlotInfo(dailyReport.day);
    this.panel.appendChild(slotInfoEl);

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

    // Order scores summary
    if (gameState.dailyOrderScores.length > 0) {
      const orderScoresEl = this.buildOrderScores();
      this.panel.appendChild(orderScoresEl);
    }

    // Chaos log (only shown if there were chaos actions today)
    if (gameState.dailyChaosActions.length > 0) {
      const chaosLog = document.createElement('div');
      chaosLog.className = 'chaos-log';

      const chaosTitle = document.createElement('h3');
      chaosTitle.textContent = '🌀 今日騷操作紀錄';
      chaosLog.appendChild(chaosTitle);

      gameState.dailyChaosActions.forEach(action => {
        const entryEl = document.createElement('div');
        entryEl.className = 'chaos-entry';
        entryEl.style.color = '#cc88ff';
        entryEl.textContent = `› ${action}`;
        chaosLog.appendChild(entryEl);
      });

      const totalEl = document.createElement('div');
      totalEl.className = 'chaos-total';
      totalEl.style.fontWeight = 'bold';
      totalEl.textContent = `累積混沌指數：${gameState.chaosCount} pts`;
      chaosLog.appendChild(totalEl);

      this.panel.appendChild(chaosLog);
    }

    // Dual reputation status
    const dualRep = document.createElement('div');
    dualRep.className = 'dual-rep';

    const officialRepEl = document.createElement('div');
    officialRepEl.textContent = `⭐ 官方聲望：${gameState.reputation}/100`;
    dualRep.appendChild(officialRepEl);

    const undergroundRepEl = document.createElement('div');
    undergroundRepEl.textContent = `💀 地下聲望：${gameState.undergroundRep}/100`;
    dualRep.appendChild(undergroundRepEl);

    if (gameState.reputation > 70 && gameState.undergroundRep > 70 && gameState.reputationCrisisDay < 0) {
      const warningEl = document.createElement('div');
      warningEl.style.color = '#ff4444';
      warningEl.textContent = '⚠️ 警告：記者正在追查你的雙面人生...';
      dualRep.appendChild(warningEl);
    }

    this.panel.appendChild(dualRep);

    // Button
    const btnCenter = document.createElement('div');
    btnCenter.className = 'btn-center';
    btnCenter.style.marginTop = '8px';

    const btn = document.createElement('button');
    btn.className = 'btn-neon';
    btn.textContent = '迎接明天';
    btn.addEventListener('click', () => {
      EventBus.emit('summary-done', {});
    });
    btnCenter.appendChild(btn);
    this.panel.appendChild(btnCenter);
  }

  private buildOrderScores(): HTMLElement {
    const scores = gameState.dailyOrderScores;

    // Calculate averages
    const count = scores.length;
    const avgGrill = Math.round(scores.reduce((s, o) => s + o.grillScore, 0) / count);
    const avgWarming = Math.round(scores.reduce((s, o) => s + o.warmingScore, 0) / count);
    const avgCondiment = Math.round(scores.reduce((s, o) => s + o.condimentScore, 0) / count);
    const avgWait = Math.round(scores.reduce((s, o) => s + o.waitScore, 0) / count);
    const avgTotal = Math.round(scores.reduce((s, o) => s + o.totalScore, 0) / count);
    const totalTips = scores.reduce((s, o) => s + o.tipAmount, 0);

    // Star distribution
    const starDist = [5, 4, 3, 2, 1].map(star => ({
      star,
      count: scores.filter(o => o.stars === star).length,
    }));

    // Average star rating (weighted)
    const avgStars = scores.reduce((s, o) => s + o.stars, 0) / count;
    const avgStarsRounded = Math.round(avgStars);

    const starString = (n: number): string => '★'.repeat(n) + '☆'.repeat(5 - n);

    const starColors: Record<number, string> = {
      5: '#ffcc00',
      4: '#44ff44',
      3: '#44aaff',
      2: '#ff8844',
      1: '#ff4444',
    };

    // Build bar string for distribution (5 filled blocks max)
    const maxCount = Math.max(...starDist.map(d => d.count), 1);
    const buildBar = (c: number): string => {
      const filled = Math.round((c / maxCount) * 5);
      return '█'.repeat(filled) + '░'.repeat(5 - filled);
    };

    const section = document.createElement('div');
    section.className = 'summary-grill-stats';
    section.style.marginTop = '4px';

    // Section title
    const title = document.createElement('div');
    title.className = 'summary-section-title';
    title.textContent = '🌟 今日服務評分';
    section.appendChild(title);

    // Average score row
    const avgRow = document.createElement('div');
    avgRow.className = 'summary-revenue-row';
    avgRow.style.marginBottom = '4px';

    const avgLabel = document.createElement('span');
    avgLabel.className = 'summary-rev-label';
    avgLabel.textContent = '平均評分';

    const avgValue = document.createElement('span');
    avgValue.className = 'summary-rev-value';
    avgValue.style.color = starColors[avgStarsRounded] ?? '#ffffff';
    avgValue.style.textShadow = `0 0 6px ${starColors[avgStarsRounded] ?? '#ffffff'}88`;
    avgValue.textContent = `${starString(avgStarsRounded)} (${avgTotal}分)`;

    avgRow.appendChild(avgLabel);
    avgRow.appendChild(avgValue);
    section.appendChild(avgRow);

    // Total tips row
    const tipsRow = document.createElement('div');
    tipsRow.className = 'summary-revenue-row';
    tipsRow.style.marginBottom = '4px';

    const tipsLabel = document.createElement('span');
    tipsLabel.className = 'summary-rev-label';
    tipsLabel.textContent = '總小費收入';

    const tipsValue = document.createElement('span');
    tipsValue.className = 'summary-rev-value';
    tipsValue.style.color = '#39ff14';
    tipsValue.style.textShadow = '0 0 6px #39ff1488';
    tipsValue.textContent = `$${totalTips}`;

    tipsRow.appendChild(tipsLabel);
    tipsRow.appendChild(tipsValue);
    section.appendChild(tipsRow);

    // Sub-scores grid title
    const subTitle = document.createElement('div');
    subTitle.style.fontSize = '11px';
    subTitle.style.color = '#aaaaaa';
    subTitle.style.marginBottom = '4px';
    subTitle.textContent = '📊 各項平均';
    section.appendChild(subTitle);

    // Sub-scores grid (2x2)
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = '1fr 1fr';
    grid.style.gap = '2px 12px';
    grid.style.fontSize = '12px';
    grid.style.marginBottom = '4px';
    grid.style.paddingLeft = '8px';

    const subScores = [
      { icon: '🔥', label: '烤功', value: avgGrill },
      { icon: '🌶️', label: '配料', value: avgCondiment },
      { icon: '♨️', label: '保溫', value: avgWarming },
      { icon: '⏱', label: '等待', value: avgWait },
    ];

    subScores.forEach(item => {
      const cell = document.createElement('div');
      cell.style.color = '#cccccc';
      cell.textContent = `${item.icon} ${item.label}：${item.value}`;
      grid.appendChild(cell);
    });

    section.appendChild(grid);

    // Star distribution title
    const distTitle = document.createElement('div');
    distTitle.style.fontSize = '11px';
    distTitle.style.color = '#aaaaaa';
    distTitle.style.marginBottom = '4px';
    distTitle.textContent = '⭐ 評分分布';
    section.appendChild(distTitle);

    // Star distribution rows
    starDist.forEach(({ star, count: c }) => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '6px';
      row.style.fontSize = '12px';
      row.style.marginBottom = '2px';
      row.style.paddingLeft = '8px';

      const starEl = document.createElement('span');
      starEl.style.color = starColors[star];
      starEl.style.minWidth = '72px';
      starEl.style.fontFamily = 'monospace';
      starEl.textContent = starString(star);

      const barEl = document.createElement('span');
      barEl.style.color = starColors[star];
      barEl.style.fontFamily = 'monospace';
      barEl.style.letterSpacing = '1px';
      barEl.textContent = buildBar(c);

      const countEl = document.createElement('span');
      countEl.style.color = '#888888';
      countEl.textContent = `${c} 單`;

      row.appendChild(starEl);
      row.appendChild(barEl);
      row.appendChild(countEl);
      section.appendChild(row);
    });

    return section;
  }

  private buildSlotInfo(day: number): HTMLElement {
    const slot = gameState.playerSlot || 1;
    const slotData = GRID_SLOTS.find(s => s.tier === slot) || GRID_SLOTS[0];

    const el = document.createElement('div');
    el.className = 'summary-revenue-box';
    el.style.borderColor = '#4455aa';

    const title = document.createElement('div');
    title.className = 'summary-section-title';
    title.textContent = '📍 攤位位置';
    el.appendChild(title);

    const tileNum = String(slot + 1).padStart(2, '0');
    const tileImg = document.createElement('img');
    tileImg.src = `map-tile-${tileNum}.png`;
    tileImg.style.cssText = 'width:44px; height:44px; object-fit:cover; border-radius:4px; margin-right:6px; display:block; margin-bottom:4px;';
    el.appendChild(tileImg);

    const locationRow = document.createElement('div');
    locationRow.className = 'summary-revenue-row';
    const locationLabel = document.createElement('span');
    locationLabel.className = 'summary-rev-label';
    locationLabel.textContent = `第 ${slot} 層 / 9`;
    const locationValue = document.createElement('span');
    locationValue.className = 'summary-rev-value';
    locationValue.style.color = '#aabbff';
    locationValue.textContent = `${slotData.emoji} ${slotData.name}`;
    locationRow.appendChild(locationLabel);
    locationRow.appendChild(locationValue);
    el.appendChild(locationRow);

    const trafficRow = document.createElement('div');
    trafficRow.className = 'summary-revenue-row';
    const trafficLabel = document.createElement('span');
    trafficLabel.className = 'summary-rev-label';
    trafficLabel.textContent = '👥 人流加成';
    const trafficValue = document.createElement('span');
    trafficValue.className = 'summary-rev-value';
    trafficValue.style.color = '#39ff14';
    trafficValue.textContent = `×${slotData.trafficMultiplier.toFixed(2)}`;
    trafficRow.appendChild(trafficLabel);
    trafficRow.appendChild(trafficValue);
    el.appendChild(trafficRow);

    if (day % 2 === 0) {
      const battleHint = document.createElement('div');
      battleHint.style.cssText = 'margin-top: 4px; color: #ff8844; font-size: 12px; text-align: center;';
      battleHint.textContent = '⚔️ 明天可發起換位血戰！';
      el.appendChild(battleHint);
    }

    return el;
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
      { label: '半熟', count: stats['half-cooked'] ?? 0, emoji: '' },
      { label: '微焦', count: stats['slightly-burnt'] ?? 0, emoji: '' },
      { label: '半生', count: stats.raw, emoji: '' },
      { label: '焦', count: stats.burnt, emoji: '' },
      { label: '碳化', count: stats.carbonized ?? 0, emoji: '' },
    ];

    items.forEach(item => {
      const chip = document.createElement('span');
      chip.className = 'summary-grill-chip';
      chip.textContent = `${item.label}${item.emoji} ×${item.count}`;
      statsRow.appendChild(chip);
    });

    el.appendChild(statsRow);

    // Waste report
    const waste = gameState.dailyWaste;
    if (waste && (waste.grillRemaining > 0 || waste.warmingRemaining > 0)) {
      const wasteEl = document.createElement('div');
      wasteEl.className = 'summary-grill-row';
      wasteEl.style.marginTop = '3px';
      wasteEl.style.color = '#ff9944';
      wasteEl.style.fontSize = '12px';
      wasteEl.textContent = `今日浪費：烤架殘留 ${waste.grillRemaining} 根 + 保溫區冷掉 ${waste.warmingRemaining} 根`;
      el.appendChild(wasteEl);
    }

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

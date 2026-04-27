import { EventBus } from '../../utils/EventBus';
import { gameState } from '../../state/GameState';
import type { DailyRhythmStats } from '../../state/GameState';
import type { DailySummary, SaleRecord } from '../../types';

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

export class SummaryPanel {
  private panel: HTMLElement;

  constructor(data: SummaryData) {
    this.panel = document.createElement('div');
    this.panel.className = 'game-panel ui-interactive summary-panel';

    const titleEl = document.createElement('div');
    titleEl.className = 'panel-title neon-flicker';
    titleEl.textContent = '收攤結算';
    this.panel.appendChild(titleEl);

    const dayHeader = document.createElement('div');
    dayHeader.className = 'summary-day-header';
    dayHeader.textContent = `Day ${data.dailyReport.day} 烤感成績`;
    this.panel.appendChild(dayHeader);

    this.panel.appendChild(this.buildRhythmMasteryPanel(gameState.dailyRhythmStats, data.dailyReport, data.salesLog.length));

    const nextWrap = document.createElement('div');
    nextWrap.className = 'btn-center';
    nextWrap.style.marginTop = '12px';

    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn-neon';
    nextBtn.textContent = '進入下一天';
    nextBtn.addEventListener('click', () => EventBus.emit('summary-done', {}));
    nextWrap.appendChild(nextBtn);
    this.panel.appendChild(nextWrap);
  }

  private buildRhythmMasteryPanel(
    stats: DailyRhythmStats | undefined,
    dailyReport: DailySummary,
    soldCount: number,
  ): HTMLElement {
    const hitStats = stats?.hitStats ?? { perfect: 0, great: 0, good: 0, miss: 0 };
    const total = Math.max(1, hitStats.perfect + hitStats.great + hitStats.good + hitStats.miss);
    const accuracy = Math.round((stats?.accuracy ?? 0) * 100);
    const masteryScore = Math.max(0, Math.round(
      (hitStats.perfect * 100 + hitStats.great * 82 + hitStats.good * 55 - hitStats.miss * 25) / total,
    ));
    const grade = stats?.grade ?? (masteryScore >= 90 ? 'S' : masteryScore >= 75 ? 'A' : masteryScore >= 60 ? 'B' : 'C');
    const titleByGrade: Record<string, string> = {
      S: '神手掌火',
      A: '穩定控火',
      B: '可出餐烤感',
      C: '節奏待練',
    };

    const section = document.createElement('div');
    section.className = 'summary-grill-stats';
    section.style.cssText = [
      'margin-top:12px',
      'padding:14px',
      'border-color:#ffbf40',
      'background:linear-gradient(135deg,rgba(255,128,32,0.16),rgba(20,10,4,0.92))',
    ].join(';');

    const title = document.createElement('div');
    title.className = 'summary-section-title';
    title.textContent = '節奏烤感結算';
    section.appendChild(title);

    const hero = document.createElement('div');
    hero.style.cssText = 'display:grid;grid-template-columns:96px 1fr;gap:12px;align-items:center;margin:10px 0 12px;';

    const badge = document.createElement('div');
    badge.textContent = grade;
    badge.style.cssText = [
      'height:86px',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'font-size:54px',
      'font-weight:900',
      'color:#ffd36a',
      'border:2px solid #ffb13b',
      'background:#210d03',
      'text-shadow:0 0 12px #ff7a18',
    ].join(';');

    const heroText = document.createElement('div');
    heroText.innerHTML = `
      <div style="font-size:20px;font-weight:800;color:#fff0c2;">${titleByGrade[grade]}</div>
      <div style="margin-top:4px;color:#ffcc88;">熟練度 ${masteryScore} / 100　命中率 ${accuracy}%　最高 COMBO ${stats?.maxCombo ?? 0}</div>
      <div style="margin-top:6px;color:#d9d1c2;">營收 $${dailyReport.revenue}　出餐 ${soldCount} 份　淨利 $${dailyReport.profit}</div>
    `;

    hero.appendChild(badge);
    hero.appendChild(heroText);
    section.appendChild(hero);

    const rows: Array<[string, number, string, string]> = [
      ['PERFECT', hitStats.perfect, '完美火候：最快推進熟度，最穩定進保溫區', '#ffd36a'],
      ['GREAT', hitStats.great, '穩定掌火：有效加速烤製，維持出餐節奏', '#7cffb2'],
      ['GOOD', hitStats.good, '勉強補拍：小幅加熱，但熟度控制較不穩', '#80c8ff'],
      ['MISS', hitStats.miss, '漏拍空燒：不加熱，容易讓烤網壓力累積', '#ff6b6b'],
    ];

    for (const [label, value, desc, color] of rows) {
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:92px 42px 1fr;gap:8px;align-items:center;padding:7px 0;border-top:1px solid rgba(255,255,255,0.1);';
      row.innerHTML = `<strong style="color:${color};">${label}</strong><span style="color:#fff;font-weight:800;text-align:right;">${value}</span><span style="color:#d8d2c8;">${desc}</span>`;
      section.appendChild(row);
    }

    return section;
  }

  getElement(): HTMLElement {
    return this.panel;
  }

  destroy(): void {
    this.panel.remove();
  }
}

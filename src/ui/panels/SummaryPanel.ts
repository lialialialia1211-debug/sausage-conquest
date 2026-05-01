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

type SummaryGrade = 'A' | 'B' | 'C' | 'D';

export class SummaryPanel {
  private panel: HTMLElement;

  constructor(data: SummaryData) {
    this.panel = document.createElement('div');
    this.panel.className = 'game-panel ui-interactive summary-panel';

    const titleEl = document.createElement('div');
    titleEl.className = 'panel-title neon-flicker';
    titleEl.textContent = '今日收攤';
    this.panel.appendChild(titleEl);

    const dayHeader = document.createElement('div');
    dayHeader.className = 'summary-day-header';
    dayHeader.textContent = `Day ${data.dailyReport.day} 烤香腸熟練度`;
    this.panel.appendChild(dayHeader);

    this.panel.appendChild(this.buildRhythmMasteryPanel(
      gameState.dailyRhythmStats,
      data.dailyReport,
      data.salesLog.length,
    ));

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
    const grade = (stats?.grade ?? (
      masteryScore >= 90 ? 'A' :
      masteryScore >= 75 ? 'B' :
      masteryScore >= 60 ? 'C' : 'D'
    )) as SummaryGrade;

    const titleByGrade: Record<SummaryGrade, string> = {
      A: '傳說烤手',
      B: '熟練攤主',
      C: '還能出餐',
      D: '需要補烤',
    };

    const imageByGrade: Record<SummaryGrade, string> = {
      A: 'ui/summary-grade-a.png',
      B: 'ui/summary-grade-b.png',
      C: 'ui/summary-grade-c.png',
      D: 'ui/summary-grade-d.png',
    };

    const section = document.createElement('div');
    section.className = 'summary-grill-stats summary-grade-panel';
    section.style.cssText = [
      'margin-top:12px',
      'padding:14px',
      'border-color:#ffbf40',
      'background:linear-gradient(135deg,rgba(255,128,32,0.16),rgba(20,10,4,0.92))',
    ].join(';');

    const title = document.createElement('div');
    title.className = 'summary-section-title';
    title.textContent = '節奏打擊對應熟練度';
    section.appendChild(title);

    const hero = document.createElement('div');
    hero.className = 'summary-grade-hero';
    hero.style.cssText = [
      'display:grid',
      'grid-template-columns:minmax(220px,320px) 1fr',
      'gap:16px',
      'align-items:center',
      'margin:10px 0 12px',
    ].join(';');

    const gradeArt = document.createElement('img');
    gradeArt.src = imageByGrade[grade];
    gradeArt.alt = `${grade} rank`;
    gradeArt.style.cssText = [
      'width:100%',
      'max-height:220px',
      'object-fit:contain',
      'filter:drop-shadow(0 0 16px rgba(255,122,24,0.42))',
    ].join(';');

    const heroText = document.createElement('div');
    heroText.innerHTML = `
      <div style="font-size:24px;font-weight:900;color:#fff0c2;">${titleByGrade[grade]} <span style="color:#ffd36a;">${grade}</span></div>
      <div style="margin-top:6px;color:#ffcc88;">熟練度 ${masteryScore} / 100 ｜ 節奏準度 ${accuracy}% ｜ 最大 COMBO ${stats?.maxCombo ?? 0}</div>
      <div style="margin-top:8px;color:#d9d1c2;">營收 $${dailyReport.revenue} ｜ 售出 ${soldCount} 根 ｜ 淨利 $${dailyReport.profit}</div>
    `;

    hero.append(gradeArt, heroText);
    section.appendChild(hero);

    const rows: Array<[string, number, string, string]> = [
      ['PERFECT', hitStats.perfect, '火候與節奏完全命中，熟度提升最穩。', '#ffd36a'],
      ['GREAT', hitStats.great, '節奏接近完美，烤網運轉維持順暢。', '#7cffb2'],
      ['GOOD', hitStats.good, '有成功出手，但火候控制較保守。', '#80c8ff'],
      ['MISS', hitStats.miss, '錯過音符，代表空拍、失誤或出餐節奏斷裂。', '#ff6b6b'],
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

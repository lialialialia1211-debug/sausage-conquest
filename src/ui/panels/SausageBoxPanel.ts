// SausageBoxPanel — 摸香腸箱小遊戲 HTML panel (pure DOM, no Phaser)
import { EventBus } from '../../utils/EventBus';
import { addMoney } from '../../state/GameState';

// --- Slot prize definitions ---
interface SlotPrize {
  emoji: string;
  label: string;
  probability: number;
  colorClass: string;
}

const PRIZES: SlotPrize[] = [
  { emoji: '🌭', label: '再來一根', probability: 0.15, colorClass: 'prize-gold' },
  { emoji: '🏷️', label: '折價券',   probability: 0.25, colorClass: 'prize-blue' },
  { emoji: '💩', label: '謝謝惠顧', probability: 0.60, colorClass: 'prize-gray' },
];

function drawPrize(): SlotPrize {
  const rand = Math.random();
  let cumulative = 0;
  for (const prize of PRIZES) {
    cumulative += prize.probability;
    if (rand < cumulative) return prize;
  }
  return PRIZES[PRIZES.length - 1];
}

// --- Style injection (runs once) ---
const STYLE_ID = 'sausage-box-panel-styles';

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .sausage-box-panel {
      min-width: 340px;
      max-width: 400px;
    }

    .sausage-box-title {
      font-size: 1.4rem;
      font-weight: bold;
      text-align: center;
      color: #ffd700;
      text-shadow: 0 0 10px #ffd700, 0 0 20px #ff8800;
      margin-bottom: 8px;
      letter-spacing: 2px;
    }

    .sausage-box-subtitle {
      text-align: center;
      color: #ccc;
      font-size: 0.85rem;
      margin-bottom: 20px;
    }

    .slot-row {
      display: flex;
      justify-content: center;
      gap: 16px;
      margin-bottom: 24px;
    }

    .slot-card {
      width: 80px;
      height: 100px;
      perspective: 600px;
    }

    .slot-card-inner {
      position: relative;
      width: 100%;
      height: 100%;
      transform-style: preserve-3d;
      transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .slot-card-inner.flipped {
      transform: rotateY(180deg);
    }

    .slot-face,
    .slot-back {
      position: absolute;
      width: 100%;
      height: 100%;
      backface-visibility: hidden;
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
      border: 2px solid #444;
    }

    .slot-back {
      background: linear-gradient(135deg, #2a2a3e, #1a1a2e);
      border-color: #555;
      color: #888;
      font-size: 1.8rem;
    }

    .slot-face {
      background: linear-gradient(135deg, #1e1e2e, #12122a);
      transform: rotateY(180deg);
      gap: 6px;
    }

    .slot-face-emoji {
      font-size: 2rem;
      line-height: 1;
    }

    .slot-face-label {
      font-size: 0.65rem;
      text-align: center;
      line-height: 1.2;
      padding: 0 4px;
    }

    .prize-gold .slot-face {
      border-color: #ffd700;
      box-shadow: 0 0 12px rgba(255, 215, 0, 0.5);
    }
    .prize-gold .slot-face-label { color: #ffd700; }

    .prize-blue .slot-face {
      border-color: #4dabf7;
      box-shadow: 0 0 12px rgba(77, 171, 247, 0.5);
    }
    .prize-blue .slot-face-label { color: #4dabf7; }

    .prize-gray .slot-face {
      border-color: #555;
    }
    .prize-gray .slot-face-label { color: #888; }

    .sausage-box-open-btn {
      display: block;
      margin: 0 auto 16px;
      padding: 12px 32px;
      font-size: 1.1rem;
      font-weight: bold;
      background: linear-gradient(135deg, #ff6b35, #ff3d00);
      color: #fff;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      letter-spacing: 1px;
      box-shadow: 0 0 16px rgba(255, 107, 53, 0.6);
      transition: opacity 0.2s, transform 0.1s;
    }

    .sausage-box-open-btn:hover:not(:disabled) {
      opacity: 0.9;
      transform: scale(1.04);
    }

    .sausage-box-open-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
      transform: none;
    }

    .sausage-box-result {
      margin-top: 12px;
      padding: 12px 16px;
      border-radius: 8px;
      background: rgba(255,255,255,0.05);
      border: 1px solid #333;
    }

    .sausage-box-result-title {
      text-align: center;
      font-weight: bold;
      font-size: 1rem;
      color: #fff;
      margin-bottom: 8px;
    }

    .sausage-box-result-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.82rem;
      color: #bbb;
      margin-bottom: 4px;
      gap: 8px;
    }

    .sausage-box-result-row span:last-child {
      font-weight: bold;
    }

    .sausage-box-continue-btn {
      display: block;
      margin: 16px auto 0;
      padding: 10px 28px;
      font-size: 1rem;
      background: linear-gradient(135deg, #22c55e, #16a34a);
      color: #fff;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      letter-spacing: 1px;
      box-shadow: 0 0 12px rgba(34, 197, 94, 0.4);
      transition: opacity 0.2s, transform 0.1s;
    }

    .sausage-box-continue-btn:hover {
      opacity: 0.9;
      transform: scale(1.04);
    }

    @keyframes slot-shake {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-4px) rotate(-2deg); }
      40% { transform: translateX(4px) rotate(2deg); }
      60% { transform: translateX(-3px) rotate(-1deg); }
      80% { transform: translateX(3px) rotate(1deg); }
    }

    .slot-card.shaking .slot-card-inner {
      animation: slot-shake 0.4s ease;
    }
  `;
  document.head.appendChild(style);
}

// --- Panel class ---

export class SausageBoxPanel {
  private panel: HTMLElement;
  private openBtn!: HTMLButtonElement;
  private slotInners: HTMLElement[] = [];
  private prizes: SlotPrize[] = [];
  private resultSection!: HTMLElement;
  private continueBtn!: HTMLButtonElement;
  private timeoutIds: number[] = [];

  constructor() {
    injectStyles();

    this.panel = document.createElement('div');
    this.panel.className = 'game-panel ui-interactive sausage-box-panel';

    this.buildUI();
  }

  private buildUI(): void {
    // Title
    const titleEl = document.createElement('div');
    titleEl.className = 'sausage-box-title';
    titleEl.textContent = '🎰 摸香腸箱 🎰';
    this.panel.appendChild(titleEl);

    // Subtitle
    const subtitleEl = document.createElement('div');
    subtitleEl.className = 'sausage-box-subtitle';
    subtitleEl.textContent = '客人投入 $20，手氣決定一切！';
    this.panel.appendChild(subtitleEl);

    // Slot row
    const slotRow = document.createElement('div');
    slotRow.className = 'slot-row';

    this.prizes = [drawPrize(), drawPrize(), drawPrize()];
    this.slotInners = [];

    for (let i = 0; i < 3; i++) {
      const card = document.createElement('div');
      card.className = 'slot-card';

      const inner = document.createElement('div');
      inner.className = 'slot-card-inner';

      // Back face (shown first — the "?" side)
      const back = document.createElement('div');
      back.className = 'slot-back';
      back.textContent = '？';

      // Front face (prize side, initially hidden)
      const prize = this.prizes[i];
      const face = document.createElement('div');
      face.className = `slot-face ${prize.colorClass}`;

      const emojiEl = document.createElement('span');
      emojiEl.className = 'slot-face-emoji';
      emojiEl.textContent = prize.emoji;

      const labelEl = document.createElement('span');
      labelEl.className = 'slot-face-label';
      labelEl.textContent = prize.label;

      face.appendChild(emojiEl);
      face.appendChild(labelEl);

      inner.appendChild(back);
      inner.appendChild(face);
      card.appendChild(inner);
      slotRow.appendChild(card);

      this.slotInners.push(inner);
    }

    this.panel.appendChild(slotRow);

    // Open button
    this.openBtn = document.createElement('button');
    this.openBtn.className = 'sausage-box-open-btn';
    this.openBtn.textContent = '🤞 開箱！';
    this.openBtn.addEventListener('click', this.onOpen);
    this.panel.appendChild(this.openBtn);

    // Result section (hidden until reveal)
    this.resultSection = document.createElement('div');
    this.resultSection.className = 'sausage-box-result';
    this.resultSection.style.display = 'none';
    this.panel.appendChild(this.resultSection);
  }

  private onOpen = (): void => {
    this.openBtn.disabled = true;

    // Collect money immediately when customer plays
    addMoney(20);

    // Reveal slots one by one with 500ms stagger + shake effect
    this.slotInners.forEach((inner, index) => {
      this.timeoutIds.push(window.setTimeout(() => {
        const card = inner.parentElement;
        if (card) {
          card.classList.add('shaking');
          this.timeoutIds.push(window.setTimeout(() => card.classList.remove('shaking'), 400) as unknown as number);
        }
        this.timeoutIds.push(window.setTimeout(() => {
          inner.classList.add('flipped');
          if (index === this.slotInners.length - 1) {
            // All slots revealed — show results
            this.timeoutIds.push(window.setTimeout(() => this.showResult(), 400) as unknown as number);
          }
        }, 200) as unknown as number);
      }, index * 500) as unknown as number);
    });
  };

  private showResult(): void {
    this.resultSection.style.display = '';

    // Clear previous content
    while (this.resultSection.firstChild) {
      this.resultSection.removeChild(this.resultSection.firstChild);
    }

    const titleEl = document.createElement('div');
    titleEl.className = 'sausage-box-result-title';
    titleEl.textContent = '本次結果';
    this.resultSection.appendChild(titleEl);

    // Count results
    const counts: Record<string, number> = {};
    for (const prize of this.prizes) {
      counts[prize.label] = (counts[prize.label] ?? 0) + 1;
    }

    // Build description lines per prize type
    const summaryLines = this.buildSummaryLines();
    for (const line of summaryLines) {
      const row = document.createElement('div');
      row.className = 'sausage-box-result-row';

      const labelSpan = document.createElement('span');
      labelSpan.textContent = line.label;

      const valueSpan = document.createElement('span');
      valueSpan.textContent = line.value;
      valueSpan.style.color = line.color;

      row.appendChild(labelSpan);
      row.appendChild(valueSpan);
      this.resultSection.appendChild(row);
    }

    // Continue button
    this.continueBtn = document.createElement('button');
    this.continueBtn.className = 'sausage-box-continue-btn';
    this.continueBtn.textContent = '繼續營業 ▶';
    this.continueBtn.addEventListener('click', this.onContinue);
    this.resultSection.appendChild(this.continueBtn);
  }

  private buildSummaryLines(): Array<{ label: string; value: string; color: string }> {
    const lines: Array<{ label: string; value: string; color: string }> = [];

    // Revenue line — always show
    lines.push({ label: '💰 收入', value: '+$20', color: '#ffd700' });

    // Prize effects
    const hasFree = this.prizes.some(p => p.emoji === '🌭');
    const hasDiscount = this.prizes.some(p => p.emoji === '🏷️');
    const allNothing = this.prizes.every(p => p.emoji === '💩');

    if (allNothing) {
      lines.push({ label: '🎯 中獎結果', value: '全部謝謝惠顧', color: '#888' });
    } else {
      if (hasFree) {
        lines.push({ label: '🌭 再來一根', value: '下位客人免費加一根', color: '#ffd700' });
      }
      if (hasDiscount) {
        lines.push({ label: '🏷️ 折價券', value: '下位客人半價', color: '#4dabf7' });
      }
    }

    return lines;
  }

  private onContinue = (): void => {
    EventBus.emit('sausagebox-done', {});
  };

  getElement(): HTMLElement {
    return this.panel;
  }

  destroy(): void {
    this.timeoutIds.forEach(id => clearTimeout(id));
    this.timeoutIds = [];
    this.openBtn.removeEventListener('click', this.onOpen);
    if (this.continueBtn) {
      this.continueBtn.removeEventListener('click', this.onContinue);
    }
  }
}

// SausageBoxPanel — 摸香腸箱小遊戲 HTML panel (pure DOM, no Phaser)
import { EventBus } from '../../utils/EventBus';
import { addMoney, gameState, updateGameState } from '../../state/GameState';

// --- Slot prize definitions ---
interface SlotPrize {
  emoji: string;
  label: string;
  probability: number;
  colorClass: string;
  effectDesc: string;         // shown after reveal
  applyEffect?: () => void;   // side-effect when drawn
}

const FUNNY_NOTHING_TEXTS = [
  '人生如此，老闆辛苦了',
  '謝謝光臨，下次再來',
  '今天手氣不好，明天繼續',
  '香腸都送給上帝了',
  '老天爺說：不行',
];

function randomNothing(): string {
  return FUNNY_NOTHING_TEXTS[Math.floor(Math.random() * FUNNY_NOTHING_TEXTS.length)];
}

const PRIZES: SlotPrize[] = [
  {
    emoji: '',
    label: '再來一根',
    probability: 0.10,
    colorClass: 'prize-gold',
    effectDesc: '庫存加 1 根隨機香腸！',
    applyEffect: () => {
      const types = gameState.unlockedSausages;
      if (types.length > 0) {
        const pick = types[Math.floor(Math.random() * types.length)];
        const inv = { ...gameState.inventory };
        inv[pick] = (inv[pick] ?? 0) + 1;
        updateGameState({ inventory: inv });
      }
    },
  },
  {
    emoji: '',
    label: '小金庫',
    probability: 0.15,
    colorClass: 'prize-blue',
    effectDesc: '',   // filled in dynamically
    applyEffect: () => {
      const amount = 30 + Math.floor(Math.random() * 51); // $30–$80
      addMoney(amount);
      // Patch effectDesc at runtime via a tag on the prize object
      (PRIZES[1] as any).__lastAmount = amount;
    },
  },
  {
    emoji: '',
    label: '精準之眼',
    probability: 0.10,
    colorClass: 'prize-purple',
    effectDesc: '接下來 3 次出餐自動滿分！',
    applyEffect: () => {
      (gameState as any).autoPerfectServes = ((gameState as any).autoPerfectServes ?? 0) + 3;
    },
  },
  {
    emoji: '',
    label: '火力全開',
    probability: 0.10,
    colorClass: 'prize-red',
    effectDesc: '下次烤架熱度提升速率 +50%！',
    applyEffect: () => {
      (gameState as any).heatRateBonus = ((gameState as any).heatRateBonus ?? 0) + 0.5;
    },
  },
  {
    emoji: '',
    label: '謝謝惠顧',
    probability: 0.55,
    colorClass: 'prize-gray',
    effectDesc: '',   // filled in dynamically per draw
  },
];

interface DrawnPrize extends SlotPrize {
  resolvedEffectDesc: string;
}

function drawPrize(): DrawnPrize {
  const rand = Math.random();
  let cumulative = 0;
  for (const prize of PRIZES) {
    cumulative += prize.probability;
    if (rand < cumulative) {
      // Resolve dynamic descriptions before returning
      let desc = prize.effectDesc;
      if (prize.label === '謝謝惠顧') {
        desc = randomNothing();
      }
      return { ...prize, resolvedEffectDesc: desc };
    }
  }
  const last = PRIZES[PRIZES.length - 1];
  return { ...last, resolvedEffectDesc: randomNothing() };
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

    .prize-purple .slot-face {
      border-color: #b57bee;
      box-shadow: 0 0 12px rgba(181, 123, 238, 0.5);
    }
    .prize-purple .slot-face-label { color: #b57bee; }

    .prize-red .slot-face {
      border-color: #ff4444;
      box-shadow: 0 0 12px rgba(255, 68, 68, 0.5);
    }
    .prize-red .slot-face-label { color: #ff4444; }

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
  private prizes: DrawnPrize[] = [];
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
    titleEl.textContent = '摸香腸箱';
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
    this.openBtn.textContent = '開箱！';
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

    // Apply prize effects now (before reveal for state consistency)
    for (const prize of this.prizes) {
      if (prize.applyEffect) {
        try { prize.applyEffect(); } catch { /* ignore */ }
        // Resolve 小金庫 description after effect applied
        if (prize.label === '小金庫') {
          const amount = (PRIZES[1] as any).__lastAmount ?? '?';
          prize.resolvedEffectDesc = `獲得 $${amount} 現金！`;
        }
      }
    }

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
    lines.push({ label: '收入', value: '+$20', color: '#ffd700' });

    // Show each drawn prize's resolved effect description
    const colorMap: Record<string, string> = {
      'prize-gold': '#ffd700',
      'prize-blue': '#4dabf7',
      'prize-purple': '#b57bee',
      'prize-red': '#ff4444',
      'prize-gray': '#888',
    };

    const seen = new Set<string>();
    for (const prize of this.prizes) {
      const key = prize.label;
      if (seen.has(key)) continue;
      seen.add(key);
      const count = this.prizes.filter(p => p.label === key).length;
      const countPrefix = count > 1 ? `×${count} ` : '';
      lines.push({
        label: prize.label,
        value: `${countPrefix}${prize.resolvedEffectDesc}`,
        color: colorMap[prize.colorClass] ?? '#aaa',
      });
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

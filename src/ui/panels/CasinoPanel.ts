// CasinoPanel — underground casino DOM panel (pure DOM, no Phaser dependency)
import { EventBus } from '../../utils/EventBus';
import { gameState } from '../../state/GameState';
import { placeBet, getBetLimits } from '../../systems/CasinoEngine';
import type { CasinoBet } from '../../systems/CasinoEngine';

interface GameCardState {
  choice: 'big' | 'small' | 'high' | 'low' | null;
  slider: HTMLInputElement;
  sliderDisplay: HTMLElement;
}

export class CasinoPanel {
  private panel: HTMLElement;
  private moneyDisplay: HTMLElement | null = null;
  private resultOverlay: HTMLElement | null = null;

  // Per-game state
  private diceState: GameCardState | null = null;
  private trafficState: GameCardState | null = null;
  private allInSlider: HTMLInputElement | null = null;
  private allInSliderDisplay: HTMLElement | null = null;

  constructor() {
    this.panel = document.createElement('div');
    this.panel.className = 'game-panel ui-interactive casino-panel';

    // Badge
    const badge = document.createElement('div');
    badge.className = 'shop-item-name';
    badge.setAttribute('data-category', 'underground');
    badge.style.fontSize = '0.78em';
    badge.style.letterSpacing = '0.12em';
    badge.style.color = 'var(--text-dim)';
    badge.style.marginBottom = '4px';
    badge.textContent = '地下賭場';
    this.panel.appendChild(badge);

    // Title
    const titleEl = document.createElement('div');
    titleEl.className = 'panel-title neon-flicker';
    titleEl.textContent = '暗巷賭場';
    this.panel.appendChild(titleEl);

    // Subtitle
    const subtitleEl = document.createElement('div');
    subtitleEl.style.fontStyle = 'italic';
    subtitleEl.style.color = 'var(--text-dim)';
    subtitleEl.style.fontSize = '0.9em';
    subtitleEl.style.marginBottom = '14px';
    subtitleEl.textContent = '贏了是運氣，輸了是人生';
    this.panel.appendChild(subtitleEl);

    // Money display
    const moneyEl = document.createElement('div');
    moneyEl.className = 'shop-money-display';
    moneyEl.style.marginBottom = '16px';
    moneyEl.textContent = `手頭現金：$${gameState.money}`;
    this.moneyDisplay = moneyEl;
    this.panel.appendChild(moneyEl);

    // Game cards
    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'casino-cards-container';
    cardsContainer.style.display = 'flex';
    cardsContainer.style.flexDirection = 'column';
    cardsContainer.style.gap = '16px';

    cardsContainer.appendChild(this.buildDiceCard());
    cardsContainer.appendChild(this.buildTrafficCard());
    cardsContainer.appendChild(this.buildAllInCard());

    this.panel.appendChild(cardsContainer);

    // Result overlay (hidden initially)
    const overlay = this.buildResultOverlay();
    this.resultOverlay = overlay;
    this.panel.appendChild(overlay);

    // Leave button
    const leaveBtn = document.createElement('button');
    leaveBtn.className = 'btn-neon';
    leaveBtn.style.marginTop = '20px';
    leaveBtn.style.width = '100%';
    leaveBtn.textContent = '離開賭場';
    leaveBtn.addEventListener('click', () => {
      EventBus.emit('casino-done', {});
    });
    this.panel.appendChild(leaveBtn);
  }

  // ── Game Card 1: 骰子大小 ─────────────────────────────────────────────────

  private buildDiceCard(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'shop-item-card casino-game-card';
    card.style.flexDirection = 'column';
    card.style.gap = '12px';

    // Header row
    const headerEl = document.createElement('div');
    headerEl.style.display = 'flex';
    headerEl.style.justifyContent = 'space-between';
    headerEl.style.alignItems = 'center';

    const nameEl = document.createElement('div');
    nameEl.className = 'shop-item-name';
    nameEl.textContent = '骰子大小';

    const multiplierEl = document.createElement('div');
    multiplierEl.style.color = 'var(--color-success, #4caf50)';
    multiplierEl.style.fontWeight = 'bold';
    multiplierEl.textContent = '2x 賠率';

    headerEl.appendChild(nameEl);
    headerEl.appendChild(multiplierEl);

    // Description
    const descEl = document.createElement('div');
    descEl.className = 'shop-item-desc';
    descEl.textContent = '兩顆骰子，猜大小。簡單暴力。';

    // Choice buttons
    const choiceRow = document.createElement('div');
    choiceRow.style.display = 'flex';
    choiceRow.style.gap = '8px';

    let selectedChoice: 'big' | 'small' = 'big';

    const bigBtn = document.createElement('button');
    bigBtn.className = 'btn-neon casino-choice-btn casino-choice-btn--active';
    bigBtn.textContent = '大（7-12）';

    const smallBtn = document.createElement('button');
    smallBtn.className = 'btn-neon casino-choice-btn';
    smallBtn.textContent = '小（2-6）';

    bigBtn.addEventListener('click', () => {
      selectedChoice = 'big';
      bigBtn.classList.add('casino-choice-btn--active');
      smallBtn.classList.remove('casino-choice-btn--active');
      if (this.diceState) this.diceState.choice = 'big';
    });

    smallBtn.addEventListener('click', () => {
      selectedChoice = 'small';
      smallBtn.classList.add('casino-choice-btn--active');
      bigBtn.classList.remove('casino-choice-btn--active');
      if (this.diceState) this.diceState.choice = 'small';
    });

    choiceRow.appendChild(bigBtn);
    choiceRow.appendChild(smallBtn);

    // Bet slider
    const { sliderWrapper, slider, sliderDisplay } = this.buildBetSlider();

    this.diceState = { choice: 'big', slider, sliderDisplay };

    // Bet button
    const betBtn = document.createElement('button');
    betBtn.className = 'btn-neon';
    betBtn.textContent = '下注！';
    betBtn.addEventListener('click', () => {
      const bet: CasinoBet = {
        game: 'dice',
        amount: Number(slider.value),
        choice: selectedChoice,
      };
      this.resolveBet(bet);
    });

    card.appendChild(headerEl);
    card.appendChild(descEl);
    card.appendChild(choiceRow);
    card.appendChild(sliderWrapper);
    card.appendChild(betBtn);

    return card;
  }

  // ── Game Card 2: 猜客流 ───────────────────────────────────────────────────

  private buildTrafficCard(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'shop-item-card casino-game-card';
    card.style.flexDirection = 'column';
    card.style.gap = '12px';

    // Header row
    const headerEl = document.createElement('div');
    headerEl.style.display = 'flex';
    headerEl.style.justifyContent = 'space-between';
    headerEl.style.alignItems = 'center';

    const nameEl = document.createElement('div');
    nameEl.className = 'shop-item-name';
    nameEl.textContent = '猜客流';

    const multiplierEl = document.createElement('div');
    multiplierEl.style.color = 'var(--color-success, #4caf50)';
    multiplierEl.style.fontWeight = 'bold';
    multiplierEl.textContent = '3x 賠率';

    headerEl.appendChild(nameEl);
    headerEl.appendChild(multiplierEl);

    // Description
    const descEl = document.createElement('div');
    descEl.className = 'shop-item-desc';
    descEl.textContent = '猜明天客人多不多。你有那個直覺嗎？';

    // Choice buttons
    const choiceRow = document.createElement('div');
    choiceRow.style.display = 'flex';
    choiceRow.style.gap = '8px';

    let selectedChoice: 'high' | 'low' = 'high';

    const highBtn = document.createElement('button');
    highBtn.className = 'btn-neon casino-choice-btn casino-choice-btn--active';
    highBtn.textContent = '旺（客人多）';

    const lowBtn = document.createElement('button');
    lowBtn.className = 'btn-neon casino-choice-btn';
    lowBtn.textContent = '冷（客人少）';

    highBtn.addEventListener('click', () => {
      selectedChoice = 'high';
      highBtn.classList.add('casino-choice-btn--active');
      lowBtn.classList.remove('casino-choice-btn--active');
      if (this.trafficState) this.trafficState.choice = 'high';
    });

    lowBtn.addEventListener('click', () => {
      selectedChoice = 'low';
      lowBtn.classList.add('casino-choice-btn--active');
      highBtn.classList.remove('casino-choice-btn--active');
      if (this.trafficState) this.trafficState.choice = 'low';
    });

    choiceRow.appendChild(highBtn);
    choiceRow.appendChild(lowBtn);

    // Bet slider
    const { sliderWrapper, slider, sliderDisplay } = this.buildBetSlider();

    this.trafficState = { choice: 'high', slider, sliderDisplay };

    // Bet button
    const betBtn = document.createElement('button');
    betBtn.className = 'btn-neon';
    betBtn.textContent = '下注！';
    betBtn.addEventListener('click', () => {
      const bet: CasinoBet = {
        game: 'traffic-guess',
        amount: Number(slider.value),
        choice: selectedChoice,
      };
      this.resolveBet(bet);
    });

    card.appendChild(headerEl);
    card.appendChild(descEl);
    card.appendChild(choiceRow);
    card.appendChild(sliderWrapper);
    card.appendChild(betBtn);

    return card;
  }

  // ── Game Card 3: 全押梭哈 ─────────────────────────────────────────────────

  private buildAllInCard(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'shop-item-card casino-game-card';
    card.style.flexDirection = 'column';
    card.style.gap = '12px';
    card.style.borderColor = 'rgba(180, 0, 0, 0.6)';

    // Header row
    const headerEl = document.createElement('div');
    headerEl.style.display = 'flex';
    headerEl.style.justifyContent = 'space-between';
    headerEl.style.alignItems = 'center';

    const nameEl = document.createElement('div');
    nameEl.className = 'shop-item-name';
    nameEl.style.color = '#ff4444';
    nameEl.textContent = '全押梭哈';

    const multiplierEl = document.createElement('div');
    multiplierEl.style.color = '#ff4444';
    multiplierEl.style.fontWeight = 'bold';
    multiplierEl.textContent = '5x 或歸零';

    headerEl.appendChild(nameEl);
    headerEl.appendChild(multiplierEl);

    // Description
    const descEl = document.createElement('div');
    descEl.className = 'shop-item-desc';
    descEl.textContent = '20%機率5倍回報。80%機率血本無歸。勇者限定。';

    // Bet slider
    const { sliderWrapper, slider, sliderDisplay } = this.buildBetSlider();
    this.allInSlider = slider;
    this.allInSliderDisplay = sliderDisplay;

    // Bet button — danger styling
    const betBtn = document.createElement('button');
    betBtn.className = 'btn-neon';
    betBtn.style.borderColor = '#ff4444';
    betBtn.style.color = '#ff4444';
    betBtn.style.textShadow = '0 0 8px rgba(255, 68, 68, 0.7)';
    betBtn.style.boxShadow = '0 0 10px rgba(255, 68, 68, 0.3)';
    betBtn.textContent = '梭了！';
    betBtn.addEventListener('click', () => {
      const bet: CasinoBet = {
        game: 'all-in',
        amount: Number(slider.value),
      };
      this.resolveBet(bet);
    });

    card.appendChild(headerEl);
    card.appendChild(descEl);
    card.appendChild(sliderWrapper);
    card.appendChild(betBtn);

    return card;
  }

  // ── Shared bet slider ─────────────────────────────────────────────────────

  private buildBetSlider(): {
    sliderWrapper: HTMLElement;
    slider: HTMLInputElement;
    sliderDisplay: HTMLElement;
  } {
    const limits = getBetLimits();
    const initialValue = Math.max(limits.min, Math.min(500, limits.max));

    const wrapper = document.createElement('div');
    wrapper.className = 'loan-slider-wrapper';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'price-slider loan-slider';
    slider.min = String(limits.min);
    slider.max = String(limits.max);
    slider.step = '50';
    slider.value = String(initialValue);

    const displayEl = document.createElement('div');
    displayEl.className = 'loan-slider-display';
    displayEl.textContent = `下注金額：$${initialValue}`;

    slider.addEventListener('input', () => {
      displayEl.textContent = `下注金額：$${slider.value}`;
    });

    wrapper.appendChild(slider);
    wrapper.appendChild(displayEl);

    return { sliderWrapper: wrapper, slider, sliderDisplay: displayEl };
  }

  // ── Result overlay ────────────────────────────────────────────────────────

  private buildResultOverlay(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'casino-result-overlay';
    overlay.style.display = 'none';
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.background = 'rgba(0, 0, 0, 0.88)';
    overlay.style.zIndex = '10';
    overlay.style.display = 'none';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.gap = '16px';
    overlay.style.padding = '24px';
    overlay.style.textAlign = 'center';
    overlay.style.borderRadius = '8px';

    return overlay;
  }

  private showResult(won: boolean, resultText: string, effectText: string): void {
    if (!this.resultOverlay) return;

    // Clear previous content
    this.resultOverlay.textContent = '';

    // Outcome banner
    const bannerEl = document.createElement('div');
    bannerEl.style.fontSize = '2em';
    bannerEl.style.fontWeight = 'bold';
    bannerEl.style.color = won ? 'var(--color-success, #4caf50)' : '#ff4444';
    bannerEl.textContent = won ? '恭喜！你贏了！' : '很遺憾... 輸了';
    this.resultOverlay.appendChild(bannerEl);

    // Result text
    const resultEl = document.createElement('div');
    resultEl.style.fontSize = '1.05em';
    resultEl.style.whiteSpace = 'pre-line';
    resultEl.style.color = 'var(--text-main, #e8e8e8)';
    resultEl.textContent = resultText;
    this.resultOverlay.appendChild(resultEl);

    // Effect text
    if (effectText.trim()) {
      const effectEl = document.createElement('div');
      effectEl.style.fontSize = '0.92em';
      effectEl.style.whiteSpace = 'pre-line';
      effectEl.style.color = won ? 'var(--color-success, #4caf50)' : 'var(--color-warning, #ff9800)';
      effectEl.textContent = effectText;
      this.resultOverlay.appendChild(effectEl);
    }

    // Updated money display inside overlay
    const moneyEl = document.createElement('div');
    moneyEl.style.fontSize = '1em';
    moneyEl.style.color = 'var(--text-dim)';
    moneyEl.textContent = `目前現金：$${gameState.money}`;
    this.resultOverlay.appendChild(moneyEl);

    // Action buttons
    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '12px';
    btnRow.style.marginTop = '8px';

    const playAgainBtn = document.createElement('button');
    playAgainBtn.className = 'btn-neon';
    playAgainBtn.textContent = '再來一局';
    playAgainBtn.addEventListener('click', () => this.hideResult());

    const leaveBtn = document.createElement('button');
    leaveBtn.className = 'btn-neon';
    leaveBtn.style.borderColor = 'var(--text-dim)';
    leaveBtn.style.color = 'var(--text-dim)';
    leaveBtn.style.textShadow = 'none';
    leaveBtn.style.boxShadow = 'none';
    leaveBtn.textContent = '收手';
    leaveBtn.addEventListener('click', () => {
      EventBus.emit('casino-done', {});
    });

    btnRow.appendChild(playAgainBtn);
    btnRow.appendChild(leaveBtn);
    this.resultOverlay.appendChild(btnRow);

    this.resultOverlay.style.display = 'flex';
  }

  private hideResult(): void {
    if (this.resultOverlay) {
      this.resultOverlay.style.display = 'none';
    }
    this.refreshMoneyDisplay();
    this.refreshSliderLimits();
  }

  // ── Core bet resolution ───────────────────────────────────────────────────

  private resolveBet(bet: CasinoBet): void {
    const result = placeBet(bet);
    this.refreshMoneyDisplay();
    this.showResult(result.won, result.resultText, result.effectText);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private refreshMoneyDisplay(): void {
    if (this.moneyDisplay) {
      this.moneyDisplay.textContent = `手頭現金：$${gameState.money}`;
    }
  }

  private refreshSliderLimits(): void {
    const limits = getBetLimits();
    const sliders: (HTMLInputElement | null)[] = [
      this.diceState?.slider ?? null,
      this.trafficState?.slider ?? null,
      this.allInSlider,
    ];
    const displays: (HTMLElement | null)[] = [
      this.diceState?.sliderDisplay ?? null,
      this.trafficState?.sliderDisplay ?? null,
      this.allInSliderDisplay,
    ];

    for (let i = 0; i < sliders.length; i++) {
      const slider = sliders[i];
      if (!slider) continue;
      slider.max = String(limits.max);
      // Clamp current value within new limits
      const current = Number(slider.value);
      if (current > limits.max) {
        slider.value = String(limits.max);
        const display = displays[i];
        if (display) {
          display.textContent = `下注金額：$${limits.max}`;
        }
      }
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  getElement(): HTMLElement {
    this.panel.style.position = 'relative';
    return this.panel;
  }

  destroy(): void {
    this.panel.remove();
  }
}

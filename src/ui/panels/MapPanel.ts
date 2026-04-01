// MapPanel — 傍晚選位訂價 HTML panel (pure DOM, no Phaser dependency)
import { EventBus } from '../../utils/EventBus';
import { gameState, spendMoney, updateGameState } from '../../state/GameState';
import { SAUSAGE_TYPES } from '../../data/sausages';
import { GRID_SLOTS, OPPONENT_INFO } from '../../data/map';
import type { GridSlot } from '../../data/map';

export class MapPanel {
  private panel: HTMLElement;
  private selectedSlotId: number = -1;
  private prices: Record<string, number> = {};
  private pricingSection: HTMLElement;
  private startBtn: HTMLButtonElement;
  private selectedInfoEl: HTMLElement;
  private affordWarning: HTMLElement;
  private slotElements: Map<number, HTMLElement> = new Map();

  constructor() {
    // Init prices to suggested price for each sausage
    for (const s of SAUSAGE_TYPES) {
      this.prices[s.id] = s.suggestedPrice;
    }

    this.panel = document.createElement('div');
    this.panel.className = 'game-panel ui-interactive evening-panel';

    // Title
    const titleEl = document.createElement('div');
    titleEl.className = 'panel-title neon-flicker';
    titleEl.textContent = '傍晚 — 選位訂價';
    this.panel.appendChild(titleEl);

    // Subtitle hint
    const hintEl = document.createElement('div');
    hintEl.className = 'map-hint';
    hintEl.textContent = '點選空格選定今日攤位，再調整售價開始營業';
    this.panel.appendChild(hintEl);

    // Night market grid
    const gridEl = this.buildGrid();
    this.panel.appendChild(gridEl);

    // Selected slot info (populated via DOM on click)
    this.selectedInfoEl = document.createElement('div');
    this.selectedInfoEl.className = 'selected-info';
    this.selectedInfoEl.style.display = 'none';
    this.panel.appendChild(this.selectedInfoEl);

    // Pricing section (hidden until slot selected)
    this.pricingSection = document.createElement('div');
    this.pricingSection.className = 'pricing-section';
    this.pricingSection.style.display = 'none';
    this.buildPricingSection();
    this.panel.appendChild(this.pricingSection);

    // Afford warning
    this.affordWarning = document.createElement('div');
    this.affordWarning.className = 'afford-warning';
    this.affordWarning.textContent = '資金不足，無法負擔此格租金！';
    this.affordWarning.style.display = 'none';
    this.panel.appendChild(this.affordWarning);

    // Start button (hidden until slot selected)
    const btnCenter = document.createElement('div');
    btnCenter.className = 'btn-center';
    btnCenter.style.marginTop = '16px';

    this.startBtn = document.createElement('button');
    this.startBtn.className = 'btn-neon';
    this.startBtn.textContent = '開始營業！';
    this.startBtn.style.display = 'none';
    this.startBtn.addEventListener('click', this.onStartBusiness);
    btnCenter.appendChild(this.startBtn);
    this.panel.appendChild(btnCenter);
  }

  private buildGrid(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'night-market-grid-wrapper';

    const grid = document.createElement('div');
    grid.className = 'night-market-grid';

    for (const slot of GRID_SLOTS) {
      const slotEl = this.buildSlotCard(slot);
      this.slotElements.set(slot.id, slotEl);
      grid.appendChild(slotEl);
    }

    wrapper.appendChild(grid);
    return wrapper;
  }

  private getSlotOwnership(slot: GridSlot): { isPlayer: boolean; isOpponent: boolean; opponentId?: string } {
    const mapOwner = gameState.map[slot.id];
    if (mapOwner === 'player') return { isPlayer: true, isOpponent: false };
    if (mapOwner && mapOwner !== 'player') return { isPlayer: false, isOpponent: true, opponentId: mapOwner };
    // Fallback to static data for slots not yet in gameState.map
    if (slot.owner === 'opponent') return { isPlayer: false, isOpponent: true, opponentId: slot.opponentId };
    return { isPlayer: false, isOpponent: false };
  }

  private buildSlotCard(slot: GridSlot): HTMLElement {
    const card = document.createElement('div');
    const ownership = this.getSlotOwnership(slot);

    let slotClass = 'grid-slot';
    if (ownership.isOpponent)     slotClass += ' grid-slot--opponent';
    else if (ownership.isPlayer)  slotClass += ' grid-slot--player';
    else                          slotClass += ' grid-slot--empty';

    card.className = slotClass;

    // Slot name
    const nameEl = document.createElement('div');
    nameEl.className = 'slot-name';
    nameEl.textContent = slot.name;
    card.appendChild(nameEl);

    // Occupant display
    const occupantEl = document.createElement('div');
    occupantEl.className = 'slot-occupant';
    if (ownership.isOpponent && ownership.opponentId) {
      const info = OPPONENT_INFO[ownership.opponentId];
      if (info) {
        occupantEl.textContent = `${info.emoji} ${info.name}`;
      } else {
        occupantEl.textContent = '已佔領';
      }
    } else if (ownership.isPlayer) {
      occupantEl.textContent = '你的地盤';
      occupantEl.classList.add('slot-occupant--player');
    } else {
      occupantEl.textContent = '\u00a0';
    }
    card.appendChild(occupantEl);

    // Rent info
    const rentEl = document.createElement('div');
    rentEl.className = 'slot-rent';
    rentEl.textContent = `$${slot.rent}`;
    card.appendChild(rentEl);

    // Traffic info
    const trafficEl = document.createElement('div');
    trafficEl.className = 'slot-traffic';
    trafficEl.textContent = `人流 ${slot.baseTraffic}`;
    card.appendChild(trafficEl);

    // Click handler for selectable slots
    if (!ownership.isOpponent) {
      card.addEventListener('click', () => this.onSlotClick(slot));
    } else {
      const opponentName = ownership.opponentId ? (OPPONENT_INFO[ownership.opponentId]?.name ?? '對手') : '對手';
      card.title = `${opponentName} 已佔領此格`;
    }

    return card;
  }

  private onSlotClick = (slot: GridSlot): void => {
    // Deselect previous
    if (this.selectedSlotId >= 0) {
      const prevEl = this.slotElements.get(this.selectedSlotId);
      if (prevEl) {
        prevEl.classList.remove('grid-slot--selected');
        const prevSlot = GRID_SLOTS.find(s => s.id === this.selectedSlotId);
        if (prevSlot && gameState.map[prevSlot.id] === 'player') {
          prevEl.classList.add('grid-slot--player');
        } else {
          prevEl.classList.add('grid-slot--empty');
        }
      }
    }

    this.selectedSlotId = slot.id;

    // Mark new selection
    const slotEl = this.slotElements.get(slot.id);
    if (slotEl) {
      slotEl.classList.remove('grid-slot--empty', 'grid-slot--player');
      slotEl.classList.add('grid-slot--selected');
    }

    // Update selected info using DOM (no innerHTML)
    this.selectedInfoEl.style.display = 'flex';
    this.selectedInfoEl.textContent = '';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'selected-label';
    labelSpan.textContent = '已選：';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'selected-name';
    nameSpan.textContent = slot.name;

    const detailSpan = document.createElement('span');
    detailSpan.className = 'selected-detail';
    detailSpan.textContent = `（租金 $${slot.rent}/天，基礎人流 ${slot.baseTraffic}）`;

    this.selectedInfoEl.appendChild(labelSpan);
    this.selectedInfoEl.appendChild(nameSpan);
    this.selectedInfoEl.appendChild(detailSpan);

    // Show pricing section
    this.pricingSection.style.display = 'block';

    // Check affordability
    const canAfford = gameState.money >= slot.rent;
    this.startBtn.style.display = 'inline-block';
    this.startBtn.disabled = !canAfford;
    this.startBtn.style.opacity = canAfford ? '1' : '0.4';
    this.startBtn.style.cursor = canAfford ? 'pointer' : 'not-allowed';
    this.affordWarning.style.display = canAfford ? 'none' : 'block';
  };

  private buildPricingSection(): void {
    const titleEl = document.createElement('div');
    titleEl.className = 'pricing-title';
    titleEl.textContent = '今日售價設定';
    this.pricingSection.appendChild(titleEl);

    for (const sausage of SAUSAGE_TYPES) {
      const row = document.createElement('div');
      row.className = 'price-row';

      const labelEl = document.createElement('div');
      labelEl.className = 'price-label';
      labelEl.textContent = `${sausage.emoji} ${sausage.name}`;

      const sliderWrapper = document.createElement('div');
      sliderWrapper.className = 'price-slider-wrapper';

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'price-slider';
      slider.min = String(sausage.cost + 5);
      slider.max = String(sausage.suggestedPrice * 2);
      slider.value = String(sausage.suggestedPrice);
      slider.step = '1';

      const priceDisplay = document.createElement('span');
      priceDisplay.className = 'price-display';
      priceDisplay.textContent = `$${sausage.suggestedPrice}`;
      priceDisplay.style.color = 'var(--neon-green)';

      const suggestedEl = document.createElement('span');
      suggestedEl.className = 'price-suggested';
      suggestedEl.textContent = `建議 $${sausage.suggestedPrice}`;

      slider.addEventListener('input', () => {
        const val = Number(slider.value);
        this.prices[sausage.id] = val;
        priceDisplay.textContent = `$${val}`;

        // Color feedback: red = above suggested (risky), cyan = below (cheap), green = at suggested
        if (val > sausage.suggestedPrice) {
          priceDisplay.style.color = 'var(--neon-red)';
        } else if (val < sausage.suggestedPrice) {
          priceDisplay.style.color = 'var(--neon-cyan)';
        } else {
          priceDisplay.style.color = 'var(--neon-green)';
        }
      });

      sliderWrapper.appendChild(slider);
      sliderWrapper.appendChild(priceDisplay);

      row.appendChild(labelEl);
      row.appendChild(sliderWrapper);
      row.appendChild(suggestedEl);
      this.pricingSection.appendChild(row);
    }
  }

  private onStartBusiness = (): void => {
    if (this.selectedSlotId < 0) return;

    const slot = GRID_SLOTS.find(s => s.id === this.selectedSlotId);
    if (!slot) return;

    // Deduct rent — fail gracefully if insufficient
    const success = spendMoney(slot.rent);
    if (!success) {
      this.affordWarning.style.display = 'block';
      this.startBtn.disabled = true;
      this.startBtn.style.opacity = '0.4';
      return;
    }

    // Track rent as daily expense + mark slot as player territory
    updateGameState({
      selectedSlot: this.selectedSlotId,
      prices: { ...this.prices },
      dailyExpenses: (gameState.dailyExpenses ?? 0) + slot.rent,
      map: { ...gameState.map, [this.selectedSlotId]: 'player' },
    } as Parameters<typeof updateGameState>[0]);

    // Emit evening-done with data payload for EveningScene / GrillScene
    EventBus.emit('evening-done', {
      selectedSlot: this.selectedSlotId,
      prices: { ...this.prices },
    });
  };

  getElement(): HTMLElement {
    return this.panel;
  }

  destroy(): void {
    this.startBtn.removeEventListener('click', this.onStartBusiness);
  }
}

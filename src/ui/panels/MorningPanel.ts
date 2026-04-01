// MorningPanel — 早上進貨備料 HTML panel (pure DOM, no Phaser)
import { EventBus } from '../../utils/EventBus';
import { gameState } from '../../state/GameState';
import { buyStock } from '../../systems/EconomyEngine';
import { SAUSAGE_TYPES } from '../../data/sausages';
import type { SausageType } from '../../types';

export interface SpoilageInfo {
  spoilage: Record<string, number>;
}

export class MorningPanel {
  private panel: HTMLElement;
  private quantities: Record<string, number> = {};
  private summarySpend: HTMLElement;
  private summaryRemain: HTMLElement;
  private confirmBtn: HTMLButtonElement;
  private cardPlusButtons: Map<string, HTMLButtonElement> = new Map();

  constructor(spoilageInfo?: SpoilageInfo) {
    // Init quantities to 0 for each sausage type
    for (const s of SAUSAGE_TYPES) {
      this.quantities[s.id] = 0;
    }

    this.panel = document.createElement('div');
    this.panel.className = 'game-panel ui-interactive morning-panel';

    // Title
    const titleEl = document.createElement('div');
    titleEl.className = 'panel-title neon-flicker';
    titleEl.textContent = '🌅 早上 — 進貨備料';
    this.panel.appendChild(titleEl);

    // Sausage cards container (only show unlocked types)
    const cardsEl = document.createElement('div');
    cardsEl.className = 'sausage-cards';
    const unlockedTypes = SAUSAGE_TYPES.filter(s => gameState.unlockedSausages.includes(s.id));
    for (const sausage of unlockedTypes) {
      const card = this.buildSausageCard(sausage, spoilageInfo);
      cardsEl.appendChild(card);
    }
    this.panel.appendChild(cardsEl);

    // Purchase summary
    const summaryEl = document.createElement('div');
    summaryEl.className = 'purchase-summary';

    const spendRow = document.createElement('div');
    spendRow.className = 'summary-row';
    const spendLabel = document.createElement('span');
    spendLabel.className = 'summary-label';
    spendLabel.textContent = '本次花費';
    this.summarySpend = document.createElement('span');
    this.summarySpend.className = 'summary-value neon-yellow';
    this.summarySpend.textContent = '$0';
    spendRow.appendChild(spendLabel);
    spendRow.appendChild(this.summarySpend);

    const remainRow = document.createElement('div');
    remainRow.className = 'summary-row';
    const remainLabel = document.createElement('span');
    remainLabel.className = 'summary-label';
    remainLabel.textContent = '剩餘資金';
    this.summaryRemain = document.createElement('span');
    this.summaryRemain.className = 'summary-value neon-green';
    this.summaryRemain.textContent = `$${gameState.money}`;
    remainRow.appendChild(remainLabel);
    remainRow.appendChild(this.summaryRemain);

    summaryEl.appendChild(spendRow);
    summaryEl.appendChild(remainRow);
    this.panel.appendChild(summaryEl);

    // Confirm button
    const btnCenter = document.createElement('div');
    btnCenter.className = 'btn-center';
    btnCenter.style.marginTop = '16px';

    this.confirmBtn = document.createElement('button');
    this.confirmBtn.className = 'btn-neon';
    this.confirmBtn.addEventListener('click', this.onConfirm);
    btnCenter.appendChild(this.confirmBtn);
    this.panel.appendChild(btnCenter);

    // Set initial button state
    this.updateSummary();
  }

  private buildSausageCard(sausage: SausageType, spoilageInfo?: SpoilageInfo): HTMLElement {
    const card = document.createElement('div');
    card.className = 'sausage-card';

    // Header row: emoji + name + cost
    const headerEl = document.createElement('div');
    headerEl.className = 'sausage-card-header';

    const emojiEl = document.createElement('span');
    emojiEl.className = 'sausage-emoji';
    emojiEl.textContent = sausage.emoji;

    const infoEl = document.createElement('div');
    infoEl.className = 'sausage-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'sausage-name';
    nameEl.textContent = sausage.name;

    const costEl = document.createElement('div');
    costEl.className = 'sausage-cost';
    costEl.textContent = `$${sausage.cost} / 根`;

    const descEl = document.createElement('div');
    descEl.className = 'sausage-desc';
    descEl.textContent = sausage.description;

    infoEl.appendChild(nameEl);
    infoEl.appendChild(costEl);
    infoEl.appendChild(descEl);

    headerEl.appendChild(emojiEl);
    headerEl.appendChild(infoEl);
    card.appendChild(headerEl);

    // Inventory hint row
    const currentStock = gameState.inventory[sausage.id] ?? 0;
    const spoiledQty = spoilageInfo?.spoilage[sausage.id] ?? 0;

    const stockHintEl = document.createElement('div');
    stockHintEl.className = 'sausage-stock-hint';
    if (spoiledQty > 0) {
      stockHintEl.textContent = `庫存: ${currentStock} 根（昨晚損耗 ${spoiledQty} 根）`;
    } else {
      stockHintEl.textContent = `庫存: ${currentStock} 根`;
    }
    card.appendChild(stockHintEl);

    // Quantity control row
    const qtyRowEl = document.createElement('div');
    qtyRowEl.className = 'qty-row';

    const minusBtn = document.createElement('button');
    minusBtn.className = 'qty-btn btn-neon-red';
    minusBtn.textContent = '－';
    minusBtn.addEventListener('click', () => {
      if (this.quantities[sausage.id] > 0) {
        this.quantities[sausage.id] -= 1;
        qtyDisplay.textContent = String(this.quantities[sausage.id]);
        subtotalEl.textContent = `小計 $${this.quantities[sausage.id] * sausage.cost}`;
        this.updateSummary();
      }
    });

    const qtyDisplay = document.createElement('span');
    qtyDisplay.className = 'qty-display';
    qtyDisplay.textContent = '0';

    const plusBtn = document.createElement('button');
    plusBtn.className = 'qty-btn btn-neon-cyan';
    plusBtn.textContent = '＋';
    plusBtn.addEventListener('click', () => {
      const totalSpend = this.calcTotalCost();
      const canAffordOne = gameState.money - totalSpend >= sausage.cost;
      if (canAffordOne) {
        this.quantities[sausage.id] += 1;
        qtyDisplay.textContent = String(this.quantities[sausage.id]);
        subtotalEl.textContent = `小計 $${this.quantities[sausage.id] * sausage.cost}`;
        this.updateSummary();
      }
    });
    this.cardPlusButtons.set(sausage.id, plusBtn);

    const subtotalEl = document.createElement('span');
    subtotalEl.className = 'sausage-subtotal';
    subtotalEl.textContent = `小計 $0`;

    const qtyControl = document.createElement('div');
    qtyControl.className = 'qty-control';
    qtyControl.appendChild(minusBtn);
    qtyControl.appendChild(qtyDisplay);
    qtyControl.appendChild(plusBtn);

    qtyRowEl.appendChild(qtyControl);
    qtyRowEl.appendChild(subtotalEl);
    card.appendChild(qtyRowEl);

    return card;
  }

  private calcTotalCost(): number {
    let total = 0;
    for (const sausage of SAUSAGE_TYPES) {
      total += (this.quantities[sausage.id] ?? 0) * sausage.cost;
    }
    return total;
  }

  private updateSummary(): void {
    const totalSpend = this.calcTotalCost();
    const remaining = gameState.money - totalSpend;

    this.summarySpend.textContent = `$${totalSpend}`;
    this.summaryRemain.textContent = `$${remaining}`;

    // Update plus buttons: disable if remaining < each sausage cost
    for (const sausage of SAUSAGE_TYPES) {
      const btn = this.cardPlusButtons.get(sausage.id);
      if (btn) {
        const canBuyOne = remaining >= sausage.cost;
        btn.disabled = !canBuyOne;
        btn.style.opacity = canBuyOne ? '1' : '0.3';
        btn.style.cursor = canBuyOne ? 'pointer' : 'not-allowed';
      }
    }

    // Enable confirm if player has new purchases OR existing inventory
    const hasNewPurchases = Object.values(this.quantities).some(q => q > 0);
    const hasExistingStock = Object.values(gameState.inventory).some(q => q > 0);
    const canProceed = hasNewPurchases || hasExistingStock;
    this.confirmBtn.disabled = !canProceed;
    this.confirmBtn.style.opacity = canProceed ? '1' : '0.5';
    this.confirmBtn.textContent = hasNewPurchases ? '確認進貨' : '直接出攤';
  }

  private onConfirm = (): void => {
    // Purchase all sausage types with quantity > 0
    for (const sausage of SAUSAGE_TYPES) {
      const qty = this.quantities[sausage.id] ?? 0;
      if (qty > 0) {
        buyStock(sausage.id, qty);
      }
    }
    EventBus.emit('morning-done', {});
  };

  getElement(): HTMLElement {
    return this.panel;
  }

  destroy(): void {
    this.confirmBtn.removeEventListener('click', this.onConfirm);
  }
}

// BlackMarketPanel — 黑市交易 HTML panel (pure DOM, no Phaser dependency)
import { EventBus } from '../../utils/EventBus';
import { gameState } from '../../state/GameState';
import { BLACK_MARKET_ITEMS, buyBlackMarket } from '../../systems/BlackMarketEngine';

export class BlackMarketPanel {
  private el: HTMLDivElement;
  private feedbackEl: HTMLDivElement | null = null;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'event-panel black-market-panel';
    this.build();
  }

  private build(): void {
    this.el.innerHTML = ''; // clear

    // Badge
    const badge = document.createElement('div');
    badge.className = 'event-category-badge';
    badge.dataset.category = 'underground';
    badge.textContent = '💀 黑市供應商';
    this.el.appendChild(badge);

    // Title
    const title = document.createElement('h2');
    title.textContent = '暗巷交易';
    title.style.color = '#ff4444';
    title.style.marginTop = '10px';
    this.el.appendChild(title);

    // Subtitle
    const sub = document.createElement('p');
    sub.textContent = '品質保證？不存在的。但便宜就是正義。';
    sub.style.color = '#888';
    sub.style.fontStyle = 'italic';
    sub.style.fontSize = '13px';
    this.el.appendChild(sub);

    // Items list
    BLACK_MARKET_ITEMS.forEach(item => {
      const row = document.createElement('div');
      row.className = 'bm-item';

      // Info section
      const info = document.createElement('div');
      info.style.flex = '1';

      const nameEl = document.createElement('div');
      nameEl.textContent = `${item.emoji} ${item.name}`;
      nameEl.style.fontWeight = 'bold';
      info.appendChild(nameEl);

      const details = document.createElement('div');
      details.style.display = 'flex';
      details.style.gap = '12px';
      details.style.marginTop = '4px';

      const priceEl = document.createElement('span');
      priceEl.textContent = `$${item.cost}`;
      priceEl.style.color = '#ffcc00';
      details.appendChild(priceEl);

      if (item.qualityBonus > 0) {
        const bonusEl = document.createElement('span');
        bonusEl.className = 'bm-bonus';
        bonusEl.textContent = `品質 +${Math.round(item.qualityBonus * 100)}%`;
        details.appendChild(bonusEl);
      }

      const riskEl = document.createElement('span');
      riskEl.className = 'bm-risk';
      riskEl.textContent = `被抓 ${Math.round(item.catchChance * 100)}%`;
      details.appendChild(riskEl);

      const stockEl = document.createElement('span');
      stockEl.style.color = '#aaa';
      const currentStock = (gameState.blackMarketStock || {})[item.id] || 0;
      stockEl.textContent = `庫存: ${currentStock}`;
      details.appendChild(stockEl);

      info.appendChild(details);
      row.appendChild(info);

      // Buy button
      const buyBtn = document.createElement('button');
      buyBtn.className = 'event-choice-btn';
      buyBtn.textContent = '購買';
      buyBtn.style.minWidth = '60px';
      const canAfford = gameState.money >= item.cost;
      if (!canAfford) {
        buyBtn.disabled = true;
        buyBtn.style.opacity = '0.5';
      }
      buyBtn.addEventListener('click', () => {
        const result = buyBlackMarket(item.id);
        this.showFeedback(result.message, result.caught ? '#ff4444' : '#44ff44');
        // Rebuild to update stock counts and affordability
        setTimeout(() => this.build(), 1500);
      });
      row.appendChild(buyBtn);

      this.el.appendChild(row);
    });

    // Feedback area
    this.feedbackEl = document.createElement('div');
    this.feedbackEl.style.minHeight = '30px';
    this.feedbackEl.style.marginTop = '8px';
    this.feedbackEl.style.textAlign = 'center';
    this.feedbackEl.style.fontSize = '14px';
    this.el.appendChild(this.feedbackEl);

    // Money display
    const moneyEl = document.createElement('div');
    moneyEl.style.textAlign = 'center';
    moneyEl.style.margin = '10px 0';
    moneyEl.style.color = '#ffcc00';
    moneyEl.textContent = `💰 持有: $${gameState.money}`;
    this.el.appendChild(moneyEl);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'event-choice-btn';
    closeBtn.textContent = '🚪 離開黑市';
    closeBtn.style.width = '100%';
    closeBtn.style.marginTop = '8px';
    closeBtn.addEventListener('click', () => {
      EventBus.emit('black-market-done');
    });
    this.el.appendChild(closeBtn);
  }

  private showFeedback(msg: string, color: string): void {
    if (this.feedbackEl) {
      this.feedbackEl.textContent = msg;
      this.feedbackEl.style.color = color;
    }
  }

  getElement(): HTMLElement {
    return this.el;
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.el);
  }

  destroy(): void {
    this.el.remove();
  }
}

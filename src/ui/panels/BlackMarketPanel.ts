// BlackMarketPanel — 黑市交易 HTML panel (pure DOM, no Phaser dependency)
import { EventBus } from '../../utils/EventBus';
import { gameState } from '../../state/GameState';
import { BLACK_MARKET_ITEMS, buyBlackMarket } from '../../systems/BlackMarketEngine';

export class BlackMarketPanel {
  private el: HTMLDivElement;
  // Persistent feedback area kept outside the rebuilt item list so messages
  // survive a build() call without requiring a setTimeout.
  private feedbackEl: HTMLDivElement;
  private moneyEl: HTMLDivElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'event-panel black-market-panel';

    // Feedback and money displays live at the bottom and persist across rebuilds.
    this.feedbackEl = document.createElement('div');
    this.feedbackEl.style.cssText = 'min-height:30px; margin-top:8px; text-align:center; font-size:14px;';

    this.moneyEl = document.createElement('div');
    this.moneyEl.style.cssText = 'text-align:center; margin:10px 0; color:#ffcc00;';

    this.build();
  }

  private build(): void {
    this.el.innerHTML = ''; // clear

    // Badge
    const badge = document.createElement('div');
    badge.className = 'event-category-badge';
    badge.dataset.category = 'underground';
    badge.textContent = '黑市供應商';
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

    const isUnlocked = gameState.blackMarketUnlocked;

    if (!isUnlocked) {
      const lockEl = document.createElement('div');
      lockEl.style.cssText = 'text-align:center; color:#888; margin:16px 0;';
      lockEl.textContent = '黑市尚未解鎖';
      this.el.appendChild(lockEl);
    } else {
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
        const currentStock = (gameState.blackMarketStock ?? {})[item.id] ?? 0;
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
          if (!result.success) {
            this.showFeedback(result.message, '#ff4444');
            return;
          }
          this.showFeedback(result.message, result.caught ? '#ff4444' : '#44ff44');
          // Rebuild immediately so stock counts and money reflect the purchase.
          this.build();
        });

        row.appendChild(buyBtn);
        this.el.appendChild(row);
      });
    }

    // Persistent feedback area — re-attach (content preserved because it is
    // the same DOM node, not recreated).
    this.feedbackEl.textContent = this.feedbackEl.textContent; // no-op, preserves text
    this.el.appendChild(this.feedbackEl);

    // Money display — always read fresh gameState
    this.moneyEl.textContent = `持有: $${gameState.money}`;
    this.el.appendChild(this.moneyEl);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'event-choice-btn';
    closeBtn.textContent = '離開黑市';
    closeBtn.style.width = '100%';
    closeBtn.style.marginTop = '8px';
    closeBtn.addEventListener('click', () => {
      EventBus.emit('show-panel', 'shop');
    });
    this.el.appendChild(closeBtn);
  }

  private showFeedback(msg: string, color: string): void {
    this.feedbackEl.textContent = msg;
    this.feedbackEl.style.color = color;
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

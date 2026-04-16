import { EventBus } from '../../utils/EventBus';
import { gameState } from '../../state/GameState';
import { formatMoney } from '../../utils/helpers';
import { sfx } from '../../utils/SoundFX';

// StatusBar: top status bar always visible, updates reactively via EventBus
export class StatusBar {
  private element: HTMLElement;
  private moneyEl: HTMLElement;
  private dayEl: HTMLElement;
  private repEl: HTMLElement;
  private undergroundRepEl: HTMLElement;
  private chaosEl: HTMLElement;
  private bodyguardEl: HTMLElement;
  // Financial state indicators
  private loanIndicatorEl: HTMLElement;
  private huiIndicatorEl: HTMLElement;
  private playerLoansIndicatorEl: HTMLElement;

  constructor(container: HTMLElement) {
    this.element = document.createElement('div');
    this.element.id = 'status-bar';

    this.moneyEl = this.createItem('$', formatMoney(gameState.money), 'hud-money.png');
    this.dayEl = this.createItem('D', `Day ${gameState.day}`, 'hud-day.png');
    this.repEl = this.createItem('聲', `${gameState.reputation}`);
    this.undergroundRepEl = this.createItem('地', `${gameState.undergroundRep}`);
    this.chaosEl = this.createItem('混', `${gameState.chaosCount}`);
    this.chaosEl.style.display = gameState.chaosCount > 0 ? '' : 'none';
    this.bodyguardEl = this.createItem('護', `保鑣剩 ${gameState.bodyguardDaysLeft} 天`);
    this.bodyguardEl.style.display = gameState.hasBodyguard ? '' : 'none';

    // Financial indicators — created and initially synced
    this.loanIndicatorEl = this.createFinancialIndicator();
    this.huiIndicatorEl = this.createFinancialIndicator();
    this.playerLoansIndicatorEl = this.createFinancialIndicator();
    this.syncFinancialIndicators();

    // Mute toggle button
    const muteBtn = document.createElement('div');
    muteBtn.className = 'status-item';
    muteBtn.style.cursor = 'pointer';
    muteBtn.style.userSelect = 'none';
    muteBtn.textContent = '音效';
    muteBtn.title = '靜音切換';
    muteBtn.addEventListener('click', () => {
      const muted = sfx.toggleMute();
      muteBtn.textContent = muted ? '靜音' : '音效';
    });

    this.element.appendChild(this.moneyEl);
    this.element.appendChild(this.dayEl);
    this.element.appendChild(this.repEl);
    this.element.appendChild(this.undergroundRepEl);
    this.element.appendChild(this.chaosEl);
    this.element.appendChild(this.bodyguardEl);
    this.element.appendChild(this.loanIndicatorEl);
    this.element.appendChild(this.huiIndicatorEl);
    this.element.appendChild(this.playerLoansIndicatorEl);
    this.element.appendChild(muteBtn);

    container.appendChild(this.element);

    // Listen to state updates from EventBus
    EventBus.on('state-updated', this.onStateUpdated, this);
  }

  private createItem(emoji: string, initialValue: string, iconSrc?: string): HTMLElement {
    const item = document.createElement('div');
    item.className = 'status-item';

    if (iconSrc) {
      const iconImg = document.createElement('img');
      iconImg.src = iconSrc;
      iconImg.style.cssText = 'width:20px; height:20px; vertical-align:middle; margin-right:4px;';
      iconImg.onerror = () => {
        // Fallback to emoji if image fails to load
        const emojiSpan = document.createElement('span');
        emojiSpan.className = 'emoji';
        emojiSpan.textContent = emoji;
        item.replaceChild(emojiSpan, iconImg);
      };
      item.appendChild(iconImg);
    } else {
      const emojiSpan = document.createElement('span');
      emojiSpan.className = 'emoji';
      emojiSpan.textContent = emoji;
      item.appendChild(emojiSpan);
    }

    const valueSpan = document.createElement('span');
    valueSpan.className = 'value';
    valueSpan.textContent = initialValue;

    item.appendChild(valueSpan);

    return item;
  }

  // Create a bare container for financial indicators (styled inline)
  private createFinancialIndicator(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'status-item';
    el.style.fontSize = '12px';
    el.style.display = 'none';
    return el;
  }

  // Sync all three financial indicators to current gameState
  private syncFinancialIndicators(): void {
    // 1. Active loan indicator
    const loan = gameState.loans.active;
    if (loan) {
      const isOverdue = loan.overdueDays > 0;
      this.loanIndicatorEl.textContent = `借 $${loan.totalOwed.toLocaleString()}`;
      this.loanIndicatorEl.style.color = isOverdue ? '#ff4444' : '#ff8888';
      this.loanIndicatorEl.style.animation = isOverdue ? 'status-blink 0.8s step-start infinite' : '';
      this.loanIndicatorEl.title = isOverdue ? `逾期 ${loan.overdueDays} 天！` : `還款日：Day ${loan.dueDay}`;
      this.loanIndicatorEl.style.display = '';
    } else {
      this.loanIndicatorEl.style.display = 'none';
    }

    // 2. Hui cycle indicator
    if (gameState.hui.isActive) {
      this.huiIndicatorEl.textContent = `會 ${gameState.hui.cycle}/5`;
      this.huiIndicatorEl.style.color = '#f5a623';
      this.huiIndicatorEl.style.animation = '';
      this.huiIndicatorEl.title = `標會第 ${gameState.hui.cycle} 輪`;
      this.huiIndicatorEl.style.display = '';
    } else {
      this.huiIndicatorEl.style.display = 'none';
    }

    // 3. Outstanding player loans (money lent out = future income)
    const activePlayerLoans = gameState.playerLoans.filter(l => l.status === 'active');
    if (activePlayerLoans.length > 0) {
      this.playerLoansIndicatorEl.textContent = `放 ${activePlayerLoans.length}筆`;
      this.playerLoansIndicatorEl.style.color = '#4caf50';
      this.playerLoansIndicatorEl.style.animation = '';
      const total = activePlayerLoans.reduce((sum, l) => sum + l.totalOwed, 0);
      this.playerLoansIndicatorEl.title = `待收 $${total.toLocaleString()}`;
      this.playerLoansIndicatorEl.style.display = '';
    } else {
      this.playerLoansIndicatorEl.style.display = 'none';
    }
  }

  private onStateUpdated = (): void => {
    const moneyValue = this.moneyEl.querySelector('.value') as HTMLElement;
    const dayValue = this.dayEl.querySelector('.value') as HTMLElement;
    const repValue = this.repEl.querySelector('.value') as HTMLElement;
    const undergroundRepValue = this.undergroundRepEl.querySelector('.value') as HTMLElement;
    const chaosValue = this.chaosEl.querySelector('.value') as HTMLElement;
    const bodyguardValue = this.bodyguardEl.querySelector('.value') as HTMLElement;

    if (moneyValue) moneyValue.textContent = formatMoney(gameState.money);
    if (dayValue) dayValue.textContent = `Day ${gameState.day}`;
    if (repValue) repValue.textContent = `${gameState.reputation}`;

    // Underground rep: always visible
    if (undergroundRepValue) undergroundRepValue.textContent = `${gameState.undergroundRep}`;
    this.undergroundRepEl.style.display = '';

    // Chaos count: only show when > 0
    if (chaosValue) chaosValue.textContent = `${gameState.chaosCount}`;
    this.chaosEl.style.display = gameState.chaosCount > 0 ? '' : 'none';

    // Bodyguard status: only show when active
    if (bodyguardValue) bodyguardValue.textContent = `保鑣剩 ${gameState.bodyguardDaysLeft} 天`;
    this.bodyguardEl.style.display = gameState.hasBodyguard ? '' : 'none';

    // Financial state indicators
    this.syncFinancialIndicators();
  };

  destroy(): void {
    EventBus.off('state-updated', this.onStateUpdated, this);
    this.element.remove();
  }
}

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

  constructor(container: HTMLElement) {
    this.element = document.createElement('div');
    this.element.id = 'status-bar';

    this.moneyEl = this.createItem('💰', formatMoney(gameState.money));
    this.dayEl = this.createItem('📅', `Day ${gameState.day}`);
    this.repEl = this.createItem('⭐', `${gameState.reputation}`);

    // Mute toggle button
    const muteBtn = document.createElement('div');
    muteBtn.className = 'status-item';
    muteBtn.style.cursor = 'pointer';
    muteBtn.style.userSelect = 'none';
    muteBtn.textContent = '🔊';
    muteBtn.title = '靜音切換';
    muteBtn.addEventListener('click', () => {
      const muted = sfx.toggleMute();
      muteBtn.textContent = muted ? '🔇' : '🔊';
    });

    this.element.appendChild(this.moneyEl);
    this.element.appendChild(this.dayEl);
    this.element.appendChild(this.repEl);
    this.element.appendChild(muteBtn);

    container.appendChild(this.element);

    // Listen to state updates from EventBus
    EventBus.on('state-updated', this.onStateUpdated, this);
  }

  private createItem(emoji: string, initialValue: string): HTMLElement {
    const item = document.createElement('div');
    item.className = 'status-item';

    const emojiSpan = document.createElement('span');
    emojiSpan.className = 'emoji';
    emojiSpan.textContent = emoji;

    const valueSpan = document.createElement('span');
    valueSpan.className = 'value';
    valueSpan.textContent = initialValue;

    item.appendChild(emojiSpan);
    item.appendChild(valueSpan);

    return item;
  }

  private onStateUpdated = (): void => {
    const moneyValue = this.moneyEl.querySelector('.value') as HTMLElement;
    const dayValue = this.dayEl.querySelector('.value') as HTMLElement;
    const repValue = this.repEl.querySelector('.value') as HTMLElement;

    if (moneyValue) moneyValue.textContent = formatMoney(gameState.money);
    if (dayValue) dayValue.textContent = `Day ${gameState.day}`;
    if (repValue) repValue.textContent = `${gameState.reputation}`;
  };

  destroy(): void {
    EventBus.off('state-updated', this.onStateUpdated, this);
    this.element.remove();
  }
}

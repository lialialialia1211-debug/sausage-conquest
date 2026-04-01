import { EventBus } from '../utils/EventBus';
import { StatusBar } from './panels/StatusBar';
import './styles/neon.css';

// UIManager: controls which HTML overlay panel is shown/hidden
// Listens to EventBus 'show-panel' events from Phaser scenes
export class UIManager {
  private overlay: HTMLElement;
  private panelArea: HTMLElement;
  private statusBar: StatusBar;
  private currentPanel: HTMLElement | null = null;

  constructor() {
    // Create the overlay container
    this.overlay = document.createElement('div');
    this.overlay.id = 'ui-overlay';

    this.panelArea = document.createElement('div');
    this.panelArea.id = 'panel-area';
    this.overlay.appendChild(this.panelArea);

    // Mount overlay to game container
    const gameContainer = document.getElementById('game-container')!;
    gameContainer.appendChild(this.overlay);

    // Create always-visible status bar
    this.statusBar = new StatusBar(this.overlay);

    // Listen to scene-driven panel events
    EventBus.on('show-panel', this.onShowPanel, this);
    EventBus.on('hide-panel', this.hideCurrentPanel, this);
  }

  private onShowPanel = (panelName: string): void => {
    this.hideCurrentPanel();

    const panel = this.createPanelByName(panelName);
    if (panel) {
      panel.classList.add('fade-in');
      this.panelArea.appendChild(panel);
      this.currentPanel = panel;
    }
  };

  private hideCurrentPanel = (): void => {
    if (this.currentPanel) {
      this.currentPanel.remove();
      this.currentPanel = null;
    }
  };

  private createPanelByName(name: string): HTMLElement | null {
    switch (name) {
      case 'morning':    return this.createPlaceholderPanel('🌅 早上 — 進貨備料', 'morning-done', '繼續 ▶');
      case 'evening':    return this.createPlaceholderPanel('🌆 傍晚 — 選位訂價', 'evening-done', '繼續 ▶');
      case 'summary':    return this.createSummaryPanel();
      case 'event':      return this.createPlaceholderPanel('📰 突發事件', 'event-done', '繼續 ▶');
      case 'shop':       return this.createPlaceholderPanel('🏪 升級商店', 'shop-done', '繼續 ▶');
      default:           return null;
    }
  }

  private createPlaceholderPanel(title: string, doneEvent: string, btnText: string): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'game-panel ui-interactive';

    const titleEl = document.createElement('div');
    titleEl.className = 'panel-title neon-flicker';
    titleEl.textContent = title;

    const bodyEl = document.createElement('div');
    bodyEl.className = 'panel-body story-text';
    bodyEl.textContent = '（此階段開發中，點下方按鈕繼續）';

    const btnCenter = document.createElement('div');
    btnCenter.className = 'btn-center';

    const btn = document.createElement('button');
    btn.className = 'btn-neon';
    btn.textContent = btnText;
    btn.addEventListener('click', () => {
      EventBus.emit(doneEvent, {});
    });
    btnCenter.appendChild(btn);

    const notice = document.createElement('div');
    notice.className = 'placeholder-notice';
    notice.textContent = 'placeholder — 功能開發中';

    panel.appendChild(titleEl);
    panel.appendChild(bodyEl);
    panel.appendChild(btnCenter);
    panel.appendChild(notice);

    return panel;
  }

  private createSummaryPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'game-panel ui-interactive';

    const titleEl = document.createElement('div');
    titleEl.className = 'panel-title neon-flicker';
    titleEl.textContent = '📊 今日結算';

    const bodyEl = document.createElement('div');
    bodyEl.className = 'panel-body';

    const storyText = document.createElement('div');
    storyText.className = 'story-text';
    storyText.textContent = '今天辛苦了！攤車還在，明天繼續奮鬥 💪';

    const statsBox = document.createElement('div');
    statsBox.style.cssText = 'margin: 12px 0; padding: 12px; border: 1px solid #333; border-radius: 4px; font-size: 14px; color: #aaaacc;';

    const stats = ['🌭 香腸銷售：placeholder', '💰 今日收入：placeholder', '📈 聲望變化：placeholder'];
    stats.forEach(stat => {
      const row = document.createElement('div');
      row.style.marginBottom = '6px';
      row.textContent = stat;
      statsBox.appendChild(row);
    });

    bodyEl.appendChild(storyText);
    bodyEl.appendChild(statsBox);

    const btnCenter = document.createElement('div');
    btnCenter.className = 'btn-center';

    const btn = document.createElement('button');
    btn.className = 'btn-neon';
    btn.textContent = '迎接明天 ☀️';
    btn.addEventListener('click', () => {
      EventBus.emit('summary-done', {});
    });
    btnCenter.appendChild(btn);

    panel.appendChild(titleEl);
    panel.appendChild(bodyEl);
    panel.appendChild(btnCenter);

    return panel;
  }

  destroy(): void {
    EventBus.off('show-panel', this.onShowPanel, this);
    EventBus.off('hide-panel', this.hideCurrentPanel, this);
    this.statusBar.destroy();
    this.overlay.remove();
  }
}

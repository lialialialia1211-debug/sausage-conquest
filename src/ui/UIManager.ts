import { EventBus } from '../utils/EventBus';
import { StatusBar } from './panels/StatusBar';
import { MorningPanel } from './panels/MorningPanel';
import type { SpoilageInfo } from './panels/MorningPanel';
import { MapPanel } from './panels/MapPanel';
import { BattlePrepPanel } from './panels/BattlePrepPanel';
import type { BattlePrepData } from './panels/BattlePrepPanel';
import { SummaryPanel } from './panels/SummaryPanel';
import type { SummaryData } from './panels/SummaryPanel';
import { EndingPanel } from './panels/EndingPanel';
import type { EndingData } from './panels/EndingPanel';
import { ShopPanel } from './panels/ShopPanel';
import { SausageBoxPanel } from './panels/SausageBoxPanel';
import { BlackMarketPanel } from './panels/BlackMarketPanel';
import { CasinoPanel } from './panels/CasinoPanel';
import { StoryVideoPanel, type StoryVideoData } from './panels/StoryVideoPanel';
import { SongSelectPanel } from './panels/SongSelectPanel';
import './styles/neon.css';

// UIManager: controls which HTML overlay panel is shown/hidden
// Listens to EventBus 'show-panel' events from Phaser scenes
interface PanelInstance {
  getElement(): HTMLElement;
  destroy?(): void;
}

export class UIManager {
  private overlay: HTMLElement;
  private panelArea: HTMLElement;
  private statusBar: StatusBar;
  private currentPanel: HTMLElement | null = null;
  private currentPanelInstance: PanelInstance | null = null;

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

  private onShowPanel = (panelName: string, data?: unknown): void => {
    this.hideCurrentPanel();

    const result = this.createPanelByName(panelName, data);
    if (result) {
      const el = result.instance.getElement();
      el.classList.add('fade-in');
      this.panelArea.appendChild(el);
      this.currentPanel = el;
      this.currentPanelInstance = result.instance;
    }
  };

  private hideCurrentPanel = (): void => {
    if (this.currentPanelInstance?.destroy) {
      this.currentPanelInstance.destroy();
    }
    if (this.currentPanel) {
      this.currentPanel.remove();
      this.currentPanel = null;
    }
    this.currentPanelInstance = null;
    // Safety: clear any orphaned panels not tracked by UIManager
    while (this.panelArea.firstChild) {
      this.panelArea.removeChild(this.panelArea.firstChild);
    }
  };

  private createPanelByName(name: string, data?: unknown): { instance: PanelInstance } | null {
    switch (name) {
      case 'morning': {
        const spoilageInfo = data as SpoilageInfo | undefined;
        const morningPanel = new MorningPanel(spoilageInfo);
        return { instance: morningPanel };
      }
      case 'evening': {
        const mapPanel = new MapPanel();
        return { instance: mapPanel };
      }
      case 'battle-prep': {
        const prepPanel = new BattlePrepPanel(data as BattlePrepData);
        return { instance: prepPanel };
      }
      case 'summary': {
        const summaryData = data as SummaryData | undefined;
        if (summaryData) {
          const summaryPanel = new SummaryPanel(summaryData);
          return { instance: summaryPanel };
        }
        const el = this.createSummaryPanel();
        return { instance: { getElement: () => el } };
      }
      case 'ending': {
        const endingData = data as EndingData | undefined;
        if (endingData) {
          const endingPanel = new EndingPanel(endingData);
          return { instance: endingPanel };
        }
        return null;
      }
      case 'event': {
        const el = this.createPlaceholderPanel('突發事件', 'event-done', '繼續 ▶');
        return { instance: { getElement: () => el } };
      }
      case 'shop': {
        const shopPanel = new ShopPanel();
        return { instance: shopPanel };
      }
      case 'sausage-box': {
        const sausageBoxPanel = new SausageBoxPanel();
        return { instance: sausageBoxPanel };
      }
      case 'black-market': {
        const bmPanel = new BlackMarketPanel();
        return { instance: bmPanel };
      }
      case 'casino': {
        const casinoPanel = new CasinoPanel();
        return { instance: casinoPanel };
      }
      case 'story-video': {
        const storyVideoPanel = new StoryVideoPanel(data as StoryVideoData | undefined);
        return { instance: storyVideoPanel };
      }
      case 'song-select': {
        const songSelectPanel = new SongSelectPanel();
        return { instance: songSelectPanel };
      }
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
    titleEl.textContent = '今日結算';

    const bodyEl = document.createElement('div');
    bodyEl.className = 'panel-body';

    const storyText = document.createElement('div');
    storyText.className = 'story-text';
    storyText.textContent = '今天辛苦了！攤車還在，明天繼續奮鬥';

    const statsBox = document.createElement('div');
    statsBox.style.cssText = 'margin: 12px 0; padding: 12px; border: 1px solid #333; border-radius: 4px; font-size: 14px; color: #aaaacc;';

    const stats = ['香腸銷售：placeholder', '今日收入：placeholder', '聲望變化：placeholder'];
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
    btn.textContent = '迎接明天';
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

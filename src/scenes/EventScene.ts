import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { gameState } from '../state/GameState';
import { rollDailyEvents } from '../systems/EventEngine';
import { EventPanel } from '../ui/panels/EventPanel';
import type { GameEvent } from '../data/events';

// EventScene: drives one or more random events per day via HTML overlay panels
export class EventScene extends Phaser.Scene {
  private readyForNext = false;
  private eventQueue: GameEvent[] = [];
  private currentEventPanel: EventPanel | null = null;
  private panelArea: HTMLElement | null = null;

  constructor() {
    super({ key: 'EventScene' });
  }

  create(): void {
    this.readyForNext = false;
    const { width, height } = this.scale;

    // Dark tinted background
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x05100a, 0x05100a, 0x0a1a10, 0x0a1a10, 1);
    bg.fillRect(0, 0, width, height);

    // Subtle atmosphere icon
    this.add.text(width / 2, height / 2, '', { fontSize: '80px' })
      .setOrigin(0.5)
      .setAlpha(0.08);

    this.cameras.main.fadeIn(400, 0, 0, 0);

    // Clean up any existing UIManager panel state
    EventBus.emit('hide-panel');

    // Cache the panel-area element for direct DOM mounting
    this.panelArea = document.getElementById('panel-area');

    EventBus.emit('scene-ready', 'EventScene');

    // Roll events for today
    this.eventQueue = rollDailyEvents();

    if (this.eventQueue.length === 0) {
      // No events today — skip straight to summary
      this.finishAllEvents();
      return;
    }

    // Show first event
    this.showNextEvent();
  }

  private showNextEvent(): void {
    const nextEvent = this.eventQueue.shift();
    if (!nextEvent) {
      this.finishAllEvents();
      return;
    }

    // Remove any stale listener before re-binding to prevent accumulation
    EventBus.off('event-done', this.onEventDone, this);

    // Clear all children from panel-area defensively, then remove tracked panel
    if (this.panelArea) {
      while (this.panelArea.firstChild) {
        this.panelArea.removeChild(this.panelArea.firstChild);
      }
    }
    this.removePanelFromDOM();

    // Show splash animation first, then mount panel
    this.showEventSplash(nextEvent, () => {
      this.currentEventPanel = new EventPanel(nextEvent);
      const el = this.currentEventPanel.getElement();
      el.classList.add('fade-in');

      if (this.panelArea) {
        this.panelArea.appendChild(el);
      }

      // Listen for this event's completion
      EventBus.once('event-done', this.onEventDone, this);
    });
  }

  private showEventSplash(_event: GameEvent, onComplete: () => void): void {
    const { width: w, height: h } = this.scale;

    if (this.textures.exists('karen-alert')) {
      const splash = this.add.image(w / 2, h / 2, 'karen-alert').setDepth(300);
      const maxScale = Math.min((w * 0.7) / splash.width, (h * 0.55) / splash.height);
      splash.setScale(0).setAlpha(0);

      this.tweens.add({
        targets: splash,
        scale: { from: 0, to: maxScale },
        alpha: { from: 0, to: 1 },
        duration: 300,
        ease: 'Back.Out',
        onComplete: () => {
          this.cameras.main.shake(300, 0.012);
          this.time.delayedCall(1200, () => {
            this.tweens.add({
              targets: splash,
              alpha: 0,
              duration: 1200,
              ease: 'Power2',
              onComplete: () => {
                splash.destroy();
                onComplete();
              },
            });
          });
        },
      });
    } else {
      onComplete();
    }
  }

  private onEventDone = (): void => {
    if (this.eventQueue.length > 0) {
      this.showNextEvent();
    } else {
      this.finishAllEvents();
    }
  };

  private removePanelFromDOM(): void {
    if (this.currentEventPanel) {
      const el = this.currentEventPanel.getElement();
      if (el.parentElement) {
        el.parentElement.removeChild(el);
      }
      this.currentEventPanel.destroy();
      this.currentEventPanel = null;
    }
  }

  private finishAllEvents(): void {
    if (this.readyForNext) return;
    this.readyForNext = true;

    this.removePanelFromDOM();

    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      // After events: battle check (every 2 days), then summary
      if (gameState.day % 2 === 0) {
        this.scene.start('BattleScene');
      } else {
        this.scene.start('SummaryScene');
      }
    });
  }

  shutdown(): void {
    EventBus.off('event-done', this.onEventDone, this);
    this.removePanelFromDOM();
  }
}

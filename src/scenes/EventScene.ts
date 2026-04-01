import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { gameState } from '../state/GameState';

// EventScene: placeholder — random events (triggers overlay)
// Not in basic P0 cycle, skipped until later
export class EventScene extends Phaser.Scene {
  private readyForNext = false;

  constructor() {
    super({ key: 'EventScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x05100a, 0x05100a, 0x0a1a10, 0x0a1a10, 1);
    bg.fillRect(0, 0, width, height);

    this.add.text(cx, cy, '📰', { fontSize: '80px' }).setOrigin(0.5).setAlpha(0.15);

    this.add.text(cx, cy + 70, `Day ${gameState.day} 突發事件`, {
      fontSize: '18px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#224433',
    }).setOrigin(0.5);

    this.cameras.main.fadeIn(400, 0, 0, 0);

    EventBus.emit('show-panel', 'event');
    EventBus.emit('scene-ready', 'EventScene');

    EventBus.once('event-done', this.onEventDone, this);
  }

  private onEventDone = (): void => {
    if (this.readyForNext) return;
    this.readyForNext = true;

    EventBus.emit('hide-panel');
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('SummaryScene');
    });
  };

  shutdown(): void {
    EventBus.off('event-done', this.onEventDone, this);
  }
}

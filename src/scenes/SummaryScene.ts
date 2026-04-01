import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { gameState, advanceDay } from '../state/GameState';

// SummaryScene: daily summary — triggers HTML overlay
// After confirmation, advances to next day Morning
export class SummaryScene extends Phaser.Scene {
  private readyForNext = false;

  constructor() {
    super({ key: 'SummaryScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x050510, 0x050510, 0x0a0a1a, 0x0a0a1a, 1);
    bg.fillRect(0, 0, width, height);

    this.add.text(cx, cy, '📊', {
      fontSize: '80px',
    }).setOrigin(0.5).setAlpha(0.12);

    this.add.text(cx, cy + 70, `Day ${gameState.day} 結算中...`, {
      fontSize: '18px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#222244',
    }).setOrigin(0.5);

    this.cameras.main.fadeIn(400, 0, 0, 0);

    EventBus.emit('show-panel', 'summary');
    EventBus.emit('scene-ready', 'SummaryScene');

    EventBus.once('summary-done', this.onSummaryDone, this);
  }

  private onSummaryDone = (): void => {
    if (this.readyForNext) return;
    this.readyForNext = true;

    // Advance to next day
    advanceDay();

    EventBus.emit('hide-panel');
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      // Loop back to Morning for the new day
      this.scene.start('MorningScene');
    });
  };

  shutdown(): void {
    EventBus.off('summary-done', this.onSummaryDone, this);
  }
}

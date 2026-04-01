import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { gameState } from '../state/GameState';

// MorningScene: placeholder — procurement phase
// Triggers HTML overlay panel, waits for morning-done event
export class MorningScene extends Phaser.Scene {
  private readyForNext = false;

  constructor() {
    super({ key: 'MorningScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    // Phaser background for this scene
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0f0f1a, 0x0f0f1a, 0x1a1a2e, 0x1a1a2e, 1);
    bg.fillRect(0, 0, width, height);

    // Scene label (behind the overlay panel)
    this.add.text(cx, cy, '🌅', {
      fontSize: '80px',
    }).setOrigin(0.5).setAlpha(0.15);

    this.add.text(cx, cy + 70, `Day ${gameState.day} 早上`, {
      fontSize: '20px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#333355',
    }).setOrigin(0.5);

    this.cameras.main.fadeIn(400, 0, 0, 0);

    // Show HTML overlay panel
    EventBus.emit('show-panel', 'morning');
    EventBus.emit('scene-ready', 'MorningScene');

    // Wait for HTML panel to emit morning-done
    EventBus.once('morning-done', this.onMorningDone, this);
  }

  private onMorningDone = (): void => {
    if (this.readyForNext) return;
    this.readyForNext = true;

    EventBus.emit('hide-panel');
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('EveningScene');
    });
  };

  shutdown(): void {
    EventBus.off('morning-done', this.onMorningDone, this);
  }
}

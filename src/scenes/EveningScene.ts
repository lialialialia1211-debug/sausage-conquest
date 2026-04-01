import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { gameState } from '../state/GameState';

// EveningScene: placeholder — grid selection + pricing phase
// Triggers HTML overlay panel, waits for evening-done event
export class EveningScene extends Phaser.Scene {
  private readyForNext = false;

  constructor() {
    super({ key: 'EveningScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0f0a00, 0x0f0a00, 0x1a1200, 0x1a1200, 1);
    bg.fillRect(0, 0, width, height);

    this.add.text(cx, cy, '🌆', {
      fontSize: '80px',
    }).setOrigin(0.5).setAlpha(0.15);

    this.add.text(cx, cy + 70, `Day ${gameState.day} 傍晚`, {
      fontSize: '20px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#332200',
    }).setOrigin(0.5);

    this.cameras.main.fadeIn(400, 0, 0, 0);

    EventBus.emit('show-panel', 'evening');
    EventBus.emit('scene-ready', 'EveningScene');

    EventBus.once('evening-done', this.onEveningDone, this);
  }

  private onEveningDone = (): void => {
    if (this.readyForNext) return;
    this.readyForNext = true;

    EventBus.emit('hide-panel');
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('GrillScene');
    });
  };

  shutdown(): void {
    EventBus.off('evening-done', this.onEveningDone, this);
  }
}

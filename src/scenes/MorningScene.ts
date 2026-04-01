import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { gameState, updateGameState } from '../state/GameState';
import { spoilOvernight } from '../systems/EconomyEngine';

// MorningScene: procurement phase
// Calls spoilOvernight() first, then triggers HTML overlay panel
export class MorningScene extends Phaser.Scene {
  private readyForNext = false;

  constructor() {
    super({ key: 'MorningScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    // Reset daily expenses at start of each morning
    updateGameState({ dailyExpenses: 0 });

    // Apply overnight spoilage before showing panel
    // Only spoil on day 2+ (day 1 starts with empty inventory)
    const spoilage = gameState.day > 1 ? spoilOvernight() : {};

    // Phaser background: morning sky gradient
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a0a1a, 0x0a0a1a, 0x1a1a3e, 0x101030, 1);
    bg.fillRect(0, 0, width, height);

    // Subtle morning glow at the top
    const glow = this.add.graphics();
    glow.fillGradientStyle(0x221100, 0x221100, 0x0a0a1a, 0x0a0a1a, 0.6);
    glow.fillRect(0, 0, width, height * 0.4);

    // Background scene label
    this.add.text(cx, cy - 20, '🌅', {
      fontSize: '80px',
    }).setOrigin(0.5).setAlpha(0.12);

    this.add.text(cx, cy + 60, `Day ${gameState.day} 早上`, {
      fontSize: '20px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#2a2a55',
    }).setOrigin(0.5);

    this.cameras.main.fadeIn(400, 0, 0, 0);

    // Show HTML overlay panel, passing spoilage data
    EventBus.emit('show-panel', 'morning', { spoilage });
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

import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { gameState } from '../state/GameState';

interface EveningDonePayload {
  selectedSlot: number;
  prices: Record<string, number>;
}

// EveningScene: sunset ambiance background + MapPanel HTML overlay
// Waits for evening-done event then transitions to GrillScene
export class EveningScene extends Phaser.Scene {
  private readyForNext = false;
  private twinkleDots: Phaser.GameObjects.Graphics[] = [];
  private lightTweens: Phaser.Tweens.Tween[] = [];

  constructor() {
    super({ key: 'EveningScene' });
  }

  create(): void {
    this.readyForNext = false;
    this.twinkleDots = [];
    this.lightTweens = [];

    // If skipDay is set, bypass the grill entirely and jump to EventScene
    if (gameState.skipDay) {
      this.scene.start('EventScene');
      return;
    }

    const { width, height } = this.scale;
    const cx = width / 2;

    // Sunset gradient background
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x1a0830, 0x1a0830, 0x6b1f2a, 0x6b1f2a, 1);
    bg.fillRect(0, 0, width, height / 2);

    const bgLow = this.add.graphics();
    bgLow.fillGradientStyle(0x6b1f2a, 0x6b1f2a, 0x0a0a0f, 0x0a0a0f, 1);
    bgLow.fillRect(0, height / 2, width, height / 2);

    // Horizon glow
    const horizonGlow = this.add.graphics();
    horizonGlow.fillGradientStyle(0xff6b00, 0xff6b00, 0x6b1f2a, 0x6b1f2a, 0.6, 0.6, 0, 0);
    horizonGlow.fillRect(0, height * 0.35, width, height * 0.25);

    // Day label (dim, behind panel)
    this.add.text(cx, height * 0.6, `Day ${gameState.day} 傍晚`, {
      fontSize: '18px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#554433',
    }).setOrigin(0.5).setAlpha(0.4);

    // Twinkling light dots (decorative night market atmosphere)
    this.createTwinklingLights(width, height);

    this.cameras.main.fadeIn(400, 0, 0, 0);

    EventBus.emit('show-panel', 'evening');
    EventBus.emit('scene-ready', 'EveningScene');

    EventBus.once('evening-done', this.onEveningDone, this);
  }

  private createTwinklingLights(width: number, height: number): void {
    const lightColors = [0xffe600, 0xff6b00, 0xff00aa, 0x00f5ff];
    const count = 30;

    for (let i = 0; i < count; i++) {
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(height * 0.55, height * 0.95);
      const color = Phaser.Utils.Array.GetRandom(lightColors) as number;
      const radius = Phaser.Math.FloatBetween(1.5, 3.5);

      const dot = this.add.graphics();
      dot.fillStyle(color, 0.8);
      dot.fillCircle(x, y, radius);
      this.twinkleDots.push(dot);

      // Twinkling tween with random delay
      const tween = this.tweens.add({
        targets: dot,
        alpha: { from: 0.2, to: 1 },
        duration: Phaser.Math.Between(600, 1800),
        delay: Phaser.Math.Between(0, 2000),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.lightTweens.push(tween);
    }
  }

  private onEveningDone = (data: EveningDonePayload): void => {
    if (this.readyForNext) return;
    this.readyForNext = true;

    // Data is already stored in gameState by MapPanel before emit.
    // Log for debugging (will be removed in production)
    void data; // acknowledge parameter to avoid lint warning

    EventBus.emit('hide-panel');
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('GrillScene');
    });
  };

  shutdown(): void {
    EventBus.off('evening-done', this.onEveningDone, this);
    // Tweens are cleaned up automatically by Phaser on scene shutdown
    this.twinkleDots = [];
    this.lightTweens = [];
  }
}

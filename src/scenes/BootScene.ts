import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';

// BootScene: opening title + story + start button
// Transitions to MorningScene when player clicks start
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    // Background gradient effect using graphics
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a0a0f, 0x0a0a0f, 0x12121a, 0x12121a, 1);
    bg.fillRect(0, 0, width, height);

    // Decorative neon lines
    this.drawNeonLines(bg, width, height);

    // Title: 腸征天下
    const title = this.add.text(cx, cy - 140, '腸征天下', {
      fontSize: '56px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#ffe600',
      stroke: '#ff6b00',
      strokeThickness: 2,
      shadow: { blur: 16, color: '#ffe600', fill: true },
    }).setOrigin(0.5);

    // Flicker animation for title
    this.tweens.add({
      targets: title,
      alpha: { from: 1, to: 0.85 },
      duration: 120,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
      delay: 3000,
      repeatDelay: 2000,
    });

    // Subtitle
    this.add.text(cx, cy - 78, '台灣夜市香腸征服之路', {
      fontSize: '18px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#ff6b00',
    }).setOrigin(0.5);

    // Opening story text
    const storyLines = [
      '恭喜你被優化了！',
      '遣散費 $5,000，',
      '剛好夠買一台有點生鏽的攤車。',
      '',
      '從今天起，你是夜市香腸老闆。',
    ];

    const storyBg = this.add.graphics();
    storyBg.fillStyle(0x12121a, 0.9);
    storyBg.lineStyle(1, 0xffe600, 0.4);
    storyBg.fillRoundedRect(cx - 260, cy - 50, 520, 130, 6);
    storyBg.strokeRoundedRect(cx - 260, cy - 50, 520, 130, 6);

    const storyText = this.add.text(cx, cy + 15, storyLines.join('\n'), {
      fontSize: '16px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#ccccee',
      align: 'center',
      lineSpacing: 6,
    }).setOrigin(0.5);

    // Animate story text fade in
    storyBg.setAlpha(0);
    storyText.setAlpha(0);
    this.tweens.add({
      targets: [storyBg, storyText],
      alpha: 1,
      duration: 800,
      delay: 400,
      ease: 'Power2',
    });

    // Start button
    const btnBg = this.add.graphics();
    const btnX = cx - 80;
    const btnY = cy + 110;
    const btnW = 160;
    const btnH = 44;

    btnBg.fillStyle(0x0a0a0f, 0.95);
    btnBg.lineStyle(2, 0xffe600, 1);
    btnBg.fillRoundedRect(btnX, btnY, btnW, btnH, 4);
    btnBg.strokeRoundedRect(btnX, btnY, btnW, btnH, 4);
    btnBg.setAlpha(0);

    const btnText = this.add.text(cx, btnY + btnH / 2, '開始擺攤 🌭', {
      fontSize: '18px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#ffe600',
    }).setOrigin(0.5).setAlpha(0);

    // Invisible interactive zone over the button
    const hitZone = this.add.zone(cx, btnY + btnH / 2, btnW, btnH)
      .setInteractive({ cursor: 'pointer' });

    // Fade in button after story
    this.tweens.add({
      targets: [btnBg, btnText],
      alpha: 1,
      duration: 600,
      delay: 1400,
      ease: 'Power2',
    });

    // Button hover glow
    hitZone.on('pointerover', () => {
      btnBg.clear();
      btnBg.fillStyle(0xffe600, 0.15);
      btnBg.lineStyle(2, 0xffe600, 1);
      btnBg.fillRoundedRect(btnX, btnY, btnW, btnH, 4);
      btnBg.strokeRoundedRect(btnX, btnY, btnW, btnH, 4);
      this.tweens.add({ targets: btnText, scaleX: 1.05, scaleY: 1.05, duration: 100 });
    });

    hitZone.on('pointerout', () => {
      btnBg.clear();
      btnBg.fillStyle(0x0a0a0f, 0.95);
      btnBg.lineStyle(2, 0xffe600, 1);
      btnBg.fillRoundedRect(btnX, btnY, btnW, btnH, 4);
      btnBg.strokeRoundedRect(btnX, btnY, btnW, btnH, 4);
      this.tweens.add({ targets: btnText, scaleX: 1, scaleY: 1, duration: 100 });
    });

    hitZone.on('pointerdown', () => {
      this.cameras.main.fadeOut(500, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('MorningScene');
      });
    });

    // Notify EventBus that BootScene is active (for UI testing)
    EventBus.emit('scene-ready', 'BootScene');

    // Test bidirectional EventBus: listen for external signal
    EventBus.once('test-boot', () => {
      console.log('[EventBus] BootScene received test-boot signal from UI');
    });
  }

  private drawNeonLines(g: Phaser.GameObjects.Graphics, w: number, h: number): void {
    g.lineStyle(1, 0xffe600, 0.08);
    for (let i = 0; i < 8; i++) {
      const y = (h / 8) * i;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.strokePath();
    }
    g.lineStyle(1, 0xff6b00, 0.06);
    for (let i = 0; i < 12; i++) {
      const x = (w / 12) * i;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.strokePath();
    }
  }
}

import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { gameState } from '../state/GameState';

// GrillScene: placeholder — grilling mini-game (pure Phaser, no overlay)
// In P0: just shows placeholder and a Next button
export class GrillScene extends Phaser.Scene {
  private readyForNext = false;

  constructor() {
    super({ key: 'GrillScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    // Dark warm glow background — grill vibe
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x100500, 0x100500, 0x1a0800, 0x1a0800, 1);
    bg.fillRect(0, 0, width, height);

    // Decorative grill effect
    const grillGraphic = this.add.graphics();
    grillGraphic.lineStyle(2, 0xff3300, 0.15);
    for (let i = 0; i < 10; i++) {
      const y = (height / 10) * i + 40;
      grillGraphic.beginPath();
      grillGraphic.moveTo(cx - 200, y);
      grillGraphic.lineTo(cx + 200, y);
      grillGraphic.strokePath();
    }

    // Big fire emoji as scene indicator
    this.add.text(cx, cy - 60, '🔥', {
      fontSize: '90px',
    }).setOrigin(0.5);

    this.add.text(cx, cy + 50, '烤制小遊戲', {
      fontSize: '28px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#ff6b00',
      shadow: { blur: 12, color: '#ff3300', fill: true },
    }).setOrigin(0.5);

    this.add.text(cx, cy + 90, `Day ${gameState.day} — 夜晚`, {
      fontSize: '16px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#664422',
    }).setOrigin(0.5);

    this.add.text(cx, cy + 130, '（placeholder — Task 4 實作）', {
      fontSize: '13px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#443322',
    }).setOrigin(0.5);

    // Next button (pure Phaser)
    this.createNextButton(cx, cy + 185);

    this.cameras.main.fadeIn(400, 0, 0, 0);
    EventBus.emit('scene-ready', 'GrillScene');
  }

  private createNextButton(x: number, y: number): void {
    const btnW = 160;
    const btnH = 44;
    const btnBg = this.add.graphics();
    btnBg.fillStyle(0x100500, 0.95);
    btnBg.lineStyle(2, 0xff6b00, 1);
    btnBg.fillRoundedRect(x - btnW / 2, y - btnH / 2, btnW, btnH, 4);
    btnBg.strokeRoundedRect(x - btnW / 2, y - btnH / 2, btnW, btnH, 4);

    this.add.text(x, y, '結束營業 ▶', {
      fontSize: '16px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#ff6b00',
    }).setOrigin(0.5);

    const hitZone = this.add.zone(x, y, btnW, btnH).setInteractive({ cursor: 'pointer' });

    hitZone.on('pointerover', () => {
      btnBg.clear();
      btnBg.fillStyle(0xff6b00, 0.15);
      btnBg.lineStyle(2, 0xff6b00, 1);
      btnBg.fillRoundedRect(x - btnW / 2, y - btnH / 2, btnW, btnH, 4);
      btnBg.strokeRoundedRect(x - btnW / 2, y - btnH / 2, btnW, btnH, 4);
    });

    hitZone.on('pointerout', () => {
      btnBg.clear();
      btnBg.fillStyle(0x100500, 0.95);
      btnBg.lineStyle(2, 0xff6b00, 1);
      btnBg.fillRoundedRect(x - btnW / 2, y - btnH / 2, btnW, btnH, 4);
      btnBg.strokeRoundedRect(x - btnW / 2, y - btnH / 2, btnW, btnH, 4);
    });

    hitZone.on('pointerdown', () => {
      if (this.readyForNext) return;
      this.readyForNext = true;

      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('SummaryScene');
      });
    });
  }
}

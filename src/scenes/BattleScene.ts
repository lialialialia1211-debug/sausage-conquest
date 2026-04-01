import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { gameState } from '../state/GameState';

// BattleScene: placeholder — territory battle (pure Phaser)
// Not in basic P0 cycle, skipped until Task 5
export class BattleScene extends Phaser.Scene {

  constructor() {
    super({ key: 'BattleScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a0005, 0x0a0005, 0x150010, 0x150010, 1);
    bg.fillRect(0, 0, width, height);

    this.add.text(cx, cy - 60, '⚔️', { fontSize: '80px' }).setOrigin(0.5);

    this.add.text(cx, cy + 30, '地盤爭奪戰', {
      fontSize: '28px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#ff2d55',
      shadow: { blur: 12, color: '#ff0055', fill: true },
    }).setOrigin(0.5);

    this.add.text(cx, cy + 70, `Day ${gameState.day} — 深夜`, {
      fontSize: '16px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#441122',
    }).setOrigin(0.5);

    this.add.text(cx, cy + 110, '（placeholder — Task 5 實作）', {
      fontSize: '13px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#332233',
    }).setOrigin(0.5);

    this.cameras.main.fadeIn(400, 0, 0, 0);
    EventBus.emit('scene-ready', 'BattleScene');
  }
}

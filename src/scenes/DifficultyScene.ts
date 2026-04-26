// DifficultyScene — 難度選擇畫面（指烤火拼 / 小烤怡情）
import Phaser from 'phaser';
import { updateGameState } from '../state/GameState';
import { sfx } from '../utils/SoundFX';

const FONT = 'Microsoft JhengHei, PingFang TC, sans-serif';

export class DifficultyScene extends Phaser.Scene {
  constructor() {
    super({ key: 'DifficultyScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    const cx = width / 2;

    // 黑底
    this.cameras.main.setBackgroundColor('#0a0a14');

    // 頂部 LOGO（縮小版，置中）
    if (this.textures.exists('logo-ex')) {
      const logo = this.add.image(cx, height * 0.15, 'logo-ex');
      const maxW = width * 0.55;
      const maxH = height * 0.20;
      const s = Math.min(maxW / logo.width, maxH / logo.height);
      logo.setScale(s).setDepth(10);
    }

    // 斜切分隔：左 hardcore 深藍，右 casual 淺灰
    const topY  = height * 0.30;
    const botY  = height * 0.85;
    const skew  = width * 0.08;   // 斜切偏移量

    // 左區塊頂右端向右偏 → 底左端不偏，造成由左上到右下的切割效果
    const leftPoints = [
      new Phaser.Math.Vector2(0,               topY),
      new Phaser.Math.Vector2(width * 0.55 + skew, topY),
      new Phaser.Math.Vector2(width * 0.45 - skew, botY),
      new Phaser.Math.Vector2(0,               botY),
    ];

    const rightPoints = [
      new Phaser.Math.Vector2(width * 0.55 + skew, topY),
      new Phaser.Math.Vector2(width,              topY),
      new Phaser.Math.Vector2(width,              botY),
      new Phaser.Math.Vector2(width * 0.45 - skew, botY),
    ];

    // 繪製左區塊（深藍）
    const leftGfx = this.add.graphics().setDepth(5);
    leftGfx.fillStyle(0x142036, 1);
    leftGfx.fillPoints(leftPoints, true);
    leftGfx.lineStyle(4, 0xff6b00, 0.9);
    leftGfx.strokePoints(leftPoints, true);

    // 繪製右區塊（淺灰）
    const rightGfx = this.add.graphics().setDepth(5);
    rightGfx.fillStyle(0xd8dde6, 1);
    rightGfx.fillPoints(rightPoints, true);
    rightGfx.lineStyle(4, 0xff6b00, 0.9);
    rightGfx.strokePoints(rightPoints, true);

    // 橙色斜線分隔（額外強調）
    const midGfx = this.add.graphics().setDepth(6);
    midGfx.lineStyle(6, 0xff6b00, 1);
    midGfx.beginPath();
    midGfx.moveTo(width * 0.55 + skew, topY);
    midGfx.lineTo(width * 0.45 - skew, botY);
    midGfx.strokePath();

    // 中央 Y 位置
    const midY = (topY + botY) * 0.5;

    // 左區塊文字
    const leftTitleText = this.add.text(width * 0.22, midY - 10, '指烤火拼', {
      fontSize: '64px',
      fontFamily: FONT,
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(20);

    this.add.text(width * 0.22, midY + 52, 'HARDCORE', {
      fontSize: '20px',
      fontFamily: FONT,
      color: '#ff6b00',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(20);

    this.add.text(width * 0.22, midY + 82, '節拍密、判定嚴', {
      fontSize: '14px',
      fontFamily: FONT,
      color: '#aaaaaa',
    }).setOrigin(0.5).setDepth(20);

    // 右區塊文字
    const rightTitleText = this.add.text(width * 0.78, midY - 10, '小烤怡情', {
      fontSize: '64px',
      fontFamily: FONT,
      color: '#1a1a1a',
      stroke: '#ffffff',
      strokeThickness: 3,
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(20);

    this.add.text(width * 0.78, midY + 52, 'CASUAL', {
      fontSize: '20px',
      fontFamily: FONT,
      color: '#ff6b00',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(20);

    this.add.text(width * 0.78, midY + 82, '節拍鬆、判定寬', {
      fontSize: '14px',
      fontFamily: FONT,
      color: '#444444',
    }).setOrigin(0.5).setDepth(20);

    // 底部劇情敘述
    this.add.text(cx, height * 0.93, '今晚的烤火，要烈一點 還是溫一點？', {
      fontSize: '15px',
      fontFamily: FONT,
      color: '#888888',
    }).setOrigin(0.5).setDepth(20);

    // 互動區域：左（hardcore）
    const leftZone = this.add.zone(
      width * 0.22, midY + 30,
      width * 0.44, (botY - topY) * 0.85,
    ).setInteractive({ cursor: 'pointer' }).setDepth(30);

    leftZone.on('pointerdown', () => this.selectDifficulty('hardcore'));
    leftZone.on('pointerover', () => { leftTitleText.setScale(1.06); });
    leftZone.on('pointerout',  () => { leftTitleText.setScale(1); });

    // 互動區域：右（casual）
    const rightZone = this.add.zone(
      width * 0.78, midY + 30,
      width * 0.44, (botY - topY) * 0.85,
    ).setInteractive({ cursor: 'pointer' }).setDepth(30);

    rightZone.on('pointerdown', () => this.selectDifficulty('casual'));
    rightZone.on('pointerover', () => { rightTitleText.setScale(1.06); });
    rightZone.on('pointerout',  () => { rightTitleText.setScale(1); });
  }

  private selectDifficulty(diff: 'hardcore' | 'casual'): void {
    sfx.playClick();
    updateGameState({ difficulty: diff });
    this.cameras.main.fade(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('MorningScene');
    });
  }
}

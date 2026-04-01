// SausageSprite — Phaser Container representing one sausage on the grill
import Phaser from 'phaser';
import type { GrillingSausage } from '../systems/GrillEngine';
import {
  getSausageColor,
  getDonenessBarColor,
  judgeQuality,
  getAverageDoneness,
} from '../systems/GrillEngine';
import { SAUSAGE_MAP } from '../data/sausages';

const SAUSAGE_W = 80;
const SAUSAGE_H = 30;
const BAR_H = 6;
const BAR_Y_OFFSET = -SAUSAGE_H / 2 - BAR_H - 4; // above sausage

export class SausageSprite extends Phaser.GameObjects.Container {
  private sausageGfx: Phaser.GameObjects.Graphics;
  private donenessBar: Phaser.GameObjects.Graphics;
  private labelText: Phaser.GameObjects.Text;
  private isFlipping = false;
  private onFlipCallback: (() => void) | null = null;
  private onServeCallback: (() => void) | null = null;
  private smokeParticles: Phaser.GameObjects.Text[] = [];
  private _data: GrillingSausage;

  constructor(scene: Phaser.Scene, x: number, y: number, sausage: GrillingSausage) {
    super(scene, x, y);
    this._data = sausage;
    scene.add.existing(this);

    // Sausage body (drawn via Graphics)
    this.sausageGfx = scene.add.graphics();
    this.add(this.sausageGfx);

    // Doneness bar
    this.donenessBar = scene.add.graphics();
    this.add(this.donenessBar);

    // Emoji/name label
    const sausageType = SAUSAGE_MAP[sausage.sausageTypeId];
    const emoji = sausageType?.emoji ?? '🌭';
    this.labelText = scene.add.text(0, SAUSAGE_H / 2 + 14, emoji, {
      fontSize: '18px',
      align: 'center',
    }).setOrigin(0.5);
    this.add(this.labelText);

    // Hit area — generous for easy clicking
    const hitZone = scene.add.zone(0, 0, SAUSAGE_W + 20, SAUSAGE_H + 40)
      .setInteractive({ cursor: 'pointer' });
    this.add(hitZone);

    hitZone.on('pointerdown', () => this.handleClick());
    hitZone.on('pointerover', () => {
      this.sausageGfx.setAlpha(0.85);
    });
    hitZone.on('pointerout', () => {
      this.sausageGfx.setAlpha(1);
    });

    this.redraw();
  }

  get sausageData(): GrillingSausage {
    return this._data;
  }

  updateData(sausage: GrillingSausage): void {
    this._data = sausage;
    this.redraw();
  }

  onFlip(cb: () => void): this {
    this.onFlipCallback = cb;
    return this;
  }

  onServe(cb: () => void): this {
    this.onServeCallback = cb;
    return this;
  }

  private handleClick(): void {
    if (this._data.served || this.isFlipping) return;

    const quality = judgeQuality(this._data);

    if (quality === 'burnt') return; // burnt handled automatically

    // If sausage is ready (ok or perfect), trigger serve; otherwise flip
    if (quality === 'ok' || quality === 'perfect') {
      if (this.onServeCallback) {
        this.onServeCallback();
      }
    } else {
      // raw or still cooking — flip it
      this.triggerFlip();
    }
  }

  triggerFlip(): void {
    if (this.isFlipping || this._data.served) return;
    this.isFlipping = true;

    // Animate: squish scaleY to 0, then back to 1 (flip effect)
    this.scene.tweens.add({
      targets: this,
      scaleY: 0,
      duration: 100,
      ease: 'Power1',
      onComplete: () => {
        if (this.onFlipCallback) this.onFlipCallback();
        this.redraw();
        this.scene.tweens.add({
          targets: this,
          scaleY: 1,
          duration: 120,
          ease: 'Back.Out',
          onComplete: () => {
            this.isFlipping = false;
          },
        });
      },
    });
  }

  playServeAnimation(targetX: number, targetY: number): void {
    // Fly toward customer area + sparkles
    this.scene.tweens.add({
      targets: this,
      x: this.x + (targetX - this.x) * 0.3,
      y: targetY,
      scaleX: 0.3,
      scaleY: 0.3,
      alpha: 0,
      duration: 400,
      ease: 'Power2',
      onComplete: () => {
        this.destroy();
      },
    });
    this.spawnSparkles();
  }

  playBurntAnimation(): void {
    // Shake + smoke
    this.scene.tweens.add({
      targets: this,
      x: this.x - 5,
      duration: 60,
      yoyo: true,
      repeat: 4,
      ease: 'Linear',
      onComplete: () => {
        this.spawnSmoke();
        this.scene.time.delayedCall(800, () => {
          this.scene.tweens.add({
            targets: this,
            alpha: 0,
            duration: 400,
            onComplete: () => this.destroy(),
          });
        });
      },
    });
  }

  private spawnSparkles(): void {
    const sparkleEmojis = ['✨', '⭐', '💫'];
    for (let i = 0; i < 4; i++) {
      const spark = this.scene.add.text(
        this.x + Phaser.Math.Between(-30, 30),
        this.y + Phaser.Math.Between(-20, 20),
        sparkleEmojis[i % sparkleEmojis.length],
        { fontSize: '18px' },
      ).setOrigin(0.5);

      this.scene.tweens.add({
        targets: spark,
        y: spark.y - 40,
        alpha: 0,
        duration: 600,
        ease: 'Power2',
        onComplete: () => spark.destroy(),
      });
    }
  }

  private spawnSmoke(): void {
    for (let i = 0; i < 3; i++) {
      const smoke = this.scene.add.text(
        this.x + Phaser.Math.Between(-20, 20),
        this.y,
        '💨',
        { fontSize: '20px', alpha: 0.8 } as Phaser.Types.GameObjects.Text.TextStyle,
      ).setOrigin(0.5);

      this.smokeParticles.push(smoke);
      this.scene.tweens.add({
        targets: smoke,
        y: smoke.y - 50,
        alpha: 0,
        delay: i * 150,
        duration: 700,
        ease: 'Power1',
        onComplete: () => {
          smoke.destroy();
          const idx = this.smokeParticles.indexOf(smoke);
          if (idx >= 0) this.smokeParticles.splice(idx, 1);
        },
      });
    }
  }

  private redraw(): void {
    const sausage = this._data;
    const avgDoneness = getAverageDoneness(sausage);
    const color = getSausageColor(avgDoneness);

    // Draw sausage body
    this.sausageGfx.clear();

    // Shadow
    this.sausageGfx.fillStyle(0x000000, 0.25);
    this.sausageGfx.fillRoundedRect(
      -SAUSAGE_W / 2 + 3,
      -SAUSAGE_H / 2 + 4,
      SAUSAGE_W,
      SAUSAGE_H,
      SAUSAGE_H / 2,
    );

    // Main sausage body
    this.sausageGfx.fillStyle(color, 1);
    this.sausageGfx.fillRoundedRect(
      -SAUSAGE_W / 2,
      -SAUSAGE_H / 2,
      SAUSAGE_W,
      SAUSAGE_H,
      SAUSAGE_H / 2,
    );

    // Highlight sheen
    this.sausageGfx.fillStyle(0xffffff, 0.15);
    this.sausageGfx.fillRoundedRect(
      -SAUSAGE_W / 2 + 6,
      -SAUSAGE_H / 2 + 4,
      SAUSAGE_W - 20,
      SAUSAGE_H / 3,
      4,
    );

    // Doneness bar background
    this.donenessBar.clear();
    this.donenessBar.fillStyle(0x222222, 1);
    this.donenessBar.fillRect(-SAUSAGE_W / 2, BAR_Y_OFFSET, SAUSAGE_W, BAR_H);

    // Doneness fill (represents the side facing down — the active cooking side)
    const activeDoneness = sausage.currentSide === 'bottom'
      ? sausage.bottomDoneness
      : sausage.topDoneness;
    const barWidth = Math.round((activeDoneness / 100) * SAUSAGE_W);
    const barColor = getDonenessBarColor(activeDoneness);

    this.donenessBar.fillStyle(barColor, 1);
    this.donenessBar.fillRect(-SAUSAGE_W / 2, BAR_Y_OFFSET, barWidth, BAR_H);

    // Bar border
    this.donenessBar.lineStyle(1, 0x444444, 1);
    this.donenessBar.strokeRect(-SAUSAGE_W / 2, BAR_Y_OFFSET, SAUSAGE_W, BAR_H);

    // Small "flip side" indicator dots on sausage
    const otherDoneness = sausage.currentSide === 'bottom'
      ? sausage.topDoneness
      : sausage.bottomDoneness;
    const dotAlpha = otherDoneness > 20 ? 0.6 : 0.2;
    this.sausageGfx.fillStyle(0x000000, dotAlpha);
    for (let i = 0; i < 3; i++) {
      this.sausageGfx.fillCircle(-20 + i * 20, 4, 3);
    }
  }

  destroy(fromScene?: boolean): void {
    this.smokeParticles.forEach(s => {
      if (s && s.active) s.destroy();
    });
    this.smokeParticles = [];
    super.destroy(fromScene);
  }
}

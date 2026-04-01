// SausageSprite — Phaser Container representing one sausage on the grill
// Shows two separate doneness bars (top + bottom sides), grill marks, and serve/flip interactions
import Phaser from 'phaser';
import type { GrillingSausage } from '../systems/GrillEngine';
import {
  getSausageColor,
  getDonenessBarColor,
  judgeQuality,
  getAverageDoneness,
} from '../systems/GrillEngine';
import { SAUSAGE_MAP } from '../data/sausages';

const SAUSAGE_W = 60;
const SAUSAGE_H = 24;
const BAR_W = 56;
const BAR_H = 3;

// Top bar sits above sausage, bottom bar sits below
const TOP_BAR_Y = -(SAUSAGE_H / 2) - BAR_H - 4;
const BOTTOM_BAR_Y = (SAUSAGE_H / 2) + 4;
const LABEL_Y = SAUSAGE_H / 2 + 18;

// Perfect zone: 71-90% on a bar width of BAR_W
const PERFECT_MIN_PX = Math.round((71 / 100) * BAR_W);
const PERFECT_MAX_PX = Math.round((90 / 100) * BAR_W);
const PERFECT_W_PX = PERFECT_MAX_PX - PERFECT_MIN_PX;

export class SausageSprite extends Phaser.GameObjects.Container {
  private sausageGfx: Phaser.GameObjects.Graphics;
  private topBarGfx: Phaser.GameObjects.Graphics;
  private bottomBarGfx: Phaser.GameObjects.Graphics;
  private labelText: Phaser.GameObjects.Text;
  private readyGlow: Phaser.GameObjects.Graphics;

  private isFlipping = false;
  private onFlipCallback: (() => void) | null = null;
  private onServeCallback: (() => void) | null = null;
  private smokeParticles: Phaser.GameObjects.Text[] = [];
  private _data: GrillingSausage;

  // Pulsing tween for active bar
  private activePulseTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, sausage: GrillingSausage) {
    super(scene, x, y);
    this._data = sausage;
    scene.add.existing(this);

    // Ready glow (hidden by default)
    this.readyGlow = scene.add.graphics();
    this.add(this.readyGlow);

    // Sausage body graphics
    this.sausageGfx = scene.add.graphics();
    this.add(this.sausageGfx);

    // Two doneness bars
    this.topBarGfx = scene.add.graphics();
    this.add(this.topBarGfx);

    this.bottomBarGfx = scene.add.graphics();
    this.add(this.bottomBarGfx);

    // Emoji label
    const sausageType = SAUSAGE_MAP[sausage.sausageTypeId];
    const emoji = sausageType?.emoji ?? '🌭';
    this.labelText = scene.add.text(0, LABEL_Y, emoji, {
      fontSize: '16px',
      align: 'center',
    }).setOrigin(0.5);
    this.add(this.labelText);

    // Hit area
    const hitZone = scene.add.zone(0, 0, SAUSAGE_W + 24, SAUSAGE_H + 60)
      .setInteractive({ cursor: 'pointer' });
    this.add(hitZone);

    hitZone.on('pointerdown', () => this.handleClick());
    hitZone.on('pointerover', () => {
      this.sausageGfx.setAlpha(0.82);
    });
    hitZone.on('pointerout', () => {
      this.sausageGfx.setAlpha(1);
    });

    this.redraw();
    this.playNewSausageAnimation();
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
    if (quality === 'burnt') return;

    if (quality === 'ok' || quality === 'perfect') {
      if (this.onServeCallback) this.onServeCallback();
    } else {
      this.triggerFlip();
    }
  }

  triggerFlip(): void {
    if (this.isFlipping || this._data.served) return;
    this.isFlipping = true;

    this.scene.tweens.add({
      targets: this,
      scaleY: 0,
      duration: 75,
      ease: 'Power1',
      onComplete: () => {
        if (this.onFlipCallback) this.onFlipCallback();
        this.redraw();
        this.scene.tweens.add({
          targets: this,
          scaleY: 1,
          duration: 100,
          ease: 'Back.Out',
          onComplete: () => {
            this.isFlipping = false;
          },
        });
      },
    });
  }

  playServeAnimation(targetX: number, targetY: number): void {
    const quality = judgeQuality(this._data);
    const isPerfect = quality === 'perfect';

    if (isPerfect) {
      this.spawnSparkles();
    }

    this.scene.tweens.add({
      targets: this,
      x: this.x + (targetX - this.x) * 0.4,
      y: targetY,
      scaleX: 0.25,
      scaleY: 0.25,
      alpha: 0,
      duration: 380,
      ease: 'Power2',
      onComplete: () => {
        this.destroy();
      },
    });
  }

  playBurntAnimation(): void {
    this.scene.tweens.add({
      targets: this,
      x: this.x - 5,
      duration: 55,
      yoyo: true,
      repeat: 5,
      ease: 'Linear',
      onComplete: () => {
        this.spawnSmoke();
        this.scene.time.delayedCall(700, () => {
          this.scene.tweens.add({
            targets: this,
            alpha: 0,
            duration: 350,
            onComplete: () => this.destroy(),
          });
        });
      },
    });
  }

  playNewSausageAnimation(): void {
    // Slide up from below grill rack
    const originalY = this.y;
    this.y = originalY + 60;
    this.setAlpha(0);
    this.scene.tweens.add({
      targets: this,
      y: originalY,
      alpha: 1,
      duration: 280,
      ease: 'Back.Out',
    });
  }

  private spawnSparkles(): void {
    const sparkleEmojis = ['✨', '⭐', '💫'];
    for (let i = 0; i < 5; i++) {
      const spark = this.scene.add.text(
        this.x + Phaser.Math.Between(-35, 35),
        this.y + Phaser.Math.Between(-25, 10),
        sparkleEmojis[i % sparkleEmojis.length],
        { fontSize: '16px' },
      ).setOrigin(0.5).setDepth(200);

      this.scene.tweens.add({
        targets: spark,
        y: spark.y - 50,
        alpha: 0,
        duration: 700,
        delay: i * 80,
        ease: 'Power2',
        onComplete: () => spark.destroy(),
      });
    }
  }

  private spawnSmoke(): void {
    for (let i = 0; i < 4; i++) {
      const smoke = this.scene.add.text(
        this.x + Phaser.Math.Between(-22, 22),
        this.y,
        '💨',
        { fontSize: '20px' } as Phaser.Types.GameObjects.Text.TextStyle,
      ).setOrigin(0.5).setAlpha(0.8).setDepth(150);

      this.smokeParticles.push(smoke);
      this.scene.tweens.add({
        targets: smoke,
        y: smoke.y - 55,
        alpha: 0,
        delay: i * 130,
        duration: 750,
        ease: 'Power1',
        onComplete: () => {
          smoke.destroy();
          const idx = this.smokeParticles.indexOf(smoke);
          if (idx >= 0) this.smokeParticles.splice(idx, 1);
        },
      });
    }
  }

  private startActivePulse(targetGfx: Phaser.GameObjects.Graphics): void {
    // Stop existing pulse
    if (this.activePulseTween) {
      this.activePulseTween.stop();
      this.activePulseTween = null;
    }

    // Pulse alpha between 0.5 and 1 to indicate active cooking side
    this.activePulseTween = this.scene.tweens.add({
      targets: targetGfx,
      alpha: 0.55,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private stopActivePulse(): void {
    if (this.activePulseTween) {
      this.activePulseTween.stop();
      this.activePulseTween = null;
    }
    this.topBarGfx.setAlpha(1);
    this.bottomBarGfx.setAlpha(1);
  }

  private drawDonenessBar(
    gfx: Phaser.GameObjects.Graphics,
    doneness: number,
    yOffset: number,
  ): void {
    gfx.clear();

    const bx = -BAR_W / 2;

    // Background
    gfx.fillStyle(0x333333, 1);
    gfx.fillRect(bx, yOffset, BAR_W, BAR_H);

    // Fill
    const fillW = Math.round((Math.min(100, Math.max(0, doneness)) / 100) * BAR_W);
    if (fillW > 0) {
      gfx.fillStyle(getDonenessBarColor(doneness), 1);
      gfx.fillRect(bx, yOffset, fillW, BAR_H);
    }

    // Perfect zone indicator (blue tint)
    gfx.fillStyle(0x44aaff, 0.30);
    gfx.fillRect(bx + PERFECT_MIN_PX, yOffset, PERFECT_W_PX, BAR_H);

    // Border
    gfx.lineStyle(1, 0x555555, 0.8);
    gfx.strokeRect(bx, yOffset, BAR_W, BAR_H);
  }

  private redraw(): void {
    const sausage = this._data;
    const avgDoneness = getAverageDoneness(sausage);
    const color = getSausageColor(avgDoneness);
    const quality = judgeQuality(sausage);

    // Ready glow when serveable
    this.readyGlow.clear();
    if (quality === 'ok' || quality === 'perfect') {
      const glowColor = quality === 'perfect' ? 0xffdd00 : 0x88ff88;
      this.readyGlow.fillStyle(glowColor, 0.12);
      this.readyGlow.fillRoundedRect(
        -SAUSAGE_W / 2 - 6,
        -SAUSAGE_H / 2 - 6,
        SAUSAGE_W + 12,
        SAUSAGE_H + 12,
        SAUSAGE_H / 2 + 6,
      );
    }

    // ── Sausage body ──
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

    // Main body
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
      -SAUSAGE_W / 2 + 5,
      -SAUSAGE_H / 2 + 3,
      SAUSAGE_W - 18,
      SAUSAGE_H / 3,
      3,
    );

    // Grill marks — 3 dark lines across the body, opacity increases with doneness
    const grillAlpha = Math.min(0.7, avgDoneness / 100 * 0.8 + 0.05);
    this.sausageGfx.fillStyle(0x111111, grillAlpha);
    for (let i = 0; i < 3; i++) {
      const markX = -SAUSAGE_W / 2 + 12 + i * 14;
      this.sausageGfx.fillRect(markX, -SAUSAGE_H / 2 + 4, 3, SAUSAGE_H - 8);
    }

    // ── Doneness bars ──
    this.drawDonenessBar(this.topBarGfx, sausage.topDoneness, TOP_BAR_Y);
    this.drawDonenessBar(this.bottomBarGfx, sausage.bottomDoneness, BOTTOM_BAR_Y);

    // Pulse the active cooking side bar
    this.stopActivePulse();
    if (!sausage.served) {
      if (sausage.currentSide === 'bottom') {
        this.startActivePulse(this.bottomBarGfx);
      } else {
        this.startActivePulse(this.topBarGfx);
      }
    }
  }

  override destroy(fromScene?: boolean): void {
    this.stopActivePulse();
    this.smokeParticles.forEach(s => {
      if (s && s.active) s.destroy();
    });
    this.smokeParticles = [];
    super.destroy(fromScene);
  }
}

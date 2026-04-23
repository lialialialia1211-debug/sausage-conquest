// SausageSprite — Phaser Container representing one sausage on the grill
// Shows two separate doneness bars (top + bottom sides), grill marks, and serve/flip interactions
import Phaser from 'phaser';
import type { GrillingSausage, CookingStage } from '../systems/GrillEngine';
import {
  getDonenessBarColor,
  judgeQuality,
  getAverageDoneness,
  getCookingStage,
  getStageDisplayInfo,
} from '../systems/GrillEngine';
import { SAUSAGE_MAP } from '../data/sausages';


const SAUSAGE_W = 85;
const SAUSAGE_H = 35;
const BAR_W = 78;
const BAR_H = 4;

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
  private onClickCallback: (() => void) | null = null;
  // Hover glow graphics (white outline around sausage)
  private hoverGlowGfx: Phaser.GameObjects.Graphics;
  private smokeParticles: Phaser.GameObjects.Text[] = [];
  private _data: GrillingSausage;

  // Pulsing tween for active bar
  private activePulseTween: Phaser.Tweens.Tween | null = null;

  // Stage border glow graphics (drawn behind sausage body)
  private borderGlowGfx: Phaser.GameObjects.Graphics;
  // Track last rendered stage to trigger scale pulse animation
  private _lastRenderedTopStage: CookingStage = 'raw';
  private _lastRenderedBottomStage: CookingStage = 'raw';
  private _stagePulseTween: Phaser.Tweens.Tween | null = null;

  // Variety-specific overlay graphics (cheese swell/glow)
  private varietyGfx: Phaser.GameObjects.Graphics;
  // Tracks last cheese burst to avoid repeated flashes
  private _cheeseExploded = false;
  // Tracked sparkle text objects for cleanup
  private sparkleObjects: Phaser.GameObjects.Text[] = [];
  // Tracked cheese burst graphics for cleanup
  private cheeseBurstGfx: Phaser.GameObjects.Graphics | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, sausage: GrillingSausage) {
    super(scene, x, y);
    this._data = sausage;
    scene.add.existing(this);

    // Stage border glow (outermost layer, drawn first so it sits behind everything)
    this.borderGlowGfx = scene.add.graphics();
    this.add(this.borderGlowGfx);

    // Hover glow (white outline, hidden by default)
    this.hoverGlowGfx = scene.add.graphics();
    this.add(this.hoverGlowGfx);

    // Ready glow (hidden by default)
    this.readyGlow = scene.add.graphics();
    this.add(this.readyGlow);

    // Sausage body graphics
    this.sausageGfx = scene.add.graphics();
    this.add(this.sausageGfx);

    // Variety-specific overlay (drawn on top of the body, below bars)
    this.varietyGfx = scene.add.graphics();
    this.add(this.varietyGfx);

    // Two doneness bars
    this.topBarGfx = scene.add.graphics();
    this.add(this.topBarGfx);

    this.bottomBarGfx = scene.add.graphics();
    this.add(this.bottomBarGfx);

    // Emoji label
    const sausageType = SAUSAGE_MAP[sausage.sausageTypeId];
    const sausageLabel = sausageType?.name ?? '';
    this.labelText = scene.add.text(0, LABEL_Y, sausageLabel, {
      fontSize: '16px',
      align: 'center',
    }).setOrigin(0.5);
    this.add(this.labelText);

    // Try to display art image on top of programmatic body
    const textureKey = `sausage-${sausage.sausageTypeId}`;
    if (scene.textures.exists(textureKey)) {
      const artImage = scene.add.image(0, 0, textureKey);
      // Scale to fit the sausage body size (approximately 85×35 px)
      const targetW = 110;
      const targetH = 55;
      const scale = Math.min(targetW / artImage.width, targetH / artImage.height);
      artImage.setScale(scale);
      artImage.setDepth(1); // above the gfx body
      this.add(artImage); // add to container

      // Hide the programmatic body since we have art
      this.sausageGfx.setVisible(false);
      if (this.varietyGfx) this.varietyGfx.setVisible(false);
      this.labelText.setVisible(false);
    }

    // Hit area — only covers the sausage body, not above it (起鍋 button lives above)
    const hitZone = scene.add.zone(0, 6, SAUSAGE_W + 20, SAUSAGE_H + 30)
      .setInteractive({ cursor: 'pointer' });
    this.add(hitZone);

    hitZone.on('pointerdown', () => this.handleClick());
    hitZone.on('pointerover', () => {
      this.sausageGfx.setAlpha(0.82);
      this.drawHoverGlow(true);
    });
    hitZone.on('pointerout', () => {
      this.sausageGfx.setAlpha(1);
      this.drawHoverGlow(false);
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

  onClick(cb: () => void): this {
    this.onClickCallback = cb;
    return this;
  }

  private handleClick(): void {
    if (this._data.served || this.isFlipping) return;
    if (this.onClickCallback) this.onClickCallback();
  }

  private drawHoverGlow(visible: boolean): void {
    this.hoverGlowGfx.clear();
    if (!visible) return;
    // Subtle white glow outline around sausage body
    this.hoverGlowGfx.lineStyle(3, 0xffffff, 0.3);
    this.hoverGlowGfx.strokeRoundedRect(
      -SAUSAGE_W / 2 - 2,
      -SAUSAGE_H / 2 - 2,
      SAUSAGE_W + 4,
      SAUSAGE_H + 4,
      SAUSAGE_H / 2 + 2,
    );
  }

  /**
   * Plays the flip animation only (no game-logic callback).
   * GrillScene.doFlipSlot is responsible for flipping the data before calling this.
   */
  triggerFlip(): void {
    if (this.isFlipping || this._data.served) return;
    this.isFlipping = true;

    // Fast flip animation (60ms total) so clicks don't get swallowed
    this.scene.tweens.add({
      targets: this,
      scaleY: 0,
      duration: 30,
      ease: 'Power1',
      onComplete: () => {
        this.redraw();
        this.scene.tweens.add({
          targets: this,
          scaleY: 1,
          duration: 30,
          ease: 'Linear',
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
    const sparkleChars = ['*', '+', '*'];
    for (let i = 0; i < 5; i++) {
      const spark = this.scene.add.text(
        this.x + Phaser.Math.Between(-35, 35),
        this.y + Phaser.Math.Between(-25, 10),
        sparkleChars[i % sparkleChars.length],
        { fontSize: '16px' },
      ).setOrigin(0.5).setDepth(200);

      this.sparkleObjects.push(spark);

      this.scene.tweens.add({
        targets: spark,
        y: spark.y - 50,
        alpha: 0,
        duration: 700,
        delay: i * 80,
        ease: 'Power2',
        onComplete: () => {
          const idx = this.sparkleObjects.indexOf(spark);
          if (idx >= 0) this.sparkleObjects.splice(idx, 1);
          spark.destroy();
        },
      });
    }
  }

  private spawnSmoke(): void {
    for (let i = 0; i < 4; i++) {
      const smoke = this.scene.add.text(
        this.x + Phaser.Math.Between(-22, 22),
        this.y,
        '~',
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
    // Stage-based stepped color: use the active (heated) side's stage for body color
    const activeDoneness = sausage.currentSide === 'bottom' ? sausage.bottomDoneness : sausage.topDoneness;
    const activeStage = getCookingStage(activeDoneness);
    const stageInfo = getStageDisplayInfo(activeStage);
    const color = stageInfo.color;
    const quality = judgeQuality(sausage);

    // ── Stage border glow ─────────────────────────────────────────────────────
    this.borderGlowGfx.clear();
    this.borderGlowGfx.lineStyle(4, stageInfo.borderGlow, 0.75);
    this.borderGlowGfx.strokeRoundedRect(
      -SAUSAGE_W / 2 - 4,
      -SAUSAGE_H / 2 - 4,
      SAUSAGE_W + 8,
      SAUSAGE_H + 8,
      SAUSAGE_H / 2 + 4,
    );

    // ── Stage change detection → scale pulse ─────────────────────────────────
    const newTopStage = getCookingStage(sausage.topDoneness);
    const newBottomStage = getCookingStage(sausage.bottomDoneness);
    const stageChanged =
      newTopStage !== this._lastRenderedTopStage ||
      newBottomStage !== this._lastRenderedBottomStage;
    if (stageChanged) {
      this._lastRenderedTopStage = newTopStage;
      this._lastRenderedBottomStage = newBottomStage;
      this._triggerStagePulse();
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Ready glow when both sides have been cooked (non-heated side >= 20)
    this.readyGlow.clear();
    const nonHeatedDoneness = sausage.currentSide === 'bottom'
      ? sausage.topDoneness
      : sausage.bottomDoneness;
    if (nonHeatedDoneness >= 20) {
      // Both sides cooked — show glow. Color by quality.
      let glowColor = 0x88ff88; // default green
      if (quality === 'perfect') glowColor = 0xffdd00;
      else if (quality === 'slightly-burnt') glowColor = 0xff8800;
      else if (quality === 'burnt' || quality === 'carbonized') glowColor = 0xff3300;
      else if (quality === 'half-cooked') glowColor = 0x4488ff;
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

    // Apply variety-specific visuals on top
    this.applyVarietyVisuals();
  }

  // ── Variety visual effects ─────────────────────────────────────────────────────

  /**
   * Dispatches to the appropriate per-variety effect method.
   * Called at the end of every redraw().
   */
  private applyVarietyVisuals(): void {
    const typeId = this._data.sausageTypeId;
    switch (typeId) {
      case 'cheese':    this.updateCheeseEffect();    break;
      default:
        // No extra visuals for other varieties
        this.varietyGfx.clear();
        break;
    }
  }

  /**
   * Cheese (起司爆漿):
   * - Sausage swells (scaleX grows) when current-side doneness > 80
   * - Yellow burst flash when doneness > 90 (once per cook side)
   */
  private updateCheeseEffect(): void {
    this.varietyGfx.clear();

    const activeDoneness = this._data.currentSide === 'bottom'
      ? this._data.bottomDoneness
      : this._data.topDoneness;

    // Swell effect: subtle scaleX increase as cheese approaches burst
    if (activeDoneness > 80) {
      const t = Math.min(1, (activeDoneness - 80) / 15);
      // Swell from 1.0 to 1.08
      this.sausageGfx.setScale(1 + t * 0.08, 1);
    } else {
      this.sausageGfx.setScale(1, 1);
    }

    // Yellow cheese burst glow when about to explode
    if (activeDoneness > 90 && !this._cheeseExploded) {
      this._cheeseExploded = true;

      // Destroy any previous burst gfx that may not have completed yet
      if (this.cheeseBurstGfx) {
        this.cheeseBurstGfx.destroy();
        this.cheeseBurstGfx = null;
      }

      // Yellow ring flash: draw once and fade out
      this.cheeseBurstGfx = this.scene.add.graphics();
      const worldMatrix = this.getWorldTransformMatrix();
      this.cheeseBurstGfx.setPosition(worldMatrix.tx, worldMatrix.ty);
      this.cheeseBurstGfx.setDepth(this.depth + 1);
      this.cheeseBurstGfx.fillStyle(0xffee44, 0.75);
      this.cheeseBurstGfx.fillRoundedRect(
        -SAUSAGE_W / 2 - 4,
        -SAUSAGE_H / 2 - 4,
        SAUSAGE_W + 8,
        SAUSAGE_H + 8,
        SAUSAGE_H / 2 + 4,
      );

      const burstRef = this.cheeseBurstGfx;
      this.scene.tweens.add({
        targets: burstRef,
        alpha: 0,
        scaleX: 1.3,
        scaleY: 1.3,
        duration: 400,
        ease: 'Power2',
        onComplete: () => {
          burstRef.destroy();
          if (this.cheeseBurstGfx === burstRef) this.cheeseBurstGfx = null;
        },
      });
    } else if (activeDoneness <= 80) {
      // Reset burst flag when side cools (i.e. flipped back)
      this._cheeseExploded = false;
    }

    // Persistent yellow shimmer overlay when hot (> 80)
    if (activeDoneness > 80) {
      const shimmerAlpha = Math.min(0.30, (activeDoneness - 80) / 50);
      this.varietyGfx.fillStyle(0xffee44, shimmerAlpha);
      this.varietyGfx.fillRoundedRect(
        -SAUSAGE_W / 2,
        -SAUSAGE_H / 2,
        SAUSAGE_W,
        SAUSAGE_H,
        SAUSAGE_H / 2,
      );
    }
  }

  /** Scale pulse animation (1.0 → 1.08 → 1.0, 150ms) triggered on stage change */
  private _triggerStagePulse(): void {
    if (!this.scene || !this.scene.tweens) return;
    // Stop any ongoing stage pulse to avoid overlap
    if (this._stagePulseTween) {
      this._stagePulseTween.stop();
      this._stagePulseTween = null;
      this.setScale(1);
    }
    this._stagePulseTween = this.scene.tweens.add({
      targets: this,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: 75,
      ease: 'Power1',
      yoyo: true,
      onComplete: () => {
        this.setScale(1);
        this._stagePulseTween = null;
      },
    });
  }

  override destroy(fromScene?: boolean): void {
    this.stopActivePulse();
    if (this._stagePulseTween) {
      this._stagePulseTween.stop();
      this._stagePulseTween = null;
    }
    this.borderGlowGfx.clear();
    this.hoverGlowGfx.clear();
    this.smokeParticles.forEach(s => {
      if (s && s.active) s.destroy();
    });
    this.smokeParticles = [];
    this.sparkleObjects.forEach(s => {
      if (s && s.active) s.destroy();
    });
    this.sparkleObjects = [];
    if (this.cheeseBurstGfx) {
      this.cheeseBurstGfx.destroy();
      this.cheeseBurstGfx = null;
    }
    super.destroy(fromScene);
  }
}

// BattleSausage — Phaser Container for a sausage character in battle
import Phaser from 'phaser';
import type { BattleUnit } from '../systems/BattleEngine';
import { SAUSAGE_MAP } from '../data/sausages';

// Battle sausage is 3x bigger than grill version
const BODY_W = 90;
const BODY_H = 34;
const HP_BAR_W = 80;
const HP_BAR_H = 8;
const HP_BAR_Y = BODY_H / 2 + 14;

export class BattleSausage extends Phaser.GameObjects.Container {
  private bodyGfx: Phaser.GameObjects.Graphics;
  private hpBarGfx: Phaser.GameObjects.Graphics;
  private emojiLabel: Phaser.GameObjects.Text;
  private unit: BattleUnit;
  private baseX: number;
  private baseY: number;
  private floatTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, unit: BattleUnit) {
    super(scene, x, y);
    this.unit = { ...unit };
    this.baseX = x;
    this.baseY = y;
    scene.add.existing(this);

    // Body graphics
    this.bodyGfx = scene.add.graphics();
    this.add(this.bodyGfx);

    // HP bar
    this.hpBarGfx = scene.add.graphics();
    this.add(this.hpBarGfx);

    // Emoji label
    const sausageType = SAUSAGE_MAP[unit.sausageTypeId];
    const emoji = sausageType?.emoji ?? '🌭';
    this.emojiLabel = scene.add.text(0, -BODY_H / 2 - 18, emoji, {
      fontSize: '22px',
      align: 'center',
    }).setOrigin(0.5);
    this.add(this.emojiLabel);

    this.redraw();
    this.startIdleFloat();
  }

  updateUnit(unit: BattleUnit): void {
    this.unit = { ...unit };
    this.redraw();
  }

  // ── Animations ─────────────────────────────────────────────────────────────

  private startIdleFloat(): void {
    this.floatTween = this.scene.tweens.add({
      targets: this,
      y: this.baseY - 6,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  private stopIdleFloat(): void {
    if (this.floatTween) {
      this.floatTween.stop();
      this.floatTween = null;
      this.y = this.baseY;
    }
  }

  playAttackAnim(targetX: number, onComplete?: () => void): void {
    this.stopIdleFloat();
    const direction = this.unit.team === 'player' ? 1 : -1;
    const dashDist = 80 * direction;

    this.scene.tweens.add({
      targets: this,
      x: this.baseX + dashDist,
      duration: 180,
      ease: 'Power2.In',
      onComplete: () => {
        // Small impact shake at target
        void targetX; // used conceptually
        this.scene.tweens.add({
          targets: this,
          x: this.baseX,
          duration: 220,
          ease: 'Back.Out',
          onComplete: () => {
            this.startIdleFloat();
            onComplete?.();
          },
        });
      },
    });
  }

  playHitAnim(): void {
    // Flash red tint + horizontal shake
    this.scene.tweens.add({
      targets: this,
      x: this.x - 8,
      duration: 60,
      yoyo: true,
      repeat: 2,
      ease: 'Linear',
    });

    // Flash the body red briefly by redrawing with red tint
    const origAlpha = this.bodyGfx.alpha;
    this.bodyGfx.setAlpha(0.4);
    this.scene.time.delayedCall(80, () => {
      this.bodyGfx.setAlpha(origAlpha);
      this.redraw();
    });
  }

  playDeathAnim(onComplete?: () => void): void {
    this.stopIdleFloat();
    // Shrink + gray out + fade
    this.scene.tweens.add({
      targets: this,
      scaleX: 0.4,
      scaleY: 0.4,
      alpha: 0,
      duration: 600,
      ease: 'Power2.In',
      onComplete: () => {
        onComplete?.();
      },
    });
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  private redraw(): void {
    this.drawBody();
    this.drawHpBar();
  }

  private drawBody(): void {
    this.bodyGfx.clear();

    const isDead = !this.unit.alive;
    const teamColor = this.unit.team === 'player' ? 0x4488ff : 0xff4455;
    const baseColor = isDead ? 0x555555 : 0xcc6600;

    // Shadow
    this.bodyGfx.fillStyle(0x000000, 0.3);
    this.bodyGfx.fillRoundedRect(-BODY_W / 2 + 4, -BODY_H / 2 + 5, BODY_W, BODY_H, BODY_H / 2);

    // Main sausage body
    this.bodyGfx.fillStyle(baseColor, 1);
    this.bodyGfx.fillRoundedRect(-BODY_W / 2, -BODY_H / 2, BODY_W, BODY_H, BODY_H / 2);

    // Team color stripe
    this.bodyGfx.fillStyle(teamColor, 0.3);
    this.bodyGfx.fillRoundedRect(-BODY_W / 2, -BODY_H / 2, BODY_W, BODY_H, BODY_H / 2);

    // Highlight sheen
    this.bodyGfx.fillStyle(0xffffff, isDead ? 0.0 : 0.18);
    this.bodyGfx.fillRoundedRect(-BODY_W / 2 + 8, -BODY_H / 2 + 5, BODY_W - 28, BODY_H / 3, 4);

    // Team border
    this.bodyGfx.lineStyle(2, teamColor, isDead ? 0.2 : 0.8);
    this.bodyGfx.strokeRoundedRect(-BODY_W / 2, -BODY_H / 2, BODY_W, BODY_H, BODY_H / 2);
  }

  private drawHpBar(): void {
    this.hpBarGfx.clear();
    const hpPct = this.unit.maxHp > 0 ? this.unit.hp / this.unit.maxHp : 0;

    // Background
    this.hpBarGfx.fillStyle(0x222222, 1);
    this.hpBarGfx.fillRoundedRect(-HP_BAR_W / 2, HP_BAR_Y, HP_BAR_W, HP_BAR_H, 3);

    // HP fill color: green > yellow > red
    let barColor: number;
    if (hpPct > 0.6) barColor = 0x44ff66;
    else if (hpPct > 0.3) barColor = 0xffcc00;
    else barColor = 0xff3333;

    const fillW = Math.max(0, Math.round(hpPct * HP_BAR_W));
    if (fillW > 0) {
      this.hpBarGfx.fillStyle(barColor, 1);
      this.hpBarGfx.fillRoundedRect(-HP_BAR_W / 2, HP_BAR_Y, fillW, HP_BAR_H, 3);
    }

    // Border
    this.hpBarGfx.lineStyle(1, 0x444444, 1);
    this.hpBarGfx.strokeRoundedRect(-HP_BAR_W / 2, HP_BAR_Y, HP_BAR_W, HP_BAR_H, 3);
  }

  destroy(fromScene?: boolean): void {
    this.stopIdleFloat();
    super.destroy(fromScene);
  }
}

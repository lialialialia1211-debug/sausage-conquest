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

  /**
   * Public method: gentle floating up/down idle animation.
   * Restarts the idle float if it was stopped.
   */
  public playIdleAnimation(_scene: Phaser.Scene): void {
    this.stopIdleFloat();
    this.startIdleFloat();
  }

  playAttackAnim(targetX: number, onComplete?: () => void): void {
    this.stopIdleFloat();
    const direction = this.unit.team === 'player' ? 1 : -1;

    // Determine dash distance based on battle type
    const sausageType = SAUSAGE_MAP[this.unit.sausageTypeId];
    const battleType = sausageType?.battle?.type ?? 'normal';

    // Ranged and support don't dash forward; others do
    const isRanged = battleType === 'ranged';
    const isSupport = battleType === 'support';
    const dashDist = isRanged || isSupport ? 20 * direction : 80 * direction;
    const dashDuration = battleType === 'tank' ? 260 : 180;

    this.scene.tweens.add({
      targets: this,
      x: this.baseX + dashDist,
      duration: dashDuration,
      ease: battleType === 'assassin' ? 'Power3.In' : 'Power2.In',
      onComplete: () => {
        // Trigger variety-specific visual effect at impact point
        this.playAttackEffect(this.scene, targetX, this.y);

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

  /**
   * Variety-specific attack visual effects.
   * Uses the scene's tweens and graphics; all created objects are cleaned up after effect.
   */
  public playAttackEffect(_scene: Phaser.Scene, targetX: number, targetY: number): void {
    const scene = this.scene;
    const sausageType = SAUSAGE_MAP[this.unit.sausageTypeId];
    const battleType = sausageType?.battle?.type ?? 'normal';

    switch (battleType) {
      case 'normal':
        this._effectNormalCharge(scene, targetX, targetY);
        break;
      case 'ranged':
        this._effectRangedRoe(scene, targetX, targetY);
        break;
      case 'aoe':
        this._effectAoeGarlic(scene, targetX, targetY);
        break;
      case 'tank':
        this._effectTankCheese(scene, targetX, targetY);
        break;
      case 'assassin':
        this._effectAssassinInk(scene, targetX, targetY);
        break;
      case 'support':
        this._effectSupportMala(scene, targetX, targetY);
        break;
      default:
        this._effectNormalCharge(scene, targetX, targetY);
    }
  }

  // ── Per-type effect implementations ──────────────────────────────────────

  /** black-pig (normal): white impact flash at target */
  private _effectNormalCharge(scene: Phaser.Scene, targetX: number, targetY: number): void {
    const flash = scene.add.graphics();
    flash.fillStyle(0xffffff, 0.85);
    flash.fillCircle(targetX, targetY, 22);
    flash.setDepth(20);

    scene.tweens.add({
      targets: flash,
      alpha: 0,
      scaleX: 2.2,
      scaleY: 2.2,
      duration: 280,
      ease: 'Power2.Out',
      onComplete: () => flash.destroy(),
    });
  }

  /** flying-fish-roe (ranged): 3 scatter projectiles toward target */
  private _effectRangedRoe(scene: Phaser.Scene, targetX: number, targetY: number): void {
    const startX = this.x;
    const startY = this.y;
    const offsets = [-18, 0, 18]; // vertical scatter

    offsets.forEach((offsetY, i) => {
      const dot = scene.add.graphics();
      dot.fillStyle(0xff8844, 1);
      dot.fillCircle(0, 0, 6);
      dot.setPosition(startX, startY);
      dot.setDepth(20);

      scene.tweens.add({
        targets: dot,
        x: targetX,
        y: targetY + offsetY,
        duration: 220,
        delay: i * 45,
        ease: 'Power1.In',
        onComplete: () => {
          // Small pop at landing
          scene.tweens.add({
            targets: dot,
            alpha: 0,
            scaleX: 3,
            scaleY: 3,
            duration: 130,
            ease: 'Power2.Out',
            onComplete: () => dot.destroy(),
          });
        },
      });
    });
  }

  /** garlic-bomb (aoe): expanding green shockwave ring */
  private _effectAoeGarlic(scene: Phaser.Scene, targetX: number, targetY: number): void {
    const ring = scene.add.graphics();
    ring.lineStyle(4, 0x44ff66, 0.9);
    ring.strokeCircle(0, 0, 10);
    ring.setPosition(targetX, targetY);
    ring.setDepth(20);

    // Inner glow fill
    const fill = scene.add.graphics();
    fill.fillStyle(0x44ff66, 0.25);
    fill.fillCircle(0, 0, 10);
    fill.setPosition(targetX, targetY);
    fill.setDepth(19);

    scene.tweens.add({
      targets: [ring, fill],
      scaleX: 5.5,
      scaleY: 5.5,
      alpha: 0,
      duration: 450,
      ease: 'Power2.Out',
      onComplete: () => {
        ring.destroy();
        fill.destroy();
      },
    });
  }

  /** cheese (tank): yellow splatter particles on impact */
  private _effectTankCheese(scene: Phaser.Scene, targetX: number, targetY: number): void {
    const count = 7;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.5 - 0.25);
      const dist = 28 + Math.random() * 20;
      const blob = scene.add.graphics();
      blob.fillStyle(0xffdd00, 1);
      blob.fillCircle(0, 0, 4 + Math.random() * 4);
      blob.setPosition(targetX, targetY);
      blob.setDepth(20);

      scene.tweens.add({
        targets: blob,
        x: targetX + Math.cos(angle) * dist,
        y: targetY + Math.sin(angle) * dist,
        alpha: 0,
        scaleX: 0.3,
        scaleY: 0.3,
        duration: 380 + Math.random() * 120,
        ease: 'Power2.Out',
        onComplete: () => blob.destroy(),
      });
    }
  }

  /** squidink (assassin): brief disappear + reappear + slash line */
  private _effectAssassinInk(scene: Phaser.Scene, targetX: number, targetY: number): void {
    // Blink self out
    this.setAlpha(0);

    scene.time.delayedCall(120, () => {
      // Reappear
      this.setAlpha(1);

      // Slash line effect at target
      const slash = scene.add.graphics();
      slash.lineStyle(3, 0x8800cc, 0.95);
      const slashLen = 40;
      slash.beginPath();
      slash.moveTo(targetX - slashLen / 2, targetY - slashLen / 3);
      slash.lineTo(targetX + slashLen / 2, targetY + slashLen / 3);
      slash.strokePath();
      slash.setDepth(20);

      // Second slash (cross)
      slash.lineStyle(2, 0xcc44ff, 0.7);
      slash.beginPath();
      slash.moveTo(targetX + slashLen / 2, targetY - slashLen / 3);
      slash.lineTo(targetX - slashLen / 2, targetY + slashLen / 3);
      slash.strokePath();

      scene.tweens.add({
        targets: slash,
        alpha: 0,
        scaleX: 1.4,
        scaleY: 1.4,
        duration: 300,
        ease: 'Power2.Out',
        onComplete: () => slash.destroy(),
      });
    });
  }

  /** mala (support): red sparkles spreading outward from self */
  private _effectSupportMala(scene: Phaser.Scene, _targetX: number, _targetY: number): void {
    const count = 8;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const dist = 50 + Math.random() * 30;

      const spark = scene.add.graphics();
      spark.fillStyle(0xff2244, 1);
      spark.fillCircle(0, 0, 4);
      spark.setPosition(this.x, this.y);
      spark.setDepth(20);

      scene.tweens.add({
        targets: spark,
        x: this.x + Math.cos(angle) * dist,
        y: this.y + Math.sin(angle) * dist,
        alpha: 0,
        scaleX: 0.4,
        scaleY: 0.4,
        duration: 400 + Math.random() * 100,
        delay: i * 25,
        ease: 'Power2.Out',
        onComplete: () => spark.destroy(),
      });
    }
  }

  playHitAnim(): void {
    // Flash red tint + horizontal shake
    this.scene.tweens.add({
      targets: this,
      x: this.baseX - 8,
      duration: 60,
      yoyo: true,
      repeat: 2,
      ease: 'Linear',
      onComplete: () => {
        this.x = this.baseX;
      },
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
    this.playDeathEffect(this.scene, onComplete);
  }

  /**
   * Enhanced death effect: shrink + fade + slight rotation.
   */
  public playDeathEffect(_scene: Phaser.Scene, onComplete?: () => void): void {
    this.stopIdleFloat();

    // Ghost particles bursting out
    const count = 5;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const ghost = this.scene.add.graphics();
      ghost.fillStyle(0xffffff, 0.6);
      ghost.fillCircle(0, 0, 5);
      ghost.setPosition(this.x, this.y);
      ghost.setDepth(this.depth + 1);

      this.scene.tweens.add({
        targets: ghost,
        x: this.x + Math.cos(angle) * 35,
        y: this.y + Math.sin(angle) * 35,
        alpha: 0,
        duration: 350,
        ease: 'Power2.Out',
        onComplete: () => ghost.destroy(),
      });
    }

    // Shrink + rotate + fade
    this.scene.tweens.add({
      targets: this,
      scaleX: 0.4,
      scaleY: 0.4,
      alpha: 0,
      angle: 25,
      duration: 600,
      ease: 'Power2.In',
      onComplete: () => {
        onComplete?.();
        this.destroy();
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

// BattleScene — 第一人稱香腸格鬥（First-person sausage fighting）
import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { gameState, spendMoney, addMoney } from '../state/GameState';

import {
  calculateBattleCost,
  applyBattleResult,
  applySimulationBuff,
} from '../systems/AutoChessEngine';
import { sfx } from '../utils/SoundFX';
import { SAUSAGE_MAP } from '../data/sausages';
import { GRID_SLOTS } from '../data/map';

// ── Layout constants ───────────────────────────────────────────────────────────
const FONT = 'Microsoft JhengHei, PingFang TC, sans-serif';

// Opponent hitbox region (center of screen)
const OPP_CENTER_X_FRAC = 0.50;
const OPP_CENTER_Y_FRAC = 0.38;

/** Opponent emoji data per difficulty */
const DIFFICULTY_OPPONENTS: Record<number, { emoji: string; name: string }> = {
  1: { emoji: '🧑‍🍳', name: '路邊攤阿婆' },
  2: { emoji: '👨‍🍳', name: '夜市老闆' },
  3: { emoji: '🧙', name: '香腸巫師' },
  4: { emoji: '👹', name: '烤爐魔王' },
  5: { emoji: '🔥', name: '傳說香腸王' },
};

// ── Helper types ───────────────────────────────────────────────────────────────
interface NeonConfig {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
  glowColor: number;
}

export class BattleScene extends Phaser.Scene {
  // ── HP ──────────────────────────────────────────────────────────────────────
  private playerHp = 100;
  private playerMaxHp = 100;
  private opponentHp = 100;
  private opponentMaxHp = 100;

  // ── Energy ──────────────────────────────────────────────────────────────────
  private energy = 0; // 0–100

  // ── Cooldowns (seconds) ──────────────────────────────────────────────────────
  private normalCd = 0;
  private heavyCd = 0;
  private opponentStunTimer = 0;

  // ── AI ──────────────────────────────────────────────────────────────────────
  private aiAttackTimer = 0;
  private aiAttackInterval = 2.5;
  private aiDamage = 10;
  private difficulty = 1;

  // ── Timer ────────────────────────────────────────────────────────────────────
  private battleTimer = 60;
  private isFighting = false;
  private isDone = false;

  // ── Display objects ──────────────────────────────────────────────────────────
  private crosshairH!: Phaser.GameObjects.Graphics;
  private crosshairV!: Phaser.GameObjects.Graphics;
  private opponentEmoji!: Phaser.GameObjects.Text;
  private playerHpBar!: Phaser.GameObjects.Graphics;
  private opponentHpBarFill!: Phaser.GameObjects.Graphics;
  private energyBarFill!: Phaser.GameObjects.Graphics;
  private timerText!: Phaser.GameObjects.Text;
  private energyLabel!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;
  private continueBtn!: Phaser.GameObjects.Container;
  private playerHpLabel!: Phaser.GameObjects.Text;
  private opponentHpLabel!: Phaser.GameObjects.Text;
  private screenVignette!: Phaser.GameObjects.Graphics;

  // ── Weapon (B1) ──────────────────────────────────────────────────────────────
  private weaponBonus: number = 1;
  private weaponName: string = '';

  // ── Opponent special (B2) ────────────────────────────────────────────────────
  private opponentSpecialUsed: boolean = false;

  // ── Dodge (B3) ───────────────────────────────────────────────────────────────
  private isDodging: boolean = false;
  private dodgeCooldown: number = 0;

  // ── Tween / animation state ──────────────────────────────────────────────────
  private opponentBaseScale = 1;
  private energyPulseTween: Phaser.Tweens.Tween | null = null;

  constructor() {
    super({ key: 'BattleScene' });
  }

  // ── preload (KEEP AS-IS) ─────────────────────────────────────────────────────

  preload(): void {
    // All textures preloaded in BootScene
  }

  // ── create ───────────────────────────────────────────────────────────────────

  create(): void {
    const { width, height } = this.scale;

    // Reset state
    this.playerHp = 100;
    this.playerMaxHp = 100;
    this.opponentHp = 100;
    this.opponentMaxHp = 100;
    this.energy = 0;
    this.normalCd = 0;
    this.heavyCd = 0;
    this.opponentStunTimer = 0;
    this.aiAttackTimer = 0;
    this.isFighting = false;
    this.isDone = false;
    this.battleTimer = 60;
    this.energyPulseTween = null;
    this.weaponBonus = 1;
    this.weaponName = '';
    this.opponentSpecialUsed = false;
    this.isDodging = false;
    this.dodgeCooldown = 0;

    // Determine difficulty from playerSlot
    this.difficulty = Math.max(1, Math.min(5, gameState.playerSlot));

    // Simulation mode adjustments
    const isSimulation = applySimulationBuff([]) !== undefined;
    if (isSimulation) {
      this.playerMaxHp = 150;
      this.playerHp = 150;
    }

    // Both sides start with equal HP
    this.opponentMaxHp = 100;
    this.opponentHp = 100;

    // AI settings
    // Interval: 2.5s at diff 1, 1.5s at diff 5 (linear interp)
    this.aiAttackInterval = 2.5 - (this.difficulty - 1) * 0.25;
    // Damage: 8 at diff 1, 15 at diff 5
    this.aiDamage = 8 + (this.difficulty - 1) * 1.75;

    // Disable right-click context menu on canvas
    this.game.canvas.addEventListener('contextmenu', (e: Event) => e.preventDefault());

    // Draw scene
    this.drawBackground(width, height);
    this.drawOpponentStall(width, height);
    this.spawnOpponentEmoji(width, height);
    this.setupHUD(width, height);
    this.setupCrosshair(width, height);
    this.setupScreenVignette(width, height);
    this.setupResultUI(width, height);

    this.cameras.main.fadeIn(500, 0, 0, 0);
    EventBus.emit('scene-ready', 'BattleScene');

    this.cameras.main.once('camerafadeincomplete', () => {
      this.handleBattleDay();
    });
  }

  // ── Battle day gate ──────────────────────────────────────────────────────────

  private handleBattleDay(): void {
    const isBattleDay = gameState.day % 2 === 0;
    if (!isBattleDay) {
      this.showInfoMessage('今日無戰事，直接結算', '#aaaaaa');
      this.time.delayedCall(1200, () => this.transitionToSummary());
      return;
    }

    const costInfo = calculateBattleCost();
    this.showChallengeChoice(costInfo);
  }

  private showChallengeChoice(costInfo: { canAfford: boolean; playerCost: number }): void {
    const { width, height } = this.scale;
    const overlay = this.add.graphics().setDepth(20);
    overlay.fillStyle(0x000000, 0.75);
    overlay.fillRect(0, 0, width, height);

    const panel = this.add.container(width / 2, height / 2).setDepth(21);

    const oppInfo = DIFFICULTY_OPPONENTS[this.difficulty] ?? { emoji: '👹', name: '神秘對手' };
    const infoLines = [
      `挑戰者：${oppInfo.emoji} ${oppInfo.name}`,
      `對手體力：${this.opponentMaxHp}`,
      costInfo.canAfford
        ? `入場費：$${costInfo.playerCost}（你有 $${gameState.money}）`
        : `資金不足！需要 $${costInfo.playerCost}，你只有 $${gameState.money}`,
    ].join('\n');

    const infoText = this.add.text(0, -60, infoLines, {
      fontSize: '15px',
      fontFamily: FONT,
      color: '#ffddaa',
      align: 'center',
      lineSpacing: 6,
    }).setOrigin(0.5);

    panel.add(infoText);

    if (costInfo.canAfford) {
      const fightBtn = this.makeTextButton(0, 20, '出戰！', () => {
        overlay.destroy();
        panel.destroy();
        this.beginFight(costInfo.playerCost);
      });
      const skipBtn = this.makeTextButton(0, 70, '跳過，直接結算', () => {
        overlay.destroy();
        panel.destroy();
        this.transitionToSummary();
      });
      panel.add([fightBtn, skipBtn]);
    } else {
      const skipBtn = this.makeTextButton(0, 20, '跳過，直接結算', () => {
        overlay.destroy();
        panel.destroy();
        this.transitionToSummary();
      });
      panel.add(skipBtn);
    }
  }

  // ── Begin fight ──────────────────────────────────────────────────────────────

  private beginFight(cost: number): void {
    spendMoney(cost);
    this.showFeverTimeSplash(() => this.startFight());
  }

  // ── FEVER TIME splash (KEEP EXISTING CODE) ───────────────────────────────────

  private showFeverTimeSplash(onComplete: () => void): void {
    const { width, height } = this.scale;

    if (this.textures.exists('battle-cover')) {
      const splash = this.add.container(0, 0).setDepth(50);
      const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.9);
      const img = this.add.image(width / 2, height / 2 - 20, 'battle-cover');
      const maxW = width * 0.6;
      const maxH = height * 0.5;
      const scale = Math.min(maxW / img.width, maxH / img.height);
      img.setScale(0).setAlpha(0);
      splash.add([overlay, img]);

      this.tweens.add({
        targets: img,
        scale: { from: 0, to: scale },
        alpha: { from: 0, to: 1 },
        duration: 400,
        ease: 'Back.Out',
      });

      this.time.delayedCall(1500, () => {
        this.tweens.add({
          targets: splash,
          alpha: 0,
          duration: 300,
          onComplete: () => {
            splash.destroy();
            onComplete();
          },
        });
      });
    } else {
      this.time.delayedCall(300, onComplete);
    }
  }

  // ── Start fight ──────────────────────────────────────────────────────────────

  private startFight(): void {
    this.isFighting = true;
    this.isDone = false;
    this.aiAttackTimer = 0;
    this.battleTimer = 60;

    // B1: Calculate weapon bonus from best sausage in inventory
    const bestSausage = Object.keys(gameState.inventory)
      .filter(id => (gameState.inventory as Record<string, number>)[id] > 0)
      .map(id => SAUSAGE_MAP[id])
      .filter(Boolean)
      .sort((a, b) => b.cost - a.cost)[0];

    this.weaponBonus = bestSausage ? 1 + (bestSausage.cost / 60) : 1.0;
    this.weaponName = bestSausage?.name || '普通香腸';

    this.setupInputListeners();
    this.showInfoMessage('戰鬥開始！', '#44ff88', 1200);

    // Show weapon info after start message
    this.time.delayedCall(600, () => {
      const bonusStr = this.weaponBonus.toFixed(2);
      this.showInfoMessage(`武器：${this.weaponName} (×${bonusStr}倍傷害)`, '#ffcc44', 2000);
    });
  }

  // ── Input listeners ──────────────────────────────────────────────────────────

  private setupInputListeners(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isDone || !this.isFighting) return;
      if (pointer.leftButtonDown()) this.doNormalAttack(pointer);
      if (pointer.rightButtonDown()) this.doHeavyAttack(pointer);
    });

    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-SPACE', () => this.doSpecialAttack());
      this.input.keyboard.on('keydown-E', () => this.doSpecialAttack());
      // B3: Dodge keys
      this.input.keyboard.on('keydown-D', () => this.doDodge());
      this.input.keyboard.on('keydown-SHIFT', () => this.doDodge());
    }
  }

  // ── Attack: Normal (left click) ──────────────────────────────────────────────

  private doNormalAttack(pointer: Phaser.Input.Pointer): void {
    if (this.normalCd > 0) return;
    this.normalCd = 0.5;

    sfx.playSwing();

    const hit = this.isHitOnOpponent(pointer);
    const headshot = hit && this.isHeadshot(pointer);
    const { width, height } = this.scale;

    // Sausage arc swing: spawns at bottom-center, arcs toward pointer
    let attackObj: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
    if (this.textures.exists('tongs')) {
      attackObj = this.add.image(width / 2, height * 0.85, 'tongs').setDepth(40);
      attackObj.setScale(0.15).setAngle(-45);
    } else {
      attackObj = this.add.text(width / 2, height * 0.85, '🌭', {
        fontSize: '48px',
        fontFamily: FONT,
      }).setOrigin(0.5).setDepth(40).setAngle(-45).setScale(1.5);
    }

    this.tweens.add({
      targets: attackObj,
      x: pointer.x,
      y: pointer.y,
      angle: 45,
      scale: 0.8,
      duration: 200,
      ease: 'Power2',
      onComplete: () => {
        if (hit) {
          // Impact burst at hit point
          const burst = this.add.text(pointer.x, pointer.y, '💥', {
            fontSize: '60px',
            fontFamily: FONT,
          }).setOrigin(0.5).setDepth(41);
          this.tweens.add({
            targets: burst,
            scale: { from: 0.5, to: 2 },
            alpha: { from: 1, to: 0 },
            duration: 300,
            onComplete: () => burst.destroy(),
          });

          // Attack impact sprite
          if (this.textures.exists('battle-attack-normal')) {
            const impact = this.add.image(pointer.x, pointer.y, 'battle-attack-normal').setDepth(42);
            const impScale = Math.min(60 / impact.width, 60 / impact.height);
            impact.setScale(0).setAlpha(0.9);
            this.tweens.add({
              targets: impact,
              scale: impScale,
              alpha: 0,
              duration: 400,
              ease: 'Power2',
              onComplete: () => impact.destroy(),
            });
          }
        }
        attackObj.destroy();
      },
    });

    if (hit) {
      sfx.playAttack();
      const dmg = Math.round((headshot ? 15 : 8) * this.weaponBonus);
      this.dealDamageToOpponent(dmg);
      this.energy = Math.min(100, this.energy + 10);
      this.showOpponentReaction(dmg, headshot, false);

      if (headshot) {
        this.spawnDamageNumber(pointer.x, pointer.y - 20, `爆頭！ -${dmg}`, '#ffee00');
        this.cameras.main.shake(120, 0.008);
        this.flashFullScreen(0xffff00, 0.18, 80);
      } else {
        this.spawnDamageNumber(pointer.x, pointer.y - 20, `-${dmg}`, '#ffffff');
        this.cameras.main.shake(100, 0.01);
        this.flashFullScreen(0xffffff, 0.15, 50);
      }

    } else {
      this.spawnDamageNumber(pointer.x, pointer.y - 10, '未中', '#666666');
    }
  }

  // ── Attack: Heavy (right click) ──────────────────────────────────────────────

  private doHeavyAttack(pointer: Phaser.Input.Pointer): void {
    if (this.heavyCd > 0) return;
    if (this.energy < 25) {
      this.spawnInfoFloat(pointer.x, pointer.y, '能量不足！', '#ff8800');
      return;
    }

    this.heavyCd = 2;
    this.energy = Math.max(0, this.energy - 25);

    sfx.playSwing();

    const { width, height } = this.scale;

    // Heavy thrust: big sausage from bottom center, straight toward opponent
    const bigSausage = this.add.text(width / 2, height * 0.85, '🌭', {
      fontSize: '64px',
      fontFamily: FONT,
    }).setOrigin(0.5).setDepth(40).setScale(1.8);

    this.tweens.add({
      targets: bigSausage,
      x: pointer.x,
      y: pointer.y,
      scale: 1.0,
      duration: 220,
      ease: 'Power3',
      onComplete: () => bigSausage.destroy(),
    });

    const hit = this.isHitOnOpponent(pointer);
    if (hit) {
      sfx.playHeavyHit();
      const heavyDmg = Math.round(20 * this.weaponBonus);
      this.dealDamageToOpponent(heavyDmg);
      this.opponentStunTimer = 1.0;
      this.energy = Math.min(100, this.energy + 5);
      this.cameras.main.shake(250, 0.018);
      this.flashFullScreen(0xffffff, 0.20, 50);
      this.spawnDamageNumber(pointer.x, pointer.y - 20, `重擊！ -${heavyDmg}`, '#ff6600');
      this.showOpponentReaction(20, false, false);

      // Opponent pushed back: brief y offset tween
      const origY = this.opponentEmoji.y;
      this.tweens.add({
        targets: this.opponentEmoji,
        y: origY - 22,
        alpha: 0.5,
        duration: 120,
        yoyo: true,
        repeat: 1,
        onComplete: () => {
          if (this.opponentEmoji.active) {
            this.opponentEmoji.y = origY;
            this.opponentEmoji.setAlpha(1);
          }
        },
      });

      // "塞住了！" text
      this.spawnInfoFloat(pointer.x + 50, pointer.y - 50, '塞住了！', '#ff9900');
    } else {
      this.spawnDamageNumber(pointer.x, pointer.y - 10, '未中', '#666666');
    }
  }

  // ── Attack: Special (space/E, needs 100% energy) ──────────────────────────────

  private doSpecialAttack(): void {
    if (!this.isFighting || this.isDone) return;
    if (this.energy < 100) {
      this.showInfoMessage('能量不足，需要 100%！', '#ff8800', 900);
      return;
    }

    this.energy = 0;

    const { width, height } = this.scale;

    // Full screen dramatic red flash (stronger than before)
    const flash = this.add.graphics().setDepth(30);
    flash.fillStyle(0xff0000, 0.70);
    flash.fillRect(0, 0, width, height);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 500,
      ease: 'Power2',
      onComplete: () => flash.destroy(),
    });

    // Bigger charcoal (80px) falls from top
    const charcoal = this.add.text(width / 2, -60, '🪨', {
      fontSize: '80px',
      fontFamily: FONT,
    }).setOrigin(0.5).setDepth(35);

    // Fire particles scattered outward after impact
    const spawnFireParticles = (): void => {
      const offsets = [
        { ox: -70, oy: 20 },
        { ox: 70, oy: 10 },
        { ox: -30, oy: -30 },
        { ox: 40, oy: -20 },
      ];
      offsets.forEach(({ ox, oy }) => {
        const fire = this.add.text(
          width / 2 + ox,
          this.opponentEmoji.y + oy,
          '🔥',
          { fontSize: '32px', fontFamily: FONT },
        ).setOrigin(0.5).setDepth(36);

        this.tweens.add({
          targets: fire,
          x: fire.x + ox * 1.5,
          y: fire.y - 60 - Math.random() * 40,
          alpha: 0,
          scale: { from: 1.2, to: 0.3 },
          duration: 600 + Math.random() * 200,
          ease: 'Power1',
          onComplete: () => fire.destroy(),
        });
      });
    };

    this.tweens.add({
      targets: charcoal,
      y: this.opponentEmoji.y + 20,
      duration: 450,
      ease: 'Bounce.Out',
      onComplete: () => {
        charcoal.destroy();
        sfx.playExplosion();
        const specialDmg = Math.round(35 * this.weaponBonus);
        this.dealDamageToOpponent(specialDmg);
        // Stronger screen shake
        this.cameras.main.shake(300, 0.03);
        this.flashFullScreen(0xff2200, 0.45, 120);
        this.spawnDamageNumber(width / 2, this.opponentEmoji.y, `木炭轟炸！ -${specialDmg}`, '#ff4400');
        spawnFireParticles();
        this.showOpponentReaction(35, false, true);

        // Cheese burst effect for special attack
        if (this.textures.exists('battle-attack-cheese')) {
          const burst = this.add.image(width / 2, height * 0.5, 'battle-attack-cheese').setDepth(42);
          const bScale = Math.min(120 / burst.width, 120 / burst.height);
          burst.setScale(0);
          this.tweens.add({
            targets: burst,
            scale: bScale,
            alpha: { from: 1, to: 0 },
            angle: { from: 0, to: 180 },
            duration: 600,
            onComplete: () => burst.destroy(),
          });
        }

        // Opponent turns dark for 1 second
        this.opponentEmoji.setTint(0x222222);
        this.opponentEmoji.setAlpha(0.7);
        this.time.delayedCall(1000, () => {
          if (this.opponentEmoji.active) {
            this.opponentEmoji.clearTint();
            this.opponentEmoji.setAlpha(1);
          }
        });
      },
    });
  }

  // ── Opponent AI attack ────────────────────────────────────────────────────────

  private doOpponentAttack(): void {
    if (this.isDone) return;
    const { width, height } = this.scale;

    // B2: Trigger special move when opponent HP < 50% (once per battle)
    if (!this.opponentSpecialUsed && this.opponentHp < this.opponentMaxHp * 0.5) {
      this.opponentSpecialUsed = true;
      this.doOpponentSpecial();
      return; // skip normal attack this tick
    }

    // Opponent lunges: scale up AND move forward (downward toward player)
    const origY = this.opponentEmoji.y;
    this.tweens.add({
      targets: this.opponentEmoji,
      scaleX: this.opponentBaseScale * 1.6,
      scaleY: this.opponentBaseScale * 1.6,
      y: origY + 30,
      duration: 150,
      yoyo: true,
      ease: 'Quad.Out',
      onComplete: () => {
        if (this.opponentEmoji.active) this.opponentEmoji.y = origY;
      },
    });

    // Fist emoji flies toward camera (grows + fades)
    const fist = this.add.text(this.opponentEmoji.x, this.opponentEmoji.y + 40, '👊', {
      fontSize: '44px',
      fontFamily: FONT,
    }).setOrigin(0.5).setDepth(37).setScale(0.5);

    this.tweens.add({
      targets: fist,
      y: height * 0.75,
      scale: { from: 0.5, to: 2.5 },
      alpha: { from: 1, to: 0 },
      duration: 320,
      ease: 'Power2',
      onComplete: () => fist.destroy(),
    });

    const hitChance = Math.random();
    // B3: Check dodge before applying damage
    if (this.isDodging) {
      this.spawnInfoFloat(width / 2, height - 120, 'MISS！閃避成功！', '#44aaff');
      return;
    }
    if (hitChance < 0.70) {
      sfx.playPlayerHit();
      this.playerHp = Math.max(0, this.playerHp - this.aiDamage);
      this.energy = Math.min(100, this.energy + 15); // getting hit charges energy
      this.flashScreenEdges();
      // Red vignette + camera shake on player hit
      this.cameras.main.shake(140, 0.010);
      this.flashFullScreen(0xff0000, 0.25, 80);

      const dmgLabel = Math.round(this.aiDamage);
      this.spawnDamageNumber(
        width / 2,
        height - 120,
        `受傷 -${dmgLabel}`,
        '#ff4455',
      );

      if (this.playerHp <= 0) {
        this.endFight('opponent');
      }
    } else {
      this.spawnInfoFloat(
        width / 2,
        height - 120,
        '閃開了！',
        '#44ff88',
      );
    }
  }

  // ── B2: Opponent special move ─────────────────────────────────────────────────

  private doOpponentSpecial(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    const specials = [
      { name: '馬桶刷旋風', emoji: '🧹', damage: 20, text: '對手掏出馬桶刷瘋狂旋轉！' },
      { name: '直播閃光', emoji: '📱', damage: 15, text: '對手開閃光燈直播！你被閃瞎 2 秒！' },
      { name: '臭豆腐毒氣', emoji: '💨', damage: 18, text: '對手丟出臭豆腐！毒氣彌漫！' },
      { name: '黃金香腸', emoji: '✨', damage: 25, text: '對手掏出傳說中的黃金香腸！' },
      { name: '鐵板燒技', emoji: '🔥', damage: 30, text: '對手使出鐵板燒終極奧義！' },
    ];

    const special = specials[Math.min(this.difficulty - 1, specials.length - 1)];

    this.flashFullScreen(0xff0000, 0.4, 200);

    const nameText = this.add.text(w / 2, h * 0.3, `⚡ ${special.name}`, {
      fontSize: '24px',
      fontFamily: FONT,
      color: '#ff4444',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(40);

    const descText = this.add.text(w / 2, h * 0.38, special.text, {
      fontSize: '14px',
      fontFamily: FONT,
      color: '#ffcc00',
    }).setOrigin(0.5).setDepth(40);

    const emojiText = this.add.text(w / 2, h * 0.15, special.emoji, {
      fontSize: '80px',
      fontFamily: FONT,
    }).setOrigin(0.5).setDepth(40);

    this.tweens.add({
      targets: emojiText,
      y: h * 0.7,
      scale: { from: 1, to: 2.5 },
      duration: 600,
      ease: 'Power2',
      onComplete: () => {
        // B3: Special can also be dodged
        if (this.isDodging) {
          this.spawnDamageNumber(w / 2, h * 0.6, 'MISS！閃避必殺技！', '#44aaff');
        } else {
          this.playerHp = Math.max(0, this.playerHp - special.damage);
          this.cameras.main.shake(300, 0.03);
          this.flashFullScreen(0xff0000, 0.3, 150);
          sfx.playPlayerHit();
          this.spawnDamageNumber(w / 2, h * 0.6, `-${special.damage}`, '#ff4444');
          if (this.playerHp <= 0) this.endFight('opponent');
        }
        emojiText.destroy();
        this.time.delayedCall(1000, () => {
          nameText.destroy();
          descText.destroy();
        });
      },
    });
  }

  // ── B3: Dodge mechanic ────────────────────────────────────────────────────────

  private doDodge(): void {
    if (this.isDodging || this.dodgeCooldown > 0 || !this.isFighting || this.isDone) return;

    this.isDodging = true;
    this.dodgeCooldown = 1.5;

    this.flashFullScreen(0x4444ff, 0.2, 100);
    const dodgeText = this.add.text(this.scale.width / 2, this.scale.height * 0.5, '閃避！', {
      fontSize: '20px',
      fontFamily: FONT,
      color: '#44aaff',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(40);

    this.tweens.add({
      targets: dodgeText,
      y: dodgeText.y - 40,
      alpha: 0,
      duration: 600,
      onComplete: () => dodgeText.destroy(),
    });

    this.time.delayedCall(400, () => {
      this.isDodging = false;
    });
  }

  // ── Damage helper ─────────────────────────────────────────────────────────────

  private dealDamageToOpponent(dmg: number): void {
    this.opponentHp = Math.max(0, this.opponentHp - dmg);
    if (this.opponentHp <= 0) {
      this.endFight('player');
    }
  }

  // ── Hit detection ─────────────────────────────────────────────────────────────

  private isHitOnOpponent(pointer: Phaser.Input.Pointer): boolean {
    if (!this.opponentEmoji || !this.opponentEmoji.active) return false;
    const bounds = this.opponentEmoji.getBounds();
    return bounds.contains(pointer.x, pointer.y);
  }

  private isHeadshot(pointer: Phaser.Input.Pointer): boolean {
    if (!this.opponentEmoji || !this.opponentEmoji.active) return false;
    const bounds = this.opponentEmoji.getBounds();
    return pointer.y < bounds.y + bounds.height / 3;
  }

  // ── Fight end ─────────────────────────────────────────────────────────────────

  private endByTimeout(): void {
    if (this.isDone) return;
    const playerPct = this.playerHp / this.playerMaxHp;
    const oppPct = this.opponentHp / this.opponentMaxHp;
    const winner = playerPct > oppPct ? 'player' : oppPct > playerPct ? 'opponent' : 'draw';
    this.endFight(winner as 'player' | 'opponent' | 'draw');
  }

  private endFight(winner: 'player' | 'opponent' | 'draw'): void {
    if (this.isDone) return;
    this.isDone = true;
    this.isFighting = false;

    const resultMsg = applyBattleResult(winner);

    let color = '#ffcc00';
    if (winner === 'player') color = '#44ff88';
    if (winner === 'opponent') color = '#ff4455';

    // B4: Battle rewards on win
    const resultLines: string[] = [resultMsg];
    if (winner === 'player') {
      const goldReward = 50 + this.difficulty * 30; // $80–$200
      addMoney(goldReward);

      const dropRoll = Math.random();
      let dropText = '';
      if (dropRoll < 0.1) {
        dropText = '獲得神秘配方！';
      } else if (dropRoll < 0.3) {
        const bonusSausages = 3 + this.difficulty;
        dropText = `搶到 ${bonusSausages} 根對手的香腸！`;
      }

      resultLines.push(`戰利品：$${goldReward}`);
      if (dropText) resultLines.push(dropText);
    }

    this.time.delayedCall(600, () => {
      this.showResult(resultLines.join('\n'), color);
    });
  }

  private showResult(msg: string, color: string): void {
    this.resultText
      .setText(msg)
      .setColor(color)
      .setVisible(true)
      .setAlpha(0);

    this.tweens.add({ targets: this.resultText, alpha: 1, duration: 500 });

    this.time.delayedCall(800, () => {
      this.continueBtn.setVisible(true);
      this.tweens.add({ targets: this.continueBtn, alpha: 1, duration: 300 });
    });
  }

  // ── update ────────────────────────────────────────────────────────────────────

  update(_time: number, delta: number): void {
    const dt = delta / 1000;

    if (!this.isFighting || this.isDone) return;

    // Cooldown ticks
    this.normalCd = Math.max(0, this.normalCd - dt);
    this.heavyCd = Math.max(0, this.heavyCd - dt);
    this.opponentStunTimer = Math.max(0, this.opponentStunTimer - dt);
    // B3: Dodge cooldown tick
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);

    // Move crosshair
    const pointer = this.input.activePointer;
    this.updateCrosshair(pointer.x, pointer.y);

    // AI attack tick
    if (this.opponentStunTimer <= 0) {
      this.aiAttackTimer += dt;
      if (this.aiAttackTimer >= this.aiAttackInterval) {
        this.doOpponentAttack();
        this.aiAttackTimer = 0;
      }
    }

    // Battle timer
    this.battleTimer -= dt;
    if (this.battleTimer <= 0) {
      this.battleTimer = 0;
      this.endByTimeout();
    }

    this.redrawBars();
    this.updateTimerText();
    this.updateEnergyPulse();
  }

  // ── Redraw HUD bars ───────────────────────────────────────────────────────────

  private redrawBars(): void {
    const { width, height } = this.scale;
    const barH = 14;
    const playerBarW = width * 0.32;
    const oppBarW = width * 0.32;
    const barY = height - 56;
    const energyBarW = width * 0.20;

    // Player HP bar
    const pRatio = Math.max(0, this.playerHp / this.playerMaxHp);
    this.playerHpBar.clear();
    this.playerHpBar.fillStyle(0x113311, 1);
    this.playerHpBar.fillRoundedRect(10, barY, playerBarW, barH, 4);
    const pColor = pRatio > 0.5 ? 0x44ff88 : pRatio > 0.25 ? 0xffcc00 : 0xff4455;
    this.playerHpBar.fillStyle(pColor, 1);
    this.playerHpBar.fillRoundedRect(10, barY, playerBarW * pRatio, barH, 4);
    this.playerHpLabel.setText(`我方 HP: ${Math.ceil(this.playerHp)}/${this.playerMaxHp}`);

    // Opponent HP bar
    const oRatio = Math.max(0, this.opponentHp / this.opponentMaxHp);
    this.opponentHpBarFill.clear();
    this.opponentHpBarFill.fillStyle(0x331111, 1);
    this.opponentHpBarFill.fillRoundedRect(width - 10 - oppBarW, barY, oppBarW, barH, 4);
    const oColor = oRatio > 0.5 ? 0xff4455 : oRatio > 0.25 ? 0xff8800 : 0xffff00;
    this.opponentHpBarFill.fillStyle(oColor, 1);
    this.opponentHpBarFill.fillRoundedRect(
      width - 10 - oppBarW + oppBarW * (1 - oRatio),
      barY,
      oppBarW * oRatio,
      barH,
      4,
    );
    this.opponentHpLabel.setText(`對手 HP: ${Math.ceil(this.opponentHp)}/${this.opponentMaxHp}`);

    // Energy bar (center)
    const eRatio = this.energy / 100;
    const energyBarX = (width - energyBarW) / 2;
    const energyBarY = height - 36;
    this.energyBarFill.clear();
    this.energyBarFill.fillStyle(0x111133, 1);
    this.energyBarFill.fillRoundedRect(energyBarX, energyBarY, energyBarW, 10, 3);
    const eColor = this.energy >= 100 ? 0xffee00 : 0x4488ff;
    this.energyBarFill.fillStyle(eColor, 1);
    this.energyBarFill.fillRoundedRect(energyBarX, energyBarY, energyBarW * eRatio, 10, 3);
    this.energyLabel.setText(`能量 ${Math.floor(this.energy)}%`);
  }

  private updateTimerText(): void {
    const secs = Math.ceil(this.battleTimer);
    this.timerText.setText(`${secs}s`);
    if (secs <= 10) {
      this.timerText.setColor('#ff4455');
      const alpha = (Math.sin(Date.now() / 200) + 1) / 2;
      this.timerText.setAlpha(0.5 + alpha * 0.5);
    } else {
      this.timerText.setColor('#ffffff');
      this.timerText.setAlpha(1);
    }
  }

  private updateEnergyPulse(): void {
    if (this.energy >= 100 && !this.energyPulseTween) {
      this.energyPulseTween = this.tweens.add({
        targets: this.energyLabel,
        scaleX: 1.15,
        scaleY: 1.15,
        duration: 350,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
      this.showInfoMessage('特殊技能可用！按 空白鍵 / E', '#ffee00', 2000);
    } else if (this.energy < 100 && this.energyPulseTween) {
      this.energyPulseTween.stop();
      this.energyPulseTween = null;
      this.energyLabel.setScale(1);
    }
  }

  // ── Background drawing ───────────────────────────────────────────────────────

  private drawBackground(width: number, height: number): void {
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x050015, 0x050015, 0x0f001a, 0x0f001a, 1);
    bg.fillRect(0, 0, width, height);

    // Floor (night market ground)
    bg.fillGradientStyle(0x1a0011, 0x1a0011, 0x080008, 0x080008, 1);
    bg.fillRect(0, height * 0.65, width, height * 0.35);

    // Neon ambient glow blobs
    const glow = this.add.graphics();
    glow.fillStyle(0xff1144, 0.05);
    glow.fillEllipse(width * 0.25, height * 0.4, width * 0.5, height * 0.45);
    glow.fillStyle(0x2244ff, 0.04);
    glow.fillEllipse(width * 0.75, height * 0.4, width * 0.5, height * 0.45);
    glow.fillStyle(0xff6600, 0.03);
    glow.fillEllipse(width * 0.5, height * 0.7, width * 0.8, height * 0.25);

    // Distant stalls (decorative rectangles)
    this.drawDistantStalls(width, height);

    // Neon ground line
    const groundLine = this.add.graphics();
    groundLine.lineStyle(2, 0xff2266, 0.25);
    groundLine.beginPath();
    groundLine.moveTo(0, height * 0.65);
    groundLine.lineTo(width, height * 0.65);
    groundLine.strokePath();
  }

  private drawDistantStalls(width: number, height: number): void {
    const stalls: NeonConfig[] = [
      { x: width * 0.08, y: height * 0.35, w: 60, h: 40, color: 0x220011, glowColor: 0xff2255 },
      { x: width * 0.85, y: height * 0.38, w: 55, h: 35, color: 0x001122, glowColor: 0x2266ff },
      { x: width * 0.14, y: height * 0.55, w: 45, h: 30, color: 0x112200, glowColor: 0x44ff44 },
      { x: width * 0.80, y: height * 0.58, w: 50, h: 28, color: 0x221100, glowColor: 0xff8800 },
    ];

    const g = this.add.graphics();
    stalls.forEach(({ x, y, w, h, color, glowColor }) => {
      g.fillStyle(color, 1);
      g.fillRect(x, y, w, h);
      g.lineStyle(1, glowColor, 0.6);
      g.strokeRect(x, y, w, h);
    });
  }

  // ── Opponent stall ────────────────────────────────────────────────────────────

  private drawOpponentStall(width: number, height: number): void {
    const stallW = 200;
    const stallH = 55;
    const stallX = width / 2 - stallW / 2;
    const stallY = height * 0.06;

    const g = this.add.graphics();
    // Stall body
    g.fillStyle(0x0a0022, 1);
    g.fillRoundedRect(stallX, stallY, stallW, stallH, 6);
    // Neon border
    g.lineStyle(2, 0xff1166, 0.9);
    g.strokeRoundedRect(stallX, stallY, stallW, stallH, 6);
    // Inner glow
    g.lineStyle(4, 0xff1166, 0.15);
    g.strokeRoundedRect(stallX + 2, stallY + 2, stallW - 4, stallH - 4, 5);

    // Awning strips
    const stripeG = this.add.graphics();
    for (let i = 0; i < 5; i++) {
      stripeG.fillStyle(i % 2 === 0 ? 0x330011 : 0x110022, 0.8);
      stripeG.fillRect(stallX + i * (stallW / 5), stallY, stallW / 5, 10);
    }

    const oppInfo = DIFFICULTY_OPPONENTS[this.difficulty] ?? { emoji: '👹', name: '神秘攤位' };
    this.add.text(width / 2, stallY + stallH / 2, oppInfo.name, {
      fontSize: '16px',
      fontFamily: FONT,
      color: '#ff88aa',
      fontStyle: 'bold',
      shadow: { blur: 10, color: '#ff0055', fill: true },
    }).setOrigin(0.5);
  }

  // ── Opponent emoji ─────────────────────────────────────────────────────────────

  private spawnOpponentEmoji(width: number, height: number): void {
    const oppInfo = DIFFICULTY_OPPONENTS[this.difficulty] ?? { emoji: '👹', name: '神秘對手' };
    const fontSize = 80;

    this.opponentEmoji = this.add.text(
      width * OPP_CENTER_X_FRAC,
      height * OPP_CENTER_Y_FRAC,
      oppInfo.emoji,
      {
        fontSize: `${fontSize}px`,
        fontFamily: FONT,
      },
    ).setOrigin(0.5);

    this.opponentBaseScale = 1;

    // Try to show opponent portrait image instead of/alongside emoji
    const opponentSlotData = GRID_SLOTS.find(s => s.tier === (gameState.playerSlot + 1));
    const oppId = opponentSlotData?.opponentId || '';
    const oppTextureKey = `opponent-${oppId}`;
    if (this.textures.exists(oppTextureKey)) {
      const portrait = this.add.image(this.opponentEmoji.x, this.opponentEmoji.y, oppTextureKey);
      const maxH = height * 0.35;
      const maxW = width * 0.35;
      const scale = Math.min(maxH / portrait.height, maxW / portrait.width);
      portrait.setScale(scale).setDepth(this.opponentEmoji.depth + 1);
      this.opponentEmoji.setAlpha(0); // hide emoji, show portrait instead
    }

    // Player portrait in bottom-left corner
    if (this.textures.exists('player-portrait')) {
      const playerPortrait = this.add.image(60, height - 60, 'player-portrait');
      const pScale = Math.min(80 / playerPortrait.height, 80 / playerPortrait.width);
      playerPortrait.setScale(pScale).setDepth(5);
    }

    // Idle breathing animation
    this.tweens.add({
      targets: this.opponentEmoji,
      scaleX: 1.04,
      scaleY: 1.04,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  // ── HUD ───────────────────────────────────────────────────────────────────────

  private setupHUD(width: number, height: number): void {
    // HP bar image frames (decorative backgrounds behind graphics bars)
    const barH = 14;
    const playerBarW = width * 0.32;
    const oppBarW = width * 0.32;
    const barY = height - 56;

    if (this.textures.exists('hp-bar-player')) {
      const hpFrame = this.add.image(10 + playerBarW / 2, barY + barH / 2, 'hp-bar-player');
      hpFrame.setDisplaySize(playerBarW + 10, barH + 6).setAlpha(0.7).setDepth(9);
    }
    if (this.textures.exists('hp-bar-opponent')) {
      const oppFrame = this.add.image(width - 10 - oppBarW / 2, barY + barH / 2, 'hp-bar-opponent');
      oppFrame.setDisplaySize(oppBarW + 10, barH + 6).setAlpha(0.7).setDepth(9);
    }

    // Graphics objects (filled in redrawBars)
    this.playerHpBar = this.add.graphics().setDepth(10);
    this.opponentHpBarFill = this.add.graphics().setDepth(10);
    this.energyBarFill = this.add.graphics().setDepth(10);

    const labelStyle = {
      fontSize: '11px',
      fontFamily: FONT,
      color: '#ffffff',
    };

    this.playerHpLabel = this.add.text(10, height - 76, '', labelStyle).setDepth(11);
    this.opponentHpLabel = this.add.text(width - 10, height - 76, '', {
      ...labelStyle,
    }).setOrigin(1, 0).setDepth(11);

    this.energyLabel = this.add.text(width / 2, height - 50, '能量 0%', {
      fontSize: '12px',
      fontFamily: FONT,
      color: '#4488ff',
    }).setOrigin(0.5).setDepth(11);

    // Timer (top center)
    this.timerText = this.add.text(width / 2, height * 0.15, '60s', {
      fontSize: '20px',
      fontFamily: FONT,
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(11);

    // HUD help text
    this.add.text(width / 2, height - 12, '左鍵：揮香腸  右鍵：強力衝刺  空白/E：特殊技能  D/Shift：閃避', {
      fontSize: '10px',
      fontFamily: FONT,
      color: '#554466',
    }).setOrigin(0.5).setDepth(11);

    // Initial bar draw
    this.redrawBars();
  }

  // ── Crosshair ─────────────────────────────────────────────────────────────────

  private setupCrosshair(width: number, height: number): void {
    this.crosshairH = this.add.graphics().setDepth(40);
    this.crosshairV = this.add.graphics().setDepth(40);
    this.updateCrosshair(width / 2, height / 2);
  }

  private updateCrosshair(x: number, y: number): void {
    const len = 18;
    const gap = 5;

    this.crosshairH.clear();
    this.crosshairH.lineStyle(1.5, 0xffffff, 0.85);
    this.crosshairH.beginPath();
    this.crosshairH.moveTo(x - len - gap, y);
    this.crosshairH.lineTo(x - gap, y);
    this.crosshairH.moveTo(x + gap, y);
    this.crosshairH.lineTo(x + len + gap, y);
    this.crosshairH.strokePath();

    this.crosshairV.clear();
    this.crosshairV.lineStyle(1.5, 0xffffff, 0.85);
    this.crosshairV.beginPath();
    this.crosshairV.moveTo(x, y - len - gap);
    this.crosshairV.lineTo(x, y - gap);
    this.crosshairV.moveTo(x, y + gap);
    this.crosshairV.lineTo(x, y + len + gap);
    this.crosshairV.strokePath();
  }

  // ── Screen vignette (damage flash) ───────────────────────────────────────────

  private setupScreenVignette(width: number, height: number): void {
    this.screenVignette = this.add.graphics().setDepth(38).setAlpha(0);
    this.screenVignette.fillStyle(0xff0000, 0.0);
    // Draw red edges
    const edgeW = 60;
    this.screenVignette.fillStyle(0xff0000, 0.35);
    this.screenVignette.fillRect(0, 0, edgeW, height);
    this.screenVignette.fillRect(width - edgeW, 0, edgeW, height);
    this.screenVignette.fillRect(0, 0, width, edgeW);
    this.screenVignette.fillRect(0, height - edgeW, width, edgeW);
  }

  private flashScreenEdges(): void {
    this.screenVignette.setAlpha(1);
    this.tweens.add({
      targets: this.screenVignette,
      alpha: 0,
      duration: 400,
      ease: 'Quad.Out',
    });
  }

  // ── Result UI ─────────────────────────────────────────────────────────────────

  private setupResultUI(width: number, height: number): void {
    this.resultText = this.add.text(width / 2, height * 0.52, '', {
      fontSize: '18px',
      fontFamily: FONT,
      color: '#44ff88',
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: width * 0.85 },
    }).setOrigin(0.5).setAlpha(0).setVisible(false).setDepth(25);

    this.setupContinueButton(width, height);
  }

  private setupContinueButton(width: number, height: number): void {
    const bx = width / 2;
    const by = height * 0.72;
    const btnW = 140;
    const btnH = 44;

    const container = this.add.container(bx, by).setDepth(26);

    const bg = this.add.graphics();
    const drawBg = (hover: boolean): void => {
      bg.clear();
      bg.fillStyle(hover ? 0xff2d55 : 0x0a0015, hover ? 0.25 : 0.95);
      bg.lineStyle(2, 0xff2d55, hover ? 1 : 0.9);
      bg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
      bg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    };
    drawBg(false);

    const label = this.add.text(0, 0, '繼 續', {
      fontSize: '18px',
      fontFamily: FONT,
      color: '#ff2d55',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const hit = this.add.zone(0, 0, btnW, btnH).setInteractive({ cursor: 'pointer' });
    hit.on('pointerover', () => drawBg(true));
    hit.on('pointerout', () => drawBg(false));
    hit.on('pointerdown', () => this.transitionToSummary());

    container.add([bg, label, hit]);
    container.setVisible(false).setAlpha(0);
    this.continueBtn = container;
  }

  // ── Animation helpers ─────────────────────────────────────────────────────────

  /** Floating damage number at a position. */
  private spawnDamageNumber(x: number, y: number, text: string, color: string): void {
    const obj = this.add.text(x, y, text, {
      fontSize: '16px',
      fontFamily: FONT,
      color,
      fontStyle: 'bold',
      shadow: { blur: 6, color: '#000000', fill: true },
    }).setOrigin(0.5).setDepth(36);

    this.tweens.add({
      targets: obj,
      y: y - 55,
      alpha: 0,
      duration: 900,
      ease: 'Quad.Out',
      onComplete: () => obj.destroy(),
    });
  }

  /** Floating info float (non-damage). */
  private spawnInfoFloat(x: number, y: number, text: string, color: string): void {
    this.spawnDamageNumber(x, y, text, color);
  }

  /** Brief center message (fades out). */
  private showInfoMessage(msg: string, color: string, duration = 1500): void {
    const { width, height } = this.scale;
    const obj = this.add.text(width / 2, height * 0.46, msg, {
      fontSize: '18px',
      fontFamily: FONT,
      color,
      fontStyle: 'bold',
      shadow: { blur: 8, color: '#000000', fill: true },
    }).setOrigin(0.5).setDepth(45);

    this.tweens.add({
      targets: obj,
      alpha: 0,
      delay: duration * 0.6,
      duration: duration * 0.4,
      onComplete: () => obj.destroy(),
    });
  }

  // ── Opponent speech bubble reaction ──────────────────────────────────────────

  /**
   * Show a random speech bubble near the opponent after a hit.
   * @param _damage - damage dealt (reserved for future scaling)
   * @param isHeadshot - true if headshot hit
   * @param isSpecial - true if special attack
   */
  private showOpponentReaction(_damage: number, isHeadshot: boolean, isSpecial: boolean): void {
    if (!this.opponentEmoji || !this.opponentEmoji.active) return;

    const reactions = isSpecial
      ? ['好燙！！！', '我的臉！！', '你瘋了嗎！', '救命啊！']
      : isHeadshot
      ? ['好痛！頭！', '我的頭！', '你打頭！', '犯規啦！']
      : ['好燙！', '哎呦！', '痛死了！', '你敢打我！', '香腸也太硬！', '等等...好香？'];

    const text = reactions[Math.floor(Math.random() * reactions.length)];

    const bubble = this.add.text(
      this.opponentEmoji.x + 80,
      this.opponentEmoji.y - 40,
      text,
      {
        fontSize: '18px',
        fontFamily: FONT,
        color: '#ffffff',
        backgroundColor: '#333333',
        padding: { x: 8, y: 4 },
        fontStyle: 'bold',
      },
    ).setOrigin(0, 1).setDepth(35);

    this.tweens.add({
      targets: bubble,
      y: bubble.y - 30,
      alpha: { from: 1, to: 0 },
      duration: 1200,
      ease: 'Power1',
      onComplete: () => bubble.destroy(),
    });
  }

  // ── Full-screen color flash ───────────────────────────────────────────────────

  /**
   * Brief full-screen tinted flash overlay.
   * @param color - hex color (e.g. 0xffffff)
   * @param alpha - peak alpha opacity
   * @param duration - fade duration in ms
   */
  private flashFullScreen(color: number, alpha: number, duration: number): void {
    const { width, height } = this.scale;
    const overlay = this.add.graphics().setDepth(39);
    overlay.fillStyle(color, alpha);
    overlay.fillRect(0, 0, width, height);
    this.tweens.add({
      targets: overlay,
      alpha: 0,
      duration,
      ease: 'Quad.Out',
      onComplete: () => overlay.destroy(),
    });
  }

  // ── Text button helper ────────────────────────────────────────────────────────

  private makeTextButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
  ): Phaser.GameObjects.Text {
    const btn = this.add.text(x, y, label, {
      fontSize: '16px',
      fontFamily: FONT,
      color: '#ff2d55',
      backgroundColor: '#11001a',
      padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setInteractive({ cursor: 'pointer' });

    btn.on('pointerover', () => btn.setColor('#ff6688'));
    btn.on('pointerout', () => btn.setColor('#ff2d55'));
    btn.on('pointerdown', onClick);

    return btn;
  }

  // ── Transition ────────────────────────────────────────────────────────────────

  private transitionToSummary(): void {
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('SummaryScene');
    });
  }

  // ── Shutdown ──────────────────────────────────────────────────────────────────

  shutdown(): void {
    this.time.removeAllEvents();
    this.energyPulseTween?.stop();
    this.energyPulseTween = null;
    this.input.off('pointerdown');
    if (this.input.keyboard) {
      this.input.keyboard.off('keydown-SPACE');
      this.input.keyboard.off('keydown-E');
      this.input.keyboard.off('keydown-D');
      this.input.keyboard.off('keydown-SHIFT');
    }
    EventBus.off('battle-start');
    EventBus.off('battle-skip');
  }
}

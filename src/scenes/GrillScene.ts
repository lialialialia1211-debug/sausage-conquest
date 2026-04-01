// GrillScene — 夜晚烤制小遊戲 (pure Phaser, no HTML overlay)
import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { gameState, changeReputation, updateGameState } from '../state/GameState';
import { GRID_SLOTS } from '../data/map';
import { SAUSAGE_MAP } from '../data/sausages';
import {
  createGrillingSausage,
  updateSausage,
  flipSausage,
  judgeQuality,
  getQualityScore,
  type HeatLevel,
  type GrillingSausage,
} from '../systems/GrillEngine';
import { generateCustomers, willBuy } from '../systems/CustomerEngine';
import { sellSausage } from '../systems/EconomyEngine';
import { SausageSprite } from '../objects/SausageSprite';
import { CustomerQueue } from '../objects/CustomerQueue';
import type { SaleRecord, Customer } from '../types';

// Layout constants
const GAME_DURATION = 60; // seconds
const MAX_GRILL_SLOTS = 4;

// Grill row Y position (as fraction of canvas height)
const GRILL_Y_FRAC = 0.5;

// UI colors
const COLOR_BG_TOP = 0x100500;
const COLOR_BG_BTM = 0x1a0800;
const COLOR_ORANGE = '#ff6b00';
const COLOR_DIM = '#664422';
const FONT = 'Microsoft JhengHei, PingFang TC, sans-serif';

interface GrillSlot {
  sprite: SausageSprite | null;
  sausage: GrillingSausage | null;
  x: number;
  y: number;
}

export class GrillScene extends Phaser.Scene {
  // State
  private heatLevel: HeatLevel = 'medium';
  private timeLeft = GAME_DURATION;
  private speedMultiplier = 1;
  private salesLog: SaleRecord[] = [];
  private grillStats = { perfect: 0, ok: 0, raw: 0, burnt: 0 };
  private customers: Customer[] = [];
  private pendingCustomerQueue: Customer[] = [];
  private customerArrivalTimer = 0;
  private customerArrivalInterval = 8; // seconds between batches
  private isDone = false;

  // Grill slots
  private grillSlots: GrillSlot[] = [];

  // Phaser objects
  private customerQueue!: CustomerQueue;
  private timerText!: Phaser.GameObjects.Text;
  private revenueText!: Phaser.GameObjects.Text;
  private soldText!: Phaser.GameObjects.Text;
  private heatButtons: Phaser.GameObjects.Container[] = [];
  private speedButtons: Phaser.GameObjects.Container[] = [];
  private grillRackGfx!: Phaser.GameObjects.Graphics;
  private feedbackTexts: Phaser.GameObjects.Text[] = [];

  // Track slot inventory to refill
  private inventoryCopy: Record<string, number> = {};

  constructor() {
    super({ key: 'GrillScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    // Copy inventory for use during grilling
    this.inventoryCopy = { ...gameState.inventory };

    // Reset state
    this.heatLevel = 'medium';
    this.timeLeft = GAME_DURATION;
    this.speedMultiplier = 1;
    this.salesLog = [];
    this.grillStats = { perfect: 0, ok: 0, raw: 0, burnt: 0 };
    this.pendingCustomerQueue = [];
    this.customerArrivalTimer = 0;
    this.isDone = false;
    this.grillSlots = [];
    this.heatButtons = [];
    this.speedButtons = [];
    this.feedbackTexts = [];

    this.drawBackground(width, height);
    this.drawGrillRack(width, height);
    this.setupGrillSlots(width, height);
    this.setupCustomerQueue(width, height);
    this.setupHeatButtons(width, height);
    this.setupSpeedButtons(width, height);
    this.setupStatsBar(width, height);
    this.setupEndButton(width, height);
    this.generateCustomerPool();

    // Place initial sausages
    this.fillGrillFromInventory();

    this.cameras.main.fadeIn(400, 0, 0, 0);
    EventBus.emit('scene-ready', 'GrillScene');
  }

  update(_time: number, delta: number): void {
    if (this.isDone) return;

    const dt = (delta / 1000) * this.speedMultiplier;

    // Tick customers
    this.customerQueue.tick(dt);

    // Tick customer arrival
    this.customerArrivalTimer += dt;
    if (this.customerArrivalTimer >= this.customerArrivalInterval && this.pendingCustomerQueue.length > 0) {
      this.customerArrivalTimer = 0;
      // Arrive 1-2 customers at a time
      const batch = Math.min(2, this.pendingCustomerQueue.length);
      for (let i = 0; i < batch; i++) {
        const c = this.pendingCustomerQueue.shift();
        if (c) {
          this.customers.push(c);
          this.customerQueue.addCustomer(c);
        }
      }
    }

    // Update sausages
    for (const slot of this.grillSlots) {
      if (!slot.sausage || !slot.sprite || slot.sausage.served) continue;

      const updated = updateSausage(slot.sausage, this.heatLevel, dt);
      slot.sausage = updated;
      slot.sprite.updateData(updated);

      // Auto-handle burnt sausages
      const quality = judgeQuality(updated);
      if (quality === 'burnt') {
        slot.sausage = { ...updated, served: true };
        slot.sprite.updateData(slot.sausage);
        const capturedSlot = slot;
        slot.sprite.playBurntAnimation();
        slot.sprite = null;
        this.grillStats.burnt++;
        changeReputation(-2);
        this.showFeedback('燒焦了！-2 聲望', slot.x, slot.y, '#ff3300');
        // Schedule refill after animation
        this.time.delayedCall(1200, () => {
          capturedSlot.sausage = null;
          this.fillSlot(capturedSlot);
        });
      }
    }

    // Countdown timer
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.endGrilling();
    }

    this.updateTimerDisplay();
    this.updateRevenueDisplay();
  }

  // ── Setup methods ──────────────────────────────────────────────────────────

  private drawBackground(width: number, height: number): void {
    const bg = this.add.graphics();
    bg.fillGradientStyle(COLOR_BG_TOP, COLOR_BG_TOP, COLOR_BG_BTM, COLOR_BG_BTM, 1);
    bg.fillRect(0, 0, width, height);

    // Subtle warm glow in grill area
    const glowY = height * GRILL_Y_FRAC;
    const glow = this.add.graphics();
    glow.fillStyle(0xff4400, 0.04);
    glow.fillEllipse(width / 2, glowY, width * 0.9, 120);
  }

  private drawGrillRack(width: number, height: number): void {
    this.grillRackGfx = this.add.graphics();
    const grillY = height * GRILL_Y_FRAC + 30;

    // Grill bars (decorative horizontal lines)
    this.grillRackGfx.lineStyle(3, 0x555555, 1);
    const barCount = 8;
    const barStartX = width * 0.1;
    const barEndX = width * 0.9;
    const barSpacing = 14;

    for (let i = 0; i < barCount; i++) {
      const y = grillY + i * barSpacing;
      this.grillRackGfx.beginPath();
      this.grillRackGfx.moveTo(barStartX, y);
      this.grillRackGfx.lineTo(barEndX, y);
      this.grillRackGfx.strokePath();
    }

    // Side rails
    this.grillRackGfx.lineStyle(4, 0x444444, 1);
    this.grillRackGfx.beginPath();
    this.grillRackGfx.moveTo(barStartX, grillY);
    this.grillRackGfx.lineTo(barStartX, grillY + (barCount - 1) * barSpacing);
    this.grillRackGfx.strokePath();

    this.grillRackGfx.beginPath();
    this.grillRackGfx.moveTo(barEndX, grillY);
    this.grillRackGfx.lineTo(barEndX, grillY + (barCount - 1) * barSpacing);
    this.grillRackGfx.strokePath();

    // Fire glow below rack
    const fireGlow = this.add.graphics();
    fireGlow.fillStyle(0xff2200, 0.06);
    fireGlow.fillRect(barStartX, grillY + barCount * barSpacing, barEndX - barStartX, 30);
  }

  private setupGrillSlots(width: number, height: number): void {
    const grillY = height * GRILL_Y_FRAC - 15;
    const totalW = width * 0.72;
    const startX = (width - totalW) / 2;

    for (let i = 0; i < MAX_GRILL_SLOTS; i++) {
      const x = startX + (i + 0.5) * (totalW / MAX_GRILL_SLOTS);
      this.grillSlots.push({ sprite: null, sausage: null, x, y: grillY });
    }
  }

  private setupCustomerQueue(_width: number, height: number): void {
    const queueY = height * 0.12;
    this.customerQueue = new CustomerQueue(this, 28, queueY);
    this.customerQueue.onTimeout((customerId: string) => {
      this.onCustomerTimeout(customerId);
    });

    // Queue label
    this.add.text(12, queueY - 22, '客人佇列', {
      fontSize: '13px',
      fontFamily: FONT,
      color: COLOR_DIM,
    });
  }

  private setupHeatButtons(width: number, height: number): void {
    const btnY = height * GRILL_Y_FRAC + 135;
    const levels: { level: HeatLevel; label: string; emoji: string }[] = [
      { level: 'low',    label: '小火', emoji: '🔥' },
      { level: 'medium', label: '中火', emoji: '🔥🔥' },
      { level: 'high',   label: '大火', emoji: '🔥🔥🔥' },
    ];

    const totalW = 260;
    const startX = width / 2 - totalW / 2;
    const btnW = 78;
    const btnH = 42;

    levels.forEach((item, i) => {
      const bx = startX + i * (btnW + 13) + btnW / 2;
      const btn = this.createButton(bx, btnY, btnW, btnH, `${item.emoji}\n${item.label}`, () => {
        this.heatLevel = item.level;
        this.updateHeatButtonStyles();
      });
      this.heatButtons.push(btn);
    });

    this.updateHeatButtonStyles();

    // Label above
    this.add.text(width / 2, btnY - 28, '火力控制', {
      fontSize: '13px',
      fontFamily: FONT,
      color: COLOR_DIM,
    }).setOrigin(0.5);
  }

  private setupSpeedButtons(width: number, height: number): void {
    const btnY = height * GRILL_Y_FRAC + 135;
    const speeds = [1, 2, 3];
    const btnW = 38;
    const btnH = 28;
    const startX = width - 130;

    speeds.forEach((spd, i) => {
      const bx = startX + i * (btnW + 6);
      const btn = this.createButton(bx, btnY, btnW, btnH, `${spd}x`, () => {
        this.speedMultiplier = spd;
        this.updateSpeedButtonStyles();
      });
      this.speedButtons.push(btn);
    });

    this.updateSpeedButtonStyles();

    this.add.text(startX + (btnW * 3 + 12) / 2 - 6, btnY - 22, '速度', {
      fontSize: '12px',
      fontFamily: FONT,
      color: COLOR_DIM,
    }).setOrigin(0.5);
  }

  private setupStatsBar(width: number, height: number): void {
    const statsY = height - 50;

    this.add.text(20, statsY, '營收:', {
      fontSize: '14px', fontFamily: FONT, color: COLOR_DIM,
    });
    this.revenueText = this.add.text(68, statsY, '$0', {
      fontSize: '14px', fontFamily: FONT, color: COLOR_ORANGE,
    });

    this.add.text(width / 2 - 50, statsY, '已售:', {
      fontSize: '14px', fontFamily: FONT, color: COLOR_DIM,
    });
    this.soldText = this.add.text(width / 2 - 2, statsY, '0', {
      fontSize: '14px', fontFamily: FONT, color: COLOR_ORANGE,
    });

    this.add.text(20, statsY + 20, '⏱ 剩餘:', {
      fontSize: '13px', fontFamily: FONT, color: COLOR_DIM,
    });
    this.timerText = this.add.text(76, statsY + 20, '60s', {
      fontSize: '13px', fontFamily: FONT, color: '#ff9900',
    });
  }

  private setupEndButton(_width: number, height: number): void {
    const btnW = 120;
    const btnH = 36;
    const bx = this.scale.width - 80;
    const by = height - 30;

    const btn = this.createButton(bx, by, btnW, btnH, '結束營業', () => {
      this.endGrilling();
    });
    this.add.existing(btn);
  }

  // ── Button factory ─────────────────────────────────────────────────────────

  private createButton(
    x: number, y: number, w: number, h: number,
    label: string,
    onPress: () => void,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    const bg = this.add.graphics();
    this.drawButtonBg(bg, w, h, false);

    const txt = this.add.text(0, 0, label, {
      fontSize: label.includes('\n') ? '11px' : '13px',
      fontFamily: FONT,
      color: COLOR_ORANGE,
      align: 'center',
    }).setOrigin(0.5);

    const hitZone = this.add.zone(0, 0, w, h).setInteractive({ cursor: 'pointer' });

    hitZone.on('pointerover', () => this.drawButtonBg(bg, w, h, true));
    hitZone.on('pointerout',  () => this.drawButtonBg(bg, w, h, false));
    hitZone.on('pointerdown', onPress);

    container.add([bg, txt, hitZone]);
    return container;
  }

  private drawButtonBg(g: Phaser.GameObjects.Graphics, w: number, h: number, hover: boolean): void {
    g.clear();
    g.fillStyle(hover ? 0xff6b00 : 0x100500, hover ? 0.18 : 0.95);
    g.lineStyle(1, 0xff6b00, hover ? 1 : 0.5);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 4);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 4);
  }

  private updateHeatButtonStyles(): void {
    const levels: HeatLevel[] = ['low', 'medium', 'high'];
    this.heatButtons.forEach((btn, i) => {
      const isActive = levels[i] === this.heatLevel;
      const bg = btn.list[0] as Phaser.GameObjects.Graphics;
      const txt = btn.list[1] as Phaser.GameObjects.Text;
      bg.clear();
      if (isActive) {
        bg.fillStyle(0xff6b00, 0.35);
        bg.lineStyle(2, 0xff6b00, 1);
        bg.fillRoundedRect(-39, -21, 78, 42, 4);
        bg.strokeRoundedRect(-39, -21, 78, 42, 4);
        txt.setColor('#ffffff');
      } else {
        bg.fillStyle(0x100500, 0.95);
        bg.lineStyle(1, 0xff6b00, 0.35);
        bg.fillRoundedRect(-39, -21, 78, 42, 4);
        bg.strokeRoundedRect(-39, -21, 78, 42, 4);
        txt.setColor(COLOR_ORANGE);
      }
    });
  }

  private updateSpeedButtonStyles(): void {
    const speeds = [1, 2, 3];
    this.speedButtons.forEach((btn, i) => {
      const isActive = speeds[i] === this.speedMultiplier;
      const bg = btn.list[0] as Phaser.GameObjects.Graphics;
      const txt = btn.list[1] as Phaser.GameObjects.Text;
      bg.clear();
      if (isActive) {
        bg.fillStyle(0xff6b00, 0.35);
        bg.lineStyle(2, 0xff6b00, 1);
        bg.fillRoundedRect(-19, -14, 38, 28, 4);
        bg.strokeRoundedRect(-19, -14, 38, 28, 4);
        txt.setColor('#ffffff');
      } else {
        bg.fillStyle(0x100500, 0.95);
        bg.lineStyle(1, 0xff6b00, 0.35);
        bg.fillRoundedRect(-19, -14, 38, 28, 4);
        bg.strokeRoundedRect(-19, -14, 38, 28, 4);
        txt.setColor(COLOR_ORANGE);
      }
    });
  }

  // ── Game logic ─────────────────────────────────────────────────────────────

  private generateCustomerPool(): void {
    const slotId = gameState.selectedSlot;
    const gridSlot = GRID_SLOTS.find(s => s.id === slotId);
    const baseTraffic = gridSlot ? gridSlot.baseTraffic / 20 : 3; // normalize to 1-5 range
    const trafficNorm = Math.max(1, Math.min(5, baseTraffic));

    this.pendingCustomerQueue = generateCustomers(trafficNorm, 0);
    // Limit to a reasonable batch for 60 seconds
    if (this.pendingCustomerQueue.length > 20) {
      this.pendingCustomerQueue = this.pendingCustomerQueue.slice(0, 20);
    }
    // Add first batch immediately
    this.customerArrivalTimer = this.customerArrivalInterval; // trigger first arrival right away
  }

  private fillGrillFromInventory(): void {
    for (const slot of this.grillSlots) {
      this.fillSlot(slot);
    }
  }

  private fillSlot(slot: GrillSlot): void {
    if (slot.sprite) return; // already occupied

    // Pick a sausage from inventory
    const sausageId = this.pickFromInventory();
    if (!sausageId) return;

    this.inventoryCopy[sausageId]--;
    if (this.inventoryCopy[sausageId] <= 0) {
      delete this.inventoryCopy[sausageId];
    }

    const sausage = createGrillingSausage(sausageId);
    const sprite = new SausageSprite(this, slot.x, slot.y, sausage);

    sprite.onFlip(() => {
      const currentSlot = this.grillSlots.find(s => s.sprite === sprite);
      if (currentSlot && currentSlot.sausage) {
        currentSlot.sausage = flipSausage(currentSlot.sausage);
        sprite.updateData(currentSlot.sausage);
      }
    });

    sprite.onServe(() => {
      this.handleServeAttempt(slot, sprite);
    });

    slot.sausage = sausage;
    slot.sprite = sprite;
  }

  private pickFromInventory(): string | null {
    const available = Object.entries(this.inventoryCopy).filter(([, qty]) => qty > 0);
    if (available.length === 0) return null;
    const [id] = available[Math.floor(Math.random() * available.length)];
    return id;
  }

  private handleServeAttempt(slot: GrillSlot, sprite: SausageSprite): void {
    if (!slot.sausage || slot.sausage.served) return;

    const quality = judgeQuality(slot.sausage);

    if (quality === 'raw') {
      this.grillStats.raw++;
      this.showFeedback('還沒熟！', slot.x, slot.y - 50, '#ffaa00');
      // Flip it automatically for the player
      sprite.triggerFlip();
      const currentSlot = this.grillSlots.find(s => s.sprite === sprite);
      if (currentSlot && currentSlot.sausage) {
        currentSlot.sausage = flipSausage(currentSlot.sausage);
      }
      return;
    }

    if (quality === 'burnt') return; // handled elsewhere

    // Find next waiting customer
    const nextCustomer = this.customerQueue.getNextCustomer();
    if (!nextCustomer) {
      this.showFeedback('沒有客人等待！', slot.x, slot.y - 50, '#888888');
      return;
    }

    const sausageId = slot.sausage.sausageTypeId;
    const price = gameState.prices[sausageId] ?? SAUSAGE_MAP[sausageId]?.suggestedPrice ?? 35;
    const qualityScore = getQualityScore(quality);

    // Check if customer will buy
    const slotId = gameState.selectedSlot;
    const gridSlot = GRID_SLOTS.find(s => s.id === slotId);
    const trafficNorm = gridSlot ? Math.max(1, Math.min(5, gridSlot.baseTraffic / 20)) : 3;

    const bought = willBuy(nextCustomer, sausageId, price, qualityScore, trafficNorm);

    if (bought) {
      const record = sellSausage(sausageId, price, qualityScore);
      if (record) {
        this.salesLog.push(record);
        const isPerfect = quality === 'perfect';
        if (isPerfect) {
          this.grillStats.perfect++;
          changeReputation(1);
        } else {
          this.grillStats.ok++;
        }

        this.customerQueue.serveCustomer(nextCustomer.id, isPerfect);
        this.showFeedback(`+$${price}${isPerfect ? ' ★' : ''}`, slot.x, slot.y - 60, '#44ff88');

        // Remove from customer tracking
        this.customers = this.customers.filter(c => c.id !== nextCustomer.id);

        // Animate sausage flying off
        slot.sausage = { ...slot.sausage, served: true };
        slot.sprite = null;

        const queueX = 80;
        const queueY = this.scale.height * 0.12;
        sprite.playServeAnimation(queueX, queueY);

        // Refill slot after a short delay
        this.time.delayedCall(600, () => {
          slot.sausage = null;
          this.fillSlot(slot);
        });
      }
    } else {
      // Customer won't buy — they leave
      this.customerQueue.dismissFrontCustomer();
      this.showFeedback('客人嫌貴走了', slot.x, slot.y - 50, '#ff6666');
      this.customers = this.customers.filter(c => c.id !== nextCustomer.id);
    }
  }

  private onCustomerTimeout(customerId: string): void {
    changeReputation(-1);
    this.customers = this.customers.filter(c => c.id !== customerId);
    this.showFeedback('-1 聲望', 80, this.scale.height * 0.12, '#ff4444');
  }

  // ── Display helpers ────────────────────────────────────────────────────────

  private updateTimerDisplay(): void {
    const secs = Math.ceil(this.timeLeft);
    this.timerText.setText(`${secs}s`);
    if (secs <= 10) {
      this.timerText.setColor('#ff3300');
    } else if (secs <= 20) {
      this.timerText.setColor('#ff9900');
    } else {
      this.timerText.setColor('#ffcc44');
    }
  }

  private updateRevenueDisplay(): void {
    const total = this.salesLog.reduce((sum, r) => sum + r.price, 0);
    this.revenueText.setText(`$${total}`);
    this.soldText.setText(`${this.salesLog.length}`);
  }

  private showFeedback(msg: string, x: number, y: number, color: string): void {
    const txt = this.add.text(x, y, msg, {
      fontSize: '15px',
      fontFamily: FONT,
      color,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(100);

    this.feedbackTexts.push(txt);

    this.tweens.add({
      targets: txt,
      y: y - 45,
      alpha: 0,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => {
        txt.destroy();
        const idx = this.feedbackTexts.indexOf(txt);
        if (idx >= 0) this.feedbackTexts.splice(idx, 1);
      },
    });
  }

  // ── End session ────────────────────────────────────────────────────────────

  private endGrilling(): void {
    if (this.isDone) return;
    this.isDone = true;

    // Store salesLog and grillStats in gameState so BattleScene/SummaryScene can access them
    updateGameState({
      dailySalesLog: [...this.salesLog],
      dailyGrillStats: { ...this.grillStats },
    });

    EventBus.emit('grill-done', { salesLog: this.salesLog, grillStats: this.grillStats });

    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      // Every 3 days: trigger territory battle instead of going directly to summary
      if (gameState.day % 3 === 0) {
        this.scene.start('BattleScene');
      } else {
        this.scene.start('SummaryScene');
      }
    });
  }

  shutdown(): void {
    this.feedbackTexts.forEach(t => { if (t && t.active) t.destroy(); });
    this.feedbackTexts = [];
  }
}

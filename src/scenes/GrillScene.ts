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

// ── Layout constants ────────────────────────────────────────────────────────
const GAME_DURATION = 60;      // seconds
const MAX_GRILL_SLOTS = 4;     // 6 if grill-expand upgrade
const GRILL_Y_FRAC = 0.48;    // grill vertical position as fraction of screen height

// ── Colors / fonts ──────────────────────────────────────────────────────────
const COLOR_BG_TOP = 0x100500;
const COLOR_BG_BTM = 0x1a0800;
const COLOR_ORANGE = '#ff6b00';
const COLOR_DIM = '#664422';
const FONT = 'Microsoft JhengHei, PingFang TC, sans-serif';

// ── Internal types ───────────────────────────────────────────────────────────
interface GrillSlot {
  sprite: SausageSprite | null;
  sausage: GrillingSausage | null;
  x: number;
  y: number;
}

export class GrillScene extends Phaser.Scene {
  // ── Session state ───────────────────────────────────────────────────────
  private heatLevel: HeatLevel = 'medium';
  private timeLeft = GAME_DURATION;
  private speedMultiplier = 1;
  private salesLog: SaleRecord[] = [];
  private grillStats = { perfect: 0, ok: 0, raw: 0, burnt: 0 };
  private customers: Customer[] = [];
  private pendingCustomerQueue: Customer[] = [];
  private customerArrivalTimer = 0;
  private readonly customerArrivalInterval = 8; // seconds between batches
  private isDone = false;
  private sessionRevenue = 0;

  // ── Grill slots ─────────────────────────────────────────────────────────
  private grillSlots: GrillSlot[] = [];
  private inventoryCopy: Record<string, number> = {};
  // Round-robin index so slot-filling cycles through sausage types
  private inventoryRoundRobinIndex = 0;

  // ── Phaser objects ──────────────────────────────────────────────────────
  private customerQueue!: CustomerQueue;
  private timerText!: Phaser.GameObjects.Text;
  private revenueText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private heatButtons: Phaser.GameObjects.Container[] = [];
  private speedButtons: Phaser.GameObjects.Container[] = [];
  private feedbackTexts: Phaser.GameObjects.Text[] = [];
  // Fire emoji particles floating upward
  private fireParticles: Phaser.GameObjects.Text[] = [];
  private fireParticleTimer = 0;
  private fireGlowGfx!: Phaser.GameObjects.Graphics;
  private timerFlashTween: Phaser.Tweens.Tween | null = null;

  constructor() {
    super({ key: 'GrillScene' });
  }

  // ── Scene lifecycle ──────────────────────────────────────────────────────

  create(): void {
    const { width, height } = this.scale;

    // Copy inventory snapshot (actual deduction happens in sellSausage)
    this.inventoryCopy = { ...gameState.inventory };

    // Reset session state
    this.heatLevel = 'medium';
    this.timeLeft = GAME_DURATION;
    this.speedMultiplier = 1;
    this.salesLog = [];
    this.grillStats = { perfect: 0, ok: 0, raw: 0, burnt: 0 };
    this.customers = [];
    this.pendingCustomerQueue = [];
    this.customerArrivalTimer = 0;
    this.isDone = false;
    this.sessionRevenue = 0;
    this.grillSlots = [];
    this.heatButtons = [];
    this.speedButtons = [];
    this.feedbackTexts = [];
    this.fireParticles = [];
    this.fireParticleTimer = 0;
    this.inventoryRoundRobinIndex = 0;

    const maxSlots = gameState.upgrades['grill-expand'] ? 6 : MAX_GRILL_SLOTS;

    this.drawBackground(width, height);
    this.drawGrillRack(width, height);
    this.setupGrillSlots(width, height, maxSlots);
    this.setupCustomerQueue(width, height);
    this.setupHeatButtons(width, height);
    this.setupSpeedButtons(width, height);
    this.setupHUD(width, height);
    this.setupEndButton(width, height);

    this.generateCustomerPool();
    this.fillGrillFromInventory();

    // Trigger first customer batch immediately
    this.customerArrivalTimer = this.customerArrivalInterval;

    this.cameras.main.fadeIn(400, 0, 0, 0);
    EventBus.emit('scene-ready', 'GrillScene');
  }

  update(_time: number, delta: number): void {
    if (this.isDone) return;

    const dt = (delta / 1000) * this.speedMultiplier;

    // Tick customer patience
    this.customerQueue.tick(dt);

    // Tick customer arrivals
    this.customerArrivalTimer += dt;
    if (
      this.customerArrivalTimer >= this.customerArrivalInterval &&
      this.pendingCustomerQueue.length > 0
    ) {
      this.customerArrivalTimer = 0;
      const batch = Math.min(Phaser.Math.Between(1, 3), this.pendingCustomerQueue.length);
      for (let i = 0; i < batch; i++) {
        const c = this.pendingCustomerQueue.shift();
        if (c) {
          this.customers.push(c);
          this.customerQueue.addCustomer(c);
        }
      }
    }

    // Tick sausages
    for (const slot of this.grillSlots) {
      if (!slot.sausage || !slot.sprite || slot.sausage.served) continue;

      const updated = updateSausage(slot.sausage, this.heatLevel, dt);
      slot.sausage = updated;
      slot.sprite.updateData(updated);

      // Auto-remove burnt sausages
      if (judgeQuality(updated) === 'burnt') {
        slot.sausage = { ...updated, served: true };
        const capturedSlot = slot;
        const capturedSprite = slot.sprite;
        slot.sprite = null;
        capturedSprite.playBurntAnimation();

        this.grillStats.burnt++;
        changeReputation(-2);
        this.showFeedback('燒焦了！-2 聲望', slot.x, slot.y - 50, '#ff3300');

        this.time.delayedCall(1200, () => {
          capturedSlot.sausage = null;
          this.fillSlot(capturedSlot);
          this.updateStatsDisplay();
        });
      }
    }

    // Fire particle emitter (scales with heat)
    this.tickFireParticles(dt);

    // Countdown
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.endGrilling();
    }

    this.updateTimerDisplay();

    // Auto-end if no pending customers and nobody waiting
    if (
      this.pendingCustomerQueue.length === 0 &&
      this.customerQueue.getWaitingCount() === 0 &&
      this.salesLog.length > 0
    ) {
      this.endGrilling();
    }
  }

  // ── Draw helpers ─────────────────────────────────────────────────────────

  private drawBackground(width: number, height: number): void {
    const bg = this.add.graphics();
    bg.fillGradientStyle(COLOR_BG_TOP, COLOR_BG_TOP, COLOR_BG_BTM, COLOR_BG_BTM, 1);
    bg.fillRect(0, 0, width, height);

    // Warm glow around grill area
    const glowY = height * GRILL_Y_FRAC;
    const glow = this.add.graphics();
    glow.fillStyle(0xff4400, 0.05);
    glow.fillEllipse(width / 2, glowY, width * 0.85, 130);
  }

  private drawGrillRack(width: number, height: number): void {
    const grillY = height * GRILL_Y_FRAC + 34;
    const barStartX = width * 0.08;
    const barEndX = width * 0.92;
    const barCount = 7;
    const barSpacing = 13;

    const rack = this.add.graphics();

    // Fire glow below rack (stored for update)
    this.fireGlowGfx = this.add.graphics();
    this.redrawFireGlow(barStartX, grillY + barCount * barSpacing, barEndX - barStartX);

    // Horizontal grill bars
    rack.lineStyle(3, 0x666666, 1);
    for (let i = 0; i < barCount; i++) {
      const y = grillY + i * barSpacing;
      rack.beginPath();
      rack.moveTo(barStartX, y);
      rack.lineTo(barEndX, y);
      rack.strokePath();
    }

    // Side rails
    rack.lineStyle(5, 0x555555, 1);
    rack.beginPath();
    rack.moveTo(barStartX, grillY);
    rack.lineTo(barStartX, grillY + (barCount - 1) * barSpacing);
    rack.strokePath();

    rack.beginPath();
    rack.moveTo(barEndX, grillY);
    rack.lineTo(barEndX, grillY + (barCount - 1) * barSpacing);
    rack.strokePath();

    // Metallic sheen on top rail
    rack.lineStyle(2, 0x999999, 0.4);
    rack.beginPath();
    rack.moveTo(barStartX + 4, grillY);
    rack.lineTo(barEndX - 4, grillY);
    rack.strokePath();
  }

  private redrawFireGlow(x: number, y: number, w: number): void {
    this.fireGlowGfx.clear();

    // Intensity scales with heat
    const alpha = this.heatLevel === 'low' ? 0.06 : this.heatLevel === 'medium' ? 0.12 : 0.20;
    this.fireGlowGfx.fillStyle(0xff2200, alpha);
    this.fireGlowGfx.fillRect(x, y, w, 28);
  }

  private tickFireParticles(dt: number): void {
    // Spawn rate based on heat level
    const spawnInterval = this.heatLevel === 'low' ? 0.8 : this.heatLevel === 'medium' ? 0.4 : 0.2;
    this.fireParticleTimer += dt;

    if (this.fireParticleTimer >= spawnInterval) {
      this.fireParticleTimer = 0;
      this.spawnFireParticle();
    }
  }

  private spawnFireParticle(): void {
    const { width, height } = this.scale;
    const fireBaseY = height * GRILL_Y_FRAC + 34 + 7 * 13; // bottom of rack
    const spawnX = width * 0.08 + Math.random() * (width * 0.84);
    const fireEmojis = ['🔥', '🔥', '🔥', '✨'];
    const emoji = fireEmojis[Math.floor(Math.random() * fireEmojis.length)];

    const particle = this.add.text(spawnX, fireBaseY, emoji, {
      fontSize: '14px',
    }).setOrigin(0.5).setAlpha(0.7).setDepth(1);

    this.fireParticles.push(particle);

    this.tweens.add({
      targets: particle,
      y: fireBaseY - Phaser.Math.Between(30, 55),
      alpha: 0,
      duration: Phaser.Math.Between(500, 900),
      ease: 'Power1',
      onComplete: () => {
        particle.destroy();
        const idx = this.fireParticles.indexOf(particle);
        if (idx >= 0) this.fireParticles.splice(idx, 1);
      },
    });
  }

  // ── UI setup ─────────────────────────────────────────────────────────────

  private setupGrillSlots(width: number, height: number, slotCount: number): void {
    const grillY = height * GRILL_Y_FRAC - 10;
    const totalW = width * 0.78;
    const startX = (width - totalW) / 2;

    for (let i = 0; i < slotCount; i++) {
      const x = startX + (i + 0.5) * (totalW / slotCount);
      this.grillSlots.push({ sprite: null, sausage: null, x, y: grillY });
    }
  }

  private setupCustomerQueue(width: number, _height: number): void {
    const queueY = this.scale.height * 0.13;
    this.customerQueue = new CustomerQueue(this, 28, queueY);
    this.customerQueue.onTimeout((customerId: string) => {
      this.onCustomerTimeout(customerId);
    });

    // Label
    this.add.text(12, queueY - 22, '排隊客人', {
      fontSize: '12px',
      fontFamily: FONT,
      color: COLOR_DIM,
    });

    // Pending queue count indicator (right side)
    this.add.text(width - 12, queueY - 22, '（候補）', {
      fontSize: '12px',
      fontFamily: FONT,
      color: COLOR_DIM,
    }).setOrigin(1, 0);
  }

  private setupHeatButtons(width: number, height: number): void {
    const btnY = height * GRILL_Y_FRAC + 130;
    const levels: { level: HeatLevel; label: string; icon: string }[] = [
      { level: 'low',    label: '小火', icon: '🔥' },
      { level: 'medium', label: '中火', icon: '🔥🔥' },
      { level: 'high',   label: '大火', icon: '🔥🔥🔥' },
    ];

    const btnW = 80;
    const btnH = 44;
    const gap = 14;
    const totalW = levels.length * btnW + (levels.length - 1) * gap;
    const startX = width / 2 - totalW / 2;

    levels.forEach((item, i) => {
      const bx = startX + i * (btnW + gap) + btnW / 2;
      const btn = this.createButton(bx, btnY, btnW, btnH, `${item.icon}\n${item.label}`, () => {
        this.heatLevel = item.level;
        this.updateHeatButtonStyles();
        // Update fire glow intensity
        const { width: w, height: h } = this.scale;
        const barStartX = w * 0.08;
        const grillY = h * GRILL_Y_FRAC + 34;
        this.redrawFireGlow(barStartX, grillY + 7 * 13, w * 0.84);
      });
      this.heatButtons.push(btn);
    });

    this.updateHeatButtonStyles();

    this.add.text(width / 2, btnY - 26, '火力控制', {
      fontSize: '12px',
      fontFamily: FONT,
      color: COLOR_DIM,
    }).setOrigin(0.5);
  }

  private setupSpeedButtons(width: number, height: number): void {
    const btnY = height * GRILL_Y_FRAC + 130;
    const speeds = [1, 2, 3];
    const btnW = 40;
    const btnH = 30;
    const gap = 6;
    const startX = width - 20 - (speeds.length * btnW + (speeds.length - 1) * gap);

    speeds.forEach((spd, i) => {
      const bx = startX + i * (btnW + gap) + btnW / 2;
      const btn = this.createButton(bx, btnY, btnW, btnH, `${spd}x`, () => {
        this.speedMultiplier = spd;
        this.updateSpeedButtonStyles();
      });
      this.speedButtons.push(btn);
    });

    this.updateSpeedButtonStyles();

    const centerX = startX + (speeds.length * btnW + (speeds.length - 1) * gap) / 2;
    this.add.text(centerX, btnY - 22, '速度', {
      fontSize: '12px',
      fontFamily: FONT,
      color: COLOR_DIM,
    }).setOrigin(0.5);
  }

  private setupHUD(width: number, height: number): void {
    // ── Top left: timer ──────────────────────────────────────────────────
    this.timerText = this.add.text(16, 14, '⏱ 60s', {
      fontSize: '18px',
      fontFamily: FONT,
      color: '#ffcc44',
      stroke: '#000000',
      strokeThickness: 3,
    }).setDepth(10);

    // ── Top right: day / status ──────────────────────────────────────────
    this.add.text(width - 14, 14, `🔥營業中 Day ${gameState.day}`, {
      fontSize: '15px',
      fontFamily: FONT,
      color: COLOR_ORANGE,
    }).setOrigin(1, 0).setDepth(10);

    // ── Bottom stats bar ─────────────────────────────────────────────────
    const statsY = height - 42;

    this.statsText = this.add.text(16, statsY, '完美:0 | 普通:0 | 焦:0', {
      fontSize: '13px',
      fontFamily: FONT,
      color: COLOR_DIM,
    });

    this.revenueText = this.add.text(width / 2, statsY, '💰 $0', {
      fontSize: '14px',
      fontFamily: FONT,
      color: COLOR_ORANGE,
    }).setOrigin(0.5, 0).setDepth(10);
  }

  private setupEndButton(width: number, height: number): void {
    const btnW = 110;
    const btnH = 34;
    const bx = width - btnW / 2 - 16;
    const by = height - 22;

    this.createButton(bx, by, btnW, btnH, '結束營業', () => {
      this.endGrilling();
    });
  }

  // ── Button factory ────────────────────────────────────────────────────────

  private createButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    onPress: () => void,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    const bg = this.add.graphics();
    this.drawButtonBg(bg, w, h, false);

    const fontSize = label.includes('\n') ? '11px' : '13px';
    const txt = this.add.text(0, 0, label, {
      fontSize,
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
    g.fillStyle(hover ? 0xff6b00 : 0x100500, hover ? 0.2 : 0.92);
    g.lineStyle(1, 0xff6b00, hover ? 1.0 : 0.5);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 4);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 4);
  }

  private updateHeatButtonStyles(): void {
    const levels: HeatLevel[] = ['low', 'medium', 'high'];
    this.heatButtons.forEach((btn, i) => {
      const isActive = levels[i] === this.heatLevel;
      const bg = btn.list[0] as Phaser.GameObjects.Graphics;
      const txt = btn.list[1] as Phaser.GameObjects.Text;
      const btnW = 80;
      const btnH = 44;
      bg.clear();
      if (isActive) {
        bg.fillStyle(0xff6b00, 0.38);
        bg.lineStyle(2, 0xff9900, 1);
        bg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 4);
        bg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 4);
        txt.setColor('#ffffff');
      } else {
        bg.fillStyle(0x100500, 0.92);
        bg.lineStyle(1, 0xff6b00, 0.35);
        bg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 4);
        bg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 4);
        txt.setColor(COLOR_DIM);
      }
    });
  }

  private updateSpeedButtonStyles(): void {
    const speeds = [1, 2, 3];
    const btnW = 40;
    const btnH = 30;
    this.speedButtons.forEach((btn, i) => {
      const isActive = speeds[i] === this.speedMultiplier;
      const bg = btn.list[0] as Phaser.GameObjects.Graphics;
      const txt = btn.list[1] as Phaser.GameObjects.Text;
      bg.clear();
      if (isActive) {
        bg.fillStyle(0xff6b00, 0.35);
        bg.lineStyle(2, 0xff6b00, 1);
        bg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 4);
        bg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 4);
        txt.setColor('#ffffff');
      } else {
        bg.fillStyle(0x100500, 0.92);
        bg.lineStyle(1, 0xff6b00, 0.35);
        bg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 4);
        bg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 4);
        txt.setColor(COLOR_DIM);
      }
    });
  }

  // ── Game logic ─────────────────────────────────────────────────────────────

  private generateCustomerPool(): void {
    const slotId = gameState.selectedSlot;
    const gridSlot = GRID_SLOTS.find(s => s.id === slotId);
    // baseTraffic 30-80 → divide by 20 → 1.5-4.0 range
    const rawTraffic = gridSlot ? gridSlot.baseTraffic / 20 : 2.5;
    const trafficNorm = Math.max(1, Math.min(5, rawTraffic));

    let pool = generateCustomers(trafficNorm, 0);
    // Cap at ~20 customers for a 60-second session
    if (pool.length > 20) pool = pool.slice(0, 20);

    this.pendingCustomerQueue = pool;
  }

  private fillGrillFromInventory(): void {
    for (const slot of this.grillSlots) {
      this.fillSlot(slot);
    }
  }

  private fillSlot(slot: GrillSlot): void {
    if (slot.sprite) return; // already occupied

    const sausageId = this.pickFromInventory();
    if (!sausageId) return;

    // Deduct from inventory copy
    this.inventoryCopy[sausageId]--;
    if (this.inventoryCopy[sausageId] <= 0) {
      delete this.inventoryCopy[sausageId];
    }

    const sausage = createGrillingSausage(sausageId);
    const sprite = new SausageSprite(this, slot.x, slot.y, sausage);

    sprite.onFlip(() => {
      const currentSlot = this.grillSlots.find(s => s.sprite === sprite);
      if (currentSlot?.sausage) {
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

  // Round-robin through available sausage types for even distribution
  private pickFromInventory(): string | null {
    const available = Object.entries(this.inventoryCopy).filter(([, qty]) => qty > 0);
    if (available.length === 0) return null;

    this.inventoryRoundRobinIndex = this.inventoryRoundRobinIndex % available.length;
    const [id] = available[this.inventoryRoundRobinIndex];
    this.inventoryRoundRobinIndex++;
    return id;
  }

  private handleServeAttempt(slot: GrillSlot, sprite: SausageSprite): void {
    if (!slot.sausage || slot.sausage.served) return;

    const quality = judgeQuality(slot.sausage);

    if (quality === 'raw') {
      this.grillStats.raw++;
      this.showFeedback('還沒熟！', slot.x, slot.y - 50, '#ffaa00');
      // Auto-flip for player
      sprite.triggerFlip();
      const currentSlot = this.grillSlots.find(s => s.sprite === sprite);
      if (currentSlot?.sausage) {
        currentSlot.sausage = flipSausage(currentSlot.sausage);
      }
      this.updateStatsDisplay();
      return;
    }

    if (quality === 'burnt') return; // handled by auto-remove

    const nextCustomer = this.customerQueue.getNextCustomer();
    if (!nextCustomer) {
      this.showFeedback('沒有客人等待！', slot.x, slot.y - 50, '#888888');
      return;
    }

    const sausageId = slot.sausage.sausageTypeId;
    const price = gameState.prices[sausageId] ?? SAUSAGE_MAP[sausageId]?.suggestedPrice ?? 35;
    const qualityScore = getQualityScore(quality);

    const slotId = gameState.selectedSlot;
    const gridSlot = GRID_SLOTS.find(s => s.id === slotId);
    const trafficNorm = gridSlot ? Math.max(1, Math.min(5, gridSlot.baseTraffic / 20)) : 2.5;

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

        this.sessionRevenue += price;
        this.customerQueue.serveCustomer(nextCustomer.id, isPerfect);
        this.customers = this.customers.filter(c => c.id !== nextCustomer.id);

        const feedbackMsg = `+$${price}${isPerfect ? ' ★' : ''}`;
        this.showFeedback(feedbackMsg, slot.x, slot.y - 60, '#44ff88');
        this.bounceRevenue();

        slot.sausage = { ...slot.sausage, served: true };
        slot.sprite = null;

        const targetX = 80;
        const targetY = this.scale.height * 0.13;
        sprite.playServeAnimation(targetX, targetY);

        this.time.delayedCall(580, () => {
          slot.sausage = null;
          this.fillSlot(slot);
        });

        this.updateStatsDisplay();
      }
    } else {
      // Customer rejects — leave without buying
      this.customerQueue.dismissFrontCustomer();
      this.customers = this.customers.filter(c => c.id !== nextCustomer.id);
      this.showFeedback('客人嫌貴走了', slot.x, slot.y - 50, '#ff6666');
    }
  }

  private onCustomerTimeout(customerId: string): void {
    changeReputation(-1);
    this.customers = this.customers.filter(c => c.id !== customerId);
    this.showFeedback('-1 聲望', 80, this.scale.height * 0.13, '#ff4444');
  }

  // ── Display helpers ────────────────────────────────────────────────────────

  private updateTimerDisplay(): void {
    const secs = Math.ceil(this.timeLeft);
    this.timerText.setText(`⏱ ${secs}s`);

    if (secs <= 10) {
      this.timerText.setColor('#ff3300');
      // Flash the timer in the last 10 seconds (start once)
      if (!this.timerFlashTween) {
        this.timerFlashTween = this.tweens.add({
          targets: this.timerText,
          alpha: 0.3,
          duration: 400,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    } else if (secs <= 20) {
      this.timerText.setColor('#ff9900');
    } else {
      this.timerText.setColor('#ffcc44');
    }
  }

  private updateStatsDisplay(): void {
    const { perfect, ok, burnt } = this.grillStats;
    this.statsText.setText(`完美:${perfect} | 普通:${ok} | 焦:${burnt}`);
    this.revenueText.setText(`💰 $${this.sessionRevenue}`);
  }

  private bounceRevenue(): void {
    if (this.timerFlashTween?.isPlaying()) return; // avoid conflicting tweens
    this.tweens.add({
      targets: this.revenueText,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 120,
      yoyo: true,
      ease: 'Back.Out',
    });
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
      y: y - 44,
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

  // ── End session ──────────────────────────────────────────────────────────

  private endGrilling(): void {
    if (this.isDone) return;
    this.isDone = true;

    // Stop timer flash tween if running
    if (this.timerFlashTween) {
      this.timerFlashTween.stop();
      this.timerFlashTween = null;
      this.timerText.setAlpha(1);
    }

    // Persist to game state
    updateGameState({
      dailySalesLog: [...this.salesLog],
      dailyGrillStats: { ...this.grillStats },
    });

    EventBus.emit('grill-done', {
      salesLog: this.salesLog,
      grillStats: this.grillStats,
    });

    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      if (gameState.day % 3 === 0) {
        this.scene.start('BattleScene');
      } else {
        this.scene.start('SummaryScene');
      }
    });
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  shutdown(): void {
    if (this.timerFlashTween) {
      this.timerFlashTween.stop();
      this.timerFlashTween = null;
    }

    this.feedbackTexts.forEach(t => {
      if (t?.active) t.destroy();
    });
    this.feedbackTexts = [];

    this.fireParticles.forEach(p => {
      if (p?.active) p.destroy();
    });
    this.fireParticles = [];
  }
}

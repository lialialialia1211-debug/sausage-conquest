// GrillScene — 夜晚烤制小遊戲 (pure Phaser, no HTML overlay)
import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { gameState, changeReputation, updateGameState, addMoney } from '../state/GameState';
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
  type GrillQuality,
} from '../systems/GrillEngine';
import { generateCustomers } from '../systems/CustomerEngine';
import { sellSausage } from '../systems/EconomyEngine';
import { SausageSprite } from '../objects/SausageSprite';
import { CustomerQueue } from '../objects/CustomerQueue';
import type { SaleRecord, Customer, WarmingSausage } from '../types';
import { sfx } from '../utils/SoundFX';

// ── Layout constants ────────────────────────────────────────────────────────
const GAME_DURATION = 90;      // seconds
const MAX_GRILL_SLOTS = 4;     // 6 if grill-expand upgrade
const GRILL_Y_FRAC = 0.44;    // grill vertical position as fraction of screen height
// Warming zone has no fixed limit — slots are created dynamically

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
  placeholderGfx: Phaser.GameObjects.Graphics | null;
  serveBtn: Phaser.GameObjects.Text | null;
}

interface WarmingSlot {
  sausage: WarmingSausage | null;
  x: number;
  y: number;
  bgGfx: Phaser.GameObjects.Graphics | null;
  infoText: Phaser.GameObjects.Text | null;
  stateText: Phaser.GameObjects.Text | null;
}

export class GrillScene extends Phaser.Scene {
  // ── Session state ───────────────────────────────────────────────────────
  private heatLevel: HeatLevel = 'low';
  private timeLeft = GAME_DURATION;
  private speedMultiplier = 1;
  private salesLog: SaleRecord[] = [];
  private grillStats = { perfect: 0, ok: 0, raw: 0, burnt: 0, 'half-cooked': 0, 'slightly-burnt': 0, carbonized: 0 };
  private customers: Customer[] = [];
  private pendingCustomerQueue: Customer[] = [];
  private customerArrivalTimer = 0;
  private readonly customerArrivalInterval = 8; // seconds between batches
  private isDone = false;
  private sessionRevenue = 0;
  private paused = true; // Start paused until player clicks "開始營業"

  // ── Grill slots ─────────────────────────────────────────────────────────
  private grillSlots: GrillSlot[] = [];
  private inventoryCopy: Record<string, number> = {};

  // ── Manual placement state ──────────────────────────────────────────────
  private selectedInventoryType: string | null = null;
  private inventoryPanel!: Phaser.GameObjects.Container;
  private inventoryButtonMap: Map<string, Phaser.GameObjects.Container> = new Map();

  // ── Warming zone ─────────────────────────────────────────────────────────
  private warmingSlots: WarmingSlot[] = [];
  // warmingContainer is used implicitly via warmingSlots setup

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
    this.heatLevel = 'low';
    this.timeLeft = GAME_DURATION;
    this.speedMultiplier = 1;
    this.salesLog = [];
    this.grillStats = { perfect: 0, ok: 0, raw: 0, burnt: 0, 'half-cooked': 0, 'slightly-burnt': 0, carbonized: 0 };
    this.customers = [];
    this.pendingCustomerQueue = [];
    this.customerArrivalTimer = 0;
    this.isDone = false;
    this.paused = true;
    this.sessionRevenue = 0;
    this.grillSlots = [];
    this.warmingSlots = [];
    this.heatButtons = [];
    this.speedButtons = [];
    this.feedbackTexts = [];
    this.fireParticles = [];
    this.fireParticleTimer = 0;
    this.selectedInventoryType = null;
    this.inventoryButtonMap = new Map();

    const maxSlots = gameState.upgrades['grill-expand'] ? 6 : MAX_GRILL_SLOTS;

    this.drawBackground(width, height);
    this.drawGrillRack(width, height);
    this.setupGrillSlots(width, height, maxSlots);
    this.setupWarmingZone(width, height);
    this.setupCustomerQueue(width, height);
    this.setupHeatButtons(width, height);
    this.setupSpeedButtons(width, height);
    this.setupInventoryPanel(width, height);
    this.setupHUD(width, height);
    this.setupEndButton(width, height);

    // Load overnight sausages into warming zone
    this.loadOvernightSausages();

    this.generateCustomerPool();

    // Trigger first customer batch immediately
    this.customerArrivalTimer = this.customerArrivalInterval;

    this.cameras.main.fadeIn(400, 0, 0, 0);
    EventBus.emit('scene-ready', 'GrillScene');

    // Show ready overlay (paused until player clicks start)
    this.showReadyOverlay(width, height);
  }

  update(_time: number, delta: number): void {
    if (this.isDone || this.paused) return;

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

    // Tick sausages on grill
    for (const slot of this.grillSlots) {
      if (!slot.sausage || !slot.sprite || slot.sausage.served) continue;

      const updated = updateSausage(slot.sausage, this.heatLevel, dt);
      slot.sausage = updated;
      slot.sprite.updateData(updated);

      // No auto-flip — player controls when to flip (click once to flip, click again to serve)

      // Show warning feedback for dangerous doneness levels (but don't auto-remove anything)
      const currentQuality = judgeQuality(updated);
      if (currentQuality === 'carbonized' && !(slot as any).__carbonWarnShown) {
        sfx.playBurnt();
        this.showFeedback('碳化了！快起鍋或丟掉', slot.x, slot.y - 50, '#ff3300');
        (slot as any).__carbonWarnShown = true;
      } else if (currentQuality === 'burnt' && !(slot as any).__burntWarnShown) {
        this.showFeedback('焦了！還能賣但有風險', slot.x, slot.y - 50, '#ff6600');
        (slot as any).__burntWarnShown = true;
      }

      // Show "起鍋" button when both sides have been cooked (non-heated side >= 20)
      const nonHeated = updated.currentSide === 'bottom' ? updated.topDoneness : updated.bottomDoneness;
      if (nonHeated >= 20 && !slot.serveBtn) {
        const btn = this.add.text(slot.x, slot.y - 52, '[ 起鍋 ]', {
          fontSize: '13px',
          fontFamily: FONT,
          color: '#39ff14',
          backgroundColor: '#000000cc',
          padding: { x: 6, y: 3 },
        }).setOrigin(0.5).setDepth(50).setInteractive({ cursor: 'pointer' });

        btn.on('pointerdown', () => {
          if (slot.sprite) this.moveToWarming(slot, slot.sprite);
        });
        btn.on('pointerover', () => btn.setColor('#ffffff'));
        btn.on('pointerout', () => btn.setColor('#39ff14'));

        slot.serveBtn = btn;
      }
    }

    // Tick warming zone timers
    for (const ws of this.warmingSlots) {
      if (!ws.sausage) continue;
      ws.sausage = { ...ws.sausage, timeInWarming: ws.sausage.timeInWarming + dt };

      // Update warming state — 30s perfect, 30s ok, then cold
      if (ws.sausage.timeInWarming < 30) {
        ws.sausage = { ...ws.sausage, warmingState: 'perfect-warm' };
      } else if (ws.sausage.timeInWarming < 60) {
        ws.sausage = { ...ws.sausage, warmingState: 'ok-warm' };
      } else {
        ws.sausage = { ...ws.sausage, warmingState: 'cold' };
      }

      this.updateWarmingSlotDisplay(ws);
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
      !this.isDone &&
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
    // Grill only occupies left 70% of width (right is for warming zone)
    const barStartX = width * 0.04;
    const barEndX = width * 0.65;
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
    const spawnX = width * 0.04 + Math.random() * (width * 0.61);
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
    // Slots occupy left 65% of screen
    const totalW = width * 0.60;
    const startX = width * 0.04 + totalW / slotCount / 2;

    for (let i = 0; i < slotCount; i++) {
      const x = startX + i * (totalW / slotCount);
      const slot: GrillSlot = { sprite: null, sausage: null, x, y: grillY, placeholderGfx: null, serveBtn: null };
      this.grillSlots.push(slot);
      this.drawEmptySlotPlaceholder(slot);
    }
  }

  private drawEmptySlotPlaceholder(slot: GrillSlot): void {
    // Remove old placeholder if exists
    if (slot.placeholderGfx) {
      slot.placeholderGfx.destroy();
      slot.placeholderGfx = null;
    }
    if (slot.sausage) return; // occupied — no placeholder

    const g = this.add.graphics();
    g.lineStyle(2, 0xff6b00, 0.3);
    g.strokeRect(slot.x - 32, slot.y - 42, 64, 84);

    // Dashed inner effect (four corner marks)
    g.lineStyle(1, 0xff6b00, 0.15);
    const cx = slot.x;
    const cy = slot.y;
    // Horizontal dashes
    for (let dx = -28; dx < 28; dx += 8) {
      g.beginPath();
      g.moveTo(cx + dx, cy - 42);
      g.lineTo(cx + dx + 4, cy - 42);
      g.strokePath();
      g.beginPath();
      g.moveTo(cx + dx, cy + 42);
      g.lineTo(cx + dx + 4, cy + 42);
      g.strokePath();
    }

    // Make the placeholder clickable so player can place a sausage here
    const hitZone = this.add.zone(slot.x, slot.y, 64, 84).setInteractive({ cursor: 'pointer' });
    hitZone.on('pointerdown', () => {
      if (this.selectedInventoryType) {
        this.placeOnGrill(slot, this.selectedInventoryType);
      }
    });
    hitZone.on('pointerover', () => {
      if (this.selectedInventoryType) {
        g.clear();
        g.lineStyle(2, 0xff9900, 0.7);
        g.strokeRect(slot.x - 32, slot.y - 42, 64, 84);
      }
    });
    hitZone.on('pointerout', () => {
      g.clear();
      g.lineStyle(2, 0xff6b00, 0.3);
      g.strokeRect(slot.x - 32, slot.y - 42, 64, 84);
    });

    // Store graphics in slot (zone needs to be tracked too — attach to graphics)
    (g as any).__hitZone = hitZone;
    slot.placeholderGfx = g;
  }

  private clearSlotPlaceholder(slot: GrillSlot): void {
    if (slot.placeholderGfx) {
      const zone = (slot.placeholderGfx as any).__hitZone as Phaser.GameObjects.Zone | undefined;
      if (zone) zone.destroy();
      slot.placeholderGfx.destroy();
      slot.placeholderGfx = null;
    }
  }

  // Warming zone config (stored for dynamic slot creation)
  private wzX = 0;
  private wzY = 0;
  private wzSlotW = 0;
  private readonly wzSlotH = 36; // compact height

  private setupWarmingZone(width: number, height: number): void {
    this.wzX = width * 0.70;
    this.wzY = height * GRILL_Y_FRAC - 60;
    this.wzSlotW = width * 0.27;

    // Zone label
    this.add.text(this.wzX + this.wzSlotW / 2, this.wzY - 22, '保溫區（點擊出餐）', {
      fontSize: '12px',
      fontFamily: FONT,
      color: COLOR_DIM,
    }).setOrigin(0.5);

    // Create initial 4 empty slots
    for (let i = 0; i < 4; i++) {
      this.createWarmingSlotVisual();
    }
  }

  private createWarmingSlotVisual(): WarmingSlot {
    const idx = this.warmingSlots.length;
    const gap = 4;
    const sy = this.wzY + idx * (this.wzSlotH + gap);
    const wx = this.wzX + this.wzSlotW / 2;
    const wy = sy + this.wzSlotH / 2;

    const bgGfx = this.add.graphics();
    bgGfx.lineStyle(1, 0x664422, 0.5);
    bgGfx.fillStyle(0x1a0800, 0.7);
    bgGfx.fillRoundedRect(this.wzX, sy, this.wzSlotW, this.wzSlotH, 3);
    bgGfx.strokeRoundedRect(this.wzX, sy, this.wzSlotW, this.wzSlotH, 3);

    const infoText = this.add.text(wx, wy, '', {
      fontSize: '11px',
      fontFamily: FONT,
      color: COLOR_DIM,
    }).setOrigin(0.5);

    const stateText = this.add.text(this.wzX + this.wzSlotW - 6, wy, '', {
      fontSize: '10px',
      fontFamily: FONT,
      color: '#888888',
    }).setOrigin(1, 0.5);

    const slot: WarmingSlot = { sausage: null, x: wx, y: wy, bgGfx, infoText, stateText };
    this.warmingSlots.push(slot);

    // Make clickable
    const hitZone = this.add.zone(wx, wy, this.wzSlotW, this.wzSlotH).setInteractive({ cursor: 'pointer' });
    hitZone.on('pointerdown', () => this.serveFromWarming(slot));
    hitZone.on('pointerover', () => {
      if (slot.sausage && slot.bgGfx) {
        slot.bgGfx.clear();
        slot.bgGfx.lineStyle(2, 0xff9900, 0.9);
        slot.bgGfx.fillStyle(0x2a1000, 0.85);
        slot.bgGfx.fillRoundedRect(this.wzX, sy, this.wzSlotW, this.wzSlotH, 3);
        slot.bgGfx.strokeRoundedRect(this.wzX, sy, this.wzSlotW, this.wzSlotH, 3);
      }
    });
    hitZone.on('pointerout', () => {
      if (slot.bgGfx) this.redrawWarmingSlotBg(slot, this.wzX, sy, this.wzSlotW, this.wzSlotH);
    });

    (slot as any).__x = this.wzX;
    (slot as any).__y = sy;
    (slot as any).__w = this.wzSlotW;
    (slot as any).__h = this.wzSlotH;

    return slot;
  }

  // Dynamically add a new warming slot when all are full (no limit)
  private addWarmingSlot(): WarmingSlot {
    return this.createWarmingSlotVisual();
  }

  private redrawWarmingSlotBg(slot: WarmingSlot, x: number, y: number, w: number, h: number): void {
    if (!slot.bgGfx) return;
    slot.bgGfx.clear();

    if (!slot.sausage) {
      slot.bgGfx.lineStyle(1, 0x664422, 0.5);
      slot.bgGfx.fillStyle(0x1a0800, 0.7);
    } else if (slot.sausage.warmingState === 'perfect-warm') {
      slot.bgGfx.lineStyle(1, 0x44ff88, 0.7);
      slot.bgGfx.fillStyle(0x001a08, 0.85);
    } else if (slot.sausage.warmingState === 'ok-warm') {
      slot.bgGfx.lineStyle(1, 0xffcc44, 0.7);
      slot.bgGfx.fillStyle(0x1a1000, 0.85);
    } else {
      slot.bgGfx.lineStyle(1, 0x4488aa, 0.7);
      slot.bgGfx.fillStyle(0x001020, 0.85);
    }
    slot.bgGfx.fillRoundedRect(x, y, w, h, 4);
    slot.bgGfx.strokeRoundedRect(x, y, w, h, 4);
  }

  private updateWarmingSlotDisplay(slot: WarmingSlot): void {
    if (!slot.sausage || !slot.infoText || !slot.stateText) return;

    const ws = slot.sausage;
    const sausageInfo = SAUSAGE_MAP[ws.sausageTypeId];
    const emoji = sausageInfo?.emoji ?? '🌭';

    let stateLabel = '';
    let stateColor = '#888888';
    let timeLeft = '';
    if (ws.warmingState === 'perfect-warm') {
      stateLabel = '熱騰騰 ×1.2';
      stateColor = '#44ff88';
      timeLeft = `${Math.max(0, Math.ceil(30 - ws.timeInWarming))}s`;
    } else if (ws.warmingState === 'ok-warm') {
      stateLabel = '微溫 ×1.0';
      stateColor = '#ffcc44';
      timeLeft = `${Math.max(0, Math.ceil(60 - ws.timeInWarming))}s`;
    } else {
      stateLabel = '冷掉 ×0.7';
      stateColor = '#6699aa';
      timeLeft = '冷了但還能賣';
    }

    const overnightTag = ws.isOvernight ? '[隔夜]' : '';
    slot.infoText.setText(`${emoji} ${overnightTag} 點擊出餐`);
    slot.stateText.setText(`${stateLabel}  ${timeLeft}`);
    slot.stateText.setColor(stateColor);

    // Redraw background based on state
    const x = (slot as any).__x as number;
    const y = (slot as any).__y as number;
    const w = (slot as any).__w as number;
    const h = (slot as any).__h as number;
    this.redrawWarmingSlotBg(slot, x, y, w, h);
  }

  private clearWarmingSlotDisplay(slot: WarmingSlot): void {
    if (slot.infoText) slot.infoText.setText('空');
    if (slot.stateText) slot.stateText.setText('');

    const x = (slot as any).__x as number;
    const y = (slot as any).__y as number;
    const w = (slot as any).__w as number;
    const h = (slot as any).__h as number;
    this.redrawWarmingSlotBg(slot, x, y, w, h);
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

    const btnW = 72;
    const btnH = 44;
    const gap = 10;
    const totalW = levels.length * btnW + (levels.length - 1) * gap;
    // Place heat buttons in left 65% of screen
    const startX = (width * 0.65 - totalW) / 2;

    levels.forEach((item, i) => {
      const bx = startX + i * (btnW + gap) + btnW / 2;
      const btn = this.createButton(bx, btnY, btnW, btnH, `${item.icon}\n${item.label}`, () => {
        this.heatLevel = item.level;
        this.updateHeatButtonStyles();
        // Update fire glow intensity
        const { width: w, height: h } = this.scale;
        const barStartX = w * 0.04;
        const grillY = h * GRILL_Y_FRAC + 34;
        this.redrawFireGlow(barStartX, grillY + 7 * 13, w * 0.61);
      });
      this.heatButtons.push(btn);
    });

    this.updateHeatButtonStyles();

    this.add.text(startX + totalW / 2, btnY - 26, '火力控制', {
      fontSize: '12px',
      fontFamily: FONT,
      color: COLOR_DIM,
    }).setOrigin(0.5);
  }

  private setupSpeedButtons(width: number, height: number): void {
    const btnY = height * GRILL_Y_FRAC + 130;
    const speeds = [1, 2, 3];

    const btnW = 36;
    const btnH = 28;
    const gap = 5;
    const startX = width * 0.65 - (speeds.length * btnW + (speeds.length - 1) * gap) - 10;

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
    this.add.text(centerX, btnY - 20, '速度', {
      fontSize: '12px',
      fontFamily: FONT,
      color: COLOR_DIM,
    }).setOrigin(0.5);
  }

  private setupInventoryPanel(width: number, height: number): void {
    const panelY = height - 88;
    const panelH = 68;

    // Background
    const bg = this.add.graphics();
    bg.fillStyle(0x100500, 0.9);
    bg.lineStyle(1, 0xff6b00, 0.4);
    bg.fillRect(0, panelY, width, panelH);
    bg.strokeRect(0, panelY, width, panelH);
    bg.setDepth(9);

    this.add.text(10, panelY + 4, '庫存 — 點擊選擇，再點烤架空位放置', {
      fontSize: '11px',
      fontFamily: FONT,
      color: COLOR_DIM,
    }).setDepth(10);

    // Build inventory buttons
    this.inventoryPanel = this.add.container(0, 0).setDepth(10);
    this.rebuildInventoryButtons(width, panelY, panelH);
  }

  private rebuildInventoryButtons(width: number, panelY: number, panelH: number): void {
    // Clear old buttons
    this.inventoryPanel.removeAll(true);
    this.inventoryButtonMap.clear();

    const available = Object.entries(this.inventoryCopy).filter(([, qty]) => qty > 0);
    const unavailable = Object.keys(SAUSAGE_MAP).filter(
      id =>
        gameState.unlockedSausages.includes(id) &&
        !available.find(([aid]) => aid === id)
    );

    const allItems = [
      ...available.map(([id, qty]) => ({ id, qty, hasStock: true })),
      ...unavailable.map(id => ({ id, qty: 0, hasStock: false })),
    ];

    const btnW = 88;
    const btnH = 44;
    const gap = 8;
    const totalBtns = allItems.length;
    const totalW = totalBtns * btnW + (totalBtns - 1) * gap;
    let startX = Math.max(12, (width - totalW) / 2);

    const centerY = panelY + panelH / 2 + 8;

    allItems.forEach(({ id, qty, hasStock }) => {
      const bx = startX + btnW / 2;
      const info = SAUSAGE_MAP[id];
      const label = info ? `${info.emoji} ×${qty}` : `×${qty}`;

      const container = this.add.container(bx, centerY);
      const bgGfx = this.add.graphics();

      const drawBg = (selected: boolean, hover: boolean) => {
        bgGfx.clear();
        if (!hasStock) {
          bgGfx.fillStyle(0x080200, 0.6);
          bgGfx.lineStyle(1, 0x442200, 0.3);
        } else if (selected) {
          bgGfx.fillStyle(0xff6b00, 0.4);
          bgGfx.lineStyle(2, 0xff9900, 1.0);
        } else if (hover) {
          bgGfx.fillStyle(0xff6b00, 0.15);
          bgGfx.lineStyle(1, 0xff6b00, 0.7);
        } else {
          bgGfx.fillStyle(0x100500, 0.85);
          bgGfx.lineStyle(1, 0xff6b00, 0.4);
        }
        bgGfx.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 4);
        bgGfx.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 4);
      };

      drawBg(false, false);

      const txt = this.add.text(0, -4, label, {
        fontSize: '14px',
        fontFamily: FONT,
        color: hasStock ? COLOR_ORANGE : '#442200',
        align: 'center',
      }).setOrigin(0.5);

      const nameTxt = this.add.text(0, 12, info?.name ?? id, {
        fontSize: '9px',
        fontFamily: FONT,
        color: hasStock ? '#886633' : '#331100',
        align: 'center',
      }).setOrigin(0.5);

      const hitZone = this.add.zone(0, 0, btnW, btnH).setInteractive({ cursor: hasStock ? 'pointer' : 'default' });

      hitZone.on('pointerover', () => {
        if (hasStock) drawBg(this.selectedInventoryType === id, true);
      });
      hitZone.on('pointerout', () => {
        drawBg(this.selectedInventoryType === id, false);
      });
      hitZone.on('pointerdown', () => {
        if (!hasStock) return;
        // Auto-place onto first empty grill slot
        const emptySlot = this.grillSlots.find(s => !s.sausage);
        if (emptySlot) {
          this.placeOnGrill(emptySlot, id);
        } else {
          this.showFeedback('烤架滿了！', bx, centerY - 30, '#ffaa00');
        }
      });

      container.add([bgGfx, txt, nameTxt, hitZone]);
      this.inventoryPanel.add(container);
      this.inventoryButtonMap.set(id, container);

      startX += btnW + gap;
    });
  }

  private updateInventoryDisplay(): void {
    const { width, height } = this.scale;
    const panelY = height - 88;
    const panelH = 68;
    this.rebuildInventoryButtons(width, panelY, panelH);
  }

  private updateInventoryButtonStyles(): void {
    this.inventoryButtonMap.forEach((container, id) => {
      const bgGfx = container.list[0] as Phaser.GameObjects.Graphics;
      const isSelected = this.selectedInventoryType === id;
      const qty = this.inventoryCopy[id] ?? 0;
      const hasStock = qty > 0;
      const btnW = 88;
      const btnH = 44;

      bgGfx.clear();
      if (!hasStock) {
        bgGfx.fillStyle(0x080200, 0.6);
        bgGfx.lineStyle(1, 0x442200, 0.3);
      } else if (isSelected) {
        bgGfx.fillStyle(0xff6b00, 0.4);
        bgGfx.lineStyle(2, 0xff9900, 1.0);
      } else {
        bgGfx.fillStyle(0x100500, 0.85);
        bgGfx.lineStyle(1, 0xff6b00, 0.4);
      }
      bgGfx.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 4);
      bgGfx.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 4);
    });
  }

  private setupHUD(width: number, height: number): void {
    // ── Top left: timer ──────────────────────────────────────────────────
    this.timerText = this.add.text(16, 14, '⏱ 90s', {
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

    // ── Price board — show today's prices like a real night market stall ──
    const priceEntries = Object.entries(gameState.prices)
      .filter(([id]) => gameState.unlockedSausages.includes(id))
      .map(([id, price]) => {
        const info = SAUSAGE_MAP[id];
        return info ? `${info.emoji}${info.name} $${price}` : '';
      })
      .filter(Boolean);

    if (priceEntries.length > 0) {
      this.add.text(width / 2, 38, priceEntries.join('  '), {
        fontSize: '11px',
        fontFamily: FONT,
        color: '#ffcc44',
        backgroundColor: '#1a0800cc',
        padding: { x: 8, y: 3 },
      }).setOrigin(0.5, 0).setDepth(10);
    }

    // ── Bottom stats bar ─────────────────────────────────────────────────
    const statsY = height - 100;

    this.statsText = this.add.text(16, statsY, '完美:0 | 普通:0 | 焦:0', {
      fontSize: '12px',
      fontFamily: FONT,
      color: COLOR_DIM,
    }).setDepth(10);

    this.revenueText = this.add.text(width / 2, statsY, '💰 $0', {
      fontSize: '14px',
      fontFamily: FONT,
      color: COLOR_ORANGE,
    }).setOrigin(0.5, 0).setDepth(10);
  }

  private setupEndButton(width: number, height: number): void {
    const btnW = 100;
    const btnH = 30;
    const bx = width - btnW / 2 - 12;
    const by = height - 100;

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
      const btnW = 72;
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
    const btnW = 36;
    const btnH = 28;
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

  private loadOvernightSausages(): void {
    const overnight = gameState.warmingZone;
    if (!overnight || overnight.length === 0) return;

    for (const ws of overnight) {
      const emptySlot = this.warmingSlots.find(s => !s.sausage);
      if (!emptySlot) break;
      emptySlot.sausage = { ...ws };
      this.updateWarmingSlotDisplay(emptySlot);
    }
    // Clear from gameState (now loaded into scene)
    updateGameState({ warmingZone: [] });
  }

  private generateCustomerPool(): void {
    const slotId = gameState.selectedSlot;
    const gridSlot = GRID_SLOTS.find(s => s.id === slotId);
    // baseTraffic 30-80 → divide by 20 → 1.5-4.0 range
    const rawTraffic = gridSlot ? gridSlot.baseTraffic / 20 : 2.5;
    const trafficNorm = Math.max(1, Math.min(5, rawTraffic));

    const marketingBonus = (gameState.upgrades['neon-sign'] ? 0.15 : 0) + (gameState.dailyTrafficBonus ?? 0);
    let pool = generateCustomers(trafficNorm, marketingBonus);
    // Cap at ~40 customers for a 90-second session (generous flow)
    if (pool.length > 40) pool = pool.slice(0, 40);

    this.pendingCustomerQueue = pool;
  }

  // Manual sausage placement — called when player clicks empty grill slot after selecting inventory type
  private placeOnGrill(slot: GrillSlot, sausageTypeId: string): void {
    if (slot.sausage) return; // Already occupied
    if (!this.inventoryCopy[sausageTypeId] || this.inventoryCopy[sausageTypeId] <= 0) return;

    // Deduct from inventory copy
    this.inventoryCopy[sausageTypeId]--;
    if (this.inventoryCopy[sausageTypeId] <= 0) {
      delete this.inventoryCopy[sausageTypeId];
    }

    // Remove placeholder
    this.clearSlotPlaceholder(slot);

    const sausage = createGrillingSausage(sausageTypeId);
    const sprite = new SausageSprite(this, slot.x, slot.y, sausage);

    sprite.onFlip(() => {
      const currentSlot = this.grillSlots.find(s => s.sprite === sprite);
      if (currentSlot?.sausage) {
        currentSlot.sausage = flipSausage(currentSlot.sausage);
        sprite.updateData(currentSlot.sausage);
        sfx.playFlip();
      }
    });

    slot.sausage = sausage;
    slot.sprite = sprite;
    (slot as any).__carbonWarnShown = false;
    (slot as any).__burntWarnShown = false;

    // Reset selection and update inventory display
    this.selectedInventoryType = null;
    this.updateInventoryDisplay();
    this.updateInventoryButtonStyles();
  }

  // Move a ready sausage from grill to warming zone
  private moveToWarming(slot: GrillSlot, sprite: SausageSprite): void {
    if (!slot.sausage || slot.sausage.served) return;

    const quality = judgeQuality(slot.sausage) as GrillQuality;

    // Warn but don't block — player decides what to serve
    if (quality === 'raw') {
      this.showFeedback('還是生的...小心食物中毒', slot.x, slot.y - 50, '#ffaa00');
    } else if (quality === 'half-cooked') {
      this.showFeedback('還沒全熟，客人可能不滿', slot.x, slot.y - 50, '#ffcc00');
    } else if (quality === 'carbonized') {
      this.showFeedback('碳化了...賣出去可能被砸店', slot.x, slot.y - 50, '#ff3300');
    } else if (quality === 'burnt') {
      this.showFeedback('有點焦，小心客人反應', slot.x, slot.y - 50, '#ff6600');
    }

    // Find empty warming slot, or create a new one dynamically (no limit)
    let emptyWarmSlot = this.warmingSlots.find(ws => !ws.sausage);
    if (!emptyWarmSlot) {
      emptyWarmSlot = this.addWarmingSlot();
    }

    const warmingSausage: WarmingSausage = {
      id: slot.sausage.id,
      sausageTypeId: slot.sausage.sausageTypeId,
      grillQuality: quality,
      qualityScore: getQualityScore(quality),
      timeInWarming: 0,
      warmingState: 'perfect-warm',
    };

    emptyWarmSlot.sausage = warmingSausage;
    this.updateWarmingSlotDisplay(emptyWarmSlot);

    // Clean up serve button
    if (slot.serveBtn) {
      slot.serveBtn.destroy();
      slot.serveBtn = null;
    }

    // Animate sausage sprite flying to warming zone
    slot.sausage = { ...slot.sausage, served: true };
    slot.sprite = null;
    sprite.playServeAnimation(emptyWarmSlot.x, emptyWarmSlot.y);

    // Redraw empty placeholder for this grill slot
    this.time.delayedCall(580, () => {
      slot.sausage = null;
      this.drawEmptySlotPlaceholder(slot);
      this.updateStatsDisplay();
    });

    this.showFeedback('起鍋！', slot.x, slot.y - 40, '#ffcc44');
  }

  // Serve from warming zone — anything can be served, consequences via probability
  private serveFromWarming(warmSlot: WarmingSlot): void {
    if (!warmSlot.sausage) return;

    const nextCustomer = this.customerQueue.getNextCustomer();
    if (!nextCustomer) {
      this.showFeedback('沒有客人等待！', warmSlot.x, warmSlot.y - 50, '#888888');
      return;
    }

    const ws = warmSlot.sausage;
    const grillQuality = ws.grillQuality as GrillQuality;

    // Calculate warming multiplier
    let warmMultiplier = 1.2;
    if (ws.warmingState === 'ok-warm') warmMultiplier = 1.0;
    if (ws.warmingState === 'cold') warmMultiplier = 0.7;

    const sausageId = ws.sausageTypeId;
    // Price = player's set price (already on the price board, customer saw it before queuing)
    const basePrice = gameState.prices[sausageId] ?? SAUSAGE_MAP[sausageId]?.suggestedPrice ?? 35;
    const finalQualityScore = ws.qualityScore * warmMultiplier;
    const price = basePrice; // customer pays what the board says, no discount

    // Always sell — customer always takes the sausage
    const record = sellSausage(sausageId, price, finalQualityScore);
    if (!record) {
      // Out of stock edge case
      warmSlot.sausage = null;
      this.clearWarmingSlotDisplay(warmSlot);
      return;
    }

    this.salesLog.push(record);

    // Track grill quality stats
    if (grillQuality in this.grillStats) {
      (this.grillStats as Record<string, number>)[grillQuality]++;
    }

    // ── Consequence system: probability-based outcomes ──
    let tipAmount = 0;
    let feedbackMsg = `+$${price}`;
    let feedbackColor = '#44ff88';

    // Perfect grill + perfect warm = best outcome
    if (grillQuality === 'perfect' && ws.warmingState === 'perfect-warm') {
      changeReputation(1);
      sfx.playPerfect();
      if (Math.random() < 0.3) {
        tipAmount = 5 + Math.floor(Math.random() * 11);
        addMoney(tipAmount);
      }
      feedbackMsg += tipAmount > 0 ? ` +$${tipAmount}小費 ★` : ' ★';

    // Raw / half-cooked → 40% chance food poisoning
    } else if (grillQuality === 'raw' || grillQuality === 'half-cooked') {
      sfx.playCashRegister();
      if (Math.random() < 0.4) {
        changeReputation(-3);
        feedbackMsg += ' 客人吃到生的！-3聲望';
        feedbackColor = '#ff4444';
      }

    // Carbonized → 30% chance smash stall
    } else if (grillQuality === 'carbonized') {
      sfx.playCashRegister();
      if (Math.random() < 0.3) {
        const damage = 50 + Math.floor(Math.random() * 151); // $50-200
        changeReputation(-2);
        addMoney(-damage);
        feedbackMsg += ` 客人砸店！-$${damage} -2聲望`;
        feedbackColor = '#ff2222';
      }

    // Burnt → 20% chance angry
    } else if (grillQuality === 'burnt') {
      sfx.playCashRegister();
      if (Math.random() < 0.2) {
        changeReputation(-2);
        feedbackMsg += ' 客人怒了！-2聲望';
        feedbackColor = '#ff6644';
      }

    // Slightly burnt → some customers actually like it
    } else if (grillQuality === 'slightly-burnt') {
      sfx.playCashRegister();
      if (Math.random() < 0.15) {
        changeReputation(1);
        feedbackMsg += ' 焦香味真讚！+1聲望';
        feedbackColor = '#ffcc44';
      }

    } else {
      sfx.playCashRegister();
    }

    // Cold serving consequence: 30% chance unhappy (separate from grill quality)
    if (ws.warmingState === 'cold' && Math.random() < 0.3) {
      changeReputation(-1);
      feedbackMsg += ' (冷的...-1聲望)';
      feedbackColor = '#6699aa';
    }

    // Overnight sausage consequence: 50% chance customer gets diarrhea and complains
    if (ws.isOvernight && Math.random() < 0.5) {
      changeReputation(-2);
      feedbackMsg += ' 隔夜的！客人拉肚子投訴 -2聲望';
      feedbackColor = '#cc44ff';
    }

    this.sessionRevenue += price + tipAmount;
    this.customerQueue.serveCustomer(nextCustomer.id, grillQuality === 'perfect');
    this.customers = this.customers.filter(c => c.id !== nextCustomer.id);

    this.showFeedback(feedbackMsg, warmSlot.x, warmSlot.y - 40, feedbackColor);
    this.bounceRevenue();

    // Clear warming slot
    warmSlot.sausage = null;
    this.clearWarmingSlotDisplay(warmSlot);

    this.updateStatsDisplay();
  }

  private onCustomerTimeout(customerId: string): void {
    sfx.playCustomerLeave();
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
    const { perfect, ok, burnt, carbonized } = this.grillStats;
    const halfCooked = this.grillStats['half-cooked'];
    const slightlyBurnt = this.grillStats['slightly-burnt'];
    this.statsText.setText(
      `完美:${perfect} | 普通:${ok} | 微焦:${slightlyBurnt} | 焦:${burnt} | 碳:${carbonized} | 生:${halfCooked}`
    );
    this.revenueText.setText(`💰 $${this.sessionRevenue}`);
  }

  private bounceRevenue(): void {
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

    // Count waste
    const grillRemaining = this.grillSlots.filter(s => s.sausage && !s.sausage.served).length;
    const warmingRemaining = this.warmingSlots.filter(s => s.sausage).length;

    // Persist to game state
    updateGameState({
      dailySalesLog: [...this.salesLog],
      dailyGrillStats: { ...this.grillStats },
      dailyWaste: { grillRemaining, warmingRemaining },
    });

    // Increment cumulative grill stats
    updateGameState({
      stats: {
        ...gameState.stats,
        totalPerfect: (gameState.stats.totalPerfect ?? 0) + this.grillStats.perfect,
        totalBurnt: (gameState.stats.totalBurnt ?? 0) + this.grillStats.burnt,
      },
    });

    EventBus.emit('grill-done', {
      salesLog: this.salesLog,
      grillStats: this.grillStats,
    });

    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      // Events happen after grilling, then battle check, then summary
      this.scene.start('EventScene');
    });
  }

  // ── Ready / Tutorial overlay ──────────────────────────────────────────────

  private showReadyOverlay(width: number, height: number): void {
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.8);
    overlay.fillRect(0, 0, width, height);
    overlay.setDepth(200);

    const isFirstDay = gameState.day === 1;
    const inventorySummary = Object.entries(this.inventoryCopy)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => {
        const info = SAUSAGE_MAP[id];
        return info ? `${info.emoji} ${info.name} x${qty}` : `${id} x${qty}`;
      })
      .join('   ');

    const lines: string[] = [
      `Day ${gameState.day} — 準備營業`,
      '',
      `今日庫存：${inventorySummary || '（空）'}`,
      `營業時間：90 秒`,
      '',
    ];

    if (isFirstDay) {
      lines.push(
        '── 操作說明 ──',
        '',
        '── 三步驟 ──',
        '① 底部選香腸 → 點烤架空位放上去',
        '② 點香腸翻面，看顏色烤到金黃色最棒',
        '③ 雙擊起鍋到保溫區 → 點保溫區出餐給客人',
        '',
        '── 熟度看顏色 ──',
        '灰色=生的  藍色=半熟  黃色=普通  綠色=完美',
        '橘色=微焦  紅色=焦了  暗紅=碳化',
        '',
        '什麼都能賣！但生的/焦的有機率被客人抱怨或砸店',
        '完美+熱騰騰=有機率拿小費！',
        '',
        '保溫區：30秒內最佳 → 再30秒普通 → 之後冷掉（都能賣！）',
        '隔夜香腸也能賣，但客人 50% 機率拉肚子投訴',
        '客人看到價格牌才來排隊，不會嫌貴！',
        '',
      );
    }

    // Start button text
    const btnText = this.add.text(width / 2, height * 0.88, '[ 開始營業！ ]', {
      fontSize: '22px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#39ff14',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(202);

    // Pulse animation on the start button
    this.tweens.add({
      targets: btnText,
      alpha: 0.5,
      duration: 600,
      yoyo: true,
      repeat: -1,
    });

    const infoText = this.add.text(width / 2, isFirstDay ? height * 0.42 : height * 0.38, lines.join('\n'), {
      fontSize: '14px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#ffcc00',
      align: 'center',
      lineSpacing: 4,
      wordWrap: { width: width * 0.85 },
    }).setOrigin(0.5).setDepth(201);

    overlay.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, width, height),
      Phaser.Geom.Rectangle.Contains
    );
    overlay.once('pointerdown', () => {
      overlay.destroy();
      infoText.destroy();
      btnText.destroy();
      this.paused = false;
    });
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  shutdown(): void {
    this.time.removeAllEvents();

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

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
import type { SaleRecord, Customer, WarmingSausage, GrillEvent, GrillEventChoice, GrillEventOutcome, OrderScore } from '../types';
import { scoreOrder, starsToString, getScoreColor } from '../systems/OrderEngine';
import { recordVisit, getBadgeInfo } from '../systems/LoyaltyEngine';
import { CONDIMENTS } from '../data/condiments';
import { SAUSAGE_TYPES } from '../data/sausages';
import { sfx } from '../utils/SoundFX';
import { rollGrillEvent } from '../data/grill-events';
import { CombatPanel } from '../ui/panels/CombatPanel';
import { getPersonalityEmoji } from '../systems/CustomerEngine';
import { changeUndergroundRep, addChaos, spendMoney } from '../state/GameState';
import { canPlayerLeave, tickWorkerAI } from '../systems/WorkerGrillAI';
import { AWAY_ACTIVITIES, rollActivityOutcome } from '../data/activities';
import type { AwayActivity } from '../data/activities';

// ── Layout constants ────────────────────────────────────────────────────────
const GAME_DURATION = 90;      // seconds
const MAX_GRILL_SLOTS = 4;     // 6 if grill-expand upgrade
const GRILL_Y_FRAC = 0.44;    // grill vertical position as fraction of screen height
// Warming zone has no fixed limit — slots are created dynamically
const CUSTOMER_ARRIVAL_INTERVAL = 5;  // seconds between customer batches (was 8)
const CUSTOMER_BATCH_MIN = 2;         // minimum customers per batch (was 1)
const CUSTOMER_BATCH_MAX = 4;         // maximum customers per batch (was 3)

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
  serveHint: Phaser.GameObjects.Text | null;
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
  private readonly customerArrivalInterval = CUSTOMER_ARRIVAL_INTERVAL;
  private isDone = false;
  private sessionRevenue = 0;
  private paused = true; // Start paused until player clicks "開始營業"
  // Session traffic bonus from events (multiplier added to base)
  private sessionTrafficBonus = 0;

  // ── Hover & keyboard state ──────────────────────────────────────────────
  private hoveredSlotIndex: number | null = null;

  // ── Grill event state ───────────────────────────────────────────────────
  private grillEventTimer = 0;
  private grillEventNextTrigger = 0; // randomized interval in seconds
  private grillEventTriggered = 0;   // how many events fired this session (max 2)
  private isShowingGrillEvent = false;
  private triggeredEventIds: string[] = [];
  // UI containers for event overlay (destroyed after dismissal)
  private grillEventOverlay: Phaser.GameObjects.Container | null = null;

  // ── Worker effect timers ─────────────────────────────────────────────────
  private workerAdiTimer = 0;       // adi: random doneness boost every ~10s
  private workerMeiTimer = 0;       // mei: steals sausage from warming every ~20s
  private workerDadActive = false;  // dad: warming decay rate halved

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

  // ── Combat state ─────────────────────────────────────────────────────────
  private currentCombatPanel: CombatPanel | null = null;
  private combatCustomersHandled: Set<string> = new Set();

  // ── Player away state ─────────────────────────────────────────────────────
  private isPlayerAway: boolean = false;
  private awayActivityTimer: number = 0;
  private currentActivity: AwayActivity | null = null;
  private leaveButton: Phaser.GameObjects.Text | null = null;
  private workerActionTimer: number = 0;
  private awayOverlay: Phaser.GameObjects.Container | null = null;
  private meiServeTimer: number = 0;

  // ── Condiment station state ──────────────────────────────────────────────
  private condimentOverlay: Phaser.GameObjects.Container | null = null;
  private selectedCondiments: string[] = [];
  private isShowingCondimentStation: boolean = false;

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
    this.sessionTrafficBonus = 0;
    this.grillSlots = [];
    this.warmingSlots = [];
    this.heatButtons = [];
    this.speedButtons = [];
    this.feedbackTexts = [];
    this.fireParticles = [];
    this.fireParticleTimer = 0;
    this.selectedInventoryType = null;
    this.inventoryButtonMap = new Map();
    this.hoveredSlotIndex = null;
    this.grillEventTimer = 0;
    this.grillEventNextTrigger = Phaser.Math.Between(25, 40);
    this.grillEventTriggered = 0;
    this.isShowingGrillEvent = false;
    this.triggeredEventIds = [];
    this.grillEventOverlay = null;
    this.currentCombatPanel = null;
    this.combatCustomersHandled = new Set();
    this.workerAdiTimer = 0;
    this.workerMeiTimer = 0;
    this.workerDadActive = gameState.hiredWorkers.includes('dad');
    this.isPlayerAway = false;
    this.awayActivityTimer = 0;
    this.currentActivity = null;
    this.leaveButton = null;
    this.workerActionTimer = 0;
    this.awayOverlay = null;
    this.meiServeTimer = 0;
    this.condimentOverlay = null;
    this.selectedCondiments = [];
    this.isShowingCondimentStation = false;

    // Worker: adi → extra grill slot
    let maxSlots = gameState.upgrades['grill-expand'] ? 6 : MAX_GRILL_SLOTS;
    if (gameState.hiredWorkers.includes('adi')) maxSlots += 1;

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

    // "Leave stall" button - only if workers can grill
    if (canPlayerLeave()) {
      this.leaveButton = this.add.text(
        this.scale.width - 10,
        this.scale.height - 40,
        '🚶 離開攤位',
        { fontSize: '16px', color: '#44aaff', backgroundColor: '#1a1a2e', padding: { x: 10, y: 6 } }
      ).setOrigin(1, 1).setInteractive({ useHandCursor: true }).setDepth(11);

      this.leaveButton.on('pointerdown', () => this.showActivityMenu());
      this.leaveButton.on('pointerover', () => this.leaveButton?.setColor('#88ccff'));
      this.leaveButton.on('pointerout', () => this.leaveButton?.setColor('#44aaff'));
    }

    // Bodyguard indicator
    if (gameState.hasBodyguard) {
      this.add.text(10, 10, '🥊 保鑣在場', {
        fontSize: '14px',
        fontFamily: FONT,
        color: '#44ff44',
        stroke: '#000000',
        strokeThickness: 2,
      }).setDepth(10);
    }

    // Load overnight sausages into warming zone
    this.loadOvernightSausages();

    this.generateCustomerPool();

    // Trigger first customer batch immediately
    this.customerArrivalTimer = this.customerArrivalInterval;

    this.cameras.main.fadeIn(400, 0, 0, 0);
    EventBus.emit('scene-ready', 'GrillScene');

    // Keyboard: spacebar flips the hovered grill slot's sausage
    this.input.keyboard!.on('keydown-SPACE', () => {
      if (this.isDone || this.paused || this.isShowingGrillEvent) return;
      if (this.hoveredSlotIndex === null) return;
      const slot = this.grillSlots[this.hoveredSlotIndex];
      if (!slot?.sausage || !slot.sprite || slot.sausage.served) return;
      this.doFlipSlot(slot);
    });

    // Show ready overlay (paused until player clicks start)
    this.showReadyOverlay(width, height);
  }

  update(_time: number, delta: number): void {
    if (this.isDone || this.paused) return;
    // Freeze all game logic while a grill event overlay is shown
    if (this.isShowingGrillEvent) return;
    // Freeze while condiment station is open
    if (this.isShowingCondimentStation) return;

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
      const batch = Math.min(
        Phaser.Math.Between(CUSTOMER_BATCH_MIN, CUSTOMER_BATCH_MAX),
        this.pendingCustomerQueue.length,
      );
      for (let i = 0; i < batch; i++) {
        const c = this.pendingCustomerQueue.shift();
        if (c) {
          // Worker: wangcai → 10% chance to scare away each arriving customer
          if (gameState.hiredWorkers.includes('wangcai') && Math.random() < 0.1) {
            this.showFeedback('🐕 旺財對客人亂吠！客人嚇跑了', this.scale.width / 2, this.scale.height * 0.1, '#ffaa44');
            continue;
          }
          this.customers.push(c);
          this.customerQueue.addCustomer(c);

          // Personality-based triggers
          if (c.personality === 'influencer') {
            this.showFeedback('📱 網紅正在直播你的攤位！', this.scale.width / 2, this.scale.height * 0.1, '#44aaff');
          } else if (
            ['karen', 'enforcer', 'inspector', 'spy'].includes(c.personality) &&
            !this.combatCustomersHandled.has(c.id)
          ) {
            this.combatCustomersHandled.add(c.id);
            this.triggerCombat(c);
          }
        }
      }
    }

    // Tick sausages on grill
    for (let si = 0; si < this.grillSlots.length; si++) {
      const slot = this.grillSlots[si];
      if (!slot.sausage || !slot.sprite || slot.sausage.served) continue;

      const updated = updateSausage(slot.sausage, this.heatLevel, dt);
      slot.sausage = updated;
      slot.sprite.updateData(updated);

      // ── Contextual feedback ──
      const heatedSide = updated.currentSide === 'bottom' ? updated.bottomDoneness : updated.topDoneness;
      const nonHeated = updated.currentSide === 'bottom' ? updated.topDoneness : updated.bottomDoneness;

      // Show "點一下翻面！" hint when heated side hits green zone (70+) and other side not yet cooked
      if (heatedSide >= 70 && nonHeated < 30 && !(slot as any).__flipPromptShown) {
        (slot as any).__flipPromptShown = true;
        this.showFeedback('點一下翻面！', slot.x, slot.y - 55, '#39ff14');
      }

      // Show "雙擊起鍋" persistent hint when both sides are cooked enough
      if (!slot.serveHint && updated.topDoneness >= 30 && updated.bottomDoneness >= 30) {
        slot.serveHint = this.add.text(slot.x, slot.y - 45, '雙擊起鍋', {
          fontSize: '10px', color: '#88ff88', backgroundColor: '#1a2a1a22',
          padding: { x: 3, y: 1 }
        }).setOrigin(0.5).setDepth(8);
      }

      // Show warning for overcooked
      const currentQuality = judgeQuality(updated);
      if (currentQuality === 'carbonized' && !(slot as any).__carbonWarnShown) {
        sfx.playBurnt();
        this.showFeedback('碳化了！快起鍋', slot.x, slot.y - 55, '#ff3300');
        (slot as any).__carbonWarnShown = true;
      } else if (currentQuality === 'burnt' && !(slot as any).__burntWarnShown) {
        this.showFeedback('焦了！趕快起鍋', slot.x, slot.y - 55, '#ff6600');
        (slot as any).__burntWarnShown = true;
      }

      // Auto-grill: if upgrade active, auto-flip when heated side >= 70 and other < 70
      if (gameState.upgrades['auto-grill']) {
        if (heatedSide >= 70 && nonHeated < 70 && !(slot as any).__autoFlipped) {
          (slot as any).__autoFlipped = true;
          (slot as any).__flipPromptShown = true;
          this.doFlipSlot(slot);
          this.showFeedback('🤖 自動翻面', slot.x, slot.y - 40, '#44ccff');
        }
        // Reset auto-flip flag when the new side becomes active
        if (heatedSide < 70) {
          (slot as any).__autoFlipped = false;
        }
      }
    }

    // Tick warming zone timers
    for (const ws of this.warmingSlots) {
      if (!ws.sausage) continue;
      // Worker: dad → warming decay rate halved
      const warmDt = this.workerDadActive ? dt * 0.5 : dt;
      ws.sausage = { ...ws.sausage, timeInWarming: ws.sausage.timeInWarming + warmDt };

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

    // Tick worker effects
    this.tickWorkerEffects(dt);

    // Tick grill events
    this.tickGrillEvents(dt);

    // Fire particle emitter (scales with heat)
    this.tickFireParticles(dt);

    // Worker auto-grill when player is away
    if (this.isPlayerAway && this.currentActivity) {
      this.awayActivityTimer -= dt;

      // Update banner text
      const bannerText = (this as any).__awayBannerText as Phaser.GameObjects.Text | null;
      if (bannerText) {
        bannerText.setText(
          `${this.currentActivity.emoji} ${this.currentActivity.name}中... (${Math.ceil(this.awayActivityTimer)}秒)`
        );
      }

      // Worker AI tick every 2 seconds
      this.workerActionTimer += dt;
      if (this.workerActionTimer >= 2.0) {
        const actions = tickWorkerAI(
          this.grillSlots.map(s => ({ sausage: s.sausage, isEmpty: !s.sausage })),
          this.warmingSlots.length,
          this.heatLevel,
          dt,
          this.inventoryCopy,
          this.workerActionTimer
        );

        const cx = this.scale.width / 2;
        const cy = this.scale.height * 0.35;

        for (const action of actions) {
          if (action.type === 'flip' && action.slotIndex !== undefined) {
            const slot = this.grillSlots[action.slotIndex];
            if (slot?.sausage && slot.sprite) {
              this.doFlipSlot(slot);
              this.showFeedback(action.message, slot.x, slot.y - 40, '#44aaff');
            }
          } else if (action.type === 'serve' && action.slotIndex !== undefined) {
            const slot = this.grillSlots[action.slotIndex];
            if (slot?.sprite) {
              this.moveToWarming(slot, slot.sprite);
              this.showFeedback(action.message, slot.x, slot.y - 40, '#44ff44');
            }
          } else if (action.type === 'place' && action.slotIndex !== undefined) {
            const availableEntry = Object.entries(this.inventoryCopy).find(([, qty]) => qty > 0);
            if (availableEntry) {
              const slot = this.grillSlots[action.slotIndex];
              if (slot && !slot.sausage) {
                this.placeOnGrill(slot, availableEntry[0]);
                this.showFeedback(action.message, slot.x, slot.y - 40, '#44ff44');
              }
            }
          } else if (action.type === 'distracted') {
            this.showFeedback(action.message, cx, cy, '#ff8800');
          }
        }
        this.workerActionTimer = 0;
      }

      // Activity complete
      if (this.awayActivityTimer <= 0) {
        this.completeActivity();
      }
    }

    // Mei auto-serve: if hired, she serves warming sausages to customers automatically
    if (gameState.hiredWorkers?.includes('mei')) {
      this.meiServeTimer += dt;
      if (this.meiServeTimer >= 3.0) {
        this.meiServeTimer = 0;
        const filledSlot = this.warmingSlots.find(s => s.sausage);
        const nextCustomer = this.customerQueue?.getNextCustomer();
        if (filledSlot && nextCustomer && filledSlot.sausage) {
          this.directServeFromWarming(filledSlot);
          this.showFeedback('💅 小妹幫你出餐了', filledSlot.x, filledSlot.y - 40, '#ff88cc');
        }
      }
    }

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
      const slot: GrillSlot = { sprite: null, sausage: null, x, y: grillY, placeholderGfx: null, serveBtn: null, serveHint: null };
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
      if (!slot.bgGfx) return;
      if (slot.sausage) {
        this.redrawWarmingSlotBgQuality(slot, this.wzX, sy, this.wzSlotW, this.wzSlotH);
      } else {
        this.redrawWarmingSlotBg(slot, this.wzX, sy, this.wzSlotW, this.wzSlotH);
      }
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

  // Quality-tinted warming slot background: border color based on grill quality
  private redrawWarmingSlotBgQuality(slot: WarmingSlot, x: number, y: number, w: number, h: number): void {
    if (!slot.bgGfx || !slot.sausage) return;
    const qualityColor = this.getQualityColor(slot.sausage.grillQuality);
    slot.bgGfx.clear();
    slot.bgGfx.lineStyle(2, qualityColor, 0.75);
    slot.bgGfx.fillStyle(0x0a0500, 0.88);
    slot.bgGfx.fillRoundedRect(x, y, w, h, 4);
    slot.bgGfx.strokeRoundedRect(x, y, w, h, 4);
  }

  private updateWarmingSlotDisplay(slot: WarmingSlot): void {
    if (!slot.sausage || !slot.infoText || !slot.stateText) return;

    const ws = slot.sausage;
    const sausageInfo = SAUSAGE_MAP[ws.sausageTypeId];
    const emoji = sausageInfo?.emoji ?? '🌭';

    // Warming state label and color
    let warmingLabel = '';
    let warmingColor = '#888888';
    if (ws.warmingState === 'perfect-warm') {
      warmingLabel = '完美保溫';
      warmingColor = '#44ff88';
    } else if (ws.warmingState === 'ok-warm') {
      warmingLabel = '微溫';
      warmingColor = '#ffcc44';
    } else {
      warmingLabel = '冷了';
      warmingColor = '#6699aa';
    }

    // Grill quality label
    const qualityLabel = this.getQualityLabel(ws.grillQuality);
    const overnightTag = ws.isOvernight ? '[隔夜] ' : '';

    // Primary text: emoji + quality + warming state
    slot.infoText.setText(`${emoji} ${overnightTag}${qualityLabel} | ${warmingLabel}`);
    slot.infoText.setColor(warmingColor);

    // State text: time remaining or cold
    if (ws.warmingState === 'perfect-warm') {
      slot.stateText.setText(`${Math.max(0, Math.ceil(30 - ws.timeInWarming))}s`);
      slot.stateText.setColor('#44ff88');
    } else if (ws.warmingState === 'ok-warm') {
      slot.stateText.setText(`${Math.max(0, Math.ceil(60 - ws.timeInWarming))}s`);
      slot.stateText.setColor('#ffcc44');
    } else {
      slot.stateText.setText('冷');
      slot.stateText.setColor('#6699aa');
    }

    // Redraw background with quality-tinted border
    const x = (slot as any).__x as number;
    const y = (slot as any).__y as number;
    const w = (slot as any).__w as number;
    const h = (slot as any).__h as number;
    this.redrawWarmingSlotBgQuality(slot, x, y, w, h);
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

  // ── Flip helper (shared by keyboard and auto-grill) ──────────────────────

  private doFlipSlot(slot: GrillSlot): void {
    if (!slot.sausage || !slot.sprite || slot.sausage.served) return;
    slot.sausage = flipSausage(slot.sausage);
    slot.sprite.triggerFlip();
    slot.sprite.updateData(slot.sausage);
    sfx.playFlip();
    (slot as any).__flipPromptShown = false;
    this.showFeedback('翻面！', slot.x, slot.y + 35, '#ffcc44');
  }

  // ── Worker effect ticks ───────────────────────────────────────────────────

  private tickWorkerEffects(dt: number): void {
    const workers = gameState.hiredWorkers;

    // Worker: adi — every ~10s, 15% chance to add +20 doneness to a random grill sausage
    if (workers.includes('adi')) {
      this.workerAdiTimer += dt;
      if (this.workerAdiTimer >= 10) {
        this.workerAdiTimer = 0;
        if (Math.random() < 0.15) {
          const active = this.grillSlots.filter(s => s.sausage && !s.sausage.served && s.sprite);
          if (active.length > 0) {
            const target = active[Math.floor(Math.random() * active.length)];
            if (target.sausage) {
              const boosted = target.sausage.currentSide === 'bottom'
                ? { ...target.sausage, bottomDoneness: Math.min(100, target.sausage.bottomDoneness + 20) }
                : { ...target.sausage, topDoneness: Math.min(100, target.sausage.topDoneness + 20) };
              target.sausage = boosted;
              target.sprite!.updateData(boosted);
              this.showFeedback('📱 阿迪在滑手機...', target.x, target.y - 40, '#aaaaff');
            }
          }
        }
      }
    }

    // Worker: mei — every ~20s, 10% chance to remove 1 sausage from warming zone
    if (workers.includes('mei')) {
      this.workerMeiTimer += dt;
      if (this.workerMeiTimer >= 20) {
        this.workerMeiTimer = 0;
        if (Math.random() < 0.10) {
          const occupied = this.warmingSlots.filter(ws => ws.sausage);
          if (occupied.length > 0) {
            const target = occupied[0]; // steal oldest
            target.sausage = null;
            this.clearWarmingSlotDisplay(target);
            this.showFeedback('💅 小妹偷吃了一根香腸...', this.scale.width * 0.70 + this.wzSlotW / 2, target.y, '#ff88cc');
          }
        }
      }
    }
  }

  // ── Combat trigger ────────────────────────────────────────────────────────

  private triggerCombat(customer: Customer): void {
    this.paused = true;
    const witnessCount = Math.floor(Math.random() * 5); // 0-4

    // Show pre-combat notification using personality emoji
    const emoji = getPersonalityEmoji(customer.personality);
    this.showFeedback(
      `${emoji} 麻煩來了！`,
      this.scale.width / 2,
      this.scale.height * 0.25,
      '#ff4444',
    );

    const panelArea = document.getElementById('panel-area');
    if (!panelArea) {
      this.paused = false;
      return;
    }

    this.currentCombatPanel = new CombatPanel({
      personality: customer.personality,
      witnessCount,
    });
    panelArea.appendChild(this.currentCombatPanel.getElement());

    EventBus.once('combat-done', (result?: { undergroundRepDelta?: number; chaosPoints?: number }) => {
      if (this.currentCombatPanel) {
        const el = this.currentCombatPanel.getElement();
        if (el.parentElement) el.parentElement.removeChild(el);
        this.currentCombatPanel.destroy();
        this.currentCombatPanel = null;
      }
      // applyCombatOutcome inside CombatPanel handles the main effects.
      // Apply any additional rep/chaos passed through the event for external overrides.
      if (result?.undergroundRepDelta !== undefined && result.undergroundRepDelta !== 0) {
        changeUndergroundRep(result.undergroundRepDelta);
      }
      if (result?.chaosPoints !== undefined && result.chaosPoints > 0) {
        addChaos(result.chaosPoints, `戰鬥後果（${getPersonalityEmoji(customer.personality)}）`);
      }
      this.paused = false;
    });
  }

  // ── Grill event tick ──────────────────────────────────────────────────────

  private tickGrillEvents(dt: number): void {
    if (this.grillEventTriggered >= 2) return;

    this.grillEventTimer += dt;
    if (this.grillEventTimer < this.grillEventNextTrigger) return;

    // Reset timer and pick next trigger interval
    this.grillEventTimer = 0;
    this.grillEventNextTrigger = Phaser.Math.Between(25, 40);

    // 60% chance an event fires
    if (Math.random() > 0.6) return;

    const event = rollGrillEvent(gameState.day, this.triggeredEventIds);
    if (!event) return;

    // Worker: wangcai auto-dismisses nuisance/thug events 50% of the time
    if (
      gameState.hiredWorkers.includes('wangcai') &&
      (event.category === 'nuisance' || event.category === 'thug') &&
      Math.random() < 0.5
    ) {
      this.showFeedback('🐕 旺財衝出去把他們嚇跑了！', this.scale.width / 2, this.scale.height * 0.35, '#ffcc44');
      this.triggeredEventIds.push(event.id);
      this.grillEventTriggered++;
      return;
    }

    this.triggeredEventIds.push(event.id);
    this.grillEventTriggered++;
    this.showGrillEventOverlay(event);
  }

  // ── Grill event overlay UI ────────────────────────────────────────────────

  private showGrillEventOverlay(event: GrillEvent): void {
    this.isShowingGrillEvent = true;
    const { width, height } = this.scale;

    const container = this.add.container(0, 0).setDepth(300);
    this.grillEventOverlay = container;

    // Semi-transparent black overlay
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, width, height);
    container.add(overlay);

    // Panel dimensions
    const panelW = width * 0.7;
    const panelX = (width - panelW) / 2;
    const panelY = height * 0.15;

    // Measure content height: header ~80px + description ~60px + choices * 50px + padding
    const choiceCount = event.choices.length;
    const panelH = 80 + 70 + choiceCount * 58 + 30;

    // Panel background
    const panelGfx = this.add.graphics();
    panelGfx.fillStyle(0x1a0a00, 0.97);
    panelGfx.lineStyle(2, 0xff9900, 0.9);
    panelGfx.fillRoundedRect(panelX, panelY, panelW, panelH, 10);
    panelGfx.strokeRoundedRect(panelX, panelY, panelW, panelH, 10);
    container.add(panelGfx);

    const cx = panelX + panelW / 2;

    // Event emoji + name
    const headerTxt = this.add.text(cx, panelY + 22, `${event.emoji} ${event.name}`, {
      fontSize: '22px',
      fontFamily: FONT,
      color: '#ffcc44',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    container.add(headerTxt);

    // Description
    const descTxt = this.add.text(cx, panelY + 58, event.description, {
      fontSize: '13px',
      fontFamily: FONT,
      color: '#ffeecc',
      wordWrap: { width: panelW - 40 },
      align: 'center',
    }).setOrigin(0.5, 0);
    container.add(descTxt);

    // Choice buttons
    const choiceStartY = panelY + 130;
    event.choices.forEach((choice, idx) => {
      const by = choiceStartY + idx * 58;
      const btnH = 46;

      const btnGfx = this.add.graphics();
      btnGfx.fillStyle(0x2a1000, 0.9);
      btnGfx.lineStyle(1, 0xff6b00, 0.6);
      btnGfx.fillRoundedRect(panelX + 20, by, panelW - 40, btnH, 5);
      btnGfx.strokeRoundedRect(panelX + 20, by, panelW - 40, btnH, 5);
      container.add(btnGfx);

      const btnTxt = this.add.text(cx, by + btnH / 2, `${choice.emoji} ${choice.text}`, {
        fontSize: '14px',
        fontFamily: FONT,
        color: COLOR_ORANGE,
        align: 'center',
      }).setOrigin(0.5);
      container.add(btnTxt);

      const hitZone = this.add.zone(cx, by + btnH / 2, panelW - 40, btnH).setInteractive({ cursor: 'pointer' });
      hitZone.on('pointerover', () => {
        btnGfx.clear();
        btnGfx.fillStyle(0xff6b00, 0.25);
        btnGfx.lineStyle(2, 0xff9900, 1.0);
        btnGfx.fillRoundedRect(panelX + 20, by, panelW - 40, btnH, 5);
        btnGfx.strokeRoundedRect(panelX + 20, by, panelW - 40, btnH, 5);
        btnTxt.setColor('#ffffff');
      });
      hitZone.on('pointerout', () => {
        btnGfx.clear();
        btnGfx.fillStyle(0x2a1000, 0.9);
        btnGfx.lineStyle(1, 0xff6b00, 0.6);
        btnGfx.fillRoundedRect(panelX + 20, by, panelW - 40, btnH, 5);
        btnGfx.strokeRoundedRect(panelX + 20, by, panelW - 40, btnH, 5);
        btnTxt.setColor(COLOR_ORANGE);
      });
      hitZone.on('pointerdown', () => {
        this.resolveGrillEventChoice(event, choice, container, panelX, panelY, panelW, panelH, cx);
      });
      container.add(hitZone);
    });
  }

  private resolveGrillEventChoice(
    _event: GrillEvent,
    choice: GrillEventChoice,
    container: Phaser.GameObjects.Container,
    panelX: number,
    panelY: number,
    panelW: number,
    _panelH: number,
    cx: number,
  ): void {
    // Roll outcome
    const roll = Math.random();
    let cumulative = 0;
    let chosenOutcome: GrillEventOutcome = choice.outcomes[choice.outcomes.length - 1];
    for (const outcome of choice.outcomes) {
      cumulative += outcome.probability;
      if (roll < cumulative) {
        chosenOutcome = outcome;
        break;
      }
    }

    // Apply effects
    const fx = chosenOutcome.effects;
    if (fx.money !== undefined) addMoney(fx.money);
    if (fx.reputation !== undefined) changeReputation(fx.reputation);
    if (fx.trafficBonus !== undefined) this.sessionTrafficBonus += fx.trafficBonus;

    if (fx.loseSausages !== undefined && fx.loseSausages > 0) {
      let removed = 0;
      for (const ws of this.warmingSlots) {
        if (ws.sausage && removed < fx.loseSausages) {
          ws.sausage = null;
          this.clearWarmingSlotDisplay(ws);
          removed++;
        }
      }
    }

    if (fx.loseGrillSausages !== undefined && fx.loseGrillSausages > 0) {
      const removeAll = fx.loseGrillSausages >= 999;
      let removed = 0;
      for (const slot of this.grillSlots) {
        if (!slot.sausage || slot.sausage.served) continue;
        if (!removeAll && removed >= fx.loseGrillSausages) break;
        if (slot.sprite) {
          slot.sprite.playBurntAnimation();
        }
        if (slot.serveBtn) { slot.serveBtn.destroy(); slot.serveBtn = null; }
        if (slot.serveHint) { slot.serveHint.destroy(); slot.serveHint = null; }
        slot.sausage = { ...slot.sausage, served: true };
        slot.sprite = null;
        const capturedSlot = slot;
        this.time.delayedCall(600, () => {
          capturedSlot.sausage = null;
          this.drawEmptySlotPlaceholder(capturedSlot);
        });
        removed++;
      }
    }

    if (fx.extraSlot) {
      const { height } = this.scale;
      const extraSlotCount = this.grillSlots.length + 1;
      this.setupGrillSlots(this.scale.width, height, extraSlotCount);
      this.showFeedback('烤架 +1 格！', this.scale.width / 2, this.scale.height * 0.35, '#44ff88');
    }

    if (fx.noMoreEventType && fx.noMoreDays) {
      updateGameState({
        grillEventCooldowns: {
          ...gameState.grillEventCooldowns,
          [fx.noMoreEventType]: gameState.day + fx.noMoreDays,
        },
      });
    }

    // Rebuild panel with result
    container.removeAll(true);
    container.setDepth(300);

    const { width, height } = this.scale;

    const overlay2 = this.add.graphics();
    overlay2.fillStyle(0x000000, 0.7);
    overlay2.fillRect(0, 0, width, height);
    container.add(overlay2);

    const resultPanelH = 180;
    const panelGfx2 = this.add.graphics();
    panelGfx2.fillStyle(0x1a0a00, 0.97);
    panelGfx2.lineStyle(2, 0xff9900, 0.9);
    panelGfx2.fillRoundedRect(panelX, panelY, panelW, resultPanelH, 10);
    panelGfx2.strokeRoundedRect(panelX, panelY, panelW, resultPanelH, 10);
    container.add(panelGfx2);

    const resultTxt = this.add.text(cx, panelY + 25, chosenOutcome.resultText, {
      fontSize: '14px',
      fontFamily: FONT,
      color: '#ffeecc',
      wordWrap: { width: panelW - 50 },
      align: 'center',
    }).setOrigin(0.5, 0);
    container.add(resultTxt);

    // Show effects summary
    const effectParts: string[] = [];
    if (fx.money !== undefined) effectParts.push(fx.money >= 0 ? `+$${fx.money}` : `-$${Math.abs(fx.money)}`);
    if (fx.reputation !== undefined) effectParts.push(fx.reputation >= 0 ? `+${fx.reputation}聲望` : `${fx.reputation}聲望`);
    if (fx.trafficBonus !== undefined && fx.trafficBonus !== 0) effectParts.push(fx.trafficBonus > 0 ? '客流+' : '客流-');
    if (fx.loseSausages !== undefined && fx.loseSausages > 0) effectParts.push(`保溫箱-${fx.loseSausages}根`);
    if (fx.loseGrillSausages !== undefined && fx.loseGrillSausages > 0) effectParts.push(fx.loseGrillSausages >= 999 ? '烤架全毀' : `烤架-${fx.loseGrillSausages}根`);
    if (fx.extraSlot) effectParts.push('烤架+1格');

    if (effectParts.length > 0) {
      const effectTxt = this.add.text(cx, panelY + 90, effectParts.join('  '), {
        fontSize: '13px',
        fontFamily: FONT,
        color: '#ffcc44',
        align: 'center',
      }).setOrigin(0.5, 0);
      container.add(effectTxt);
    }

    // Dismiss button
    const dismissY = panelY + resultPanelH - 40;
    const dismissBtnH = 32;
    const dismissBtnW = 120;
    const dismissGfx = this.add.graphics();
    dismissGfx.fillStyle(0xff6b00, 0.25);
    dismissGfx.lineStyle(2, 0xff9900, 1.0);
    dismissGfx.fillRoundedRect(cx - dismissBtnW / 2, dismissY, dismissBtnW, dismissBtnH, 5);
    dismissGfx.strokeRoundedRect(cx - dismissBtnW / 2, dismissY, dismissBtnW, dismissBtnH, 5);
    container.add(dismissGfx);

    const dismissTxt = this.add.text(cx, dismissY + dismissBtnH / 2, '繼續烤肉', {
      fontSize: '14px',
      fontFamily: FONT,
      color: '#ffffff',
    }).setOrigin(0.5);
    container.add(dismissTxt);

    const dismissZone = this.add.zone(cx, dismissY + dismissBtnH / 2, dismissBtnW, dismissBtnH)
      .setInteractive({ cursor: 'pointer' });
    dismissZone.on('pointerdown', () => {
      container.destroy();
      this.grillEventOverlay = null;
      this.isShowingGrillEvent = false;
    });
    container.add(dismissZone);
  }

  // ── Quality label helpers ─────────────────────────────────────────────────

  private getQualityLabel(quality: string): string {
    const labels: Record<string, string> = {
      'raw': '生的',
      'half-cooked': '半熟',
      'ok': '普通',
      'perfect': '完美',
      'slightly-burnt': '微焦',
      'burnt': '焦',
      'carbonized': '碳化',
    };
    return labels[quality] ?? quality;
  }

  private getQualityColor(quality: string): number {
    const colors: Record<string, number> = {
      'raw': 0x888888,
      'half-cooked': 0x4488cc,
      'ok': 0xcccc44,
      'perfect': 0x44cc44,
      'slightly-burnt': 0xcc8844,
      'burnt': 0xcc4444,
      'carbonized': 0x444444,
    };
    return colors[quality] ?? 0x888888;
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
    const slotIndex = this.grillSlots.indexOf(slot);

    // Single click = flip; double-click = move to warming zone
    sprite.onClick(() => {
      const currentSlot = this.grillSlots.find(s => s.sprite === sprite);
      if (!currentSlot) return;
      const now = Date.now();
      const lastClickTime = (currentSlot as any).__lastClickTime || 0;
      const isDoubleClick = (now - lastClickTime) < 350;
      if (isDoubleClick) {
        (currentSlot as any).__lastClickTime = 0;
        if (currentSlot.sprite) this.moveToWarming(currentSlot, currentSlot.sprite);
      } else {
        (currentSlot as any).__lastClickTime = now;
        this.doFlipSlot(currentSlot);
      }
    });

    // Hover tracking for spacebar flip
    sprite.on('pointerover', () => {
      this.hoveredSlotIndex = slotIndex;
    });
    sprite.on('pointerout', () => {
      if (this.hoveredSlotIndex === slotIndex) this.hoveredSlotIndex = null;
    });

    slot.sausage = sausage;
    slot.sprite = sprite;
    (slot as any).__carbonWarnShown = false;
    (slot as any).__burntWarnShown = false;
    (slot as any).__autoFlipped = false;

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

    // Clean up serve button and hint
    if (slot.serveBtn) {
      slot.serveBtn.destroy();
      slot.serveBtn = null;
    }
    if (slot.serveHint) {
      slot.serveHint.destroy();
      slot.serveHint = null;
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

  // Serve from warming zone — player click: open condiment station overlay
  private serveFromWarming(warmSlot: WarmingSlot): void {
    if (!warmSlot.sausage) return;
    if (this.isShowingCondimentStation) return;

    // Find best matching customer
    const nextCustomer = this.findMatchingCustomer(warmSlot.sausage);
    if (!nextCustomer) {
      this.showFeedback('沒有客人在等！', warmSlot.x, warmSlot.y - 50, '#888888');
      return;
    }

    this.openCondimentStation(warmSlot, warmSlot.sausage, nextCustomer);
  }

  // Direct serve — used by Mei worker (bypasses condiment station)
  private directServeFromWarming(warmSlot: WarmingSlot): void {
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
    let effectivePrice = basePrice; // customer pays what the board says, no discount

    // If customer is VIP (fatcat), double the effective price
    if (nextCustomer.isVIP) {
      effectivePrice = basePrice * 2;
      this.showFeedback('🤑 冤大頭付了雙倍！', warmSlot.x, warmSlot.y - 60, '#ffcc00');
    }

    const price = effectivePrice;

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

    // Score order + loyalty (Mei doesn't add condiments)
    const order = nextCustomer.order || { sausageType: ws.sausageTypeId, condiments: [] };
    const patienceRatio = this.customerQueue.getCustomerPatienceRatio?.(nextCustomer.id) ?? 0.5;
    const meiScore = scoreOrder(ws, order, [], patienceRatio, nextCustomer.loyaltyBadge || 'none', basePrice);
    if (nextCustomer.loyaltyId) {
      recordVisit(nextCustomer.loyaltyId, meiScore.stars);
    }
    const scores = [...(gameState.dailyOrderScores || []), meiScore];
    updateGameState({ dailyOrderScores: scores });

    // Clear warming slot
    warmSlot.sausage = null;
    this.clearWarmingSlotDisplay(warmSlot);

    this.updateStatsDisplay();
  }

  // ── Condiment station ─────────────────────────────────────────────────────

  private findMatchingCustomer(sausage: WarmingSausage): Customer | null {
    if (!this.customerQueue) return null;

    const waiting = (this.customerQueue as any).getWaitingCustomers?.() as Customer[] || [];

    // Priority 1: customer whose order matches this sausage type
    const typeMatch = waiting.find((c: Customer) => c.order?.sausageType === sausage.sausageTypeId);
    if (typeMatch) return typeMatch;

    // Priority 2: any waiting customer (type mismatch handled in scoring)
    const anyCustomer = this.customerQueue.getNextCustomer();
    return anyCustomer || null;
  }

  private openCondimentStation(warmSlot: WarmingSlot, sausage: WarmingSausage, customer: Customer): void {
    this.isShowingCondimentStation = true;
    this.paused = true;
    this.selectedCondiments = [];

    const w = this.scale.width;
    const h = this.scale.height;

    this.condimentOverlay = this.add.container(0, 0).setDepth(20);

    // Backdrop
    const bg = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.85).setInteractive();
    this.condimentOverlay.add(bg);

    // Title
    const title = this.add.text(w / 2, 40, '加料台', {
      fontSize: '22px', color: '#ffcc00', fontStyle: 'bold', fontFamily: FONT
    }).setOrigin(0.5);
    this.condimentOverlay.add(title);

    // Customer order display
    const orderSausageName = SAUSAGE_TYPES?.find((s: any) => s.id === customer.order?.sausageType)?.name
      || customer.order?.sausageType || '?';
    const wantedCondiments = (customer.order?.condiments || [])
      .map((id: string) => { const c = CONDIMENTS.find(c => c.id === id); return c ? `${c.emoji} ${c.name}` : id; })
      .join(' → ');

    const orderLabel = this.add.text(w / 2, 75, `客人要：${orderSausageName}`, {
      fontSize: '14px', color: '#44aaff', fontFamily: FONT
    }).setOrigin(0.5);
    this.condimentOverlay.add(orderLabel);

    const condimentLabel = this.add.text(w / 2, 98,
      wantedCondiments ? `配料：${wantedCondiments}` : '不加料', {
        fontSize: '13px', color: '#88ff88', fontFamily: FONT
      }).setOrigin(0.5);
    this.condimentOverlay.add(condimentLabel);

    // Loyalty badge display
    if (customer.loyaltyBadge && customer.loyaltyBadge !== 'none') {
      const badgeInfo = getBadgeInfo(customer.loyaltyBadge);
      const badgeText = this.add.text(w / 2, 118, `${badgeInfo.emoji} ${badgeInfo.name}`, {
        fontSize: '12px', color: '#ffcc00', fontFamily: FONT
      }).setOrigin(0.5);
      this.condimentOverlay.add(badgeText);
    }

    // Selected condiments display
    const selectedDisplay = this.add.text(w / 2, 145, '已加：（無）', {
      fontSize: '13px', color: '#ffffff', fontFamily: FONT
    }).setOrigin(0.5);
    this.condimentOverlay.add(selectedDisplay);

    // Condiment buttons — 2 rows of 4
    const btnW = 80;
    const btnH = 55;
    const gap = 8;
    const cols = 4;
    const startX = w / 2 - (cols * btnW + (cols - 1) * gap) / 2;
    const startY = 170;

    CONDIMENTS.forEach((condiment, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (btnW + gap) + btnW / 2;
      const y = startY + row * (btnH + gap) + btnH / 2;

      const isWanted = customer.order?.condiments?.includes(condiment.id);
      const btnBg = this.add.rectangle(x, y, btnW, btnH, 0x1a1a3e, 0.9)
        .setStrokeStyle(1, isWanted ? 0x44ff44 : 0x444466)
        .setInteractive({ useHandCursor: true });

      const btnEmoji = this.add.text(x, y - 10, condiment.emoji, {
        fontSize: '20px'
      }).setOrigin(0.5);

      const btnName = this.add.text(x, y + 14, condiment.name, {
        fontSize: '11px', color: '#cccccc', fontFamily: FONT
      }).setOrigin(0.5);

      btnBg.on('pointerdown', () => {
        const idx = this.selectedCondiments.indexOf(condiment.id);
        if (idx >= 0) {
          this.selectedCondiments.splice(idx, 1);
          btnBg.setFillStyle(0x1a1a3e, 0.9);
        } else {
          if (this.selectedCondiments.length < 4) {
            this.selectedCondiments.push(condiment.id);
            btnBg.setFillStyle(0x2a3a2a, 0.9);
          }
        }
        const names = this.selectedCondiments.map(id => {
          const c = CONDIMENTS.find(c => c.id === id);
          return c ? `${c.emoji}${c.name}` : id;
        });
        selectedDisplay.setText(names.length > 0 ? `已加：${names.join(' ')}` : '已加：（無）');
      });

      this.condimentOverlay!.add([btnBg, btnEmoji, btnName]);
    });

    // Serve button
    const serveBtn = this.add.text(w / 2 - 60, startY + 2 * (btnH + gap) + 20, '出餐！', {
      fontSize: '18px', color: '#44ff44', backgroundColor: '#1a2a1a',
      padding: { x: 16, y: 10 }, fontFamily: FONT
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    serveBtn.on('pointerdown', () => {
      this.finalizeServe(warmSlot, sausage, customer);
    });

    // Skip condiments button
    const skipBtn = this.add.text(w / 2 + 60, startY + 2 * (btnH + gap) + 20, '跳過加料', {
      fontSize: '14px', color: '#888888', backgroundColor: '#1a1a1a',
      padding: { x: 12, y: 8 }, fontFamily: FONT
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    skipBtn.on('pointerdown', () => {
      this.selectedCondiments = [];
      this.finalizeServe(warmSlot, sausage, customer);
    });

    this.condimentOverlay.add([serveBtn, skipBtn]);
  }

  private finalizeServe(warmSlot: WarmingSlot, sausage: WarmingSausage, customer: Customer): void {
    // Close condiment overlay
    this.condimentOverlay?.destroy();
    this.condimentOverlay = null;
    this.isShowingCondimentStation = false;
    this.paused = false;

    // Calculate patience ratio
    const patienceRatio = Math.max(0, Math.min(1,
      (this.customerQueue as any).getCustomerPatienceRatio?.(customer.id) ?? 0.5
    ));

    // Base price
    const price = gameState.prices?.[sausage.sausageTypeId] ?? 35;

    // Score the order
    const order = customer.order || { sausageType: sausage.sausageTypeId, condiments: [] };
    const score = scoreOrder(
      sausage,
      order,
      this.selectedCondiments,
      patienceRatio,
      customer.loyaltyBadge || 'none',
      price
    );

    // Type match check
    const typeMatch = sausage.sausageTypeId === order.sausageType;

    // VIP double pay
    let effectivePrice = price;
    if (customer.isVIP) {
      effectivePrice *= 2;
      this.showFeedback('VIP 雙倍！', warmSlot.x, warmSlot.y - 60, '#ffcc00');
    }

    // Sell the sausage (deduct inventory, update economy)
    const record = sellSausage(sausage.sausageTypeId, effectivePrice, sausage.qualityScore);
    if (record) {
      this.salesLog.push(record);
    }

    // Track grill quality stats
    const grillQuality = sausage.grillQuality as keyof typeof this.grillStats;
    if (grillQuality in this.grillStats) {
      (this.grillStats as Record<string, number>)[grillQuality]++;
    }

    // Add tip
    if (score.tipAmount > 0) {
      addMoney(score.tipAmount);
    }

    this.sessionRevenue += effectivePrice + score.tipAmount;

    // Record loyalty visit
    if (customer.loyaltyId) {
      recordVisit(customer.loyaltyId, score.stars);
    }

    // Record order score for daily summary
    const scores = [...(gameState.dailyOrderScores || []), score];
    updateGameState({ dailyOrderScores: scores });

    // Remove sausage from warming slot
    warmSlot.sausage = null;
    this.clearWarmingSlotDisplay(warmSlot);

    // Remove customer from queue
    this.customerQueue.serveCustomer(customer.id, score.stars >= 4);
    this.customers = this.customers.filter(c => c.id !== customer.id);

    // Show score popup
    this.showScorePopup(score, typeMatch, customer.isVIP);

    this.bounceRevenue();
    this.updateStatsDisplay();

    // Reset selected condiments for next serve
    this.selectedCondiments = [];
  }

  private showScorePopup(score: OrderScore, typeMatch: boolean, isVIP?: boolean): void {
    const w = this.scale.width;
    const h = this.scale.height;

    const popup = this.add.container(w / 2, h / 2).setDepth(25);

    const bg = this.add.rectangle(0, 0, 260, 200, 0x111122, 0.95)
      .setStrokeStyle(2, getScoreColor(score.totalScore));
    popup.add(bg);

    // Stars
    const starsText = this.add.text(0, -75, starsToString(score.stars), {
      fontSize: '28px', color: '#ffcc00'
    }).setOrigin(0.5);
    popup.add(starsText);

    // Score breakdown
    const lines = [
      `烤功：${score.grillScore}`,
      `配料：${score.condimentScore}`,
      `保溫：${score.warmingScore}`,
      `等待：${score.waitScore}`,
    ];

    if (!typeMatch) lines.push('送錯種類！');
    if (isVIP) lines.push('VIP 雙倍價！');

    lines.forEach((line, i) => {
      const t = this.add.text(0, -40 + i * 20, line, {
        fontSize: '13px', color: '#cccccc', fontFamily: FONT
      }).setOrigin(0.5);
      popup.add(t);
    });

    // Total + tip
    const totalText = this.add.text(0, 55, `總分 ${score.totalScore} | 小費 $${score.tipAmount}`, {
      fontSize: '15px', color: '#44ff44', fontStyle: 'bold', fontFamily: FONT
    }).setOrigin(0.5);
    popup.add(totalText);

    // Auto-dismiss after 2 seconds
    this.time.delayedCall(2000, () => { if (popup.active) popup.destroy(); });

    // Click to dismiss
    bg.setInteractive();
    bg.on('pointerdown', () => popup.destroy());
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

  // ── Leave stall / activity system ────────────────────────────────────────

  private showActivityMenu(): void {
    if (this.isPlayerAway || this.isDone || this.paused || this.isShowingGrillEvent) return;

    this.paused = true;

    const w = this.scale.width;
    const h = this.scale.height;

    this.awayOverlay = this.add.container(0, 0).setDepth(250);

    // Semi-transparent backdrop
    const bg = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.8).setInteractive();
    this.awayOverlay.add(bg);

    // Title
    const title = this.add.text(w / 2, 60, '🚶 離開攤位做什麼？', {
      fontSize: '22px', color: '#44aaff', fontStyle: 'bold', fontFamily: FONT
    }).setOrigin(0.5);
    this.awayOverlay.add(title);

    const subtitle = this.add.text(w / 2, 90, '工讀生會幫你顧攤位（但品質看他們心情）', {
      fontSize: '13px', color: '#888888', fontFamily: FONT
    }).setOrigin(0.5);
    this.awayOverlay.add(subtitle);

    // Filter available activities
    const available = AWAY_ACTIVITIES.filter(a => {
      if (gameState.day < a.minDay) return false;
      if (a.requiresBlackMarket && !gameState.blackMarketUnlocked) return false;
      return true;
    });

    // Activity cards — 2 columns
    const cardW = 180;
    const cardH = 100;
    const gap = 12;
    const cols = 2;
    const startX = w / 2 - (cols * cardW + (cols - 1) * gap) / 2;
    const startY = 120;

    available.forEach((activity, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + gap);
      const y = startY + row * (cardH + gap);

      const card = this.add.rectangle(x + cardW / 2, y + cardH / 2, cardW, cardH, 0x1a1a3e, 0.9)
        .setStrokeStyle(1, 0x44aaff)
        .setInteractive({ useHandCursor: true });

      const nameText = this.add.text(x + cardW / 2, y + 18, `${activity.emoji} ${activity.name}`, {
        fontSize: '15px', color: '#ffffff', fontStyle: 'bold', fontFamily: FONT
      }).setOrigin(0.5);

      const desc = activity.description.substring(0, 20) + '...';
      const descText = this.add.text(x + cardW / 2, y + 42, desc, {
        fontSize: '11px', color: '#aaaaaa', fontFamily: FONT
      }).setOrigin(0.5);

      const durText = this.add.text(x + cardW / 2, y + 62, `⏱ ${activity.duration}秒`, {
        fontSize: '12px', color: '#ffcc00', fontFamily: FONT
      }).setOrigin(0.5);

      card.on('pointerover', () => card.setStrokeStyle(2, 0x88ccff));
      card.on('pointerout', () => card.setStrokeStyle(1, 0x44aaff));
      card.on('pointerdown', () => this.startActivity(activity));

      this.awayOverlay!.add([card, nameText, descText, durText]);
    });

    // Cancel button
    const cancelBtn = this.add.text(
      w / 2,
      startY + Math.ceil(available.length / cols) * (cardH + gap) + 20,
      '❌ 算了，繼續烤',
      {
        fontSize: '14px', color: '#ff6666', backgroundColor: '#2a1a1a',
        padding: { x: 12, y: 6 }, fontFamily: FONT
      }
    ).setOrigin(0.5).setInteractive({ useHandCursor: true });

    cancelBtn.on('pointerdown', () => {
      this.awayOverlay?.destroy();
      this.awayOverlay = null;
      this.paused = false;
    });
    this.awayOverlay.add(cancelBtn);
  }

  private startActivity(activity: AwayActivity): void {
    // Clean up menu
    this.awayOverlay?.destroy();
    this.awayOverlay = null;

    this.isPlayerAway = true;
    this.currentActivity = activity;
    this.awayActivityTimer = activity.duration;
    this.paused = false; // Resume — workers are grilling!

    // Show "away" indicator overlay
    this.awayOverlay = this.add.container(0, 0).setDepth(20);

    const w = this.scale.width;

    // Top banner
    const banner = this.add.rectangle(w / 2, 25, w - 20, 40, 0x1a1a3e, 0.9)
      .setStrokeStyle(1, 0x44aaff);
    const bannerText = this.add.text(w / 2, 25,
      `${activity.emoji} ${activity.name}中... (${Math.ceil(this.awayActivityTimer)}秒)`, {
      fontSize: '14px', color: '#44aaff', fontFamily: FONT
    }).setOrigin(0.5);

    // "Return early" button
    const returnBtn = this.add.text(w - 20, 25, '🏃 提早回來', {
      fontSize: '12px', color: '#ffcc00', backgroundColor: '#2a2a1a',
      padding: { x: 6, y: 3 }, fontFamily: FONT
    }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });

    returnBtn.on('pointerdown', () => this.completeActivity());

    this.awayOverlay.add([banner, bannerText, returnBtn]);

    // Store reference for update loop
    (this as any).__awayBannerText = bannerText;

    // Hide leave button while away
    if (this.leaveButton) this.leaveButton.setVisible(false);
  }

  private completeActivity(): void {
    if (!this.currentActivity) return;

    const activity = this.currentActivity;

    // Clean up away overlay
    this.awayOverlay?.destroy();
    this.awayOverlay = null;
    (this as any).__awayBannerText = null;

    // Roll outcome
    const outcome = rollActivityOutcome(activity);

    // Apply effects
    if (outcome.effects.money) {
      if (outcome.effects.money > 0) addMoney(outcome.effects.money);
      else spendMoney(Math.abs(outcome.effects.money));
    }
    if (outcome.effects.reputation) changeReputation(outcome.effects.reputation);
    if (outcome.effects.undergroundRep) changeUndergroundRep(outcome.effects.undergroundRep);
    if (outcome.effects.chaosPoints) addChaos(outcome.effects.chaosPoints, `活動：${activity.name}`);

    // Show result overlay
    this.paused = true;
    this.isPlayerAway = false;
    this.currentActivity = null;

    const w = this.scale.width;
    const h = this.scale.height;

    this.awayOverlay = this.add.container(0, 0).setDepth(250);

    const bg = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.8).setInteractive();
    this.awayOverlay.add(bg);

    const titleText = this.add.text(w / 2, h / 2 - 80, `${activity.emoji} ${activity.name}`, {
      fontSize: '20px', color: '#44aaff', fontStyle: 'bold', fontFamily: FONT
    }).setOrigin(0.5);
    this.awayOverlay.add(titleText);

    const resultText = this.add.text(w / 2, h / 2 - 30, outcome.resultText, {
      fontSize: '14px', color: '#ffffff', wordWrap: { width: w - 80 }, align: 'center', fontFamily: FONT
    }).setOrigin(0.5);
    this.awayOverlay.add(resultText);

    // Effects summary
    const effects: string[] = [];
    if (outcome.effects.money) effects.push(`💰 ${outcome.effects.money > 0 ? '+' : ''}$${outcome.effects.money}`);
    if (outcome.effects.reputation) effects.push(`⭐ ${outcome.effects.reputation > 0 ? '+' : ''}${outcome.effects.reputation}`);
    if (outcome.effects.undergroundRep) effects.push(`💀 ${outcome.effects.undergroundRep > 0 ? '+' : ''}${outcome.effects.undergroundRep}`);
    if (outcome.effects.trafficBonus) effects.push(`📢 客流 +${Math.round(outcome.effects.trafficBonus * 100)}%`);
    if (outcome.effects.chaosPoints) effects.push(`🌀 混沌 +${outcome.effects.chaosPoints}`);
    if (outcome.effects.battleBonus) effects.push(`⚔️ 戰鬥加成 +${Math.round(outcome.effects.battleBonus * 100)}%`);

    if (effects.length > 0) {
      const effectsText = this.add.text(w / 2, h / 2 + 20, effects.join('  '), {
        fontSize: '13px', color: '#ffcc00', fontFamily: FONT
      }).setOrigin(0.5);
      this.awayOverlay.add(effectsText);
    }

    // Continue button
    const continueBtn = this.add.text(w / 2, h / 2 + 70, '回到攤位繼續烤', {
      fontSize: '16px', color: '#44ff44', backgroundColor: '#1a2a1a',
      padding: { x: 14, y: 8 }, fontFamily: FONT
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    continueBtn.on('pointerdown', () => {
      this.awayOverlay?.destroy();
      this.awayOverlay = null;
      this.paused = false;
      if (this.leaveButton) this.leaveButton.setVisible(true);

      if (outcome.effects.openBlackMarket) {
        EventBus.emit('show-panel', 'black-market');
        EventBus.once('black-market-done', () => {
          EventBus.emit('hide-panel');
        });
      }
    });
    this.awayOverlay.add(continueBtn);
  }

  // ── End session ──────────────────────────────────────────────────────────

  private endGrilling(): void {
    if (this.isDone) return;
    this.isDone = true;

    // Clean up condiment station
    this.condimentOverlay?.destroy();
    this.condimentOverlay = null;
    this.isShowingCondimentStation = false;

    // Clean up away state
    this.isPlayerAway = false;
    this.currentActivity = null;
    this.awayOverlay?.destroy();
    this.awayOverlay = null;
    (this as any).__awayBannerText = null;

    // Clean up any active combat panel
    if (this.currentCombatPanel) {
      this.currentCombatPanel.destroy();
      this.currentCombatPanel = null;
    }
    this.combatCustomersHandled.clear();
    EventBus.off('combat-done');

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
        '── 基本操作 ──',
        '',
        '① 底部選香腸 → 點烤架空位放上去',
        '② 點一下香腸 = 翻面（空白鍵也行）',
        '③ 雙擊香腸 = 起鍋到保溫區',
        '④ 點保溫區香腸 → 加配料 → 出餐',
        '',
        '── 熟度看顏色 ──',
        '灰=生  藍=半熟  黃=普通  綠=完美',
        '橘=微焦  紅=焦  暗紅=碳化',
        '',
        '── 客人點餐 ──',
        '客人頭上會顯示想要的香腸和配料',
        '出餐時選對配料 → 高分 → 高小費！',
        '送錯種類或配料會扣分',
        '',
        '── 評分系統 ──',
        '每單評分：烤功 + 配料 + 保溫 + 等待',
        '★★★★★ = 大量小費！',
        '常客會回來，忠誠度越高小費越多',
        '',
        '── 進階玩法 ──',
        '僱用工讀生 → 他們自動烤，你可以離開攤位',
        '離開攤位：招攬客人 / 搗亂對手 / 巡邏夜市',
        '商店有自動翻面機、黑市、各種升級',
        '',
        '烤肉中會有突發事件，選擇決定後果！',
        '',
      );
    }

    if (!isFirstDay) {
      lines.push(
        '點擊=翻面  雙擊=起鍋  保溫區=加料出餐',
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

    // Clean up combat panel if still active
    if (this.currentCombatPanel) {
      this.currentCombatPanel.destroy();
      this.currentCombatPanel = null;
    }
    this.combatCustomersHandled.clear();
    EventBus.off('combat-done');

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

    if (this.grillEventOverlay) {
      this.grillEventOverlay.destroy();
      this.grillEventOverlay = null;
    }

    // Clean up condiment station
    if (this.condimentOverlay) {
      this.condimentOverlay.destroy();
      this.condimentOverlay = null;
    }
    this.isShowingCondimentStation = false;

    // Clean up away state
    this.isPlayerAway = false;
    this.currentActivity = null;
    if (this.awayOverlay) {
      this.awayOverlay.destroy();
      this.awayOverlay = null;
    }
    (this as any).__awayBannerText = null;

    // Remove keyboard listeners
    this.input.keyboard?.removeAllListeners();
  }
}

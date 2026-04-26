// GrillScene — 夜晚烤制小遊戲 (pure Phaser, no HTML overlay)
import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { gameState, changeReputation, updateGameState, addMoney } from '../state/GameState';
import { GRID_SLOTS } from '../data/map';
import { SAUSAGE_MAP } from '../data/sausages';
import {
  createGrillingSausage,
  flipSausage,
  judgeQuality,
  getQualityScore,
  getCookingStage,
  getStageDisplayInfo,
  getAutoGrillTarget,
  autoTickSausage,
  type GrillingSausage,
  type GrillQuality,
  type CookingStage,
} from '../systems/GrillEngine';
import { generateCustomers } from '../systems/CustomerEngine';
import { sellSausage } from '../systems/EconomyEngine';
import { SausageSprite } from '../objects/SausageSprite';
import { CustomerQueue } from '../objects/CustomerQueue';
import type { SaleRecord, Customer, WarmingSausage, GrillEvent, GrillEventChoice, GrillEventOutcome, OrderScore } from '../types';
import { scoreOrder, starsToString, getScoreColor } from '../systems/OrderEngine';
import { recordVisit } from '../systems/LoyaltyEngine';
import { sfx } from '../utils/SoundFX';
import { rollGrillEvent } from '../data/grill-events';
import { CombatPanel } from '../ui/panels/CombatPanel';
// getPersonalityEmoji removed — emoji display removed from combat feedback
import { useBlackMarketItem, BLACK_MARKET_ITEMS } from '../systems/BlackMarketEngine';
import { changeUndergroundRep, addChaos, spendMoney } from '../state/GameState';
import { canPlayerLeave, tickWorkerAI } from '../systems/WorkerGrillAI';
import { AWAY_ACTIVITIES, rollActivityOutcome } from '../data/activities';
import type { AwayActivity } from '../data/activities';
import { getSpecialEffect } from '../data/sausage-effects';
import type { SpecialEffectResult } from '../data/sausage-effects';
import { CUSTOMER_COMMENTS, COUNTER_ATTACKS } from '../data/customerComments';
import { SpectatorCrowd } from '../objects/SpectatorCrowd';
import { RhythmNote } from '../objects/RhythmNote';
import type { RhythmChart } from '../data/chart';
import { judgeHit, JUDGE_WINDOWS } from '../systems/RhythmEngine';
import type { HitJudgement } from '../systems/RhythmEngine';
import type { NoteType, ChartNote } from '../data/chart';

// ── Layout constants ────────────────────────────────────────────────────────
// Tier-based session duration: early tiers are shorter and less demanding
function getSessionDuration(): number {
  const tier = gameState.playerSlot || 1;
  if (tier <= 3) return 75;
  if (tier <= 6) return 90;
  return 105;
}
const GAME_DURATION = 90;      // seconds (kept as fallback reference)
const MAX_GRILL_SLOTS = 8;     // 12 if grill-expand upgrade
const GRILL_Y_FRAC = 0.35;    // grill vertical position as fraction of screen height (true center)
// Warming zone has no fixed limit — slots are created dynamically
// Customer arrival scales with day: early days are calmer
const BASE_ARRIVAL_INTERVAL = 10; // day 1 interval
const MIN_ARRIVAL_INTERVAL = 5;   // fastest interval (late game with upgrades)
const CUSTOMER_BATCH_MIN = 2;
const CUSTOMER_BATCH_MAX = 4;     // base max, scales up with day

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
  placeholderGfx: GrillSlotGraphics | null;
  serveBtn: Phaser.GameObjects.Text | null;
  serveHint: Phaser.GameObjects.Text | null;
  // Runtime state flags attached during play
  __flipPromptShown?: boolean;
  __carbonWarnShown?: boolean;
  __burntWarnShown?: boolean;
  __autoFlipped?: boolean;
  __lastClickTime?: number;
  // Stage tracking for visual/audio feedback (Wave 4a)
  __prevTopStage?: CookingStage;
  __prevBottomStage?: CookingStage;
  __lastStageFeedbackTime?: number; // seconds, debounce
  // Wave 4b: interaction buttons
  flipBtn?: Phaser.GameObjects.Container | null;
  pressBtn?: Phaser.GameObjects.Container | null;
  oilBtn?: Phaser.GameObjects.Container | null;
  __flipCooldownUntil?: number; // session-time seconds when cooldown ends
  __isPressingBtn?: boolean;    // true while press button is held
}

// Extended Graphics object that carries the associated hit zone
interface GrillSlotGraphics extends Phaser.GameObjects.Graphics {
  __hitZone?: Phaser.GameObjects.Zone;
}

interface WarmingSlot {
  sausage: WarmingSausage | null;
  x: number;
  y: number;
  bgGfx: Phaser.GameObjects.Graphics | null;
  infoText: Phaser.GameObjects.Text | null;
  stateText: Phaser.GameObjects.Text | null;
  // Layout geometry cached at creation time
  __x?: number;
  __y?: number;
  __w?: number;
  __h?: number;
}

export class GrillScene extends Phaser.Scene {
  // ── Session state ───────────────────────────────────────────────────────
  private timeLeft = GAME_DURATION;
  private speedMultiplier = 1;
  private salesLog: SaleRecord[] = [];
  private grillStats = { perfect: 0, ok: 0, raw: 0, burnt: 0, 'half-cooked': 0, 'slightly-burnt': 0, carbonized: 0 };
  private customers: Customer[] = [];
  private pendingCustomerQueue: Customer[] = [];
  private customerArrivalTimer = 0;
  private customerArrivalInterval = 0;
  private isDone = false;
  private sessionRevenue = 0;
  private paused = true; // Start paused until player clicks "開始營業"
  // Session traffic bonus from events (multiplier added to base)
  private sessionTrafficBonus = 0;

  // ── Combo state ─────────────────────────────────────────────────────────
  private perfectCombo = 0;
  private maxCombo = 0;
  private comboText: Phaser.GameObjects.Text | null = null;

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

  // ── Overflow queue（烤架滿時暫存，繼續烤至達標後補位）─────────────────────
  private overflowSausages: { sausage: GrillingSausage; sausageTypeId: string; bornAt: number }[] = [];

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
  private speedButtons: Phaser.GameObjects.Container[] = [];
  private feedbackTexts: Phaser.GameObjects.Text[] = [];
  // Fire emoji particles floating upward
  private fireParticles: Phaser.GameObjects.Text[] = [];
  private fireParticleTimer = 0;
  private fireGlowGfx!: Phaser.GameObjects.Graphics;
  private timerFlashTween: Phaser.Tweens.Tween | null = null;

  // ── Background overlay reference ─────────────────────────────────────────
  // @ts-ignore — reserved for future bg manipulation
  private bgGrillImage: Phaser.GameObjects.Image | null = null;
  private bgm: Phaser.Sound.BaseSound | null = null;

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
  private __awayBannerText: Phaser.GameObjects.Text | null = null;

  // ── Garlic toggle state ───────────────────────────────────────────────────
  private condimentOverlay: Phaser.GameObjects.Container | null = null;
  private appliedGarlic: boolean = false;
  private isShowingCondimentStation: boolean = false;

  // ── Special sausage effect state ─────────────────────────────────────────
  private activeTipMultiplier: number = 1;
  private tipMultiplierServesLeft: number = 0;
  private patienceBoostNext: number = 0;
  private patienceBoostAmount: number = 1;

  // ── Customer commentary state ─────────────────────────────────────────────
  private lastCommentTime = 0;
  private commentBubble: Phaser.GameObjects.Text | null = null;
  private counterAttackPanel: Phaser.GameObjects.Container | null = null;
  private slowServiceTimer = 0; // how long grill+warming have been empty while customers wait

  // ── Wave 4c: SpectatorCrowd ──────────────────────────────────────────────
  private spectatorCrowd!: SpectatorCrowd;
  private spectatorSpawnTimer = 0;
  private spectatorNextSpawnInterval = 4; // seconds; randomized each spawn
  private pressureLevelText: Phaser.GameObjects.Text | null = null;
  private pressureUpdateTimer = 0; // 每 500ms 更新一次壓力顯示
  private patienceCheckTimer = 0;  // 每秒檢查一次 patience

  // ── Wave 6a: Rhythm track state ──────────────────────────────────────────
  private chart: RhythmChart | null = null;
  private rhythmNotes: RhythmNote[] = [];
  private nextNoteSpawnIdx = 0;      // pointer into chart.notes[]
  private readonly NOTE_LEAD_TIME = 1.8;  // seconds ahead of hit time for note to spawn
  private readonly NOTE_SPAWN_X = 1100;   // right edge spawn x
  private readonly NOTE_HIT_X = 280;      // judgement circle x
  // NOTE_TRACK_Y is computed in create() relative to this.scale.height
  // (between warming zone bottom ~0.68 and spectator crowd ~0.76)
  private noteTrackY = 0;

  // ── Wave 6b: Rhythm input / judgement state ───────────────────────────────
  private rhythmCombo = 0;
  private maxRhythmCombo = 0;
  private hitStats = { perfect: 0, great: 0, good: 0, miss: 0 };
  private rhythmComboText: Phaser.GameObjects.Text | null = null;

  // ── Wave 6e: Service combo state ─────────────────────────────────────────
  // Total service combo groups injected this session (used for future summary display)
  private totalServiceComboGroupCount = 0;
  // hit = successful hits, seen = total notes processed (hit + miss)
  private serviceComboGroupHits = new Map<number, { hit: number; seen: number; total: number }>();
  // Track which groups have already fired triggerBatchServe (prevent double-fire)
  private serviceComboBatchFired = new Set<number>();

  // ── Wave 6cd: BGM sync + rhythm gate ──────────────────────────────────────
  private rhythmStarted = false;
  // Wave 6cd-fix: BGM 直接用 Web Audio API 控制（避開 Phaser sound.seek 的時鐘漂移）
  private bgmCtx: AudioContext | null = null;
  private bgmAudioBuffer: AudioBuffer | null = null;
  private bgmSource: AudioBufferSourceNode | null = null;
  private bgmGain: GainNode | null = null;
  private bgmStartCtxTime = 0;     // ctx.currentTime when source started, adjusted for offset
  private bgmElapsedAtPause = 0;   // elapsed seconds at pause
  private bgmPaused = false;
  private bgmFinished = false;

  constructor() {
    super({ key: 'GrillScene' });
  }

  // ── Scene lifecycle ──────────────────────────────────────────────────────

  preload(): void {
    // All textures preloaded in BootScene
  }

  create(): void {
    this.events.on('shutdown', this.shutdown, this);
    const { width, height } = this.scale;

    // Copy inventory snapshot (actual deduction happens in sellSausage)
    this.inventoryCopy = { ...gameState.inventory };

    // Reset session state
    this.timeLeft = getSessionDuration();
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

    // Compute customer arrival interval for this session
    const dayFactor = Math.min(1, (gameState.day - 1) / 14);
    const hasNeonSign = gameState.upgrades['neon-sign'];
    const upgradeBonus = hasNeonSign ? 1 : 0;
    this.customerArrivalInterval = Math.max(MIN_ARRIVAL_INTERVAL, BASE_ARRIVAL_INTERVAL - dayFactor * 4 - upgradeBonus) * 0.6;
    this.grillSlots = [];
    this.warmingSlots = [];
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
    this.appliedGarlic = false;
    this.isShowingCondimentStation = false;
    this.activeTipMultiplier = 1;
    this.tipMultiplierServesLeft = 0;
    this.patienceBoostNext = 0;
    this.patienceBoostAmount = 1;
    this.lastCommentTime = 0;
    this.commentBubble = null;
    this.counterAttackPanel = null;
    this.slowServiceTimer = 0;
    this.perfectCombo = 0;
    this.maxCombo = 0;
    this.comboText = null;
    this.spectatorSpawnTimer = 0;
    this.spectatorNextSpawnInterval = 4 + Math.random() * 4;
    this.pressureLevelText = null;
    this.pressureUpdateTimer = 0;
    this.patienceCheckTimer = 0;

    // ── Wave 6a reset ──
    this.chart = null;
    this.rhythmNotes = [];
    this.nextNoteSpawnIdx = 0;
    this.noteTrackY = 0;

    // ── Wave 6b reset ──
    this.rhythmCombo = 0;
    this.maxRhythmCombo = 0;
    this.hitStats = { perfect: 0, great: 0, good: 0, miss: 0 };
    this.rhythmComboText = null;
    this.overflowSausages = [];

    // ── Wave 6cd reset ──
    this.rhythmStarted = false;
    this.bgmCtx = null;
    this.bgmAudioBuffer = null;
    this.bgmSource = null;
    this.bgmGain = null;
    this.bgmStartCtxTime = 0;
    this.bgmElapsedAtPause = 0;
    this.bgmPaused = false;
    this.bgmFinished = false;
    // appliedGarlic fixed to true — condiment station removed in Wave 6c
    this.appliedGarlic = true;

    // Worker: adi → extra grill slot
    let maxSlots = gameState.upgrades['grill-expand'] ? 12 : MAX_GRILL_SLOTS;
    if (gameState.hiredWorkers.includes('adi')) maxSlots += 1;

    this.drawBackground(width, height);
    this.drawGrillRack(width, height);
    this.setupGrillSlots(width, height, maxSlots);
    this.setupWarmingZone(width, height);
    this.setupCustomerQueue(width, height);
    this.setupSpeedButtons(width, height);
    this.setupInventoryPanel(width, height);
    this.setupHUD(width, height);
    this.setupEndButton(width, height);
    this.setupSpectatorCrowd(width, height);
    this.setupRhythmTrack(width, height);

    // Simulation mode HUD label
    if (gameState.gameMode === 'simulation') {
      this.add.text(10, 30, '模擬模式', {
        fontSize: '13px',
        color: '#00cc88',
        backgroundColor: '#0a1a0f',
        padding: { x: 6, y: 3 },
      }).setDepth(100);
    }

    // "Leave stall" button - only if workers can grill
    if (canPlayerLeave()) {
      this.leaveButton = this.add.text(
        this.scale.width - 10,
        this.scale.height - 40,
        '離開攤位',
        { fontSize: '16px', color: '#44aaff', backgroundColor: '#1a1a2e', padding: { x: 10, y: 6 } }
      ).setOrigin(1, 1).setInteractive({ useHandCursor: true }).setDepth(11);

      this.leaveButton.on('pointerdown', () => this.showActivityMenu());
      this.leaveButton.on('pointerover', () => this.leaveButton?.setColor('#88ccff'));
      this.leaveButton.on('pointerout', () => this.leaveButton?.setColor('#44aaff'));
    }

    // Bodyguard indicator
    if (gameState.hasBodyguard) {
      this.add.text(10, 10, '保鑣在場', {
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

    // Keyboard: spacebar flips the hovered grill slot's sausage
    this.input.keyboard!.on('keydown-SPACE', () => {
      if (this.isDone || this.paused || this.isShowingGrillEvent) return;
      if (this.hoveredSlotIndex === null) return;
      const slot = this.grillSlots[this.hoveredSlotIndex];
      if (!slot?.sausage || !slot.sprite || slot.sausage.served) return;
      this.doFlipSlot(slot);
    });

    // Wangcai interaction (if hired)
    if (gameState.hiredWorkers?.includes('wangcai')) {
      const wangcaiBtn = this.add.text(
        this.scale.width - 10, this.scale.height - 120,
        '摸旺財',
        { fontSize: '14px', color: '#ffaa00', backgroundColor: '#1a1a1a', padding: { x: 8, y: 5 } }
      ).setOrigin(1, 1).setInteractive({ useHandCursor: true }).setDepth(10);

      let wangcaiCooldown = 0;

      wangcaiBtn.on('pointerdown', () => {
        if (wangcaiCooldown > 0) {
          this.showFeedback('旺財在休息...', wangcaiBtn.x - 50, wangcaiBtn.y - 20, '#888888');
          return;
        }
        wangcaiCooldown = 30;

        const roll = Math.random();
        if (roll < 0.3) {
          const found = 10 + Math.floor(Math.random() * 30);
          addMoney(found);
          this.showFeedback(`旺財叼回了 $${found}！`, wangcaiBtn.x - 80, wangcaiBtn.y - 30, '#ffcc00');
        } else if (roll < 0.5) {
          const waiting = this.customerQueue.getWaitingCustomers();
          const badOne = waiting.find(c => c.personality === 'karen' || c.personality === 'enforcer');
          if (badOne) {
            this.customerQueue.serveCustomer(badOne.id, false);
            this.customers = this.customers.filter(c => c.id !== badOne.id);
            this.showFeedback('旺財把奧客嚇跑了！', wangcaiBtn.x - 80, wangcaiBtn.y - 30, '#44ff44');
          } else {
            this.showFeedback('旺財搖搖尾巴，很開心', wangcaiBtn.x - 80, wangcaiBtn.y - 30, '#ffaa00');
          }
        } else if (roll < 0.7) {
          this.customerQueue.multiplyAllPatience(1.1);
          this.showFeedback('旺財賣萌！客人都被療癒了', wangcaiBtn.x - 80, wangcaiBtn.y - 30, '#ff88cc');
        } else {
          this.showFeedback('汪！（搖尾巴）', wangcaiBtn.x - 80, wangcaiBtn.y - 30, '#ffaa00');
        }
      });

      this.time.addEvent({
        delay: 1000,
        loop: true,
        callback: () => { if (wangcaiCooldown > 0) wangcaiCooldown--; },
      });
    }

    // Show rhythm tutorial overlay (paused until player dismisses)
    this.showRhythmTutorial(width, height);
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
      // Batch size scales: day 1-5 = 2-4, day 6-14 = 2-5, day 15+ = 2-6
      const dayBatchMax = gameState.day >= 15 ? 6 : gameState.day >= 6 ? 5 : CUSTOMER_BATCH_MAX;
      const dayBatchMin = gameState.day >= 15 ? 2 : CUSTOMER_BATCH_MIN;
      const batch = Math.min(
        Phaser.Math.Between(dayBatchMin, dayBatchMax),
        this.pendingCustomerQueue.length,
      );
      for (let i = 0; i < batch; i++) {
        const c = this.pendingCustomerQueue.shift();
        if (c) {
          // Worker: wangcai → 10% chance to scare away each arriving customer
          if (gameState.hiredWorkers.includes('wangcai') && Math.random() < 0.1) {
            this.showFeedback('旺財對客人亂吠！客人嚇跑了', this.scale.width / 2, this.scale.height * 0.1, '#ffaa44');
            continue;
          }
          this.customers.push(c);
          this.customerQueue.addCustomer(c);

          // Apply patience boost from special sausage effect
          if (this.patienceBoostNext > 0) {
            c.patience *= this.patienceBoostAmount;
            this.patienceBoostNext--;
          }

          // Personality-based triggers
          if (c.personality === 'influencer') {
            this.showFeedback('網紅正在直播你的攤位！', this.scale.width / 2, this.scale.height * 0.1, '#44aaff');
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

      const isSimulation = gameState.gameMode === 'simulation';
      const prevTopStage = slot.__prevTopStage ?? getCookingStage(slot.sausage.topDoneness);
      const prevBottomStage = slot.__prevBottomStage ?? getCookingStage(slot.sausage.bottomDoneness);

      // Wave 6cd+: all grill sausages go through rhythmAccuracy auto-tick path
      let updated: GrillingSausage;
      if (slot.sausage.rhythmAccuracy) {
        updated = autoTickSausage(slot.sausage, dt);
      } else {
        // legacy path — should not happen post-Wave 6cd
        continue;
      }

      slot.sausage = updated;
      slot.sprite.updateData(updated);

      // ── Stage change feedback (Wave 4a) ─────────────────────────────────────
      const nowSec = performance.now() / 1000; // monotonic wall-clock, consistent with flip cooldown
      const debounceOk = nowSec - (slot.__lastStageFeedbackTime ?? 0) > 0.2;
      const newTopStage = updated.topStage;
      const newBottomStage = updated.bottomStage;
      const topChanged = newTopStage !== prevTopStage;
      const bottomChanged = newBottomStage !== prevBottomStage;
      if ((topChanged || bottomChanged) && debounceOk) {
        const changedStage = topChanged ? newTopStage : newBottomStage;
        const info = getStageDisplayInfo(changedStage);
        this.showFeedback(info.label, slot.x, slot.y - 55, `#${info.borderGlow.toString(16).padStart(6, '0')}`);
        slot.__lastStageFeedbackTime = performance.now() / 1000;
        // Audio: hot → warning beep, burnt → crackle
        if (changedStage === 'hot') {
          sfx.playStageHot();
        } else if (changedStage === 'burnt') {
          sfx.playStageBurnt();
        }
        // Wave 4c: 通知圍觀者
        if (changedStage === 'golden') {
          this.spectatorCrowd.reactToStage('golden');
        } else if (changedStage === 'hot') {
          this.spectatorCrowd.reactToStage('hot');
        } else if (changedStage === 'burnt') {
          this.spectatorCrowd.reactToStage('burnt');
        }
      }
      slot.__prevTopStage = newTopStage;
      slot.__prevBottomStage = newBottomStage;
      // ────────────────────────────────────────────────────────────────────────

      // ── Contextual feedback ──
      const heatedSide = updated.currentSide === 'bottom' ? updated.bottomDoneness : updated.topDoneness;
      const nonHeated = updated.currentSide === 'bottom' ? updated.topDoneness : updated.bottomDoneness;

      // Show "點一下翻面！" hint when heated side hits green zone (70+) and other side not yet cooked
      if (heatedSide >= 70 && nonHeated < 30 && !slot.__flipPromptShown) {
        slot.__flipPromptShown = true;
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
      const currentQuality = judgeQuality(updated, isSimulation);
      if (currentQuality === 'carbonized' && !slot.__carbonWarnShown) {
        sfx.playBurnt();
        this.showFeedback('碳化了！快起鍋', slot.x, slot.y - 55, '#ff3300');
        slot.__carbonWarnShown = true;
      } else if (currentQuality === 'burnt' && !slot.__burntWarnShown) {
        this.showFeedback('焦了！趕快起鍋', slot.x, slot.y - 55, '#ff6600');
        slot.__burntWarnShown = true;
      }

      // Auto-grill: if upgrade active, auto-flip when heated side >= 70 and other < 70
      if (gameState.upgrades['auto-grill']) {
        if (heatedSide >= 70 && nonHeated < 70 && !slot.__autoFlipped) {
          slot.__autoFlipped = true;
          slot.__flipPromptShown = true;
          this.doFlipSlot(slot);
          this.showFeedback('自動翻面', slot.x, slot.y - 40, '#44ccff');
        }
        // Reset auto-flip flag when the new side becomes active
        if (heatedSide < 70) {
          slot.__autoFlipped = false;
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
      if (this.__awayBannerText) {
        this.__awayBannerText.setText(
          `${this.currentActivity.name}中... (${Math.ceil(this.awayActivityTimer)}秒)`
        );
      }

      // Worker AI tick every 2 seconds
      this.workerActionTimer += dt;
      if (this.workerActionTimer >= 2.0) {
        const actions = tickWorkerAI(
          this.grillSlots.map(s => ({ sausage: s.sausage, isEmpty: !s.sausage })),
          this.warmingSlots.length,
          'medium',
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
          this.showFeedback('小妹幫你出餐了', filledSlot.x, filledSlot.y - 40, '#ff88cc');
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
    // Don't auto-end during combat, events, condiment station, or away activities
    if (
      !this.isDone &&
      !this.paused &&
      !this.isShowingGrillEvent &&
      !this.isShowingCondimentStation &&
      !this.isPlayerAway &&
      !this.currentCombatPanel &&
      this.pendingCustomerQueue.length === 0 &&
      this.customerQueue.getWaitingCount() === 0 &&
      this.salesLog.length > 0 &&
      this.timeLeft < 85 // don't auto-end in the first 5 seconds
    ) {
      this.endGrilling();
    }

    this.tickCustomerCommentary(dt);

    // ── Wave 4c: SpectatorCrowd tick ────────────────────────────────────────
    this.spectatorCrowd.tick(dt);

    // Spawn timer：每 4–8 秒從 customerQueue 取 1 位 shallow-copy 加入圍觀
    this.spectatorSpawnTimer += dt;
    if (this.spectatorSpawnTimer >= this.spectatorNextSpawnInterval) {
      this.spectatorSpawnTimer = 0;
      this.spectatorNextSpawnInterval = 4 + Math.random() * 4;
      const waiting = this.customerQueue.getWaitingCustomers();
      if (waiting.length > 0) {
        // shallow copy：複製 Customer 基礎資料，不搬動原始物件
        const original = waiting[0];
        const clone: import('../types').Customer = { ...original };
        this.spectatorCrowd.addSpectator(clone);
      }
    }

    // 每秒檢查：有耐心 < 30% 的等待客人 → 觸發 slow 反應
    this.patienceCheckTimer += dt;
    if (this.patienceCheckTimer >= 1.0) {
      this.patienceCheckTimer = 0;
      const waiting = this.customerQueue.getWaitingCustomers();
      const ratios = waiting.map(c => this.customerQueue.getCustomerPatienceRatio(c.id));
      // 更新壓力計算用比率
      this.spectatorCrowd.updatePatienceRatios(ratios);
      if (ratios.some(r => r < 0.3)) {
        this.spectatorCrowd.reactToStage('slow');
      }
    }

    // 每 500ms 更新注目度顯示
    this.pressureUpdateTimer += dt;
    if (this.pressureUpdateTimer >= 0.5) {
      this.pressureUpdateTimer = 0;
      if (this.pressureLevelText) {
        const level = this.spectatorCrowd.getPressureLevel();
        this.pressureLevelText.setText(`注目 ${level.toFixed(1)}`);
        // 壓力高（>3）變紅，否則灰
        this.pressureLevelText.setColor(level > 3 ? '#ff4444' : '#888888');
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── Wave 6a: Rhythm track tick ───────────────────────────────────────────
    this.updateRhythmTrack();

    // ── Wave 6c: Auto-serve rhythm sausages that hit target doneness ──────────
    if (this.rhythmStarted) {
      this.tickOverflowSausages(dt);
      this.autoServeReady();
    }
  }

  // ── Wave 6a: Rhythm track ────────────────────────────────────────────────

  /**
   * Called once in create().
   * Loads the chart from Phaser cache, draws the track line and judgement circle,
   * and resets all rhythm state for this session.
   */
  private setupRhythmTrack(width: number, height: number): void {
    // Load chart from Phaser JSON cache (preloaded in BootScene)
    const cachedChart = this.cache.json.get('chart-grill-theme') as RhythmChart | undefined;
    this.chart = cachedChart ?? null;

    // Reset rhythm state
    this.nextNoteSpawnIdx = 0;
    this.rhythmNotes = [];

    // NOTE_TRACK_Y: above grill rack (grill at 0.35), between customer queue (~0.17) and grill.
    // 0.22 places the track in the gap between queue bottom and grill top.
    this.noteTrackY = height * 0.22;

    // Debug: track line (semi-transparent dark grey)
    const trackLine = this.add.graphics();
    trackLine.lineStyle(2, 0x444444, 0.5);
    trackLine.beginPath();
    trackLine.moveTo(0, this.noteTrackY);
    trackLine.lineTo(width, this.noteTrackY);
    trackLine.strokePath();
    trackLine.setDepth(10);

    // Judgement circle (white stroke only, no fill)
    const judgeCircle = this.add.graphics();
    judgeCircle.lineStyle(3, 0xffffff, 0.8);
    judgeCircle.strokeCircle(this.NOTE_HIT_X, this.noteTrackY, 36);
    judgeCircle.setDepth(10);

    // Debug label below judgement circle
    this.add.text(this.NOTE_HIT_X, this.noteTrackY + 44, 'Don=F/J  Ka=D/K', {
      fontSize: '11px',
      fontFamily: FONT,
      color: '#888888',
    }).setOrigin(0.5).setDepth(10);

    // ── Wave 6b: Keyboard input ──────────────────────────────────────────────
    this.input.keyboard?.on('keydown-F', () => this.handleRhythmPress('don'));
    this.input.keyboard?.on('keydown-J', () => this.handleRhythmPress('don'));
    this.input.keyboard?.on('keydown-D', () => this.handleRhythmPress('ka'));
    this.input.keyboard?.on('keydown-K', () => this.handleRhythmPress('ka'));

    // ── Wave 6b: Touch buttons (Don = red left, Ka = blue right) ────────────
    const btnY = height - 80;
    const donX = width * 0.25;
    const kaX  = width * 0.75;
    const btnRadius = 60;

    // Don button (red)
    const donGfx = this.add.graphics();
    donGfx.fillStyle(0xff3344, 0.85);
    donGfx.fillCircle(donX, btnY, btnRadius);
    donGfx.lineStyle(3, 0xffffff, 0.6);
    donGfx.strokeCircle(donX, btnY, btnRadius);
    donGfx.setDepth(50).setInteractive(
      new Phaser.Geom.Circle(donX, btnY, btnRadius),
      Phaser.Geom.Circle.Contains,
    );
    donGfx.on('pointerdown', () => this.handleRhythmPress('don'));

    this.add.text(donX, btnY, '咚\nDon', {
      fontSize: '18px',
      fontFamily: FONT,
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    }).setOrigin(0.5).setDepth(51);

    // Ka button (blue)
    const kaGfx = this.add.graphics();
    kaGfx.fillStyle(0x3388ff, 0.85);
    kaGfx.fillCircle(kaX, btnY, btnRadius);
    kaGfx.lineStyle(3, 0xffffff, 0.6);
    kaGfx.strokeCircle(kaX, btnY, btnRadius);
    kaGfx.setDepth(50).setInteractive(
      new Phaser.Geom.Circle(kaX, btnY, btnRadius),
      Phaser.Geom.Circle.Contains,
    );
    kaGfx.on('pointerdown', () => this.handleRhythmPress('ka'));

    this.add.text(kaX, btnY, '喀\nKa', {
      fontSize: '18px',
      fontFamily: FONT,
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    }).setOrigin(0.5).setDepth(51);

    // ── Wave 6b: Combo display text (top-left, hidden until combo >= 2) ──────
    this.rhythmComboText = this.add.text(60, 100, '', {
      fontSize: '32px',
      fontFamily: FONT,
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    }).setDepth(200).setAlpha(0);
  }

  /**
   * Called every update() tick.
   * Spawns notes whose time window has entered NOTE_LEAD_TIME,
   * moves existing notes, and removes notes that pass the hit line.
   */
  private updateRhythmTrack(): void {
    if (!this.chart) return;
    if (this.isShowingGrillEvent || this.paused || !this.rhythmStarted) return;

    const now = this.getRhythmTime();

    // Spawn notes whose hit time is within NOTE_LEAD_TIME from now
    while (this.nextNoteSpawnIdx < this.chart.notes.length) {
      const next = this.chart.notes[this.nextNoteSpawnIdx];
      if (next.t - now > this.NOTE_LEAD_TIME) break;
      const note = new RhythmNote(this, this.NOTE_SPAWN_X, this.noteTrackY, next);
      note.setDepth(15);
      this.rhythmNotes.push(note);
      this.nextNoteSpawnIdx++;
    }

    // Move existing notes; handle auto-MISS for notes that passed the judgement window;
    // destroy notes that have flown well past the hit line.
    for (let i = this.rhythmNotes.length - 1; i >= 0; i--) {
      const n = this.rhythmNotes[i];
      n.setPositionByTime(now, n.note.t, this.NOTE_HIT_X, this.NOTE_SPAWN_X, this.NOTE_LEAD_TIME);

      // Auto-MISS: note time passed the good window and still not hit
      if (!n.isHit && n.note.t < now - JUDGE_WINDOWS.good) {
        n.markHit();
        this.hitStats.miss += 1;
        this.rhythmCombo = 0;
        this.updateRhythmComboText();
        sfx.playRhythmMiss();
        this.showJudgementBig('MISS', '#aa3333', 18, 350);
        // Visual: grey out + reduce alpha, note continues flying off-screen
        n.setAlpha(0.4);
        // Wave 6e: service combo auto-MISS tracking
        if (n.note.isServiceCombo && n.note.serviceComboGroupId !== undefined) {
          const gid = n.note.serviceComboGroupId;
          const stats = this.serviceComboGroupHits.get(gid) ?? { hit: 0, seen: 0, total: 6 };
          stats.seen += 1;
          // auto-miss: don't increment hit
          this.serviceComboGroupHits.set(gid, stats);
          this.checkServiceComboGroupComplete(gid);
        }
        // Tint the note grey by overlaying a graphics rectangle — easiest approach
        // without touching the internal Container children directly.
        // (Full grey tint requires alpha; we keep it subtle so it's visible but faded.)
      }

      // Remove notes that have flown well past the hit line
      if (n.x < this.NOTE_HIT_X - 120) {
        n.destroy();
        this.rhythmNotes.splice(i, 1);
      }
    }
  }

  // ── Wave 6b: Rhythm input handling ──────────────────────────────────────

  /**
   * Called when the player presses a don (F/J) or ka (D/K) key, or taps a touch button.
   * Finds the nearest un-hit note of the matching type within the good window,
   * judges it, plays audio, and updates state / visuals.
   */
  private handleRhythmPress(type: NoteType): void {
    if (this.isDone || this.paused || this.isShowingGrillEvent || !this.rhythmStarted) return;

    const now = this.getRhythmTime();

    // FIFO judgement: only the FRONTMOST un-hit note within the good window
    // is eligible for scoring. Without this, a press could skip past an
    // about-to-MISS note and score on a later same-color note within the same
    // frame — the exact race that produces "PERFECT + MISS appearing together".
    let frontNote: RhythmNote | null = null;
    for (const n of this.rhythmNotes) {
      if (n.isHit) continue;
      // Notes still too far in the future haven't entered the press-eligible window
      if (n.note.t - now > JUDGE_WINDOWS.good) continue;
      frontNote = n;
      break;
    }

    if (!frontNote) {
      // No frontmost un-hit note in window — empty press, no penalty
      return;
    }

    if (frontNote.note.type !== type) {
      // Wrong key for the frontmost note: don't reach past it to score on a
      // later same-type note. No penalty, no feedback (no scolding).
      return;
    }

    const judgement = judgeHit(frontNote.note.t, now);
    if (judgement === null) {
      // Outside even the good window — auto-MISS handler will deal with it
      return;
    }

    frontNote.markHit();

    // Update stats and combo
    this.hitStats[judgement] += 1;
    this.rhythmCombo += 1;
    if (this.rhythmCombo > this.maxRhythmCombo) {
      this.maxRhythmCombo = this.rhythmCombo;
    }
    this.updateRhythmComboText();

    // Play drum hit sound (don/ka) simultaneously with judgement tone
    if (type === 'don') {
      sfx.playDon();
    } else {
      sfx.playKa();
    }

    // Play judgement tone
    if (judgement === 'perfect') {
      sfx.playRhythmPerfect();
    } else if (judgement === 'great') {
      sfx.playRhythmGreat();
    } else {
      sfx.playRhythmGood();
    }

    // Floating judgement text (音遊化大字)
    if (judgement === 'perfect') {
      this.showJudgementBig('PERFECT', '#ffd700', 48, 700);
    } else if (judgement === 'great') {
      this.showJudgementBig('GREAT', '#c0c0c0', 36, 600);
    } else {
      this.showJudgementBig('GOOD', '#cd7f32', 28, 500);
    }

    // Wave 6c: fly hit note into grill slot
    // Overflow queue: if no empty slot, sausage continues cooking internally and will
    // be placed on the next available slot (no longer treated as MISS).
    const slot = this.grillSlots.find(s => !s.sausage);

    // Capture for closures
    const hitNote = frontNote;
    const hitJudgement = judgement;

    if (slot) {
      // Normal path: fly note to slot then spawn sausage
      this.tweens.add({
        targets: hitNote,
        x: slot.x,
        y: slot.y,
        scaleX: 0.7,
        scaleY: 0.7,
        duration: 280,
        ease: 'Cubic.Out',
        onComplete: () => {
          if (hitNote.active) hitNote.destroy();
          const idx = this.rhythmNotes.indexOf(hitNote);
          if (idx >= 0) this.rhythmNotes.splice(idx, 1);
          this.spawnSausageOnSlot(slot, hitNote.note.sausage, hitJudgement as 'perfect' | 'great' | 'good');
        },
      });
    } else {
      // Overflow path: all slots occupied — create sausage and queue it
      const overflowSausage = createGrillingSausage(hitNote.note.sausage);
      (overflowSausage as GrillingSausage & { rhythmAccuracy?: string }).rhythmAccuracy =
        hitJudgement as 'perfect' | 'great' | 'good';
      this.overflowSausages.push({
        sausage: overflowSausage,
        sausageTypeId: hitNote.note.sausage,
        bornAt: this.time.now,
      });

      // Visual: fade note toward queue indicator (bottom-right)
      const queueX = this.scale.width - 60;
      const queueY = this.scale.height * 0.78;
      this.tweens.add({
        targets: hitNote,
        x: queueX,
        y: queueY,
        scaleX: 0.4,
        scaleY: 0.4,
        alpha: 0,
        duration: 400,
        ease: 'Cubic.Out',
        onComplete: () => {
          if (hitNote.active) hitNote.destroy();
          const idx = this.rhythmNotes.indexOf(hitNote);
          if (idx >= 0) this.rhythmNotes.splice(idx, 1);
        },
      });

      // Show "等待中" floating hint
      this.showFeedback(
        `+1 等待中 (${this.overflowSausages.length})`,
        this.NOTE_HIT_X,
        this.noteTrackY - 70,
        '#aaaaff',
      );
    }

    // ── Wave 6e: Service combo hit tracking ─────────────────────────────────
    this.trackServiceComboHit(frontNote, judgement);
  }

  /**
   * Wave 6e: Record a hit or miss for service combo notes.
   * When all notes in a group have been processed (seen == total), trigger batch serve.
   */
  private trackServiceComboHit(note: RhythmNote, judgement: HitJudgement): void {
    if (!note.note.isServiceCombo || note.note.serviceComboGroupId === undefined) return;
    const gid = note.note.serviceComboGroupId;
    const stats = this.serviceComboGroupHits.get(gid) ?? { hit: 0, seen: 0, total: 6 };
    stats.seen += 1;
    if (judgement !== 'miss') stats.hit += 1;
    this.serviceComboGroupHits.set(gid, stats);
    this.checkServiceComboGroupComplete(gid);
  }

  /**
   * Wave 6e: Check if all notes in a service combo group have been processed.
   * When seen >= total, fires triggerBatchServe once.
   */
  private checkServiceComboGroupComplete(gid: number): void {
    if (!this.chart) return;
    if (this.serviceComboBatchFired.has(gid)) return;

    const stats = this.serviceComboGroupHits.get(gid);
    if (!stats) return;

    if (stats.seen >= stats.total) {
      this.serviceComboBatchFired.add(gid);
      this.triggerBatchServe(stats.hit, stats.total);
    }
  }

  /**
   * Wave 6e: Batch serve from warming zone after a service combo group completes.
   * serveCount is determined by hitCount / totalNotes ratio.
   */
  private triggerBatchServe(hitCount: number, totalNotes: number): void {
    const ratio = hitCount / totalNotes;
    let serveCount = 0;
    if (ratio >= 0.83) serveCount = 5;       // 5/6 以上全中
    else if (ratio >= 0.5) serveCount = 3;   // 3–4/6
    else if (ratio >= 0.34) serveCount = 1;  // 2/6
    else serveCount = 0;                     // 0–1/6

    if (serveCount === 0) {
      this.showJudgementBig('服務失敗', '#888888', 24);
      return;
    }

    // Serve up to serveCount sausages from occupied warming slots
    const occupied = this.warmingSlots.filter(ws => ws.sausage);
    const toServe = occupied.slice(0, serveCount);
    for (const ws of toServe) {
      this.serveFromWarming(ws);
    }

    const served = toServe.length;
    if (served > 0) {
      this.showJudgementBig(`服務 ${served} 位客人！`, '#ffd700', 36);
    } else {
      // No sausages in warming zone
      this.showJudgementBig('保溫區空！', '#888888', 24);
    }
  }

  /**
   * Refreshes the combo counter display in the top-left corner.
   * Hides the text when combo < 2; shows + bounces it otherwise.
   */
  private updateRhythmComboText(): void {
    if (!this.rhythmComboText) return;
    if (this.rhythmCombo < 2) {
      this.rhythmComboText.setAlpha(0);
      return;
    }
    this.rhythmComboText
      .setText(`${this.rhythmCombo} COMBO`)
      .setAlpha(1)
      .setFontSize(Math.min(60, 32 + this.rhythmCombo));

    // Bounce tween for feedback
    this.tweens.add({
      targets: this.rhythmComboText,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 80,
      yoyo: true,
      ease: 'Back.Out',
    });
  }

  // ── Wave 6cd: BGM sync helpers ────────────────────────────────────────────

  /** Returns current rhythm clock in seconds (Web Audio API, μs precision). */
  private getRhythmTime(): number {
    if (!this.bgmCtx) return 0;
    if (this.bgmFinished) return this.bgmAudioBuffer?.duration ?? 0;
    if (this.bgmPaused) return this.bgmElapsedAtPause;
    return this.bgmCtx.currentTime - this.bgmStartCtxTime;
  }

  /**
   * Called when the tutorial overlay is dismissed.
   * Starts BGM via Web Audio API, enables rhythm clock, resets spawn index.
   */
  private startRhythmGame(): void {
    try {
      const sm = this.sound as unknown as { context?: AudioContext };
      if (!sm.context) {
        console.warn('[GrillScene] WebAudio context unavailable');
        return;
      }
      this.bgmCtx = sm.context;

      const cached = this.cache.audio.get('bgm-grill-theme') as unknown;
      if (!(cached instanceof AudioBuffer)) {
        console.warn('[GrillScene] bgm-grill-theme AudioBuffer not in cache');
        return;
      }
      this.bgmAudioBuffer = cached;

      this.bgmGain = this.bgmCtx.createGain();
      this.bgmGain.gain.value = 0.5;
      this.bgmGain.connect(this.bgmCtx.destination);

      this.bgmFinished = false;
      this.playBgmFromOffset(0);
    } catch (_e) {
      console.warn('[GrillScene] bgm start failed:', _e);
    }

    // Inject service combo notes into the chart before starting
    this.injectServiceComboNotes();

    this.rhythmStarted = true;
    this.nextNoteSpawnIdx = 0;
    this.rhythmNotes.forEach(n => { if (n.active) n.destroy(); });
    this.rhythmNotes = [];
    this.paused = false;
    EventBus.emit('scene-ready', 'GrillScene');
  }

  /**
   * Wave 6e: Inject service combo note groups (6 gold notes every 15 seconds)
   * into the chart after it loads, before the rhythm game begins.
   */
  private injectServiceComboNotes(): void {
    if (!this.chart) return;

    const SERVICE_INTERVAL = 15;      // seconds between service groups
    const SERVICE_NOTE_COUNT = 6;     // notes per group
    const SERVICE_NOTE_SPACING = 0.15; // seconds between notes in group
    const duration = this.chart.duration;

    const SERVICE_SAUSAGE_POOL = [
      'flying-fish-roe', 'cheese', 'big-taste', 'big-wrap-small', 'great-wall',
    ];

    const newNotes: ChartNote[] = [];
    let groupId = 0;

    for (let t = SERVICE_INTERVAL; t < duration - 5; t += SERVICE_INTERVAL) {
      for (let i = 0; i < SERVICE_NOTE_COUNT; i++) {
        const noteT = t + i * SERVICE_NOTE_SPACING;
        const noteType: NoteType = i % 2 === 0 ? 'don' : 'ka';
        const sausageType =
          SERVICE_SAUSAGE_POOL[Math.floor(Math.random() * SERVICE_SAUSAGE_POOL.length)];
        newNotes.push({
          t: noteT,
          type: noteType,
          sausage: sausageType,
          isServiceCombo: true,
          serviceComboGroupId: groupId,
        });
      }
      groupId++;
    }

    this.chart = {
      ...this.chart,
      notes: [...this.chart.notes, ...newNotes].sort((a, b) => a.t - b.t),
      totalNotes: this.chart.totalNotes + newNotes.length,
    };
    this.totalServiceComboGroupCount = groupId;
    // Initialize hit tracker for each group
    this.serviceComboGroupHits.clear();
    this.serviceComboBatchFired.clear();
  }

  /** Play BGM from given offset (seconds). Creates a fresh AudioBufferSourceNode. */
  private playBgmFromOffset(offset: number): void {
    if (!this.bgmCtx || !this.bgmAudioBuffer || !this.bgmGain) return;
    this.bgmSource = this.bgmCtx.createBufferSource();
    this.bgmSource.buffer = this.bgmAudioBuffer;
    this.bgmSource.connect(this.bgmGain);
    this.bgmSource.onended = () => {
      if (this.bgmPaused) return; // pause-induced stop, ignore
      this.bgmFinished = true;
      this.onChartComplete();
    };
    this.bgmStartCtxTime = this.bgmCtx.currentTime - offset;
    this.bgmElapsedAtPause = offset;
    this.bgmSource.start(0, offset);
    this.bgmPaused = false;
  }

  /** Pause BGM: record elapsed time, stop source. */
  private pauseBgm(): void {
    if (!this.bgmSource || this.bgmPaused) return;
    this.bgmElapsedAtPause = this.getRhythmTime();
    this.bgmPaused = true;
    // Detach onended so the natural stop doesn't fire onChartComplete
    this.bgmSource.onended = null;
    try { this.bgmSource.stop(); } catch (_e) { /* already stopped */ }
    this.bgmSource = null;
  }

  /** Resume BGM from where it was paused. */
  private resumeBgm(): void {
    if (!this.bgmPaused || this.bgmFinished) return;
    this.playBgmFromOffset(this.bgmElapsedAtPause);
  }

  /**
   * Called when BGM finishes playing (chart complete).
   * Waits 1 second buffer then triggers end-of-day.
   */
  private onChartComplete(): void {
    console.debug(
      `[GrillScene] Chart complete — serviceComboGroups: ${this.totalServiceComboGroupCount}`,
    );
    this.time.delayedCall(1000, () => {
      if (this.isDone) return;
      this.endGrilling();
    });
  }

  /**
   * Wave 6c: Spawn a GrillingSausage on a grill slot after a rhythm hit tween.
   * The sausage gets a rhythmAccuracy tag that drives auto-cook logic.
   */
  private spawnSausageOnSlot(
    slot: GrillSlot,
    sausageTypeId: string,
    accuracy: 'perfect' | 'great' | 'good',
  ): void {
    if (slot.sausage) return; // race condition guard

    // Remove placeholder
    this.clearSlotPlaceholder(slot);

    const sausage = createGrillingSausage(sausageTypeId);
    // Attach rhythm accuracy tag via direct property assignment
    (sausage as GrillingSausage & { rhythmAccuracy?: string }).rhythmAccuracy = accuracy;

    const sprite = new SausageSprite(this, slot.x, slot.y, sausage);
    const slotIndex = this.grillSlots.indexOf(slot);

    // Double-click still moves to warming zone (manual serve override)
    sprite.onClick(() => {
      const currentSlot = this.grillSlots.find(s => s.sprite === sprite);
      if (!currentSlot) return;
      const now = Date.now();
      const lastClickTime = currentSlot.__lastClickTime ?? 0;
      const isDoubleClick = (now - lastClickTime) < 350;
      if (isDoubleClick) {
        currentSlot.__lastClickTime = 0;
        if (currentSlot.sprite) this.moveToWarming(currentSlot, currentSlot.sprite);
      } else {
        currentSlot.__lastClickTime = now;
        // Single click on rhythm sausage: no manual flip (auto-managed)
      }
    });

    sprite.on('pointerover', () => { this.hoveredSlotIndex = slotIndex; });
    sprite.on('pointerout', () => { if (this.hoveredSlotIndex === slotIndex) this.hoveredSlotIndex = null; });

    slot.sausage = sausage;
    slot.sprite = sprite;
    slot.__carbonWarnShown = false;
    slot.__burntWarnShown = false;
    slot.__autoFlipped = false;
    slot.__flipPromptShown = false;
    slot.__flipCooldownUntil = 0;
    slot.__isPressingBtn = false;
  }

  /**
   * Wave 6e: Auto-move sausages that have reached their target doneness into the warming zone.
   * Two-stage serving: grill → warming (here), warming → customer (on service combo hit).
   */
  private autoServeReady(): void {
    for (const slot of this.grillSlots) {
      if (!slot.sausage || slot.sausage.served) continue;
      const s = slot.sausage;
      if (!s.rhythmAccuracy) continue;

      const target = getAutoGrillTarget(s.rhythmAccuracy);
      const avg = (s.topDoneness + s.bottomDoneness) / 2;
      if (avg < target - 2) continue;

      // Move to warming zone and wait there for service combo to trigger batch serve
      if (!slot.sprite) continue;
      this.moveToWarming(slot, slot.sprite);
      // After warming slot is filled, try to place an overflow sausage into the freed slot
      this.time.delayedCall(620, () => {
        if (this.isDone || !this.scene.isActive()) return;
        this.fillSlotFromOverflow(slot);
      });
    }
  }

  /**
   * If there's an overflow sausage waiting, place it onto the given (now empty) slot.
   * Preserves the sausage's existing doneness state.
   */
  private fillSlotFromOverflow(slot: GrillSlot): void {
    if (this.overflowSausages.length === 0) return;
    if (slot.sausage) return; // slot already occupied (race condition guard)
    const entry = this.overflowSausages.shift();
    if (!entry) return;
    this.placeSausageInSlot(slot, entry.sausage);
  }

  /**
   * Place an existing GrillingSausage onto a slot, creating the sprite.
   * Used by fillSlotFromOverflow to restore overflow sausages with existing doneness.
   */
  private placeSausageInSlot(slot: GrillSlot, sausage: GrillingSausage): void {
    if (slot.sausage) return; // race condition guard
    this.clearSlotPlaceholder(slot);

    const sprite = new SausageSprite(this, slot.x, slot.y, sausage);
    const slotIndex = this.grillSlots.indexOf(slot);

    sprite.onClick(() => {
      const currentSlot = this.grillSlots.find(s => s.sprite === sprite);
      if (!currentSlot) return;
      const now = Date.now();
      const lastClickTime = currentSlot.__lastClickTime ?? 0;
      const isDoubleClick = (now - lastClickTime) < 350;
      if (isDoubleClick) {
        currentSlot.__lastClickTime = 0;
        if (currentSlot.sprite) this.moveToWarming(currentSlot, currentSlot.sprite);
      } else {
        currentSlot.__lastClickTime = now;
      }
    });

    sprite.on('pointerover', () => { this.hoveredSlotIndex = slotIndex; });
    sprite.on('pointerout', () => { if (this.hoveredSlotIndex === slotIndex) this.hoveredSlotIndex = null; });

    slot.sausage = sausage;
    slot.sprite = sprite;
    slot.__carbonWarnShown = false;
    slot.__burntWarnShown = false;
    slot.__autoFlipped = false;
    slot.__flipPromptShown = false;
    slot.__flipCooldownUntil = 0;
    slot.__isPressingBtn = false;

    // Show brief "補位" indicator
    this.showFeedback('補位', slot.x, slot.y - 55, '#aaaaff');
  }

  /**
   * Tick all overflow sausages so they keep cooking while waiting for a slot.
   * No sprite updates needed (invisible queue).
   */
  private tickOverflowSausages(dt: number): void {
    for (const entry of this.overflowSausages) {
      entry.sausage = autoTickSausage(entry.sausage, dt);
    }
  }

  // ── Draw helpers ─────────────────────────────────────────────────────────

  private drawBackground(width: number, height: number): void {
    const bg = this.add.graphics();
    bg.fillGradientStyle(COLOR_BG_TOP, COLOR_BG_TOP, COLOR_BG_BTM, COLOR_BG_BTM, 1);
    bg.fillRect(0, 0, width, height);

    // Background image — very subtle, just atmosphere
    if (this.textures.exists('bg-grill')) {
      const bgImg = this.add.image(width / 2, height / 2, 'bg-grill');
      bgImg.setDisplaySize(width, height).setAlpha(0.12).setDepth(0);
      this.bgGrillImage = bgImg;
    }

    // NOTE: fire-flame and grill-mesh removed from here.
    // The programmatic grill rack (drawGrillRack) handles the visual.
    // Art images were causing z-order conflicts and covering sausages.

    // Warm glow around grill area
    const glowY = height * GRILL_Y_FRAC;
    const glow = this.add.graphics();
    glow.fillStyle(0xff4400, 0.05);
    glow.fillEllipse(width / 2, glowY, width * 0.85, 130);
  }

  private drawGrillRack(width: number, height: number): void {
    const grillY = height * GRILL_Y_FRAC + 34;
    // Grill rack centered on screen
    const maxSlots = gameState.upgrades['grill-expand'] ? 12 : MAX_GRILL_SLOTS;
    const rackW = 100 * maxSlots + 60;
    const barStartX = (width - rackW) / 2;
    const barEndX = barStartX + rackW;
    const barCount = 9;
    const barSpacing = 16;

    const rack = this.add.graphics();

    // Fire glow below rack (stored for update)
    this.fireGlowGfx = this.add.graphics();
    this.redrawFireGlow(barStartX, grillY + barCount * barSpacing, barEndX - barStartX);

    // Horizontal grill bars
    rack.lineStyle(4, 0x666666, 1);
    for (let i = 0; i < barCount; i++) {
      const y = grillY + i * barSpacing;
      rack.beginPath();
      rack.moveTo(barStartX, y);
      rack.lineTo(barEndX, y);
      rack.strokePath();
    }

    // Side rails
    rack.lineStyle(6, 0x555555, 1);
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

  private redrawFireGlow(_x: number, _y: number, _w: number): void {
    this.fireGlowGfx.clear();
    // Fire glow removed — was ugly colored block
  }

  private tickFireParticles(dt: number): void {
    // Fixed spawn interval (heatLevel removed post-Wave 6cd)
    const spawnInterval = 0.4;
    this.fireParticleTimer += dt;

    if (this.fireParticleTimer >= spawnInterval) {
      this.fireParticleTimer = 0;
      this.spawnFireParticle();
    }
  }

  private spawnFireParticle(): void {
    const { width, height } = this.scale;
    const fireBaseY = height * GRILL_Y_FRAC + 34 + 9 * 16; // bottom of rack
    const spawnX = width * 0.04 + Math.random() * (width * 0.61);
    const particle = this.add.text(spawnX, fireBaseY, '*', {
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
    const grillY = height * GRILL_Y_FRAC - 20;
    const slotSpacing = Math.max(70, Math.min(100, (width * 0.85) / slotCount));
    const totalW = slotSpacing * slotCount;
    const startX = (width - totalW) / 2 + slotSpacing / 2; // centered

    for (let i = 0; i < slotCount; i++) {
      const x = startX + i * slotSpacing;
      const slot: GrillSlot = { sprite: null, sausage: null, x, y: grillY, placeholderGfx: null, serveBtn: null, serveHint: null };
      this.grillSlots.push(slot);
      this.drawEmptySlotPlaceholder(slot);
    }
  }

  private addOneGrillSlot(): void {
    const { width, height } = this.scale;
    const grillY = height * GRILL_Y_FRAC - 20;
    const slotSpacing = 100;
    const slotCount = this.grillSlots.length + 1;
    const totalW = slotSpacing * slotCount;
    const startX = (width - totalW) / 2 + slotSpacing / 2;
    const i = this.grillSlots.length; // index of the new slot
    const x = startX + i * slotSpacing;
    const slot: GrillSlot = { sprite: null, sausage: null, x, y: grillY, placeholderGfx: null, serveBtn: null, serveHint: null };
    this.grillSlots.push(slot);
    this.drawEmptySlotPlaceholder(slot);
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

    // Wave 6c: manual placement removed — grill slots filled by rhythm hits only
    const hitZone = this.add.zone(slot.x, slot.y, 64, 84);

    // Store graphics in slot (zone needs to be tracked too — attach to graphics)
    const gfx = g as GrillSlotGraphics;
    gfx.__hitZone = hitZone;
    slot.placeholderGfx = gfx;
  }

  private clearSlotPlaceholder(slot: GrillSlot): void {
    if (slot.placeholderGfx) {
      const zone = slot.placeholderGfx.__hitZone;
      if (zone) zone.destroy();
      slot.placeholderGfx.destroy();
      slot.placeholderGfx = null;
    }
  }

  // Warming zone config (stored for dynamic slot creation)
  private wzX = 0;
  private wzY = 0;
  private wzSlotW = 0;
  private readonly wzSlotH = 28; // compact height

  private setupWarmingZone(width: number, height: number): void {
    this.wzSlotW = width * 0.5;               // 50% width, centered
    this.wzX = (width - this.wzSlotW) / 2;    // centered horizontally
    this.wzY = height * 0.62;                 // below heat buttons

    // Zone label
    this.add.text(this.wzX + this.wzSlotW / 2, this.wzY - 16, '保溫區（點擊出餐）', {
      fontSize: '11px',
      fontFamily: FONT,
      color: COLOR_DIM,
    }).setOrigin(0.5).setDepth(5);

    // Create initial 10 empty slots (5x2 grid)
    for (let i = 0; i < 10; i++) {
      this.createWarmingSlotVisual();
    }

  }

  private createWarmingSlotVisual(): WarmingSlot {
    const idx = this.warmingSlots.length;
    // 5x2 grid layout
    const col = idx % 5;
    const row = Math.floor(idx / 5);
    const slotW = this.wzSlotW / 5;
    const gap = 4;
    const sx = this.wzX + col * slotW;
    const sy = this.wzY + row * (this.wzSlotH + gap);
    const wx = sx + slotW / 2;
    const wy = sy + this.wzSlotH / 2;

    const bgGfx = this.add.graphics();
    bgGfx.lineStyle(1, 0x664422, 0.5);
    bgGfx.fillStyle(0x1a0800, 0.7);
    bgGfx.fillRoundedRect(sx, sy, slotW, this.wzSlotH, 3);
    bgGfx.strokeRoundedRect(sx, sy, slotW, this.wzSlotH, 3);

    const infoText = this.add.text(wx, wy, '', {
      fontSize: '9px',
      fontFamily: FONT,
      color: COLOR_DIM,
    }).setOrigin(0.5);

    const stateText = this.add.text(sx + slotW - 3, wy, '', {
      fontSize: '8px',
      fontFamily: FONT,
      color: '#888888',
    }).setOrigin(1, 0.5);

    const slot: WarmingSlot = { sausage: null, x: wx, y: wy, bgGfx, infoText, stateText };
    this.warmingSlots.push(slot);

    // Make clickable
    const hitZone = this.add.zone(wx, wy, slotW, this.wzSlotH).setInteractive({ cursor: 'pointer' });
    hitZone.on('pointerdown', () => this.serveFromWarming(slot));
    hitZone.on('pointerover', () => {
      if (slot.sausage && slot.bgGfx) {
        slot.bgGfx.clear();
        slot.bgGfx.lineStyle(2, 0xff9900, 0.9);
        slot.bgGfx.fillStyle(0x2a1000, 0.85);
        slot.bgGfx.fillRoundedRect(sx, sy, slotW, this.wzSlotH, 3);
        slot.bgGfx.strokeRoundedRect(sx, sy, slotW, this.wzSlotH, 3);
      }
    });
    hitZone.on('pointerout', () => {
      if (!slot.bgGfx) return;
      if (slot.sausage) {
        this.redrawWarmingSlotBgQuality(slot, sx, sy, slotW, this.wzSlotH);
      } else {
        this.redrawWarmingSlotBg(slot, sx, sy, slotW, this.wzSlotH);
      }
    });

    slot.__x = sx;
    slot.__y = sy;
    slot.__w = slotW;
    slot.__h = this.wzSlotH;

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

    // Primary text: quality + warming state
    slot.infoText.setText(`${overnightTag}${qualityLabel} | ${warmingLabel}`);
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
    const x = slot.__x ?? 0;
    const y = slot.__y ?? 0;
    const w = slot.__w ?? 0;
    const h = slot.__h ?? 0;
    this.redrawWarmingSlotBgQuality(slot, x, y, w, h);
  }

  private clearWarmingSlotDisplay(slot: WarmingSlot): void {
    if (slot.infoText) slot.infoText.setText('空');
    if (slot.stateText) slot.stateText.setText('');

    const x = slot.__x ?? 0;
    const y = slot.__y ?? 0;
    const w = slot.__w ?? 0;
    const h = slot.__h ?? 0;
    this.redrawWarmingSlotBg(slot, x, y, w, h);
  }

  private setupCustomerQueue(width: number, _height: number): void {
    const queueY = this.scale.height * 0.17;
    if (this.textures.exists('queue-bg')) {
      const qbg = this.add.image(width / 2, queueY, 'queue-bg');
      qbg.setDisplaySize(width, 100).setAlpha(0.5).setDepth(0);
    }
    // Center queue: 5 slots × 120px = 600px; offset by half to center on screen
    const queueX = Math.round(width / 2 - 300);
    this.customerQueue = new CustomerQueue(this, queueX, queueY);
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

    // Dismiss button — remove first customer in queue at cost of -1 reputation
    const dismissBtn = this.add.text(
      width - 10, queueY - 10,
      '趕走第一位',
      { fontSize: '12px', color: '#ff6666', backgroundColor: '#1a1a1a', padding: { x: 6, y: 3 } }
    ).setOrigin(1, 1).setInteractive({ useHandCursor: true }).setDepth(10);

    dismissBtn.on('pointerdown', () => {
      const next = this.customerQueue.getNextCustomer();
      if (!next) return;
      this.customerQueue.serveCustomer(next.id, false);
      this.customers = this.customers.filter(c => c.id !== next.id);
      changeReputation(-1);
      this.showFeedback('趕走了客人 聲望-1', this.scale.width / 2, queueY - 30, '#ff6666');
    });
  }

  private setupSpeedButtons(width: number, height: number): void {
    // Speed buttons at 80% screen height, left third of screen
    const btnY = height * 0.80;
    const speeds = [1, 2, 3];

    const btnW = 36;
    const btnH = 22;
    const gap = 5;
    const totalBtnW = speeds.length * btnW + (speeds.length - 1) * gap;
    // Left third of screen
    const startX = width * 0.05;

    speeds.forEach((spd, i) => {
      const bx = startX + i * (btnW + gap) + btnW / 2;
      const btn = this.createButton(bx, btnY, btnW, btnH, `${spd}x`, () => {
        this.speedMultiplier = spd;
        this.updateSpeedButtonStyles();
      });
      // Override font size to 11px
      const txtObj = btn.list[1] as Phaser.GameObjects.Text;
      txtObj.setFontSize('11px');
      this.speedButtons.push(btn);
    });

    this.updateSpeedButtonStyles();

    const centerX = startX + totalBtnW / 2;
    this.add.text(centerX, btnY - 14, '速度', {
      fontSize: '11px',
      fontFamily: FONT,
      color: COLOR_DIM,
    }).setOrigin(0.5);

  }

  private setupInventoryPanel(width: number, height: number): void {
    const panelY = height * 0.88;
    const panelH = height * 0.12;

    // Background
    const bg = this.add.graphics();
    bg.fillStyle(0x100500, 0.9);
    bg.lineStyle(1, 0xff6b00, 0.4);
    bg.fillRect(0, panelY, width, panelH);
    bg.strokeRect(0, panelY, width, panelH);
    bg.setDepth(9);

    this.add.text(10, panelY + 4, '庫存 — 點擊選擇，再點烤架空位放置', {
      fontSize: '13px',
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

    const btnW = 120;
    const btnH = 85;
    const gap = 8;
    const totalBtns = allItems.length;
    const totalW = totalBtns * btnW + (totalBtns - 1) * gap;
    let startX = Math.max(12, (width - totalW) / 2);

    const centerY = panelY + panelH / 2 + 8;

    allItems.forEach(({ id, qty, hasStock }) => {
      const bx = startX + btnW / 2;
      const info = SAUSAGE_MAP[id];

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

      // Show sausage art image in inventory button if available
      const textureKey = `sausage-${id}`;
      if (this.textures.exists(textureKey)) {
        const img = this.add.image(0, -18, textureKey);
        const imgScale = Math.min(90 / img.width, 58 / img.height);
        img.setScale(imgScale).setAlpha(hasStock ? 1 : 0.3);
        container.add(img);
      }

      const txt = this.add.text(0, 16, `×${qty}`, {
        fontSize: '20px',
        fontFamily: FONT,
        color: hasStock ? COLOR_ORANGE : '#442200',
        align: 'center',
      }).setOrigin(0.5);

      const nameTxt = this.add.text(0, 34, info?.name ?? id, {
        fontSize: '13px',
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
        }
        // No feedback when grill is full — player can always use rhythm system
      });

      container.add([bgGfx, txt, nameTxt, hitZone]);
      this.inventoryPanel.add(container);
      this.inventoryButtonMap.set(id, container);

      startX += btnW + gap;
    });
  }

  private updateInventoryDisplay(): void {
    const { width, height } = this.scale;
    const panelY = height * 0.88;
    const panelH = height * 0.12;
    this.rebuildInventoryButtons(width, panelY, panelH);
  }

  private updateInventoryButtonStyles(): void {
    this.inventoryButtonMap.forEach((container, id) => {
      const bgGfx = container.list[0] as Phaser.GameObjects.Graphics;
      const isSelected = this.selectedInventoryType === id;
      const qty = this.inventoryCopy[id] ?? 0;
      const hasStock = qty > 0;
      const btnW = 120;
      const btnH = 85;

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

  private setupHUD(width: number, _height: number): void {
    // ── Top left: timer ──────────────────────────────────────────────────
    this.timerText = this.add.text(16, 55, `${this.timeLeft}s`, {
      fontSize: '18px',
      fontFamily: FONT,
      color: '#ffcc44',
      stroke: '#000000',
      strokeThickness: 3,
    }).setDepth(10);

    // ── Top right: day / status ──────────────────────────────────────────
    this.add.text(width - 14, 14, `營業中 Day ${gameState.day}`, {
      fontSize: '15px',
      fontFamily: FONT,
      color: COLOR_ORANGE,
    }).setOrigin(1, 0).setDepth(10);

    // ── Price board — show today's prices like a real night market stall ──
    const priceEntries = Object.entries(gameState.prices)
      .filter(([id]) => gameState.unlockedSausages.includes(id))
      .map(([id, price]) => {
        const info = SAUSAGE_MAP[id];
        return info ? `${info.name} $${price}` : '';
      })
      .filter(Boolean);

    if (priceEntries.length > 0) {
      this.add.text(width / 2, 72, priceEntries.join('  '), {
        fontSize: '11px',
        fontFamily: FONT,
        color: '#ffcc44',
        backgroundColor: '#1a0800cc',
        padding: { x: 8, y: 3 },
      }).setOrigin(0.5, 0).setDepth(10);
    }

    // ── Top-right stats display ──────────────────────────────────────────
    const statsX = width - 10;
    const statsY = 55; // below the status bar

    this.statsText = this.add.text(statsX, statsY, '', {
      fontSize: '14px',
      fontFamily: FONT,
      color: '#ffffff',
      backgroundColor: '#000000aa',
      padding: { x: 8, y: 4 },
    }).setOrigin(1, 0).setDepth(15);

    this.revenueText = this.add.text(width / 2, statsY, '$0', {
      fontSize: '14px',
      fontFamily: FONT,
      color: COLOR_ORANGE,
    }).setOrigin(0.5, 0).setDepth(10);

    // ── Combo counter (hidden until combo >= 2) ──────────────────────────
    this.comboText = this.add.text(width / 2, 32, '', {
      fontSize: '16px',
      fontFamily: FONT,
      color: '#ffd700',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(100).setAlpha(0);
  }

  private setupEndButton(width: number, height: number): void {
    const btnW = 80;
    const btnH = 22;
    // Same row as speed buttons — centered
    const bx = width * 0.5;
    const by = height * 0.80;

    this.createButton(bx, by, btnW, btnH, '結束營業', () => {
      this.endGrilling();
    });

    // Restart button — right side of same row
    const restartBtn = this.add.text(width * 0.75, by, '重新開始', {
      fontSize: '12px', color: '#ff6666', backgroundColor: '#1a0a0a',
      padding: { x: 6, y: 3 }, fontFamily: FONT
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(10);
    restartBtn.on('pointerdown', () => {
      if (this.bgm) { this.bgm.stop(); this.bgm.destroy(); this.bgm = null; }
      // Full game state reset
      this.resetFullGameState();
      this.scene.start('BootScene');
    });
  }

  // ── Wave 4c: SpectatorCrowd setup ────────────────────────────────────────

  private setupSpectatorCrowd(width: number, height: number): void {
    // 放在烤台下方、暖盤區上方；避開現有 UI（暖盤在 height*0.62，結束按鈕在 height*0.80）
    // 選 height*0.76 作為中心，往下展開半圓形圍觀者
    const crowdX = width / 2;
    const crowdY = height * 0.76;

    this.spectatorCrowd = new SpectatorCrowd(this, crowdX, crowdY);
    this.spectatorCrowd.setDepth(5); // 在 HUD 下、香腸上

    // 注目度數字：右上角（statsText 下方，避免重疊）
    const pressX = width - 10;
    const pressY = 90; // statsText 在 y=55，這裡往下放
    this.pressureLevelText = this.add.text(pressX, pressY, '注目 0.0', {
      fontSize: '13px',
      fontFamily: FONT,
      color: '#888888',
      backgroundColor: '#000000aa',
      padding: { x: 6, y: 3 },
    }).setOrigin(1, 0).setDepth(15);
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
    // Use slot-based traffic: playerSlot (1-9) maps to GRID_SLOTS by tier
    const playerSlotData = GRID_SLOTS.find(s => s.tier === gameState.playerSlot) ?? GRID_SLOTS[0];
    const baseTraffic = playerSlotData.baseTraffic * playerSlotData.trafficMultiplier;
    // baseTraffic 30-80 (×multiplier) → divide by 20 → 1.5-4.0 range
    const rawTraffic = baseTraffic / 20;
    const trafficNorm = Math.max(1, Math.min(5, rawTraffic));

    const socialPrepBonus = gameState.morningPrep === 'social' ? 0.1 : 0;
    const marketingBonus = (gameState.upgrades['neon-sign'] ? 0.15 : 0) + (gameState.dailyTrafficBonus ?? 0) + socialPrepBonus;
    updateGameState({ dailyTrafficBonus: 0 });
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
    slot.__flipPromptShown = false;
    this.showFeedback('翻面！', slot.x, slot.y + 35, '#ffcc44');
  }

  // ── Wave 4b: interaction buttons ─────────────────────────────────────────

  /** Wave 6c: flip/press/oil interaction buttons removed. This method is now a no-op. */
  private buildSlotInteractionBtns(_slot: GrillSlot): void {
    // Intentionally empty — manual interaction zones removed in Wave 6c
  }

  /** 銷毀 slot 上所有 Wave 4b 互動按鈕 */
  private destroySlotInteractionBtns(slot: GrillSlot): void {
    if (slot.flipBtn) { slot.flipBtn.destroy(); slot.flipBtn = null; }
    if (slot.pressBtn) { slot.pressBtn.destroy(); slot.pressBtn = null; }
    if (slot.oilBtn) { slot.oilBtn.destroy(); slot.oilBtn = null; }
    slot.__isPressingBtn = false;
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
              this.showFeedback('阿迪在滑手機...', target.x, target.y - 40, '#aaaaff');
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
            this.showFeedback('小妹偷吃了一根香腸...', this.scale.width * 0.70 + this.wzSlotW / 2, target.y, '#ff88cc');
          }
        }
      }
    }
  }

  // ── Combat trigger ────────────────────────────────────────────────────────

  private triggerCombat(customer: Customer): void {
    this.paused = true;

    // Show pre-combat notification
    this.showFeedback(
      '麻煩來了！',
      this.scale.width / 2,
      this.scale.height * 0.25,
      '#ff4444',
    );

    // Show splash FIRST, then open combat panel after it fades
    if (this.textures.exists('karen-alert')) {
      const w = this.scale.width;
      const h = this.scale.height;
      const alert = this.add.image(w / 2, h / 2, 'karen-alert').setDepth(45);
      const maxW = w * 0.7;
      const maxH = h * 0.55;
      const scale = Math.min(maxW / alert.width, maxH / alert.height);
      alert.setScale(0).setAlpha(0);

      // Punch-in animation
      this.tweens.add({
        targets: alert,
        scale: { from: 0, to: scale },
        alpha: { from: 0, to: 1 },
        duration: 300,
        ease: 'Back.Out',
      });

      // After 1.5s, slow dissolve and THEN open combat panel
      this.time.delayedCall(1500, () => {
        if (this.isDone || !this.scene.isActive()) return;
        this.tweens.add({
          targets: alert,
          alpha: 0,
          duration: 1200,
          ease: 'Power2',
          onComplete: () => {
            alert.destroy();
            if (this.isDone || !this.scene.isActive()) return;
            this.openCombatPanel(customer);
          },
        });
      });
    } else {
      // No image, open panel immediately
      this.openCombatPanel(customer);
    }
  }

  private openCombatPanel(customer: Customer): void {
    const witnessCount = Math.floor(Math.random() * 5); // 0-4

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

    EventBus.off('combat-done');
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
        addChaos(result.chaosPoints, `戰鬥後果`);
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
      this.showFeedback('旺財衝出去把他們嚇跑了！', this.scale.width / 2, this.scale.height * 0.35, '#ffcc44');
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
    this.pauseBgm();
    const { width: w, height: h } = this.scale;

    const eventImageMap: Record<string, string> = {
      'nuisance': 'karen-alert',
      'thug': 'karen-alert',
      'beggar': 'karen-alert',
      'authority': 'karen-alert',
    };

    const splashKey = eventImageMap[event.category];
    if (splashKey && this.textures.exists(splashKey)) {
      // Show character splash with SHAKE + ZOOM animation (no black overlay)
      const splash = this.add.image(w / 2, h / 2, splashKey).setDepth(300);
      const maxScale = Math.min((w * 0.7) / splash.width, (h * 0.55) / splash.height);
      splash.setScale(0).setAlpha(0);

      // Zoom in
      this.tweens.add({
        targets: splash,
        scale: { from: 0, to: maxScale },
        alpha: { from: 0, to: 1 },
        duration: 250,
        ease: 'Back.Out',
        onComplete: () => {
          // SHAKE animation
          this.cameras.main.shake(300, 0.015);

          // After shake, slow dissolve, then show panel
          this.time.delayedCall(1200, () => {
            if (this.isDone || !this.scene.isActive()) return;
            this.tweens.add({
              targets: splash,
              alpha: 0,
              duration: 1200,
              ease: 'Power2',
              onComplete: () => {
                splash.destroy();
                if (this.isDone || !this.scene.isActive()) return;
                this.buildGrillEventPanel(event);
              },
            });
          });
        },
      });
    } else {
      // No splash image, show panel directly
      this.buildGrillEventPanel(event);
    }
  }

  private buildGrillEventPanel(event: GrillEvent): void {
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

    // Event name
    const headerTxt = this.add.text(cx, panelY + 22, event.name, {
      fontSize: '22px',
      fontFamily: FONT,
      color: '#ffcc44',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    container.add(headerTxt);

    // Description (no inline image — splash already showed it)
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

      const btnTxt = this.add.text(cx, by + btnH / 2, choice.text, {
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
          if (this.isDone || !this.scene.isActive()) return;
          capturedSlot.sausage = null;
          this.drawEmptySlotPlaceholder(capturedSlot);
        });
        removed++;
      }
    }

    if (fx.extraSlot) {
      this.addOneGrillSlot();
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

    const dismissGrillEvent = () => {
      if (!this.grillEventOverlay) return;
      container.destroy();
      this.grillEventOverlay = null;
      this.isShowingGrillEvent = false;
      this.resumeBgm();
    };

    dismissZone.on('pointerdown', dismissGrillEvent);
    container.add(dismissZone);

    // Keyboard backup: ESC or Enter to dismiss
    this.input.keyboard!.once('keydown-ESC', dismissGrillEvent);
    this.input.keyboard!.once('keydown-ENTER', dismissGrillEvent);
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
      const lastClickTime = currentSlot.__lastClickTime ?? 0;
      const isDoubleClick = (now - lastClickTime) < 350;
      if (isDoubleClick) {
        currentSlot.__lastClickTime = 0;
        if (currentSlot.sprite) this.moveToWarming(currentSlot, currentSlot.sprite);
      } else {
        currentSlot.__lastClickTime = now;
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
    slot.__carbonWarnShown = false;
    slot.__burntWarnShown = false;
    slot.__autoFlipped = false;
    slot.__flipPromptShown = false;
    slot.__flipCooldownUntil = 0;
    slot.__isPressingBtn = false;

    // Wave 4b: build interaction buttons for this slot
    this.buildSlotInteractionBtns(slot);

    // Reset selection and update inventory display
    this.selectedInventoryType = null;
    this.updateInventoryDisplay();
    this.updateInventoryButtonStyles();
  }

  // Move a ready sausage from grill to warming zone
  private moveToWarming(slot: GrillSlot, sprite: SausageSprite): void {
    if (!slot.sausage || slot.sausage.served) return;

    const quality = judgeQuality(slot.sausage, gameState.gameMode === 'simulation') as GrillQuality;

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

    // Wave 4b: compute interaction metrics before clearing slot.sausage
    const grillingSausage = slot.sausage;
    const diffAbs = Math.abs(grillingSausage.topDoneness - grillingSausage.bottomDoneness);
    const unevenPenalty = diffAbs > 35;
    const oilBrushedFlag = grillingSausage.oilBrushed;

    // Flip-count warning (not a penalty — just feedback)
    if (grillingSausage.flipCount < 2) {
      this.showFeedback('翻面不足', slot.x, slot.y - 65, '#ffaa44');
    }

    const warmingSausage: WarmingSausage = {
      id: grillingSausage.id,
      sausageTypeId: grillingSausage.sausageTypeId,
      grillQuality: quality,
      qualityScore: getQualityScore(quality),
      timeInWarming: 0,
      warmingState: 'perfect-warm',
      isOvernight: false,
      unevenPenalty,
      oilBrushed: oilBrushedFlag,
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

    // Wave 4b: clean up interaction buttons
    this.destroySlotInteractionBtns(slot);

    // Animate sausage sprite flying to warming zone
    slot.sausage = { ...slot.sausage, served: true };
    slot.sprite = null;
    sprite.playServeAnimation(emptyWarmSlot.x, emptyWarmSlot.y);

    // Redraw empty placeholder for this grill slot
    this.time.delayedCall(580, () => {
      if (this.isDone || !this.scene.isActive()) return;
      slot.sausage = null;
      this.drawEmptySlotPlaceholder(slot);
      this.updateStatsDisplay();
    });

    this.showFeedback('起鍋！', slot.x, slot.y - 40, '#ffcc44');
  }

  // Serve from warming zone — Wave 6c: condiment station removed, auto-serve directly
  private serveFromWarming(warmSlot: WarmingSlot): void {
    if (!warmSlot.sausage) return;

    // Find best matching customer
    const nextCustomer = this.findMatchingCustomer(warmSlot.sausage);
    if (!nextCustomer) {
      this.showFeedback('沒有客人在等！', warmSlot.x, warmSlot.y - 50, '#888888');
      return;
    }

    // appliedGarlic is always true (Wave 6c: condiment scoring simplified)
    this.appliedGarlic = true;
    this.finalizeServe(warmSlot, warmSlot.sausage, nextCustomer);
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
    // Apply practice bonus: 'ok' quality has 50% chance to be treated as 'perfect'
    let grillQuality = ws.grillQuality as GrillQuality;
    if (gameState.morningPrep === 'practice' && grillQuality === 'ok' && Math.random() < 0.5) {
      grillQuality = 'perfect';
      this.showFeedback('練習加成！', warmSlot.x, warmSlot.y - 70, '#88ffcc');
    }

    // Calculate warming multiplier
    let warmMultiplier = 1.2;
    if (ws.warmingState === 'ok-warm') warmMultiplier = 1.0;
    if (ws.warmingState === 'cold') warmMultiplier = 0.7;

    const sausageId = ws.sausageTypeId;
    // Price = player's set price (already on the price board, customer saw it before queuing)
    const basePrice = gameState.prices[sausageId] ?? SAUSAGE_MAP[sausageId]?.suggestedPrice ?? 35;
    // Apply black market item bonus (auto-use best available)
    let bmBonus = 0;
    for (const bmItem of BLACK_MARKET_ITEMS) {
      const result = useBlackMarketItem(bmItem.id);
      if (result.used) {
        bmBonus += result.qualityBonus;
        this.showFeedback(`使用${bmItem.name}`, warmSlot.x, warmSlot.y - 70, '#ff4444');
        break; // use one per serve
      }
    }
    const finalQualityScore = (ws.qualityScore + bmBonus) * warmMultiplier;
    let effectivePrice = basePrice;

    // If customer is VIP (fatcat), double the effective price
    if (nextCustomer.isVIP) {
      effectivePrice = basePrice * 2;
      this.showFeedback('冤大頭付了雙倍！', warmSlot.x, warmSlot.y - 60, '#ffcc00');
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

    // ── Combo system ────────────────────────────────────────────────────────
    const directPrevCombo = this.perfectCombo;
    const directComboMultiplier = this.handleCombo(ws.grillQuality, warmSlot.x, warmSlot.y);

    if (this.perfectCombo === 5 || this.perfectCombo === 3) {
      this.triggerComboMilestone(this.perfectCombo, warmSlot.x, warmSlot.y);
    } else if (this.perfectCombo >= 2 && this.perfectCombo !== directPrevCombo) {
      if (this.perfectCombo !== 3 && this.perfectCombo !== 5) {
        this.showFeedback(`Combo x${this.perfectCombo}!`, warmSlot.x, warmSlot.y - 65, '#ffd700');
      }
    }

    const directComboBonus = directComboMultiplier > 1.0 ? Math.round(price * (directComboMultiplier - 1.0)) : 0;
    if (directComboBonus > 0) {
      addMoney(directComboBonus);
      this.sessionRevenue += directComboBonus;
    }

    // ── Perfect serve visuals ────────────────────────────────────────────
    if (ws.grillQuality === 'perfect') {
      this.showFeedback('完美!', warmSlot.x, warmSlot.y - 50, '#ffd700');
      this.flashGrillSlotGold(warmSlot.x, warmSlot.y);
      this.shakeCamera(0.005, 100);
      // High-difficulty sausage special cutscenes
      if (sausageId === 'cheese') this.triggerCheeseExplosion(warmSlot.x, warmSlot.y);
      else if (sausageId === 'great-wall') this.triggerGreatWallSpectacle(warmSlot.x, warmSlot.y);
    }

    // ── Carbonized serve visuals ─────────────────────────────────────────
    if (ws.grillQuality === 'carbonized') {
      this.flashScreenDark();
    }

    // ── Customer reaction bubble ─────────────────────────────────────────
    this.time.delayedCall(300, () => this.showCustomerReactionBubble(ws.grillQuality));

    // Capture tip multiplier before decrementing (for this serve)
    const directTipMultiplier = this.tipMultiplierServesLeft > 0 ? this.activeTipMultiplier : 1;
    if (this.tipMultiplierServesLeft > 0) {
      this.tipMultiplierServesLeft--;
      if (this.tipMultiplierServesLeft <= 0) {
        this.activeTipMultiplier = 1;
      }
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
        tipAmount = Math.round((5 + Math.floor(Math.random() * 11)) * directTipMultiplier);
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

    // Score order + loyalty (Mei never adds garlic)
    const order = nextCustomer.order || { sausageType: ws.sausageTypeId, wantGarlic: false };
    const patienceRatio = this.customerQueue.getCustomerPatienceRatio?.(nextCustomer.id) ?? 0.5;
    const meiScore = scoreOrder(ws, order, false, patienceRatio, nextCustomer.loyaltyBadge || 'none', basePrice);
    if (nextCustomer.loyaltyId) {
      recordVisit(nextCustomer.loyaltyId, meiScore.stars);
    }
    const scores = [...(gameState.dailyOrderScores || []), meiScore];
    updateGameState({ dailyOrderScores: scores });

    // Clear warming slot
    warmSlot.sausage = null;
    this.clearWarmingSlotDisplay(warmSlot);

    // 碎碎念觸發：品質差時
    if (grillQuality === 'carbonized' || grillQuality === 'burnt') {
      this.time.delayedCall(800, () => this.showCustomerComment('burnt'));
    } else if (grillQuality === 'raw' || grillQuality === 'half-cooked') {
      this.time.delayedCall(800, () => this.showCustomerComment('raw'));
    }

    // Check for special sausage effect
    const directEffect = getSpecialEffect(ws.sausageTypeId);
    if (directEffect) {
      this.applySpecialEffect(directEffect, ws.sausageTypeId);
    }

    this.updateStatsDisplay();
  }

  // ── Condiment station ─────────────────────────────────────────────────────

  private findMatchingCustomer(sausage: WarmingSausage): Customer | null {
    if (!this.customerQueue) return null;

    const waiting = this.customerQueue.getWaitingCustomers();

    // Priority 1: customer whose order matches this sausage type
    const typeMatch = waiting.find((c: Customer) => c.order?.sausageType === sausage.sausageTypeId);
    if (typeMatch) return typeMatch;

    // Priority 2: any waiting customer (type mismatch handled in scoring)
    const anyCustomer = this.customerQueue.getNextCustomer();
    return anyCustomer || null;
  }

  // openCondimentStation removed in Wave 6c — condiment scoring fixed, garlic always applied

  private finalizeServe(warmSlot: WarmingSlot, sausage: WarmingSausage, customer: Customer): void {
    // Wave 6c: condiment overlay removed — nothing to close here

    // Calculate patience ratio
    const patienceRatio = Math.max(0, Math.min(1,
      this.customerQueue.getCustomerPatienceRatio(customer.id) ?? 0.5
    ));

    // Base price
    const price = gameState.prices?.[sausage.sausageTypeId] ?? 35;

    // Score the order
    const order = customer.order || { sausageType: sausage.sausageTypeId, wantGarlic: false };
    const score = scoreOrder(
      sausage,
      order,
      this.appliedGarlic,
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

    // Apply black market item bonus (auto-use best available)
    let bmBonus = 0;
    for (const bmItem of BLACK_MARKET_ITEMS) {
      const result = useBlackMarketItem(bmItem.id);
      if (result.used) {
        bmBonus += result.qualityBonus;
        break;
      }
    }
    const finalQuality = sausage.qualityScore + bmBonus;

    // Sell the sausage (deduct inventory, update economy)
    const record = sellSausage(sausage.sausageTypeId, effectivePrice, finalQuality);
    if (record) {
      this.salesLog.push(record);
    }

    // Apply practice bonus: 'ok' quality has 50% chance to be treated as 'perfect'
    let effectiveGrillQuality = sausage.grillQuality as GrillQuality;
    if (gameState.morningPrep === 'practice' && effectiveGrillQuality === 'ok' && Math.random() < 0.5) {
      effectiveGrillQuality = 'perfect';
      this.showFeedback('練習加成！', warmSlot.x, warmSlot.y - 70, '#88ffcc');
    }

    // Track grill quality stats
    const grillQuality = effectiveGrillQuality as keyof typeof this.grillStats;
    if (grillQuality in this.grillStats) {
      (this.grillStats as Record<string, number>)[grillQuality]++;
    }

    // ── Combo system ────────────────────────────────────────────────────────
    const prevCombo = this.perfectCombo;
    const comboMultiplier = this.handleCombo(effectiveGrillQuality, warmSlot.x, warmSlot.y);

    // Trigger milestone effects when thresholds are first crossed
    if (this.perfectCombo === 5 || this.perfectCombo === 3) {
      this.triggerComboMilestone(this.perfectCombo, warmSlot.x, warmSlot.y);
    } else if (this.perfectCombo >= 2 && this.perfectCombo !== prevCombo) {
      // Show combo count text for combos other than the milestone numbers
      if (this.perfectCombo !== 3 && this.perfectCombo !== 5) {
        this.showFeedback(`Combo x${this.perfectCombo}!`, warmSlot.x, warmSlot.y - 65, '#ffd700');
      }
    }

    // Apply combo revenue bonus (addMoney on top of the base sale)
    const comboBonus = comboMultiplier > 1.0 ? Math.round(effectivePrice * (comboMultiplier - 1.0)) : 0;
    if (comboBonus > 0) {
      addMoney(comboBonus);
      this.sessionRevenue += comboBonus;
    }

    // ── Perfect serve visuals ────────────────────────────────────────────
    if (effectiveGrillQuality === 'perfect') {
      this.showFeedback('完美!', warmSlot.x, warmSlot.y - 50, '#ffd700');
      this.flashGrillSlotGold(warmSlot.x, warmSlot.y);
      this.shakeCamera(0.005, 100);
      // High-difficulty sausage special cutscenes
      if (sausage.sausageTypeId === 'cheese') this.triggerCheeseExplosion(warmSlot.x, warmSlot.y);
      else if (sausage.sausageTypeId === 'great-wall') this.triggerGreatWallSpectacle(warmSlot.x, warmSlot.y);
      // Wave 4c: 通知圍觀者
      this.spectatorCrowd.reactToStage('perfect-served');
    }

    // ── Carbonized serve visuals ─────────────────────────────────────────
    if (effectiveGrillQuality === 'carbonized') {
      this.flashScreenDark();
      // Wave 4c: 通知圍觀者
      this.spectatorCrowd.reactToStage('carbonized-served');
    }

    // Apply active tip multiplier from special sausage effect
    if (this.tipMultiplierServesLeft > 0) {
      score.tipAmount = Math.round(score.tipAmount * this.activeTipMultiplier);
      this.tipMultiplierServesLeft--;
      if (this.tipMultiplierServesLeft <= 0) {
        this.activeTipMultiplier = 1;
      }
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

    // ── Customer reaction bubble ─────────────────────────────────────────
    this.time.delayedCall(300, () => this.showCustomerReactionBubble(effectiveGrillQuality));

    // 碎碎念觸發：品質差時
    if (grillQuality === 'carbonized' || grillQuality === 'burnt') {
      this.time.delayedCall(800, () => this.showCustomerComment('burnt'));
    } else if (grillQuality === 'raw' || grillQuality === 'half-cooked') {
      this.time.delayedCall(800, () => this.showCustomerComment('raw'));
    }

    // Check for special sausage effect
    const finalizeEffect = getSpecialEffect(sausage.sausageTypeId);
    if (finalizeEffect) {
      this.applySpecialEffect(finalizeEffect, sausage.sausageTypeId);
    }

    // Reset garlic toggle for next serve
    this.appliedGarlic = false;
  }

  private showScorePopup(score: OrderScore, typeMatch: boolean, isVIP?: boolean): void {

    // Compact popup in top-left corner, not blocking grill
    const popup = this.add.container(8, 80).setDepth(25);

    const bg = this.add.rectangle(75, 40, 155, 80, 0x111122, 0.9)
      .setStrokeStyle(1, getScoreColor(score.totalScore));
    popup.add(bg);

    // Stars + total on one line
    const starsLine = this.add.text(75, 18, `${starsToString(score.stars)} ${score.totalScore}分`, {
      fontSize: '14px', color: '#ffcc00', fontFamily: FONT
    }).setOrigin(0.5);
    popup.add(starsLine);

    // Tip
    const tipLine = this.add.text(75, 38, `小費 $${score.tipAmount}${isVIP ? ' VIP!' : ''}${!typeMatch ? ' 送錯!' : ''}`, {
      fontSize: '12px', color: '#44ff44', fontFamily: FONT
    }).setOrigin(0.5);
    popup.add(tipLine);

    // Mini breakdown
    const detail = this.add.text(75, 56, `烤${score.grillScore} 料${score.condimentScore} 溫${score.warmingScore} 等${score.waitScore}`, {
      fontSize: '10px', color: '#888888', fontFamily: FONT
    }).setOrigin(0.5);
    popup.add(detail);

    // Auto-dismiss after 1.5 seconds
    this.time.delayedCall(1500, () => { if (this.isDone || !this.scene.isActive()) return; if (popup.active) popup.destroy(); });
  }

  // ── Customer commentary & counter-attack ─────────────────────────────────

  private tickCustomerCommentary(dt: number): void {
    if (this.isDone || this.paused) return;
    if (this.counterAttackPanel) return; // 正在顯示反擊面板，不要生成新的

    this.lastCommentTime += dt;
    if (this.lastCommentTime < 5) return; // 每 5 秒最多一次
    this.lastCommentTime = 0;

    // 取得在排隊的客人數
    const waitingCount = this.customers.length;
    if (waitingCount === 0) return;

    // 檢查慢服務：排隊 ≥ 2 人且烤架 + 保溫區都空
    const grillEmpty = this.grillSlots.every(s => !s.sausage);
    const warmingEmpty = this.warmingSlots.every(s => !s.sausage);

    if (waitingCount >= 2 && grillEmpty && warmingEmpty) {
      this.slowServiceTimer += 5;
      if (this.slowServiceTimer >= 10) { // 累計 10 秒空攤
        this.showCustomerComment('slow');
        return;
      }
    } else {
      this.slowServiceTimer = Math.max(0, this.slowServiceTimer - 2);
    }

    // 排隊人數 ≥ 3 時偶爾觸發不耐煩
    if (waitingCount >= 3 && Math.random() < 0.3) {
      this.showCustomerComment('impatient');
      return;
    }
  }

  private showCustomerComment(category: keyof typeof CUSTOMER_COMMENTS): void {
    // 移除舊氣泡
    if (this.commentBubble?.active) {
      this.commentBubble.destroy();
      this.commentBubble = null;
    }

    const lines = CUSTOMER_COMMENTS[category];
    const line = lines[Math.floor(Math.random() * lines.length)];

    // 客人排隊區域大概在 height * 0.17
    const queueY = this.scale.height * 0.17;
    const bubbleX = this.scale.width / 2 + Math.random() * 100 - 50;
    const bubbleY = queueY - 45;

    this.commentBubble = this.add.text(bubbleX, bubbleY, `「${line}」`, {
      fontSize: '14px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#ffffff',
      backgroundColor: '#333333dd',
      padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setDepth(50);

    // 淡出動畫
    this.tweens.add({
      targets: this.commentBubble,
      y: bubbleY - 20,
      alpha: { from: 1, to: 0 },
      duration: 3000,
      ease: 'Power1',
      onComplete: () => {
        if (this.commentBubble?.active) {
          this.commentBubble.destroy();
          this.commentBubble = null;
        }
      },
    });

    // 50% 機率觸發反擊面板
    if (Math.random() < 0.5) {
      this.time.delayedCall(500, () => {
        this.showCounterAttackPanel();
      });
    }
  }

  private showCounterAttackPanel(): void {
    if (this.counterAttackPanel) return;

    const { width, height } = this.scale;
    const panelW = 280;
    const panelH = 120;
    const px = width / 2;
    const py = height * 0.45;

    this.counterAttackPanel = this.add.container(px, py).setDepth(100);
    this.paused = true; // 暫停烤制

    // 背景
    const bg = this.add.graphics();
    bg.fillStyle(0x1a0a0a, 0.95);
    bg.lineStyle(2, 0xff4444, 0.8);
    bg.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 8);
    bg.strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 8);
    this.counterAttackPanel.add(bg);

    // 標題
    const title = this.add.text(0, -panelH / 2 + 16, '被客人激怒了！要反擊嗎？', {
      fontSize: '13px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#ff6666',
    }).setOrigin(0.5);
    this.counterAttackPanel.add(title);

    // 按鈕
    COUNTER_ATTACKS.forEach((atk, i) => {
      const btnY = -10 + i * 32;
      const btn = this.add.text(0, btnY, `${atk.label}（${atk.description}）`, {
        fontSize: '12px',
        fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
        color: '#ffcc00',
        backgroundColor: '#2a1a0a',
        padding: { x: 10, y: 4 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      btn.on('pointerover', () => btn.setColor('#ffffff'));
      btn.on('pointerout', () => btn.setColor('#ffcc00'));
      btn.on('pointerdown', () => {
        this.executeCounterAttack(atk);
      });

      this.counterAttackPanel!.add(btn);
    });

    // 忍住按鈕
    const ignoreBtn = this.add.text(0, panelH / 2 - 18, '算了，忍一下', {
      fontSize: '11px',
      color: '#888888',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    ignoreBtn.on('pointerdown', () => this.dismissCounterAttack());
    this.counterAttackPanel.add(ignoreBtn);

    // 5 秒自動關閉
    this.time.delayedCall(5000, () => this.dismissCounterAttack());
  }

  private executeCounterAttack(atk: typeof COUNTER_ATTACKS[0]): void {
    // 扣錢 + 聲望
    if (atk.moneyPenalty > 0) {
      spendMoney(atk.moneyPenalty);
    }
    if (atk.repPenalty > 0) {
      changeReputation(-atk.repPenalty);
    }
    if (atk.chaosPoints > 0) {
      addChaos(atk.chaosPoints, `反擊客人：${atk.label}`);
    }

    // 趕走第一個排隊客人
    const next = this.customerQueue.getNextCustomer();
    if (next) {
      this.customerQueue.serveCustomer(next.id, false);
      this.customers = this.customers.filter(c => c.id !== next.id);
    }

    this.showFeedback(atk.feedback, this.scale.width / 2, this.scale.height * 0.25, atk.feedbackColor);
    this.dismissCounterAttack();
  }

  private dismissCounterAttack(): void {
    if (this.counterAttackPanel) {
      this.counterAttackPanel.destroy();
      this.counterAttackPanel = null;
    }
    this.paused = false;
  }

  private onCustomerTimeout(customerId: string): void {
    sfx.playCustomerLeave();
    changeReputation(-1);
    this.customers = this.customers.filter(c => c.id !== customerId);
    this.showFeedback('-1 聲望', 80, this.scale.height * 0.13, '#ff4444');
  }

  // ── Special sausage effect application ───────────────────────────────────

  private applySpecialEffect(effect: SpecialEffectResult, sausageId?: string): void {
    // Show main feedback text
    this.showFeedback(effect.feedbackText, this.scale.width / 2, this.scale.height / 2 - 30, '#ffcc00');

    // 大嚐莖: +1 customer to pending queue + extra loyalty star
    if (sausageId === 'big-taste' && this.pendingCustomerQueue.length > 0) {
      // Move 1 extra customer from pending to active (instant arrival)
      const bonus = this.pendingCustomerQueue.shift();
      if (bonus) {
        this.customerQueue.addCustomer(bonus);
        this.customers.push(bonus);
      }
    }

    // 萬里腸城: +2 customers from pending queue
    if (sausageId === 'great-wall') {
      for (let i = 0; i < 2; i++) {
        const bonus = this.pendingCustomerQueue.shift();
        if (bonus) {
          this.customerQueue.addCustomer(bonus);
          this.customers.push(bonus);
        }
      }
    }

    // Scare customers out of queue
    if (effect.scareCount && effect.scareCount > 0) {
      const waiting = this.customerQueue.getWaitingCustomers();
      let scared = 0;
      for (const cust of waiting) {
        if (scared >= effect.scareCount) break;
        if (effect.scareSpecialOnly && cust.personality === 'normal') continue;
        this.customerQueue.serveCustomer(cust.id, false);
        this.customers = this.customers.filter(c => c.id !== cust.id);
        scared++;
      }
    }

    // Reset all waiting customers' patience to full
    if (effect.patienceResetAll) {
      this.customerQueue.resetAllPatience();
    }

    // Multiply all waiting customers' patience (penalty)
    if (effect.patiencePenaltyAll !== undefined) {
      this.customerQueue.multiplyAllPatience(effect.patiencePenaltyAll);
    }

    // Patience boost for next customer(s)
    if (effect.patienceBoostNext !== undefined && effect.patienceBoostNext > 0) {
      this.patienceBoostNext = effect.patienceBoostNext;
      this.patienceBoostAmount = effect.patienceBoostAmount ?? 1.5;
    }

    // Tip multiplier for next serves
    if (effect.tipMultiplierNext !== undefined && effect.tipMultiplierNext > 0) {
      this.tipMultiplierServesLeft = effect.tipMultiplierNext;
      this.activeTipMultiplier = effect.tipMultiplierAmount ?? 2.0;
    }

    // Reputation change
    if (effect.reputationDelta !== undefined && effect.reputationDelta !== 0) {
      changeReputation(effect.reputationDelta);
    }

    // Show customer reaction emoji as floating text near the customer queue area
    const reactionText = this.add.text(
      this.scale.width * 0.7,
      this.scale.height * 0.3,
      effect.customerEmoji,
      { fontSize: '40px' }
    ).setOrigin(0.5).setDepth(30);

    this.tweens.add({
      targets: reactionText,
      y: reactionText.y - 60,
      alpha: 0,
      scale: 2,
      duration: 1500,
      ease: 'Power2',
      onComplete: () => reactionText.destroy(),
    });
  }

  // ── Display helpers ────────────────────────────────────────────────────────

  private updateTimerDisplay(): void {
    const secs = Math.ceil(this.timeLeft);
    this.timerText.setText(`${secs}s`);

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
      `完美${perfect} 普通${ok} 微焦${slightlyBurnt} 焦${burnt} 碳化${carbonized} 半熟${halfCooked}`
    );
    this.revenueText.setText(`$${this.sessionRevenue}`);
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

  /**
   * Wave 6e: Big animated judgement text (PERFECT / GREAT / GOOD / MISS).
   * Pops in with a scale bounce and floats upward before fading out.
   */
  private showJudgementBig(text: string, color: string, size: number, duration = 600): void {
    const x = this.NOTE_HIT_X;
    const y = this.noteTrackY - 60;
    const txt = this.add.text(x, y, text, {
      fontSize: `${size}px`,
      fontFamily: FONT,
      color,
      stroke: '#000000',
      strokeThickness: Math.max(2, Math.floor(size / 8)),
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(220).setScale(0.5);

    // Pop-in bounce
    this.tweens.add({
      targets: txt,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 100,
      ease: 'Back.Out',
    });
    // Settle to 1.0
    this.tweens.add({
      targets: txt,
      scaleX: 1,
      scaleY: 1,
      duration: 200,
      delay: 100,
      ease: 'Power2',
    });
    // Float up + fade out
    this.tweens.add({
      targets: txt,
      alpha: 0,
      y: y - 30,
      duration: duration - 200,
      delay: 200,
      onComplete: () => { if (txt.active) txt.destroy(); },
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

  // ── Combo system ─────────────────────────────────────────────────────────

  // Call after each serve with the served sausage's grillQuality.
  // Returns the revenue bonus multiplier that should be applied to this sale.
  private handleCombo(grillQuality: string, serveX: number, serveY: number): number {
    if (grillQuality === 'perfect') {
      this.perfectCombo++;
      if (this.perfectCombo > this.maxCombo) this.maxCombo = this.perfectCombo;
    } else {
      // Combo break
      if (this.perfectCombo >= 2) {
        this.showFeedback('combo 中斷', serveX, serveY - 65, '#aaaaaa');
      }
      this.perfectCombo = 0;
    }

    this.updateComboDisplay();

    // Determine revenue multiplier and side effects
    if (this.perfectCombo >= 5) {
      return 1.5;
    } else if (this.perfectCombo >= 3) {
      return 1.2;
    }
    return 1.0;
  }

  private updateComboDisplay(): void {
    if (!this.comboText) return;
    if (this.perfectCombo >= 2) {
      let label = `Combo x${this.perfectCombo}!`;
      if (this.perfectCombo >= 5) label += ' 神之手!';
      this.comboText.setText(label).setAlpha(1);
    } else {
      this.comboText.setAlpha(0);
    }
  }

  // Trigger milestone visual effects when a threshold is first crossed.
  private triggerComboMilestone(combo: number, serveX: number, serveY: number): void {
    const { width, height } = this.scale;
    if (combo === 5) {
      // Stronger golden vignette + floating text
      this.showFeedback('神之手! 1.5x + 耐心回滿', width / 2, height * 0.12, '#ffd700');
      this.customerQueue.resetAllPatience();
      this.flashScreenEdge(0xffd700, 0.45, 600);
    } else if (combo === 3) {
      this.showFeedback('Combo x3! 收入 1.2x', width / 2, height * 0.12, '#ffd700');
      this.flashScreenEdge(0xffd700, 0.3, 400);
    } else if (combo >= 2 && combo !== 3 && combo !== 5) {
      // Show plain combo feedback for other thresholds
      this.showFeedback(`Combo x${combo}!`, serveX, serveY - 65, '#ffd700');
    }
  }

  // Brief colored vignette / screen-edge glow
  private flashScreenEdge(color: number, maxAlpha: number, duration: number): void {
    const { width, height } = this.scale;
    const vignette = this.add.graphics().setDepth(200);
    vignette.fillStyle(color, maxAlpha);
    // Draw as a hollow rectangle (4 thick edge rects)
    const thickness = 28;
    vignette.fillRect(0, 0, width, thickness);
    vignette.fillRect(0, height - thickness, width, thickness);
    vignette.fillRect(0, 0, thickness, height);
    vignette.fillRect(width - thickness, 0, thickness, height);

    this.tweens.add({
      targets: vignette,
      alpha: 0,
      duration,
      ease: 'Power2',
      onComplete: () => { if (vignette.active) vignette.destroy(); },
    });
  }

  // Gold flash on a grill slot (perfect serve visual)
  private flashGrillSlotGold(slotX: number, slotY: number): void {
    const flash = this.add.graphics().setDepth(50);
    flash.fillStyle(0xffd700, 0.55);
    flash.fillRect(slotX - 34, slotY - 44, 68, 88);

    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 300,
      ease: 'Power1',
      onComplete: () => { if (flash.active) flash.destroy(); },
    });
  }

  // Dark screen overlay for carbonized serve
  private flashScreenDark(): void {
    const { width, height } = this.scale;
    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.1)
      .setDepth(200);

    this.tweens.add({
      targets: overlay,
      alpha: 0,
      duration: 500,
      ease: 'Power1',
      onComplete: () => { if (overlay.active) overlay.destroy(); },
    });
  }

  // Camera shake helper
  private shakeCamera(intensity: number, duration: number): void {
    this.cameras.main.shake(duration, intensity);
  }

  // Customer reaction bubble near queue
  private showCustomerReactionBubble(grillQuality: string): void {
    const { width, height } = this.scale;
    const queueY = height * 0.17;
    const bubbleX = width / 2 + (Math.random() * 120 - 60);
    const bubbleY = queueY - 50;

    let lines: string[];
    let color: string;

    if (grillQuality === 'perfect') {
      lines = ['哦～', '太厲害了!', '完美!'];
      color = '#ffd700';
    } else if (grillQuality === 'ok' || grillQuality === 'slightly-burnt') {
      lines = ['還不錯', '可以'];
      color = '#aaffaa';
    } else {
      lines = ['...這能吃?', '咳咳', '焦了吧'];
      color = '#ff8888';
    }

    const line = lines[Math.floor(Math.random() * lines.length)];

    const bubble = this.add.text(bubbleX, bubbleY, `「${line}」`, {
      fontSize: '13px',
      fontFamily: FONT,
      color,
      backgroundColor: '#222222cc',
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setDepth(50);

    this.tweens.add({
      targets: bubble,
      y: bubbleY - 22,
      alpha: 0,
      duration: 2200,
      ease: 'Power1',
      onComplete: () => { if (bubble.active) bubble.destroy(); },
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
    const title = this.add.text(w / 2, 60, '離開攤位做什麼？', {
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

      const nameText = this.add.text(x + cardW / 2, y + 18, activity.name, {
        fontSize: '15px', color: '#ffffff', fontStyle: 'bold', fontFamily: FONT
      }).setOrigin(0.5);

      const desc = activity.description.substring(0, 20) + '...';
      const descText = this.add.text(x + cardW / 2, y + 42, desc, {
        fontSize: '11px', color: '#aaaaaa', fontFamily: FONT
      }).setOrigin(0.5);

      const durText = this.add.text(x + cardW / 2, y + 62, `${activity.duration}秒`, {
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
      '算了，繼續烤',
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
      `${activity.name}中... (${Math.ceil(this.awayActivityTimer)}秒)`, {
      fontSize: '14px', color: '#44aaff', fontFamily: FONT
    }).setOrigin(0.5);

    // "Return early" button
    const returnBtn = this.add.text(w - 20, 25, '提早回來', {
      fontSize: '12px', color: '#ffcc00', backgroundColor: '#2a2a1a',
      padding: { x: 6, y: 3 }, fontFamily: FONT
    }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });

    returnBtn.on('pointerdown', () => this.completeActivity());

    this.awayOverlay.add([banner, bannerText, returnBtn]);

    // Store reference for update loop
    this.__awayBannerText = bannerText;

    // Hide leave button while away
    if (this.leaveButton) this.leaveButton.setVisible(false);
  }

  private completeActivity(): void {
    if (!this.currentActivity) return;

    const activity = this.currentActivity;

    // Clean up away overlay
    this.awayOverlay?.destroy();
    this.awayOverlay = null;
    this.__awayBannerText = null;

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

    const titleText = this.add.text(w / 2, h / 2 - 80, activity.name, {
      fontSize: '20px', color: '#44aaff', fontStyle: 'bold', fontFamily: FONT
    }).setOrigin(0.5);
    this.awayOverlay.add(titleText);

    const resultText = this.add.text(w / 2, h / 2 - 30, outcome.resultText, {
      fontSize: '14px', color: '#ffffff', wordWrap: { width: w - 80 }, align: 'center', fontFamily: FONT
    }).setOrigin(0.5);
    this.awayOverlay.add(resultText);

    // Effects summary
    const effects: string[] = [];
    if (outcome.effects.money) effects.push(`${outcome.effects.money > 0 ? '+' : ''}$${outcome.effects.money}`);
    if (outcome.effects.reputation) effects.push(`聲望 ${outcome.effects.reputation > 0 ? '+' : ''}${outcome.effects.reputation}`);
    if (outcome.effects.undergroundRep) effects.push(`地下聲望 ${outcome.effects.undergroundRep > 0 ? '+' : ''}${outcome.effects.undergroundRep}`);
    if (outcome.effects.trafficBonus) effects.push(`客流 +${Math.round(outcome.effects.trafficBonus * 100)}%`);
    if (outcome.effects.chaosPoints) effects.push(`混沌 +${outcome.effects.chaosPoints}`);
    if (outcome.effects.battleBonus) effects.push(`戰鬥加成 +${Math.round(outcome.effects.battleBonus * 100)}%`);

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

    // Sync inventory snapshot back to global state so spoilage/next-day logic sees correct counts
    updateGameState({ inventory: { ...this.inventoryCopy } });

    try {
      // Stop BGM (legacy bgm field kept for compat; Wave 6cd-fix uses Web Audio API)
      if (this.bgm) {
        this.bgm.stop();
        this.bgm.destroy();
        this.bgm = null;
      }
      try { this.bgmSource?.stop(); } catch (_e) { /* already stopped */ }
      this.bgmSource = null;
      this.bgmGain?.disconnect();
      this.bgmGain = null;

      // Wave 6c: condiment station removed; condimentOverlay field kept null for compat
      this.condimentOverlay = null;
      this.isShowingCondimentStation = false;

      // Clean up grill event overlay
      if (this.grillEventOverlay) {
        this.grillEventOverlay.destroy();
        this.grillEventOverlay = null;
      }
      this.isShowingGrillEvent = false;

      // Clean up away state
      this.isPlayerAway = false;
      this.currentActivity = null;
      this.awayOverlay?.destroy();
      this.awayOverlay = null;
      this.__awayBannerText = null;

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
        if (this.timerText?.active) this.timerText.setAlpha(1);
      }

      // Count waste
      const grillRemaining = this.grillSlots.filter(s => s.sausage && !s.sausage.served).length;
      const warmingRemaining = this.warmingSlots.filter(s => s.sausage).length;

      // Persist to game state
      updateGameState({
        dailySalesLog: [...this.salesLog],
        dailyGrillStats: { ...this.grillStats },
        dailyWaste: { grillRemaining, warmingRemaining },
        dailyPerfectCount: this.grillStats.perfect,
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
    } catch (e) {
      console.error('[GrillScene] endGrilling cleanup error:', e);
    }

    // Transition — MUST run even if cleanup above throws
    let transitioned = false;
    const doTransition = () => {
      if (transitioned) return;
      transitioned = true;
      this.scene.start('EventScene');
    };

    try {
      // Use manual overlay tween instead of camera.fadeOut (more reliable)
      const { width: fw, height: fh } = this.scale;
      const fadeRect = this.add.rectangle(fw / 2, fh / 2, fw, fh, 0x000000, 0).setDepth(9999);
      this.tweens.add({
        targets: fadeRect,
        alpha: { from: 0, to: 1 },
        duration: 600,
        onComplete: doTransition,
      });
      // Safety: force transition after 1.5s no matter what
      this.time.delayedCall(1500, () => {
        if (!this.scene.isActive()) return;
        doTransition();
      });
    } catch (e) {
      console.error('[GrillScene] transition error, forcing:', e);
      doTransition();
    }
  }

  // ── Wave 6cd: Rhythm tutorial overlay ────────────────────────────────────

  private showRhythmTutorial(width: number, height: number): void {
    const overlayContainer = this.add.container(0, 0).setDepth(9999);

    // Full-screen semi-transparent black background
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.85);
    bg.fillRect(0, 0, width, height);
    overlayContainer.add(bg);

    const cx = width / 2;

    // Title
    const title = this.add.text(cx, height * 0.12, '烤香腸節奏遊戲', {
      fontSize: '32px',
      fontFamily: FONT,
      color: '#ffcc00',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);
    overlayContainer.add(title);

    // Subtitle
    const sub = this.add.text(cx, height * 0.20, '跟著音樂節奏  打中飛來的香腸', {
      fontSize: '18px',
      fontFamily: FONT,
      color: '#ffffff',
    }).setOrigin(0.5);
    overlayContainer.add(sub);

    // Controls
    const controlsText = this.add.text(cx, height * 0.32,
      '【咚 紅】  鍵盤 F 或 J\n【喀 藍】  鍵盤 D 或 K', {
        fontSize: '20px',
        fontFamily: FONT,
        color: '#ffaaaa',
        align: 'center',
        lineSpacing: 8,
      }).setOrigin(0.5);
    overlayContainer.add(controlsText);

    // Judgement explanation
    const judgeText = this.add.text(cx, height * 0.52,
      'PERFECT   ±50 ms   → 烤至完美金黃\n' +
      'GREAT       ±100 ms  → 烤至略嫩\n' +
      'GOOD        ±150 ms  → 烤至半熟\n' +
      'MISS           超過範圍  → 香腸沒掉下來', {
        fontSize: '16px',
        fontFamily: FONT,
        color: '#cccccc',
        align: 'left',
        lineSpacing: 10,
      }).setOrigin(0.5);
    overlayContainer.add(judgeText);

    // Prompt
    const prompt = this.add.text(cx, height * 0.80, '按任意鍵 或 點擊任意處 開始', {
      fontSize: '20px',
      fontFamily: FONT,
      color: '#39ff14',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    overlayContainer.add(prompt);

    // Pulse animation on the prompt
    this.tweens.add({
      targets: prompt,
      alpha: 0.4,
      duration: 600,
      yoyo: true,
      repeat: -1,
    });

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      overlayContainer.destroy();
      this.startRhythmGame();
    };

    // Any pointer on the overlay background
    bg.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, width, height),
      Phaser.Geom.Rectangle.Contains
    );
    bg.once('pointerdown', dismiss);

    // Any keydown
    const onKey = () => { dismiss(); };
    this.input.keyboard?.once('keydown', onKey);
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  shutdown(): void {
    this.tweens.killAll();
    this.time.removeAllEvents();

    // Stop BGM (Wave 6cd-fix: Web Audio API)
    if (this.bgm) {
      this.bgm.stop();
      this.bgm.destroy();
      this.bgm = null;
    }
    try { this.bgmSource?.stop(); } catch (_e) { /* already stopped */ }
    this.bgmSource = null;
    this.bgmGain?.disconnect();
    this.bgmGain = null;

    // Clean up combat panel if still active
    if (this.currentCombatPanel) {
      this.currentCombatPanel.destroy();
      this.currentCombatPanel = null;
    }
    this.combatCustomersHandled.clear();
    EventBus.off('combat-done');

    // Clean up commentary UI
    if (this.commentBubble?.active) { this.commentBubble.destroy(); this.commentBubble = null; }
    if (this.counterAttackPanel) { this.counterAttackPanel.destroy(); this.counterAttackPanel = null; }

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

    // Wave 4c: clean up spectator crowd
    if (this.spectatorCrowd) {
      this.spectatorCrowd.clear();
    }
    if (this.pressureLevelText?.active) {
      this.pressureLevelText.destroy();
      this.pressureLevelText = null;
    }

    // Clean up away state
    this.isPlayerAway = false;
    this.currentActivity = null;
    if (this.awayOverlay) {
      this.awayOverlay.destroy();
      this.awayOverlay = null;
    }
    this.__awayBannerText = null;

    // Remove keyboard listeners (defensive: cameras/input may be torn down by Phaser already)
    try { this.input?.keyboard?.removeAllListeners?.(); } catch (_e) { /* ignore */ }
    try { this.cameras?.main?.removeAllListeners?.(); } catch (_e) { /* ignore */ }
    EventBus.off('black-market-done');
  }

  private resetFullGameState(): void {
    updateGameState({
      day: 1,
      money: 8000,
      reputation: 50,
      phase: 'boot',
      playerSlot: 1,
      inventory: {},
      map: { 1: 'player', 2: 'enemy', 3: 'enemy', 4: 'enemy', 5: 'enemy', 6: 'enemy', 7: 'enemy', 8: 'enemy', 9: 'enemy' },
      upgrades: {},
      prices: {},
      selectedSlot: 1,
      unlockedSausages: ['flying-fish-roe', 'cheese', 'big-taste', 'big-wrap-small', 'great-wall'],
      hiredWorkers: [],
      marketingPurchases: {},
      grillEventCooldowns: {},
      workerSalaryPaid: false,
      undergroundRep: 0,
      reputationCrisisDay: -1,
      chaosCount: 0,
      dailyChaosActions: [],
      hasBodyguard: false,
      bodyguardDaysLeft: 0,
      blackMarketUnlocked: false,
      blackMarketStock: {},
      customerLoyalty: {},
      dailyOrderScores: [],
      battleBonus: 0,
      playerLoans: [],
      gameMode: '',
      dailyExpenses: 0,
      dailySalesLog: [],
      dailyGrillStats: { perfect: 0, ok: 0, raw: 0, burnt: 0, 'half-cooked': 0, 'slightly-burnt': 0, carbonized: 0 },
      warmingZone: [],
      dailyWaste: { grillRemaining: 0, warmingRemaining: 0 },
      dailyTrafficBonus: 0,
      skipDay: false,
      activeOpponents: [],
      defeatedOpponents: [],
      stats: {
        totalSausagesSold: 0,
        totalRevenue: 0,
        totalExpenses: 0,
        battlesWon: 0,
        battlesLost: 0,
        totalPerfect: 0,
        totalBurnt: 0,
        totalCarbonized: 0,
        totalLoansRepaid: 0,
      },
      loans: { active: null, bankBlacklisted: false },
      managementFee: { weeklyAmount: 500, lastPaidDay: 0, isResisting: false, resistDays: 0, bribedInspector: false, rebranded: false },
      hui: { isActive: false, day: 0, cycle: 0, members: [], pot: 0, dailyFee: 100, playerHasCollected: false, playerBidAmount: 0, runaway: false, totalPaidIn: 0, totalCollected: 0 },
    });
  }

  // ── Task 5.1: Cheese Perfect — 起司爆漿瞬間 ─────────────────────────────
  private triggerCheeseExplosion(x: number, y: number): void {
    const { width, height } = this.scale;

    // Stronger camera shake
    this.shakeCamera(0.01, 200);

    // Yellow particle burst: 8-12 small circles flying outward
    const particleCount = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + (Math.random() * 0.4 - 0.2);
      const speed = 80 + Math.random() * 80;
      const gfx = this.add.graphics().setDepth(92);
      gfx.fillStyle(0xffe033, 1);
      gfx.fillCircle(0, 0, 4 + Math.random() * 4);
      gfx.setPosition(x, y);

      this.tweens.add({
        targets: gfx,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0,
        duration: 500,
        ease: 'Power2',
        onComplete: () => { if (gfx.active) gfx.destroy(); },
      });
    }

    // Dramatic text at screen center
    const label = this.add.text(width / 2, height / 2, '起司爆漿！！！', {
      fontSize: '48px',
      color: '#ffe033',
      fontFamily: FONT,
      stroke: '#7a5800',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(95).setScale(0).setAlpha(1);

    this.tweens.add({
      targets: label,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 300,
      ease: 'Back.Out',
      onComplete: () => {
        this.tweens.add({
          targets: label,
          scaleX: 0,
          scaleY: 0,
          alpha: 0,
          duration: 500,
          delay: 200,
          ease: 'Power2',
          onComplete: () => { if (label.active) label.destroy(); },
        });
      },
    });

    // All nearby customers get +3s patience bonus
    this.customerQueue.addPatienceSeconds(3);
    this.customerQueue.multiplyAllPatience(1); // force redraw via existing method
    this.showFeedback('起司爆漿！附近客人+3s耐心', width / 2, height * 0.38, '#ffe033');
  }

  // ── Task 5.3: Great Wall Perfect — 圍觀拍照 ──────────────────────────────
  private triggerGreatWallSpectacle(x: number, y: number): void {
    const { width, height } = this.scale;

    // 4-6 camera flash effects (white rectangles blinking at random positions)
    const flashCount = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < flashCount; i++) {
      const fx = x + (Math.random() * 180 - 90);
      const fy = y + (Math.random() * 120 - 60);
      const flash = this.add.rectangle(fx, fy, 30 + Math.random() * 20, 22 + Math.random() * 14, 0xffffff, 0)
        .setDepth(91);

      this.tweens.add({
        targets: flash,
        alpha: 0.85,
        duration: 80,
        delay: i * 120,
        ease: 'Power1',
        yoyo: true,
        onComplete: () => {
          // Second blink
          this.tweens.add({
            targets: flash,
            alpha: 0.7,
            duration: 60,
            yoyo: true,
            onComplete: () => { if (flash.active) flash.destroy(); },
          });
        },
      });
    }

    // Staggered floating text bubbles
    const bubbleTexts = ['太扯了!', '拍到了!', '上傳IG!'];
    const bubblePositions = [
      { x: width * 0.2, y: height * 0.45 },
      { x: width * 0.75, y: height * 0.35 },
      { x: width * 0.5, y: height * 0.55 },
    ];
    bubbleTexts.forEach((txt, idx) => {
      const bx = bubblePositions[idx].x;
      const by = bubblePositions[idx].y;
      const bubble = this.add.text(bx, by, txt, {
        fontSize: '22px',
        color: '#ffffff',
        backgroundColor: '#222288',
        padding: { x: 8, y: 4 },
        fontFamily: FONT,
      }).setOrigin(0.5).setDepth(92).setAlpha(0);

      this.tweens.add({
        targets: bubble,
        alpha: 1,
        y: by - 18,
        duration: 300,
        delay: idx * 300,
        ease: 'Back.Out',
        onComplete: () => {
          this.tweens.add({
            targets: bubble,
            alpha: 0,
            y: by - 40,
            duration: 500,
            delay: 600,
            ease: 'Power1',
            onComplete: () => { if (bubble.active) bubble.destroy(); },
          });
        },
      });
    });

    // Reputation +3
    changeReputation(3);

    // All waiting customers patience restored to full
    this.customerQueue.resetAllPatience();

    // Result text at screen top
    this.showFeedback('萬里腸城震撼！聲望+3', width / 2, height * 0.08, '#ffd700');
  }
}

// GrillScene — 夜晚烤制小遊戲 (pure Phaser, no HTML overlay)
import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { gameState, changeReputation, updateGameState, addMoney } from '../state/GameState';
import type { DailyRhythmStats } from '../state/GameState';
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
import { CustomerQueue, MAX_VISIBLE_CUSTOMERS } from '../objects/CustomerQueue';
import type { SaleRecord, Customer, WarmingSausage, GrillEvent, GrillEventChoice, GrillEventOutcome, OrderScore } from '../types';
import { scoreOrder, starsToString, getScoreColor } from '../systems/OrderEngine';
import { recordVisit } from '../systems/LoyaltyEngine';
import { sfx } from '../utils/SoundFX';
import { getGrillEventImageKey, rollGrillEvent } from '../data/grill-events';
import { CombatPanel } from '../ui/panels/CombatPanel';
// getPersonalityEmoji removed — emoji display removed from combat feedback
import { useBlackMarketItem, BLACK_MARKET_ITEMS } from '../systems/BlackMarketEngine';
import { changeUndergroundRep, addChaos, spendMoney } from '../state/GameState';
import { canPlayerLeave, tickWorkerAI } from '../systems/WorkerGrillAI';
import { AWAY_ACTIVITIES, rollActivityOutcome } from '../data/activities';
import type { AwayActivity } from '../data/activities';
import { getSpecialEffect } from '../data/sausage-effects';
import type { SpecialEffectResult } from '../data/sausage-effects';
// S7.6: customerReactions restored (slow/impatient text only, no counter-attack)
import { CUSTOMER_REACTIONS } from '../data/customerReactions';
import { SpectatorCrowd } from '../objects/SpectatorCrowd';
import { RhythmNote } from '../objects/RhythmNote';
import type { RhythmChart } from '../data/chart';
import type { HitJudgement } from '../systems/RhythmEngine';
import {
  getComboMilestone,
  getGoodWindowSeconds,
  getRhythmHeatBoost,
  judgeRhythmHit,
} from '../systems/RhythmGrillRules';
import type { NoteType, ChartNote } from '../data/chart';
import {
  getAutoServeConfig,
  getBandArrivalInterval,
  getCustomerBatchRange,
  getInitialArrivalInterval,
  getMaxSessionEvents,
  getServiceComboConfig,
  getSessionDuration,
} from '../config/grillBalance';
import { JUDGEMENT_ASSET_BY_RESULT } from '../data/uiAssets';

// ── Layout constants ────────────────────────────────────────────────────────
const MAX_GRILL_SLOTS = 8;     // 12 if grill-expand upgrade
const GRILL_Y_FRAC = 0.50;    // grill vertical position as fraction of screen height (true center)
// Warming zone has no fixed limit — slots are created dynamically

// ── Colors / fonts ──────────────────────────────────────────────────────────
const COLOR_BG_TOP = 0x100500;
const COLOR_BG_BTM = 0x1a0800;
const COLOR_ORANGE = '#ff6b00';
const COLOR_DIM = '#664422';
const FONT = 'Microsoft JhengHei, PingFang TC, sans-serif';
const COMBO_100_VIDEO_URL = `${import.meta.env.BASE_URL}videos/combo-100.mp4`;

type CombatDoneResult = { undergroundRepDelta?: number; chaosPoints?: number };

function getTestShortGrillSeconds(): number {
  if (typeof window === 'undefined') return 0;
  const params = new URLSearchParams(window.location.search);
  const testToolsEnabled =
    import.meta.env.DEV ||
    params.has('test') ||
    window.localStorage.getItem('sausage-test-tools') === '1';
  if (!testToolsEnabled) return 0;
  const raw = window.sessionStorage.getItem('sausage-test-short-grill');
  const seconds = raw ? Number(raw) : 0;
  return Number.isFinite(seconds) ? Phaser.Math.Clamp(seconds, 8, 60) : 0;
}

// ── Internal types ───────────────────────────────────────────────────────────
interface GrillSlot {
  sprite: SausageSprite | null;
  sausage: GrillingSausage | null;
  x: number;
  y: number;
  placeholderGfx: GrillSlotGraphics | null;
  serveBtn: Phaser.GameObjects.Text | null;
  // Runtime state flags attached during play
  __carbonWarnShown?: boolean;
  __burntWarnShown?: boolean;
  // Stage tracking for visual/audio feedback (Wave 4a)
  __prevTopStage?: CookingStage;
  __prevBottomStage?: CookingStage;
  __lastStageFeedbackTime?: number; // seconds, debounce
  // Wave 4b: interaction buttons
  flipBtn?: Phaser.GameObjects.Container | null;
  pressBtn?: Phaser.GameObjects.Container | null;
  oilBtn?: Phaser.GameObjects.Container | null;
  __isPressingBtn?: boolean;    // true while press button is held
  __shadowGfx?: Phaser.GameObjects.Graphics | null;  // S5.1: ellipse shadow under slot
}

// Extended Graphics object that carries the associated hit zone
interface GrillSlotGraphics extends Phaser.GameObjects.Graphics {
  __hitZone?: Phaser.GameObjects.Zone;
  __frameImage?: Phaser.GameObjects.Image;
}

interface WarmingSlot {
  sausage: WarmingSausage | null;
  x: number;
  y: number;
  bgGfx: Phaser.GameObjects.Graphics | null;
  infoText: Phaser.GameObjects.Text | null;
  stateText: Phaser.GameObjects.Text | null;
  sausageImage?: Phaser.GameObjects.Image | null;
  // Layout geometry cached at creation time
  __x?: number;
  __y?: number;
  __w?: number;
  __h?: number;
}

export class GrillScene extends Phaser.Scene {
  // ── Session state ───────────────────────────────────────────────────────
  private timeLeft = getSessionDuration(1);
  private salesLog: SaleRecord[] = [];
  private grillStats = { perfect: 0, ok: 0, raw: 0, burnt: 0, 'half-cooked': 0, 'slightly-burnt': 0, carbonized: 0 };
  private customers: Customer[] = [];
  private pendingCustomerQueue: Customer[] = [];
  private customerArrivalTimer = 0;
  private customerArrivalInterval = 0;
  private isDone = false;
  private sessionRevenue = 0;
  private paused = true; // Start paused until player clicks "開始營業"
  private externalPagePaused = false;
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

  // ── Warming zone ─────────────────────────────────────────────────────────
  private warmingSlots: WarmingSlot[] = [];
  // warmingContainer is used implicitly via warmingSlots setup

  // ── Phaser objects ──────────────────────────────────────────────────────
  private customerQueue!: CustomerQueue;
  private timerText!: Phaser.GameObjects.Text;
  private revenueText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private statsPanelImage: Phaser.GameObjects.Image | null = null;
  private statNumberTexts: Phaser.GameObjects.Text[] = [];
  private feedbackTexts: Phaser.GameObjects.Text[] = [];
  // Fire emoji particles floating upward
  private fireParticles: Phaser.GameObjects.Text[] = [];
  private fireParticleTimer = 0;
  private fireGlowGfx!: Phaser.GameObjects.Graphics;
  private timerFlashTween: Phaser.Tweens.Tween | null = null;

  private bgm: Phaser.Sound.BaseSound | null = null;

  // ── Combat state ─────────────────────────────────────────────────────────
  private currentCombatPanel: CombatPanel | null = null;
  private combatCustomersHandled: Set<string> = new Set();
  private combatDoneHandler: ((result?: CombatDoneResult) => void) | null = null;
  private blackMarketDoneHandler: (() => void) | null = null;
  private handleWindowBlur: (() => void) | null = null;
  private handleWindowFocus: (() => void) | null = null;
  private handleVisibilityChange: (() => void) | null = null;

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

  // S5.2: customer commentary state removed

  // ── Wave 4c: SpectatorCrowd ──────────────────────────────────────────────
  private spectatorCrowd!: SpectatorCrowd;
  private spectatorSpawnTimer = 0;
  private spectatorNextSpawnInterval = 4; // seconds; randomized each spawn
  private pressureLevelText: Phaser.GameObjects.Text | null = null;
  private pressureUpdateTimer = 0; // 每 500ms 更新一次壓力顯示
  private patienceCheckTimer = 0;  // 每秒檢查一次 patience
  // 圍觀客人隨機對白計時
  private quoteTimer = 0;
  private quoteNextTrigger = 0;

  // ── Wave 6a: Rhythm track state ──────────────────────────────────────────
  private chart: RhythmChart | null = null;
  private rhythmNotes: RhythmNote[] = [];
  private nextNoteSpawnIdx = 0;      // pointer into chart.notes[]
  private readonly NOTE_LEAD_TIME = 1.8;  // seconds ahead of hit time for note to spawn
  private noteSpawnX = 0;                 // set from viewport width in setupRhythmTrack
  private noteHitX = 0;                   // set from viewport width in setupRhythmTrack
  // NOTE_TRACK_Y is computed in create() relative to this.scale.height
  // (between warming zone bottom ~0.68 and spectator crowd ~0.76)
  private noteTrackY = 0;

  // ── Wave 6b: Rhythm input / judgement state ───────────────────────────────
  private rhythmCombo = 0;
  private maxRhythmCombo = 0;
  private hitStats = { perfect: 0, great: 0, good: 0, miss: 0 };
  private rhythmComboText: Phaser.GameObjects.Text | null = null;
  private rhythmComboBadge: Phaser.GameObjects.Image | null = null;
  private rhythmComboSfxPlayed = new Set<number>();
  private fullComboSfxPlayed = false;
  private combo100CutinContainer: Phaser.GameObjects.Container | null = null;
  private combo100CutinPlayed = false;

  // ── Wave 6e: Service combo state ─────────────────────────────────────────
  // Total service combo groups injected this session (used for future summary display)
  private totalServiceComboGroupCount = 0;
  // hit = successful hits, seen = total notes processed (hit + miss)
  private serviceComboGroupHits = new Map<number, { hit: number; seen: number; total: number }>();
  // Track which groups have already fired triggerBatchServe (prevent double-fire)
  private serviceComboBatchFired = new Set<number>();

  // ── Auto-pack timer (3s baseline, 0 delay with auto-grill upgrade) ──────────
  private autoServeTimer = 0;

  // ── S7.1: candidate label (shown when >6 customers waiting) ─────────────────
  private candidateLabel: Phaser.GameObjects.Text | null = null;
  private candidateLabelTimer = 0;

  // ── S7.6: customer commentary (slow service / impatient text bubbles) ────────
  private commentBubble: Phaser.GameObjects.Text | null = null;
  private lastCommentTime = 0;
  private slowServiceTimer = 0;

  // ── Unified session event counter (replaces grillEventTriggered) ─────────────
  private totalSessionEvents = 0;
  private maxSessionEvents = getMaxSessionEvents({ day: 1, tier: 1, difficulty: undefined });
  private readonly ENABLE_GRILL_SESSION_EVENTS = false;

  // ── Chart completion guard (prevents double end-of-day) ──────────────────────
  private chartCompleteFired = false;

  // ── S2.3: Drain phase — after last note, wait for grill/warming to empty ───
  private isDrainPhase = false;
  private drainPhaseTimer = 0;
  private readonly DRAIN_PHASE_MAX = 5; // seconds of post-chart grilling before summary
  private readonly MIN_PENDING_CUSTOMERS = 48;
  private readonly MIN_VISIBLE_CUSTOMERS = 7;

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
  private externalPauseOverlay: Phaser.GameObjects.Container | null = null;

  constructor() {
    super({ key: 'GrillScene' });
  }

  private getBalanceInput() {
    return {
      day: gameState.day,
      tier: gameState.playerSlot || 1,
      difficulty: gameState.difficulty,
      hasNeonSign: gameState.upgrades['neon-sign'],
    };
  }

  // ── Scene lifecycle ──────────────────────────────────────────────────────

  preload(): void {
    // All textures preloaded in BootScene
  }

  private registerExternalPauseHandlers(): void {
    this.clearExternalPauseHandlers();
    this.handleWindowBlur = () => { this.externalPagePaused = true; };
    this.handleWindowFocus = () => { this.externalPagePaused = document.hidden; };
    this.handleVisibilityChange = () => { this.externalPagePaused = document.hidden; };
    window.addEventListener('blur', this.handleWindowBlur);
    window.addEventListener('focus', this.handleWindowFocus);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.externalPagePaused = document.hidden || !document.hasFocus();
  }

  private clearExternalPauseHandlers(): void {
    if (this.handleWindowBlur) window.removeEventListener('blur', this.handleWindowBlur);
    if (this.handleWindowFocus) window.removeEventListener('focus', this.handleWindowFocus);
    if (this.handleVisibilityChange) document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.handleWindowBlur = null;
    this.handleWindowFocus = null;
    this.handleVisibilityChange = null;
  }

  create(): void {
    this.events.on('shutdown', this.shutdown, this);
    EventBus.on('dev-end-grill-session', this.onDevEndGrillSession, this);
    const { width, height } = this.scale;
    this.registerExternalPauseHandlers();

    // Copy inventory snapshot (actual deduction happens in sellSausage)
    this.inventoryCopy = { ...gameState.inventory };

    // Reset session state
    const balanceInput = this.getBalanceInput();
    this.timeLeft = getSessionDuration(balanceInput.tier);
    this.maxSessionEvents = getMaxSessionEvents(balanceInput);
    this.salesLog = [];
    this.grillStats = { perfect: 0, ok: 0, raw: 0, burnt: 0, 'half-cooked': 0, 'slightly-burnt': 0, carbonized: 0 };
    this.customers = [];
    this.pendingCustomerQueue = [];
    this.customerArrivalTimer = 0;
    this.isDone = false;
    this.paused = true;
    this.sessionRevenue = 0;
    this.sessionTrafficBonus = 0;

    this.customerArrivalInterval = getInitialArrivalInterval(balanceInput);
    this.grillSlots = [];
    this.warmingSlots = [];
    this.feedbackTexts = [];
    this.fireParticles = [];
    this.fireParticleTimer = 0;
    this.hoveredSlotIndex = null;
    this.grillEventTimer = 0;
    this.grillEventNextTrigger = Phaser.Math.Between(40, 65);
    this.totalSessionEvents = 0;
    this.chartCompleteFired = false;
    this.isDrainPhase = false;
    this.drainPhaseTimer = 0;
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
    // S7.6: commentary fields reset
    this.commentBubble = null;
    this.lastCommentTime = 0;
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
    this.rhythmComboBadge = null;
    this.rhythmComboSfxPlayed = new Set<number>();
    this.fullComboSfxPlayed = false;
    this.combo100CutinContainer = null;
    this.combo100CutinPlayed = false;

    // ── Auto-pack timer reset ──
    this.autoServeTimer = 0;

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
    this.externalPauseOverlay = null;
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
    this.setupHUD(width, height);
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

  // S7.3: unified queueY getter — single source of truth for customer area vertical position
  private get queueY(): number { return this.scale.height * 0.22; }

  /** Returns true when ANY modal/overlay is active — used as master pause gate. */
  private isGloballyPaused(): boolean {
    return this.isShowingGrillEvent
      || this.paused
      || this.externalPagePaused
      || this.isShowingCondimentStation
      || this.isPlayerAway
      || this.currentCombatPanel !== null;
  }

  update(_time: number, delta: number): void {
    if (this.isDone) return;

    // S7.2: BGM reconcile must run BEFORE paused early-return,
    // otherwise pauseBgm() never fires when UI menus / events open.
    if (this.rhythmStarted) {
      const shouldPause = this.isGloballyPaused();
      if (shouldPause && !this.bgmPaused && !this.bgmFinished) this.pauseBgm();
      else if (!shouldPause && this.bgmPaused && !this.bgmFinished) this.resumeBgm();
    }
    this.syncExternalPauseOverlay();

    if (this.paused || this.externalPagePaused) return;
    // Freeze all game logic while a grill event overlay is shown
    if (this.isShowingGrillEvent) return;
    // Freeze while condiment station is open
    if (this.isShowingCondimentStation) return;

    // S7.9: speedMultiplier removed — dt is simply delta / 1000
    const dt = delta / 1000;

    // Tick customer patience
    this.customerQueue.tick(dt);

    // S3.2: Update customerArrivalInterval based on current difficultyBand
    if (this.rhythmStarted && this.chart?.difficultyBands && !this.isDone) {
      const now = this.getRhythmTime();
      const bands = this.chart.difficultyBands;
      const currentBand = bands.find(b => now >= b.t_start && now < b.t_end) ?? bands[bands.length - 1];
      const totalNotes = this.chart.totalNotes ?? 286;
      this.customerArrivalInterval = getBandArrivalInterval({
        chartDuration: this.chart.duration,
        totalNotes,
        averageSausagesPerOrder: this.AVG_SAUSAGES_PER_ORDER,
        bandLabel: currentBand.label,
        difficulty: gameState.difficulty,
      });
    }

    // Tick customer arrivals
    this.refillCustomerQueue();
    this.customerArrivalTimer += dt;
    const waitingCount = this.customerQueue.getWaitingCustomers().length;
    const needsVisibleFloor = waitingCount < this.MIN_VISIBLE_CUSTOMERS;
    if ((this.customerArrivalTimer >= this.customerArrivalInterval || needsVisibleFloor) && this.pendingCustomerQueue.length > 0) {
      this.customerArrivalTimer = 0;
      const { min: dayBatchMin, max: dayBatchMax } = getCustomerBatchRange(this.getBalanceInput());
      const visibleRoom = Math.max(0, MAX_VISIBLE_CUSTOMERS - waitingCount);
      const floorBatch = Math.max(0, this.MIN_VISIBLE_CUSTOMERS - waitingCount);
      const batch = Math.min(
        Math.max(floorBatch, Phaser.Math.Between(dayBatchMin, dayBatchMax)),
        this.pendingCustomerQueue.length,
        visibleRoom,
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
          if (this.ENABLE_GRILL_SESSION_EVENTS && c.personality === 'influencer') {
            this.showFeedback('網紅正在直播你的攤位！', this.scale.width / 2, this.scale.height * 0.1, '#44aaff');
          } else if (
            this.ENABLE_GRILL_SESSION_EVENTS &&
            ['karen', 'enforcer', 'inspector', 'spy'].includes(c.personality) &&
            !this.combatCustomersHandled.has(c.id) &&
            gameState.day >= 5 &&                              // 前 4 天不觸發 personality combat
            this.totalSessionEvents < this.maxSessionEvents    // 納入每場事件上限
          ) {
            this.combatCustomersHandled.add(c.id);
            this.totalSessionEvents++;                         // 計入事件計數
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

    // Wave 6 rhythm mode: scene end is driven by chart completion (last note + buffer),
    // NOT by timeLeft countdown or "no customer" auto-end.
    // timeLeft is kept as a display-only counter (HUD) synced to chart total duration.
    if (this.rhythmStarted && this.chart && this.chart.duration > 0) {
      this.timeLeft = Math.max(0, this.chart.duration - this.getRhythmTime());
    } else {
      this.timeLeft -= dt;
      if (this.timeLeft < 0) this.timeLeft = 0;
    }
    this.updateTimerDisplay();

    // S7.6: tickCustomerCommentary restored (pure text, no counter-attack)
    this.tickCustomerCommentary(dt);

    // S7.1: update candidate label every second
    this.candidateLabelTimer += dt;
    if (this.candidateLabelTimer >= 1) {
      this.candidateLabelTimer = 0;
      const hiddenCount = this.customerQueue.getHiddenWaitingCount();
      if (this.candidateLabel) {
        if (hiddenCount > 0) {
          this.candidateLabel.setText(`候補 +${hiddenCount}`).setVisible(true);
        } else {
          this.candidateLabel.setVisible(false);
        }
      }
    }

    // ── Wave 4c: SpectatorCrowd tick ────────────────────────────────────────
    this.spectatorCrowd.tick(dt);

    // 圍觀客人隨機對白：每 5-8 秒觸發一次
    if (this.spectatorCrowd && this.rhythmStarted && !this.isGloballyPaused()) {
      this.quoteTimer += dt;
      if (this.quoteTimer >= this.quoteNextTrigger) {
        this.quoteTimer = 0;
        this.quoteNextTrigger = 5 + Math.random() * 3;
        this.spectatorCrowd.showRandomQuote();
      }
    }

    // Spawn timer：每 3–6 秒產一位圍觀者（不依賴 waiting customers）
    this.spectatorSpawnTimer += dt;
    if (this.spectatorSpawnTimer >= this.spectatorNextSpawnInterval) {
      this.spectatorSpawnTimer = 0;
      this.spectatorNextSpawnInterval = 3 + Math.random() * 3;
      // Priority: pendingCustomerQueue sample → waitingCustomers[0] → transient generated customer
      let spectatorSource: import('../types').Customer | null = null;
      if (this.pendingCustomerQueue.length > 0) {
        const idx = Math.floor(Math.random() * this.pendingCustomerQueue.length);
        spectatorSource = this.pendingCustomerQueue[idx];
      } else {
        const waiting = this.customerQueue.getWaitingCustomers();
        if (waiting.length > 0) {
          spectatorSource = waiting[0];
        } else {
          // Transient sample: generate a throwaway customer just for the visual
          const transient = generateCustomers(1, 0);
          if (transient.length > 0) spectatorSource = transient[0];
        }
      }
      if (spectatorSource) {
        // shallow copy：複製 Customer 基礎資料，不搬動原始物件
        const clone: import('../types').Customer = { ...spectatorSource };
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

    // ── D: Chart-end detection → enter drain phase ──────────────────────────
    if (this.rhythmStarted && this.chart && !this.isDone && !this.isDrainPhase) {
      const lastNoteTime = this.chart.notes.length > 0
        ? this.chart.notes[this.chart.notes.length - 1].t
        : 0;
      if (this.getRhythmTime() > lastNoteTime) {
        // S2.3: Start drain phase — stop spawning notes, wait for grill/warming to clear
        this.isDrainPhase = true;
        this.drainPhaseTimer = 0;
      }
    }

    // ── S2.3: Drain phase tick ────────────────────────────────────────────────
    if (this.isDrainPhase && !this.isDone) {
      this.drainPhaseTimer += dt;
      if (this.drainPhaseTimer >= this.DRAIN_PHASE_MAX) {
        this.onChartComplete();
      }
    }

    // ── Wave 6c: Auto-serve rhythm sausages that hit target doneness ──────────
    if (this.rhythmStarted) {
      this.autoServeReady();
    }

    // ── Auto-pack timer: serve a small warming-zone burst on a balance-controlled cadence ──
    if (this.rhythmStarted && !this.isGloballyPaused()) {
      this.autoServeTimer += dt;
      const { interval } = getAutoServeConfig(gameState.upgrades['auto-grill']);
      if (this.autoServeTimer >= interval) {
        this.autoServeTimer = 0;
        this.tryAutoPack();
      }
      // Pressure release: warming zone nearly full → immediate extra pack
      const occupied = this.warmingSlots.filter(ws => ws.sausage !== null).length;
      if (occupied >= 14) {
        this.tryAutoPack();
        this.autoServeTimer = 0;
      }
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
    // Select EX chart for hardcore difficulty, standard chart for casual
    const chartKey = gameState.difficulty === 'hardcore' ? 'chart-grill-theme-ex' : 'chart-grill-theme';
    const cachedChart = this.cache.json.get(chartKey) as RhythmChart | undefined;
    const shortSeconds = getTestShortGrillSeconds();
    if (cachedChart && shortSeconds > 0) {
      const notes = cachedChart.notes
        .filter(note => note.t <= shortSeconds)
        .map(note => ({ ...note }));
      const duration = Math.max(shortSeconds + 1.5, (notes[notes.length - 1]?.t ?? shortSeconds) + 3);
      this.chart = {
        ...cachedChart,
        duration,
        bgmDuration: Math.min(cachedChart.bgmDuration ?? cachedChart.duration, duration),
        totalNotes: notes.length,
        sections: (cachedChart.sections ?? [])
          .filter(section => section.t_start < duration)
          .map(section => ({ ...section, t_end: Math.min(section.t_end, duration) })),
        difficultyBands: (cachedChart.difficultyBands ?? [])
          ?.filter(band => band.t_start < duration)
          .map(band => ({ ...band, t_end: Math.min(band.t_end, duration) })),
        notes,
      };
    } else {
      this.chart = cachedChart ?? null;
    }

    // Reset rhythm state
    this.nextNoteSpawnIdx = 0;
    this.rhythmNotes = [];

    // NOTE_TRACK_Y: above grill rack (grill at 0.50), between customer queue (~0.17) and grill.
    // 0.40 places the track just above the grill so notes look like they fly into the rack.
    this.noteTrackY = height * 0.42; // S5.1: down 2% so notes land closer to rack
    this.noteHitX = width / 2;
    this.noteSpawnX = width + 90;

    // Rhythm lane frame: keep the middle hit zone readable without covering notes.
    const lane = this.add.graphics().setDepth(9);
    const laneH = 98;
    lane.fillStyle(0x05070b, 0.46);
    lane.fillRoundedRect(width * 0.055, this.noteTrackY - laneH / 2, width * 0.89, laneH, 20);
    lane.lineStyle(2, 0xffb020, 0.52);
    lane.strokeRoundedRect(width * 0.055, this.noteTrackY - laneH / 2, width * 0.89, laneH, 20);
    lane.lineStyle(1, 0x66eaff, 0.34);
    lane.beginPath();
    lane.moveTo(width * 0.08, this.noteTrackY);
    lane.lineTo(width * 0.92, this.noteTrackY);
    lane.strokePath();

    const laneGlow = this.add.graphics().setDepth(9.5);
    laneGlow.fillStyle(0xff6b00, 0.08);
    laneGlow.fillEllipse(this.noteHitX, this.noteTrackY, 310, 118);
    laneGlow.lineStyle(2, 0xffe066, 0.20);
    laneGlow.strokeEllipse(this.noteHitX, this.noteTrackY, 330, 124);

    // Judgement target: brighter and larger so players read the timing point first.
    let judgeTarget: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
    if (this.textures.exists('ui-hit-zone')) {
      judgeTarget = this.add.image(this.noteHitX, this.noteTrackY, 'ui-hit-zone')
        .setDisplaySize(132, 132)
        .setDepth(11);
    } else {
      const judgeCircle = this.add.graphics();
      judgeCircle.fillStyle(0xfff0a0, 0.10);
      judgeCircle.fillCircle(this.noteHitX, this.noteTrackY, 48);
      judgeCircle.lineStyle(6, 0xffe066, 1);
      judgeCircle.strokeCircle(this.noteHitX, this.noteTrackY, 48);
      judgeCircle.lineStyle(2, 0xffffff, 0.9);
      judgeCircle.strokeCircle(this.noteHitX, this.noteTrackY, 30);
      judgeCircle.lineStyle(3, 0xff6b00, 0.95);
      judgeCircle.beginPath();
      judgeCircle.moveTo(this.noteHitX - 58, this.noteTrackY);
      judgeCircle.lineTo(this.noteHitX + 58, this.noteTrackY);
      judgeCircle.moveTo(this.noteHitX, this.noteTrackY - 58);
      judgeCircle.lineTo(this.noteHitX, this.noteTrackY + 58);
      judgeCircle.strokePath();
      judgeCircle.setDepth(10);
      judgeTarget = judgeCircle;
    }

    const timingCircle = this.add.graphics().setDepth(12);
    timingCircle.fillStyle(0x05080b, 0.42);
    timingCircle.fillCircle(this.noteHitX, this.noteTrackY, 28);
    timingCircle.lineStyle(4, 0xffffff, 0.88);
    timingCircle.strokeCircle(this.noteHitX, this.noteTrackY, 28);
    timingCircle.lineStyle(2, 0xfff066, 0.9);
    timingCircle.strokeCircle(this.noteHitX, this.noteTrackY, 20);

    this.tweens.add({
      targets: judgeTarget,
      alpha: { from: 0.92, to: 0.72 },
      scaleX: { from: 0.96, to: 1.04 },
      scaleY: { from: 0.96, to: 1.04 },
      duration: 920,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });

    this.add.text(this.noteHitX, this.noteTrackY + 66, 'HIT ZONE', {
      fontSize: '14px',
      fontFamily: FONT,
      color: '#ffe066',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10);

    // ── Wave 6b: Keyboard input ──────────────────────────────────────────────
    // D = 咚 DON (red), F = 喀 KA (blue) — left index/middle finger alternation
    this.input.keyboard?.on('keydown-D', () => {
      if (!this.rhythmStarted || this.isGloballyPaused()) {
        sfx.playDon();
        return;
      }
      this.handleRhythmPress('don');
    });
    this.input.keyboard?.on('keydown-F', () => {
      if (!this.rhythmStarted || this.isGloballyPaused()) {
        sfx.playKa();
        return;
      }
      this.handleRhythmPress('ka');
    });

    // Bottom instruction text only. No large D/F button UI.
    this.add.text(width / 2, height - 46, 'D = 咚     F = 喀', {
      fontSize: '30px',
      fontFamily: FONT,
      color: '#ffe066',
      stroke: '#000000',
      strokeThickness: 6,
      align: 'center',
    }).setOrigin(0.5).setDepth(51);

    // ── Wave 6b: Combo display text (center, hidden until combo >= 2) ──────
    const comboX = width * 0.5;
    const comboY = Math.max(118, this.noteTrackY - 132);
    if (this.textures.exists('ui-combo-badge')) {
      this.rhythmComboBadge = this.add.image(comboX, comboY, 'ui-combo-badge')
        .setDisplaySize(104, 52)
        .setDepth(48)
        .setAlpha(0);
    }
    this.rhythmComboText = this.add.text(comboX, comboY - 2, '', {
      fontSize: '22px',
      fontFamily: FONT,
      color: '#ffe066',
      stroke: '#2a0800',
      strokeThickness: 4,
      fontStyle: '900',
      align: 'center',
    }).setOrigin(0.5).setDepth(49).setAlpha(0);
  }

  /**
   * Called every update() tick.
   * Spawns notes whose time window has entered NOTE_LEAD_TIME,
   * moves existing notes, and removes notes that pass the hit line.
   */
  private updateRhythmTrack(): void {
    if (!this.chart) return;
    if (this.isGloballyPaused() || !this.rhythmStarted) return;

    const now = this.getRhythmTime();

    // Spawn notes whose hit time is within NOTE_LEAD_TIME from now
    while (this.nextNoteSpawnIdx < this.chart.notes.length) {
      const next = this.chart.notes[this.nextNoteSpawnIdx];
      if (next.t - now > this.NOTE_LEAD_TIME) break;
      const note = new RhythmNote(this, this.noteSpawnX, this.noteTrackY, next);
      note.setDepth(15);
      this.rhythmNotes.push(note);
      this.nextNoteSpawnIdx++;
    }

    // Move existing notes; handle auto-MISS for notes that passed the judgement window;
    // destroy notes that have flown well past the hit line.
    for (let i = this.rhythmNotes.length - 1; i >= 0; i--) {
      const n = this.rhythmNotes[i];
      n.setPositionByTime(now, n.note.t, this.noteHitX, this.noteSpawnX, this.NOTE_LEAD_TIME);

      // Auto-MISS: note time passed the good window and still not hit
      if (!n.isHit && n.note.t < now - getGoodWindowSeconds(gameState.difficulty)) {
        n.markHit();
        this.hitStats.miss += 1;
        this.updateStatsDisplay();
        this.rhythmCombo = 0;
        this.updateRhythmComboText();
        sfx.playRhythmMiss();
        this.showJudgementBig('MISS', '#aa3333', 18, 350);
        // Visual: grey out + reduce alpha, note continues flying off-screen
        n.setAlpha(0.4);
        // Wave 6e: service combo auto-MISS tracking
        if (n.note.isServiceCombo && n.note.serviceComboGroupId !== undefined) {
          const gid = n.note.serviceComboGroupId;
          const stats = this.serviceComboGroupHits.get(gid) ?? { hit: 0, seen: 0, total: this.getServiceComboGroupTotal(gid) };
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
      if (n.x < this.noteHitX - 120) {
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
    if (this.isDone || this.isGloballyPaused() || !this.rhythmStarted) return;

    const now = this.getRhythmTime();

    // FIFO judgement: only the FRONTMOST un-hit note within the good window
    // is eligible for scoring. Without this, a press could skip past an
    // about-to-MISS note and score on a later same-color note within the same
    // frame — the exact race that produces "PERFECT + MISS appearing together".
    let frontNote: RhythmNote | null = null;
    for (const n of this.rhythmNotes) {
      if (n.isHit) continue;
      // Notes still too far in the future haven't entered the press-eligible window
      if (n.note.t - now > getGoodWindowSeconds(gameState.difficulty)) continue;
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

    const judgement = judgeRhythmHit(frontNote.note.t, now, gameState.difficulty);
    if (judgement === null) {
      // Outside even the good window — auto-MISS handler will deal with it
      return;
    }

    const slot = this.grillSlots.find(s => !s.sausage);
    if (!slot) {
      frontNote.markHit();
      this.hitStats[judgement] += 1;
      this.updateStatsDisplay();
      this.rhythmCombo += 1;
      if (this.rhythmCombo > this.maxRhythmCombo) {
        this.maxRhythmCombo = this.rhythmCombo;
      }
      this.updateRhythmComboText();
      this.playRhythmComboMilestoneSfx();
      if (type === 'don') {
        sfx.playDon();
      } else {
        sfx.playKa();
      }
      this.burstHitZone(judgement);
      this.boostGrillFromRhythm(judgement);
      this.showFullGrillHeatSweep(judgement);
      sfx.playCrazyVoice();
      this.showJudgementBig('HEAT UP', '#ffcc33', 30, 500);
      this.showFeedback('烤架已滿：敲擊加速熟成', this.noteHitX, this.noteTrackY - 70, '#ffcc33');
      this.trackServiceComboHit(frontNote, judgement);
      if (frontNote.active) frontNote.destroy();
      const blockedIdx = this.rhythmNotes.indexOf(frontNote);
      if (blockedIdx >= 0) this.rhythmNotes.splice(blockedIdx, 1);
      return;
    }

    frontNote.markHit();

    // Rhythm hits should always resolve as rhythm hits. Stock is consumed while available,
    // but shortage must not interrupt the music lane or replace a correct judgement.
    const noteTypeId = frontNote.note.sausage;
    const noteStock = this.inventoryCopy[noteTypeId] ?? 0;
    if (noteStock > 0) {
      this.inventoryCopy[noteTypeId]--;
      if (this.inventoryCopy[noteTypeId] <= 0) {
        delete this.inventoryCopy[noteTypeId];
      }
    }

    // Update stats and combo
    this.hitStats[judgement] += 1;
    this.updateStatsDisplay();
    this.rhythmCombo += 1;
    if (this.rhythmCombo > this.maxRhythmCombo) {
      this.maxRhythmCombo = this.rhythmCombo;
    }
    this.updateRhythmComboText();
    this.playRhythmComboMilestoneSfx();

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
    this.burstHitZone(judgement);

    // Floating judgement text (音遊化大字)
    if (judgement === 'perfect') {
      this.showJudgementBig('PERFECT', '#ffd700', 48, 700);
    } else if (judgement === 'great') {
      this.showJudgementBig('GREAT', '#c0c0c0', 36, 600);
    } else {
      this.showJudgementBig('GOOD', '#cd7f32', 28, 500);
    }

    // Wave 6c: fly hit note into grill slot
    // Full grill was handled as BLOCKED before stats/inventory changes.
    // Capture for closures
    const hitNote = frontNote;
    const hitJudgement = judgement;

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

    this.trackServiceComboHit(frontNote, judgement);
  }

  /**
   * Wave 6e: Record a hit or miss for service combo notes.
   * When all notes in a group have been processed (seen == total), trigger batch serve.
   */
  private trackServiceComboHit(note: RhythmNote, judgement: HitJudgement): void {
    if (!note.note.isServiceCombo || note.note.serviceComboGroupId === undefined) return;
    const gid = note.note.serviceComboGroupId;
    const stats = this.serviceComboGroupHits.get(gid) ?? { hit: 0, seen: 0, total: this.getServiceComboGroupTotal(gid) };
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

  private getServiceComboGroupTotal(gid: number): number {
    if (!this.chart) return 1;
    return Math.max(1, this.chart.notes.filter(
      note => note.isServiceCombo && note.serviceComboGroupId === gid,
    ).length);
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
      sfx.playCombo10ChtVoice();
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
      this.rhythmComboBadge?.setAlpha(0);
      return;
    }
    this.rhythmComboBadge?.setAlpha(0.42);
    this.rhythmComboText
      .setText(`x${this.rhythmCombo}`)
      .setAlpha(1)
      .setFontSize(Math.min(28, 20 + Math.floor(this.rhythmCombo / 8)));

    // Bounce tween for feedback
    this.tweens.add({
      targets: [this.rhythmComboText, this.rhythmComboBadge].filter(Boolean),
      scaleX: 1.08,
      scaleY: 1.08,
      angle: { from: -2, to: 2 },
      duration: 90,
      yoyo: true,
      ease: 'Back.Out',
    });
  }

  // ── Wave 6cd: BGM sync helpers ────────────────────────────────────────────

  private playRhythmComboMilestoneSfx(): void {
    const milestone = getComboMilestone(this.rhythmCombo);
    if (!milestone) return;

    if (this.rhythmCombo !== milestone || this.rhythmComboSfxPlayed.has(milestone)) return;

    this.rhythmComboSfxPlayed.add(milestone);
    if (milestone === 10) {
      sfx.playCombo10Voice();
    } else if (milestone === 20) {
      sfx.playCombo20Voice();
    } else if (milestone === 50) {
      sfx.playCombo50Voice();
    } else if (milestone === 100) {
      sfx.playCombo100Voice();
      this.playCombo100Cutin();
    }
  }

  private playCombo100Cutin(): void {
    if (this.combo100CutinPlayed || this.combo100CutinContainer?.active) return;
    this.combo100CutinPlayed = true;

    const x = this.scale.width / 2;
    const y = (this.wzY || this.scale.height * 0.72) + 8;
    const maxH = Math.min(210, this.scale.height * 0.25);
    const maxW = maxH * (9 / 16);
    const container = this.add.container(x, y).setDepth(18).setAlpha(0);
    this.combo100CutinContainer = container;
    const maskGfx = this.add.graphics().setVisible(false);
    maskGfx.fillStyle(0xffffff, 1);
    maskGfx.fillRect(x - maxW / 2, y - maxH / 2, maxW, maxH);
    const videoMask = maskGfx.createGeometryMask();

    const frame = this.add.graphics();
    frame.fillStyle(0x120402, 0.72);
    frame.lineStyle(2, 0xffd447, 0.86);
    frame.fillRoundedRect(-maxW / 2 - 8, -maxH / 2 - 8, maxW + 16, maxH + 16, 10);
    frame.strokeRoundedRect(-maxW / 2 - 8, -maxH / 2 - 8, maxW + 16, maxH + 16, 10);
    container.add(frame);
    const fallbackBg = this.add.rectangle(0, 0, maxW, maxH, 0x1a0703, 0.88)
      .setStrokeStyle(1, 0xff8844, 0.5);
    const fallbackLabel = this.add.text(0, -14, '100 COMBO', {
      fontSize: '22px',
      fontFamily: FONT,
      color: '#ffe066',
      stroke: '#260800',
      strokeThickness: 5,
      fontStyle: '900',
    }).setOrigin(0.5);
    const fallbackHint = this.add.text(0, 22, '影片待機位', {
      fontSize: '13px',
      fontFamily: FONT,
      color: '#ffc890',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);
    container.add([fallbackBg, fallbackLabel, fallbackHint]);

    const cleanup = () => {
      if (!container.active) return;
      this.tweens.add({
        targets: container,
        alpha: 0,
        scaleX: 0.92,
        scaleY: 0.92,
        duration: 300,
        ease: 'Sine.easeIn',
        onComplete: () => {
          maskGfx.destroy();
          container.destroy(true);
          if (this.combo100CutinContainer === container) {
            this.combo100CutinContainer = null;
          }
        },
      });
    };

    const showFallback = () => {
      if (!container.active) return;
      this.time.delayedCall(1800, cleanup);
    };

    fetch(COMBO_100_VIDEO_URL, { method: 'HEAD' })
      .then(response => {
        const contentType = response.headers.get('content-type') ?? '';
        if (!response.ok || !contentType.startsWith('video/')) {
          showFallback();
          return;
        }
        if (!container.active) return;
        const video = this.add.video(0, 0);
        const fitVideo = () => {
          const sourceW = video.video?.videoWidth || video.width || maxW;
          const sourceH = video.video?.videoHeight || video.height || maxH;
          const fitScale = Math.min(maxW / sourceW, maxH / sourceH);
          video.setScale(fitScale).setDepth(18.5);
        };
        video.setMask(videoMask);
        fitVideo();
        video.loadURL(COMBO_100_VIDEO_URL, true);
        video.on(Phaser.GameObjects.Events.VIDEO_METADATA, fitVideo);
        video.on(Phaser.GameObjects.Events.VIDEO_CREATED, fitVideo);
        video.on(Phaser.GameObjects.Events.VIDEO_PLAYING, fitVideo);
        video.once(Phaser.GameObjects.Events.VIDEO_COMPLETE, cleanup);
        video.once(Phaser.GameObjects.Events.VIDEO_ERROR, showFallback);
        container.add(video);
        fallbackBg.setVisible(false);
        fallbackLabel.setVisible(false);
        fallbackHint.setVisible(false);
        video.play(false);
        this.time.delayedCall(100, fitVideo);
        this.time.delayedCall(350, fitVideo);
        this.time.delayedCall(5200, cleanup);
      })
      .catch(showFallback);

    this.tweens.add({
      targets: container,
      alpha: 1,
      scaleX: { from: 0.88, to: 1 },
      scaleY: { from: 0.88, to: 1 },
      duration: 220,
      ease: 'Back.Out',
    });
  }

  /** Returns current rhythm clock in seconds (Web Audio API, μs precision).
   *  After BGM ends, audioContext.currentTime keeps running — used to advance
   *  past BGM into the chart's extended tail (chart.duration > bgm.duration).
   */
  private getRhythmTime(): number {
    if (!this.bgmCtx) return 0;
    if (this.bgmPaused) return this.bgmElapsedAtPause;
    // bgmFinished: BGM source stopped but clock is still valid via bgmStartCtxTime
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

      const bgmKey = gameState.difficulty === 'hardcore' ? 'bgm-grill-theme-ex' : 'bgm-grill-theme';
      const cached = this.cache.audio.get(bgmKey) as unknown;
      if (!(cached instanceof AudioBuffer)) {
        console.warn(`[GrillScene] ${bgmKey} AudioBuffer not in cache`);
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

    // Redistribute sausage types on notes based on player's morning purchases
    this.redistributeNoteSausages();
    this.generateCustomerPool();

    this.rhythmStarted = true;
    this.nextNoteSpawnIdx = 0;
    this.rhythmNotes.forEach(n => { if (n.active) n.destroy(); });
    this.rhythmNotes = [];
    this.paused = false;
    // 重置對白計時
    this.quoteTimer = 0;
    this.quoteNextTrigger = 5 + Math.random() * 3;
    EventBus.emit('scene-ready', 'GrillScene');
  }

  /**
   * Wave 6e: Inject service combo note groups (6 gold notes every 15 seconds)
   * into the chart after it loads, before the rhythm game begins.
   */
  private injectServiceComboNotes(): void {
    if (!this.chart) return;

    const {
      interval: SERVICE_INTERVAL,
      noteCount: SERVICE_NOTE_COUNT,
      noteSpacing: SERVICE_NOTE_SPACING,
      protectBuffer: SERVICE_PROTECT_BUFFER,
    } = getServiceComboConfig(this.getBalanceInput());
    const duration = this.chart.duration;

    const SERVICE_SAUSAGE_POOL = [
      'flying-fish-roe', 'cheese', 'big-taste', 'big-wrap-small', 'great-wall',
    ];

    // Start with a mutable copy of existing chart notes
    const workingNotes: ChartNote[] = [...this.chart.notes];
    const serviceNotes: ChartNote[] = [];
    let groupId = 0;

    for (let t = SERVICE_INTERVAL; t < duration - 5; t += SERVICE_INTERVAL) {
      const groupStart = t - SERVICE_PROTECT_BUFFER;
      const groupEnd   = t + (SERVICE_NOTE_COUNT - 1) * SERVICE_NOTE_SPACING + SERVICE_PROTECT_BUFFER;

      // Remove any non-service-combo notes in the protected time window
      for (let i = workingNotes.length - 1; i >= 0; i--) {
        const n = workingNotes[i];
        if (n.isServiceCombo) continue; // skip already-injected service notes
        if (n.t >= groupStart && n.t <= groupEnd) {
          workingNotes.splice(i, 1);
        }
      }

      // Insert one compact service combo group.
      for (let i = 0; i < SERVICE_NOTE_COUNT; i++) {
        const noteT = t + i * SERVICE_NOTE_SPACING;
        const noteType: NoteType = i % 2 === 0 ? 'don' : 'ka';
        const sausageType =
          SERVICE_SAUSAGE_POOL[Math.floor(Math.random() * SERVICE_SAUSAGE_POOL.length)];
        serviceNotes.push({
          t: noteT,
          type: noteType,
          sausage: sausageType,
          isServiceCombo: true,
          serviceComboGroupId: groupId,
        });
      }
      groupId++;
    }

    const allNotes = [...workingNotes, ...serviceNotes].sort((a, b) => a.t - b.t);
    this.chart = {
      ...this.chart,
      notes: allNotes,
      totalNotes: allNotes.length,
    };
    this.totalServiceComboGroupCount = groupId;
    // Initialize hit tracker for each group
    this.serviceComboGroupHits.clear();
    for (let gid = 0; gid < groupId; gid++) {
      this.serviceComboGroupHits.set(gid, { hit: 0, seen: 0, total: SERVICE_NOTE_COUNT });
    }
    this.serviceComboBatchFired.clear();
  }

  /**
   * Redistribute non-service-combo note sausage types from morning purchases.
   * The rhythm chart length is preserved; inventory is still enforced when placing.
   */
  private redistributeNoteSausages(): void {
    if (!this.chart) return;
    this.redistributeNoteSausagesFromStock();
  }

  private redistributeNoteSausagesFromStock(): void {
    if (!this.chart) return;
    const chart = this.chart;
    const actualStock = { ...gameState.inventory };
    const purchases = gameState.purchaseQuantities ?? {};
    const hasPurchases = Object.values(purchases).some(q => q > 0);
    const sourceEntries = hasPurchases ? Object.entries(purchases) : Object.entries(actualStock);

    const stockPool: string[] = [];
    for (const [sausageId, requestedQty] of sourceEntries) {
      const availableQty = actualStock[sausageId] ?? 0;
      const allocQty = Math.min(Math.max(0, Math.floor(requestedQty)), availableQty);
      for (let n = 0; n < allocQty; n++) stockPool.push(sausageId);
    }

    for (let i = stockPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [stockPool[i], stockPool[j]] = [stockPool[j], stockPool[i]];
    }

    if (stockPool.length === 0) return;

    let stockIdx = 0;
    const notes = chart.notes.map(note => {
      if (note.isServiceCombo) return note;
      const sausage = stockPool[stockIdx % stockPool.length];
      stockIdx++;
      return { ...note, sausage };
    });
    this.chart = {
      ...chart,
      notes,
      totalNotes: notes.length,
    };
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
      // Do NOT call onChartComplete here — chart may extend past BGM duration.
      // onChartComplete is triggered by update() when last note + 3s buffer has passed.
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
   * Called when chart is complete and the 5s post-chart grilling window has passed.
   * Guards against double-invocation — only the first call triggers end-of-day.
   */
  private onChartComplete(): void {
    if (this.chartCompleteFired || this.isDone) return;
    this.chartCompleteFired = true;
    console.debug(
      `[GrillScene] Chart complete — serviceComboGroups: ${this.totalServiceComboGroupCount}`,
    );
    this.endGrilling();
  }

  private onDevEndGrillSession = (): void => {
    if (this.isDone) return;
    this.onChartComplete();
  };

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
    sprite.setDepth(4); // S7.8: depth 4, above rackBack(2) — no rackFront currently
    const slotIndex = this.grillSlots.indexOf(slot);

    // S1.5: double-click manual serve removed — auto-managed by rhythm system
    sprite.on('pointerover', () => { this.hoveredSlotIndex = slotIndex; });
    sprite.on('pointerout', () => { if (this.hoveredSlotIndex === slotIndex) this.hoveredSlotIndex = null; });

    slot.sausage = sausage;
    slot.sprite = sprite;
    slot.__carbonWarnShown = false;
    slot.__burntWarnShown = false;
    slot.__isPressingBtn = false;
    this.addSlotShadow(slot); // S5.1: shadow under sausage
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
    }
  }

  private boostGrillFromRhythm(judgement: HitJudgement): void {
    const boost = getRhythmHeatBoost(judgement);
    if (boost <= 0) return;

    for (const slot of this.grillSlots) {
      if (!slot.sausage || !slot.sprite || slot.sausage.served || !slot.sausage.rhythmAccuracy) continue;
      const target = getAutoGrillTarget(slot.sausage.rhythmAccuracy);
      const updated: GrillingSausage = {
        ...slot.sausage,
        topDoneness: Math.min(target, slot.sausage.topDoneness + boost),
        bottomDoneness: Math.min(target, slot.sausage.bottomDoneness + boost),
      };
      updated.topStage = getCookingStage(updated.topDoneness);
      updated.bottomStage = getCookingStage(updated.bottomDoneness);
      slot.sausage = updated;
      slot.sprite.updateData(updated);
      this.tweens.add({
        targets: slot.sprite,
        scaleX: 1.08,
        scaleY: 1.08,
        duration: 80,
        yoyo: true,
        ease: 'Quad.Out',
      });
    }

    this.autoServeReady();
  }

  private showFullGrillHeatSweep(judgement: HitJudgement): void {
    const color =
      judgement === 'perfect' ? 0xfff066 :
      judgement === 'great' ? 0x66ddff :
      0xff8844;
    const { width, height } = this.scale;
    const y = height * GRILL_Y_FRAC;

    const sweep = this.add.rectangle(width / 2, y, width * 0.88, 92, color, 0.18)
      .setDepth(18)
      .setScale(0.12, 1);
    this.tweens.add({
      targets: sweep,
      scaleX: 1,
      alpha: 0,
      duration: 280,
      ease: 'Cubic.Out',
      onComplete: () => sweep.destroy(),
    });

    const flare = this.add.graphics().setDepth(19);
    flare.lineStyle(5, color, 0.95);
    for (const slot of this.grillSlots) {
      if (!slot.sausage) continue;
      flare.strokeCircle(slot.x, slot.y, 38);
      flare.lineBetween(slot.x - 28, slot.y + 22, slot.x + 28, slot.y - 22);
    }
    this.tweens.add({
      targets: flare,
      alpha: 0,
      scaleX: 1.18,
      scaleY: 1.18,
      duration: 260,
      ease: 'Quad.Out',
      onComplete: () => flare.destroy(),
    });

    this.cameras.main.shake(90, judgement === 'perfect' ? 0.004 : 0.0025);
  }

  /**
   * Auto-pack: serve a small burst from warming slots on a balance-controlled timer.
   */
  private tryAutoPack(): void {
    const config = getAutoServeConfig(gameState.upgrades['auto-grill']);
    const count = Phaser.Math.Between(config.minBurst, config.maxBurst);
    for (let n = 0; n < count; n++) {
      const slot = this.warmingSlots.find(ws => ws.sausage !== null);
      if (!slot) break;
      this.serveFromWarming(slot);
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

  // S7.8 depth table (layout contract — do not adjust without updating all affected setDepth calls):
  // 0    : 背景 / queue-bg
  // 2    : rackBack（後桿 4 條 + 後半側軌）
  // 3    : 香腸陰影
  // 4    : 香腸 sprite
  // 10-15: HUD（timer / stats / 排隊客人 label / 候補 label）
  // 50-51: don/ka 觸控按鈕
  // 200  : 對白氣泡 / 圍觀反應 / commentBubble
  // 300  : 奧客事件 splash
  private drawGrillRack(width: number, height: number): void {
    const grillY = height * GRILL_Y_FRAC + 34;
    // Grill rack centered on screen
    const maxSlots = gameState.upgrades['grill-expand'] ? 12 : MAX_GRILL_SLOTS;
    const rackW = 100 * maxSlots + 60;
    const barStartX = (width - rackW) / 2;
    const barEndX = barStartX + rackW;
    const barCount = 9;
    const barSpacing = 16;

    // Fire glow below rack (stored for update)
    this.fireGlowGfx = this.add.graphics();
    this.redrawFireGlow(barStartX, grillY + barCount * barSpacing, barEndX - barStartX);

    // S7.8: rackBack (bars i=0..3, side-rail back half) — depth 2, behind sausages
    // rackFront was removed in S6.3 (user request). No rackFront currently.
    const rackBack = this.add.graphics();
    rackBack.setDepth(2);

    // Back horizontal bars (i=0..3, top portion — appear behind sausages)
    rackBack.lineStyle(4, 0x666666, 1);
    for (let i = 0; i < 4; i++) {
      const y = grillY + i * barSpacing;
      rackBack.beginPath();
      rackBack.moveTo(barStartX, y);
      rackBack.lineTo(barEndX, y);
      rackBack.strokePath();
    }

    // Side rails (back half — upper portion)
    rackBack.lineStyle(6, 0x555555, 1);
    rackBack.beginPath();
    rackBack.moveTo(barStartX, grillY);
    rackBack.lineTo(barStartX, grillY + 3 * barSpacing);
    rackBack.strokePath();

    rackBack.beginPath();
    rackBack.moveTo(barEndX, grillY);
    rackBack.lineTo(barEndX, grillY + 3 * barSpacing);
    rackBack.strokePath();

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
    // S7.8: y positioned to sit on rack bar #3 (rackBack range)
    const grillY = height * GRILL_Y_FRAC + 34 + 32;
    const slotSpacing = Math.max(70, Math.min(100, (width * 0.85) / slotCount));
    const totalW = slotSpacing * slotCount;
    const startX = (width - totalW) / 2 + slotSpacing / 2; // centered

    for (let i = 0; i < slotCount; i++) {
      const x = startX + i * slotSpacing;
      const slot: GrillSlot = { sprite: null, sausage: null, x, y: grillY, placeholderGfx: null, serveBtn: null };
      this.grillSlots.push(slot);
      this.drawEmptySlotPlaceholder(slot);
    }
  }

  /** S5.1: Create ellipse shadow for a slot when a sausage lands on it (depth 3). */
  private addSlotShadow(slot: GrillSlot): void {
    // Remove previous shadow if any
    if (slot.__shadowGfx) { slot.__shadowGfx.destroy(); slot.__shadowGfx = null; }
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.35);
    shadow.fillEllipse(slot.x, slot.y + 24, 80, 16);
    shadow.setDepth(3);
    slot.__shadowGfx = shadow;
  }

  /** S5.1: Destroy the slot shadow when sausage is removed. */
  private removeSlotShadow(slot: GrillSlot): void {
    if (slot.__shadowGfx) { slot.__shadowGfx.destroy(); slot.__shadowGfx = null; }
  }

  private addOneGrillSlot(): void {
    const { width, height } = this.scale;
    // S5.1: y moved down to sit on rack bar #3
    const grillY = height * GRILL_Y_FRAC + 34 + 32;
    const slotSpacing = 100;
    const slotCount = this.grillSlots.length + 1;
    const totalW = slotSpacing * slotCount;
    const startX = (width - totalW) / 2 + slotSpacing / 2;
    const i = this.grillSlots.length; // index of the new slot
    const x = startX + i * slotSpacing;
    const slot: GrillSlot = { sprite: null, sausage: null, x, y: grillY, placeholderGfx: null, serveBtn: null };
    this.grillSlots.push(slot);
    this.drawEmptySlotPlaceholder(slot);
  }

  private drawEmptySlotPlaceholder(slot: GrillSlot): void {
    // Remove old placeholder if exists
    if (slot.placeholderGfx) {
      slot.placeholderGfx.__frameImage?.destroy();
      slot.placeholderGfx.destroy();
      slot.placeholderGfx = null;
    }
    if (slot.sausage) return; // occupied — no placeholder

    const frameImage = this.textures.exists('ui-grill-slot')
      ? this.add.image(slot.x, slot.y, 'ui-grill-slot')
          .setDisplaySize(76, 58)
          .setAlpha(0.72)
          .setDepth(2.5)
      : null;

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
    if (frameImage) gfx.__frameImage = frameImage;
    slot.placeholderGfx = gfx;
  }

  private clearSlotPlaceholder(slot: GrillSlot): void {
    if (slot.placeholderGfx) {
      const zone = slot.placeholderGfx.__hitZone;
      if (zone) zone.destroy();
      slot.placeholderGfx.__frameImage?.destroy();
      slot.placeholderGfx.destroy();
      slot.placeholderGfx = null;
    }
  }

  // Warming zone config (stored for dynamic slot creation)
  private wzX = 0;
  private wzY = 0;
  private wzSlotW = 0;

  private setupWarmingZone(width: number, height: number): void {
    this.wzSlotW = Math.min(width * 0.56, 940);
    this.wzX = (width - this.wzSlotW) / 2;    // centered horizontally
    this.wzY = height * 0.72;                 // below grill rack

    if (this.textures.exists('ui-warming-slot')) {
      const boxW = this.wzSlotW * 0.44;
      const boxH = 132;
      const leftBoxX = this.wzX + this.wzSlotW * 0.25;
      const rightBoxX = this.wzX + this.wzSlotW * 0.75;
      [leftBoxX, rightBoxX].forEach(boxX => {
        this.add.image(boxX, this.wzY + 58, 'ui-warming-slot')
          .setDisplaySize(boxW, boxH)
          .setAlpha(0.76)
          .setDepth(3.5);
      });
    }

    // Create initial 16 empty slots (4 columns × 4 rows)
    for (let i = 0; i < 16; i++) {
      this.createWarmingSlotVisual();
    }

  }

  private createWarmingSlotVisual(): WarmingSlot {
    const idx = this.warmingSlots.length;
    const slotsPerPlate = 8;
    const plate = Math.floor(idx / slotsPerPlate) % 2;
    const localIdx = idx % slotsPerPlate;
    const row = Math.floor(localIdx / 4) + Math.floor(idx / (slotsPerPlate * 2)) * 2;
    const col = localIdx % 4;
    const plateW = this.wzSlotW * 0.44;
    const innerPlateW = plateW * 0.68;
    const slotW = innerPlateW / 4;
    const slotH = 42;
    const plateCenterX = this.wzX + this.wzSlotW * (plate === 0 ? 0.25 : 0.75);
    const sx = plateCenterX - innerPlateW / 2 + col * slotW;
    const sy = this.wzY + 18 + row * 31;
    const wx = sx + slotW / 2;
    const wy = sy + slotH / 2;

    const bgGfx = this.add.graphics();
    bgGfx.setDepth(4.2);

    const infoText = this.add.text(wx, wy, '', {
      fontSize: '1px',
      fontFamily: FONT,
      color: COLOR_DIM,
    }).setOrigin(0.5).setVisible(false);

    const stateText = this.add.text(wx + slotW * 0.28, wy - 16, '', {
      fontSize: '10px',
      fontFamily: FONT,
      color: '#ffe8a3',
      stroke: '#160500',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(6);

    const sausageImage = this.add.image(wx, wy + 2, 'sausage-flying-fish-roe')
      .setDisplaySize(68, 34)
      .setDepth(5.5)
      .setVisible(false);

    const slot: WarmingSlot = { sausage: null, x: wx, y: wy, bgGfx, infoText, stateText, sausageImage };
    this.warmingSlots.push(slot);

    // Make clickable
    const hitZone = this.add.zone(wx, wy, slotW, slotH).setInteractive({ cursor: 'pointer' });
    hitZone.on('pointerdown', () => this.serveFromWarming(slot));
    hitZone.on('pointerover', () => {
      if (slot.sausage && slot.bgGfx) {
        this.redrawWarmingSlotBgQuality(slot, sx, sy, slotW, slotH, true);
      }
    });
    hitZone.on('pointerout', () => {
      if (!slot.bgGfx) return;
      if (slot.sausage) {
        this.redrawWarmingSlotBgQuality(slot, sx, sy, slotW, slotH);
      } else {
        this.redrawWarmingSlotBg(slot, sx, sy, slotW, slotH);
      }
    });

    slot.__x = sx;
    slot.__y = sy;
    slot.__w = slotW;
    slot.__h = slotH;

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
      return;
    }
    this.redrawWarmingSlotBgQuality(slot, x, y, w, h);
  }

  // Quality-tinted warming slot background: border color based on grill quality
  private redrawWarmingSlotBgQuality(slot: WarmingSlot, x: number, y: number, w: number, h: number, hover = false): void {
    if (!slot.bgGfx || !slot.sausage) return;
    const qualityColor = this.getQualityColor(slot.sausage.grillQuality);
    slot.bgGfx.clear();
    slot.bgGfx.lineStyle(hover ? 3 : 2, qualityColor, hover ? 0.95 : 0.55);
    slot.bgGfx.fillStyle(qualityColor, hover ? 0.18 : 0.09);
    slot.bgGfx.fillEllipse(x + w / 2, y + h / 2 + 9, w * 0.68, 15);
    slot.bgGfx.strokeEllipse(x + w / 2, y + h / 2 + 8, w * 0.76, 23);
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
    if (slot.sausageImage) {
      const textureKey = `sausage-${ws.sausageTypeId}`;
      if (this.textures.exists(textureKey)) {
        slot.sausageImage.setTexture(textureKey);
      }
      slot.sausageImage
        .setVisible(true)
        .setAlpha(ws.warmingState === 'cold' ? 0.62 : 1)
        .setTint(ws.warmingState === 'cold' ? 0x8aa0aa : 0xffffff);
    }

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
    if (slot.sausageImage) {
      slot.sausageImage.clearTint();
      slot.sausageImage.setVisible(false);
    }

    const x = slot.__x ?? 0;
    const y = slot.__y ?? 0;
    const w = slot.__w ?? 0;
    const h = slot.__h ?? 0;
    this.redrawWarmingSlotBg(slot, x, y, w, h);
  }

  private setupCustomerQueue(width: number, _height: number): void {
    const queueY = this.queueY;
    if (this.textures.exists('ui-customer-queue-bg')) {
      this.add.image(width / 2, queueY + 8, 'ui-customer-queue-bg')
        .setDisplaySize(Math.min(width * 0.88, 1180), 118)
        .setAlpha(0.5)
        .setDepth(0);
    } else if (this.textures.exists('queue-bg')) {
      const qbg = this.add.image(width / 2, queueY, 'queue-bg');
      qbg.setDisplaySize(width, 100).setAlpha(0.5).setDepth(0);
    }
    // S7.1: Center queue: 6 slots × 200px = 1200px wide, x offset 40
    const queueX = Math.round((width - MAX_VISIBLE_CUSTOMERS * 200) / 2);
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

    // S7.1: Candidate label — shows "候補 +N" when hidden waiting customers > 0
    this.candidateLabel = this.add.text(width - 12, queueY - 22, '候補 +0', {
      fontSize: '12px',
      fontFamily: FONT,
      color: COLOR_DIM,
    }).setOrigin(1, 0).setDepth(10).setVisible(false);
  }


  private setupHUD(width: number, _height: number): void {
    // ── Top left: timer ──────────────────────────────────────────────────
    if (this.textures.exists('ui-fire-meter')) {
      this.add.image(112, 64, 'ui-fire-meter')
        .setDisplaySize(190, 48)
        .setAlpha(0.62)
        .setDepth(9);
    }

    this.timerText = this.add.text(24, 55, `${this.timeLeft}s`, {
      fontSize: '18px',
      fontFamily: FONT,
      color: '#ffcc44',
      stroke: '#000000',
      strokeThickness: 3,
    }).setDepth(10);

    // ── Top right: day / status ──────────────────────────────────────────
    if (this.textures.exists('ui-day-chip')) {
      this.add.image(width - 110, 24, 'ui-day-chip')
        .setDisplaySize(180, 54)
        .setAlpha(0.72)
        .setDepth(9);
    }
    this.add.text(width - 44, 14, `Day ${gameState.day}`, {
      fontSize: '15px',
      fontFamily: FONT,
      color: '#ffe8a3',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(1, 0).setDepth(10);

    // ── Top-right stats display ──────────────────────────────────────────
    const statsX = width - 176;
    const statsY = 55; // below the status bar
    const statOffsets = [-65, -24, 18, 60];
    const statsBack = this.add.graphics();
    statsBack.fillStyle(0x100402, 0.72);
    statsBack.lineStyle(1.5, 0xffcc44, 0.62);
    statsBack.fillRoundedRect(statsX - 210, statsY - 16, 420, 132, 10);
    statsBack.strokeRoundedRect(statsX - 210, statsY - 16, 420, 132, 10);
    statsBack.setDepth(80);
    const ensureStatsPanel = () => {
      if (this.statsPanelImage?.active || !this.textures.exists('ui-rhythm-stats-panel')) return;
      this.statsPanelImage = this.add.image(statsX, statsY + 48, 'ui-rhythm-stats-panel')
        .setDisplaySize(420, 140)
        .setAlpha(1)
        .setDepth(81);
    };
    ensureStatsPanel();
    this.time.delayedCall(100, ensureStatsPanel);

    this.statsText = this.add.text(statsX, statsY + 12, '', {
      fontSize: '1px',
      fontFamily: FONT,
    }).setOrigin(0.5, 0).setDepth(82).setVisible(false);

    this.statNumberTexts = statOffsets.map(offset => this.add.text(statsX + offset, statsY + 60, '0', {
      fontSize: '15px',
      fontFamily: FONT,
      color: '#fff5d6',
      stroke: '#160500',
      strokeThickness: 3,
      align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(82));

    const moneyBack = this.add.graphics();
    moneyBack.fillStyle(0x120604, 0.72);
    moneyBack.lineStyle(1.5, 0xffcc44, 0.58);
    moneyBack.fillRoundedRect(width / 2 - 96, statsY - 18, 192, 70, 32);
    moneyBack.strokeRoundedRect(width / 2 - 96, statsY - 18, 192, 70, 32);
    moneyBack.setDepth(8);
    if (this.textures.exists('ui-money-chip')) {
      this.add.image(width / 2, statsY + 16, 'ui-money-chip')
        .setCrop(20, 24, 472, 202)
        .setDisplaySize(192, 76)
        .setAlpha(0.9)
        .setDepth(9);
    }
    this.revenueText = this.add.text(width / 2 + 12, statsY + 17, '$0', {
      fontSize: '15px',
      fontFamily: FONT,
      color: '#ffe8a3',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10);

    // ── Combo counter (hidden until combo >= 2) ──────────────────────────
    this.comboText = this.add.text(width / 2, 32, '', {
      fontSize: '16px',
      fontFamily: FONT,
      color: '#ffd700',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(100).setAlpha(0);
  }

  // ── Wave 4c: SpectatorCrowd setup ────────────────────────────────────────

  private setupSpectatorCrowd(width: number, height: number): void {
    // 放在暖盤區下方（暖盤在 height*0.72），往下展開半圓形圍觀者
    // 選 height*0.86 作為中心
    const crowdX = width / 2;
    const crowdY = height * 0.86;

    this.spectatorCrowd = new SpectatorCrowd(this, crowdX, crowdY);
    this.spectatorCrowd.setLayoutSlots(this.getSpectatorSideSlots(width, height, crowdX, crowdY));
    this.spectatorCrowd.setDepth(5); // 在 HUD 下、香腸上

    // 注目度數字：右上角（statsText 下方，避免重疊）
    const pressX = width - 10;
    const pressY = 132; // stats panel sits above this
    this.pressureLevelText = this.add.text(pressX, pressY, '注目 0.0', {
      fontSize: '13px',
      fontFamily: FONT,
      color: '#888888',
      backgroundColor: '#000000aa',
      padding: { x: 6, y: 3 },
    }).setOrigin(1, 0).setDepth(15);
  }

  // ── Game logic ─────────────────────────────────────────────────────────────

  private getSpectatorSideSlots(
    width: number,
    height: number,
    crowdX: number,
    crowdY: number,
  ): { targetX: number; targetY: number }[] {
    const warmWidth = Math.min(width * 0.56, 940);
    const warmX = (width - warmWidth) / 2;
    const plateWidth = warmWidth * 0.44;
    const leftPlateLeft = warmX + warmWidth * 0.25 - plateWidth / 2;
    const rightPlateRight = warmX + warmWidth * 0.75 + plateWidth / 2;

    const margin = Math.max(82, width * 0.045);
    const spectatorSpacing = 136;
    const baseY = height * 0.86;
    const rows = [baseY - 10, baseY + 30, baseY + 2];
    const leftStartX = Phaser.Math.Clamp(leftPlateLeft - spectatorSpacing * 2, margin, leftPlateLeft);
    const rightStartX = Phaser.Math.Clamp(rightPlateRight, rightPlateRight, width - margin - spectatorSpacing * 2);

    const slots = [
      { x: leftStartX, y: rows[0] },
      { x: leftStartX + spectatorSpacing, y: rows[1] },
      { x: leftStartX + spectatorSpacing * 2, y: rows[2] },
      { x: rightStartX, y: rows[2] },
      { x: rightStartX + spectatorSpacing, y: rows[1] },
      { x: rightStartX + spectatorSpacing * 2, y: rows[0] },
    ];

    return slots.map(slot => ({
      targetX: Phaser.Math.Clamp(slot.x, margin, width - margin) - crowdX,
      targetY: slot.y - crowdY,
    }));
  }

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

  // S3: target order density for customer pacing.
  private readonly AVG_SAUSAGES_PER_ORDER = 4;

  private getCustomerTrafficNorm(): number {
    const playerSlotData = GRID_SLOTS.find(s => s.tier === gameState.playerSlot) ?? GRID_SLOTS[0];
    const baseTraffic = playerSlotData.baseTraffic * playerSlotData.trafficMultiplier;
    const rawTraffic = baseTraffic / 20;
    return Math.max(1, Math.min(5, rawTraffic));
  }

  private refillCustomerQueue(minPending = this.MIN_PENDING_CUSTOMERS): void {
    if (this.pendingCustomerQueue.length >= minPending) return;

    let pool = generateCustomers(this.getCustomerTrafficNorm(), this.sessionTrafficBonus);
    while (this.pendingCustomerQueue.length + pool.length < minPending) {
      pool = pool.concat(generateCustomers(this.getCustomerTrafficNorm(), this.sessionTrafficBonus));
    }

    const needed = minPending - this.pendingCustomerQueue.length;
    this.pendingCustomerQueue.push(...pool.slice(0, needed));
  }

  private generateCustomerPool(): void {
    const trafficNorm = this.getCustomerTrafficNorm();

    const socialPrepBonus = gameState.morningPrep === 'social' ? 0.1 : 0;
    const marketingBonus = (gameState.upgrades['neon-sign'] ? 0.15 : 0) + (gameState.dailyTrafficBonus ?? 0) + socialPrepBonus;
    this.sessionTrafficBonus = marketingBonus;
    updateGameState({ dailyTrafficBonus: 0 });

    const totalNotes = this.chart?.totalNotes ?? 286;
    const chartTarget = Math.ceil(totalNotes / this.AVG_SAUSAGES_PER_ORDER);
    const baseTarget = Math.max(this.MIN_PENDING_CUSTOMERS, chartTarget);
    const scaledTarget = Math.ceil(baseTarget * (1 + marketingBonus));

    // Generate pool; keep generating until we reach target
    let pool = generateCustomers(trafficNorm, marketingBonus);
    while (pool.length < scaledTarget) {
      pool = pool.concat(generateCustomers(1, 0));
    }
    // Trim to exact target (no more hardcoded 40-cap)
    pool = pool.slice(0, scaledTarget);

    this.pendingCustomerQueue = pool;
    this.refillCustomerQueue();
  }

  // ── Flip helper (retained for potential future use) ──────────────────────

  private doFlipSlot(slot: GrillSlot): void {
    if (!slot.sausage || !slot.sprite || slot.sausage.served) return;
    slot.sausage = flipSausage(slot.sausage);
    slot.sprite.triggerFlip();
    slot.sprite.updateData(slot.sausage);
    sfx.playFlip();
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

    this.clearCombatDoneHandler();
    this.combatDoneHandler = (result?: CombatDoneResult) => {
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
      this.combatDoneHandler = null;
    };
    EventBus.once('combat-done', this.combatDoneHandler);
  }

  private clearCombatDoneHandler(): void {
    if (!this.combatDoneHandler) return;
    EventBus.off('combat-done', this.combatDoneHandler);
    this.combatDoneHandler = null;
  }

  private clearBlackMarketDoneHandler(): void {
    if (!this.blackMarketDoneHandler) return;
    EventBus.off('black-market-done', this.blackMarketDoneHandler);
    this.blackMarketDoneHandler = null;
  }

  // ── Grill event tick ──────────────────────────────────────────────────────

  private tickGrillEvents(dt: number): void {
    if (!this.ENABLE_GRILL_SESSION_EVENTS) return;
    if (this.totalSessionEvents >= this.maxSessionEvents) return;

    this.grillEventTimer += dt;
    if (this.grillEventTimer < this.grillEventNextTrigger) return;

    // Reset timer and pick next trigger interval
    this.grillEventTimer = 0;
    this.grillEventNextTrigger = Phaser.Math.Between(40, 65);

    // 40% chance an event fires
    if (Math.random() > 0.4) return;

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
      this.totalSessionEvents++;
      return;
    }

    this.triggeredEventIds.push(event.id);
    this.totalSessionEvents++;
    this.showGrillEventOverlay(event);
  }

  // ── Grill event overlay UI ────────────────────────────────────────────────

  private showGrillEventOverlay(event: GrillEvent): void {
    this.isShowingGrillEvent = true;
    this.pauseBgm();
    const { width: w, height: h } = this.scale;

    const splashKey = getGrillEventImageKey(event);
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
    const imageKey = getGrillEventImageKey(event);
    const hasEventImage = imageKey && this.textures.exists(imageKey);

    const container = this.add.container(0, 0).setDepth(300);
    this.grillEventOverlay = container;

    // Semi-transparent black overlay
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, width, height);
    container.add(overlay);

    // Panel dimensions
    const panelW = width * 0.74;
    const panelX = (width - panelW) / 2;
    const panelY = height * 0.08;
    const imageAreaH = hasEventImage ? Math.min(170, height * 0.22) : 0;

    // Measure content height: header ~80px + description ~60px + choices * 50px + padding
    const choiceCount = event.choices.length;
    const panelH = 90 + imageAreaH + 80 + choiceCount * 58 + 34;

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

    if (hasEventImage) {
      const eventImage = this.add.image(cx, panelY + 62 + imageAreaH / 2, imageKey);
      const maxScale = Math.min((panelW * 0.56) / eventImage.width, imageAreaH / eventImage.height);
      eventImage.setScale(maxScale).setAlpha(0.95);
      container.add(eventImage);
    } else if (import.meta.env.DEV) {
      console.warn(`[grill-event] missing texture for id=${event.id}, key=${imageKey}`);
    }

    // Description
    const descY = panelY + 58 + imageAreaH + 8;
    const descTxt = this.add.text(cx, descY, event.description, {
      fontSize: '13px',
      fontFamily: FONT,
      color: '#ffeecc',
      wordWrap: { width: panelW - 40 },
      align: 'center',
    }).setOrigin(0.5, 0);
    container.add(descTxt);

    // Choice buttons
    const choiceStartY = descY + 72;
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
    sprite.setDepth(4); // S7.8: depth 4, above rackBack(2) — no rackFront currently
    const slotIndex = this.grillSlots.indexOf(slot);

    // Legacy manual placement only supports single-click flip. Rhythm mode handles serving.
    sprite.onClick(() => {
      const currentSlot = this.grillSlots.find(s => s.sprite === sprite);
      if (!currentSlot) return;
      this.doFlipSlot(currentSlot);
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
    slot.__isPressingBtn = false;
    this.addSlotShadow(slot); // S5.1: shadow under sausage

    // Wave 4b: build interaction buttons for this slot
    this.buildSlotInteractionBtns(slot);
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
      this.removeSlotShadow(slot); // S5.1: remove shadow when sausage leaves
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

  // ── Customer commentary (S7.6: restored — pure text, no counter-attack) ─────

  private tickCustomerCommentary(dt: number): void {
    if (this.isDone || this.paused) return;

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
        this.showCustomerReaction('slow');
        return;
      }
    } else {
      this.slowServiceTimer = Math.max(0, this.slowServiceTimer - 2);
    }

    // 排隊人數 ≥ 3 時偶爾觸發不耐煩
    if (waitingCount >= 3 && Math.random() < 0.3) {
      this.showCustomerReaction('impatient');
      return;
    }
  }

  private showCustomerReaction(category: 'slow' | 'impatient'): void {
    // 移除舊氣泡
    if (this.commentBubble?.active) {
      this.commentBubble.destroy();
      this.commentBubble = null;
    }

    const lines = CUSTOMER_REACTIONS[category];
    const line = lines[Math.floor(Math.random() * lines.length)];

    const bubbleX = this.scale.width / 2 + Math.random() * 100 - 50;
    const bubbleY = this.queueY - 45;

    this.commentBubble = this.add.text(bubbleX, bubbleY, `「${line}」`, {
      fontSize: '14px',
      fontFamily: FONT,
      color: '#ffffff',
      backgroundColor: '#333333dd',
      padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setDepth(200);

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

  private syncExternalPauseOverlay(): void {
    if (!this.externalPagePaused) {
      this.externalPauseOverlay?.destroy();
      this.externalPauseOverlay = null;
      return;
    }

    if (this.externalPauseOverlay) return;

    const { width, height } = this.scale;
    const overlay = this.add.container(0, 0).setDepth(9998);
    const dim = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.58);
    overlay.add(dim);

    if (this.textures.exists('ui-pause-overlay-icon')) {
      const icon = this.add.image(width / 2, height / 2 - 20, 'ui-pause-overlay-icon')
        .setDisplaySize(190, 190);
      overlay.add(icon);
    }

    const label = this.add.text(width / 2, height / 2 + 118, '暫停中', {
      fontSize: '32px',
      fontFamily: FONT,
      color: '#ffe066',
      stroke: '#000000',
      strokeThickness: 6,
      fontStyle: '900',
    }).setOrigin(0.5);
    overlay.add(label);

    this.externalPauseOverlay = overlay;
  }

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
    const rhythmStats = this.hitStats;
    this.statsText.setText('');
    if (this.statNumberTexts.length === 4) {
      this.statNumberTexts[0].setText(`${rhythmStats.perfect}`);
      this.statNumberTexts[1].setText(`${rhythmStats.great}`);
      this.statNumberTexts[2].setText(`${rhythmStats.good}`);
      this.statNumberTexts[3].setText(`${rhythmStats.miss}`);
    }
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

  private burstHitZone(judgement: HitJudgement): void {
    const primarySparkColor =
      judgement === 'perfect' ? 0xfff066 :
      judgement === 'great' ? 0x66ddff :
      0xff8844;
    const x = this.noteHitX;
    const y = this.noteTrackY;
    const intensity =
      judgement === 'perfect' ? 1.25 :
      judgement === 'great' ? 1.0 :
      0.75;

    for (let i = 0; i < 36; i++) {
      const angle = (Math.PI * 2 * i) / 36 + Phaser.Math.FloatBetween(-0.10, 0.10);
      const distance = Phaser.Math.Between(22, 72) * intensity;
      const spark = this.add.graphics().setPosition(x, y).setDepth(1200);
      const sparkColor = i % 5 === 0 ? 0xffffff : (i % 2 === 0 ? primarySparkColor : 0xff6b00);
      const startRadius = Phaser.Math.Between(42, 58);
      const sparkLength = Phaser.Math.Between(54, 104) * intensity;
      spark.lineStyle(i % 3 === 0 ? 10 : 7, sparkColor, 1);
      spark.beginPath();
      spark.moveTo(Math.cos(angle) * startRadius, Math.sin(angle) * startRadius);
      spark.lineTo(Math.cos(angle) * (startRadius + sparkLength), Math.sin(angle) * (startRadius + sparkLength));
      spark.strokePath();
      spark.fillStyle(sparkColor, 1);
      spark.fillCircle(Math.cos(angle) * startRadius, Math.sin(angle) * startRadius, i % 3 === 0 ? 7 : 5);
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scaleX: 0.65,
        scaleY: 0.65,
        duration: 300 + i * 4,
        ease: 'Quad.Out',
        onComplete: () => spark.destroy(),
      });
    }

    for (let i = 0; i < 18; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const startRadius = Phaser.Math.Between(58, 76);
      const particle = this.add.graphics().setPosition(
        x + Math.cos(angle) * startRadius,
        y + Math.sin(angle) * startRadius,
      ).setDepth(1201);
      const particleColor = i % 3 === 0 ? 0xffffff : (i % 2 === 0 ? 0xfff066 : 0xff6b00);
      particle.fillStyle(particleColor, 1);
      particle.fillCircle(0, 0, Phaser.Math.Between(7, 12));
      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * Phaser.Math.Between(96, 158) * intensity,
        y: y + Math.sin(angle) * Phaser.Math.Between(96, 158) * intensity,
        alpha: 0,
        scaleX: 0.35,
        scaleY: 0.35,
        duration: 300 + i * 8,
        ease: 'Quad.Out',
        onComplete: () => particle.destroy(),
      });
    }

    for (let i = 0; i < 8; i++) {
      const emberStartX = x + Phaser.Math.Between(-34, 34);
      const emberStartY = y + Phaser.Math.Between(-42, 16);
      const ember = this.add.graphics().setPosition(emberStartX, emberStartY).setDepth(1199);
      const angle = Phaser.Math.FloatBetween(-Math.PI * 0.95, -Math.PI * 0.05);
      ember.fillStyle(i % 2 === 0 ? 0xff6b00 : 0xfff066, 0.95);
      ember.fillCircle(0, 0, Phaser.Math.Between(5, 9));
      this.tweens.add({
        targets: ember,
        x: emberStartX + Math.cos(angle) * Phaser.Math.Between(18, 46),
        y: emberStartY + Math.sin(angle) * Phaser.Math.Between(32, 72),
        alpha: 0,
        scaleX: 0.25,
        scaleY: 0.25,
        duration: 320 + i * 24,
        ease: 'Sine.Out',
        onComplete: () => ember.destroy(),
      });
    }
  }

  /**
   * Wave 6e: Big animated judgement text (PERFECT / GREAT / GOOD / MISS).
   * Pops in with a scale bounce and floats upward before fading out.
   */
  private showJudgementBig(text: string, color: string, size: number, duration = 600): void {
    const x = this.noteHitX;
    const y = this.noteTrackY - 60;
    const assetKey = this.getPopupAssetKey(text);
    if (assetKey && this.textures.exists(assetKey)) {
      const container = this.add.container(x, y).setDepth(220).setScale(0.55);
      const image = this.add.image(0, 0, assetKey);
      const isWideJudgement = assetKey.startsWith('judge-');
      const displayWidth = assetKey === 'ui-heat-up'
        ? 260
        : assetKey === 'ui-service-combo'
          ? 250
          : isWideJudgement
            ? 235
            : 210;
      const displayHeight = assetKey === 'ui-heat-up'
        ? 130
        : assetKey === 'ui-service-combo'
          ? 125
          : isWideJudgement
            ? 78
            : 120;
      image.setDisplaySize(displayWidth, displayHeight);
      container.add(image);

      if (!isWideJudgement && text !== 'HEAT UP') {
        const caption = this.add.text(0, 42, text, {
          fontSize: `${Math.max(16, Math.floor(size * 0.7))}px`,
          fontFamily: FONT,
          color,
          stroke: '#000000',
          strokeThickness: 4,
          fontStyle: '900',
        }).setOrigin(0.5);
        container.add(caption);
      }

      this.tweens.add({
        targets: container,
        scaleX: 1,
        scaleY: 1,
        duration: 120,
        ease: 'Back.Out',
      });
      this.tweens.add({
        targets: container,
        alpha: 0,
        y: y - 28,
        duration: Math.max(120, duration - 180),
        delay: 180,
        onComplete: () => { if (container.active) container.destroy(); },
      });
      return;
    }

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

  private getPopupAssetKey(text: string): string | null {
    const normalized = text.toLowerCase();
    if (normalized === 'perfect' || normalized === 'great' || normalized === 'good' || normalized === 'miss') {
      return JUDGEMENT_ASSET_BY_RESULT[normalized] ?? null;
    }
    if (text === 'HEAT UP') return 'ui-heat-up';
    if (text.includes('服務')) return 'ui-service-combo';
    return null;
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
      sfx.playCombo50ChtVoice();
      // Stronger golden vignette + floating text
      this.showFeedback('神之手! 1.5x + 耐心回滿', width / 2, height * 0.12, '#ffd700');
      this.customerQueue.resetAllPatience();
      this.flashScreenEdge(0xffd700, 0.45, 600);
    } else if (combo === 3) {
      sfx.playCombo10ChtVoice();
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
    const { width } = this.scale;
    const queueY = this.queueY;
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
        this.clearBlackMarketDoneHandler();
        this.blackMarketDoneHandler = () => {
          EventBus.emit('hide-panel');
          this.blackMarketDoneHandler = null;
        };
        EventBus.emit('show-panel', 'black-market');
        EventBus.once('black-market-done', this.blackMarketDoneHandler);
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

      // S7.6: clean up commentary bubble
      if (this.commentBubble?.active) { this.commentBubble.destroy(); this.commentBubble = null; }

      // Clean up any active combat panel
      if (this.currentCombatPanel) {
        this.currentCombatPanel.destroy();
        this.currentCombatPanel = null;
      }
      this.combatCustomersHandled.clear();
      this.clearCombatDoneHandler();

      // Stop timer flash tween if running
      if (this.timerFlashTween) {
        this.timerFlashTween.stop();
        this.timerFlashTween = null;
        if (this.timerText?.active) this.timerText.setAlpha(1);
      }

      // S3.3: Compute daily rhythm stats and grade
      const totalNotesPlayed = this.chart?.totalNotes ?? 286;
      const { perfect, great, good, miss } = this.hitStats;
      const weightedHits = perfect * 1 + great * 0.7 + good * 0.3;
      const accuracy = totalNotesPlayed > 0 ? weightedHits / totalNotesPlayed : 0;
      const grade: DailyRhythmStats['grade'] =
        accuracy >= 0.95 ? 'A' :
        accuracy >= 0.85 ? 'B' :
        accuracy >= 0.70 ? 'C' : 'D';
      const rhythmStats: DailyRhythmStats = {
        hitStats: { perfect, great, good, miss },
        maxCombo: this.maxRhythmCombo,
        totalNotes: totalNotesPlayed,
        accuracy,
        grade,
      };
      updateGameState({ dailyRhythmStats: rhythmStats });
      if (!this.fullComboSfxPlayed && totalNotesPlayed > 0 && miss === 0 && perfect + great + good > 0) {
        this.fullComboSfxPlayed = true;
        sfx.playFullComboVoice();
      }

      // Count waste
      const grillRemaining = this.grillSlots.filter(s => s.sausage && !s.sausage.served).length;
      const warmingRemaining = this.warmingSlots.filter(s => s.sausage).length;

      // S2.3: Write unsold warming zone sausages back to gameState so next-day logic can read them
      const warmingZoneSnapshot = this.warmingSlots
        .filter(ws => ws.sausage !== null)
        .map(ws => ({ ...ws.sausage! }));

      // Persist to game state
      updateGameState({
        dailySalesLog: [...this.salesLog],
        dailyGrillStats: { ...this.grillStats },
        dailyWaste: { grillRemaining, warmingRemaining },
        dailyPerfectCount: this.grillStats.perfect,
        warmingZone: warmingZoneSnapshot,
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
      this.scene.start('SummaryScene');
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
    const controlsText = this.add.text(cx, height * 0.30,
      '【咚 紅】  按 D 鍵\n【喀 藍】  按 F 鍵', {
        fontSize: '20px',
        fontFamily: FONT,
        color: '#ffaaaa',
        align: 'center',
        lineSpacing: 8,
      }).setOrigin(0.5);
    overlayContainer.add(controlsText);

    // Judgement explanation
    const judgeText = this.add.text(cx, height * 0.46,
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

    // Auto-pack & service combo hints
    const hintText = this.add.text(cx, height * 0.62,
      '每 5 秒系統自動打包 1 份給客人\n每 15 秒出現金色服務組（連點咚喀）\n全部命中 = 一次打包多份', {
        fontSize: '15px',
        fontFamily: FONT,
        color: '#ffdd88',
        align: 'center',
        lineSpacing: 8,
      }).setOrigin(0.5);
    overlayContainer.add(hintText);

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
      sfx.initOnUserGesture();
      sfx.playStartCookingVoice();
      this.time.delayedCall(900, () => {
        if (!this.scene.isActive()) return;
        sfx.playSongIntroVoice();
      });
      this.time.delayedCall(3200, () => {
        if (!this.scene.isActive()) return;
        this.startRhythmGame();
      });
    };

    // Any pointer on the overlay background
    bg.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, width, height),
      Phaser.Geom.Rectangle.Contains
    );
    bg.once('pointerdown', dismiss);

    // Any keydown. D/F can be tapped on the tutorial screen as a sound check.
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === 'd') sfx.playDon();
      if (key === 'f') sfx.playKa();
      dismiss();
    };
    this.input.keyboard?.once('keydown', onKey);
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  shutdown(): void {
    EventBus.off('dev-end-grill-session', this.onDevEndGrillSession, this);
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
    this.clearCombatDoneHandler();

    // S7.6: commentary bubble cleanup
    if (this.commentBubble?.active) { this.commentBubble.destroy(); this.commentBubble = null; }

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
    this.clearExternalPauseHandlers();
    this.clearBlackMarketDoneHandler();
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

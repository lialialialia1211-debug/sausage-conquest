// SpectatorCrowd — 攤位周圍圍觀客人容器（Wave 4c）
// 最多 6 位圍觀者，依烤制事件浮出反應氣泡，給玩家心理壓力感
import Phaser from 'phaser';
import type { Customer } from '../types';
import { pickRandomQuote } from '../data/spectatorQuotes';

// 每個圍觀者的顯示資料
interface SpectatorDisplay {
  customer: Customer;
  container: Phaser.GameObjects.Container;
  reactionBubble: Phaser.GameObjects.Text | null;   // 短反應氣泡（PERFECT / MISS 等）
  arrivedAt: number;           // scene time (ms) 用來計算排隊時間
  bubbleTimer: number;         // 短反應氣泡剩餘顯示秒數（倒計時）
  naturalLeaveTimer: number;   // 自然離場倒計時（秒）
  quoteBubble: Phaser.GameObjects.Text | null;      // 長對白氣泡（獨立 slot，不被短氣泡覆蓋）
  quoteBubbleTimer: number;    // 長對白氣泡剩餘顯示秒數
}

// 可觸發的事件類型
export type SpectatorEvent =
  | 'golden'
  | 'hot'
  | 'burnt'
  | 'slow'
  | 'perfect-served'
  | 'carbonized-served';

// 反應氣泡設定
interface BubbleConfig {
  text: string;
  color: string;
  animation: 'pulse' | 'shake' | 'fly-left' | 'bounce' | 'float-up';
  removeAfterAnim?: boolean; // 動畫完成後移除圍觀者
}

const BUBBLE_MAP: Record<SpectatorEvent, BubbleConfig> = {
  golden:           { text: '◎',    color: '#ffd700', animation: 'pulse' },
  hot:              { text: '!',    color: '#ff8800', animation: 'shake' },
  burnt:            { text: '✕',    color: '#ff3300', animation: 'fly-left', removeAfterAnim: true },
  slow:             { text: '早點啦', color: '#ff6666', animation: 'bounce' },
  'perfect-served': { text: '+',    color: '#44ff88', animation: 'float-up' },
  'carbonized-served': { text: '(離席)', color: '#888888', animation: 'fly-left', removeAfterAnim: true },
};

// 圍觀者圖像選擇邏輯（與 CustomerQueue 保持一致）
const PERSONALITY_IMAGE_MAP: Record<string, string> = {
  karen:     'customer-karen',
  enforcer:  'customer-thug',
  inspector: 'customer-inspector',
  fatcat:    'customer-fatcat',
  spy:       'customer-inspector',
  influencer: 'customer-influencer',
  beggar:    'customer-beggar',
};

const SPECTATOR_SIZE = 50;     // 縮小讓 12 個排得開
const MAX_CAPACITY = 12;
const RADIUS = 200;
const NATURAL_LEAVE_MIN = 15;  // 圍觀者最短在場秒數
const NATURAL_LEAVE_MAX = 30;  // 圍觀者最長在場秒數
const BUBBLE_DURATION = 2.5;   // 氣泡顯示秒數

export class SpectatorCrowd extends Phaser.GameObjects.Container {
  private spectators: SpectatorDisplay[] = [];
  // 壓力顯示用：記錄從 customerQueue 取得的當前等待客人耐心比
  private currentPatienceRatios: number[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    scene.add.existing(this);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * 加入一位圍觀者（shallow copy，不動原始 Customer 物件）
   * 若已達上限，先進先出汰舊
   */
  addSpectator(customer: Customer): void {
    // 先進先出：若已達上限，移除最早進場者
    if (this.spectators.length >= MAX_CAPACITY) {
      this.removeOldest();
    }

    const idx = this.spectators.length;
    const { targetX, targetY } = this.calcPosition(idx);
    const spawnX = targetX + 300; // 從右側遠端進場

    const container = this.scene.add.container(spawnX, targetY);
    this.add(container);

    // 選擇肖像圖
    const imageKey = PERSONALITY_IMAGE_MAP[customer.personality]
      || (Math.random() < 0.5 ? 'customer-normal-male' : 'customer-normal-female');

    if (this.scene.textures.exists(imageKey)) {
      const portrait = this.scene.add.image(0, 0, imageKey);
      const pScale = SPECTATOR_SIZE / Math.min(portrait.width, portrait.height);
      portrait.setScale(pScale);
      container.add(portrait);
    } else {
      // 備援：用文字佔位
      const fallback = this.scene.add.text(0, 0, '人', {
        fontSize: '24px',
        color: '#cccccc',
      }).setOrigin(0.5);
      container.add(fallback);
    }

    // 進場 tween：從遠端滑入
    this.scene.tweens.add({
      targets: container,
      x: targetX,
      duration: 350,
      ease: 'Back.Out',
    });

    const display: SpectatorDisplay = {
      customer,
      container,
      reactionBubble: null,
      arrivedAt: this.scene.time.now,
      bubbleTimer: 0,
      naturalLeaveTimer: NATURAL_LEAVE_MIN + Math.random() * (NATURAL_LEAVE_MAX - NATURAL_LEAVE_MIN),
      quoteBubble: null,
      quoteBubbleTimer: 0,
    };

    this.spectators.push(display);
  }

  /**
   * 依事件觸發所有圍觀者反應氣泡
   */
  reactToStage(event: SpectatorEvent): void {
    if (this.spectators.length === 0) return;
    const config = BUBBLE_MAP[event];
    if (!config) return;

    for (const sp of this.spectators) {
      this.showBubble(sp, config);
    }
  }

  /**
   * 隨機抽一位圍觀客人，浮出一條隨機對白（長文氣泡）
   */
  public showRandomQuote(): void {
    if (this.spectators.length === 0) return;
    const sp = this.spectators[Math.floor(Math.random() * this.spectators.length)];
    const quote = pickRandomQuote();
    this.showLongBubble(sp, quote);
  }

  /**
   * 注目度 = 圍觀人數 × 平均等待緊迫度（0–10 範圍）
   * 緊迫度 = 1 - patience_ratio（耐心越少、緊迫度越高）
   */
  getPressureLevel(): number {
    if (this.spectators.length === 0) return 0;
    const count = this.spectators.length;
    // 用外部注入的耐心比率（由 GrillScene 每秒更新）
    let avgUrgency = 0.5; // 預設中等
    if (this.currentPatienceRatios.length > 0) {
      const sum = this.currentPatienceRatios.reduce((a, b) => a + (1 - b), 0);
      avgUrgency = sum / this.currentPatienceRatios.length;
    }
    return Math.round(count * avgUrgency * 10) / 10;
  }

  /** 由 GrillScene 每秒更新等待客人的耐心比率陣列 */
  updatePatienceRatios(ratios: number[]): void {
    this.currentPatienceRatios = ratios;
  }

  /**
   * 每 frame 呼叫：處理氣泡倒計時、自然離場
   */
  tick(deltaSec: number): void {
    const toRemove: SpectatorDisplay[] = [];

    for (const sp of this.spectators) {
      // 短反應氣泡倒計時
      if (sp.reactionBubble && sp.bubbleTimer > 0) {
        sp.bubbleTimer -= deltaSec;
        if (sp.bubbleTimer <= 0) {
          if (sp.reactionBubble?.active) {
            sp.reactionBubble.destroy();
          }
          sp.reactionBubble = null;
        }
      }

      // 長對白氣泡倒計時（獨立於短反應氣泡）
      if (sp.quoteBubble && sp.quoteBubbleTimer > 0) {
        sp.quoteBubbleTimer -= deltaSec;
        if (sp.quoteBubbleTimer <= 0) {
          if (sp.quoteBubble?.active) {
            sp.quoteBubble.destroy();
          }
          sp.quoteBubble = null;
        }
      }

      // 自然離場計時
      sp.naturalLeaveTimer -= deltaSec;
      if (sp.naturalLeaveTimer <= 0) {
        toRemove.push(sp);
      }
    }

    for (const sp of toRemove) {
      this.removeSpectator(sp, true);
    }
  }

  /**
   * 關燈用：清除所有圍觀者（scene shutdown 時呼叫）
   */
  clear(): void {
    for (const sp of this.spectators) {
      if (sp.reactionBubble?.active) sp.reactionBubble.destroy();
      if (sp.quoteBubble?.active) sp.quoteBubble.destroy();
      if (sp.container?.active) sp.container.destroy();
    }
    this.spectators = [];
    this.currentPatienceRatios = [];
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * 半圓形座標計算（攤位下方）
   * idx = 0..MAX_CAPACITY-1
   * angle 從 π（左端）到 2π（右端）=> 下半圓
   */
  private calcPosition(idx: number): { targetX: number; targetY: number } {
    const safeMax = Math.max(MAX_CAPACITY - 1, 1);
    const angle = Math.PI + (idx / safeMax) * Math.PI;
    const targetX = Math.cos(angle) * RADIUS;
    // 只取正 y，確保往下展開；sin(π..2π) 值域為 0 → -1 → 0，取 abs
    // 加大垂直範圍讓 12 個圍觀者排得開
    const targetY = Math.abs(Math.sin(angle)) * 90;
    return { targetX, targetY };
  }

  /**
   * 移除最早加入的圍觀者（先進先出）
   */
  private removeOldest(): void {
    if (this.spectators.length === 0) return;
    // 找 arrivedAt 最小者
    let oldest = this.spectators[0];
    for (const sp of this.spectators) {
      if (sp.arrivedAt < oldest.arrivedAt) oldest = sp;
    }
    this.removeSpectator(oldest, true);
  }

  /**
   * 移除指定圍觀者，可選是否播放淡出動畫
   */
  private removeSpectator(sp: SpectatorDisplay, animate: boolean): void {
    const idx = this.spectators.indexOf(sp);
    if (idx < 0) return;

    this.spectators.splice(idx, 1);

    if (!sp.container?.active) return;

    // Destroy both bubble slots on removal
    if (sp.reactionBubble?.active) sp.reactionBubble.destroy();
    sp.reactionBubble = null;
    if (sp.quoteBubble?.active) sp.quoteBubble.destroy();
    sp.quoteBubble = null;

    if (animate) {
      this.scene.tweens.add({
        targets: sp.container,
        alpha: 0,
        x: sp.container.x - 40,
        duration: 400,
        ease: 'Power2',
        onComplete: () => {
          if (sp.container?.active) sp.container.destroy();
        },
      });
    } else {
      sp.container.destroy();
    }
  }

  /**
   * 長文對白氣泡（使用獨立 quoteBubble slot，不覆蓋 reactionBubble）
   * 字型 13px + wordWrap 220px，顯示 4.5 秒，簡單淡入
   */
  private showLongBubble(sp: SpectatorDisplay, text: string): void {
    if (!sp.container?.active) return;

    // Destroy previous quote bubble if still showing
    if (sp.quoteBubble?.active) {
      sp.quoteBubble.destroy();
      sp.quoteBubble = null;
    }

    const bubble = this.scene.add.text(
      sp.container.x + this.x,
      sp.container.y + this.y - SPECTATOR_SIZE / 2 - 30,
      text,
      {
        fontSize: '13px',
        color: '#ffffff',
        backgroundColor: '#000000cc',
        padding: { x: 8, y: 5 },
        stroke: '#000000',
        strokeThickness: 2,
        wordWrap: { width: 220 },
        align: 'center',
      },
    ).setOrigin(0.5, 1).setDepth(201);

    // Store in quoteBubble slot — independent from reactionBubble
    sp.quoteBubble = bubble;
    sp.quoteBubbleTimer = 4.5;

    bubble.setAlpha(0);
    this.scene.tweens.add({
      targets: bubble,
      alpha: 1,
      duration: 150,
    });
  }

  /**
   * 在指定圍觀者頭上顯示氣泡，並根據設定播放動畫
   */
  private showBubble(sp: SpectatorDisplay, config: BubbleConfig): void {
    // 若容器已被摧毀，跳過
    if (!sp.container?.active) return;

    // 移除舊氣泡
    if (sp.reactionBubble?.active) {
      sp.reactionBubble.destroy();
      sp.reactionBubble = null;
    }

    // 在 container 頂端建立氣泡文字
    const bubble = this.scene.add.text(
      sp.container.x + this.x,
      sp.container.y + this.y - SPECTATOR_SIZE / 2 - 10,
      config.text,
      {
        fontSize: '18px',
        color: config.color,
        backgroundColor: '#000000aa',
        padding: { x: 5, y: 3 },
        stroke: '#000000',
        strokeThickness: 2,
      },
    ).setOrigin(0.5, 1).setDepth(200);

    sp.reactionBubble = bubble;
    sp.bubbleTimer = BUBBLE_DURATION;

    // 播放對應動畫
    switch (config.animation) {
      case 'pulse':
        this.scene.tweens.add({
          targets: bubble,
          scaleX: { from: 1.0, to: 1.15 },
          scaleY: { from: 1.0, to: 1.15 },
          duration: 150,
          yoyo: true,
          repeat: 1,
          ease: 'Sine.easeInOut',
        });
        break;

      case 'shake':
        this.scene.tweens.add({
          targets: bubble,
          x: { from: bubble.x - 5, to: bubble.x + 5 },
          duration: 80,
          yoyo: true,
          repeat: 2,
          ease: 'Linear',
        });
        break;

      case 'fly-left':
        this.scene.tweens.add({
          targets: bubble,
          x: bubble.x - 60,
          alpha: 0,
          duration: 500,
          ease: 'Power2',
          onComplete: () => {
            if (bubble?.active) bubble.destroy();
            sp.reactionBubble = null;
          },
        });
        // 若設定 removeAfterAnim，動畫後移除圍觀者
        if (config.removeAfterAnim) {
          this.scene.time.delayedCall(500, () => {
            if (this.spectators.includes(sp)) {
              this.removeSpectator(sp, true);
            }
          });
        }
        break;

      case 'bounce':
        this.scene.tweens.add({
          targets: bubble,
          y: { from: bubble.y, to: bubble.y - 4 },
          duration: 200,
          yoyo: true,
          repeat: 2,
          ease: 'Sine.easeInOut',
        });
        break;

      case 'float-up':
        this.scene.tweens.add({
          targets: bubble,
          y: bubble.y - 40,
          alpha: 0,
          duration: 700,
          ease: 'Power2',
          onComplete: () => {
            if (bubble?.active) bubble.destroy();
            sp.reactionBubble = null;
          },
        });
        break;
    }
  }
}

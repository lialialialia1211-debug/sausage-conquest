// SpectatorCrowd — 攤位周圍圍觀客人容器（Wave 4c）
// 最多 6 位圍觀者，依烤制事件浮出反應氣泡，給玩家心理壓力感
import Phaser from 'phaser';
import type { Customer } from '../types';
import { pickRandomQuote } from '../data/spectatorQuotes';
import { CUSTOMER_VARIANT_KEYS } from '../data/customerPortraits';
import { SAUSAGE_MAP } from '../data/sausages';

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

// 圍觀者圖像選擇邏輯（與 CustomerQueue 保持一致）
const SPECTATOR_SIZE = 90;     // 放大讓圍觀者清晰可見
const MAX_CAPACITY = 6;        // S7.5: 從 12 砍半，配合 RADIUS 280 確保不重疊
const RADIUS = 280;            // S7.5: 從 200 拉到 280（90px portrait 相鄰弧長 ≈ 146px > 90px）
const NATURAL_LEAVE_MIN = 15;  // 圍觀者最短在場秒數
const NATURAL_LEAVE_MAX = 30;  // 圍觀者最長在場秒數
const SPECTATOR_CARD_W = 132;
const SPECTATOR_CARD_H = 144;
const SPECTATOR_BAR_W = 124;
const SPECTATOR_BAR_H = 10;

export class SpectatorCrowd extends Phaser.GameObjects.Container {
  private spectators: SpectatorDisplay[] = [];
  // 壓力顯示用：記錄從 customerQueue 取得的當前等待客人耐心比
  private currentPatienceRatios: number[] = [];
  private layoutSlots: { targetX: number; targetY: number }[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    scene.add.existing(this);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  setLayoutSlots(slots: { targetX: number; targetY: number }[]): void {
    this.layoutSlots = slots.slice(0, MAX_CAPACITY);
  }

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

    this.addSpectatorCard(container, customer);

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

  private addSpectatorCard(container: Phaser.GameObjects.Container, customer: Customer): void {
    const card = this.scene.add.graphics();
    card.fillStyle(0x160703, 0.46);
    card.lineStyle(1, 0xb78a54, 0.34);
    card.fillRoundedRect(-SPECTATOR_CARD_W / 2, -66, SPECTATOR_CARD_W, SPECTATOR_CARD_H, 12);
    card.strokeRoundedRect(-SPECTATOR_CARD_W / 2, -66, SPECTATOR_CARD_W, SPECTATOR_CARD_H, 12);
    container.add(card);

    const customerVariantKeys = CUSTOMER_VARIANT_KEYS.filter(key => this.scene.textures.exists(key));
    const imageKey = customerVariantKeys[Math.floor(Math.random() * customerVariantKeys.length)]
      || (Math.random() < 0.5 ? 'customer-normal-male' : 'customer-normal-female');

    if (this.scene.textures.exists(imageKey)) {
      const portrait = this.scene.add.image(0, 0, imageKey);
      const pScale = Math.min(126 / portrait.width, 122 / portrait.height);
      portrait.setScale(pScale);
      container.add(portrait);
    } else {
      const fallback = this.scene.add.text(0, 0, '人', {
        fontSize: '24px',
        color: '#cccccc',
      }).setOrigin(0.5);
      container.add(fallback);
    }

    const patBarBg = this.scene.add.graphics();
    patBarBg.fillStyle(0x333333, 1);
    patBarBg.fillRect(-SPECTATOR_BAR_W / 2, 74, SPECTATOR_BAR_W, SPECTATOR_BAR_H);
    container.add(patBarBg);

    const patBarFill = this.scene.add.graphics();
    patBarFill.fillStyle(0x36df55, 1);
    patBarFill.fillRect(-SPECTATOR_BAR_W / 2, 74, SPECTATOR_BAR_W * 0.86, SPECTATOR_BAR_H);
    container.add(patBarFill);

    if (this.scene.textures.exists('ui-customer-patience-bar')) {
      container.add(
        this.scene.add.image(0, 79, 'ui-customer-patience-bar')
          .setDisplaySize(SPECTATOR_BAR_W + 20, 28)
          .setAlpha(0.78),
      );
    }

    if (customer.order) {
      const sausageInfo = SAUSAGE_MAP[customer.order.sausageType];
      const baseName = sausageInfo?.name ?? '香腸';
      const bubbleText = customer.order.wantGarlic ? `${baseName} 🧄` : baseName;
      container.add(
        this.scene.add.text(0, -80, bubbleText, {
          fontSize: '15px',
          fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
          color: '#fff3c2',
          stroke: '#230800',
          strokeThickness: 3,
          backgroundColor: '#2a0c02',
          padding: { x: 5, y: 2 },
          align: 'center',
          fixedWidth: 128,
        }).setOrigin(0.5),
      );
    }
  }

  /**
   * 依事件觸發所有圍觀者反應氣泡
   */
  reactToStage(_event: SpectatorEvent): void {
    // Short icon bubbles were visually noisy below the warming trays.
    // Keep spectators as background crowd cards; long quote bubbles still work.
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
    if (this.layoutSlots.length > 0) {
      return this.layoutSlots[idx % this.layoutSlots.length];
    }

    const safeMax = Math.max(MAX_CAPACITY - 1, 1);
    const angle = Math.PI + (idx / safeMax) * Math.PI;
    const targetX = Math.cos(angle) * RADIUS;
    // 只取正 y，確保往下展開；sin(π..2π) 值域為 0 → -1 → 0，取 abs
    // S7.5: 垂直半徑從 90 → 120，配合 RADIUS 280
    const targetY = Math.abs(Math.sin(angle)) * 120;
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
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#000000cc',
        padding: { x: 14, y: 10 },
        stroke: '#000000',
        strokeThickness: 3,
        wordWrap: { width: 340 },
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

}

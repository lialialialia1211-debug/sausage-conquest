import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { gameState, updateGameState } from '../state/GameState';
import { spoilOvernight, payWorkerSalaries } from '../systems/EconomyEngine';
import { processAIDaily, checkNewOpponent } from '../systems/AIEngine';
import { STORY_BEATS } from '../data/dialogue';
import { checkAndUnlockBlackMarket } from '../systems/BlackMarketEngine';
import { GRID_SLOTS } from '../data/map';

// Slot-based unlock schedule: [requiredSlot, sausageId, name]
// Player must reach the given tier to unlock the sausage variety
const SLOT_UNLOCKS: [number, string, string][] = [
  [1, 'big-taste', '大嚐莖'],        // available from start
  [2, 'big-wrap-small', '大腸包小腸'], // slot 2
  [3, 'cheese', '起司爆漿'],          // slot 3
  [5, 'squidink', '墨魚香腸'],        // slot 5
  [6, 'great-wall', '萬里腸城'],      // slot 6
  [7, 'mala', '麻辣螺螄'],           // slot 7
];

export class MorningScene extends Phaser.Scene {
  private readyForNext = false;
  private spoilageInfo: Record<string, number> = {};

  constructor() {
    super({ key: 'MorningScene' });
  }

  preload(): void {
    // All textures preloaded in BootScene
  }

  create(): void {
    this.readyForNext = false;
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    // Reset daily expenses at start of each morning
    updateGameState({
      dailyExpenses: 0,
      dailySalesLog: [],
      dailyGrillStats: { perfect: 0, ok: 0, raw: 0, burnt: 0, 'half-cooked': 0, 'slightly-burnt': 0, carbonized: 0 },
    });

    // ── Daily processing (Day 2+) ──
    const notifications: string[] = [];

    this.spoilageInfo = {};
    if (gameState.day > 1) {
      const inventoryBefore = { ...gameState.inventory };
      spoilOvernight();
      const inventoryAfter = gameState.inventory;
      for (const id of Object.keys(inventoryBefore)) {
        const lost = (inventoryBefore[id] ?? 0) - (inventoryAfter[id] ?? 0);
        if (lost > 0) this.spoilageInfo[id] = lost;
      }
      processAIDaily();

      // Pay worker salaries
      if (gameState.hiredWorkers.length > 0) {
        const salaryPaid = payWorkerSalaries();
        if (salaryPaid > 0) {
          notifications.push(`💰 工讀生薪水：-$${salaryPaid}`);
        }
      }
    }

    // Check new opponent appearance
    const newOpponent = checkNewOpponent();
    if (newOpponent && !gameState.activeOpponents.includes(newOpponent.id)) {
      updateGameState({
        activeOpponents: [...gameState.activeOpponents, newOpponent.id],
      });
      notifications.push(`${newOpponent.emoji} ${newOpponent.name} 進駐了第 ${newOpponent.gridSlot} 格！\n「${newOpponent.dialogue.greeting}」`);
    }

    // Story beat every 5 days
    const storyBeat = STORY_BEATS[gameState.day];
    if (storyBeat) {
      notifications.unshift(storyBeat); // story beats show first
    }

    // Show current slot position at top of notifications
    const currentSlot = GRID_SLOTS.find(s => s.tier === gameState.playerSlot) || GRID_SLOTS[0];
    const currentSlotName = `${currentSlot.emoji} ${currentSlot.name}`;
    notifications.unshift(`📍 目前位置：第 ${gameState.playerSlot} 層 — ${currentSlotName}`);

    // Check slot-based sausage unlocks
    for (const [requiredSlot, id, name] of SLOT_UNLOCKS) {
      if (gameState.playerSlot >= requiredSlot && !gameState.unlockedSausages.includes(id)) {
        updateGameState({
          unlockedSausages: [...gameState.unlockedSausages, id],
        });
        notifications.push(`📍 第 ${requiredSlot} 層解鎖：${name}！`);
      }
    }

    // Check black market unlock
    if (gameState.day >= 5 && gameState.undergroundRep >= 10 && !gameState.blackMarketUnlocked) {
      const unlocked = checkAndUnlockBlackMarket();
      if (unlocked) {
        notifications.push('💀 新管道解鎖：黑市供應商現在可以聯絡了。');
      }
    }

    // Phaser background: morning sky gradient
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a0a1a, 0x0a0a1a, 0x1a1a3e, 0x101030, 1);
    bg.fillRect(0, 0, width, height);

    const glow = this.add.graphics();
    glow.fillGradientStyle(0x221100, 0x221100, 0x0a0a1a, 0x0a0a1a, 0.6);
    glow.fillRect(0, 0, width, height * 0.4);

    this.add.text(cx, cy - 20, '🌅', {
      fontSize: '80px',
    }).setOrigin(0.5).setAlpha(0.12);

    this.add.text(cx, cy + 60, `Day ${gameState.day} 早上`, {
      fontSize: '20px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#2a2a55',
    }).setOrigin(0.5);

    this.cameras.main.fadeIn(400, 0, 0, 0);

    // Show story illustration overlay for story beat days
    if (storyBeat && this.textures.exists(`story-day${gameState.day}`)) {
      const img = this.add.image(cx, cy, `story-day${gameState.day}`);
      const scale = Math.min((width * 0.6) / img.width, (height * 0.4) / img.height);
      img.setScale(scale).setDepth(100).setAlpha(0);
      this.tweens.add({
        targets: img,
        alpha: 0.9,
        duration: 500,
        yoyo: true,
        hold: 2000,
        onComplete: () => img.destroy(),
      });
    }

    // Show notifications if any, then show morning panel
    if (notifications.length > 0) {
      this.showNotifications(notifications, () => {
        this.showMorningPanel();
      });
    } else {
      this.showMorningPanel();
    }
  }

  private showNotifications(messages: string[], onDone: () => void): void {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    let index = 0;
    const showNext = () => {
      if (index >= messages.length) {
        onDone();
        return;
      }

      const msg = messages[index];
      const notifBg = this.add.graphics();
      notifBg.fillStyle(0x000000, 0.7);
      notifBg.fillRoundedRect(cx - 200, cy - 60, 400, 120, 12);

      const notifText = this.add.text(cx, cy, msg, {
        fontSize: '16px',
        fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
        color: '#ffcc00',
        align: 'center',
        wordWrap: { width: 360 },
      }).setOrigin(0.5);

      // Auto-advance after 2s or on click
      const advance = () => {
        notifBg.destroy();
        notifText.destroy();
        index++;
        showNext();
      };

      const autoTimer = this.time.delayedCall(2500, advance);
      notifBg.setInteractive(
        new Phaser.Geom.Rectangle(cx - 200, cy - 60, 400, 120),
        Phaser.Geom.Rectangle.Contains
      );
      notifBg.once('pointerdown', () => {
        autoTimer.remove(false);
        advance();
      });
    };

    showNext();
  }

  private showMorningPanel(): void {
    EventBus.emit('show-panel', 'morning', { spoilage: this.spoilageInfo });
    EventBus.emit('scene-ready', 'MorningScene');
    EventBus.once('morning-done', this.onMorningDone, this);
  }

  private onMorningDone = (): void => {
    if (this.readyForNext) return;
    this.readyForNext = true;

    EventBus.emit('hide-panel');
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('EveningScene');
    });
  };

  shutdown(): void {
    EventBus.off('morning-done', this.onMorningDone, this);
  }
}

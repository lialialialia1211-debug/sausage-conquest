// SummaryScene: daily summary — triggers HTML overlay
// Handles game-over checks, loan processing, and day advancement
import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { gameState, advanceDay } from '../state/GameState';
import { calculateDailyReport, applyDadTax } from '../systems/EconomyEngine';
import { processDaily } from '../systems/LoanEngine';
import { checkAchievements } from '../systems/AchievementEngine';
import { sfx } from '../utils/SoundFX';
import type { SaleRecord } from '../types';

const MAX_DAYS = 30;

export class SummaryScene extends Phaser.Scene {
  private readyForNext = false;
  private restartHandler: (() => void) | null = null;

  constructor() {
    super({ key: 'SummaryScene' });
  }

  create(): void {
    this.readyForNext = false;
    this.events.on('shutdown', this.shutdown, this);
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x050510, 0x050510, 0x0a0a1a, 0x0a0a1a, 1);
    bg.fillRect(0, 0, width, height);

    this.add.text(cx, cy, '', {
      fontSize: '80px',
    }).setOrigin(0.5).setAlpha(0.12);

    this.add.text(cx, cy + 70, `Day ${gameState.day} 結算中...`, {
      fontSize: '18px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#222244',
    }).setOrigin(0.5);

    this.cameras.main.fadeIn(400, 0, 0, 0);

    // Process end-of-day logic
    const salesLog: SaleRecord[] = gameState.dailySalesLog ?? [];
    const dailyReport = calculateDailyReport(salesLog);

    // Apply dad tax if dad is hired (deducts 10% of revenue directly from money)
    if (gameState.hiredWorkers.includes('dad')) {
      applyDadTax(dailyReport.revenue);
    }

    const loanResult = processDaily();

    // Check: loan shark game over
    if (loanResult.gameOver) {
      this.triggerEnding('loan-shark');
      return;
    }

    // Check: bankrupt (money <= 0 and no active loan available)
    if (gameState.money <= 0) {
      this.triggerEnding('bankrupt');
      return;
    }

    // Check: territory win — reached slot 9 (top tier)
    if (gameState.playerSlot >= 9) {
      this.triggerEnding('territory-win');
      return;
    }

    // Check: Day 30 reached
    if (gameState.day >= MAX_DAYS) {
      this.triggerEnding('day30');
      return;
    }

    // Chapter milestone checkpoints (celebratory toasts, not game-overs)
    if (gameState.day === 10 || gameState.day === 20) {
      const tier = gameState.playerSlot ?? 1;
      const money = gameState.money ?? 0;
      const battlesWon = (gameState.stats?.['battlesWon'] as number) ?? 0;

      if (gameState.day === 10) {
        this.showAchievementToasts([{
          emoji: '',
          name: '第一章完結',
          joke: `撐過去了！攤位等級：${tier} 階 | 資金：$${money} | 戰績：${battlesWon} 勝`,
        }]);
      } else {
        this.showAchievementToasts([{
          emoji: '',
          name: '最終章開始',
          joke: `後半戰開始！最後10天衝向夜市之王！攤位：${tier} 階 | 資金：$${money}`,
        }]);
      }
    }

    // No game over — check achievements
    const newAchievements = checkAchievements();
    if (newAchievements.length > 0) {
      sfx.playAchievement();
      this.showAchievementToasts(newAchievements);
    }

    this.showSummaryPanel(salesLog, dailyReport);
    EventBus.emit('scene-ready', 'SummaryScene');
  }

  private showSummaryPanel(salesLog: SaleRecord[], dailyReport: ReturnType<typeof calculateDailyReport>): void {
    const grillStats = gameState.dailyGrillStats ?? { perfect: 0, ok: 0, raw: 0, burnt: 0 };

    EventBus.emit('show-panel', 'summary', {
      salesLog,
      dailyReport,
      grillStats,
    });

    EventBus.once('summary-done', this.onSummaryDone, this);
  }

  private triggerEnding(type: string): void {
    EventBus.emit('show-panel', 'ending', {
      type,
      dayssurvived: gameState.day,
      totalRevenue: gameState.stats['totalRevenue'] ?? 0,
    });
    EventBus.emit('scene-ready', 'SummaryScene');

    // Listen for restart
    this.restartHandler = () => {
      EventBus.emit('hide-panel');
      let restarted = false;
      const doRestart = () => {
        if (restarted) return;
        restarted = true;
        this.scene.start('BootScene');
      };
      const { width: fw, height: fh } = this.scale;
      const fadeRect = this.add.rectangle(fw / 2, fh / 2, fw, fh, 0x000000, 0).setDepth(9999);
      this.tweens.add({
        targets: fadeRect,
        alpha: { from: 0, to: 1 },
        duration: 400,
        onComplete: doRestart,
      });
      this.time.delayedCall(1000, () => {
        if (!this.scene.isActive()) return;
        doRestart();
      });
    };
    EventBus.once('restart-game', this.restartHandler);
  }

  private onSummaryDone = (): void => {
    if (this.readyForNext) return;
    this.readyForNext = true;

    // Advance to next day
    advanceDay();

    EventBus.emit('hide-panel');
    let transitioned = false;
    const doTransition = () => {
      if (transitioned) return;
      transitioned = true;
      this.scene.start('ShopScene');
    };
    const { width: fw, height: fh } = this.scale;
    const fadeRect = this.add.rectangle(fw / 2, fh / 2, fw, fh, 0x000000, 0).setDepth(9999);
    this.tweens.add({
      targets: fadeRect,
      alpha: { from: 0, to: 1 },
      duration: 400,
      onComplete: doTransition,
    });
    this.time.delayedCall(1000, () => {
      if (!this.scene.isActive()) return;
      doTransition();
    });
  };

  private showAchievementToasts(achievements: Array<{ emoji: string; name: string; joke: string }>): void {
    const { width } = this.scale;
    achievements.forEach((ach, i) => {
      const y = 40 + i * 50;
      const text = this.add.text(width + 10, y, `${ach.name} — ${ach.joke}`, {
        fontSize: '14px',
        fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
        color: '#ffcc00',
        backgroundColor: '#000000cc',
        padding: { x: 12, y: 6 },
      }).setOrigin(1, 0).setDepth(100);

      // Slide in from right
      this.tweens.add({
        targets: text,
        x: width - 10,
        duration: 400,
        ease: 'Back.easeOut',
        delay: i * 300,
      });

      // Slide out after 3s
      this.tweens.add({
        targets: text,
        x: width + 300,
        alpha: 0,
        duration: 400,
        delay: 3000 + i * 300,
        onComplete: () => { if (text.active) text.destroy(); },
      });
    });
  }

  shutdown(): void {
    EventBus.off('summary-done', this.onSummaryDone, this);
    if (this.restartHandler) {
      EventBus.off('restart-game', this.restartHandler);
      this.restartHandler = null;
    }
  }
}

// BattleScene — 換位血戰（Auto-chess battle system）
import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { gameState, spendMoney } from '../state/GameState';
import { GRID_SLOTS, OPPONENT_INFO } from '../data/map';
import {
  generateOpponentArmy,
  calculateBattleCost,
  initBattleState,
  executeRound,
  checkBattleEnd,
  applyBattleResult,
  applySimulationBuff,
} from '../systems/AutoChessEngine';
import type { ChessPiece, AutoChessState } from '../types';

// ── Layout constants ───────────────────────────────────────────────────────────
const FONT = 'Microsoft JhengHei, PingFang TC, sans-serif';

const PLAYER_SIDE_X_FRAC  = 0.22;
const OPP_SIDE_X_FRAC     = 0.78;
const PIECES_START_Y_FRAC = 0.28;
const PIECE_SPACING_Y     = 52;
const LOG_Y_FRAC          = 0.70;
const LOG_LINE_H          = 20;
const MAX_LOG_LINES       = 3;

export class BattleScene extends Phaser.Scene {
  // Battle state
  private battleState: AutoChessState | null = null;
  private playerPieces: ChessPiece[] = [];
  private isRunningRounds = false;

  // UI text refs
  private titleText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private playerHpText!: Phaser.GameObjects.Text;
  private oppHpText!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;
  private continueBtn!: Phaser.GameObjects.Container;
  private logTexts: Phaser.GameObjects.Text[] = [];

  // Piece display objects: pieceId → { emoji, hpBar, hpBg }
  private pieceDisplays: Map<string, {
    emojiText: Phaser.GameObjects.Text;
    hpBg: Phaser.GameObjects.Graphics;
    hpBar: Phaser.GameObjects.Graphics;
    hpLabel: Phaser.GameObjects.Text;
  }> = new Map();

  constructor() {
    super({ key: 'BattleScene' });
  }

  preload(): void {
    this.load.image('battle-cover', 'battle-cover.png');
  }

  // ── create ─────────────────────────────────────────────────────────────────

  create(): void {
    const { width, height } = this.scale;

    // Reset
    this.battleState = null;
    this.playerPieces = [];
    this.isRunningRounds = false;
    this.logTexts = [];
    this.pieceDisplays = new Map();

    this.drawBackground(width, height);
    this.setupTitleText(width, height);
    this.setupRoundText(width, height);
    this.setupBaseHpText(width, height);
    this.setupLogArea(width, height);
    this.setupContinueButton(width, height);

    this.cameras.main.fadeIn(500, 0, 0, 0);
    EventBus.emit('scene-ready', 'BattleScene');

    this.cameras.main.once('camerafadeincomplete', () => {
      this.handleBattleDay();
    });
  }

  // ── Battle day gate ────────────────────────────────────────────────────────

  private handleBattleDay(): void {
    const isBattleDay = gameState.day % 2 === 0;
    if (!isBattleDay) {
      this.titleText.setText('今日無戰事，直接結算');
      this.time.delayedCall(1200, () => this.transitionToSummary());
      return;
    }

    const costInfo = calculateBattleCost();
    if (!costInfo.canAfford) {
      this.showCannotAffordUI();
      return;
    }

    this.showPrepOverlay();
  }

  // ── Cannot afford ──────────────────────────────────────────────────────────

  private showCannotAffordUI(): void {
    const { width, height } = this.scale;

    this.titleText.setText('資金不足，無法發起挑戰');

    const msgText = this.add.text(width / 2, height * 0.40,
      `需要 $${calculateBattleCost().playerCost}（現有 $${gameState.money}）\n選擇逃跑或繼續`,
      {
        fontSize: '15px',
        fontFamily: FONT,
        color: '#ff9944',
        align: 'center',
      },
    ).setOrigin(0.5);

    const skipBtn = this.makeTextButton(width / 2, height * 0.55, '跳過，直接結算', () => {
      msgText.destroy();
      skipBtn.destroy();
      this.transitionToSummary();
    });
  }

  // ── Prep overlay ───────────────────────────────────────────────────────────

  private showPrepOverlay(): void {
    this.titleText.setText('準備戰鬥⋯⋯');

    EventBus.emit('show-panel', 'battle-prep', {
      playerSlot: gameState.playerSlot,
    });

    const startHandler = (data: unknown) => {
      EventBus.off('battle-skip', skipHandler);
      EventBus.emit('hide-panel');
      const { pieces } = data as { pieces: ChessPiece[] };
      this.startBattle(pieces);
    };

    const skipHandler = () => {
      EventBus.off('battle-start', startHandler);
      EventBus.emit('hide-panel');
      this.transitionToSummary();
    };

    EventBus.once('battle-start', startHandler);
    EventBus.once('battle-skip', skipHandler);
  }

  // ── Start battle ───────────────────────────────────────────────────────────

  private startBattle(selectedPieces: ChessPiece[]): void {
    const { width, height } = this.scale;

    // ── FEVER TIME splash (keep existing code) ─────────────────────────────
    if (this.textures.exists('battle-cover')) {
      const splash = this.add.container(0, 0).setDepth(50);
      const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.9);
      const img = this.add.image(width / 2, height / 2 - 20, 'battle-cover');
      const maxW = width * 0.6;
      const maxH = height * 0.5;
      const scale = Math.min(maxW / img.width, maxH / img.height);
      img.setScale(0).setAlpha(0);
      splash.add([overlay, img]);

      this.tweens.add({
        targets: img,
        scale: { from: 0, to: scale },
        alpha: { from: 0, to: 1 },
        duration: 400,
        ease: 'Back.Out',
      });

      this.time.delayedCall(1500, () => {
        this.tweens.add({
          targets: splash,
          alpha: 0,
          duration: 300,
          onComplete: () => splash.destroy(),
        });
      });
    }

    // Deduct battle entry cost
    const costInfo = calculateBattleCost();
    spendMoney(costInfo.playerCost);

    // Use a fallback piece if player bought nothing
    this.playerPieces = selectedPieces.length > 0
      ? selectedPieces
      : [];

    // Apply simulation buff if applicable
    applySimulationBuff(this.playerPieces);

    // Generate opponent army
    const opponentSlot = gameState.playerSlot + 1;
    const opponentPieces = generateOpponentArmy(opponentSlot);

    // Init battle state
    this.battleState = initBattleState(this.playerPieces, opponentPieces, 0);
    this.battleState = { ...this.battleState, phase: 'battle' };

    // Draw initial piece display
    this.spawnPieceDisplays(width, height);

    // Update base HP display
    this.updateBaseHpText();

    // Set title
    const opponentSlotData = GRID_SLOTS.find(s => s.tier === opponentSlot);
    const oppInfo = opponentSlotData ? OPPONENT_INFO[opponentSlotData.opponentId] : null;
    const oppLabel = oppInfo ? `${oppInfo.emoji} ${oppInfo.name}` : '神秘對手';
    this.titleText.setText(`第 ${gameState.playerSlot} 層 vs ${oppLabel}`);

    // Start round loop after splash finishes (1.8s delay)
    this.time.delayedCall(1800, () => {
      this.runNextRound();
    });
  }

  // ── Piece display ──────────────────────────────────────────────────────────

  private spawnPieceDisplays(width: number, height: number): void {
    if (!this.battleState) return;

    const allPieces: Array<{ piece: ChessPiece; isPlayer: boolean }> = [
      ...this.battleState.playerPieces.map(p => ({ piece: p, isPlayer: true })),
      ...this.battleState.opponentPieces.map(p => ({ piece: p, isPlayer: false })),
    ];

    const playerPieces   = allPieces.filter(e => e.isPlayer);
    const opponentPieces = allPieces.filter(e => !e.isPlayer);

    const spawnSide = (
      entries: typeof allPieces,
      baseX: number,
    ) => {
      entries.forEach(({ piece }, i) => {
        const py = height * PIECES_START_Y_FRAC + i * PIECE_SPACING_Y;

        const emojiText = this.add.text(baseX, py, piece.emoji, {
          fontSize: '24px',
          fontFamily: FONT,
        }).setOrigin(0.5);

        const barW = 48;
        const barH = 6;
        const barX = baseX - barW / 2;
        const barY = py + 18;

        const hpBg = this.add.graphics();
        hpBg.fillStyle(0x330022, 1);
        hpBg.fillRect(barX, barY, barW, barH);

        const hpBar = this.add.graphics();
        hpBar.fillStyle(0x44ff88, 1);
        hpBar.fillRect(barX, barY, barW, barH);

        const hpLabel = this.add.text(baseX, barY + barH + 2, `${piece.hp}`, {
          fontSize: '10px',
          fontFamily: FONT,
          color: '#aaaaaa',
        }).setOrigin(0.5, 0);

        this.pieceDisplays.set(piece.id, { emojiText, hpBg, hpBar, hpLabel });
      });
    };

    spawnSide(playerPieces,   width * PLAYER_SIDE_X_FRAC);
    spawnSide(opponentPieces, width * OPP_SIDE_X_FRAC);
  }

  private refreshPieceDisplays(): void {
    if (!this.battleState) return;

    const allPieces = [
      ...this.battleState.playerPieces,
      ...this.battleState.opponentPieces,
    ];

    allPieces.forEach(piece => {
      const display = this.pieceDisplays.get(piece.id);
      if (!display) return;

      if (!piece.isAlive) {
        // Dim defeated pieces
        display.emojiText.setAlpha(0.25);
        display.hpBar.clear();
        display.hpLabel.setText('✕');
        display.hpLabel.setColor('#ff4455');
        return;
      }

      // Recalculate HP bar fill
      const ratio = Math.max(0, piece.hp / piece.maxHp);
      display.hpBar.clear();
      const color = ratio > 0.5 ? 0x44ff88 : ratio > 0.25 ? 0xffcc00 : 0xff4455;
      display.hpBar.fillStyle(color, 1);

      // We need bar geometry — derive from emojiText position
      const barW = 48;
      const barH = 6;
      const barX = display.emojiText.x - barW / 2;
      const barY = display.emojiText.y + 18;
      display.hpBar.fillRect(barX, barY, barW * ratio, barH);

      display.hpLabel.setText(`${piece.hp}`);
    });
  }

  // ── Round loop ─────────────────────────────────────────────────────────────

  private runNextRound(): void {
    if (!this.battleState || this.isRunningRounds) return;

    const endCheck = checkBattleEnd(this.battleState);
    if (endCheck.ended) {
      this.showResult(endCheck.winner ?? 'draw');
      return;
    }

    this.isRunningRounds = true;
    this.battleState = executeRound(this.battleState);

    const roundNum = this.battleState.round;
    this.roundText.setText(`第 ${roundNum} 回合`);

    // Show last 3 log lines
    const log = this.battleState.battleLog;
    const recent = log.slice(-MAX_LOG_LINES);
    recent.forEach(line => this.addLogEntry(line));

    // Refresh piece HP bars
    this.refreshPieceDisplays();
    this.updateBaseHpText();

    // Check end condition after executing this round
    const afterCheck = checkBattleEnd(this.battleState);

    this.isRunningRounds = false;

    if (afterCheck.ended) {
      this.time.delayedCall(600, () => this.showResult(afterCheck.winner ?? 'draw'));
    } else {
      this.time.delayedCall(1000, () => this.runNextRound());
    }
  }

  // ── Result ─────────────────────────────────────────────────────────────────

  private showResult(winner: 'player' | 'opponent' | 'draw'): void {
    const resultMsg = applyBattleResult(winner);

    let color = '#ffcc00';
    if (winner === 'player')   color = '#44ff88';
    if (winner === 'opponent') color = '#ff4455';

    this.resultText
      .setText(resultMsg)
      .setColor(color)
      .setVisible(true)
      .setAlpha(0);

    this.tweens.add({ targets: this.resultText, alpha: 1, duration: 500 });

    this.time.delayedCall(800, () => {
      this.continueBtn.setVisible(true);
      this.tweens.add({ targets: this.continueBtn, alpha: 1, duration: 300 });
    });
  }

  // ── Log area ───────────────────────────────────────────────────────────────

  private setupLogArea(width: number, height: number): void {
    this.add.text(width / 2, height * LOG_Y_FRAC - 18, '戰鬥記錄', {
      fontSize: '12px',
      fontFamily: FONT,
      color: '#443355',
    }).setOrigin(0.5);
  }

  private addLogEntry(text: string): void {
    const { width, height } = this.scale;
    const baseY = height * LOG_Y_FRAC;

    // Shift existing lines up
    this.logTexts.forEach(t => t.setY(t.y - LOG_LINE_H));

    // Remove oldest beyond limit
    while (this.logTexts.length >= MAX_LOG_LINES) {
      const old = this.logTexts.shift();
      if (old) {
        this.tweens.add({
          targets: old,
          alpha: 0,
          duration: 150,
          onComplete: () => old.destroy(),
        });
      }
    }

    const entry = this.add.text(
      width / 2,
      baseY + (MAX_LOG_LINES - 1) * LOG_LINE_H,
      text,
      {
        fontSize: '12px',
        fontFamily: FONT,
        color: '#aa88cc',
        align: 'center',
        wordWrap: { width: width * 0.85 },
      },
    ).setOrigin(0.5).setAlpha(0);

    this.logTexts.push(entry);
    this.tweens.add({ targets: entry, alpha: 1, duration: 200 });
  }

  // ── UI setup ───────────────────────────────────────────────────────────────

  private drawBackground(width: number, height: number): void {
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x050010, 0x050010, 0x100020, 0x100020, 1);
    bg.fillRect(0, 0, width, height);

    const glow = this.add.graphics();
    glow.fillStyle(0xff1144, 0.04);
    glow.fillEllipse(width / 2, height * 0.45, width * 0.9, height * 0.5);

    // Team label row
    this.add.text(width * PLAYER_SIDE_X_FRAC, height * 0.18, '我方', {
      fontSize: '13px',
      fontFamily: FONT,
      color: '#4488ff',
    }).setOrigin(0.5);

    this.add.text(width * OPP_SIDE_X_FRAC, height * 0.18, '對手', {
      fontSize: '13px',
      fontFamily: FONT,
      color: '#ff4455',
    }).setOrigin(0.5);

    // Center divider
    const line = this.add.graphics();
    line.lineStyle(1, 0x441155, 0.5);
    line.beginPath();
    line.moveTo(width / 2, height * 0.20);
    line.lineTo(width / 2, height * 0.65);
    line.strokePath();

    this.add.text(width / 2, height * 0.42, 'VS', {
      fontSize: '18px',
      fontFamily: FONT,
      color: '#331144',
      fontStyle: 'bold',
    }).setOrigin(0.5);
  }

  private setupTitleText(width: number, height: number): void {
    this.titleText = this.add.text(width / 2, height * 0.08, '換位血戰', {
      fontSize: '20px',
      fontFamily: FONT,
      color: '#ff2d55',
      fontStyle: 'bold',
      shadow: { blur: 10, color: '#ff0055', fill: true },
    }).setOrigin(0.5);

    this.resultText = this.add.text(width / 2, height * 0.62, '', {
      fontSize: '16px',
      fontFamily: FONT,
      color: '#44ff88',
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: width * 0.85 },
    }).setOrigin(0.5).setAlpha(0).setVisible(false);
  }

  private setupRoundText(width: number, height: number): void {
    this.roundText = this.add.text(width / 2, height * 0.13, '', {
      fontSize: '13px',
      fontFamily: FONT,
      color: '#665577',
    }).setOrigin(0.5);
  }

  private setupBaseHpText(width: number, height: number): void {
    this.playerHpText = this.add.text(width * PLAYER_SIDE_X_FRAC, height * 0.22, '', {
      fontSize: '12px',
      fontFamily: FONT,
      color: '#4488ff',
    }).setOrigin(0.5);

    this.oppHpText = this.add.text(width * OPP_SIDE_X_FRAC, height * 0.22, '', {
      fontSize: '12px',
      fontFamily: FONT,
      color: '#ff4455',
    }).setOrigin(0.5);
  }

  private updateBaseHpText(): void {
    if (!this.battleState) return;
    this.playerHpText.setText(`基地 HP：${this.battleState.playerHp}`);
    this.oppHpText.setText(`基地 HP：${this.battleState.opponentHp}`);
  }

  private setupContinueButton(width: number, height: number): void {
    const bx = width / 2;
    const by = height * 0.90;
    const btnW = 140;
    const btnH = 44;

    const container = this.add.container(bx, by);

    const bg = this.add.graphics();
    const drawBg = (hover: boolean) => {
      bg.clear();
      bg.fillStyle(hover ? 0xff2d55 : 0x0a0015, hover ? 0.25 : 0.95);
      bg.lineStyle(2, 0xff2d55, hover ? 1 : 0.9);
      bg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
      bg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    };
    drawBg(false);

    const label = this.add.text(0, 0, '繼 續', {
      fontSize: '18px',
      fontFamily: FONT,
      color: '#ff2d55',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const hit = this.add.zone(0, 0, btnW, btnH).setInteractive({ cursor: 'pointer' });
    hit.on('pointerover', () => drawBg(true));
    hit.on('pointerout',  () => drawBg(false));
    hit.on('pointerdown', () => this.transitionToSummary());

    container.add([bg, label, hit]);
    container.setVisible(false).setAlpha(0);
    this.continueBtn = container;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Create a simple inline text-based button for quick informational prompts.
   */
  private makeTextButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
  ): Phaser.GameObjects.Text {
    const btn = this.add.text(x, y, label, {
      fontSize: '16px',
      fontFamily: FONT,
      color: '#ff2d55',
      backgroundColor: '#11001a',
      padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setInteractive({ cursor: 'pointer' });

    btn.on('pointerover', () => btn.setColor('#ff6688'));
    btn.on('pointerout',  () => btn.setColor('#ff2d55'));
    btn.on('pointerdown', onClick);

    return btn;
  }

  // ── Transition ─────────────────────────────────────────────────────────────

  private transitionToSummary(): void {
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('SummaryScene');
    });
  }

  shutdown(): void {
    this.time.removeAllEvents();
    this.logTexts.forEach(t => { if (t?.active) t.destroy(); });
    this.logTexts = [];
    this.pieceDisplays.clear();
    EventBus.off('battle-start');
    EventBus.off('battle-skip');
  }
}

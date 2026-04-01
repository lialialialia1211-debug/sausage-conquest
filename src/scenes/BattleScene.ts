// BattleScene — 深夜地盤爭奪戰 (pure Phaser)
import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { gameState, updateGameState } from '../state/GameState';
import { OPPONENT_MAP } from '../data/opponents';
import { BattleSausage } from '../objects/BattleSausage';
import {
  createBattleUnit,
  generateOpponentUnits,
  executeBattle,
  type BattleUnit,
  type BattleAction,
  type BattleResult,
} from '../systems/BattleEngine';

// Layout
const FONT = 'Microsoft JhengHei, PingFang TC, sans-serif';
const PLAYER_BASE_X_FRAC = 0.25;
const OPPONENT_BASE_X_FRAC = 0.75;
const UNIT_Y_FRAC = 0.42;
const UNIT_SPACING = 70;

export class BattleScene extends Phaser.Scene {
  private opponentId = '';
  private playerUnits: BattleUnit[] = [];
  private opponentUnits: BattleUnit[] = [];
  private playerSprites: Map<string, BattleSausage> = new Map();
  private opponentSprites: Map<string, BattleSausage> = new Map();
  private battleResult: BattleResult | null = null;

  // UI elements
  private roundText!: Phaser.GameObjects.Text;
  private logTexts: Phaser.GameObjects.Text[] = [];
  private continueBtn!: Phaser.GameObjects.Container;
  private titleText!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;

  // Battle timing
  private currentRoundIndex = 0;
  private isPlayingRound = false;

  constructor() {
    super({ key: 'BattleScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    // Reset state
    this.playerUnits = [];
    this.opponentUnits = [];
    this.playerSprites = new Map();
    this.opponentSprites = new Map();
    this.battleResult = null;
    this.currentRoundIndex = 0;
    this.isPlayingRound = false;
    this.logTexts = [];

    // Pick random opponent from enemy-owned slots
    this.opponentId = this.pickOpponentId();

    this.drawBackground(width, height);
    this.drawBattlefield(width, height);
    this.setupTitleText(width, height);
    this.setupRoundText(width, height);
    this.setupLogArea(width, height);
    this.setupContinueButton(width, height);

    this.cameras.main.fadeIn(500, 0, 0, 0);
    EventBus.emit('scene-ready', 'BattleScene');

    // Show pre-battle prep overlay after fade
    this.cameras.main.once('camerafadeincomplete', () => {
      this.showPrepOverlay();
    });
  }

  // ── Opponent selection ─────────────────────────────────────────────────────

  private pickOpponentId(): string {
    // Find opponent slots adjacent or pick any enemy slot for now (P0: random)
    const enemySlotOwners = Object.entries(gameState.map).filter(([, owner]) => owner !== 'player');
    if (enemySlotOwners.length > 0) {
      const randomEntry = enemySlotOwners[Math.floor(Math.random() * enemySlotOwners.length)];
      const opponentId = randomEntry[1];
      if (OPPONENT_MAP[opponentId]) return opponentId;
    }
    // Default to uncle if no map data
    return 'uncle';
  }

  // ── Pre-battle prep overlay ────────────────────────────────────────────────

  private showPrepOverlay(): void {
    const opponent = OPPONENT_MAP[this.opponentId];
    const opponentName = opponent?.name ?? '神秘對手';
    const opponentEmoji = opponent?.emoji ?? '❓';
    const opponentDialogue = opponent?.dialogue.beforeBattle ?? '決戰吧！';
    const difficulty = opponent?.difficulty ?? 1;

    // Build inventory list for selection
    const inventoryEntries = Object.entries(gameState.inventory).filter(([, qty]) => qty > 0);

    EventBus.emit('show-panel', 'battle-prep', {
      opponentId: this.opponentId,
      opponentName,
      opponentEmoji,
      opponentDialogue,
      difficulty,
      inventoryEntries,
    });

    // Listen for player ready
    EventBus.once('battle-start', (data: unknown) => {
      const { selectedSausages } = data as { selectedSausages: Record<string, number> };
      EventBus.emit('hide-panel');
      this.startBattle(selectedSausages);
    });

    // Handle if player cancels / skips
    EventBus.once('battle-skip', () => {
      EventBus.emit('hide-panel');
      this.transitionToSummary();
    });
  }

  // ── Battle start ────────────────────────────────────────────────────────────

  private startBattle(selectedSausages: Record<string, number>): void {
    const { width, height } = this.scale;

    // Deduct selected sausages from inventory
    const newInventory = { ...gameState.inventory };
    for (const [id, qty] of Object.entries(selectedSausages)) {
      if (qty > 0) {
        newInventory[id] = Math.max(0, (newInventory[id] ?? 0) - qty);
        if (newInventory[id] === 0) delete newInventory[id];
      }
    }
    updateGameState({ inventory: newInventory });

    // Create player units from selection
    let unitIndex = 0;
    this.playerUnits = [];
    for (const [sausageId, qty] of Object.entries(selectedSausages)) {
      for (let i = 0; i < qty; i++) {
        this.playerUnits.push(createBattleUnit(sausageId, 'player', unitIndex++));
      }
    }

    // Fallback if somehow no units (shouldn't happen, but defensive)
    if (this.playerUnits.length === 0) {
      const firstItem = Object.keys(gameState.inventory)[0];
      if (firstItem) {
        this.playerUnits.push(createBattleUnit(firstItem, 'player', 0));
      }
    }

    // Create opponent units
    const opponent = OPPONENT_MAP[this.opponentId];
    const unitCount = opponent?.unitCount ?? 3;
    this.opponentUnits = generateOpponentUnits(this.opponentId, unitCount);

    // Run battle simulation
    this.battleResult = executeBattle(this.playerUnits, this.opponentUnits);

    // Spawn sprites
    this.spawnUnitSprites(width, height);

    // Update title
    this.titleText.setText('⚔ 地盤爭奪戰');


    // Start playing rounds
    this.time.delayedCall(600, () => {
      this.playNextRound();
    });
  }

  // ── Sprite spawning ────────────────────────────────────────────────────────

  private spawnUnitSprites(width: number, height: number): void {
    const unitY = height * UNIT_Y_FRAC;

    // Player units — left side, stacked vertically
    this.playerUnits.forEach((unit, i) => {
      const offsetY = (i - (this.playerUnits.length - 1) / 2) * UNIT_SPACING;
      const sprite = new BattleSausage(this, width * PLAYER_BASE_X_FRAC, unitY + offsetY, unit);
      this.playerSprites.set(unit.id, sprite);
    });

    // Opponent units — right side, flip horizontally
    this.opponentUnits.forEach((unit, i) => {
      const offsetY = (i - (this.opponentUnits.length - 1) / 2) * UNIT_SPACING;
      const sprite = new BattleSausage(this, width * OPPONENT_BASE_X_FRAC, unitY + offsetY, unit);
      sprite.setScale(-1, 1); // flip horizontally
      this.opponentSprites.set(unit.id, sprite);
    });
  }

  // ── Round playback ─────────────────────────────────────────────────────────

  private playNextRound(): void {
    if (!this.battleResult || this.isPlayingRound) return;

    if (this.currentRoundIndex >= this.battleResult.rounds.length) {
      // All rounds done — show result
      this.time.delayedCall(500, () => this.showResult());
      return;
    }

    this.isPlayingRound = true;
    const round = this.battleResult.rounds[this.currentRoundIndex];
    this.currentRoundIndex++;

    // Update round counter
    this.roundText.setText(`第 ${round.roundNumber} 回合 / 共 ${this.battleResult.rounds.length} 回合`);

    // Play actions sequentially within the round
    this.playActionsSequentially(round.actions, 0, () => {
      this.isPlayingRound = false;
      // Auto-advance after short pause
      this.time.delayedCall(800, () => this.playNextRound());
    });
  }

  private playActionsSequentially(
    actions: BattleAction[],
    index: number,
    onDone: () => void,
  ): void {
    if (index >= actions.length) {
      onDone();
      return;
    }

    const action = actions[index];
    const attackerSprite = this.getSprite(action.attackerId);
    const defenderSprite = this.getSprite(action.defenderId);

    // Show log
    this.addLogEntry(action.logText);

    // Play attacker dash animation
    if (attackerSprite && defenderSprite) {
      attackerSprite.playAttackAnim(defenderSprite.x, () => {
        // Defender hit
        if (defenderSprite) {
          // Update HP on sprite
          const defUnit = this.findUnit(action.defenderId);
          if (defUnit) {
            const updatedUnit = { ...defUnit, hp: action.defenderHpAfter, alive: !action.defenderDied };
            defenderSprite.updateUnit(updatedUnit);
            defenderSprite.playHitAnim();

            if (action.defenderDied) {
              this.time.delayedCall(300, () => {
                defenderSprite.playDeathAnim();
              });
            }
          }
        }

        // Next action after this one settles
        this.time.delayedCall(600, () => {
          this.playActionsSequentially(actions, index + 1, onDone);
        });
      });
    } else {
      // No sprite — still update data and advance
      this.time.delayedCall(300, () => {
        this.playActionsSequentially(actions, index + 1, onDone);
      });
    }
  }

  private getSprite(unitId: string): BattleSausage | undefined {
    return this.playerSprites.get(unitId) ?? this.opponentSprites.get(unitId);
  }

  private findUnit(unitId: string): BattleUnit | undefined {
    return [...this.playerUnits, ...this.opponentUnits].find(u => u.id === unitId);
  }

  // ── Log area ───────────────────────────────────────────────────────────────

  private setupLogArea(width: number, height: number): void {
    const logLabelY = height * 0.68;
    this.add.text(width / 2, logLabelY, '戰鬥 LOG', {
      fontSize: '13px',
      fontFamily: FONT,
      color: '#665577',
    }).setOrigin(0.5);
  }

  private addLogEntry(text: string): void {
    const { width, height } = this.scale;
    const logStartY = height * 0.72;
    const maxLines = 4;

    // Shift existing lines up
    this.logTexts.forEach(t => {
      t.setY(t.y - 22);
    });

    // Remove oldest if over limit
    while (this.logTexts.length >= maxLines) {
      const old = this.logTexts.shift();
      if (old) {
        this.tweens.add({
          targets: old,
          alpha: 0,
          duration: 200,
          onComplete: () => old.destroy(),
        });
      }
    }

    const newEntry = this.add.text(width / 2, logStartY + (maxLines - 1) * 22, text, {
      fontSize: '13px',
      fontFamily: FONT,
      color: '#bbaacc',
      align: 'center',
    }).setOrigin(0.5).setAlpha(0);

    this.logTexts.push(newEntry);
    this.tweens.add({ targets: newEntry, alpha: 1, duration: 200 });
  }

  // ── Result screen ──────────────────────────────────────────────────────────

  private showResult(): void {
    if (!this.battleResult) return;


    const { width, height } = this.scale;
    const winner = this.battleResult.winner;
    const playerWon = winner === 'player';
    const isTimeout = winner === 'timeout';

    // Update territory
    this.applyTerritoryChange(playerWon);

    // Display result banner
    let resultMsg = '';
    let resultColor = '';
    if (isTimeout) {
      resultMsg = '⚖ 平局！雙方僵持不下';
      resultColor = '#ffcc00';
    } else if (playerWon) {
      resultMsg = '勝利！奪下地盤！';
      resultColor = '#44ff88';
    } else {
      resultMsg = '敗北⋯⋯地盤易主';
      resultColor = '#ff4466';
    }

    this.resultText.setText(resultMsg).setColor(resultColor).setVisible(true);

    // Fade in result
    this.tweens.add({ targets: this.resultText, alpha: 1, duration: 400 });

    // Show opponent aftermath dialogue
    const opponent = OPPONENT_MAP[this.opponentId];
    if (opponent) {
      const dialogue = playerWon ? opponent.dialogue.win : opponent.dialogue.lose;
      const dialogueText = this.add.text(width / 2, height * 0.62, `${opponent.emoji} 「${dialogue}」`, {
        fontSize: '14px',
        fontFamily: FONT,
        color: '#aa88bb',
        align: 'center',
        wordWrap: { width: width * 0.8 },
      }).setOrigin(0.5).setAlpha(0);
      this.tweens.add({ targets: dialogueText, alpha: 1, duration: 600, delay: 400 });
    }

    // Show continue button
    this.time.delayedCall(800, () => {
      this.continueBtn.setVisible(true);
      this.tweens.add({ targets: this.continueBtn, alpha: 1, duration: 300 });
    });
  }

  private applyTerritoryChange(playerWon: boolean): void {
    const opponent = OPPONENT_MAP[this.opponentId];
    const newMap = { ...gameState.map };

    if (playerWon && opponent) {
      // Player takes opponent's slot
      newMap[opponent.gridSlot] = 'player';
      updateGameState({ map: newMap });
    } else if (!playerWon) {
      // Player loses one of their own slots
      const playerSlots = Object.entries(newMap).filter(([, owner]) => owner === 'player');
      if (playerSlots.length > 0) {
        const lostSlotId = parseInt(playerSlots[0][0]);
        delete newMap[lostSlotId];
        updateGameState({ map: newMap });
      }
    }
  }

  // ── UI setup ───────────────────────────────────────────────────────────────

  private drawBackground(width: number, height: number): void {
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x050010, 0x050010, 0x100020, 0x100020, 1);
    bg.fillRect(0, 0, width, height);

    // Atmospheric glow
    const glow = this.add.graphics();
    glow.fillStyle(0xff1144, 0.04);
    glow.fillEllipse(width / 2, height * 0.45, width * 0.9, height * 0.5);
  }

  private drawBattlefield(width: number, height: number): void {
    // Center divider line
    const line = this.add.graphics();
    line.lineStyle(1, 0x441155, 0.6);
    line.beginPath();
    line.moveTo(width / 2, height * 0.22);
    line.lineTo(width / 2, height * 0.60);
    line.strokePath();

    // VS text
    this.add.text(width / 2, height * 0.40, 'VS', {
      fontSize: '22px',
      fontFamily: FONT,
      color: '#441133',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Team labels
    this.add.text(width * PLAYER_BASE_X_FRAC, height * 0.23, '我方', {
      fontSize: '14px',
      fontFamily: FONT,
      color: '#4488ff',
    }).setOrigin(0.5);

    const opponent = OPPONENT_MAP[this.opponentId];
    const opponentLabel = opponent ? `${opponent.emoji} ${opponent.name}` : '敵方';
    this.add.text(width * OPPONENT_BASE_X_FRAC, height * 0.23, opponentLabel, {
      fontSize: '14px',
      fontFamily: FONT,
      color: '#ff4455',
    }).setOrigin(0.5);
  }

  private setupTitleText(width: number, height: number): void {
    this.titleText = this.add.text(width / 2, height * 0.12, '準備戰鬥⋯⋯', {
      fontSize: '22px',
      fontFamily: FONT,
      color: '#ff2d55',
      fontStyle: 'bold',
      shadow: { blur: 10, color: '#ff0055', fill: true },
    }).setOrigin(0.5);

    this.resultText = this.add.text(width / 2, height * 0.56, '', {
      fontSize: '24px',
      fontFamily: FONT,
      color: '#44ff88',
      fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0).setVisible(false);
  }

  private setupRoundText(width: number, height: number): void {
    this.roundText = this.add.text(width / 2, height * 0.18, '', {
      fontSize: '14px',
      fontFamily: FONT,
      color: '#665577',
    }).setOrigin(0.5);
  }

  private setupContinueButton(width: number, height: number): void {
    const bx = width / 2;
    const by = height * 0.88;
    const btnW = 140;
    const btnH = 44;

    const container = this.add.container(bx, by);

    const bg = this.add.graphics();
    bg.fillStyle(0x0a0015, 0.95);
    bg.lineStyle(2, 0xff2d55, 0.9);
    bg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    bg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);

    const label = this.add.text(0, 0, '繼 續', {
      fontSize: '18px',
      fontFamily: FONT,
      color: '#ff2d55',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const hit = this.add.zone(0, 0, btnW, btnH).setInteractive({ cursor: 'pointer' });
    hit.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(0xff2d55, 0.2);
      bg.lineStyle(2, 0xff2d55, 1);
      bg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
      bg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    });
    hit.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(0x0a0015, 0.95);
      bg.lineStyle(2, 0xff2d55, 0.9);
      bg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
      bg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    });
    hit.on('pointerdown', () => this.transitionToSummary());

    container.add([bg, label, hit]);
    container.setVisible(false).setAlpha(0);
    this.continueBtn = container;
  }

  // ── Transition ─────────────────────────────────────────────────────────────

  private transitionToSummary(): void {
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      // salesLog is stored in gameState.dailySalesLog by GrillScene
      this.scene.start('SummaryScene');
    });
  }

  shutdown(): void {
    this.logTexts.forEach(t => { if (t && t.active) t.destroy(); });
    this.logTexts = [];
    this.playerSprites.clear();
    this.opponentSprites.clear();
    EventBus.off('battle-start');
    EventBus.off('battle-skip');
  }
}

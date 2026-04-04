// BattlePrepPanel — Auto-chess prep overlay for the換位血戰 system
import { EventBus } from '../../utils/EventBus';
import { GRID_SLOTS, OPPONENT_INFO } from '../../data/map';
import {
  createPiece,
  getPieceCost,
  tryMerge,
  calculateBattleCost,
  getAvailablePieceTypes,
} from '../../systems/AutoChessEngine';
import type { ChessPiece } from '../../types';

export interface BattlePrepData {
  playerSlot: number;
}

const PIECE_TYPE_LABEL: Record<string, string> = {
  normal:   '近戰',
  ranged:   '遠程',
  aoe:      '群爆',
  tank:     '坦克',
  assassin: '刺客',
  support:  '補師',
};

const MAX_ARMY = 6;
const PREP_SECONDS = 30;

export class BattlePrepPanel {
  private element: HTMLElement;
  private pieces: ChessPiece[] = [];
  private budget: number;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private secondsLeft = PREP_SECONDS;

  // DOM refs updated live
  private budgetEl!: HTMLElement;
  private armyListEl!: HTMLElement;
  private armyCountEl!: HTMLElement;
  private timerEl!: HTMLElement;
  private mergeHintEl!: HTMLElement;

  constructor(data: BattlePrepData) {
    const costInfo = calculateBattleCost();
    this.budget = costInfo.playerCost;
    this.element = this.build(data);
    this.startTimer();
  }

  getElement(): HTMLElement {
    return this.element;
  }

  destroy(): void {
    this.stopTimer();
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  private build(data: BattlePrepData): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'game-panel battle-prep-panel ui-interactive';

    const opponentSlot = data.playerSlot + 1;
    const slotData = GRID_SLOTS.find(s => s.tier === opponentSlot);
    const oppInfo = slotData ? OPPONENT_INFO[slotData.opponentId] : null;
    const oppName = oppInfo?.name ?? '神秘對手';
    const difficulty = slotData?.opponentDifficulty ?? 1;
    const costInfo = calculateBattleCost();

    // ── Title ────────────────────────────────────────────────────────────────
    const title = document.createElement('div');
    title.className = 'panel-title neon-flicker';
    title.style.color = 'var(--neon-red)';
    title.style.textShadow = 'var(--glow-red)';
    title.textContent = `換位血戰 — 第 ${data.playerSlot} 層 vs 第 ${opponentSlot} 層`;
    panel.appendChild(title);

    // ── Opponent info ────────────────────────────────────────────────────────
    const oppBox = document.createElement('div');
    oppBox.className = 'battle-opponent-info';
    oppBox.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:8px;';

    const detailEl = document.createElement('div');
    detailEl.innerHTML = `
      <div style="font-weight:bold;color:#ff4455;">${oppName}</div>
      <div style="font-size:12px;color:#aaa;">
        ${slotData?.name ?? ''} &nbsp;|&nbsp; 難度 ${'★'.repeat(difficulty)}${'☆'.repeat(5 - difficulty)}
      </div>
    `;

    oppBox.appendChild(detailEl);
    panel.appendChild(oppBox);

    // ── Cost & budget ────────────────────────────────────────────────────────
    const costBox = document.createElement('div');
    costBox.style.cssText = 'font-size:13px;margin-bottom:10px;display:flex;gap:16px;flex-wrap:wrap;';

    const costLabel = document.createElement('span');
    costLabel.style.color = '#ff9944';
    costLabel.textContent = `入場費：$${costInfo.playerCost}`;

    this.budgetEl = document.createElement('span');
    this.budgetEl.style.color = '#44ff88';
    this.updateBudgetDisplay();

    costBox.appendChild(costLabel);
    costBox.appendChild(this.budgetEl);
    panel.appendChild(costBox);

    // ── Shop ─────────────────────────────────────────────────────────────────
    const shopLabel = document.createElement('div');
    shopLabel.style.cssText = 'font-size:13px;color:#665577;margin-bottom:6px;';
    shopLabel.textContent = '── 購買棋子 ──';
    panel.appendChild(shopLabel);

    const shopList = document.createElement('div');
    shopList.style.cssText = 'display:flex;flex-direction:column;gap:5px;margin-bottom:12px;max-height:160px;overflow-y:auto;';

    const availableTypes = getAvailablePieceTypes();

    if (availableTypes.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:#886699;font-size:13px;';
      empty.textContent = '尚未解鎖任何棋子類型';
      shopList.appendChild(empty);
    } else {
      availableTypes.forEach(pt => {
        const row = document.createElement('div');
        row.style.cssText =
          'display:flex;align-items:center;gap:8px;padding:4px 6px;border:1px solid #331144;border-radius:5px;background:#0a0015;';

          const info = document.createElement('div');
        info.style.cssText = 'flex:1;font-size:12px;';
        info.innerHTML = `
          <span style="color:#eee;">${pt.name}</span>
          <span style="color:#886699;margin-left:6px;">[${PIECE_TYPE_LABEL[pt.type] ?? pt.type}]</span>
          <span style="color:#ff9944;margin-left:6px;">$${pt.cost}</span>
        `;

        const buyBtn = document.createElement('button');
        buyBtn.className = 'btn-neon btn-neon-cyan';
        buyBtn.style.cssText = 'font-size:12px;padding:3px 10px;';
        buyBtn.textContent = '買';
        buyBtn.addEventListener('click', () => this.buyPiece(pt.sausageId, buyBtn));

        row.appendChild(info);
        row.appendChild(buyBtn);
        shopList.appendChild(row);
      });
    }

    panel.appendChild(shopList);

    // ── Army display ──────────────────────────────────────────────────────────
    const armyHeader = document.createElement('div');
    armyHeader.style.cssText = 'font-size:13px;color:#665577;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;';

    const armyLabel = document.createElement('span');
    armyLabel.textContent = '── 你的軍隊 ──';

    this.armyCountEl = document.createElement('span');
    this.armyCountEl.style.color = '#aaa';
    this.armyCountEl.textContent = `(0 / ${MAX_ARMY})`;

    armyHeader.appendChild(armyLabel);
    armyHeader.appendChild(this.armyCountEl);
    panel.appendChild(armyHeader);

    this.armyListEl = document.createElement('div');
    this.armyListEl.style.cssText =
      'display:flex;flex-direction:column;gap:4px;min-height:40px;max-height:120px;overflow-y:auto;margin-bottom:6px;';
    panel.appendChild(this.armyListEl);

    this.mergeHintEl = document.createElement('div');
    this.mergeHintEl.style.cssText = 'font-size:11px;color:#665577;margin-bottom:10px;';
    this.mergeHintEl.textContent = '3 隻同類自動合成升星';
    panel.appendChild(this.mergeHintEl);

    // ── Timer ─────────────────────────────────────────────────────────────────
    const timerBox = document.createElement('div');
    timerBox.style.cssText = 'font-size:13px;margin-bottom:12px;';

    this.timerEl = document.createElement('span');
    this.timerEl.style.color = '#ffcc00';
    this.timerEl.textContent = `準備時間：${PREP_SECONDS} 秒`;

    timerBox.appendChild(this.timerEl);
    panel.appendChild(timerBox);

    // ── Buttons ───────────────────────────────────────────────────────────────
    const btnRow = document.createElement('div');
    btnRow.className = 'battle-btn-row';

    const skipBtn = document.createElement('button');
    skipBtn.className = 'btn-neon btn-neon-red';
    skipBtn.style.cssText = 'font-size:14px;padding:8px 18px;';
    skipBtn.textContent = '逃跑';
    skipBtn.addEventListener('click', () => {
      this.stopTimer();
      EventBus.emit('battle-skip');
    });

    const startBtn = document.createElement('button');
    startBtn.className = 'btn-neon';
    startBtn.style.cssText = 'font-size:14px;padding:8px 18px;';
    startBtn.textContent = '開戰！';
    startBtn.addEventListener('click', () => {
      this.stopTimer();
      EventBus.emit('battle-start', { pieces: [...this.pieces] });
    });

    btnRow.appendChild(skipBtn);
    btnRow.appendChild(startBtn);
    panel.appendChild(btnRow);

    return panel;
  }

  // ── Purchase logic ─────────────────────────────────────────────────────────

  private buyPiece(sausageId: string, btn: HTMLButtonElement): void {
    if (this.pieces.length >= MAX_ARMY) {
      this.showMergeHint('軍隊已滿（最多 6 隻）');
      return;
    }

    const cost = getPieceCost(sausageId);
    if (this.budget < cost) {
      this.showMergeHint('預算不足！');
      return;
    }

    const piece = createPiece(sausageId, 'player', 0);
    if (!piece) return;

    this.budget -= cost;
    this.pieces = [...this.pieces, piece];
    this.updateBudgetDisplay();

    // Attempt merge after each purchase
    this.attemptMerges();
    this.renderArmy();

    // Brief visual feedback on buy button
    const orig = btn.textContent;
    btn.textContent = '已買！';
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = orig;
      btn.disabled = false;
    }, 600);
  }

  // ── Merge logic ────────────────────────────────────────────────────────────

  private attemptMerges(): void {
    let mergedAny = true;
    while (mergedAny) {
      mergedAny = false;
      for (const piece of this.pieces) {
        if (!piece.isAlive) continue;
        const result = tryMerge(this.pieces, piece.id);
        if (result.merged) {
          this.pieces = result.pieces;
          mergedAny = true;
          const stars = result.newPiece?.stars ?? 1;
          this.showMergeHint(`合成成功！${'★'.repeat(stars)} ${result.newPiece?.name ?? ''}`);
          break; // restart loop with new array
        }
      }
    }
  }

  // ── Army rendering ─────────────────────────────────────────────────────────

  private renderArmy(): void {
    this.armyListEl.innerHTML = '';
    this.armyCountEl.textContent = `(${this.pieces.length} / ${MAX_ARMY})`;

    if (this.pieces.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:#443355;font-size:12px;';
      empty.textContent = '尚未購買任何棋子';
      this.armyListEl.appendChild(empty);
      return;
    }

    this.pieces.forEach(piece => {
      const row = document.createElement('div');
      row.style.cssText =
        'display:flex;align-items:center;gap:8px;padding:3px 6px;border:1px solid #221133;border-radius:4px;background:#080012;font-size:12px;';

      const stars = piece.stars > 0 ? '★'.repeat(piece.stars) : '';
      const typeLabel = PIECE_TYPE_LABEL[piece.type] ?? piece.type;

      row.innerHTML = `
        <span style="color:#ffcc66;">${stars}</span>
        <span style="color:#eee;">${piece.name}</span>
        <span style="color:#886699;font-size:11px;">[${typeLabel}]</span>
        <span style="color:#aaa;margin-left:auto;">HP:${piece.hp} ATK:${piece.atk} SPD:${piece.spd}</span>
      `;

      this.armyListEl.appendChild(row);
    });
  }

  // ── Budget display ─────────────────────────────────────────────────────────

  private updateBudgetDisplay(): void {
    if (this.budgetEl) {
      this.budgetEl.textContent = `剩餘預算：$${this.budget}`;
    }
  }

  // ── Merge hint ─────────────────────────────────────────────────────────────

  private showMergeHint(msg: string): void {
    if (!this.mergeHintEl) return;
    this.mergeHintEl.textContent = msg;
    this.mergeHintEl.style.color = '#ffcc00';
    setTimeout(() => {
      if (this.mergeHintEl) {
        this.mergeHintEl.textContent = '3 隻同類自動合成升星';
        this.mergeHintEl.style.color = '#665577';
      }
    }, 2000);
  }

  // ── Timer ─────────────────────────────────────────────────────────────────

  private startTimer(): void {
    this.secondsLeft = PREP_SECONDS;
    this.timerInterval = setInterval(() => {
      this.secondsLeft--;
      if (this.timerEl) {
        this.timerEl.textContent = `準備時間：${this.secondsLeft} 秒`;
        if (this.secondsLeft <= 10) {
          this.timerEl.style.color = '#ff4455';
        }
      }
      if (this.secondsLeft <= 0) {
        this.stopTimer();
        // Auto-start battle with whatever pieces we have
        EventBus.emit('battle-start', { pieces: [...this.pieces] });
      }
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }
}

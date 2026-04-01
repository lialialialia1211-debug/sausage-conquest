// BattlePrepPanel — Pre-battle sausage selection overlay
import { EventBus } from '../../utils/EventBus';
import { SAUSAGE_MAP } from '../../data/sausages';

export interface BattlePrepData {
  opponentId: string;
  opponentName: string;
  opponentEmoji: string;
  opponentDialogue: string;
  difficulty: number;
  inventoryEntries: Array<[string, number]>;
}

export class BattlePrepPanel {
  private element: HTMLElement;
  private selectedSausages: Record<string, number> = {};
  private maxUnits = 5;
  private totalSelected = 0;

  constructor(data: BattlePrepData) {
    this.element = this.build(data);
  }

  getElement(): HTMLElement {
    return this.element;
  }

  private build(data: BattlePrepData): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'game-panel battle-prep-panel ui-interactive';

    // Title
    const title = document.createElement('div');
    title.className = 'panel-title neon-flicker';
    title.style.color = 'var(--neon-red)';
    title.style.textShadow = 'var(--glow-red)';
    title.textContent = '⚔ 地盤爭奪戰';
    panel.appendChild(title);

    // Opponent info box
    const opponentBox = document.createElement('div');
    opponentBox.className = 'battle-opponent-info';

    const emojiSpan = document.createElement('span');
    emojiSpan.className = 'opp-emoji';
    emojiSpan.textContent = data.opponentEmoji;

    const detailsDiv = document.createElement('div');
    detailsDiv.className = 'opp-details';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'opp-name';
    nameDiv.textContent = data.opponentName;

    const dialogueDiv = document.createElement('div');
    dialogueDiv.className = 'opp-dialogue';
    dialogueDiv.textContent = `「${data.opponentDialogue}」`;

    const difficultyDiv = document.createElement('div');
    difficultyDiv.className = 'opp-difficulty';
    difficultyDiv.textContent = `難度：${'★'.repeat(data.difficulty)}${'☆'.repeat(5 - data.difficulty)}`;

    detailsDiv.appendChild(nameDiv);
    detailsDiv.appendChild(dialogueDiv);
    detailsDiv.appendChild(difficultyDiv);
    opponentBox.appendChild(emojiSpan);
    opponentBox.appendChild(detailsDiv);
    panel.appendChild(opponentBox);

    // Selection instruction
    const hint = document.createElement('div');
    hint.className = 'battle-hint';
    hint.textContent = `選擇出戰香腸（最多 ${this.maxUnits} 條）：`;
    panel.appendChild(hint);

    // Counter
    const counter = document.createElement('div');
    counter.className = 'battle-counter';
    counter.textContent = `已選：0 / ${this.maxUnits}`;
    panel.appendChild(counter);

    // Sausage selection list
    const selectionList = document.createElement('div');
    selectionList.className = 'battle-selection-list';

    const plusButtons: HTMLButtonElement[] = [];

    if (data.inventoryEntries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'battle-empty';
      empty.textContent = '庫存全空！無法出戰（直接逃跑）';
      selectionList.appendChild(empty);
    } else {
      data.inventoryEntries.forEach(([sausageId, availableQty]) => {
        const sausageType = SAUSAGE_MAP[sausageId];
        if (!sausageType) return;

        this.selectedSausages[sausageId] = 0;

        const row = document.createElement('div');
        row.className = 'battle-sausage-row';

        // Sausage info section
        const infoDiv = document.createElement('div');
        infoDiv.className = 'battle-sausage-info';

        const emojiEl = document.createElement('span');
        emojiEl.className = 'bsaus-emoji';
        emojiEl.textContent = sausageType.emoji;

        const textDiv = document.createElement('div');

        const nameEl = document.createElement('div');
        nameEl.className = 'bsaus-name';
        nameEl.textContent = sausageType.name;

        const statsEl = document.createElement('div');
        statsEl.className = 'bsaus-stats';
        statsEl.textContent = `HP ${sausageType.battle.hp} / 攻 ${sausageType.battle.atk} / 速 ${sausageType.battle.spd}`;

        textDiv.appendChild(nameEl);
        textDiv.appendChild(statsEl);
        infoDiv.appendChild(emojiEl);
        infoDiv.appendChild(textDiv);

        // Qty control
        const control = document.createElement('div');
        control.className = 'qty-control';

        const minusBtn = document.createElement('button');
        minusBtn.className = 'qty-btn btn-neon-red';
        minusBtn.textContent = '−';
        minusBtn.disabled = true;

        const display = document.createElement('span');
        display.className = 'qty-display';
        display.textContent = '0';

        const plusBtn = document.createElement('button');
        plusBtn.className = 'qty-btn btn-neon-cyan';
        plusBtn.textContent = '+';
        plusButtons.push(plusBtn);

        const stockNote = document.createElement('span');
        stockNote.className = 'battle-stock-note';
        stockNote.textContent = `庫存 ${availableQty}`;

        const updateDisplay = () => {
          const selected = this.selectedSausages[sausageId] ?? 0;
          minusBtn.disabled = selected <= 0;
          display.textContent = String(selected);
          counter.textContent = `已選：${this.totalSelected} / ${this.maxUnits}`;
          // Re-evaluate all plus buttons
          plusButtons.forEach(btn => {
            btn.disabled = this.totalSelected >= this.maxUnits;
          });
          plusBtn.disabled = (this.selectedSausages[sausageId] ?? 0) >= availableQty || this.totalSelected >= this.maxUnits;
        };

        minusBtn.addEventListener('click', () => {
          if ((this.selectedSausages[sausageId] ?? 0) > 0) {
            this.selectedSausages[sausageId]--;
            this.totalSelected--;
            updateDisplay();
          }
        });

        plusBtn.addEventListener('click', () => {
          const current = this.selectedSausages[sausageId] ?? 0;
          if (current < availableQty && this.totalSelected < this.maxUnits) {
            this.selectedSausages[sausageId] = current + 1;
            this.totalSelected++;
            updateDisplay();
          }
        });

        control.appendChild(minusBtn);
        control.appendChild(display);
        control.appendChild(plusBtn);

        row.appendChild(infoDiv);
        row.appendChild(control);
        row.appendChild(stockNote);
        selectionList.appendChild(row);
      });
    }

    panel.appendChild(selectionList);

    // Buttons row
    const btnRow = document.createElement('div');
    btnRow.className = 'battle-btn-row';

    // Skip/flee button
    const skipBtn = document.createElement('button');
    skipBtn.className = 'btn-neon btn-neon-red';
    skipBtn.style.fontSize = '14px';
    skipBtn.style.padding = '8px 18px';
    skipBtn.textContent = '逃跑';
    skipBtn.addEventListener('click', () => {
      EventBus.emit('battle-skip');
    });

    // Start battle button
    const startBtn = document.createElement('button');
    startBtn.className = 'btn-neon';
    startBtn.textContent = '開戰！';
    startBtn.addEventListener('click', () => {
      const hasUnits = Object.values(this.selectedSausages).some(qty => qty > 0);
      if (!hasUnits && data.inventoryEntries.length > 0) {
        // Auto-pick 1 sausage of first available type
        const [firstId] = data.inventoryEntries[0];
        this.selectedSausages[firstId] = 1;
        this.totalSelected = 1;
      }
      EventBus.emit('battle-start', { selectedSausages: { ...this.selectedSausages } });
    });

    btnRow.appendChild(skipBtn);
    btnRow.appendChild(startBtn);
    panel.appendChild(btnRow);

    return panel;
  }
}

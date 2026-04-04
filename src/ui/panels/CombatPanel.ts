// CombatPanel — 衝突事件 HTML panel (pure DOM, no Phaser)
import { EventBus } from '../../utils/EventBus';
import type { CombatAction, CustomerPersonality } from '../../types';
import { resolveCombat, applyCombatOutcome, PERSONALITY_NAMES } from '../../systems/CombatEngine';
import { gameState } from '../../state/GameState';


const PERSONALITY_DESCRIPTIONS: Partial<Record<CustomerPersonality, string>> = {
  karen: '一個大嬸衝過來拍你攤位：「你這是什麼黑心攤販！」',
  enforcer: '一個刺青男走過來，拍了拍你的肩膀：「兄弟，懂規矩吧？」',
  inspector: '一個戴眼鏡的人掏出證件：「例行食安稽查，請配合。」',
  spy: '你注意到一個人一直在偷看你的烤架，鬼鬼祟祟...',
};

interface ActionConfig {
  action: CombatAction;
  emoji: string;
  name: string;
  desc: string;
  costLabel?: string;
  isAvailable: () => boolean;
}

const ACTION_CONFIGS: ActionConfig[] = [
  {
    action: 'push',
    emoji: '',
    name: '輕推',
    desc: '把他推開',
    isAvailable: () => true,
  },
  {
    action: 'splash',
    emoji: '',
    name: '潑食材',
    desc: '一碗醬料招呼',
    costLabel: '$15',
    isAvailable: () => gameState.money >= 15,
  },
  {
    action: 'pan',
    emoji: '',
    name: '用鍋打',
    desc: '一鍋蓋過去',
    isAvailable: () => true,
  },
  {
    action: 'bodyguard',
    emoji: '',
    name: '請保鑣',
    desc: '花錢找兄弟罩',
    costLabel: '$300',
    isAvailable: () => gameState.money >= 300 && !gameState.hasBodyguard,
  },
  {
    action: 'fake_slip',
    emoji: '',
    name: '假裝滑倒',
    desc: '用油製造意外',
    costLabel: '$20',
    isAvailable: () => gameState.money >= 20,
  },
  {
    action: 'bribe',
    emoji: '',
    name: '塞錢',
    desc: '用錢解決問題',
    costLabel: '$100-200',
    isAvailable: () => gameState.money >= 100,
  },
];

export class CombatPanel {
  private panel: HTMLElement;
  private personality: CustomerPersonality;
  private witnessCount: number;

  constructor(customer: { personality: CustomerPersonality; witnessCount: number }) {
    this.personality = customer.personality;
    this.witnessCount = customer.witnessCount;

    this.panel = document.createElement('div');
    this.panel.className = 'game-panel ui-interactive event-panel combat-panel';

    this.buildChoicePhase();
  }

  private clearPanel(): void {
    while (this.panel.firstChild) {
      this.panel.removeChild(this.panel.firstChild);
    }
  }

  private buildChoicePhase(): void {
    this.clearPanel();

    // Category badge
    const badge = document.createElement('div');
    badge.className = 'event-category-badge';
    badge.textContent = '衝突發生';
    badge.dataset['category'] = 'combat';
    this.panel.appendChild(badge);

    // Title
    const name = PERSONALITY_NAMES[this.personality];
    const titleEl = document.createElement('div');
    titleEl.className = 'panel-title neon-flicker';
    titleEl.textContent = name;
    this.panel.appendChild(titleEl);

    const alertImg = document.createElement('img');
    alertImg.src = 'karen-alert.png';
    alertImg.style.cssText = 'width:100%; max-height:180px; object-fit:contain; margin:8px 0;';
    alertImg.onerror = () => alertImg.style.display = 'none'; // hide if fails
    this.panel.appendChild(alertImg);

    // Description
    const desc = PERSONALITY_DESCRIPTIONS[this.personality] ?? '有人在找你麻煩...';
    const descEl = document.createElement('div');
    descEl.className = 'story-text event-description';
    descEl.textContent = desc;
    this.panel.appendChild(descEl);

    // Witness warning
    if (this.witnessCount > 0) {
      const witnessEl = document.createElement('div');
      witnessEl.className = 'story-text';
      witnessEl.style.color = '#f5c842';
      witnessEl.style.marginBottom = '6px';
      witnessEl.textContent = `注意：有 ${this.witnessCount} 個路人在圍觀`;
      this.panel.appendChild(witnessEl);
    }

    // Bodyguard notice
    if (gameState.hasBodyguard) {
      const guardEl = document.createElement('div');
      guardEl.className = 'story-text';
      guardEl.style.color = '#4caf50';
      guardEl.style.marginBottom = '6px';
      guardEl.textContent = '你的保鑣就在身邊';
      this.panel.appendChild(guardEl);
    }

    // Action buttons in 2-column grid
    const choicesEl = document.createElement('div');
    choicesEl.className = 'event-choices';
    choicesEl.style.display = 'grid';
    choicesEl.style.gridTemplateColumns = '1fr 1fr';
    choicesEl.style.gap = '8px';

    ACTION_CONFIGS.forEach(config => {
      if (!config.isAvailable()) return;

      const btn = document.createElement('button');
      btn.className = 'btn-neon event-choice-btn';

      const emojiSpan = document.createElement('span');
      emojiSpan.className = 'choice-emoji';
      emojiSpan.textContent = config.emoji;

      const nameSpan = document.createElement('span');
      nameSpan.textContent = ` ${config.name}`;

      const descSmall = document.createElement('small');
      descSmall.style.display = 'block';
      descSmall.style.opacity = '0.75';
      descSmall.style.fontSize = '0.8em';
      descSmall.textContent = config.costLabel
        ? `${config.desc} (${config.costLabel})`
        : config.desc;

      btn.appendChild(emojiSpan);
      btn.appendChild(nameSpan);
      btn.appendChild(descSmall);

      btn.addEventListener('click', () => {
        const outcome = resolveCombat(config.action, this.personality, this.witnessCount);
        applyCombatOutcome(outcome);
        this.buildResultPhase(outcome);
      });

      choicesEl.appendChild(btn);
    });

    this.panel.appendChild(choicesEl);

    // Full-width ignore button
    const ignoreBtnWrap = document.createElement('div');
    ignoreBtnWrap.style.marginTop = '10px';

    const ignoreBtn = document.createElement('button');
    ignoreBtn.className = 'btn-neon ignore-btn';
    ignoreBtn.style.width = '100%';
    ignoreBtn.textContent = '無視，繼續烤';
    ignoreBtn.addEventListener('click', () => {
      EventBus.emit('combat-done', {});
    });

    ignoreBtnWrap.appendChild(ignoreBtn);
    this.panel.appendChild(ignoreBtnWrap);
  }

  private buildResultPhase(outcome: ReturnType<typeof resolveCombat>): void {
    this.clearPanel();

    // Title stays
    const name = PERSONALITY_NAMES[this.personality];
    const titleEl = document.createElement('div');
    titleEl.className = 'panel-title neon-flicker';
    titleEl.textContent = name;
    this.panel.appendChild(titleEl);

    // Result text
    const resultEl = document.createElement('div');
    resultEl.className = 'story-text event-result-text';
    resultEl.textContent = outcome.resultText;
    this.panel.appendChild(resultEl);

    // Effects display
    const effectsEl = document.createElement('div');
    effectsEl.className = 'event-effects';

    const hasEffects =
      outcome.moneyDelta !== 0 ||
      outcome.repDelta !== 0 ||
      outcome.undergroundRepDelta !== 0 ||
      outcome.chaosPoints > 0;

    if (hasEffects) {
      const effectsTitle = document.createElement('div');
      effectsTitle.className = 'event-effects-title';
      effectsTitle.textContent = '事件影響';
      effectsEl.appendChild(effectsTitle);

      if (outcome.moneyDelta !== 0) {
        effectsEl.appendChild(this.buildEffectRow(
          '金錢',
          outcome.moneyDelta > 0 ? `+$${outcome.moneyDelta}` : `-$${Math.abs(outcome.moneyDelta)}`,
          outcome.moneyDelta >= 0 ? 'positive' : 'negative'
        ));
      }

      if (outcome.repDelta !== 0) {
        effectsEl.appendChild(this.buildEffectRow(
          '聲望',
          outcome.repDelta > 0 ? `+${outcome.repDelta}` : `${outcome.repDelta}`,
          outcome.repDelta >= 0 ? 'positive' : 'negative'
        ));
      }

      if (outcome.undergroundRepDelta !== 0) {
        effectsEl.appendChild(this.buildEffectRow(
          '地下聲望',
          outcome.undergroundRepDelta > 0 ? `+${outcome.undergroundRepDelta}` : `${outcome.undergroundRepDelta}`,
          outcome.undergroundRepDelta >= 0 ? 'positive' : 'negative'
        ));
      }

      if (outcome.chaosPoints > 0) {
        effectsEl.appendChild(this.buildEffectRow(
          '混亂值',
          `+${outcome.chaosPoints}`,
          'negative'
        ));
      }

      if (outcome.witnessEffect > 0) {
        const witnessRounded = Math.round(outcome.witnessEffect * 10) / 10;
        effectsEl.appendChild(this.buildEffectRow(
          '圍觀效應',
          `${witnessRounded}`,
          'neutral'
        ));
      }
    }

    this.panel.appendChild(effectsEl);

    // Continue button
    const btnCenter = document.createElement('div');
    btnCenter.className = 'btn-center';
    btnCenter.style.marginTop = '20px';

    const continueBtn = document.createElement('button');
    continueBtn.className = 'btn-neon';
    continueBtn.textContent = '繼續烤肉 ▶';
    continueBtn.addEventListener('click', () => {
      EventBus.emit('combat-done', {});
    });
    btnCenter.appendChild(continueBtn);
    this.panel.appendChild(btnCenter);
  }

  private buildEffectRow(label: string, value: string, type: 'positive' | 'negative' | 'neutral'): HTMLElement {
    const row = document.createElement('div');
    row.className = 'event-effect-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'event-effect-label';
    labelEl.textContent = label;

    const valueEl = document.createElement('span');
    valueEl.className = `event-effect-value effect-${type}`;
    valueEl.textContent = value;

    row.appendChild(labelEl);
    row.appendChild(valueEl);
    return row;
  }

  getElement(): HTMLElement {
    return this.panel;
  }

  destroy(): void {
    // No persistent listeners to remove
  }
}

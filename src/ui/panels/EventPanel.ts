// EventPanel — 突發事件 HTML panel (pure DOM, no Phaser)
import { EventBus } from '../../utils/EventBus';
import { applyEventChoice } from '../../systems/EventEngine';
import type { GameEvent, EventChoice } from '../../data/events';

const EVENT_IMAGES: Record<string, string> = {
  'costco-guy': 'event-costco-guy.png',
  'food-critic': 'event-food-critic.png',
  'drunk-uncle': 'event-drunk-uncle.png',
  'instagram-karen': 'customer-karen.png',
  'kid-tantrum': 'karen-alert.png',
  'protection-fee': 'event-thugs.png',
  'territory-threat': 'event-thugs.png',
  'gang-offer': 'event-thugs.png',
  'inspector-surprise': 'event-inspector.png',
  'management-fee-weekly': 'event-thugs.png',
  'influencer-livestream': 'customer-influencer.png',
  'competitor-spy': 'customer-influencer.png',
  'media-crisis-exposed': 'event-inspector.png',
  'employee-strike': 'karen-alert.png',
  'expired-ingredient-gamble': 'karen-alert.png',
  'underground-delivery': 'event-thugs.png',
  'celebrity-visit': 'customer-fatcat.png',
  'food-festival': 'event-food-festival.png',
  'rain-bonus': 'event-rain.png',
};

export class EventPanel {
  private panel: HTMLElement;

  constructor(event: GameEvent) {
    this.panel = document.createElement('div');
    this.panel.className = 'game-panel ui-interactive event-panel fade-in';
    this.panel.style.position = 'relative';

    // Subtle event background illustration
    const bgDiv = document.createElement('div');
    bgDiv.style.cssText = 'position:absolute; top:0; left:0; right:0; bottom:0; background:url(bg-event.png) center/cover; opacity:0.25; pointer-events:none; border-radius:inherit;';
    this.panel.appendChild(bgDiv);

    this.buildChoicePhase(event);
  }

  private clearPanel(): void {
    while (this.panel.firstChild) {
      this.panel.removeChild(this.panel.firstChild);
    }
  }

  private buildChoicePhase(event: GameEvent): void {
    this.clearPanel();

    // Category badge
    const badge = document.createElement('div');
    badge.className = 'event-category-badge';
    const categoryLabels: Record<string, string> = {
      customer: '奧客來了',
      gangster: '黑道警告',
      positive: '好事發生',
      underground: '地下事件',
      social: '社會壓力',
      combat: '衝突事件',
      chaos: '混沌事件',
    };
    badge.textContent = categoryLabels[event.category] ?? '突發事件';
    badge.dataset['category'] = event.category;
    this.panel.appendChild(badge);

    // Title
    const titleEl = document.createElement('div');
    titleEl.className = 'panel-title neon-flicker';
    titleEl.textContent = event.name;
    this.panel.appendChild(titleEl);

    // Event illustration (if available for this event ID)
    const eventImage = EVENT_IMAGES[event.id];
    if (eventImage) {
      const img = document.createElement('img');
      img.src = eventImage;
      img.style.cssText = 'width:100%; max-height:180px; object-fit:contain; border-radius:8px; margin:8px 0; opacity:0.85;';
      this.panel.appendChild(img);
    }

    // Description — support newlines via text nodes and <br> elements
    const descEl = document.createElement('div');
    descEl.className = 'story-text event-description';
    const lines = event.description.split('\n');
    lines.forEach((line, idx) => {
      descEl.appendChild(document.createTextNode(line));
      if (idx < lines.length - 1) {
        descEl.appendChild(document.createElement('br'));
      }
    });
    this.panel.appendChild(descEl);

    // Choice buttons
    const choicesEl = document.createElement('div');
    choicesEl.className = 'event-choices';

    event.choices.forEach((choice, index) => {
      const btn = document.createElement('button');
      btn.className = 'btn-neon event-choice-btn';

      const textNode = document.createTextNode(choice.text);

      btn.appendChild(textNode);

      btn.addEventListener('click', () => {
        const resolvedChoice = applyEventChoice(event, index);
        this.buildResultPhase(event, resolvedChoice);
      });
      choicesEl.appendChild(btn);
    });

    this.panel.appendChild(choicesEl);
  }

  private buildResultPhase(event: GameEvent, choice: EventChoice): void {
    this.clearPanel();

    // Title stays
    const titleEl = document.createElement('div');
    titleEl.className = 'panel-title neon-flicker';
    titleEl.textContent = event.name;
    this.panel.appendChild(titleEl);

    // Result text
    const resultEl = document.createElement('div');
    resultEl.className = 'story-text event-result-text';
    resultEl.textContent = choice.resultText;
    this.panel.appendChild(resultEl);

    // Effects display
    const effectsEl = document.createElement('div');
    effectsEl.className = 'event-effects';

    const { effects } = choice;
    const hasEffects =
      effects.money !== undefined ||
      effects.reputation !== undefined ||
      effects.trafficBonus !== undefined ||
      effects.skipDay === true;

    if (hasEffects) {
      const effectsTitle = document.createElement('div');
      effectsTitle.className = 'event-effects-title';
      effectsTitle.textContent = '事件影響';
      effectsEl.appendChild(effectsTitle);

      if (effects.money !== undefined) {
        effectsEl.appendChild(this.buildEffectRow(
          '金錢',
          effects.money > 0 ? `+$${effects.money}` : `-$${Math.abs(effects.money)}`,
          effects.money >= 0 ? 'positive' : 'negative'
        ));
      }

      if (effects.reputation !== undefined) {
        effectsEl.appendChild(this.buildEffectRow(
          '聲望',
          effects.reputation > 0 ? `+${effects.reputation}` : `${effects.reputation}`,
          effects.reputation >= 0 ? 'positive' : 'negative'
        ));
      }

      if (effects.trafficBonus !== undefined) {
        const pct = Math.round(effects.trafficBonus * 100);
        effectsEl.appendChild(this.buildEffectRow(
          '今日人流',
          `+${pct}%`,
          'positive'
        ));
      }

      if (effects.skipDay === true) {
        effectsEl.appendChild(this.buildEffectRow('今日', '跳過', 'negative'));
      }
    }

    this.panel.appendChild(effectsEl);

    // Continue button
    const btnCenter = document.createElement('div');
    btnCenter.className = 'btn-center';
    btnCenter.style.marginTop = '20px';

    const continueBtn = document.createElement('button');
    continueBtn.className = 'btn-neon';
    continueBtn.textContent = '繼續營業 ▶';
    const onContinueClick = (): void => {
      // Disable immediately to prevent double-emit on rapid clicks
      continueBtn.disabled = true;
      continueBtn.removeEventListener('click', onContinueClick);
      EventBus.emit('event-done', {});
    };
    continueBtn.addEventListener('click', onContinueClick);
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
    this.panel.remove();
  }
}

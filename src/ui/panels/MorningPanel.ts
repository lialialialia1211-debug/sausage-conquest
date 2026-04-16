// MorningPanel — 早上進貨備料 HTML panel (pure DOM, no Phaser)
import { EventBus } from '../../utils/EventBus';
import { gameState, updateGameState } from '../../state/GameState';
import { buyStock } from '../../systems/EconomyEngine';
import { SAUSAGE_TYPES } from '../../data/sausages';
import { GRID_SLOTS } from '../../data/map';
import type { SausageType } from '../../types';

// Fallback minimum rent reserve (covers tier-1 which is free)
const MIN_RENT_RESERVE_FLOOR = 200;

export interface SpoilageInfo {
  spoilage: Record<string, number>;
}

const PREP_CHOICES = [
  {
    id: 'scout',
    label: '偵查對手',
    desc: '「觀察隔壁攤的弱點」',
    effect: '戰鬥武器加成 +15%',
  },
  {
    id: 'practice',
    label: '練習烤功',
    desc: '「早起練翻香腸」',
    effect: '今日普通品質有 50% 機率升為完美',
  },
  {
    id: 'social',
    label: '串門子',
    desc: '「跟鄰居攤販聊天」',
    effect: '多一次事件機會，客流量 +10%',
  },
] as const;

export class MorningPanel {
  private panel: HTMLElement;
  private quantities: Record<string, number> = {};
  private summarySpend: HTMLElement;
  private summaryRemain: HTMLElement;
  private rentWarning: HTMLElement;
  private confirmBtn: HTMLButtonElement;
  private qtyDisplays: Map<string, HTMLElement> = new Map();
  private subtotalEls: Map<string, HTMLElement> = new Map();
  private cardRefs: Map<string, { sausage: SausageType }> = new Map();
  private selectedPrep: string = '';

  constructor(spoilageInfo?: SpoilageInfo) {
    // Init quantities to 0 for each sausage type
    for (const s of SAUSAGE_TYPES) {
      this.quantities[s.id] = 0;
    }

    this.panel = document.createElement('div');
    this.panel.className = 'game-panel ui-interactive morning-panel';

    // Title
    const titleEl = document.createElement('div');
    titleEl.className = 'panel-title neon-flicker';
    titleEl.textContent = '早上 — 進貨備料';
    this.panel.appendChild(titleEl);

    // Stats / suggestion section
    const statsSection = document.createElement('div');
    statsSection.className = 'morning-stats';
    statsSection.style.cssText = 'background:#111;border:1px solid #333;border-radius:6px;padding:10px 14px;margin-bottom:12px;font-size:13px;color:#ccc;line-height:1.8;';

    if (gameState.day === 1) {
      statsSection.textContent = '新手建議：先買 15~20 根試試水溫';
    } else {
      const lastSlot = gameState.selectedSlot;
      const slotInfo = lastSlot >= 0 ? GRID_SLOTS.find(s => s.id === lastSlot) : null;
      const traffic = slotInfo ? slotInfo.baseTraffic : 40;
      const suggestMin = Math.round(traffic * 0.6);
      const suggestMax = Math.round(traffic * 0.9);
      statsSection.textContent = `建議今日進貨：${suggestMin}~${suggestMax} 根（依攤位地段估算）`;
    }
    this.panel.appendChild(statsSection);

    // ── Morning prep section ────────────────────────────────────────────────
    const prepSection = document.createElement('div');
    prepSection.style.cssText = 'margin-bottom:14px;';

    const prepTitle = document.createElement('div');
    prepTitle.style.cssText = 'font-size:13px;color:#aaa;margin-bottom:8px;letter-spacing:1px;text-transform:uppercase;';
    prepTitle.textContent = '今天的準備（選一項）';
    prepSection.appendChild(prepTitle);

    const prepBtns: HTMLButtonElement[] = [];
    for (const choice of PREP_CHOICES) {
      const btn = document.createElement('button');
      btn.style.cssText = [
        'display:block;width:100%;text-align:left;',
        'background:#0d0d1a;border:1px solid #333;border-radius:6px;',
        'padding:10px 14px;margin-bottom:6px;cursor:pointer;',
        'transition:border-color 0.15s,background 0.15s;',
      ].join('');

      const labelEl = document.createElement('span');
      labelEl.style.cssText = 'font-size:14px;font-weight:bold;color:#e0e0ff;display:block;';
      labelEl.textContent = `${choice.label} — ${choice.desc}`;

      const effectEl = document.createElement('span');
      effectEl.style.cssText = 'font-size:11px;color:#666;display:block;margin-top:3px;';
      effectEl.textContent = choice.effect;

      btn.appendChild(labelEl);
      btn.appendChild(effectEl);

      btn.addEventListener('click', () => {
        this.selectedPrep = choice.id;
        updateGameState({ morningPrep: choice.id });
        // Update button visuals
        for (const b of prepBtns) {
          b.style.borderColor = '#333';
          b.style.background = '#0d0d1a';
        }
        btn.style.borderColor = '#7b44ff';
        btn.style.background = '#1a0f33';
        this.updateSummary();
      });

      prepBtns.push(btn);
      prepSection.appendChild(btn);
    }

    // Skip link
    const skipWrap = document.createElement('div');
    skipWrap.style.cssText = 'text-align:right;margin-top:2px;';
    const skipLink = document.createElement('a');
    skipLink.href = '#';
    skipLink.textContent = '跳過';
    skipLink.style.cssText = 'font-size:11px;color:#555;text-decoration:underline;';
    skipLink.addEventListener('click', (e) => {
      e.preventDefault();
      this.selectedPrep = 'skip';
      updateGameState({ morningPrep: 'skip' });
      for (const b of prepBtns) {
        b.style.borderColor = '#333';
        b.style.background = '#0d0d1a';
      }
      this.updateSummary();
    });
    skipWrap.appendChild(skipLink);
    prepSection.appendChild(skipWrap);

    this.panel.appendChild(prepSection);

    // Sausage cards container (only show unlocked types)
    const cardsEl = document.createElement('div');
    cardsEl.className = 'sausage-cards';
    const unlockedTypes = SAUSAGE_TYPES.filter(s => gameState.unlockedSausages.includes(s.id));
    for (const sausage of unlockedTypes) {
      const card = this.buildSausageCard(sausage, spoilageInfo);
      cardsEl.appendChild(card);
    }
    this.panel.appendChild(cardsEl);

    // Purchase summary
    const summaryEl = document.createElement('div');
    summaryEl.className = 'purchase-summary';

    const spendRow = document.createElement('div');
    spendRow.className = 'summary-row';
    const spendLabel = document.createElement('span');
    spendLabel.className = 'summary-label';
    spendLabel.textContent = '本次花費';
    this.summarySpend = document.createElement('span');
    this.summarySpend.className = 'summary-value neon-yellow';
    this.summarySpend.textContent = '$0';
    spendRow.appendChild(spendLabel);
    spendRow.appendChild(this.summarySpend);

    const remainRow = document.createElement('div');
    remainRow.className = 'summary-row';
    const remainLabel = document.createElement('span');
    remainLabel.className = 'summary-label';
    remainLabel.textContent = '剩餘資金';
    this.summaryRemain = document.createElement('span');
    this.summaryRemain.className = 'summary-value neon-green';
    this.summaryRemain.textContent = `$${gameState.money}`;
    remainRow.appendChild(remainLabel);
    remainRow.appendChild(this.summaryRemain);

    summaryEl.appendChild(spendRow);
    summaryEl.appendChild(remainRow);
    this.panel.appendChild(summaryEl);

    // Rent reserve warning
    this.rentWarning = document.createElement('div');
    this.rentWarning.className = 'rent-warning';
    this.rentWarning.textContent = `至少保留 $${MIN_RENT_RESERVE_FLOOR} 租金，否則傍晚無法擺攤！`;
    this.rentWarning.style.display = 'none';
    this.rentWarning.style.color = 'var(--neon-red, #ff4444)';
    this.rentWarning.style.fontSize = '13px';
    this.rentWarning.style.marginTop = '6px';
    this.rentWarning.style.textAlign = 'center';
    this.panel.appendChild(this.rentWarning);

    // Confirm button
    const btnCenter = document.createElement('div');
    btnCenter.className = 'btn-center';
    btnCenter.style.marginTop = '16px';

    this.confirmBtn = document.createElement('button');
    this.confirmBtn.className = 'btn-neon';
    this.confirmBtn.addEventListener('click', this.onConfirm);
    btnCenter.appendChild(this.confirmBtn);
    this.panel.appendChild(btnCenter);

    // Set initial button state
    this.updateSummary();
  }

  private getRentReserve(): number {
    const slotId = gameState.selectedSlot >= 0 ? gameState.selectedSlot : gameState.playerSlot;
    const slot = GRID_SLOTS.find(s => s.id === slotId);
    return Math.max(MIN_RENT_RESERVE_FLOOR, slot?.rent ?? 0);
  }

  private buildSausageCard(sausage: SausageType, spoilageInfo?: SpoilageInfo): HTMLElement {
    const card = document.createElement('div');
    card.className = 'sausage-card';

    // Header row: emoji + name + cost
    const headerEl = document.createElement('div');
    headerEl.className = 'sausage-card-header';

    const emojiEl = document.createElement('span');
    emojiEl.className = 'sausage-emoji';
    emojiEl.textContent = sausage.emoji;
    if (sausage.image) {
      const img = document.createElement('img');
      img.src = sausage.image;
      img.style.cssText = 'width:48px; height:48px; object-fit:contain; border-radius:6px;';
      img.alt = sausage.name;
      emojiEl.textContent = '';
      emojiEl.appendChild(img);
    }

    const infoEl = document.createElement('div');
    infoEl.className = 'sausage-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'sausage-name';
    nameEl.textContent = sausage.name;

    const costEl = document.createElement('div');
    costEl.className = 'sausage-cost';
    costEl.textContent = `$${sausage.cost} / 根`;

    const descEl = document.createElement('div');
    descEl.className = 'sausage-desc';
    descEl.textContent = sausage.description;

    infoEl.appendChild(nameEl);
    infoEl.appendChild(costEl);
    infoEl.appendChild(descEl);

    headerEl.appendChild(emojiEl);
    headerEl.appendChild(infoEl);
    card.appendChild(headerEl);

    // Inventory hint row
    const currentStock = gameState.inventory[sausage.id] ?? 0;
    const spoiledQty = spoilageInfo?.spoilage[sausage.id] ?? 0;

    const stockHintEl = document.createElement('div');
    stockHintEl.className = 'sausage-stock-hint';
    if (spoiledQty > 0) {
      stockHintEl.textContent = `庫存: ${currentStock} 根（昨晚損耗 ${spoiledQty} 根）`;
    } else {
      stockHintEl.textContent = `庫存: ${currentStock} 根`;
    }
    card.appendChild(stockHintEl);

    // Quantity control row
    const qtyRowEl = document.createElement('div');
    qtyRowEl.className = 'qty-row';

    // Quick-add buttons row: -10, -5, -1, [input], +1, +5, +10
    const qtyControl = document.createElement('div');
    qtyControl.className = 'qty-control';
    qtyControl.style.display = 'flex';
    qtyControl.style.alignItems = 'center';
    qtyControl.style.gap = '4px';
    qtyControl.style.flexWrap = 'wrap';

    const subtotalEl = document.createElement('span');
    subtotalEl.className = 'sausage-subtotal';
    subtotalEl.textContent = `小計 $0`;
    this.subtotalEls.set(sausage.id, subtotalEl);

    // Editable input for direct number entry
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.className = 'qty-input';
    qtyInput.value = '0';
    qtyInput.min = '0';
    qtyInput.style.width = '48px';
    qtyInput.style.textAlign = 'center';
    qtyInput.style.fontSize = '16px';
    qtyInput.style.fontWeight = 'bold';
    qtyInput.style.background = '#111';
    qtyInput.style.color = '#fff';
    qtyInput.style.border = '1px solid #444';
    qtyInput.style.borderRadius = '4px';
    qtyInput.style.padding = '4px 2px';
    qtyInput.style.appearance = 'textfield';
    qtyInput.addEventListener('change', () => {
      const raw = parseInt(qtyInput.value) || 0;
      // calcMaxAffordable is defined below and closed over via the card scope
      this.setQuantity(sausage, raw, qtyInput, subtotalEl);
    });
    qtyInput.addEventListener('blur', () => {
      const raw = parseInt(qtyInput.value) || 0;
      this.setQuantity(sausage, raw, qtyInput, subtotalEl);
    });
    this.qtyDisplays.set(sausage.id, qtyInput);
    this.cardRefs.set(sausage.id, { sausage });

    const MAX_QUANTITY = 99;

    const calcMaxAffordable = (): number => {
      const otherSpend = this.calcTotalCost() - this.quantities[sausage.id] * sausage.cost;
      const remaining = gameState.money - otherSpend;
      const spendable = Math.max(0, remaining - this.getRentReserve());
      return Math.min(MAX_QUANTITY, Math.floor(spendable / sausage.cost));
    };

    const makeBtn = (label: string, delta: number): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.className = delta > 0 ? 'qty-btn btn-neon-cyan' : 'qty-btn btn-neon-red';
      btn.textContent = label;
      btn.style.minWidth = '36px';
      btn.style.padding = '4px 6px';
      btn.style.fontSize = '13px';
      btn.addEventListener('click', () => {
        const maxAffordable = calcMaxAffordable();
        const newVal = Math.max(0, Math.min(maxAffordable, this.quantities[sausage.id] + delta));
        this.setQuantity(sausage, newVal, qtyInput, subtotalEl);
      });
      return btn;
    };

    // "清空" button — destructive, sets quantity to 0
    const clearBtn = document.createElement('button');
    clearBtn.className = 'qty-btn';
    clearBtn.textContent = '清空';
    clearBtn.style.minWidth = '36px';
    clearBtn.style.padding = '4px 6px';
    clearBtn.style.fontSize = '13px';
    clearBtn.style.color = '#ff6666';
    clearBtn.style.borderColor = '#ff4444';
    clearBtn.addEventListener('click', () => {
      this.setQuantity(sausage, 0, qtyInput, subtotalEl);
    });

    qtyControl.appendChild(clearBtn);
    qtyControl.appendChild(makeBtn('-10', -10));
    qtyControl.appendChild(makeBtn('-5', -5));
    qtyControl.appendChild(makeBtn('-1', -1));
    qtyControl.appendChild(qtyInput);
    qtyControl.appendChild(makeBtn('+1', +1));
    qtyControl.appendChild(makeBtn('+5', +5));
    qtyControl.appendChild(makeBtn('+10', +10));

    // "Max buy" button — reserves MIN_RENT_RESERVE for evening slot, capped at 99
    const maxBtn = document.createElement('button');
    maxBtn.className = 'qty-btn btn-neon-cyan';
    maxBtn.textContent = '最大';
    maxBtn.style.minWidth = '42px';
    maxBtn.style.padding = '4px 6px';
    maxBtn.style.fontSize = '13px';
    maxBtn.addEventListener('click', () => {
      this.setQuantity(sausage, calcMaxAffordable(), qtyInput, subtotalEl);
    });
    qtyControl.appendChild(maxBtn);

    qtyRowEl.appendChild(qtyControl);
    qtyRowEl.appendChild(subtotalEl);
    card.appendChild(qtyRowEl);

    return card;
  }

  private setQuantity(sausage: SausageType, qty: number, input: HTMLInputElement, subtotalEl: HTMLElement): void {
    // Clamp: can't go below 0, can't exceed 99, can't exceed what we can afford while keeping rent reserve
    const MAX_QUANTITY = 99;
    const reserve = this.getRentReserve();
    const otherSpend = this.calcTotalCost() - this.quantities[sausage.id] * sausage.cost;
    const remaining = gameState.money - otherSpend;
    const spendable = Math.max(0, remaining - reserve);
    const maxAffordable = Math.min(MAX_QUANTITY, Math.floor(spendable / sausage.cost));
    const clamped = Math.max(0, Math.min(qty, maxAffordable));

    // Show warning if user tried to exceed the rent-reserved limit
    const wouldExceed = qty > maxAffordable && remaining > 0;
    this.rentWarning.textContent = `至少保留 $${reserve} 租金，否則傍晚無法擺攤！`;
    this.rentWarning.style.display = wouldExceed ? 'block' : 'none';

    this.quantities[sausage.id] = clamped;
    input.value = String(clamped);
    subtotalEl.textContent = `小計 $${clamped * sausage.cost}`;
    this.updateSummary();
  }

  private calcTotalCost(): number {
    let total = 0;
    for (const sausage of SAUSAGE_TYPES) {
      total += (this.quantities[sausage.id] ?? 0) * sausage.cost;
    }
    return total;
  }

  private updateSummary(): void {
    const totalSpend = this.calcTotalCost();
    const remaining = gameState.money - totalSpend;

    this.summarySpend.textContent = `$${totalSpend}`;
    this.summaryRemain.textContent = `$${remaining}`;

    // Color the remaining amount red if below rent reserve
    const reserve = this.getRentReserve();
    this.summaryRemain.style.color = remaining < reserve ? 'var(--neon-red, #ff4444)' : '';

    // Enable confirm if player has chosen a prep AND (has new purchases OR existing inventory)
    const hasNewPurchases = Object.values(this.quantities).some(q => q > 0);
    const hasExistingStock = Object.values(gameState.inventory).some(q => q > 0);
    const hasPrepChoice = this.selectedPrep !== '';
    const canProceed = hasPrepChoice && (hasNewPurchases || hasExistingStock);
    this.confirmBtn.disabled = !canProceed;
    this.confirmBtn.style.opacity = canProceed ? '1' : '0.5';
    if (!hasPrepChoice) {
      this.confirmBtn.textContent = '請先選擇今日準備';
    } else {
      this.confirmBtn.textContent = hasNewPurchases ? '確認進貨' : '直接出攤';
    }
  }

  private onConfirm = (): void => {
    // Purchase all sausage types with quantity > 0
    for (const sausage of SAUSAGE_TYPES) {
      const qty = this.quantities[sausage.id] ?? 0;
      if (qty > 0) {
        buyStock(sausage.id, qty);
      }
    }
    EventBus.emit('morning-done', {});
  };

  getElement(): HTMLElement {
    return this.panel;
  }

  destroy(): void {
    this.confirmBtn.removeEventListener('click', this.onConfirm);
  }
}

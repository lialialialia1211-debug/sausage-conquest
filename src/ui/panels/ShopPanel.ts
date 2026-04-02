// ShopPanel — 收攤後商店 HTML panel (pure DOM, no Phaser dependency)
import { EventBus } from '../../utils/EventBus';
import { gameState, spendMoney, updateGameState } from '../../state/GameState';
import { CART_UPGRADES, MARKETING_ITEMS } from '../../data/upgrades';
import { WORKERS } from '../../data/workers';
import { LOAN_CONFIGS } from '../../data/loans';
import { canBorrow, takeLoan, repayLoan } from '../../systems/LoanEngine';
import { refundMarketing } from '../../systems/EconomyEngine';

export type ShopTab = 'upgrades' | 'workers' | 'marketing' | 'loans';

export class ShopPanel {
  private panel: HTMLElement;
  private tabContents: Map<ShopTab, HTMLElement> = new Map();
  private tabButtons: Map<ShopTab, HTMLButtonElement> = new Map();

  // Loan sliders
  private bankSlider: HTMLInputElement | null = null;
  private bankSliderDisplay: HTMLElement | null = null;
  private sharkSlider: HTMLInputElement | null = null;
  private sharkSliderDisplay: HTMLElement | null = null;

  constructor() {
    this.panel = document.createElement('div');
    this.panel.className = 'game-panel ui-interactive shop-panel';

    // Title
    const titleEl = document.createElement('div');
    titleEl.className = 'panel-title neon-flicker';
    titleEl.textContent = '收攤後商店';
    this.panel.appendChild(titleEl);

    // Tab bar
    const tabBar = this.buildTabBar();
    this.panel.appendChild(tabBar);

    // Tab content area
    const contentArea = document.createElement('div');
    contentArea.className = 'shop-tab-content';

    const upgradesContent = this.buildUpgradesTab();
    const workersContent = this.buildWorkersTab();
    const marketingContent = this.buildMarketingTab();
    const loansContent = this.buildLoansTab();

    contentArea.appendChild(upgradesContent);
    contentArea.appendChild(workersContent);
    contentArea.appendChild(marketingContent);
    contentArea.appendChild(loansContent);

    this.tabContents.set('upgrades', upgradesContent);
    this.tabContents.set('workers', workersContent);
    this.tabContents.set('marketing', marketingContent);
    this.tabContents.set('loans', loansContent);

    this.panel.appendChild(contentArea);

    // Bottom bar: money + skip button
    const bottomBar = this.buildBottomBar();
    this.panel.appendChild(bottomBar);

    // Set initial tab visible
    this.switchTab('upgrades');
  }

  // ── Tab bar ────────────────────────────────────────────────────────────────

  private buildTabBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'shop-tab-bar';

    const tabs: { key: ShopTab; label: string }[] = [
      { key: 'upgrades', label: '攤車升級' },
      { key: 'workers', label: '工讀生' },
      { key: 'marketing', label: '行銷道具' },
      { key: 'loans', label: '資金周轉' },
    ];

    for (const tab of tabs) {
      const btn = document.createElement('button');
      btn.className = 'shop-tab-btn';
      btn.textContent = tab.label;
      btn.addEventListener('click', () => this.switchTab(tab.key));
      this.tabButtons.set(tab.key, btn);
      bar.appendChild(btn);
    }

    return bar;
  }

  private switchTab(tab: ShopTab): void {
    for (const [key, content] of this.tabContents) {
      content.style.display = key === tab ? 'block' : 'none';
    }

    for (const [key, btn] of this.tabButtons) {
      if (key === tab) {
        btn.classList.add('shop-tab-btn--active');
      } else {
        btn.classList.remove('shop-tab-btn--active');
      }
    }
  }

  // ── Tab 1: 攤車升級 ────────────────────────────────────────────────────────

  private buildUpgradesTab(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'shop-section';

    for (const upgrade of CART_UPGRADES) {
      const card = this.buildUpgradeCard(upgrade);
      container.appendChild(card);
    }

    return container;
  }

  private buildUpgradeCard(upgrade: (typeof CART_UPGRADES)[number]): HTMLElement {
    const isPurchased = !!gameState.upgrades[upgrade.id];
    const canAfford = gameState.money >= upgrade.cost;

    const card = document.createElement('div');
    card.className = 'shop-item-card';
    if (isPurchased) card.classList.add('shop-item-card--purchased');

    // Left: emoji + info
    const infoEl = document.createElement('div');
    infoEl.className = 'shop-item-info';

    const emojiEl = document.createElement('span');
    emojiEl.className = 'shop-item-emoji';
    emojiEl.textContent = upgrade.emoji;

    const detailEl = document.createElement('div');
    detailEl.className = 'shop-item-detail';

    const nameEl = document.createElement('div');
    nameEl.className = 'shop-item-name';
    nameEl.textContent = upgrade.name;

    const descEl = document.createElement('div');
    descEl.className = 'shop-item-desc';
    descEl.textContent = upgrade.description;

    const costEl = document.createElement('div');
    costEl.className = 'shop-item-cost';
    costEl.textContent = `$${upgrade.cost}`;

    detailEl.appendChild(nameEl);
    detailEl.appendChild(descEl);
    detailEl.appendChild(costEl);

    infoEl.appendChild(emojiEl);
    infoEl.appendChild(detailEl);

    // Right: buy button
    const btn = document.createElement('button');

    if (isPurchased) {
      btn.className = 'btn-neon shop-item-btn shop-item-btn--purchased';
      btn.textContent = '已購買';
      btn.disabled = true;
    } else if (!canAfford) {
      btn.className = 'btn-neon shop-item-btn shop-item-btn--disabled';
      btn.textContent = '餘額不足';
      btn.disabled = true;
      btn.style.opacity = '0.4';
      btn.style.cursor = 'not-allowed';
      btn.style.borderColor = 'var(--text-dim)';
      btn.style.color = 'var(--text-dim)';
      btn.style.textShadow = 'none';
      btn.style.boxShadow = 'none';
    } else {
      btn.className = 'btn-neon shop-item-btn';
      btn.textContent = '購買';
      btn.addEventListener('click', () => this.onBuyUpgrade(upgrade, card, btn));
    }

    card.appendChild(infoEl);
    card.appendChild(btn);

    return card;
  }

  private onBuyUpgrade(
    upgrade: (typeof CART_UPGRADES)[number],
    card: HTMLElement,
    btn: HTMLButtonElement,
  ): void {
    const success = spendMoney(upgrade.cost);
    if (!success) {
      btn.textContent = '餘額不足';
      btn.disabled = true;
      btn.style.opacity = '0.4';
      btn.style.cursor = 'not-allowed';
      btn.style.borderColor = 'var(--text-dim)';
      btn.style.color = 'var(--text-dim)';
      btn.style.textShadow = 'none';
      btn.style.boxShadow = 'none';
      return;
    }

    updateGameState({
      upgrades: { ...gameState.upgrades, [upgrade.id]: true },
    });

    // Update card appearance
    card.classList.add('shop-item-card--purchased');
    btn.textContent = '已購買';
    btn.disabled = true;
    btn.className = 'btn-neon shop-item-btn shop-item-btn--purchased';

    // Update money display in bottom bar
    this.refreshMoneyDisplay();

    // Re-check other upgrade buttons affordability
    this.refreshUpgradesTab();
  }

  private refreshUpgradesTab(): void {
    const content = this.tabContents.get('upgrades');
    if (!content) return;
    // Rebuild the upgrades tab in place
    content.textContent = '';
    for (const upgrade of CART_UPGRADES) {
      const card = this.buildUpgradeCard(upgrade);
      content.appendChild(card);
    }
  }

  // ── Tab 2: 工讀生 ──────────────────────────────────────────────────────────

  private buildWorkersTab(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'shop-section';

    for (const worker of WORKERS) {
      const card = this.buildWorkerCard(worker);
      container.appendChild(card);
    }

    return container;
  }

  private buildWorkerCard(worker: (typeof WORKERS)[number]): HTMLElement {
    const hiredWorkers: string[] = (gameState as Record<string, unknown>).hiredWorkers as string[] ?? [];
    const isHired = hiredWorkers.includes(worker.id);
    const canAfford = gameState.money >= worker.cost;

    const card = document.createElement('div');
    card.className = 'shop-item-card';
    if (isHired) card.classList.add('shop-item-card--purchased');

    // Top row: emoji + name + cost
    const infoEl = document.createElement('div');
    infoEl.className = 'shop-item-info';

    const emojiEl = document.createElement('span');
    emojiEl.className = 'shop-item-emoji';
    emojiEl.textContent = worker.emoji;

    const detailEl = document.createElement('div');
    detailEl.className = 'shop-item-detail';

    const nameEl = document.createElement('div');
    nameEl.className = 'shop-item-name';
    nameEl.textContent = worker.name;

    const costEl = document.createElement('div');
    costEl.className = 'shop-item-cost';
    costEl.textContent = `僱用費 $${worker.cost}`;

    const descEl = document.createElement('div');
    descEl.className = 'shop-item-desc';
    descEl.style.fontStyle = 'italic';
    descEl.style.fontSize = '0.85em';
    descEl.textContent = worker.description;

    const buffEl = document.createElement('div');
    buffEl.className = 'shop-item-buff';
    buffEl.style.color = 'var(--color-success, #4caf50)';
    buffEl.style.fontSize = '0.82em';
    buffEl.textContent = `✅ ${worker.buff}`;

    const debuffEl = document.createElement('div');
    debuffEl.className = 'shop-item-debuff';
    debuffEl.style.color = 'var(--color-warning, #ff9800)';
    debuffEl.style.fontSize = '0.82em';
    debuffEl.textContent = `⚠️ ${worker.debuff}`;

    const salaryEl = document.createElement('div');
    salaryEl.className = 'shop-item-salary';
    salaryEl.style.fontSize = '0.82em';
    salaryEl.style.color = 'var(--text-dim)';
    salaryEl.textContent = `日薪 $${worker.dailySalary}`;

    detailEl.appendChild(nameEl);
    detailEl.appendChild(costEl);
    detailEl.appendChild(descEl);
    detailEl.appendChild(buffEl);
    detailEl.appendChild(debuffEl);
    detailEl.appendChild(salaryEl);

    infoEl.appendChild(emojiEl);
    infoEl.appendChild(detailEl);

    // Right side: hire/fire buttons
    const rightEl = document.createElement('div');
    rightEl.className = 'shop-item-right';
    rightEl.style.display = 'flex';
    rightEl.style.flexDirection = 'column';
    rightEl.style.gap = '6px';
    rightEl.style.alignItems = 'flex-end';

    if (isHired) {
      const badge = document.createElement('div');
      badge.className = 'shop-item-hired-badge';
      badge.style.color = 'var(--color-success, #4caf50)';
      badge.style.fontSize = '0.85em';
      badge.style.marginBottom = '4px';
      badge.textContent = '已僱用 ✓';

      const fireBtn = document.createElement('button');
      fireBtn.className = 'btn-neon shop-item-btn';
      fireBtn.style.borderColor = 'var(--color-warning, #ff9800)';
      fireBtn.style.color = 'var(--color-warning, #ff9800)';
      fireBtn.textContent = '解僱';
      fireBtn.addEventListener('click', () => this.onFireWorker(worker));

      rightEl.appendChild(badge);
      rightEl.appendChild(fireBtn);
    } else {
      const hireBtn = document.createElement('button');

      if (!canAfford) {
        hireBtn.className = 'btn-neon shop-item-btn shop-item-btn--disabled';
        hireBtn.textContent = '餘額不足';
        hireBtn.disabled = true;
        hireBtn.style.opacity = '0.4';
        hireBtn.style.cursor = 'not-allowed';
        hireBtn.style.borderColor = 'var(--text-dim)';
        hireBtn.style.color = 'var(--text-dim)';
        hireBtn.style.textShadow = 'none';
        hireBtn.style.boxShadow = 'none';
      } else {
        hireBtn.className = 'btn-neon shop-item-btn';
        hireBtn.textContent = '僱用';
        hireBtn.addEventListener('click', () => this.onHireWorker(worker));
      }

      rightEl.appendChild(hireBtn);
    }

    card.appendChild(infoEl);
    card.appendChild(rightEl);

    return card;
  }

  private onHireWorker(worker: (typeof WORKERS)[number]): void {
    const success = spendMoney(worker.cost);
    if (!success) return;

    const hiredWorkers: string[] = [...((gameState as Record<string, unknown>).hiredWorkers as string[] ?? [])];
    hiredWorkers.push(worker.id);
    updateGameState({ hiredWorkers } as Parameters<typeof updateGameState>[0]);

    this.refreshMoneyDisplay();
    this.refreshWorkersTab();
  }

  private onFireWorker(worker: (typeof WORKERS)[number]): void {
    const hiredWorkers: string[] = ((gameState as Record<string, unknown>).hiredWorkers as string[] ?? []).filter(
      (id: string) => id !== worker.id,
    );
    updateGameState({ hiredWorkers } as Parameters<typeof updateGameState>[0]);

    this.refreshWorkersTab();
  }

  private refreshWorkersTab(): void {
    const content = this.tabContents.get('workers');
    if (!content) return;
    content.textContent = '';
    for (const worker of WORKERS) {
      const card = this.buildWorkerCard(worker);
      content.appendChild(card);
    }
  }

  // ── Tab 3: 行銷道具 ────────────────────────────────────────────────────────

  private buildMarketingTab(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'shop-section';

    for (const item of MARKETING_ITEMS) {
      const card = this.buildMarketingCard(item);
      container.appendChild(card);
    }

    return container;
  }

  private buildMarketingCard(item: (typeof MARKETING_ITEMS)[number]): HTMLElement {
    const marketingPurchases = (gameState as Record<string, unknown>).marketingPurchases as Record<string, number> ?? {};
    const canAfford = gameState.money >= item.cost;
    const purchaseCount = marketingPurchases[item.id] ?? 0;
    const refundAmount = Math.floor(item.cost * 0.7);

    const card = document.createElement('div');
    card.className = 'shop-item-card';

    // Info
    const infoEl = document.createElement('div');
    infoEl.className = 'shop-item-info';

    const emojiEl = document.createElement('span');
    emojiEl.className = 'shop-item-emoji';
    emojiEl.textContent = item.emoji;

    const detailEl = document.createElement('div');
    detailEl.className = 'shop-item-detail';

    const nameEl = document.createElement('div');
    nameEl.className = 'shop-item-name';
    nameEl.textContent = item.name;

    const descEl = document.createElement('div');
    descEl.className = 'shop-item-desc';
    descEl.textContent = item.description;

    const costEl = document.createElement('div');
    costEl.className = 'shop-item-cost';
    costEl.textContent = `$${item.cost}`;

    detailEl.appendChild(nameEl);
    detailEl.appendChild(descEl);
    detailEl.appendChild(costEl);

    infoEl.appendChild(emojiEl);
    infoEl.appendChild(detailEl);

    // Right side: count + buy + refund
    const rightEl = document.createElement('div');
    rightEl.className = 'shop-item-right';
    rightEl.style.display = 'flex';
    rightEl.style.flexDirection = 'column';
    rightEl.style.gap = '6px';
    rightEl.style.alignItems = 'flex-end';

    const countEl = document.createElement('div');
    countEl.className = 'shop-item-count';
    countEl.textContent = purchaseCount > 0 ? `×${purchaseCount}` : '';

    const buyBtn = document.createElement('button');
    buyBtn.textContent = '購買';

    if (!canAfford) {
      buyBtn.className = 'btn-neon shop-item-btn shop-item-btn--disabled';
      buyBtn.disabled = true;
      buyBtn.style.opacity = '0.4';
      buyBtn.style.cursor = 'not-allowed';
      buyBtn.style.borderColor = 'var(--text-dim)';
      buyBtn.style.color = 'var(--text-dim)';
      buyBtn.style.textShadow = 'none';
      buyBtn.style.boxShadow = 'none';
    } else {
      buyBtn.className = 'btn-neon shop-item-btn';
      buyBtn.addEventListener('click', () => this.onBuyMarketing(item));
    }

    const refundBtn = document.createElement('button');
    refundBtn.textContent = `退回 (退款 $${refundAmount})`;

    if (purchaseCount === 0) {
      refundBtn.className = 'btn-neon shop-item-btn shop-item-btn--disabled';
      refundBtn.disabled = true;
      refundBtn.style.opacity = '0.4';
      refundBtn.style.cursor = 'not-allowed';
      refundBtn.style.borderColor = 'var(--text-dim)';
      refundBtn.style.color = 'var(--text-dim)';
      refundBtn.style.textShadow = 'none';
      refundBtn.style.boxShadow = 'none';
    } else {
      refundBtn.className = 'btn-neon shop-item-btn';
      refundBtn.style.borderColor = 'var(--color-warning, #ff9800)';
      refundBtn.style.color = 'var(--color-warning, #ff9800)';
      refundBtn.addEventListener('click', () => this.onRefundMarketing(item));
    }

    rightEl.appendChild(countEl);
    rightEl.appendChild(buyBtn);
    rightEl.appendChild(refundBtn);

    card.appendChild(infoEl);
    card.appendChild(rightEl);

    return card;
  }

  private onBuyMarketing(item: (typeof MARKETING_ITEMS)[number]): void {
    const success = spendMoney(item.cost);
    if (!success) return;

    const purchases = { ...((gameState as Record<string, unknown>).marketingPurchases as Record<string, number> ?? {}) };
    purchases[item.id] = (purchases[item.id] ?? 0) + 1;
    updateGameState({ marketingPurchases: purchases } as Parameters<typeof updateGameState>[0]);

    this.refreshMoneyDisplay();
    this.refreshMarketingTab();
  }

  private onRefundMarketing(item: (typeof MARKETING_ITEMS)[number]): void {
    const success = refundMarketing(item.id, item.cost);
    if (!success) return;

    this.refreshMoneyDisplay();
    this.refreshMarketingTab();
  }

  private refreshMarketingTab(): void {
    const content = this.tabContents.get('marketing');
    if (!content) return;
    content.textContent = '';
    for (const item of MARKETING_ITEMS) {
      const card = this.buildMarketingCard(item);
      content.appendChild(card);
    }
  }

  // ── Tab 4: 資金周轉 ────────────────────────────────────────────────────────

  private buildLoansTab(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'shop-section';

    // Active loan summary (if any)
    if (gameState.loans.active) {
      const activeLoanBox = this.buildActiveLoanBox();
      container.appendChild(activeLoanBox);
    }

    // Bank section
    const bankSection = this.buildBankSection();
    container.appendChild(bankSection);

    // Shark section
    const sharkSection = this.buildSharkSection();
    container.appendChild(sharkSection);

    return container;
  }

  private buildActiveLoanBox(): HTMLElement {
    const loan = gameState.loans.active!;
    const box = document.createElement('div');
    box.className = 'loan-active-box';

    const titleEl = document.createElement('div');
    titleEl.className = 'loan-section-title';
    titleEl.textContent = '目前借款';

    const lenderLabel = loan.lender === 'bank' ? '銀行' : '地下錢莊';

    const rows: [string, string][] = [
      ['借款來源', lenderLabel],
      ['本金', `$${loan.principal}`],
      ['應還金額', `$${loan.totalOwed}`],
      ['借款日', `第 ${loan.dayTaken} 天`],
      ['到期日', `第 ${loan.dueDay} 天`],
    ];

    if (loan.overdueDays > 0) {
      rows.push(['逾期天數', `${loan.overdueDays} 天`]);
    }

    const infoEl = document.createElement('div');
    infoEl.className = 'loan-info-rows';
    for (const [label, value] of rows) {
      const row = document.createElement('div');
      row.className = 'loan-info-row';

      const labelEl = document.createElement('span');
      labelEl.className = 'loan-info-label';
      labelEl.textContent = label;

      const valueEl = document.createElement('span');
      valueEl.className = loan.overdueDays > 0 && label === '逾期天數'
        ? 'loan-info-value loan-overdue'
        : 'loan-info-value';
      valueEl.textContent = value;

      row.appendChild(labelEl);
      row.appendChild(valueEl);
      infoEl.appendChild(row);
    }

    // Repay button
    const canRepay = gameState.money >= loan.totalOwed;
    const repayBtn = document.createElement('button');
    repayBtn.textContent = canRepay ? `還清借款 ($${loan.totalOwed})` : `餘額不足以還款 (需 $${loan.totalOwed})`;
    repayBtn.className = canRepay ? 'btn-neon loan-repay-btn' : 'btn-neon loan-repay-btn loan-repay-btn--disabled';
    repayBtn.disabled = !canRepay;
    if (!canRepay) {
      repayBtn.style.opacity = '0.4';
      repayBtn.style.cursor = 'not-allowed';
      repayBtn.style.borderColor = 'var(--text-dim)';
      repayBtn.style.color = 'var(--text-dim)';
      repayBtn.style.textShadow = 'none';
      repayBtn.style.boxShadow = 'none';
    }

    repayBtn.addEventListener('click', () => {
      const success = repayLoan();
      if (success) {
        this.refreshLoansTab();
        this.refreshMoneyDisplay();
      }
    });

    box.appendChild(titleEl);
    box.appendChild(infoEl);
    box.appendChild(repayBtn);

    return box;
  }

  private buildBankSection(): HTMLElement {
    const bankConfig = LOAN_CONFIGS.bank;
    const section = document.createElement('div');
    section.className = 'loan-lender-section';

    const titleEl = document.createElement('div');
    titleEl.className = 'loan-section-title';
    titleEl.textContent = '銀行貸款';

    const termsEl = document.createElement('div');
    termsEl.className = 'loan-terms';
    termsEl.textContent = `年利率約 6%（每日 ${(bankConfig.dailyRate * 100).toFixed(3)}%）｜最高 $${bankConfig.maxAmount}｜還款期 ${bankConfig.termDays} 天`;

    const repReqEl = document.createElement('div');
    repReqEl.className = 'loan-rep-req';
    repReqEl.textContent = `需要聲望：${bankConfig.requiresReputation}（目前：${gameState.reputation}）`;

    section.appendChild(titleEl);
    section.appendChild(termsEl);
    section.appendChild(repReqEl);

    if (gameState.loans.bankBlacklisted) {
      const blacklistEl = document.createElement('div');
      blacklistEl.className = 'loan-blacklist-warning';
      blacklistEl.textContent = '已列入黑名單 — 銀行永久拒絕往來';
      section.appendChild(blacklistEl);
      return section;
    }

    if (gameState.loans.active) {
      const busyEl = document.createElement('div');
      busyEl.className = 'loan-busy-note';
      busyEl.textContent = '還清目前借款後才能再次借貸';
      section.appendChild(busyEl);
      return section;
    }

    const { canBorrow: eligible, reason } = canBorrow('bank');

    if (!eligible) {
      const reasonEl = document.createElement('div');
      reasonEl.className = 'loan-ineligible';
      reasonEl.textContent = reason ?? '信用不足，無法借款';
      section.appendChild(reasonEl);
      return section;
    }

    // Borrow slider
    const sliderArea = this.buildLoanSlider('bank', bankConfig.maxAmount, (amount) => {
      if (this.bankSliderDisplay) {
        this.bankSliderDisplay.textContent = `借 $${amount}，到期應還 $${amount}（+ 每日利息）`;
      }
    });
    section.appendChild(sliderArea);

    // Borrow button
    const borrowBtn = document.createElement('button');
    borrowBtn.className = 'btn-neon loan-borrow-btn';
    borrowBtn.textContent = '向銀行借款';
    borrowBtn.addEventListener('click', () => {
      const amount = this.bankSlider ? Number(this.bankSlider.value) : 0;
      if (amount <= 0) return;
      const success = takeLoan('bank', amount);
      if (success) {
        this.refreshLoansTab();
        this.refreshMoneyDisplay();
      }
    });
    section.appendChild(borrowBtn);

    return section;
  }

  private buildSharkSection(): HTMLElement {
    const sharkConfig = LOAN_CONFIGS.shark;
    const section = document.createElement('div');
    section.className = 'loan-lender-section loan-lender-section--shark';

    const titleEl = document.createElement('div');
    titleEl.className = 'loan-section-title loan-section-title--shark';
    titleEl.textContent = '地下錢莊（九出十三歸）';

    const termsEl = document.createElement('div');
    termsEl.className = 'loan-terms';
    termsEl.textContent = `借 $1000 → 實拿 $900（扣一成）→ 到期還 $1300（還三成）｜最高 $${sharkConfig.maxAmount}｜還款期 ${sharkConfig.termDays} 天`;

    section.appendChild(titleEl);
    section.appendChild(termsEl);

    // Warning tiers
    const warningsEl = document.createElement('div');
    warningsEl.className = 'loan-shark-warnings';

    const warnings: [string, string][] = [
      ['第 1–3 天逾期', '+5%/天複利，電話催款不斷'],
      ['第 4–7 天逾期', '打手登門，攤位被砸，停業一天'],
      ['第 8–14 天逾期', '搶走一半庫存，奪走一塊地盤'],
      ['第 15 天起', '遊戲結束——你消失在夜市裡'],
    ];

    for (const [stage, desc] of warnings) {
      const row = document.createElement('div');
      row.className = 'loan-warning-row';

      const stageEl = document.createElement('span');
      stageEl.className = 'loan-warning-stage';
      stageEl.textContent = stage;

      const descEl = document.createElement('span');
      descEl.className = 'loan-warning-desc';
      descEl.textContent = desc;

      row.appendChild(stageEl);
      row.appendChild(descEl);
      warningsEl.appendChild(row);
    }

    section.appendChild(warningsEl);

    if (gameState.loans.active) {
      const busyEl = document.createElement('div');
      busyEl.className = 'loan-busy-note';
      busyEl.textContent = '還清目前借款後才能再次借貸';
      section.appendChild(busyEl);
      return section;
    }

    // Borrow slider
    const sliderArea = this.buildLoanSlider('shark', sharkConfig.maxAmount, (amount) => {
      const received = Math.floor(amount * (1 - sharkConfig.upfrontFeeRate));
      const totalOwed = Math.ceil(amount * sharkConfig.repayMultiplier);
      if (this.sharkSliderDisplay) {
        this.sharkSliderDisplay.textContent = `借 $${amount}，實拿 $${received}，到期還 $${totalOwed}`;
      }
    });
    section.appendChild(sliderArea);

    // Borrow button
    const borrowBtn = document.createElement('button');
    borrowBtn.className = 'btn-neon loan-borrow-btn loan-borrow-btn--shark';
    borrowBtn.textContent = '向地下錢莊借款';
    borrowBtn.addEventListener('click', () => {
      const amount = this.sharkSlider ? Number(this.sharkSlider.value) : 0;
      if (amount <= 0) return;
      const success = takeLoan('shark', amount);
      if (success) {
        this.refreshLoansTab();
        this.refreshMoneyDisplay();
      }
    });
    section.appendChild(borrowBtn);

    return section;
  }

  private buildLoanSlider(
    lender: 'bank' | 'shark',
    maxAmount: number,
    onInput: (amount: number) => void,
  ): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'loan-slider-wrapper';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'price-slider loan-slider';
    slider.min = '100';
    slider.max = String(maxAmount);
    slider.step = '100';
    slider.value = '500';

    const displayEl = document.createElement('div');
    displayEl.className = 'loan-slider-display';

    if (lender === 'bank') {
      this.bankSlider = slider;
      this.bankSliderDisplay = displayEl;
      displayEl.textContent = `借 $500，到期應還 $500（+ 每日利息）`;
    } else {
      const sharkConfig = LOAN_CONFIGS.shark;
      this.sharkSlider = slider;
      this.sharkSliderDisplay = displayEl;
      const received = Math.floor(500 * (1 - sharkConfig.upfrontFeeRate));
      const totalOwed = Math.ceil(500 * sharkConfig.repayMultiplier);
      displayEl.textContent = `借 $500，實拿 $${received}，到期還 $${totalOwed}`;
    }

    slider.addEventListener('input', () => {
      onInput(Number(slider.value));
    });

    wrapper.appendChild(slider);
    wrapper.appendChild(displayEl);

    return wrapper;
  }

  private refreshLoansTab(): void {
    const content = this.tabContents.get('loans');
    if (!content) return;
    content.textContent = '';

    if (gameState.loans.active) {
      content.appendChild(this.buildActiveLoanBox());
    }

    content.appendChild(this.buildBankSection());
    content.appendChild(this.buildSharkSection());
  }

  // ── Bottom bar ─────────────────────────────────────────────────────────────

  private moneyDisplay: HTMLElement | null = null;

  private buildBottomBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'shop-bottom-bar';

    const moneyEl = document.createElement('div');
    moneyEl.className = 'shop-money-display';
    moneyEl.textContent = `資金：$${gameState.money}`;
    this.moneyDisplay = moneyEl;

    const skipBtn = document.createElement('button');
    skipBtn.className = 'btn-neon';
    skipBtn.textContent = '跳過，直接開始下一天';
    skipBtn.addEventListener('click', () => {
      EventBus.emit('shop-done', {});
    });

    // Black market button (only if unlocked)
    if (gameState.blackMarketUnlocked) {
      const bmBtn = document.createElement('button');
      bmBtn.className = 'btn-neon';
      bmBtn.style.background = 'rgba(139, 0, 0, 0.3)';
      bmBtn.style.borderColor = '#8b0000';
      bmBtn.textContent = '💀 進入黑市';
      bmBtn.addEventListener('click', () => {
        EventBus.emit('show-panel', 'black-market');
        // Listen for return from black market
        EventBus.once('black-market-done', () => {
          EventBus.emit('show-panel', 'shop');
        });
      });
      bar.appendChild(bmBtn);
    }

    bar.appendChild(moneyEl);
    bar.appendChild(skipBtn);

    return bar;
  }

  private refreshMoneyDisplay(): void {
    if (this.moneyDisplay) {
      this.moneyDisplay.textContent = `資金：$${gameState.money}`;
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  getElement(): HTMLElement {
    return this.panel;
  }

  destroy(): void {
    // No persistent event listeners to remove (all are inline click handlers)
  }
}

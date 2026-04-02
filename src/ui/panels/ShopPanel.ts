// ShopPanel — 收攤後商店 HTML panel (pure DOM, no Phaser dependency)
import { EventBus } from '../../utils/EventBus';
import { gameState, spendMoney, updateGameState, changeReputation } from '../../state/GameState';
import { CART_UPGRADES, MARKETING_ITEMS } from '../../data/upgrades';
import { WORKERS } from '../../data/workers';
import { LOAN_CONFIGS } from '../../data/loans';
import { canBorrow, takeLoan, repayLoan } from '../../systems/LoanEngine';
import { refundMarketing } from '../../systems/EconomyEngine';
import { joinHui, getHuiSummary, playerBid, skipBid, runAwayFromHui } from '../../systems/HuiEngine';
import {
  isLoanSharkUnlocked,
  getRandomBorrower,
  lendMoney,
  getPlayerLoansSummary,
  seizeBorrowerStall,
  forgiveLoan,
  sendDogToCollect,
} from '../../systems/LoanSharkEngine';
import type { PlayerLoan } from '../../systems/LoanSharkEngine';

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

  // Loan shark (player as lender) state
  private pendingBorrower: { name: string; emoji: string; reliability: number; requestAmount: number } | null = null;
  private loanSharkRateSlider: HTMLInputElement | null = null;

  // Bottom bar skip button reference (for dynamic text update)
  private skipBtn: HTMLButtonElement | null = null;
  // Whether any purchase (worker or marketing) was made this session
  private hasPurchasedThisSession = false;

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
    const isHired = gameState.hiredWorkers.includes(worker.id);
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

  private getWorkerFeedback(workerId: string): string {
    const feedbackMap: Record<string, string> = {
      adi: '👦 阿迪仔上班了！烤架 +1 格，但他會滑手機...',
      mei: '💅 學生妹來了！她會自動幫你出餐',
      wangcai: '🐕 旺財趴在攤位旁邊了！奧客小心',
      dad: '👴 老爸放下遙控器來幫忙了！保溫箱衰退減半',
    };
    return feedbackMap[workerId] ?? '員工上班了！';
  }

  private onHireWorker(worker: (typeof WORKERS)[number]): void {
    const success = spendMoney(worker.cost);
    if (!success) return;

    const hiredWorkers = [...gameState.hiredWorkers, worker.id];
    updateGameState({ hiredWorkers });

    this.hasPurchasedThisSession = true;
    this.refreshSkipBtnText();
    this.refreshMoneyDisplay();
    this.refreshWorkersTab();

    alert(this.getWorkerFeedback(worker.id));
  }

  private onFireWorker(worker: (typeof WORKERS)[number]): void {
    const hiredWorkers = gameState.hiredWorkers.filter((id) => id !== worker.id);
    updateGameState({ hiredWorkers });

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
    const canAfford = gameState.money >= item.cost;
    const purchaseCount = gameState.marketingPurchases[item.id] ?? 0;
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

    if (purchaseCount > 0) {
      buyBtn.textContent = canAfford ? `購買（已買 ×${purchaseCount}）` : `餘額不足（已買 ×${purchaseCount}）`;
    } else {
      buyBtn.textContent = canAfford ? '購買' : '餘額不足';
    }

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

  private applyMarketingEffect(item: (typeof MARKETING_ITEMS)[number]): void {
    switch (item.id) {
      case 'flyer':
        updateGameState({ dailyTrafficBonus: gameState.dailyTrafficBonus + 0.1 });
        break;
      case 'free-sample':
        changeReputation(5);
        break;
      // 'discount-sign' and 'sausagebox' effects are tracked in marketingPurchases
      // and applied by CustomerEngine / SausageBoxPanel respectively
      default:
        break;
    }
  }

  private onBuyMarketing(item: (typeof MARKETING_ITEMS)[number]): void {
    const success = spendMoney(item.cost);
    if (!success) return;

    const purchases = { ...gameState.marketingPurchases };
    purchases[item.id] = (purchases[item.id] ?? 0) + 1;
    updateGameState({ marketingPurchases: purchases });

    this.applyMarketingEffect(item);

    this.hasPurchasedThisSession = true;
    this.refreshSkipBtnText();
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

    // Section A: 互助會
    container.appendChild(this.buildHuiSection());

    // Section B: 地下賭場
    container.appendChild(this.buildCasinoSection());

    // Section C: 放高利貸
    // Sample a borrower once per tab build (stable within session)
    if (!this.pendingBorrower) {
      this.pendingBorrower = getRandomBorrower();
    }
    container.appendChild(this.buildLoanSharkSection());

    // Divider
    const divider = document.createElement('hr');
    divider.style.cssText = 'border: none; border-top: 1px solid #333; margin: 16px 0;';
    container.appendChild(divider);

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

  // ── Section A: 互助會 ──────────────────────────────────────────────────────

  private buildHuiSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'loan-lender-section';
    section.style.marginBottom = '12px';

    const titleEl = document.createElement('div');
    titleEl.className = 'loan-section-title';
    titleEl.textContent = '📜 互助會（標會）';
    section.appendChild(titleEl);

    const hui = gameState.hui;

    if (!hui.isActive) {
      const descEl = document.createElement('div');
      descEl.className = 'loan-terms';
      descEl.textContent = '加入夜市攤販互助會，每天繳 $100，每 5 天開標一次拿回 $2500';
      section.appendChild(descEl);

      const joinBtn = document.createElement('button');
      joinBtn.className = 'btn-neon loan-borrow-btn';
      joinBtn.textContent = '加入互助會';
      joinBtn.addEventListener('click', () => {
        joinHui();
        this.refreshLoansTab();
      });
      section.appendChild(joinBtn);
    } else {
      // Show status
      const statusEl = document.createElement('div');
      statusEl.className = 'loan-terms';
      statusEl.textContent = getHuiSummary();
      section.appendChild(statusEl);

      // If today is a bidding day (day % 5 === 0 and day > 0)
      const isBiddingDay = hui.day > 0 && hui.day % 5 === 0 && !hui.playerHasCollected;

      if (isBiddingDay) {
        const bidLabel = document.createElement('div');
        bidLabel.className = 'loan-terms';
        bidLabel.style.color = '#ffcc00';
        bidLabel.textContent = '今天是開標日！輸入你的利息出價：';
        section.appendChild(bidLabel);

        const bidWrapper = document.createElement('div');
        bidWrapper.className = 'loan-slider-wrapper';

        const bidInput = document.createElement('input');
        bidInput.type = 'number';
        bidInput.min = '0';
        bidInput.max = String(hui.pot);
        bidInput.value = '0';
        bidInput.className = 'price-slider loan-slider';
        bidInput.style.width = '120px';

        bidWrapper.appendChild(bidInput);
        section.appendChild(bidWrapper);

        const bidRow = document.createElement('div');
        bidRow.style.display = 'flex';
        bidRow.style.gap = '8px';
        bidRow.style.marginTop = '6px';

        const bidBtn = document.createElement('button');
        bidBtn.className = 'btn-neon loan-borrow-btn';
        bidBtn.textContent = '出價';
        bidBtn.addEventListener('click', () => {
          const result = playerBid(Number(bidInput.value));
          alert(result.message);
          this.refreshLoansTab();
        });

        const skipBtn = document.createElement('button');
        skipBtn.className = 'btn-neon';
        skipBtn.textContent = '跳過這輪';
        skipBtn.style.marginLeft = '6px';
        skipBtn.addEventListener('click', () => {
          const msg = skipBid();
          alert(msg);
          this.refreshLoansTab();
        });

        bidRow.appendChild(bidBtn);
        bidRow.appendChild(skipBtn);
        section.appendChild(bidRow);
      }

      // Run away button (always visible when active)
      const runBtn = document.createElement('button');
      runBtn.className = 'btn-neon loan-borrow-btn--shark';
      runBtn.style.cssText = 'margin-top:10px; background:rgba(139,0,0,0.3); border-color:#8b0000; color:#ff4444;';
      runBtn.textContent = '跑路！捲款潛逃';
      runBtn.addEventListener('click', () => {
        const confirm = window.confirm('確定要捲款跑路嗎？這會嚴重損害你的聲望！');
        if (confirm) {
          const msg = runAwayFromHui();
          alert(msg);
          this.refreshLoansTab();
        }
      });
      section.appendChild(runBtn);
    }

    return section;
  }

  // ── Section B: 地下賭場 ───────────────────────────────────────────────────

  private buildCasinoSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'loan-lender-section';
    section.style.marginBottom = '12px';

    const titleEl = document.createElement('div');
    titleEl.className = 'loan-section-title';
    titleEl.textContent = '🎰 地下賭場';
    section.appendChild(titleEl);

    const isUnlocked = gameState.day >= 3;

    if (!isUnlocked) {
      const lockEl = document.createElement('div');
      lockEl.className = 'loan-ineligible';
      lockEl.style.opacity = '0.5';
      lockEl.textContent = '🔒 第 3 天後解鎖';
      section.appendChild(lockEl);
    } else {
      const descEl = document.createElement('div');
      descEl.className = 'loan-terms';
      descEl.textContent = '暗巷裡的老地方，贏了是運氣輸了是人生';
      section.appendChild(descEl);

      const enterBtn = document.createElement('button');
      enterBtn.className = 'btn-neon loan-borrow-btn';
      enterBtn.textContent = '進入賭場';
      enterBtn.addEventListener('click', () => {
        EventBus.emit('show-panel', 'casino');
        EventBus.once('casino-done', () => {
          EventBus.emit('show-panel', 'shop');
        });
      });
      section.appendChild(enterBtn);
    }

    return section;
  }

  // ── Section C: 放高利貸 ───────────────────────────────────────────────────

  private buildLoanSharkSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'loan-lender-section';
    section.style.marginBottom = '12px';

    const titleEl = document.createElement('div');
    titleEl.className = 'loan-section-title';
    titleEl.textContent = '💰 放高利貸';
    section.appendChild(titleEl);

    if (!isLoanSharkUnlocked()) {
      const lockEl = document.createElement('div');
      lockEl.className = 'loan-ineligible';
      lockEl.style.opacity = '0.5';
      lockEl.textContent = `🔒 地下聲望不足（需要 60，目前 ${gameState.undergroundRep}）`;
      section.appendChild(lockEl);
      return section;
    }

    // Pending borrower request
    if (this.pendingBorrower) {
      const b = this.pendingBorrower;
      const requestEl = document.createElement('div');
      requestEl.className = 'loan-terms';
      requestEl.style.color = '#ffcc00';
      requestEl.textContent = `${b.emoji} ${b.name} 想借 $${b.requestAmount}`;
      section.appendChild(requestEl);

      // Interest rate slider
      const rateWrapper = document.createElement('div');
      rateWrapper.className = 'loan-slider-wrapper';

      const rateLabel = document.createElement('div');
      rateLabel.className = 'loan-terms';
      rateLabel.style.marginBottom = '4px';
      rateLabel.textContent = '設定利率：';

      const rateSlider = document.createElement('input');
      rateSlider.type = 'range';
      rateSlider.className = 'price-slider loan-slider';
      rateSlider.min = '10';
      rateSlider.max = '100';
      rateSlider.step = '5';
      rateSlider.value = '30';
      this.loanSharkRateSlider = rateSlider;

      const rateDisplay = document.createElement('div');
      rateDisplay.className = 'loan-slider-display';
      rateDisplay.textContent = `利率 30%，到期應收 $${Math.round(b.requestAmount * 1.3)}`;

      rateSlider.addEventListener('input', () => {
        const rate = Number(rateSlider.value) / 100;
        const totalOwed = Math.round(b.requestAmount * (1 + rate));
        rateDisplay.textContent = `利率 ${rateSlider.value}%，到期應收 $${totalOwed}`;
      });

      rateWrapper.appendChild(rateLabel);
      rateWrapper.appendChild(rateSlider);
      rateWrapper.appendChild(rateDisplay);
      section.appendChild(rateWrapper);

      const lendBtn = document.createElement('button');
      lendBtn.className = 'btn-neon loan-borrow-btn';
      lendBtn.textContent = `借給他 $${b.requestAmount}`;
      lendBtn.addEventListener('click', () => {
        const rate = this.loanSharkRateSlider ? Number(this.loanSharkRateSlider.value) / 100 : 0.3;
        const loan = lendMoney(b.name, b.emoji, b.requestAmount, rate, b.reliability);
        if (!loan) {
          alert('你的錢不夠！');
          return;
        }
        this.pendingBorrower = null;
        alert(`已借出 $${b.requestAmount} 給 ${b.emoji}${b.name}，5 天後收回 $${loan.totalOwed}`);
        this.refreshLoansTab();
        this.refreshMoneyDisplay();
      });

      const refuseBtn = document.createElement('button');
      refuseBtn.className = 'btn-neon';
      refuseBtn.style.marginLeft = '8px';
      refuseBtn.textContent = '拒絕';
      refuseBtn.addEventListener('click', () => {
        this.pendingBorrower = null;
        this.refreshLoansTab();
      });

      const btnRow = document.createElement('div');
      btnRow.style.display = 'flex';
      btnRow.style.gap = '8px';
      btnRow.style.marginTop = '6px';
      btnRow.appendChild(lendBtn);
      btnRow.appendChild(refuseBtn);
      section.appendChild(btnRow);
    } else {
      const noOneEl = document.createElement('div');
      noOneEl.className = 'loan-terms';
      noOneEl.style.opacity = '0.7';
      noOneEl.textContent = '今天沒有人來借錢。';
      section.appendChild(noOneEl);
    }

    // Active / defaulted loans list
    const activeLoansList = getPlayerLoansSummary();
    if (activeLoansList.length > 0) {
      const listTitle = document.createElement('div');
      listTitle.className = 'loan-terms';
      listTitle.style.cssText = 'margin-top:10px; font-weight:bold;';
      listTitle.textContent = '目前放款紀錄：';
      section.appendChild(listTitle);

      for (const loan of activeLoansList) {
        section.appendChild(this.buildPlayerLoanRow(loan));
      }
    }

    return section;
  }

  private buildPlayerLoanRow(loan: PlayerLoan): HTMLElement {
    const row = document.createElement('div');
    row.className = 'loan-active-box';
    row.style.marginTop = '6px';

    const infoEl = document.createElement('div');
    infoEl.className = 'loan-terms';
    infoEl.textContent =
      `${loan.borrowerEmoji} ${loan.borrowerName}｜借 $${loan.principal}｜到期應收 $${loan.totalOwed}｜第 ${loan.dueDay} 天到期`;

    const statusEl = document.createElement('div');
    statusEl.style.fontSize = '0.85em';
    statusEl.style.marginTop = '2px';

    if (loan.status === 'active') {
      statusEl.style.color = '#4caf50';
      statusEl.textContent = '狀態：等待還款中';
    } else {
      statusEl.style.color = '#ff4444';
      statusEl.textContent = '狀態：賴帳！';
    }

    row.appendChild(infoEl);
    row.appendChild(statusEl);

    // Action buttons for defaulted loans
    if (loan.status === 'defaulted') {
      const btnRow = document.createElement('div');
      btnRow.style.display = 'flex';
      btnRow.style.gap = '6px';
      btnRow.style.marginTop = '6px';
      btnRow.style.flexWrap = 'wrap';

      const dogBtn = document.createElement('button');
      dogBtn.className = 'btn-neon';
      dogBtn.style.fontSize = '0.8em';
      dogBtn.textContent = '🐕 派旺財討債';
      dogBtn.addEventListener('click', () => {
        const msg = sendDogToCollect(loan.id);
        alert(msg);
        this.refreshLoansTab();
        this.refreshMoneyDisplay();
      });

      const seizeBtn = document.createElement('button');
      seizeBtn.className = 'btn-neon';
      seizeBtn.style.cssText = 'font-size:0.8em; border-color:#ff9800; color:#ff9800;';
      seizeBtn.textContent = '🏪 收攤位';
      seizeBtn.addEventListener('click', () => {
        const msg = seizeBorrowerStall(loan.id);
        alert(msg);
        this.refreshLoansTab();
      });

      const forgiveBtn = document.createElement('button');
      forgiveBtn.className = 'btn-neon';
      forgiveBtn.style.cssText = 'font-size:0.8em; border-color:#aaa; color:#aaa;';
      forgiveBtn.textContent = '算了放過他';
      forgiveBtn.addEventListener('click', () => {
        const msg = forgiveLoan(loan.id);
        alert(msg);
        this.refreshLoansTab();
      });

      btnRow.appendChild(dogBtn);
      btnRow.appendChild(seizeBtn);
      btnRow.appendChild(forgiveBtn);
      row.appendChild(btnRow);
    }

    return row;
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

    // Section A: 互助會
    content.appendChild(this.buildHuiSection());

    // Section B: 地下賭場
    content.appendChild(this.buildCasinoSection());

    // Section C: 放高利貸
    content.appendChild(this.buildLoanSharkSection());

    // Divider
    const divider = document.createElement('hr');
    divider.style.cssText = 'border: none; border-top: 1px solid #333; margin: 16px 0;';
    content.appendChild(divider);

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

    const skipBtn = document.createElement('button') as HTMLButtonElement;
    skipBtn.className = 'btn-neon';
    skipBtn.textContent = '跳過，直接開始下一天';
    skipBtn.addEventListener('click', () => {
      EventBus.emit('shop-done', {});
    });
    this.skipBtn = skipBtn;

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

  private refreshSkipBtnText(): void {
    if (!this.skipBtn) return;
    this.skipBtn.textContent = this.hasPurchasedThisSession
      ? '確認購買，繼續下一天'
      : '跳過，直接開始下一天';
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  getElement(): HTMLElement {
    return this.panel;
  }

  destroy(): void {
    // No persistent event listeners to remove (all are inline click handlers)
  }
}

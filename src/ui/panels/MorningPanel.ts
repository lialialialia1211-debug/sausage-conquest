// MorningPanel — 早上進貨備料 HTML panel (pure DOM, no Phaser)
// Layout:
//   左欄：「策略」section 標題 + 3 個策略按鈕 (偵查 / 練烤功 / 拜碼頭)
//   右欄：上方香腸圖鑑（5 格）+ 中央展示區（選中香腸的詳細）+ 下方總成本與烤起來
import { EventBus } from '../../utils/EventBus';
import { gameState, updateGameState } from '../../state/GameState';
import { buyStock } from '../../systems/EconomyEngine';
import { SAUSAGE_TYPES } from '../../data/sausages';
import { GRID_SLOTS } from '../../data/map';
import type { SausageType } from '../../types';

const MIN_RENT_RESERVE_FLOOR = 200;
const UI_PATH = 'ui/';

function uiFrameStyle(image: string, extra = ''): string {
  return [
    `background-image:linear-gradient(rgba(6,4,4,0.72),rgba(6,4,4,0.72)),url("${UI_PATH}${image}")`,
    'background-size:100% 100%',
    'background-repeat:no-repeat',
    'background-position:center',
    extra,
  ].filter(Boolean).join(';');
}

function uiAssetBackground(image: string, extra = ''): string {
  return [
    `background-image:url("${UI_PATH}${image}")`,
    'background-size:contain',
    'background-repeat:no-repeat',
    'background-position:center',
    extra,
  ].filter(Boolean).join(';');
}

export interface SpoilageInfo {
  spoilage: Record<string, number>;
}

// 「策略」是 section 標題，下方 3 個選項才是可點按鈕
const PREP_OPTIONS = [
  { id: 'scout',    label: '偵查',  desc: '偵測對手攤位\n下回合戰鬥優勢' },
  { id: 'practice', label: '練烤功', desc: '判定窗口寬 +10%\n節奏遊戲容錯升級' },
  { id: 'social',   label: '拜碼頭', desc: '奧客事件機率 -50%\n中段更順暢' },
] as const;

// 在烤香腸關聯說明：每根香腸的「節奏特性」
const SAUSAGE_RHYTHM_TRAITS: Record<string, string> = {
  'flying-fish-roe': '節奏特性：飛魚卵腸命中時火花四射，PERFECT 加分 +5%',
  'cheese':          '節奏特性：起司腸命中音符飛行較慢，較好抓拍',
  'big-taste':       '節奏特性：大嚐莖判定窗口較寬，新手友善',
  'big-wrap-small':  '節奏特性：雙層音符，命中需要較精準的時機',
  'great-wall':      '節奏特性：稀有金音符，命中後全場連擊保護一次',
};

export class MorningPanel {
  private panel: HTMLElement;
  private quantities: Record<string, number> = {};
  private totalCostEl!: HTMLElement;
  private rentWarning!: HTMLElement;
  private confirmBtn!: HTMLButtonElement;
  private qtyDisplays: Map<string, HTMLElement> = new Map();
  private subtotalEls: Map<string, HTMLElement> = new Map();
  private selectedPrep: string = '';
  private prepBtns: Map<string, HTMLElement> = new Map();
  private selectedSausageId: string = '';
  private sausageCells: Map<string, HTMLElement> = new Map();
  private detailEl!: HTMLElement;

  constructor(spoilageInfo?: SpoilageInfo) {
    for (const s of SAUSAGE_TYPES) {
      this.quantities[s.id] = 0;
    }

    this.panel = document.createElement('div');
    this.panel.className = 'game-panel ui-interactive morning-panel';
    this.panel.style.cssText = [
      'display:grid;',
      'grid-template-columns:300px minmax(0,1fr);',
      'grid-template-rows:auto 1fr;',
      'gap:0;',
      'height:100%;',
      'max-height:100%;',
      'overflow:hidden;',
      'box-sizing:border-box;',
      'padding:0;',
    ].join('');

    // ── 頂部標題列（跨兩欄）──────────────────────────────────────
    const headerRow = document.createElement('div');
    headerRow.className = 'morning-header';
    headerRow.style.cssText = [
      'grid-column:1/3;',
      'background:linear-gradient(90deg,rgba(26,12,0,0.88),rgba(10,10,18,0.92) 45%,rgba(20,8,0,0.86));',
      'border-bottom:1px solid rgba(255,198,0,0.35);',
      'padding:12px 18px;',
      'display:flex;align-items:center;justify-content:space-between;',
      'box-shadow:inset 0 -1px 0 rgba(255,255,255,0.08);',
    ].join('');

    const titleEl = document.createElement('div');
    titleEl.className = 'panel-title neon-flicker';
    titleEl.style.margin = '0';
    titleEl.textContent = '早上 — 進貨備料';
    headerRow.appendChild(titleEl);

    const suggestEl = document.createElement('div');
    suggestEl.style.cssText = 'font-size:13px;color:#e8d9a5;text-shadow:0 0 8px rgba(255,198,0,0.28);';
    if (gameState.day === 1) {
      suggestEl.textContent = '新手建議：先買 15~20 根試試水溫';
    } else {
      const lastSlot = gameState.selectedSlot;
      const slotInfo = lastSlot >= 0 ? GRID_SLOTS.find(s => s.id === lastSlot) : null;
      const traffic = slotInfo ? slotInfo.baseTraffic : 40;
      const suggestMin = Math.round(traffic * 0.6);
      const suggestMax = Math.round(traffic * 0.9);
      suggestEl.textContent = `建議今日進貨：${suggestMin}~${suggestMax} 根`;
    }
    headerRow.appendChild(suggestEl);
    this.panel.appendChild(headerRow);

    // ── 左欄：「策略」section 標題 + 3 個策略選項 ──────────────────
    const leftCol = document.createElement('div');
    leftCol.className = 'morning-left';
    leftCol.style.cssText = [
      'background:linear-gradient(180deg,#120906,#080811);',
      'border-right:1px solid rgba(255,107,0,0.28);',
      'display:flex;flex-direction:column;',
      'gap:12px;',
      'padding:16px 14px;',
      'overflow-y:hidden;',
    ].join('');

    // Section 標題（不可點）
    const sectionTitle = document.createElement('div');
    sectionTitle.style.cssText = [
      'font-size:18px;font-weight:bold;',
      'font-family:Microsoft JhengHei, PingFang TC, sans-serif;',
      'color:#ff6b00;',
      'letter-spacing:4px;',
      'padding:6px 6px 10px;',
      'border-bottom:2px solid #ff6b00;',
      'margin-bottom:6px;',
      'text-align:center;',
    ].join('');
    sectionTitle.textContent = '策略';
    leftCol.appendChild(sectionTitle);

    for (const action of PREP_OPTIONS) {
      const btnWrap = document.createElement('div');
      btnWrap.style.cssText = [
        'display:flex;flex-direction:column;',
        'background-image:linear-gradient(180deg,rgba(12,4,0,0.10),rgba(7,4,6,0.18)),url("ui/ui-prep-option-card.png");',
        'background-size:100% 100%, 820px 108px;',
        'background-repeat:no-repeat,no-repeat;',
        'background-position:center,center;',
        'min-height:98px;',
        'border:0;',
        'outline:1px solid rgba(255,140,28,0.42);',
        'border-radius:10px;',
        'padding:23px 38px 18px 42px;',
        'cursor:pointer;',
        'box-shadow:0 9px 16px rgba(0,0,0,0.30),0 0 12px rgba(255,107,0,0.08);',
        'transition:outline-color 0.15s, filter 0.15s, transform 0.15s;',
      ].join('');

      const labelEl = document.createElement('div');
      labelEl.style.cssText = [
        'font-size:18px;font-weight:bold;',
        'font-family:Microsoft JhengHei, PingFang TC, sans-serif;',
        'color:#ffffff;',
        'letter-spacing:2px;',
        'margin-bottom:7px;',
        'text-shadow:0 0 8px rgba(255,180,40,0.35);',
      ].join('');
      labelEl.textContent = action.label;

      const descEl = document.createElement('div');
      descEl.style.cssText = [
        'font-size:11px;',
        'font-family:Microsoft JhengHei, PingFang TC, sans-serif;',
        'color:#cbbca8;',
        'line-height:1.5;',
        'white-space:pre-line;',
      ].join('');
      descEl.textContent = action.desc;

      btnWrap.appendChild(labelEl);
      btnWrap.appendChild(descEl);

      btnWrap.addEventListener('pointerover', () => {
        if (this.selectedPrep !== action.id) {
          btnWrap.style.outlineColor = '#ffb22c';
          btnWrap.style.filter = 'brightness(1.12)';
          btnWrap.style.transform = 'translateX(3px)';
        }
      });
      btnWrap.addEventListener('pointerout', () => {
        if (this.selectedPrep !== action.id) {
          btnWrap.style.outlineColor = 'rgba(255,140,28,0.42)';
          btnWrap.style.filter = '';
          btnWrap.style.transform = '';
        }
      });

      btnWrap.addEventListener('click', () => {
        this.selectedPrep = action.id;
        updateGameState({ morningPrep: action.id });
        for (const [id, b] of this.prepBtns) {
          if (id === action.id) {
            b.style.outlineColor = '#ffe600';
            b.style.filter = 'brightness(1.18) drop-shadow(0 0 12px rgba(255,230,0,0.28))';
            b.style.boxShadow = '0 0 18px rgba(255,230,0,0.22),0 9px 16px rgba(0,0,0,0.30)';
            (b.querySelector('div') as HTMLElement).style.color = '#ff6b00';
          } else {
            b.style.outlineColor = 'rgba(255,140,28,0.42)';
            b.style.filter = '';
            b.style.boxShadow = '0 9px 16px rgba(0,0,0,0.30),0 0 12px rgba(255,107,0,0.08)';
            (b.querySelector('div') as HTMLElement).style.color = '#ffffff';
          }
        }
        this.updateSummary();
      });

      this.prepBtns.set(action.id, btnWrap);
      leftCol.appendChild(btnWrap);
    }

    this.panel.appendChild(leftCol);

    // ── 右欄容器 ────────────────────────────────────────────────
    const rightCol = document.createElement('div');
    rightCol.className = 'morning-right';
    rightCol.style.cssText = [
      'display:grid;',
      'grid-template-rows:auto minmax(0,1fr) auto;',
      'background:radial-gradient(circle at 50% 0%,rgba(255,107,0,0.10),transparent 35%),#090910;',
      'overflow:hidden;',
    ].join('');

    // ── 右上：香腸圖鑑（5 格小圖） ────────────────────────────
    const sausageRow = document.createElement('div');
    sausageRow.className = 'morning-sausage-row';
    sausageRow.style.cssText = [
      'display:grid;',
      'grid-template-columns:repeat(5,minmax(168px,190px));',
      'align-items:stretch;',
      'justify-content:space-between;',
      'gap:14px;',
      'padding:10px 22px 12px;',
      'overflow:hidden;',
      'flex-shrink:0;',
      'border-bottom:1px solid rgba(255,107,0,0.20);',
    ].join('');

    const unlockedTypes = SAUSAGE_TYPES.filter(s => gameState.unlockedSausages.includes(s.id));
    const recommendedId = unlockedTypes.length >= 2 ? unlockedTypes[1].id : (unlockedTypes[0]?.id ?? '');

    for (let i = 0; i < unlockedTypes.length; i++) {
      const sausage = unlockedTypes[i];
      const cell = this.buildSausageCell(sausage, spoilageInfo, sausage.id === recommendedId);
      sausageRow.appendChild(cell);
      this.sausageCells.set(sausage.id, cell);
    }
    rightCol.appendChild(sausageRow);

    // ── 右中：香腸圖鑑詳情（選中後放大顯示） ──────────────────
    this.detailEl = document.createElement('div');
    this.detailEl.className = 'morning-detail';
    this.detailEl.style.cssText = [
      'display:grid;',
      'grid-template-columns:220px minmax(0,1fr);',
      'gap:18px;',
      'padding:28px 38px 24px 24px;',
      'position:relative;',
      'background:radial-gradient(circle at 55% 38%,rgba(255,122,0,0.10),transparent 44%),linear-gradient(180deg,rgba(18,8,3,0.72),rgba(5,5,10,0.90));',
      'border:1px solid rgba(255,157,36,0.26);border-radius:10px;',
      'box-shadow:inset 0 0 22px rgba(255,107,0,0.08),0 10px 24px rgba(0,0,0,0.28);',
      'overflow:hidden;',
      'min-height:0;',
    ].join('');
    rightCol.appendChild(this.detailEl);

    // 預設選中第一個解鎖的香腸
    if (unlockedTypes.length > 0) {
      this.selectedSausageId = unlockedTypes[0].id;
      this.renderDetail();
      this.highlightSelected();
    }

    // ── 右下：總成本 + 烤起來按鈕 ──────────────────────────
    const bottomBar = document.createElement('div');
    bottomBar.className = 'morning-bottom';
    bottomBar.style.cssText = [
      'display:flex;',
      'align-items:center;',
      'justify-content:space-between;',
      'padding:12px 16px;',
      'background:linear-gradient(90deg,#080810,#130904);',
      'border-top:1px solid rgba(255,107,0,0.24);',
      'flex-shrink:0;',
    ].join('');

    const bottomLeft = document.createElement('div');
    bottomLeft.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

    this.totalCostEl = document.createElement('div');
    this.totalCostEl.style.cssText = [
      'font-size:22px;font-weight:bold;',
      'font-family:Microsoft JhengHei, PingFang TC, sans-serif;',
      'color:#ffffff;',
      'background:rgba(0,0,0,0.72);',
      'padding:8px 16px;',
      'border-radius:6px;',
      'border:1px solid rgba(255,230,0,0.28);',
      'letter-spacing:1px;',
      'box-shadow:0 0 12px rgba(255,230,0,0.10);',
    ].join('');
    this.totalCostEl.textContent = '總成本: $0';
    bottomLeft.appendChild(this.totalCostEl);

    this.rentWarning = document.createElement('div');
    this.rentWarning.style.cssText = 'font-size:12px;color:#ff4444;display:none;';
    this.rentWarning.textContent = `至少保留 $${MIN_RENT_RESERVE_FLOOR} 租金，否則傍晚無法擺攤！`;
    bottomLeft.appendChild(this.rentWarning);

    bottomBar.appendChild(bottomLeft);

    this.confirmBtn = document.createElement('button');
    this.confirmBtn.style.cssText = [
      'background-image:radial-gradient(circle at 50% 45%,rgba(255,238,82,0.18),rgba(255,107,0,0.04) 46%,transparent 70%),url("ui/ui-buy-button.png");',
      'background-size:100% 100%, 260px 130px;',
      'background-repeat:no-repeat,no-repeat;',
      'background-position:center,center;',
      'color:#fff8c8;',
      'border:0;outline:2px solid rgba(255,184,36,0.78);border-radius:13px;',
      'min-width:250px;height:74px;',
      'display:flex;align-items:center;justify-content:center;',
      'padding:13px 42px 10px;',
      'font-size:24px;font-weight:900;',
      'font-family:Microsoft JhengHei, PingFang TC, sans-serif;',
      'cursor:pointer;',
      'text-shadow:0 3px 0 #4b1600,0 0 14px #ffcc33,0 0 24px rgba(255,107,0,0.90);',
      'box-shadow:0 4px 0 #542100,0 0 26px rgba(255,230,0,0.34),0 0 42px rgba(255,117,24,0.24),0 8px 16px rgba(0,0,0,0.44);',
      'filter:brightness(1.12) saturate(1.18);',
      'transition:transform 0.1s, box-shadow 0.1s, filter 0.1s, opacity 0.1s;',
      'letter-spacing:2px;',
    ].join('');
    this.confirmBtn.addEventListener('pointerdown', () => {
      this.confirmBtn.style.transform = 'translateY(3px)';
      this.confirmBtn.style.boxShadow = '0 1px 0 #542100, 0 2px 6px rgba(0,0,0,0.4)';
    });
    this.confirmBtn.addEventListener('pointerup', () => {
      this.confirmBtn.style.transform = '';
      this.confirmBtn.style.boxShadow = '0 4px 0 #542100,0 0 26px rgba(255,230,0,0.34),0 0 42px rgba(255,117,24,0.24),0 8px 16px rgba(0,0,0,0.44)';
    });
    this.confirmBtn.addEventListener('click', this.onConfirm);
    bottomBar.appendChild(this.confirmBtn);

    rightCol.appendChild(bottomBar);
    this.panel.appendChild(rightCol);

    this.updateSummary();
  }

  private getRentReserve(): number {
    const slotId = gameState.selectedSlot >= 0 ? gameState.selectedSlot : gameState.playerSlot;
    const slot = GRID_SLOTS.find(s => s.id === slotId);
    return Math.max(MIN_RENT_RESERVE_FLOOR, slot?.rent ?? 0);
  }

  private buildSausageCell(sausage: SausageType, spoilageInfo: SpoilageInfo | undefined, isRecommended: boolean): HTMLElement {
    const cell = document.createElement('div');
    cell.className = 'morning-sausage-cell';
    cell.style.cssText = [
      'display:grid;grid-template-rows:58px 34px 20px 17px 28px 26px 14px;justify-items:center;align-items:center;',
      'min-width:0;width:100%;max-width:190px;height:224px;',
      'background-image:linear-gradient(180deg,rgba(10,4,0,0.10),rgba(4,4,8,0.10)),url("ui/ui-morning-sausage-card.png");',
      'background-size:100% 100%, auto 100%;',
      'background-repeat:no-repeat,no-repeat;',
      'background-position:center,center;',
      'border-radius:12px;',
      `outline:2px solid ${isRecommended ? 'rgba(255,138,24,0.72)' : 'transparent'};`,
      'border:0;',
      'padding:18px 34px 10px;',
      'flex-shrink:0;',
      'position:relative;',
      'cursor:pointer;',
      'filter:drop-shadow(0 8px 14px rgba(0,0,0,0.42));',
      'transition:transform 0.15s, filter 0.15s, outline-color 0.15s;',
    ].join('');

    if (isRecommended) {
      const badge = document.createElement('div');
      badge.style.cssText = [
        'position:absolute;top:2px;left:50%;transform:translateX(-50%);z-index:2;',
        'background:linear-gradient(180deg,#ff9f2c,#ff4c00);color:#fff;',
        'font-size:10px;font-weight:bold;',
        'font-family:Microsoft JhengHei, PingFang TC, sans-serif;',
        'padding:2px 8px;border-radius:10px;white-space:nowrap;',
        'box-shadow:0 0 10px rgba(255,107,0,0.55);',
      ].join('');
      badge.textContent = '總公司推薦';
      cell.appendChild(badge);
    }

    // 香腸圖示（小一點，避免擠出）
    const imgWrap = document.createElement('div');
    imgWrap.style.cssText = [
      'width:92px;height:58px;',
      'display:flex;align-items:center;justify-content:center;',
      'margin-bottom:4px;',
    ].join(';');
    if (sausage.image) {
      const img = document.createElement('img');
      img.src = sausage.image;
      img.style.cssText = 'width:82px;height:56px;object-fit:contain;border-radius:6px;filter:drop-shadow(0 4px 7px rgba(0,0,0,0.55));';
      img.alt = sausage.name;
      imgWrap.appendChild(img);
    } else {
      const emoji = document.createElement('span');
      emoji.style.fontSize = '52px';
      emoji.textContent = sausage.emoji;
      imgWrap.appendChild(emoji);
    }
    cell.appendChild(imgWrap);

    // 香腸名字
    const nameEl = document.createElement('div');
    nameEl.style.cssText = [
      'font-size:14px;font-weight:bold;',
      'font-family:Microsoft JhengHei, PingFang TC, sans-serif;',
      'color:#ffffff;',
      'margin-bottom:0;text-align:center;min-height:34px;display:flex;align-items:center;justify-content:center;',
      'letter-spacing:1px;',
      'text-shadow:0 2px 0 #3a1200,0 0 8px rgba(255,180,54,0.35);',
    ].join('');
    nameEl.textContent = sausage.name;
    cell.appendChild(nameEl);

    // 售價
    const priceEl = document.createElement('div');
    priceEl.style.cssText = 'font-size:12px;color:#ffd37a;margin-bottom:0;text-align:center;font-family:Microsoft JhengHei, PingFang TC, sans-serif;';
    priceEl.textContent = `$${sausage.cost}/根`;
    cell.appendChild(priceEl);

    const currentStock = gameState.inventory[sausage.id] ?? 0;
    const spoiledQty = spoilageInfo?.spoilage[sausage.id] ?? 0;
    const stockHint = document.createElement('div');
    stockHint.style.cssText = 'font-size:10px;color:#baa788;margin-bottom:0;text-align:center;font-family:Microsoft JhengHei, PingFang TC, sans-serif;';
    if (spoiledQty > 0) {
      stockHint.textContent = `庫存: ${currentStock}（耗 ${spoiledQty}）`;
    } else {
      stockHint.textContent = `庫存: ${currentStock}`;
    }
    cell.appendChild(stockHint);

    // 數量顯示框
    const qtyDisplay = document.createElement('div');
    qtyDisplay.style.cssText = [
      'width:40px;height:26px;',
      'display:flex;align-items:center;justify-content:center;',
      'background:#06060b;border:1px solid rgba(255,230,0,0.50);border-radius:5px;',
      'font-size:15px;font-weight:bold;color:#fff;margin-bottom:0;',
    ].join('');
    qtyDisplay.textContent = '0';
    this.qtyDisplays.set(sausage.id, qtyDisplay);
    cell.appendChild(qtyDisplay);

    const subtotalEl = document.createElement('div');
    subtotalEl.style.cssText = 'font-size:10px;color:#baa788;text-align:center;font-family:Microsoft JhengHei, PingFang TC, sans-serif;margin-bottom:0;';
    subtotalEl.textContent = '小計 $0';
    this.subtotalEls.set(sausage.id, subtotalEl);

    const calcMaxAffordable = (): number => {
      const MAX_QUANTITY = 99;
      const otherSpend = this.calcTotalCost() - this.quantities[sausage.id] * sausage.cost;
      const remaining = gameState.money - otherSpend;
      const spendable = Math.max(0, remaining - this.getRentReserve());
      return Math.min(MAX_QUANTITY, Math.floor(spendable / sausage.cost));
    };

    const makeBtn = (label: string, delta: number, color = '#1e1e2e'): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.style.cssText = [
        uiFrameStyle('ui-quantity-stepper.png'),
        'border:1px solid rgba(255,190,80,0.42);border-radius:4px;',
        'color:#fff0bc;font-size:11px;font-weight:bold;',
        'padding:2px 4px;cursor:pointer;min-width:27px;height:20px;',
        'transition:background 0.1s;',
      ].join('');
      btn.textContent = label;
      btn.addEventListener('pointerover', () => { btn.style.backgroundColor = '#ff6b0033'; });
      btn.addEventListener('pointerout',  () => { btn.style.backgroundColor = color; });
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();  // 不觸發 cell 的選中
        const maxAffordable = calcMaxAffordable();
        const newVal = Math.max(0, Math.min(maxAffordable, this.quantities[sausage.id] + delta));
        this.setQuantity(sausage, newVal, qtyDisplay, subtotalEl);
      });
      return btn;
    };

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:3px;flex-wrap:nowrap;justify-content:center;margin-bottom:0;';
    btnRow.appendChild(makeBtn('+1', +1));
    btnRow.appendChild(makeBtn('+5', +5));
    btnRow.appendChild(makeBtn('+10', +10));

    const clearBtn = document.createElement('button');
    clearBtn.style.cssText = [
      'background:#1e0a0a;border:1px solid #ff4444;border-radius:4px;',
      'color:#ff6666;font-size:10px;',
      'padding:2px 4px;cursor:pointer;min-width:30px;height:20px;',
    ].join('');
    clearBtn.textContent = '清空';
    clearBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.setQuantity(sausage, 0, qtyDisplay, subtotalEl);
    });
    btnRow.appendChild(clearBtn);
    cell.appendChild(btnRow);
    cell.appendChild(subtotalEl);

    // 整個 cell 點擊：選中該香腸 → 中央詳情更新
    cell.addEventListener('click', () => {
      this.selectedSausageId = sausage.id;
      this.renderDetail();
      this.highlightSelected();
    });
    cell.addEventListener('pointerover', () => {
      if (this.selectedSausageId !== sausage.id) {
        cell.style.transform = 'translateY(-3px)';
      }
    });
    cell.addEventListener('pointerout', () => {
      cell.style.transform = '';
    });

    return cell;
  }

  private highlightSelected(): void {
    for (const [id, cell] of this.sausageCells) {
      if (id === this.selectedSausageId) {
        cell.style.outlineColor = '#ffe600';
        cell.style.filter = 'drop-shadow(0 0 14px rgba(255,230,0,0.45)) drop-shadow(0 8px 14px rgba(0,0,0,0.42))';
      } else {
        const isRecommended = cell.querySelector('div')?.textContent === '總公司推薦';
        cell.style.outlineColor = isRecommended ? 'rgba(255,138,24,0.72)' : 'transparent';
        cell.style.filter = 'drop-shadow(0 8px 14px rgba(0,0,0,0.42))';
      }
    }
  }

  private renderDetail(): void {
    const sausage = SAUSAGE_TYPES.find(s => s.id === this.selectedSausageId);
    if (!sausage) {
      this.detailEl.innerHTML = '';
      return;
    }
    this.detailEl.innerHTML = '';

    const frameArt = document.createElement('div');
    frameArt.style.cssText = [
      'position:absolute;left:284px;right:34px;top:64px;bottom:36px;',
      uiAssetBackground('ui-morning-detail-panel.png', 'background-size:100% 100%'),
      'opacity:0.94;',
      'pointer-events:none;',
      'filter:drop-shadow(0 0 16px rgba(255,107,0,0.26));',
    ].join('');
    this.detailEl.appendChild(frameArt);

    // 左側：大圖
    const imgPanel = document.createElement('div');
    imgPanel.style.cssText = [
      'position:relative;z-index:1;',
      'display:flex;flex-direction:column;align-items:center;justify-content:center;',
      'background:linear-gradient(180deg,rgba(16,16,28,0.96),rgba(6,6,12,0.98));',
      'border:1px solid rgba(255,230,0,0.24);border-radius:12px;',
      'padding:14px;',
      'box-shadow:inset 0 0 24px rgba(255,107,0,0.08),0 8px 20px rgba(0,0,0,0.34);',
    ].join('');

    if (sausage.image) {
      const img = document.createElement('img');
      img.src = sausage.image;
      img.style.cssText = 'width:168px;height:150px;object-fit:contain;border-radius:10px;filter:drop-shadow(0 8px 12px rgba(0,0,0,0.55));';
      img.alt = sausage.name;
      imgPanel.appendChild(img);
    }

    const nameLarge = document.createElement('div');
    nameLarge.style.cssText = [
      'font-size:22px;font-weight:bold;',
      'font-family:Microsoft JhengHei, PingFang TC, sans-serif;',
      'color:#ffe600;',
      'margin-top:10px;text-align:center;',
      'letter-spacing:2px;',
    ].join('');
    nameLarge.textContent = sausage.name;
    imgPanel.appendChild(nameLarge);

    const priceLarge = document.createElement('div');
    priceLarge.style.cssText = 'font-size:13px;color:#aaa;margin-top:4px;font-family:Microsoft JhengHei, PingFang TC, sans-serif;';
    priceLarge.textContent = `成本 $${sausage.cost}　建議售價 $${sausage.suggestedPrice}`;
    imgPanel.appendChild(priceLarge);

    this.detailEl.appendChild(imgPanel);

    // 右側：說明文字區
    const textPanel = document.createElement('div');
    textPanel.style.cssText = [
      'position:relative;z-index:1;',
      'display:flex;flex-direction:column;gap:10px;',
      'overflow-y:auto;min-width:0;',
      'padding:102px 58px 34px;',
      'margin:0 110px 0 56px;',
      'background:linear-gradient(180deg,rgba(8,4,2,0.20),rgba(5,5,11,0.22));',
      'border:0;',
      'border-radius:16px;',
      'box-shadow:none;',
    ].join('');

    // 口味描述
    const flavorTitle = document.createElement('div');
    flavorTitle.style.cssText = [
      'font-size:13px;font-weight:bold;',
      'font-family:Microsoft JhengHei, PingFang TC, sans-serif;',
      'color:#ff6b00;letter-spacing:2px;',
    ].join('');
    flavorTitle.textContent = '口味敘述';
    textPanel.appendChild(flavorTitle);

    const flavorBody = document.createElement('div');
    flavorBody.style.cssText = [
      'font-size:15px;line-height:1.65;',
      'font-family:Microsoft JhengHei, PingFang TC, sans-serif;',
      'color:#f4ead8;',
      'padding:11px 14px;',
      'background:linear-gradient(90deg,rgba(18,12,8,0.96),rgba(7,7,14,0.92));border-left:3px solid #ff6b00;border-radius:6px;',
      'box-shadow:0 4px 10px rgba(0,0,0,0.25),inset 0 0 14px rgba(255,107,0,0.04);',
    ].join('');
    flavorBody.textContent = sausage.description;
    textPanel.appendChild(flavorBody);

    // 特殊效果（如有）
    if (sausage.specialEffect) {
      const effectTitle = document.createElement('div');
      effectTitle.style.cssText = flavorTitle.style.cssText;
      effectTitle.style.color = '#ffe600';
      effectTitle.textContent = `特殊效果：${sausage.specialEffect.name}`;
      textPanel.appendChild(effectTitle);

      const effectBody = document.createElement('div');
      effectBody.style.cssText = flavorBody.style.cssText;
      effectBody.style.borderLeftColor = '#ffe600';
      effectBody.textContent = sausage.specialEffect.description;
      textPanel.appendChild(effectBody);
    }

    // 在烤香腸關聯（節奏遊戲特性）
    const rhythmTitle = document.createElement('div');
    rhythmTitle.style.cssText = flavorTitle.style.cssText;
    rhythmTitle.style.color = '#33ccff';
    rhythmTitle.textContent = '節奏關聯';
    textPanel.appendChild(rhythmTitle);

    const rhythmBody = document.createElement('div');
    rhythmBody.style.cssText = flavorBody.style.cssText;
    rhythmBody.style.borderLeftColor = '#33ccff';
    const traitText = SAUSAGE_RHYTHM_TRAITS[sausage.id] ?? '';
    const totalQty = Object.values(this.quantities).reduce((a, b) => a + b, 0);
    const myQty = this.quantities[sausage.id] ?? 0;
    const ratio = totalQty > 0 ? Math.round((myQty / totalQty) * 100) : 0;
    rhythmBody.textContent = `${traitText}\n譜面音符比例：${ratio}%（你進貨 ${myQty} / ${totalQty} 根）`;
    rhythmBody.style.whiteSpace = 'pre-line';
    textPanel.appendChild(rhythmBody);

    this.detailEl.appendChild(textPanel);
  }

  private setQuantity(sausage: SausageType, qty: number, display: HTMLElement, subtotalEl: HTMLElement): void {
    this.selectedSausageId = sausage.id;
    this.highlightSelected();

    const MAX_QUANTITY = 99;
    const reserve = this.getRentReserve();
    const otherSpend = this.calcTotalCost() - this.quantities[sausage.id] * sausage.cost;
    const remaining = gameState.money - otherSpend;
    const spendable = Math.max(0, remaining - reserve);
    const maxAffordable = Math.min(MAX_QUANTITY, Math.floor(spendable / sausage.cost));
    const clamped = Math.max(0, Math.min(qty, maxAffordable));

    const wouldExceed = qty > maxAffordable && remaining > 0;
    this.rentWarning.textContent = `至少保留 $${reserve} 租金，否則傍晚無法擺攤！`;
    this.rentWarning.style.display = wouldExceed ? 'block' : 'none';

    this.quantities[sausage.id] = clamped;
    display.textContent = String(clamped);
    subtotalEl.textContent = `小計 $${clamped * sausage.cost}`;
    this.updateSummary();
    // 數量改變時，若該香腸正被選中 → 重繪詳情更新比例
    this.renderDetail();
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
    const reserve = this.getRentReserve();

    this.totalCostEl.textContent = `總成本: $${totalSpend.toLocaleString()}`;
    this.totalCostEl.style.color = remaining < reserve ? '#ff4444' : '#ffffff';

    const hasNewPurchases = Object.values(this.quantities).some(q => q > 0);
    const hasExistingStock = Object.values(gameState.inventory).some(q => q > 0);
    const hasPrepChoice = this.selectedPrep !== '';
    const canProceed = hasPrepChoice && (hasNewPurchases || hasExistingStock);

    this.confirmBtn.disabled = !canProceed;
    this.confirmBtn.style.opacity = canProceed ? '1' : '0.82';
    this.confirmBtn.style.cursor = canProceed ? 'pointer' : 'not-allowed';
    this.confirmBtn.style.filter = canProceed
      ? 'brightness(1.18) saturate(1.22)'
      : 'brightness(0.86) saturate(0.92)';

    if (!hasPrepChoice) {
      this.confirmBtn.textContent = '請先選擇策略';
    } else {
      this.confirmBtn.textContent = hasNewPurchases ? '烤起來' : '直接出攤';
    }
  }

  private onConfirm = (): void => {
    for (const sausage of SAUSAGE_TYPES) {
      const qty = this.quantities[sausage.id] ?? 0;
      if (qty > 0) {
        buyStock(sausage.id, qty);
      }
    }
    updateGameState({ purchaseQuantities: { ...this.quantities } });
    EventBus.emit('morning-done', {});
  };

  getElement(): HTMLElement {
    return this.panel;
  }

  destroy(): void {
    this.confirmBtn.removeEventListener('click', this.onConfirm);
  }
}

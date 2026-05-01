import type Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { gameState, updateGameState } from '../state/GameState';

const SCENE_KEYS = [
  'BootScene',
  'MorningScene',
  'EveningScene',
  'GrillScene',
  'BattleScene',
  'SummaryScene',
  'ShopScene',
] as const;

const DEFAULT_TEST_INVENTORY = {
  'flying-fish-roe': 20,
  cheese: 20,
  'big-taste': 20,
  'big-wrap-small': 20,
  'great-wall': 20,
};

function isTestToolsEnabled(): boolean {
  const params = new URLSearchParams(window.location.search);
  return import.meta.env.DEV || params.has('test') || localStorage.getItem('sausage-test-tools') === '1';
}

function stopAllScenes(game: Phaser.Game): void {
  for (const key of SCENE_KEYS) {
    if (game.scene.isActive(key) || game.scene.isPaused(key)) {
      game.scene.stop(key);
    }
  }
  EventBus.emit('hide-panel');
}

function seedTestState(): void {
  updateGameState({
    money: Math.max(gameState.money, 8000),
    reputation: Math.max(gameState.reputation, 70),
    playerSlot: gameState.playerSlot || 1,
    selectedSlot: gameState.selectedSlot || gameState.playerSlot || 1,
    inventory: {
      ...gameState.inventory,
      ...DEFAULT_TEST_INVENTORY,
    },
    purchaseQuantities: {
      ...DEFAULT_TEST_INVENTORY,
    },
    blackMarketUnlocked: true,
    upgrades: {
      ...gameState.upgrades,
      'neon-sign': true,
      'auto-grill': true,
      'grill-expand': true,
    },
    dailyExpenses: 0,
    dailySalesLog: [],
    warmingZone: [],
    dailyWaste: { grillRemaining: 0, warmingRemaining: 0 },
  });
}

function startScene(game: Phaser.Game, sceneKey: (typeof SCENE_KEYS)[number]): void {
  stopAllScenes(game);
  game.scene.start(sceneKey);
}

function makeButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.style.cssText = [
    'border:1px solid rgba(255,214,72,0.62)',
    'background:linear-gradient(180deg,rgba(40,18,4,0.96),rgba(12,8,14,0.96))',
    'color:#ffe066',
    'font:700 12px Microsoft JhengHei, PingFang TC, sans-serif',
    'border-radius:6px',
    'padding:6px 8px',
    'cursor:pointer',
    'white-space:nowrap',
    'box-shadow:0 0 8px rgba(255,107,0,0.22)',
  ].join(';');
  button.addEventListener('click', onClick);
  return button;
}

export function setupTestTools(game: Phaser.Game): void {
  if (!isTestToolsEnabled()) return;
  if (document.getElementById('test-tools-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'test-tools-panel';
  panel.style.cssText = [
    'position:fixed',
    'right:12px',
    'bottom:12px',
    'z-index:99999',
    'width:280px',
    'max-width:calc(100vw - 24px)',
    'background:rgba(5,4,8,0.92)',
    'border:1px solid rgba(255,230,0,0.72)',
    'border-radius:8px',
    'box-shadow:0 0 18px rgba(255,230,0,0.25)',
    'color:#fff4b0',
    'font-family:Microsoft JhengHei, PingFang TC, sans-serif',
    'pointer-events:auto',
    'overflow:hidden',
  ].join(';');

  const header = document.createElement('div');
  header.style.cssText = [
    'display:flex',
    'align-items:center',
    'justify-content:space-between',
    'gap:8px',
    'padding:8px 10px',
    'background:linear-gradient(90deg,rgba(255,107,0,0.24),rgba(255,230,0,0.08))',
    'border-bottom:1px solid rgba(255,230,0,0.28)',
    'font-weight:900',
    'font-size:13px',
  ].join(';');
  header.textContent = '測試工具';

  const collapse = document.createElement('button');
  collapse.type = 'button';
  collapse.textContent = '收合';
  collapse.style.cssText = 'margin-left:auto;border:0;background:#332000;color:#ffe066;border-radius:4px;padding:3px 6px;cursor:pointer;';
  header.appendChild(collapse);

  const body = document.createElement('div');
  body.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;padding:8px;';

  const status = document.createElement('div');
  status.style.cssText = 'grid-column:1 / -1;color:#c9b891;font-size:11px;line-height:1.35;';
  const refreshStatus = () => {
    const short = sessionStorage.getItem('sausage-test-short-grill');
    status.textContent = `Day ${gameState.day}｜$${gameState.money}｜短版烤肉：${short ? `${short}s` : '關'}`;
  };

  body.append(
    makeButton('補測試資源', () => {
      seedTestState();
      refreshStatus();
    }),
    makeButton('進貨頁', () => {
      sessionStorage.removeItem('sausage-test-short-grill');
      seedTestState();
      startScene(game, 'MorningScene');
      refreshStatus();
    }),
    makeButton('短版烤香腸', () => {
      sessionStorage.setItem('sausage-test-short-grill', '20');
      seedTestState();
      startScene(game, 'GrillScene');
      refreshStatus();
    }),
    makeButton('正常烤香腸', () => {
      sessionStorage.removeItem('sausage-test-short-grill');
      seedTestState();
      startScene(game, 'GrillScene');
      refreshStatus();
    }),
    makeButton('立即結束烤肉', () => {
      EventBus.emit('dev-end-grill-session');
      refreshStatus();
    }),
    makeButton('結算頁', () => {
      seedTestState();
      startScene(game, 'SummaryScene');
      refreshStatus();
    }),
    makeButton('地圖頁', () => {
      seedTestState();
      startScene(game, 'EveningScene');
      refreshStatus();
    }),
    makeButton('商店頁', () => {
      seedTestState();
      startScene(game, 'ShopScene');
      refreshStatus();
    }),
  );
  body.prepend(status);

  collapse.addEventListener('click', () => {
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? 'grid' : 'none';
    collapse.textContent = hidden ? '收合' : '展開';
  });

  panel.append(header, body);
  document.body.appendChild(panel);
  refreshStatus();
}

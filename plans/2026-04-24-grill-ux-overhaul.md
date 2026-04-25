# 烤香腸 UX 大改造計畫

> 制定：2026-04-24 · Opus 4.7（規劃）
> 執行：Sonnet 4.6（依各 Wave 分批實作）
> 審查：Opus 4.7（每 Wave 完成後）

## 目標

1. 砍掉非 R18 特色的 4 種香腸，5 種保留者一開始全解鎖
2. 讓「烤香腸」這個核心動作更有體感、更有節奏、更有互動
3. 調味系統極簡化為「要 / 不要蒜頭」
4. 客人會聚集在攤位旁圍觀、指手畫腳、影響玩家心理狀態

---

## 設計決策（需實作團隊遵循）

### D1. 保留的 5 種香腸
`flying-fish-roe`、`cheese`、`big-taste`、`big-wrap-small`、`great-wall`。
**全部一開始解鎖**，取消 slot-based 解鎖機制。

### D2. 熟度分 5 段（stage-based doneness）
將現在連續 0–120 的熟度分成 5 個**明確可視的階段**：

| Stage | 內部名稱 | 熟度值域 | 視覺 | 客人反應 |
|-------|---------|---------|------|---------|
| 0 | `raw` | 0–20 | 粉紅生肉 | 客人皺眉「還沒好」|
| 1 | `surface` | 20–45 | 表面變色、微焦邊緣 | 期待 |
| 2 | `half` | 45–65 | 半熟、一半金黃 | 流口水 |
| 3 | `golden` | 65–90 | 全熟、金黃油亮（= perfect） | 眼神發亮「喔喔」|
| 4 | `hot` | 90–100 | 邊緣焦（= slightly-burnt） | 緊張「小心！」|
| 5 | `burnt` | 100+ | 焦黑（= burnt / carbonized） | 散去「可惜」|

階段**上升時**觸發：視覺階躍（顏色不線性而是階梯式）、音效（滋滋→啪→嗶嗶警告）、圍觀客人反應。

Perfect 評級 = **雙面皆達 stage 3 且未達 stage 4**。

### D3. 翻面要多段
- 不再是「翻一次就成」。必須至少翻 **2 次**（每面達 stage 3 才能完美出爐）
- 若兩面熟度差 > 35 → 視為不均勻，即便平均在 perfect 範圍也只給 `ok` 評級
- 手動翻面按鈕加 **0.3 秒 cooldown**，避免無腦狂翻

### D4. 新增 2 種互動動作
- **按壓（press）**：長按香腸 → 油噴出特效 + 當前面熟度 +3/秒
  - 若在 stage 4（hot）時按壓 → 破裂特效、直接變 stage 5（burnt），扣分
- **刷油（brush oil）**：每根香腸限刷 1 次 → 外觀金亮、客人好感 +1、出餐價金 +5%
  - 必須在 stage 2 之後刷，太早刷無效

### D5. 客人圍觀機制
- 攤位下方／左右兩側新增 **SpectatorCrowd 容器**
- 每 4–8 秒自動從 CustomerQueue 抽 1 位「前方等待客人」投影到圍觀區（顯示為小圖）
- 圍觀容量上限 6 位；超過先進先出
- **反應動畫**連動 GrillEngine 的 stage 事件：
  - stage 3 → 客人浮 `◎` + 縮放脈動
  - stage 4 → 客人浮 `!` + 左右搖頭
  - stage 5 → 客人浮 `✕` + 淡出離場
  - 客人耐心 < 30% → 浮 `早點啦` + 手勢氣泡
- **心理壓力視覺**：圍觀區右上角顯示「注目度」數字（= 圍觀人數 × 平均耐心不滿度），純視覺

### D6. 調味極簡
- `CustomerOrder.condiments: string[]` → `wantGarlic: boolean`
- UI：原本多顆調味鈕 → **單顆「蒜頭」toggle**
- 評分：配對正確 100 / 錯 0（取代原本 60+30+10 權重）
- `condiments.ts` 只保留 `garlic-paste` 一項（供 UI 顯示用）

---

## Wave 分拆總覽

| Wave | 內容 | 影響範圍 | 預估 | 驗證 |
|------|------|---------|------|------|
| 1 | 刪 4 香腸、5 種全開 | 11 檔 | 30 min | tsc ✓、dev server ✓、5 種都能點 |
| 2 | 烤速、客人耐心旋鈕 | 2 檔 | 10 min | tsc ✓、試玩感受節奏 |
| 3 | 調味砍成要/不要蒜頭 | 8 檔 | 1–2 h | tsc ✓、客人只點蒜/不蒜 |
| 4a | 多段熟度系統 | 4 檔 | 1–2 h | tsc ✓、香腸顯示階段變化 |
| 4b | 翻面強化 + 按壓 + 刷油 | 3 檔 | 2–3 h | tsc ✓、互動按鈕可操作 |
| 4c | 客人圍觀 + 反應動畫 | 3 檔 + 新檔 | 2–3 h | tsc ✓、圍觀反應正常 |

每 Wave **獨立 commit**，commit 訊息格式：
```
feat/refactor: Wave N — 標題
<詳細說明>
```

---

## Wave 1 — 刪除 4 香腸、5 種全開

### 檔案清單

| 檔案 | 改動 |
|------|------|
| `src/data/sausages.ts` | 刪 4 個 entry (`black-pig`, `garlic-bomb`, `squidink`, `mala`)；`INITIAL_SAUSAGES` 改為 5 種全列 |
| `src/state/GameState.ts` | 第 42 行 `unlockedSausages` 預設改為 5 種全列 |
| `src/scenes/MorningScene.ts` | 刪掉 SLOT_UNLOCKS 整張表（第 14–21 行）及第 110–117 行解鎖檢查迴圈 |
| `src/scenes/BootScene.ts` | 第 67 行 `sausageIds` 縮成 5 種 |
| `src/scenes/GrillScene.ts` | 第 3770 行 `unlockedSausages` 初始化、第 2263 / 2659 行 squidink reveal 觸發（刪整個條件分支）|
| `src/systems/CustomerEngine.ts` | 第 18–33 行 `generateOrder` 候選池直接用 5 種、刪 slot 門檻註解 |
| `src/systems/AIEngine.ts` | 第 32–34 行對手香腸池改為 5 種 |
| `src/objects/SausageSprite.ts` | 第 51、56、459、466–467、620–636 行 squidink/mala 特效 switch case 與 `_malaPulseTween` 全刪 |

### 必刪的視覺特效函數
在 `GrillScene.ts` 與 `SausageSprite.ts` 找以下符號，一併移除：
- `triggerSquidinkReveal`
- `updateSquidinkEffect`
- `updateMalaEffect`
- `_malaPulseTween`

### INITIAL_SAUSAGES 建議新值
```ts
export const INITIAL_SAUSAGES: string[] = [
  'flying-fish-roe', 'cheese', 'big-taste', 'big-wrap-small', 'great-wall'
];
```
`gameState.unlockedSausages` 預設也改相同陣列。

### 驗證
```bash
cd /c/Users/user/sausage-conquest
npx tsc --noEmit
npm run build
```
通過後手動 `npm run dev` 打開瀏覽器，確認：
- MorningPanel 不再出現「第 N 層解鎖 XX」文案
- 可用香腸有 5 種（飛魚卵、起司、大嚐莖、大腸包小腸、萬里腸城）

### Commit
```
refactor: Wave 1 — 精簡為 5 種 R18 香腸、取消 slot 解鎖

- 刪除 black-pig, garlic-bomb, squidink, mala 及其視覺特效
- INITIAL_SAUSAGES / unlockedSausages 預設改為 5 種全列
- 移除 MorningScene.SLOT_UNLOCKS 解鎖表與檢查邏輯
- 清理 SausageSprite 的 squidink/mala switch case 與 pulse tween
```

---

## Wave 2 — 烤速 + 客人耐心旋鈕

### 檔案清單

| 檔案 | 改動位置 | 新值 |
|------|---------|------|
| `src/systems/GrillEngine.ts` | 第 17–21 行 `HEAT_RATES` | `low: 6, medium: 12, high: 22` |
| `src/systems/GrillEngine.ts` | 第 84–90 行 `judgeQuality` 實戰分支 | 見下 |
| `src/systems/CustomerEngine.ts` | 第 110、176 行 patience | `50 + Math.random() * 35` |
| `src/systems/CustomerEngine.ts` | 第 210 行 guarantee patience | `30 + Math.random() * 15` |

### judgeQuality 新區間（實戰）
```ts
if (avg > 100)  return 'carbonized';
if (avg >= 98)  return 'burnt';
if (avg >= 93)  return 'slightly-burnt';
if (avg >= 60)  return 'perfect';  // 原本 71–90，加寬到 60–92
if (avg >= 45)  return 'ok';
if (avg >= 25)  return 'half-cooked';
return 'raw';
```
simulation 分支**不動**（員工 AI 預測用）。

### 驗證
- `npx tsc --noEmit` 通過
- 實際烤一根中火香腸計時：從 raw 到 perfect 下緣約 5 秒（舊：3.5 秒）

### Commit
```
tune: Wave 2 — 烤速減慢 40%、完美區間加寬、客人耐心延長

- HEAT_RATES 由 10/20/35 降為 6/12/22（給新手反應空間）
- judgeQuality perfect 區間由 71–90 擴充至 60–92
- 客人耐心：一般 30–60s → 50–85s，保底 12–25s → 30–45s
```

---

## Wave 3 — 調味砍成「要 / 不要蒜頭」

### 檔案清單

| 檔案 | 改動 |
|------|------|
| `src/types.ts` | 第 256–259 行 `CustomerOrder`：`condiments: string[]` 改為 `wantGarlic: boolean` |
| `src/data/condiments.ts` | 只保留 `garlic-paste`，刪其餘 7 個 |
| `src/systems/CustomerEngine.ts` | 第 65–71 行 `generateOrder` 調味邏輯改為 `wantGarlic: Math.random() < 0.5` |
| `src/systems/OrderEngine.ts` | 第 14 參數與第 38 行 condiments 改為 boolean；`calculateCondimentScore` 簡化（見下） |
| `src/scenes/GrillScene.ts` | 調味 UI 相關段落（搜 `condimentOverlay`, `CONDIMENTS`）改為單顆蒜頭 toggle |
| `src/objects/CustomerQueue.ts` | 第 93–105 行 order bubble：顯示 `香腸名 + 🧄` 或 `香腸名` |
| `src/ui/panels/ShopPanel.ts` | 若有調味補貨邏輯則移除（搜 `condiment`） |
| `src/ui/panels/BattlePrepPanel.ts` / `SausageBoxPanel.ts` | 搜 `condiment` 並清理 |

### calculateCondimentScore 新邏輯
```ts
function calculateCondimentScore(wantGarlic: boolean, appliedGarlic: boolean): number {
  return wantGarlic === appliedGarlic ? 100 : 0;
}
```

### GrillScene UI 變動
- 原本多顆調味按鈕：**一顆大蒜頭圖示**（`condiment-garlic-paste.png` 或 emoji 🧄）
- 狀態：按下亮起、再按關閉
- 出餐時把 toggle 狀態 `appliedGarlic: boolean` 傳給 OrderEngine

### 驗證
- tsc 通過
- 手動遊戲：客人氣泡只顯示「香腸名 + 🧄 / 香腸名」兩種；點一次蒜頭鈕再出餐、分數 100；錯就 0

### Commit
```
refactor: Wave 3 — 調味極簡化為「要 / 不要蒜頭」二元制

- CustomerOrder.condiments (string[]) → wantGarlic (boolean)
- condiments.ts 只保留 garlic-paste
- OrderEngine 評分改為布林配對（100 or 0）
- GrillScene 調味 UI 收斂為單顆蒜頭 toggle
- CustomerQueue 訂單氣泡顯示蒜頭 emoji
```

---

## Wave 4a — 多段熟度系統

### 新增內容到 `src/systems/GrillEngine.ts`

```ts
export type CookingStage = 'raw' | 'surface' | 'half' | 'golden' | 'hot' | 'burnt';

export const STAGE_THRESHOLDS: Record<CookingStage, [number, number]> = {
  raw:     [0, 20],
  surface: [20, 45],
  half:    [45, 65],
  golden:  [65, 90],
  hot:     [90, 100],
  burnt:   [100, 9999],
};

export function getCookingStage(doneness: number): CookingStage {
  if (doneness < 20) return 'raw';
  if (doneness < 45) return 'surface';
  if (doneness < 65) return 'half';
  if (doneness < 90) return 'golden';
  if (doneness < 100) return 'hot';
  return 'burnt';
}

export function getStageDisplayInfo(stage: CookingStage): {
  color: number;       // hex 色碼
  label: string;       // 繁中階段名
  borderGlow: number;  // 邊框光色
} {
  switch (stage) {
    case 'raw':     return { color: 0xffb6c1, label: '生肉',   borderGlow: 0x666666 };
    case 'surface': return { color: 0xe8a070, label: '變色',   borderGlow: 0xaa8844 };
    case 'half':    return { color: 0xd88840, label: '半熟',   borderGlow: 0xffaa33 };
    case 'golden':  return { color: 0xdaa520, label: '金黃',   borderGlow: 0x00ff66 };
    case 'hot':     return { color: 0x885522, label: '過熱！', borderGlow: 0xff8800 };
    case 'burnt':   return { color: 0x221100, label: '焦黑',   borderGlow: 0x660000 };
  }
}
```

### GrillingSausage 新增欄位
```ts
export interface GrillingSausage {
  // ...existing fields...
  topStage: CookingStage;      // 方便 stage 轉換事件偵測
  bottomStage: CookingStage;
  lastStageChangeTime: number; // 觸發特效用
}
```
`createGrillingSausage` 初始化時 stage = `'raw'`。

### updateSausage 內部加入 stage 變化偵測
熟度更新後比對新舊 stage：若不同，回傳帶有 `_stageChanged: true` 與 `_newStage` 的物件（或透過 EventBus 發事件讓 Scene 接收特效）。

### 檔案清單
| 檔案 | 改動 |
|------|------|
| `src/systems/GrillEngine.ts` | 新增上述 stage 函數、修改 `GrillingSausage` 型別、`updateSausage` 加 stage 變化回傳 |
| `src/objects/SausageSprite.ts` | 依 stage 切換顏色、邊框光暈；可加階躍縮放動畫 |
| `src/scenes/GrillScene.ts` | 監聽 stage 變化事件，觸發音效與視覺閃光（可暫用 soundFX 現有音效） |
| `src/utils/SoundFX.ts` | 如需新增 stage 切換音效則加（可先用現有 sizzle/warning）|

### 驗證
- tsc 通過
- 遊戲中烤一根香腸，肉眼看到 5 次階段切換（顏色階躍、非線性）

### Commit
```
feat: Wave 4a — 熟度分 5 階段化、階段切換有視聽回饋

- 新增 CookingStage 型別與 STAGE_THRESHOLDS 對照表
- GrillingSausage 新增 topStage/bottomStage 欄位
- SausageSprite 依階段顯示階梯式顏色（取代原本線性漸變）
- 階段切換觸發音效與閃光（生肉→表面→半熟→金黃→過熱→焦黑）
```

---

## Wave 4b — 翻面強化 + 按壓 + 刷油

### GrillingSausage 新欄位
```ts
export interface GrillingSausage {
  // ...
  flipCount: number;        // 翻面次數
  oilBrushed: boolean;      // 已刷油
  lastFlipTime: number;     // cooldown 用
  isPressed: boolean;       // 是否正在按壓
}
```

### GrillEngine 新增函數

```ts
// 回傳 null 表示 cooldown 中
export function tryFlipSausage(s: GrillingSausage, nowSec: number): GrillingSausage | null {
  if (s.served) return null;
  if (nowSec - s.lastFlipTime < 0.3) return null; // 300ms cooldown
  return {
    ...s,
    currentSide: s.currentSide === 'bottom' ? 'top' : 'bottom',
    flipCount: s.flipCount + 1,
    lastFlipTime: nowSec,
  };
}

// 按壓：加熱當前面 +3/秒；若處於 hot 階段 → 直接進 burnt
export function pressSausage(s: GrillingSausage, deltaSec: number): GrillingSausage {
  if (s.served) return s;
  const currentDoneness = s.currentSide === 'bottom' ? s.bottomDoneness : s.topDoneness;
  const stage = getCookingStage(currentDoneness);
  if (stage === 'hot') {
    // 破裂扣分
    return { ...s, [s.currentSide === 'bottom' ? 'bottomDoneness' : 'topDoneness']: 105 };
  }
  const addition = 3 * deltaSec;
  if (s.currentSide === 'bottom') {
    return { ...s, bottomDoneness: Math.min(120, s.bottomDoneness + addition) };
  }
  return { ...s, topDoneness: Math.min(120, s.topDoneness + addition) };
}

// 刷油：必須 stage >= half，且未刷過；成功 → oilBrushed=true
export function brushOil(s: GrillingSausage): GrillingSausage | null {
  if (s.served || s.oilBrushed) return null;
  const topStage = getCookingStage(s.topDoneness);
  const bottomStage = getCookingStage(s.bottomDoneness);
  const stages = ['raw', 'surface', 'half', 'golden', 'hot', 'burnt'];
  const minIdx = Math.min(stages.indexOf(topStage), stages.indexOf(bottomStage));
  if (minIdx < 2) return null; // 雙面都要過 half
  return { ...s, oilBrushed: true };
}
```

### 出餐評分調整（OrderEngine）
- 兩面熟度差 > 35 → 品質降一級（perfect → ok, ok → half-cooked…）
- `oilBrushed = true` → qualityScore × 1.15
- 翻面次數 < 2 → warning 顯示「翻面不足」（不扣分，但提示）

### GrillScene UI
在每個 grill slot 附近加 **3 個互動按鈕**：
- `[翻面]` — 點擊觸發 `tryFlipSausage`；cooldown 時灰化
- `[按壓]` — 長按觸發 `pressSausage`（持續 tick）
- `[刷油]` — 點擊觸發 `brushOil`；成功後按鈕消失

視覺：按壓時香腸噴油粒子、刷油時金色光暈。

### 檔案清單
| 檔案 | 改動 |
|------|------|
| `src/systems/GrillEngine.ts` | 新增 `tryFlipSausage`, `pressSausage`, `brushOil`；擴充 `GrillingSausage` |
| `src/systems/OrderEngine.ts` | 評分加入 oilBrushed 加成、雙面差異降級 |
| `src/scenes/GrillScene.ts` | 3 顆互動按鈕、按壓持續 tick、刷油粒子、噴油粒子 |

### 驗證
- tsc 通過
- 實際玩：可翻面、可按壓（香腸噴油）、可刷油（金光），過熱時按壓會壞
- 只翻 1 次的香腸明顯不均勻，出餐評分降級

### Commit
```
feat: Wave 4b — 多段翻面 + 按壓 / 刷油互動

- GrillingSausage 新增 flipCount, oilBrushed, isPressed 欄位
- GrillEngine 新增 tryFlipSausage（含 cooldown）、pressSausage、brushOil
- 雙面熟度差 > 35 視為不均勻，出餐品質降一級
- oilBrushed 加成出餐品質 ×1.15
- GrillScene 每個 slot 新增 3 顆互動按鈕與對應粒子特效
```

---

## Wave 4c — 客人圍觀 + 反應動畫

### 新增檔案 `src/objects/SpectatorCrowd.ts`

```ts
// SpectatorCrowd — 攤位邊圍觀客人容器
import Phaser from 'phaser';
import type { Customer } from '../types';

interface SpectatorDisplay {
  customer: Customer;
  container: Phaser.GameObjects.Container;
  reactionBubble: Phaser.GameObjects.Text | null;
  arrivedAt: number;
}

export class SpectatorCrowd extends Phaser.GameObjects.Container {
  private spectators: SpectatorDisplay[] = [];
  private readonly maxCapacity = 6;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    scene.add.existing(this);
  }

  // 半圓形座標：攤位下方排列
  addSpectator(customer: Customer): void {
    if (this.spectators.length >= this.maxCapacity) {
      this.removeOldest();
    }
    const idx = this.spectators.length;
    const angle = Math.PI + (idx / (this.maxCapacity - 1)) * Math.PI; // 下半圓
    const radius = 160;
    const targetX = Math.cos(angle) * radius;
    const targetY = Math.abs(Math.sin(angle)) * 60;
    // 建 container、spawn 在遠端、tween 進場...（細節參照 CustomerQueue）
  }

  reactToStage(stage: 'golden' | 'hot' | 'burnt' | 'slow'): void {
    for (const sp of this.spectators) {
      // 根據 stage 浮出不同氣泡
    }
  }

  getPressureLevel(): number {
    // 圍觀人數 × 平均不滿度 = 注目度
    return this.spectators.length * (/* calc */ 1);
  }

  tick(deltaSec: number): void { /* 氣泡 timer、自然散去 */ }
}
```

### GrillScene 整合
- `create()` 中實例化 `SpectatorCrowd`，放在烤台下方（y = 中央偏下）
- 每 4–8 秒從 `customerQueue.getWaitingCustomers()` 取前 1–2 位，呼叫 `spectatorCrowd.addSpectator()`
- 監聽 stage 事件 → 呼叫 `spectatorCrowd.reactToStage(newStage)`
- 每 tick 檢查 customer patience，若 < 30% 呼叫 `spectatorCrowd.reactToStage('slow')`
- 右上角新增「注目度」小數字 = `spectatorCrowd.getPressureLevel()`

### 反應氣泡清單
| 事件 | 氣泡內容 | 動畫 |
|------|---------|------|
| stage → golden | `◎` | 放大 1.15 倍脈動 |
| stage → hot | `!` | 左右搖晃 |
| stage → burnt | `✕` | 淡出離場 |
| customer patience < 30% | `早點啦` | 上下跳動 |
| perfect 出餐 | `❤` | 升空淡出 |
| carbonized 出餐 | `💢` | 離場 |

### 檔案清單
| 檔案 | 改動 |
|------|------|
| `src/objects/SpectatorCrowd.ts` | **新增** |
| `src/scenes/GrillScene.ts` | 實例化、tick、事件接線、注目度 UI |
| `src/objects/CustomerQueue.ts` | 暴露 `getWaitingCustomers()`（已存在） |

### 驗證
- tsc 通過
- 遊戲中可見攤位下方圍觀客人（3–6 位）
- 烤到 golden 時圍觀客人氣泡反應
- 烤焦時圍觀客人散去
- 客人等太久時圍觀客人搖頭

### Commit
```
feat: Wave 4c — 客人圍觀與反應動畫（心理壓力視覺化）

- 新增 SpectatorCrowd 容器：攤位下方半圓排列圍觀客人（上限 6）
- 每 4–8 秒從 CustomerQueue 前方抽客人投影到圍觀區
- 圍觀客人依 stage 事件浮氣泡反應（◎/!/✕/早點啦）
- 新增右上角「注目度」指標 = 圍觀人數 × 平均不滿度
- GrillScene 整合 stage 事件與 patience 事件接線
```

---

## 風險與回滾

| 風險 | 可能發生點 | 緩解 |
|------|-----------|------|
| Sonnet 改 GrillScene 時破壞現有功能 | Wave 3, 4b, 4c | 每 Wave 獨立 commit，可 revert 單個 commit |
| stage 事件系統導致 event storm | Wave 4a | Scene 端對同 stage 做去重 |
| 圍觀客人與 queue 客人重複顯示 | Wave 4c | spectator 用獨立 cloned 小圖，不共用 queue 的 GameObject |
| tsc 失敗 | 任一波 | Sonnet 必須每 Wave 結束跑 `npx tsc --noEmit` 才 commit |

---

## 分工

| 角色 | 模型 | 職責 |
|------|------|------|
| 計畫制定 | Opus 4.7 | 本文件 |
| Wave 1–4c 實作 | Sonnet 4.6 | 逐波執行、commit |
| 每波審查 | Opus 4.7 | diff review、tsc 驗證、必要時打回重做 |

**卡關 3 次上限**：同一波失敗 3 次 → Sonnet 停手，回報 Opus 重新規劃。

---

## 啟動指令

Opus 依序派 Sonnet subagent：
```
Wave 1 完成 → Opus review → Wave 2 → review → Wave 3 → review → Wave 4a → ... → Wave 4c → 總體驗收
```

每波 Sonnet 開工前應：
1. 讀本計畫書對應 Wave 章節
2. 讀相關檔案
3. 實作
4. `npx tsc --noEmit` 通過
5. `git add -p` 精準暫存（不加 build artifact）
6. `git commit` 用指定 format

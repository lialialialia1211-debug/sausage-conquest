# 烤香腸節奏 Combo 系統計畫

> 制定：2026-04-25 · Opus 4.7（規劃）
> 執行：Sonnet 4.6（依 Wave 5a → 5b → 5c 分批實作）
> 審查：Opus 4.7（每 Wave 完成後）

## 目標

把「翻面 / 按壓 / 刷油」三個互動按鈕做成節奏 QTE：
1. 在熟度條的 5 段交界線附近設「完美時機綠色帶」
2. 玩家在綠色帶內按下動作 → **PERFECT** + Combo +1
3. 綠色帶外按下 → **MISS** + Combo 歸零
4. Combo 跨香腸傳承（不重置）
5. 達 3 / 5 / 10 / 15 combo 給累進獎勵
6. 三組音效（PERFECT 命中、MISS 失誤、Combo 升級）

---

## 設計決策（必遵循）

### D1. 與既有系統的分工

既有 Phase 1 的 `perfectCombo`（整根香腸 perfect 連擊，里程碑 3/5）**保留不動**。

本計畫新增的是**獨立的 `timingCombo`**（按下時機 combo，里程碑 3/5/10/15）。

| 系統 | 觸發點 | 計數單位 | 里程碑 | 顯示位置 |
|------|-------|---------|-------|---------|
| `perfectCombo`（舊） | 出餐瞬間 | 整根香腸 | 3 / 5 | 螢幕上方中央（既有 `comboText`） |
| `timingCombo`（新） | 翻面 / 按壓 / 刷油按下瞬間 | 單次按鍵 | 3 / 5 / 10 / 15 | 烤台正上方（新 `timingComboText`） |

### D2. 完美時機綠色帶

每段熟度交界線上下抹一條綠帶：

| 交界 | 中心點 | 綠色帶範圍 | 寬度 |
|------|-------|-----------|------|
| raw → surface | 20 | 17 ~ 23 | 6 |
| surface → half | 45 | 42 ~ 48 | 6 |
| half → golden | 65 | 62 ~ 68 | 6 |
| golden → hot | 90 | 87 ~ 93 | 6 |
| hot → burnt | 100 | 97 ~ 103 | 6（最後一條較窄但獎勵高） |

**判定規則**：
- 任一互動按下時，取「**當前面熟度**」（currentSide），若落在任一條綠色帶內 → PERFECT
- 落在綠色帶外 → MISS
- 不按 → 不算 MISS（只有「按了但沒抓準時機」才算 MISS，避免玩家不敢按）

**反作弊**：同一條綠色帶 0.5 秒內只能命中一次 PERFECT，避免狂按刷分。

### D3. Combo 規則

```
PERFECT → timingCombo +1
MISS    → timingCombo = 0（歸零）
不按    → timingCombo 維持（不變）
```

**跨香腸傳承**：上一根香腸出餐 / 燒焦 / 棄置時，**不重置 `timingCombo`**。
**重置時機**：只有營業日結束（GrillScene shutdown）才歸零。

### D4. Combo 獎勵階梯

| Combo 數 | 立即效果 | 累積效果 |
|---------|---------|---------|
| 3 | 螢幕飄「FIRE！」+ 命中音效升頻 | — |
| 5 | 「神之手 5 連擊！」金光特效 | 當前場次出餐分數 ×1.1 |
| 10 | 「神之手 10 連擊！」橘色光暈 | 當前場次出餐分數 ×1.2、圍觀客人浮愛心 |
| 15 | 「神之手 15 連擊！」紫色閃光 + 全場耐心 +20% | 當前場次出餐分數 ×1.3 |
| 斷 combo（任何 MISS） | 「COMBO 中斷！」紅字 + 數字碎裂掉落動畫 | 加成立即消失 |

加成倍率寫在 `getTimingComboBonus(combo: number): number`，由 `OrderEngine.calculateOrderScore` 在出餐時讀取（場次內動態查詢）。

### D5. 視覺設計

**熟度條改造**（最關鍵）：
- 現有 `donenessBar` 改成「灰底 + 5 條綠色發亮帶」
- 5 條帶子在固定位置（百分比 17-23 / 42-48 / 62-68 / 87-93 / 97-103）
- 指針（當前熟度標記）滑近綠帶 ±3 範圍 → 綠帶開始 sin 脈動加亮（alpha 0.6 → 1.0）
- 進入帶內 → 整條變金色（0xffd700）+ 微震 0.1 秒
- PERFECT 命中後 → 該帶子「冷卻」變灰 0.5 秒（防刷分視覺反饋）

**Combo 數字**（烤台正上方）：
- 字體大小依 combo 數遞增：`fontSize = 24 + Math.min(combo * 2, 32)` (上限 56)
- 顏色階梯：1-2 白、3-4 黃、5-9 橘、10-14 紅、15+ 紫
- 每次 +1 → 跳一次彈跳（scale 1 → 1.4 → 1）
- 斷 combo → 字體碎裂掉落（多個 text 物件向下飛濺後淡出）

**PERFECT / MISS 浮字**：
- 在按下動作的香腸正上方浮 16px 字
- PERFECT：金色 + 上升 0.3 秒淡出
- MISS：紅色 + 左右抖動 0.2 秒淡出

### D6. 音效設計（程序生成、加進 `SoundFX.ts`）

| 方法 | 用途 | 音色 |
|------|------|------|
| `playTimingPerfect()` | PERFECT 命中（基底） | 1320 Hz sine + 1760 Hz triangle 同步，0.12 秒 |
| `playTimingPerfectHigh(combo)` | combo 越高音越亮 | 上式頻率 × (1 + combo×0.03)，封頂 ×1.5 |
| `playTimingMiss()` | MISS 失誤 | 220 Hz square 下滑到 110 Hz，0.15 秒 |
| `playComboMilestone(level)` | combo 3/5/10/15 升級 | 三音 arpeggio：3 → CEG / 5 → CEGC / 10 → CEGCE / 15 → CEGCEG |

`playTimingPerfectHigh` 取代 `playTimingPerfect`，combo 為 0 時等同基底音。

---

## Wave 5a — 綠色帶 + 判定核心（純邏輯 + 熟度條視覺）

### 檔案清單

| 檔案 | 改動 |
|------|------|
| `src/systems/GrillEngine.ts` | 新增 `PERFECT_BANDS` 常數（5 條範圍）、`checkTimingHit(doneness): { hit: boolean; bandIndex: number }` |
| `src/scenes/GrillScene.ts` | 新增 `timingCombo` state、`bandCooldowns: Map<bandIndex, expireTime>`；改造 `donenessBar` 繪製成 5 條綠帶；翻面 / 按壓 / 刷油按下時呼叫 `judgeTimingHit()` |

### 關鍵實作位置

**`GrillEngine.ts`**：
```ts
export const PERFECT_BANDS: readonly [number, number][] = [
  [17, 23], [42, 48], [62, 68], [87, 93], [97, 103],
];

export function checkTimingHit(doneness: number): { hit: boolean; bandIndex: number } {
  for (let i = 0; i < PERFECT_BANDS.length; i++) {
    const [lo, hi] = PERFECT_BANDS[i];
    if (doneness >= lo && doneness <= hi) return { hit: true, bandIndex: i };
  }
  return { hit: false, bandIndex: -1 };
}
```

**`GrillScene.ts`**：
- 新增 state：`private timingCombo = 0`、`private maxTimingCombo = 0`、`private bandCooldowns = new Map<number, number>()`
- 新增方法 `private judgeTimingHit(slot: GrillSlot, action: 'flip' | 'press' | 'brush'): 'perfect' | 'miss'`
- 在 `tryFlipSausage` 觸發處（第 1698 行附近）、`brushOil` 觸發處（第 1764 行附近）、按壓 tick（第 498 行附近）按下時呼叫 `judgeTimingHit`

**注意**：按壓是「持續觸發」型，judge 只在「按下瞬間」（pointerdown）做一次，持續按住期間不重複判定。

**熟度條改造**（在 `GrillScene.ts` 找 `donenessBar` / `drawDoneness` 相關方法）：
- 5 條綠帶用獨立的 `Phaser.GameObjects.Rectangle` 畫，存在 slot 的 `bandRects: Rectangle[]`
- 每 tick 讀 `bandCooldowns` 判斷該帶子是否冷卻中（變灰）
- 若不在冷卻 → 計算指針距離 → ±3 內開始脈動

### 暫不做（留 Wave 5b）
- Combo 計數變化（這波 PERFECT 命中只回傳結果，不累加）
- 浮字、音效、獎勵

### 驗證

```bash
cd /c/Users/user/sausage-conquest
npx tsc --noEmit
npm run build
```

通過後 `npm run dev` 確認：
- 熟度條看得到 5 條綠帶
- 指針靠近綠帶會脈動加亮
- 翻面 / 按壓 / 刷油時 console 印 `[timing] PERFECT band 2` 或 `[timing] MISS`（暫用 console 驗證）

### Commit

```
feat: Wave 5a — 烤香腸節奏 QTE 綠色帶與判定核心

- GrillEngine 新增 PERFECT_BANDS 常數（5 條交界範圍）
- GrillEngine 新增 checkTimingHit() 判定函數
- GrillScene 熟度條改造為灰底 + 5 條綠色發亮帶
- 綠帶接近指針時脈動加亮，命中後 0.5 秒冷卻變灰
- 翻面 / 按壓 / 刷油按下時觸發判定（暫用 console 驗證）
```

---

## Wave 5b — Combo 累積、浮字、獎勵套用

### 檔案清單

| 檔案 | 改動 |
|------|------|
| `src/scenes/GrillScene.ts` | 加 `timingComboText`、`handleTimingHit(result)` 方法；PERFECT/MISS 浮字；3/5/10/15 里程碑特效 |
| `src/systems/GrillEngine.ts` | 新增 `getTimingComboBonus(combo: number): number` |
| `src/systems/OrderEngine.ts` | `calculateOrderScore` 接受 timingComboBonus 參數；既有出餐流程把 bonus 帶入 |
| `src/state/GameState.ts` | 不動（combo 是 GrillScene 場景內 state，不持久化） |

### 關鍵實作位置

**`getTimingComboBonus`**：
```ts
export function getTimingComboBonus(combo: number): number {
  if (combo >= 15) return 1.3;
  if (combo >= 10) return 1.2;
  if (combo >= 5) return 1.1;
  return 1.0;
}
```

**`OrderEngine.calculateOrderScore`**（找該函式簽章）：
- 新增可選參數 `timingComboMultiplier: number = 1.0`
- 最終分數 = 原分數 × timingComboMultiplier
- GrillScene 出餐時呼叫 `getTimingComboBonus(this.timingCombo)` 取得倍率傳入

**`handleTimingHit`**（GrillScene 新方法）：
```ts
private handleTimingHit(slot: GrillSlot, result: 'perfect' | 'miss'): void {
  if (result === 'perfect') {
    this.timingCombo += 1;
    this.maxTimingCombo = Math.max(this.maxTimingCombo, this.timingCombo);
    this.showTimingFloater(slot, 'PERFECT', '#ffd700');
    this.updateTimingComboText();
    if ([3, 5, 10, 15].includes(this.timingCombo)) {
      this.triggerTimingMilestone(this.timingCombo, slot);
    }
    sfx.playTimingPerfectHigh(this.timingCombo);
  } else {
    if (this.timingCombo > 0) {
      this.showTimingFloater(slot, 'MISS', '#ff4444');
      this.shatterComboText();
      sfx.playTimingMiss();
    }
    this.timingCombo = 0;
    this.updateTimingComboText();
  }
}
```

**斷 combo 視覺**（`shatterComboText`）：
- 把當前 `timingComboText` 拆成 N 個 char，每 char 給隨機向下散開的 tween
- tween 結束 destroy

**里程碑特效**（`triggerTimingMilestone`）：
- 3 / 5 / 10 / 15 顯示對應金句（「FIRE！」/「神之手 5 連擊！」/「神之手 10 連擊！」/「神之手 15 連擊！」）
- 大字慢速放大淡出 0.8 秒
- 10 / 15 額外觸發圍觀客人愛心氣泡（呼叫 `spectatorCrowd.celebrateCombo()`，這函式 Wave 5c 才實作；Wave 5b 暫時 try-catch 包起來）
- 15 額外觸發全場耐心 +20%（沿用既有 `customerQueue.boostPatience(0.2)` 若有；無則 console.log 標 TODO）

### 驗證

- tsc 通過
- 實玩確認：
  - 翻面命中綠帶 → 浮 PERFECT 金字、上方 combo 數字 +1
  - 翻面沒中 → 浮 MISS 紅字、combo 歸零、字體碎裂
  - 連擊 3 → FIRE 字、combo 5 → 出餐分數倍率明顯增加
  - 跨香腸 combo 不重置（serve 一根後下一根第一次 PERFECT 數字接續）

### Commit

```
feat: Wave 5b — 節奏 Combo 累積、浮字、獎勵倍率

- GrillScene 新增 timingCombo / maxTimingCombo state（跨香腸傳承）
- handleTimingHit 處理 PERFECT/MISS 累加與重置
- PERFECT/MISS 浮字、combo 數字依 combo 變色變大
- 斷 combo 字體碎裂掉落動畫
- 3/5/10/15 里程碑金句與特效
- GrillEngine 新增 getTimingComboBonus（×1.0/1.1/1.2/1.3）
- OrderEngine 接受 timingComboMultiplier 倍率，出餐分數套用
```

---

## Wave 5c — 音效完整化 + 圍觀慶祝動畫 + 微調

### 檔案清單

| 檔案 | 改動 |
|------|------|
| `src/utils/SoundFX.ts` | 新增 `playTimingPerfect()` `playTimingPerfectHigh(combo)` `playTimingMiss()` `playComboMilestone(level)` |
| `src/objects/SpectatorCrowd.ts` | 新增 `celebrateCombo(level: number)` |
| `src/scenes/GrillScene.ts` | 接線 milestone → spectatorCrowd.celebrateCombo |

### 關鍵實作位置

**`SoundFX.ts` 新方法**（仿造既有 `playPerfect` / `playEventAlert` 風格）：

```ts
playTimingPerfect(): void {
  const ctx = this.ensureContext();
  const now = ctx.currentTime;
  this.playToneAt(ctx, now, 1320, 'sine', 0.35, 0.12);
  this.playToneAt(ctx, now, 1760, 'triangle', 0.15, 0.12);
}

playTimingPerfectHigh(combo: number): void {
  const ctx = this.ensureContext();
  const now = ctx.currentTime;
  const mult = Math.min(1 + combo * 0.03, 1.5);
  this.playToneAt(ctx, now, 1320 * mult, 'sine', 0.35, 0.12);
  this.playToneAt(ctx, now, 1760 * mult, 'triangle', 0.15, 0.12);
}

playTimingMiss(): void {
  const ctx = this.ensureContext();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(110, now + 0.15);
  gain.gain.setValueAtTime(0.18, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  osc.connect(gain); gain.connect(this.masterGain!);
  osc.start(now); osc.stop(now + 0.15);
}

playComboMilestone(level: number): void {
  const sequences: Record<number, [number, number][]> = {
    3:  [[523.25, 0], [659.25, 0.06], [783.99, 0.12]],
    5:  [[523.25, 0], [659.25, 0.06], [783.99, 0.12], [1046.5, 0.18]],
    10: [[523.25, 0], [659.25, 0.05], [783.99, 0.10], [1046.5, 0.15], [1318.5, 0.20]],
    15: [[523.25, 0], [659.25, 0.05], [783.99, 0.10], [1046.5, 0.15], [1318.5, 0.20], [1568, 0.25]],
  };
  const notes = sequences[level] ?? sequences[3];
  this.playArpeggio(notes, 0.12, 0.35);
}
```

需新增 helper `playToneAt(ctx, startTime, freq, type, volume, duration)`，仿照既有 `playNoiseAt` 的精準排程模式（playTone 沒提供 startTime 參數）。

**`SpectatorCrowd.ts` 新方法**：

```ts
celebrateCombo(level: number): void {
  const emoji = level >= 15 ? '💜' : level >= 10 ? '🧡' : '❤';
  for (const sp of this.spectators) {
    // 在 sp.container 浮一個 emoji 文字 + 上升淡出動畫
  }
}
```

（emoji 用法：上面是視覺示意，實作時用 `Text` 物件，scene 偏好 emoji 直接渲染或用既有的 `◎` `❤` 等符號皆可，不影響邏輯。）

**GrillScene 接線**：
把 Wave 5b 里程碑時的 try-catch 拿掉，正式呼叫 `this.spectatorCrowd.celebrateCombo(combo)`，並串 `sfx.playComboMilestone(combo)`。

### 微調

實玩後若發現：
- 綠帶寬度 6 太難 → 放寬到 8（中央 ±4）
- 翻面 cooldown 0.3 秒讓玩家來不及打 combo → 動作 cooldown 不變，但允許按壓 / 刷油也算 combo（已涵蓋）
- combo 太容易破百 → 加上同一根香腸內 combo 上限 +5（避免狂按按壓刷分）

這些以 commit message 註記「tune」前綴另開小 commit。

### 驗證

- tsc 通過
- 實玩感受：
  - 命中聲音越多 combo 越亮（音高遞增）
  - MISS 聲音明顯不悅
  - 5 / 10 / 15 milestone 有獨立的 arpeggio 提示
  - 圍觀客人在 milestone 時集體浮愛心

### Commit

```
feat: Wave 5c — 節奏 Combo 音效完整化 + 圍觀慶祝動畫

- SoundFX 新增 playTimingPerfect / playTimingPerfectHigh
  / playTimingMiss / playComboMilestone（程序生成）
- combo 越高音越亮（頻率 ×(1 + combo×0.03)，封頂 1.5x）
- 3/5/10/15 milestone 有獨立 arpeggio 音色
- SpectatorCrowd 新增 celebrateCombo() 連動 milestone
- 圍觀客人在 10/15 連擊時集體浮愛心
```

---

## 風險與回滾

| 風險 | 可能發生點 | 緩解 |
|------|-----------|------|
| 綠帶判定太嚴 / 太鬆 | Wave 5a | Wave 5c 預留 tune commit；寬度集中在 `PERFECT_BANDS` 一處可調 |
| 跨香腸 combo 變成「打開烤台站著不動」也能保存 | Wave 5b | combo 加成只在「當前場次」生效，shutdown 必歸零 |
| 按壓持續 tick 觸發 combo storm | Wave 5a | judge 只在 pointerdown 做一次，持續按住不重複觸發 |
| 與既有 perfectCombo 視覺衝突 | Wave 5b | timingComboText 放烤台正上方，既有 comboText 在螢幕中央上方，y 座標分離 |
| Sonnet 改 GrillScene 時破壞翻面 / 按壓 / 刷油現有功能 | Wave 5a | 先讀 1698 / 1764 / 498 行確認 hooks 位置，動作前不重寫整個方法 |

每 Wave 獨立 commit，可單獨 revert。

---

## 分工

| 角色 | 模型 | 職責 |
|------|------|------|
| 計畫制定 | Opus 4.7 | 本文件 |
| Wave 5a / 5b / 5c 實作 | Sonnet 4.6 | 逐波執行、commit |
| 每波審查 | Opus 4.7 | diff review、tsc 驗證、必要時打回重做 |

**卡關 3 次上限**：同波失敗 3 次 → Sonnet 停手，回報 Opus 重新規劃。

---

## 啟動順序

```
Wave 5a → Opus review → Wave 5b → review → Wave 5c → 總體驗收
```

每波 Sonnet 開工前：
1. 讀本計畫對應 Wave 章節
2. 讀相關檔案的對應行（GrillScene 第 1698 / 1764 / 498 行）
3. 實作
4. `npx tsc --noEmit` 通過
5. `git add -p` 精準暫存
6. `git commit` 用指定 format

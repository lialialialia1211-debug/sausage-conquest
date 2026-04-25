# Wave 6 — 烤香腸節奏遊戲（太鼓達人式）

> 制定：2026-04-26 · Opus 4.7
> 執行：Sonnet 4.6（5 個 sub-wave 接力）
> 審查：Opus 4.7（每 wave 完成後）

## 設計總綱

### 玩法

整個 GrillScene 烤香腸主玩法**重做為太鼓達人風格節奏遊戲**：

1. 進入 GrillScene → 主題曲 BGM 開始播放 → 譜面開始跑
2. 香腸形狀的音符從畫面**右邊**飛入，往**左邊判定圈**移動
3. 玩家依音符顏色按鍵：
   - **紅色（don / 咚）** → 按 `F` 或 `J`
   - **藍色（ka / 喀）** → 按 `D` 或 `K`
4. 命中時機：PERFECT / GREAT / GOOD / MISS（±50 / ±100 / ±150 ms）
5. 命中後音符**飛入下方烤網**的下一個空位
6. 烤網上的香腸**系統自動烤熟自動出餐**（依命中精準度決定最終熟度）
7. 譜面結束（BGM 結束）= 一場營業日結束 → 結算

### 關鍵簡化

- 玩家**不再**手動翻面 / 按壓 / 刷油（Wave 4b 那 3 個按鈕全砍）
- 玩家**不再**手動加蒜（蒜頭評分固定 100，調味系統視為過關狀態）
- 玩家**不再**手動結束營業（END_DAY 按鈕廢棄，BGM 跑完就結束）
- 5 段熟度（生肉→變色→半熟→金黃→過熱→焦黑）保留，但**僅由系統推進**

### 玩家精準度 → 熟度對照（方案 X）

| 命中 | 落網時標籤 | 自動烤目標熟度 | 出餐評級 |
|------|-----------|--------------|---------|
| PERFECT | `perfect` | doneness 80（金黃中央） | perfect |
| GREAT   | `great`   | doneness 72（金黃下緣） | perfect 但分數低 5% |
| GOOD    | `good`    | doneness 60（half→golden 交界） | ok |
| MISS    | —（不入網） | — | 該音符直接消失 |

### 烤網滿了的處理

烤網 4 格（沿用既有設計），命中時若無空位 → **該音符視為 MISS 跳過**（不擠掉舊的、不算進 combo 也不扣 combo）。

譜面設計避免連續 5 拍以上不出餐窗口（系統自動出餐速度應接近譜面密度）。

### 奧客打斷

EventScene / 奧客事件觸發時：
- **BGM 暫停**（`audio.pause()`）
- **譜面凍結**（不再 spawn note，已存在的 note 停止移動）
- 事件結束 → `audio.resume()` + 譜面從中斷處繼續

### 客人系統（保留但簡化）

- 客人耐心 / 圍觀 / 訂單照常運作
- 客人訂單僅顯示「想要哪種香腸」，**不再要求調味**
- 系統依烤網上是否有合適香腸出餐：FIFO 優先，符合訂單種類加分
- 客人圍觀依**命中事件**反應：PERFECT 浮愛心、MISS 皺眉、50/100 連擊集體歡呼

### 戰鬥 / Evening / Shop / Morning

**完全不動**。只改 GrillScene 主玩法。

---

## 譜面資料

`public/chart-grill-theme.json`（已產生，170 顆音符）：

```json
{
  "audioFile": "bgm-grill-theme.mp3",
  "duration": 162.17,
  "tempo": 89,
  "totalNotes": 170,
  "sections": [...],
  "notes": [
    { "t": 1.045, "type": "don", "sausage": "flying-fish-roe" },
    ...
  ]
}
```

| 段 | 時間 | 音符 | 說明 |
|----|------|------|------|
| intro | 0–20s | 15 | 熱身 |
| verse | 20–81s | 62 | 主歌 |
| chorus | 81–142s | 90 | 副歌（含 2 顆萬里腸城彩蛋） |
| outro | 142–162s | 3 | 收尾 |

未來擴充：每首 BGM 對應一份 chart JSON。本計畫只做這一首，多首支援留 Wave 7+。

---

## 太鼓風格音效（程序合成，零版權）

新增至 `src/utils/SoundFX.ts`：

| 方法 | 用途 | 音色描述 |
|------|------|---------|
| `playDon()` | 命中咚音符 | 100Hz sine 短脈衝 + 中頻噪音瞬擊（仿大鼓） |
| `playKa()` | 命中喀音符 | 1200Hz 帶通噪音短促衝擊（仿邊鼓） |
| `playRhythmPerfect()` | PERFECT 命中音 | 1760Hz sine + 2640Hz triangle 0.08 秒 |
| `playRhythmGreat()` | GREAT 命中音 | 1320Hz sine 0.08 秒 |
| `playRhythmGood()` | GOOD 命中音 | 880Hz sine 0.10 秒 |
| `playRhythmMiss()` | MISS 漏拍音 | 200Hz square 0.12 秒 lowpass 衰減 |
| `playRhythmCombo50()` | 50 連擊里程碑 | 上行琶音 C5-E5-G5-C6 |
| `playRhythmCombo100()` | 100 連擊里程碑 | 上行琶音 C5-E5-G5-C6-E6-G6 + shimmer |

---

## 砍掉的檔案 / 函式

執行各 wave 時對應砍掉：

| 砍掉 | 位置 | 何時砍 |
|------|------|--------|
| `tryFlipSausage` 觸發點（pointerdown） | `GrillScene.ts:1709` | Wave 6c |
| `pressSausage` 觸發點 | `GrillScene.ts:1746` | Wave 6c |
| `brushOil` 觸發點 | `GrillScene.ts:1780` | Wave 6c |
| 翻面 / 按壓 / 刷油按鈕 zone（flipZone, pressZone, oilZone） | `GrillScene.ts` | Wave 6c |
| 蒜頭調味 toggle UI | `GrillScene.ts`（搜 `appliedGarlic`） | Wave 6c |
| END_DAY 按鈕 | `GrillScene.ts`（搜 `endButton`） | Wave 6d |
| `GAME_DURATION` 常數 | `GrillScene.ts` | Wave 6d（改為 BGM duration） |
| 動態 tier-based 時長計算 | `GrillScene.ts` | Wave 6d |
| 既有 `perfectCombo` / `handleCombo` / `triggerComboMilestone`（Phase 1 的整根 perfect combo） | `GrillScene.ts` | Wave 6e（被新 combo 系統取代） |

`GrillEngine.ts` 的 `tryFlipSausage` / `pressSausage` / `brushOil` 函式本身**不刪**（其他可能引用、且邏輯仍可用於系統自動處理）。

---

## Wave 拆分總覽

| Wave | 內容 | 影響檔案 | 預估 | 驗證 |
|------|------|---------|------|------|
| 6a | 譜面載入 + Note 物件 + 飛行視覺 | 4 檔（含 2 新檔） | 1.5h | tsc / build / 譜面跑出來會動 |
| 6b | don/ka 輸入 + 命中判定 + 浮字 + 太鼓音效 | 3 檔 | 2h | 按鍵能打、音效對、判定文字會浮 |
| 6c | 香腸落網 + 自動烤系統 + 砍手動互動 | 4 檔 | 2.5h | 香腸命中後自動烤熟自動出餐 |
| 6d | BGM 載入 + 同步 + 暫停機制 + 譜面結束結算 | 3 檔 | 1.5h | BGM 跑完場景結束、奧客事件暫停正常 |
| 6e | Combo 大字 + 50/100 里程碑 + 圍觀反應 + 結算頁 | 3 檔 | 1.5h | 整體體感完成 |

**總工時估 9 小時**，分 5 個 commit。

---

## Wave 6a — 譜面載入 + Note 物件 + 飛行視覺

### 目標

譜面 JSON 載入完成，香腸形狀的音符可以從右邊飛到左邊判定圈，但**還不能打**（沒輸入、沒判定、沒落網）。

### 新增檔案

#### `src/data/chart.ts`

```ts
export type NoteType = 'don' | 'ka';

export interface ChartNote {
  t: number;          // hit time in seconds
  type: NoteType;
  sausage: string;    // sausage type id
}

export interface RhythmChart {
  audioFile: string;
  duration: number;
  tempo: number;
  totalNotes: number;
  sections: { label: string; t_start: number; t_end: number }[];
  notes: ChartNote[];
}

export async function loadChart(url: string): Promise<RhythmChart> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load chart: ${url}`);
  return res.json();
}
```

#### `src/objects/RhythmNote.ts`

香腸形狀的飛行音符 GameObject：

```ts
import Phaser from 'phaser';
import type { ChartNote } from '../data/chart';

export class RhythmNote extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number, public note: ChartNote) {
    super(scene, x, y);
    // Body: circle 半徑 28，顏色依 type（don 紅 0xff3344 / ka 藍 0x3388ff）
    // 中央放 sausage 對應的 emoji 或縮圖
    // 邊框：白色描邊
    scene.add.existing(this);
  }

  // 讓 RhythmEngine 控制位置：t 對應 x 線性插值
  setPositionByTime(currentTime: number, hitTime: number, hitX: number, spawnX: number, leadTime: number): void {
    const ratio = (currentTime - (hitTime - leadTime)) / leadTime;
    this.x = spawnX + (hitX - spawnX) * ratio;
  }
}
```

### 修改檔案

#### `src/scenes/BootScene.ts`

在 preload 時 fetch 譜面 JSON（用 fetch 即可，Phaser 不必透過 loader）：

```ts
// preload 既有結尾加：
this.load.json('chart-grill-theme', '/sausage-conquest/chart-grill-theme.json');
```

注意 vite base path：`/sausage-conquest/` 已在 `vite.config.ts`。

#### `src/scenes/GrillScene.ts`

新增 state：

```ts
private chart: RhythmChart | null = null;
private rhythmNotes: RhythmNote[] = [];
private rhythmStartTime = 0;       // performance.now() at scene start
private nextNoteSpawnIdx = 0;       // pointer into chart.notes
private readonly NOTE_LEAD_TIME = 1.8; // seconds before hit for note to be visible
private readonly NOTE_SPAWN_X = 1100;   // right edge
private readonly NOTE_HIT_X = 280;      // judgement circle x
private readonly NOTE_TRACK_Y = 580;    // y of the rhythm track
```

`create()` 中：

```ts
this.chart = this.cache.json.get('chart-grill-theme') as RhythmChart;
this.rhythmStartTime = performance.now() / 1000;
this.nextNoteSpawnIdx = 0;
this.rhythmNotes = [];

// 畫一條軌道線（debug 用）
this.add.line(0, this.NOTE_TRACK_Y, 0, 0, 1280, 0, 0x444444, 0.5).setOrigin(0, 0);
// 畫判定圈
this.add.circle(this.NOTE_HIT_X, this.NOTE_TRACK_Y, 36, 0x000000, 0).setStrokeStyle(3, 0xffffff, 0.8);
```

`update()` 中加譜面 tick：

```ts
private updateRhythmTrack(): void {
  if (!this.chart) return;
  const now = performance.now() / 1000 - this.rhythmStartTime;

  // Spawn new notes
  while (this.nextNoteSpawnIdx < this.chart.notes.length) {
    const next = this.chart.notes[this.nextNoteSpawnIdx];
    if (next.t - now > this.NOTE_LEAD_TIME) break;
    const sprite = new RhythmNote(this, this.NOTE_SPAWN_X, this.NOTE_TRACK_Y, next);
    this.rhythmNotes.push(sprite);
    this.nextNoteSpawnIdx++;
  }

  // Move existing notes; remove off-screen
  for (let i = this.rhythmNotes.length - 1; i >= 0; i--) {
    const n = this.rhythmNotes[i];
    n.setPositionByTime(now, n.note.t, this.NOTE_HIT_X, this.NOTE_SPAWN_X, this.NOTE_LEAD_TIME);
    if (n.x < this.NOTE_HIT_X - 100) {
      n.destroy();
      this.rhythmNotes.splice(i, 1);
    }
  }
}
```

並在既有 `update()` 末尾呼叫 `this.updateRhythmTrack()`。

### 不做（這波）

- 鍵盤輸入 / 判定 / 浮字（6b）
- 砍既有手動互動按鈕（6c）
- BGM 同步（6d）

### 驗證

1. `npx tsc --noEmit` 通過
2. `npm run build` 通過
3. `npm run dev` 進 GrillScene，肉眼看到香腸形狀的音符從右邊飛到左邊判定圈，跟著 chart.json 的時間表流動（沒 BGM，譜面用 `performance.now()` 當時間軸暫時驅動）
4. 既有手動翻面 / 按壓 / 刷油**仍可運作**（這波不砍）

### Commit

```
feat: Wave 6a — 太鼓達人譜面載入 + Note 飛行視覺

- 新增 src/data/chart.ts：RhythmChart 型別與 loadChart helper
- 新增 src/objects/RhythmNote.ts：香腸形狀飛行音符
- BootScene 預載 chart-grill-theme.json
- GrillScene 新增節奏軌道與判定圈視覺
- 香腸音符依譜面時間從右飛到左判定圈
- 譜面時間源暫用 performance.now()，BGM 同步留 Wave 6d
```

---

## Wave 6b — don/ka 輸入 + 命中判定 + 浮字 + 太鼓音效

### 目標

玩家可以按 `F`/`J`（don）和 `D`/`K`（ka）打中飛行音符，命中時浮出 PERFECT / GREAT / GOOD / MISS 文字、播太鼓音效、累積 combo 數字。命中音符目前**先消失**（落網是 6c 的事）。

### 新增 `src/utils/SoundFX.ts` 方法（依設計總綱列表）

`playDon` / `playKa` / `playRhythmPerfect` / `playRhythmGreat` / `playRhythmGood` / `playRhythmMiss`。

關鍵範例（playDon）：
```ts
playDon(): void {
  const ctx = this.ensureContext();
  const now = ctx.currentTime;
  // 低頻 sine 短脈衝
  this.playToneAt(ctx, now, 100, 'sine', 0.5, 0.08);
  // 中頻噪音瞬擊（仿鼓皮）
  this.playNoiseAt(ctx, now, 0.04, 800, 'bandpass', 0.3);
}
```

playKa 用 1200Hz bandpass 噪音、playRhythm* 系列依設計總綱頻率。

### 修改 `src/systems/RhythmEngine.ts`（新檔）

```ts
export type HitJudgement = 'perfect' | 'great' | 'good' | 'miss';

export const JUDGE_WINDOWS = {
  perfect: 0.05,  // ±50ms
  great:   0.10,  // ±100ms
  good:    0.15,  // ±150ms
} as const;

export function judgeHit(noteTime: number, pressTime: number): HitJudgement | null {
  const delta = Math.abs(noteTime - pressTime);
  if (delta <= JUDGE_WINDOWS.perfect) return 'perfect';
  if (delta <= JUDGE_WINDOWS.great)   return 'great';
  if (delta <= JUDGE_WINDOWS.good)    return 'good';
  return null;  // outside hit window — caller decides if MISS
}
```

### 修改 `src/scenes/GrillScene.ts`

1. 新增 state：
```ts
private rhythmCombo = 0;
private maxRhythmCombo = 0;
private hitStats = { perfect: 0, great: 0, good: 0, miss: 0 };
private rhythmComboText: Phaser.GameObjects.Text | null = null;
```

2. 鍵盤監聽（`create()` 加）：
```ts
this.input.keyboard?.on('keydown-F', () => this.handleRhythmPress('don'));
this.input.keyboard?.on('keydown-J', () => this.handleRhythmPress('don'));
this.input.keyboard?.on('keydown-D', () => this.handleRhythmPress('ka'));
this.input.keyboard?.on('keydown-K', () => this.handleRhythmPress('ka'));
```

3. 觸控按鍵（畫面下方放兩顆大鈕，Don 紅 / Ka 藍）：
- 螢幕左下：紅圓 → don
- 螢幕右下：藍圓 → ka

4. `handleRhythmPress(type)` 邏輯：
- 找最近未命中且 type 相符的 note（時間差最小）
- 用 `judgeHit(note.t, currentTime)` 判定
- 命中 → 浮字 PERFECT/GREAT/GOOD、play 對應音效、combo +1、stats +1、note 從 list 移除
- type 對但時機外 → 浮字 MISS、play playRhythmMiss、combo 歸零、stats.miss +1
- type 不對 → 完全不算（玩家按錯鍵不扣分，避免懲罰錯誤）

5. 譜面 tick 加「過判定圈未命中」檢查：
- 若 note.t 比 currentTime 早 0.15 秒以上仍未命中 → 自動 MISS（combo 斷、stats.miss +1）

6. 連擊文字（左上角，初始隱藏）：
```ts
this.rhythmComboText = this.add.text(60, 100, '', {
  fontSize: '32px',
  fontFamily: FONT,
  color: '#ffffff',
  stroke: '#000000',
  strokeThickness: 4,
}).setDepth(200).setAlpha(0);
```

`handleRhythmPress` 內呼叫 `this.updateRhythmComboText()` 更新顯示與彈跳。

### 不做（這波）

- 命中後音符落到烤網（6c）
- BGM 整合（6d）
- Combo 50 / 100 大字、圍觀反應（6e）

### 驗證

1. tsc / build 通過
2. dev：按 F/J/D/K 能打中音符、命中文字浮現、太鼓音效會響
3. 連擊數字會跳、斷 combo 歸零
4. console 無 spam

### Commit

```
feat: Wave 6b — don/ka 雙鍵輸入 + 命中判定 + 太鼓音效

- 新增 src/systems/RhythmEngine.ts：HitJudgement / JUDGE_WINDOWS / judgeHit
- SoundFX 新增 playDon/playKa/playRhythmPerfect/Great/Good/Miss
- GrillScene 鍵盤監聽 F/J=don D/K=ka
- 命中浮字 PERFECT/GREAT/GOOD/MISS、combo 數字
- 過判定圈未命中自動 MISS、combo 歸零
- 命中音符暫時消失（落網落網由 Wave 6c 接手）
```

---

## Wave 6c — 香腸落網 + 自動烤 + 砍手動互動

### 目標

命中音符不再消失，而是**飛入下方烤網**的下一個空位、帶著精準度標籤；系統自動烤熟自動出餐。同時砍掉手動翻面 / 按壓 / 刷油按鈕。

### 修改 `src/systems/GrillEngine.ts`

`GrillingSausage` 加欄位：

```ts
export interface GrillingSausage {
  // ...existing
  rhythmAccuracy?: 'perfect' | 'great' | 'good';  // Wave 6c: precision tag from rhythm hit
}
```

新增 `getAutoGrillTarget(accuracy)`：

```ts
export function getAutoGrillTarget(accuracy: 'perfect' | 'great' | 'good'): number {
  switch (accuracy) {
    case 'perfect': return 80;
    case 'great':   return 72;
    case 'good':    return 60;
  }
}
```

新增 `autoTickSausage(s, deltaSec)`：

```ts
export function autoTickSausage(s: GrillingSausage, deltaSec: number): GrillingSausage {
  if (s.served || !s.rhythmAccuracy) return s;
  const target = getAutoGrillTarget(s.rhythmAccuracy);
  const currentAvg = (s.topDoneness + s.bottomDoneness) / 2;

  // 已達目標 → 不繼續加熱（避免烤焦）
  if (currentAvg >= target - 1) return s;

  // 系統自動加熱速度：比手動 medium 快 1.5 倍
  const rate = 18 * deltaSec;
  const isFlipping = Math.floor(Date.now() / 1000) % 4 < 2;  // 每 2 秒翻一次

  if (isFlipping) {
    return { ...s, currentSide: 'top', topDoneness: Math.min(target, s.topDoneness + rate) };
  }
  return { ...s, currentSide: 'bottom', bottomDoneness: Math.min(target, s.bottomDoneness + rate) };
}
```

### 修改 `src/scenes/GrillScene.ts`

1. 命中時不再 destroy note，改成飛行 tween 進烤網：
```ts
// In handleRhythmPress, after judging hit:
const slot = this.getNextEmptyGrillSlot();
if (!slot) {
  // 烤網滿 → 視為 MISS（不擠舊的）
  // ...
  return;
}
// 把 note 飛進 slot
this.tweens.add({
  targets: noteObj,
  x: slot.x, y: slot.y,
  scaleX: 0.6, scaleY: 0.6,
  duration: 250,
  ease: 'Power2',
  onComplete: () => {
    noteObj.destroy();
    // 在 slot 上 spawn 真正的 GrillingSausage（帶 rhythmAccuracy 標籤）
    this.spawnSausageOnSlot(slot, noteObj.note.sausage, judgement);
  },
});
```

2. `spawnSausageOnSlot(slot, sausageId, accuracy)` 用既有的 `createGrillingSausage` + 加上 `rhythmAccuracy`。

3. update tick 改用 `autoTickSausage` 取代 `updateSausage`（針對有 rhythmAccuracy 的香腸）。手動互動的 sausage 不應該再產生（命中才有香腸），但保留向下兼容。

4. **砍掉**手動互動 zone：
   - 移除 flipZone, pressZone, oilZone 的建立與 pointerdown 監聽
   - 移除按壓持續 tick（`__isPressingBtn`）
   - 移除翻面 cooldown 提示文字
   - 對應 button background sprite / icon 也移除

5. **砍掉**蒜頭調味 toggle：
   - 移除 condimentOverlay / appliedGarlic toggle UI
   - `appliedGarlic` 變數固定 `true`（讓客人訂單評分過關）

### 修改 `src/systems/OrderEngine.ts`

`scoreOrder` 既有邏輯保留。客人訂單評分仍依照熟度、調味、耐心比例、loyaltyBadge 計算。系統自動加蒜後 condimentScore 永遠 100。

### 自動出餐

新增 GrillScene 方法 `autoServeReady()`，每 tick 檢查每個 slot：
- 香腸 doneness 達 perfect 區間（getAutoGrillTarget +/- 5）→ 找最前方等待客人匹配種類 → 自動 serve（呼叫既有的 serve flow）
- 沒有匹配客人 → 等到燒焦或客人換種類（既有 logic 處理）

### 驗證

1. tsc / build 通過
2. dev：
   - 命中音符 → 飛進烤網 → 系統自動烤熟 → 自動出餐
   - 烤網滿 5 顆時新音符直接 MISS
   - 手動翻面 / 按壓 / 刷油按鈕**完全消失**
   - 蒜頭按鈕消失
3. 客人正常排隊、出餐、離開

### Commit

```
feat: Wave 6c — 香腸落網 + 自動烤 + 砍手動互動

- GrillingSausage 新增 rhythmAccuracy 欄位
- GrillEngine 新增 getAutoGrillTarget / autoTickSausage
- 命中音符飛進烤網下一個空位、帶精準度標籤
- 系統依 rhythmAccuracy 自動烤到目標熟度（80/72/60）
- 系統達 perfect 區間後自動匹配客人出餐
- 砍 flipZone / pressZone / oilZone 三個互動 zone
- 砍蒜頭調味 toggle（appliedGarlic 固定 true）
```

---

## Wave 6d — BGM 整合 + 暫停機制 + 譜面結束結算

### 目標

BGM 跟譜面同步、奧客事件可暫停、譜面結束 = 場景結束 → 結算頁。

### 修改 `src/scenes/BootScene.ts`

```ts
this.load.audio('bgm-grill-theme', '/sausage-conquest/bgm-grill-theme.mp3');
```

### 修改 `src/scenes/GrillScene.ts`

1. 移除既有 `bgm-grill.mp3` 的播放（原本是循環 BGM）
2. `create()` 載入新 BGM：
```ts
this.bgm = this.sound.add('bgm-grill-theme', { volume: 0.5, loop: false });
this.bgm.once('complete', () => this.onChartComplete());
this.bgm.play();
this.rhythmStartTime = 0;  // 將以 this.bgm.seek 取代 performance.now()
```

3. 譜面時間源改用 BGM：
```ts
private getRhythmTime(): number {
  return this.bgm?.seek ?? 0;
}
```
所有 `performance.now() / 1000 - this.rhythmStartTime` 改用 `this.getRhythmTime()`。

4. 砍 `GAME_DURATION` 常數與 `tier-based` 時長計算。
5. 砍 END_DAY 按鈕。
6. 加 `onChartComplete()`：
```ts
private onChartComplete(): void {
  // 等所有烤網清空（最多再等 10 秒）後切結算 scene
  // ...
  this.scene.start('SummaryScene', { hitStats: this.hitStats, maxCombo: this.maxRhythmCombo, ... });
}
```

7. 暫停機制：
```ts
private pauseRhythm(): void {
  this.bgm?.pause();
  this.rhythmPaused = true;
}
private resumeRhythm(): void {
  this.bgm?.resume();
  this.rhythmPaused = false;
}
```

奧客事件 / 既有 EventScene 觸發前呼叫 `pauseRhythm`，回 GrillScene 後 `resumeRhythm`。
找 `isShowingGrillEvent` 設定點接線。

8. update tick 開頭：若 `rhythmPaused` → return。

### 修改 `src/scenes/EventScene.ts`

EventScene 結束回 GrillScene 時要喚起 GrillScene 的 `resumeRhythm`。可用 scene events 或 GrillScene 監聽 `resume` 事件。

### 砍既有 BGM

`bgm-grill.mp3` 留在檔案系統供舊 save 兼容（不刪檔），但 GrillScene 不再播放。

### 驗證

1. tsc / build
2. dev：
   - 進 GrillScene → 主題曲開始播
   - BGM 結束 → 譜面結束 → 自動切到結算
   - 奧客事件觸發時 BGM 暫停、Note 凍結
   - 事件結束 BGM 從同位置繼續
3. END_DAY 按鈕已不存在

### Commit

```
feat: Wave 6d — BGM 整合 + 暫停機制 + 譜面結束自動結算

- BootScene 預載 bgm-grill-theme.mp3
- GrillScene 譜面時間軸綁定 bgm.seek
- BGM complete 觸發場景結束、進結算頁
- 奧客事件 / EventScene 觸發時 BGM 暫停、Note 凍結
- 事件結束自動 resume
- 砍 GAME_DURATION / tier-based 時長 / END_DAY 按鈕
```

---

## Wave 6e — Combo 大字 + 里程碑 + 圍觀反應 + 結算頁

### 目標

太鼓達人式的視聽強化，讓打擊有爽感。

### 修改 `src/scenes/GrillScene.ts`

1. **Combo 大字**：
   - 50 連擊 → 螢幕中央浮「50 COMBO!」金色大字 + 螢幕邊緣金光閃爍 + `playRhythmCombo50()`
   - 100 連擊 → 紫色大字 + shimmer + `playRhythmCombo100()` + 全場圍觀客人浮愛心
   - 150+ 每 50 一次

2. **圍觀反應**（接 Wave 4c 的 SpectatorCrowd）：
   - PERFECT 命中 → 圍觀客人浮 `◎`（縮放脈動 1 次）
   - MISS → 圍觀客人皺眉 `…`
   - 50/100 連擊 → spectatorCrowd.celebrateCombo(combo)

3. **判定圈視覺強化**：
   - 命中時判定圈擴散光環（向外圓擴散 0.2s 淡出）
   - 顏色依 judgement：PERFECT 金、GREAT 銀、GOOD 銅、MISS 紅

### 修改 `src/scenes/SummaryScene.ts`

接收 `{ hitStats, maxCombo, totalNotes }`，顯示：
- PERFECT / GREAT / GOOD / MISS 各自數量與百分比
- 最高 combo
- 總精準度 = (perfect×1 + great×0.7 + good×0.3) / totalNotes
- 評級：S（>95%）/ A（>85%）/ B（>70%）/ C（其他）

### 微調

實際試玩後可能需要調的：
- NOTE_LEAD_TIME（音符飛行時間）
- 判定窗口寬度（±50 / ±100 / ±150 ms）
- 系統自動烤速率
- 烤網接住動畫時間

這些以 tune commit 處理。

### 驗證

1. tsc / build
2. dev 整體試玩：能跑完一整首歌
3. 50/100 連擊大字、太鼓風格 milestone 音
4. 圍觀客人有反應
5. 結算頁顯示完整統計

### Commit

```
feat: Wave 6e — Combo 大字 + 50/100 里程碑 + 圍觀反應 + 結算頁

- 50/100 連擊金紫色大字、邊緣光暈、太鼓音效
- 判定圈命中擴散光環（金/銀/銅/紅）
- SpectatorCrowd 接 PERFECT/MISS/Combo 反應
- SummaryScene 顯示 hit stats + 評級 S/A/B/C
```

---

## 風險與回滾

| 風險 | 可能發生點 | 緩解 |
|------|-----------|------|
| BGM seek 與 Phaser 音訊系統不準 | Wave 6d | 改用 Web Audio API `audio.currentTime` 直接讀取 |
| 譜面音符密度太高玩家跟不上 | Wave 6e 試玩 | 調 NOTE_LEAD_TIME、減 chart 密度（重新跑 generate_chart.py） |
| 系統自動出餐與客人耐心對不上 | Wave 6c | 自動烤速 18/sec 可調（HEAT_RATES.high 是 22） |
| Phaser 音訊在 mobile Safari 無法 autoplay | Wave 6d | GrillScene 加「點擊開始」遮罩，需要使用者點擊一次才播 BGM |
| Sonnet 改 GrillScene 時破壞既有客人 / 戰鬥流程 | 全部 wave | 每 wave 獨立 commit，可單獨 revert |

---

## 啟動順序

```
Wave 6a → Opus review → Wave 6b → review → Wave 6c → review
       → Wave 6d → review → Wave 6e → 整體驗收
```

每波 Sonnet 開工前：
1. 讀本計畫對應 wave 章節
2. 讀相關檔案的對應行
3. 實作
4. `npx tsc --noEmit` 通過
5. `git add` 精準暫存
6. `git commit` 用指定訊息

**卡關 3 次上限**：同 wave 失敗 3 次 → Sonnet 停手回報 Opus 重新規劃。

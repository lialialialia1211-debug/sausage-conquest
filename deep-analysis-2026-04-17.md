# 深度解析建議 — 腸征天下

> 分析時間：2026-04-17
> 分析者：Claude Opus 4.7（架構審查）
> 分析範圍：master @ commit `5 Phase 12 Task 完成` 後狀態
> 目的：提供後續開發優先順序的參考

---

## 一、健康度總評

| 面向 | 評分 | 說明 |
|------|------|------|
| 功能完成度 | A | 12 個遊戲系統全部運作，30 天流程完整 |
| 上線穩定度 | A | CI/CD 順暢，近 5 次部署全綠燈，無生產事故 |
| 遊戲設計深度 | A- | 系統之間有漣漪效應，不是疊加玩法 |
| 程式碼結構 | C+ | 功能塞得下但開始變形，有結構性隱患 |
| 型別安全 | C | 嚴格 TS 被 `as any` 打穿 40 次 |
| 狀態管理 | D+ | 單體全域物件 + 40 個欄位 + 383 處直接引用 |
| 維護成本 | 高風險 | 再加 2 個系統會觸發全面重構 |

### 關鍵指標

- 總 LOC：20,107 行 TypeScript（60 個檔案）
- 單檔最大：`GrillScene.ts` 4,026 行（佔全部 20%）
- 次大檔：`BattleScene.ts` 1,652 行、`ShopPanel.ts` 1,646 行
- `as any` 使用：46 次（其中 40 次集中在 GrillScene）
- 全域狀態直接引用：383 次，散布於 33 個檔案
- TODO / FIXME：0（良好或未記錄）
- console.log：5（低噪音）

---

## 二、三個必須知道的結構性風險

### 風險 1：GrillScene 是「儲藏室炸開的房間」

**現況**
4,026 行單檔塞了八種職責：
1. 烤肉核心邏輯
2. 客人處理與訂單
3. 打工仔 AI
4. 黑市道具使用
5. 烤制事件（騷擾）
6. 特殊香腸特效
7. 員工動作
8. 畫面繪製與粒子

**影響**
改任何一個小功能都要在 4,000 行裡面爬，改錯機率隨檔案長度呈指數成長。若有合作者加入，預估要看兩天才敢動它。

**生活化比喻**
像一個夜市攤位老闆把「烤肉、收錢、招呼客人、記帳、進貨、搞公關」全部同時一個人做 —— 你能做，但今天感冒就整攤停擺。

---

### 風險 2：gameState 是「全家共用的記事本」

**現況**
- 單一全域物件 `gameState`，40+ 欄位
- 被 33 個檔案直接寫入共 **383 次**
- 沒有快照（save/load 功能不存在）
- 沒有 undo、沒有重置機制 —— 開新局只能重新整理網頁
- `GameState.ts` 註解寫「Always create new objects rather than mutating」但 `Object.assign(gameState, updates)` 本質是 mutation

**影響**
- 哪天要加「存檔」「讀檔」「賽季重置」，要跑遍 33 個檔案修改
- 發生 state 不一致 bug 時（Codex 已經抓到兩次），無法追查誰寫壞的

**生活化比喻**
整家公司所有人共用同一本 Google Doc 記帳，誰都能改，沒有版本紀錄。

---

### 風險 3：40 處 `as any` 是「剪掉的安全帶」

**現況**
- 46 處 `as any` 中 40 處集中在 GrillScene
- 常見 hack 如 `(slot as any).__flipPromptShown` 直接往物件上塞屬性
- 繞過了 TypeScript 的型別檢查

**影響**
這些地方 TS 的保護失效，未來重構時會出現不可預期的 runtime 錯誤。

**生活化比喻**
餐廳裝了防油煙系統但嫌麻煩，在最油那區把風管拆了。

---

## 三、值得被肯定的亮點

### 1. 設計層取捨明確（task_plan.md 決策表）
- 不重寫戰鬥系統、不新增香腸種類、Phase 1 優先
- 每條決策都寫了「為什麼」，這是大多數工程師不會養成的習慣

### 2. 審查制度內建
- Codex 對抗審查跑了兩輪，每輪都有 findings.md 紀錄
- 第二輪抓到 day30 結局崩潰 + 社交準備時序錯誤 —— 證明審查機制有效

### 3. 類型定義乾淨（types.ts 352 行）
- 12 個介面、7 種個性、6 種戰鬥動作，語意化命名清楚
- 問題只在於型別被定義了但沒有在狀態層強制執行

### 4. 資料驅動設計
- `src/data/` 下獨立檔案：activities、events、opponents、sausages、condiments、grill-events、map、deliveries
- 加內容不需要改邏輯，這個地基打得好

### 5. Phaser + HTML Overlay 雙軌 UI
- 戰鬥／烤制用 Phaser canvas（動態）
- 商店／狀態用 HTML panel（表單）
- 選擇正確，各司其職

---

## 四、建議下一步（按 ROI 排序）

### 高 ROI — 優先處理

#### 任務 A：消滅所有 `as any`
- **做法**：在 `GrillSlot` / `WarmingSlot` interface 加上可選欄位，如 `__flipPromptShown?: boolean`
- **預估**：2 小時
- **回報**：型別安全立刻回來，重構時不會踩雷
- **風險**：無

#### 任務 B：把 GrillScene 拆成 4~5 個 Manager class

建議拆分方式：

```
GrillScene（主控，剩 500~800 行）
├── GrillCookingManager    — 烤制核心、火候、翻面
├── CustomerServiceManager — 客人、訂單、忠誠度、佇列
├── GrillEventManager      — 騷擾事件（奧客、稽查、混混）
├── WorkerManager          — 員工 AI（adi、mei、wangcai）
└── SpecialEffectManager   — 特殊香腸的戲劇化特效
```

- **預估**：1~2 天
- **回報**：永久。每個檔案 300~500 行，未來改動只動相關檔案
- **風險**：低（有測試基準）

---

### 中 ROI — 下個版本前處理

#### 任務 C：把 gameState 包成 class + 加 snapshot

- **做法**：
  1. 封裝為 `GameStateManager` class
  2. 入口收束成 `gameStateManager.set(patch)` 方法
  3. 禁止直接 `gameState.xxx = ...`
  4. 每回合自動存檔到 localStorage
  5. 開始畫面加「繼續遊戲」按鈕
- **預估**：半天～1 天
- **回報**：解鎖「存檔」「新局」「回放 bug 現場」三個能力
- **風險**：中（要改 33 個檔案的 import）

---

### 低 ROI — 可等等

#### 任務 D：repo 補 README
- 目前 repo 是 public 但沒 README
- 外人看不懂專案在幹嘛
- 建議加上：遊戲簡介、線上試玩連結（GitHub Pages）、控制說明、開發狀態

#### 任務 E：對 BattleScene 和 ShopPanel 做拆分
- 比 GrillScene 輕微，但同樣有肥大傾向
- 可以等下個大版本一起處理

---

## 五、下一個大版本可以思考的方向

目前系統密度已高，未來方向取決於**你想要什麼類型的玩家留下來**：

### 方向 1：Roguelike 深度路線
- 30 天一輪，輪與輪之間繼承技能樹
- 每輪出現新事件/對手/機制
- 玩家動機：挑戰、Build 探索
- 適合：核心玩家、Steam Early Access 路線

### 方向 2：多城市廣度路線
- 征服完夜市後開放下一個城市
- 每個城市不同對手、規則、事件池
- 玩家動機：收集、地圖探索
- 適合：休閒玩家、手機移植

### 方向 3：社交派系路線
- 聲望系統擴充成 NPC 派系
- 結盟、背叛、長期關係
- 玩家動機：敘事、角色互動
- 適合：視覺小說玩家、女性向市場

### 方向 4：商業化路線
- 目前版本已經夠一款 **賣斷制台幣 150~250** 的水準
- 或免費 + 角色/皮膚 DLC
- 重點：先做好 README、存檔、成就系統、Steam 頁面

---

## 六、一句話總結

> 這是一個被低估的單人 solo dev 成就。系統設計層面已經有商業產品水準；程式碼層面有 10 天的技術債要還，但沒有一個是致命的。還完債之後可以直接談上架。

---

## 附錄 A：檔案大小 TOP 10

| 排名 | 檔案 | LOC | 狀態 |
|------|------|-----|------|
| 1 | `src/scenes/GrillScene.ts` | 4,026 | 緊急需拆 |
| 2 | `src/scenes/BattleScene.ts` | 1,652 | 需觀察 |
| 3 | `src/ui/panels/ShopPanel.ts` | 1,646 | 需觀察 |
| 4 | `src/objects/SausageSprite.ts` | 653 | 可接受 |
| 5 | `src/systems/AutoChessEngine.ts` | 591 | 可接受 |
| 6 | `src/ui/panels/SausageBoxPanel.ts` | 546 | 可接受 |
| 7 | `src/ui/panels/SummaryPanel.ts` | 529 | 可接受 |
| 8 | `src/ui/panels/CasinoPanel.ts` | 525 | 可接受 |
| 9 | `src/utils/SoundFX.ts` | 499 | 正常 |
| 10 | `src/scenes/BootScene.ts` | 474 | 正常 |

## 附錄 B：gameState 欄位清單（40+）

分類整理以利未來重構：

**核心資源**（4）
- `day`, `money`, `reputation`, `phase`

**攤位與地圖**（3）
- `playerSlot`, `map`, `selectedSlot`

**庫存與價格**（3）
- `inventory`, `prices`, `upgrades`

**日誌與統計**（6）
- `stats`, `dailySalesLog`, `dailyGrillStats`, `dailyOrderScores`, `dailyWaste`, `dailyExpenses`

**烤制運行時**（3）
- `warmingZone`, `dailyPerfectCount`, `unlockedSausages`

**AI 對手**（2）
- `activeOpponents`, `defeatedOpponents`

**每日效果**（3）
- `dailyTrafficBonus`, `skipDay`, `workerSalaryPaid`

**員工系統**（2）
- `hiredWorkers`, `marketingPurchases`

**事件冷卻**（1）
- `grillEventCooldowns`

**地下經濟**（6）
- `undergroundRep`, `chaosCount`, `dailyChaosActions`, `hasBodyguard`, `bodyguardDaysLeft`, `reputationCrisisDay`

**黑市**（2）
- `blackMarketUnlocked`, `blackMarketStock`

**管理費**（1）
- `managementFee`（含 6 個子欄位）

**客人系統**（1）
- `customerLoyalty`

**戰鬥加成**（1）
- `battleBonus`

**金融系統**（3）
- `loans`, `playerLoans`, `hui`（含 11 個子欄位）

**其他**（3）
- `gameMode`, `economyHintsShown`, `morningPrep`

→ 合計頂層欄位 41 個，含巢狀約 60+ 個可變欄位

建議重構時按上述分類拆成多個子 store，例如：
- `ResourceStore`（錢、聲望、天數）
- `InventoryStore`（香腸、道具、升級）
- `RuntimeStore`（每日暫存）
- `EconomyStore`（借貸、互助會、黑市、管理費）
- `ReputationStore`（聲望、地下聲望、派系）
- `StatsStore`（累計統計、成就）

---

*分析報告結束。任何一項任務需要動手執行請告知。*

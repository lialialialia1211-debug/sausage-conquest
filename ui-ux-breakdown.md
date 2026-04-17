# 腸征天下 — UI/UX 完整節點拆解

> 建立時間：2026-04-17
> 用途：合作開發分工、美術素材清單、Game Jam 製作規劃
> 狀態：現役版本（master）的完整盤點

---

## 閱讀方式

每個節點包含五個欄位：
- **位置**：程式碼路徑
- **玩家動作**：使用者會看到／點到什麼
- **素材需求**：需要的圖／按鈕／動畫
- **音效需求**：需要的聲音
- **現狀**：已完成／待補／可優化

素材表示：
- ✔ 已有（在 `public/` 底下）
- ✘ 缺少
- △ 有但可重做

---

## 第 0 章：全域元件（所有場景共用）

### 0.1 StatusBar 上方狀態列
- **位置**：`src/ui/panels/StatusBar.ts` (181 行)
- **玩家動作**：永遠顯示，不可互動
- **顯示項目**：
  1. 第 N 天
  2. 金錢 $X,XXX
  3. 聲望 XX/100
  4. 地下聲望 XX（若 > 0）
  5. 混亂值 XX（若 > 0）
  6. 當前攤位 tier
  7. 貸款警示（若有未還）
- **素材需求**：
  - ✔ `hud-day.png`（天數底圖）
  - ✔ `hud-money.png`（金錢底圖）
  - ✘ 聲望條圖示（0-100 漸層）
  - ✘ 地下聲望圖示（暗色調）
  - ✘ 混亂值圖示（火焰／警告）
  - ✘ 貸款警示閃爍圖示
- **音效**：錢增加時的叮噹聲、聲望下降時的低沉音
- **現狀**：程式邏輯完成，視覺可大幅升級

### 0.2 UIManager HTML overlay 容器
- **位置**：`src/ui/UIManager.ts`
- **玩家動作**：所有 HTML 面板都透過此掛載
- **素材需求**：無（純邏輯層）

### 0.3 EventBus 場景切換動畫
- **位置**：`src/scenes/*` 各自的 `fadeIn/fadeOut`
- **玩家動作**：場景切換時黑屏淡入淡出
- **素材需求**：✘ 可考慮加入場景專屬轉場動畫（油煙、煙火、烤夾飛過）

---

## 第 1 章：開場流程（BootScene + Prologue）

### 1.1 啟動畫面（載入）
- **位置**：`src/scenes/BootScene.ts` (474 行)
- **玩家動作**：遊戲載入素材時看到
- **素材需求**：
  - ✔ `cover.png`（封面）
  - ✔ `key-visual.png`（主視覺）
  - ✘ 載入進度條
  - ✘ Logo 動畫（香腸在轉／煙在飄）
- **音效**：✘ 開場主題曲（8-bit 台式風格）
- **現狀**：有靜態封面，缺動效

### 1.2 序章三張劇情圖
- **位置**：`src/data/dialogue.ts`（需檢視）
- **素材需求**：
  - ✔ `story-prologue-1.png`
  - ✔ `story-prologue-2.png`
  - ✔ `story-prologue-3.png`
- **UI 按鈕**：✘「下一頁」按鈕、✘「跳過」按鈕、✘「回上一頁」按鈕
- **音效**：✘ 翻頁音、✘ 序章旁白音樂
- **現狀**：圖已有，需 UI 元件

### 1.3 章節里程碑劇情圖（每 5 天一張）
- **位置**：`src/scenes/SummaryScene.ts`
- **素材需求**：
  - ✔ `story-day5.png`
  - ✔ `story-day10.png`
  - ✔ `story-day15.png`
  - ✔ `story-day20.png`
  - ✔ `story-day25.png`
  - ✘ `story-day30.png`（結局）— **未有！**
- **音效**：✘ 里程碑達成音效、✘ 章節主題變奏

---

## 第 2 章：早晨場景（Morning）

### 2.1 MorningPanel 早晨準備面板
- **位置**：`src/ui/panels/MorningPanel.ts` (460 行)
- **玩家動作**：
  1. 看到當日訊息
  2. 選擇今日準備策略（4/16 新增）：
     - 偵查：下場戰鬥 +10% 傷害
     - 練習：今日烤制完美區間 +5%
     - 社交：今日聲望增益 +1
     - 什麼都不做
  3. 決定購買香腸庫存（類型 + 數量）
  4. 點「開始營業」
- **素材需求**：
  - ✘ 早晨場景背景（清晨的夜市、捲門半開）
  - ✘ 4 個準備策略圖示卡（偵查、練習、社交、不做事）
  - ✘ 庫存選擇 UI（拖拉、滑桿或步進器）
  - ✔ 9 種香腸小圖（已全部存在於 `public/sausage-*.png`）
  - ✘「開始營業」主按鈕（大、顯眼、壓下去有烤架啟動效果）
- **UI Buttons**：
  1. 準備策略選擇（4 顆）
  2. 香腸類型切換（9 顆）
  3. 數量 + / - （每種各 2 顆）
  4. 一鍵清空庫存
  5. 「開始營業」主按鈕
  6. 「商店」跳轉
  7. 「金融」跳轉
- **音效**：✘ 早晨環境音（鳥叫、遠方市場）、✘ 按鈕點擊、✘ 庫存增減音

### 2.2 9 種香腸購買卡
- **資料**：`src/data/sausages.ts`
- **每張卡片需要**：
  1. 香腸圖（✔ 全部 9 種都有）
  2. 名稱
  3. 成本／建議售價
  4. 烤制難度星星（1-3 星）
  5. 描述
  6. 戰鬥能力數值（HP/ATK/SPD/Type）
  7. 特殊效果（若有）
- **素材清單**：
  | 香腸 ID | 圖檔 | 戰鬥類型 | 特效 |
  |---------|------|---------|------|
  | black-pig | ✔ sausage-black-pig.png | normal | 無 |
  | flying-fish-roe | ✔ sausage-flying-fish-roe.png | ranged | 無 |
  | garlic-bomb | ✔ sausage-garlic-bomb.png | aoe | 無 |
  | cheese | ✔ sausage-cheese.png | tank | 爆漿特寫 |
  | squidink | ✔ sausage-squidink.png | assassin | 破暗回饋 |
  | mala | ✔ sausage-mala.png | support | 無 |
  | big-taste | ✔ sausage-big-taste.png | normal | 回味無窮 |
  | big-wrap-small | ✔ sausage-big-wrap-small.png | tank | 硬硬的感覺 |
  | great-wall | ✔ sausage-great-wall.png | tank | 城牆震撼 |
- **缺失素材**：3 個特殊效果動畫（爆漿、破暗、城牆震撼）**全部缺**

---

## 第 3 章：烤香腸核心（GrillScene）★ 遊戲主體 ★

### 3.1 烤制場景背景
- **位置**：`src/scenes/GrillScene.ts` (4026 行！)
- **素材需求**：
  - ✔ `bg-grill.png`（烤架背景）
  - △ 可考慮多張夜市時段背景（黃昏／深夜）
- **音效**：✔ `bgm-grill.mp3`（BGM）、炭火燃燒聲

### 3.2 烤架區（Grill Rack）
- **玩家動作**：放香腸、翻面、取下
- **核心元素**：
  1. **烤架底圖**：✔ `grill-mesh.png`
  2. **火焰效果**：
     - ✔ `fire-flame.png`（一般火焰）
     - ✔ `fire-intense.png`（猛烈火焰）
     - ✘ 火焰粒子不同強度的更多變化
  3. **火候指示器**：
     - ✔ `grill-meter.png`（儀表板）
     - ✔ `heat-box.png`（火候控制盒）
  4. **烤架槽位**：預設 4 格，升級後 6 格
     - ✘ 空格佔位圖（虛線或淡色底）
     - ✘ 槽位 hover 高亮效果
  5. **香腸本體**（每個槽位一根）：
     - ✔ 9 種香腸靜態圖都有
     - ✘ 香腸各熟度變色（9 香腸 × 7 狀態 = **63 張缺失！**）
       - 狀態：raw → half-cooked → perfect → slightly-burnt → burnt → carbonized
     - ✘ 翻面動畫（香腸翻身中）
     - ✘ 油脂滴落粒子
- **UI Buttons**：
  1. 火候切換（低/中/高）
  2. 翻面（空白鍵 + 點擊）
  3. 取下上到保溫區
  4. 出餐按鈕（在每個槽位上方）
- **音效**：
  - ✔（無）
  - ✘ 香腸下鍋「滋～」
  - ✘ 翻面「唰」
  - ✘ 完美出餐「叮！」（金色特效配音）
  - ✘ 燒焦警告「bzzt」
  - ✘ 碳化「啪！煙聲」

### 3.3 保溫區（Warming Zone）
- **玩家動作**：從烤架取下的香腸暫存
- **素材需求**：
  - ✘ 保溫箱底圖（金屬、保溫燈黃光）
  - ✘ 隔夜標記（雪花圖示）
  - ✘ 狀態指示（perfect-warm／ok-warm／cold）3 種 icon
- **UI Buttons**：✘ 出餐按鈕（點保溫區的香腸送到客人前）

### 3.4 客人佇列（Customer Queue）
- **位置**：`src/objects/CustomerQueue.ts` (378 行)
- **玩家動作**：看客人排隊、耐心條、訂單內容
- **素材需求**：
  - ✔ `queue-bg.png`（排隊背景）
  - 客人頭像（7 種個性，目前已有）：
    - ✔ `customer-normal-male.png`
    - ✔ `customer-normal-female.png`
    - ✔ `customer-karen.png`（奧客）
    - ✔ `customer-fatcat.png`（冤大頭）
    - ✔ `customer-inspector.png`（稽查員）
    - ✔ `customer-influencer.png`（網紅）
    - ✔ `customer-beggar.png`（乞丐／路人）
    - ✔ `customer-thug.png`（流氓）
    - ✔ `customer-spy.png`？— **未在 public 看到**
    - ✘ 客人多姿態（走路、站著、吃香腸、生氣、開心、尖叫）
  - ✘ 耐心條 UI（漸變紅）
  - ✘ 訂單泡泡（顯示想吃什麼香腸 + 調味料）
  - ✔ `dialogue-box.png`（對話泡泡）
  - ✘ 忠誠徽章（bronze／silver／gold，3 個小圖）
  - ✔ `karen-alert.png`（奧客警告）
- **音效**：
  - ✘ 客人說話（不同個性不同音調）
  - ✘ 耐心見底的警告音
  - ✘ 客人離開（腳步聲 + 嘆氣）

### 3.5 訂單與評分系統
- **位置**：`src/systems/OrderEngine.ts`, `LoyaltyEngine.ts`
- **玩家動作**：看到客人要什麼、依序送上
- **評分維度**（4 向，1-100 分，最終 1-5 星）：
  1. grillScore（烤制品質）
  2. warmingScore（保溫狀態）
  3. condimentScore（調味料正確度）
  4. waitScore（剩餘耐心）
- **素材需求**：
  - ✘ 星評動畫（1-5 星金光湧現）
  - ✘ 小費飄字
  - ✘ 4 維度評分條（玩家可展開細看）
- **音效**：✘ 評分高低不同音效

### 3.6 調味料站（Condiment Station）
- **位置**：`src/data/condiments.ts` + GrillScene 內嵌
- **玩家動作**：客人要醬料時，點擊對應調味料加上
- **8 種調味料**：
  | ID | 名稱 | 圖檔 | 狀態 |
  |----|------|------|------|
  | garlic-paste | 蒜泥 | ✔ condiment-garlic-paste.png | 完成 |
  | wasabi | 芥末醬 | ✔ condiment-wasabi.png | 完成 |
  | chili-sauce | 辣椒醬 | ✔ condiment-chili-sauce.png | 完成 |
  | sauerkraut | 酸菜 | ✔ condiment-sauerkraut.png | 完成 |
  | onion-dice | 洋蔥丁 | ✔ condiment-onion-dice.png | 完成 |
  | basil | 九層塔 | ✔ condiment-basil.png | 完成 |
  | soy-paste | 醬油膏 | ✔ condiment-soy-paste.png | 完成 |
  | peanut | 花生粉 | ✔ condiment-peanut.png | 完成 |
- **UI Buttons**：8 顆調味料按鈕（可點擊／拖拉）
- **素材需求**：
  - ✔ 8 個調味料圖全部有
  - ✘ 調味料站檯面背景
  - ✘ 醬料撒上香腸的粒子效果（黑胡椒點、醬料流動）
  - ✘ 刷醬動畫
- **音效**：✘ 每種調味料有獨特音（撒芝麻 sch-sch、擠醬料 squirt）

### 3.7 特殊技能：「丟她木炭！」
- **位置**：GrillScene 能量滿時觸發
- **玩家動作**：能量條滿時出現按鈕，點下全螢幕特寫
- **素材需求**：
  - ✘ 能量條 UI（可先沿用戰鬥的能量條設計）
  - ✘「丟她木炭！」按鈕（要浮誇、紅色、脈動）
  - ✘ 全螢幕動畫：主角丟木炭 → 客人被砸 → 煙霧 → 奇效
  - ✘ 配音（可錄製短句）
- **音效**：✘ 能量蓄滿音、✘ 投擲音、✘ 客人慘叫

### 3.8 打工仔 AI（Worker Grill AI）
- **位置**：`src/systems/WorkerGrillAI.ts` (182 行)
- **玩家動作**：離開攤位時，員工接手
- **4 種員工**：
  | ID | 名稱 | 圖檔 | 狀態 |
  |----|------|------|------|
  | adi | 高中阿迪仔 | ✔ worker-adi.png | 完成 |
  | mei | 中輟學生妹 | ✔ worker-mei.png | 完成 |
  | wangcai | 旺財（狗） | ✔ worker-wangcai.png | 完成 |
  | dad | 老爸 | ✔ worker-dad.png | 完成 |
- **素材需求**：
  - ✔ 4 個角色靜態圖
  - ✘ 4 個角色在攤位上工作的動作圖
  - ✘ 阿迪仔滑手機動畫
  - ✘ 妹仔招呼客人動作
  - ✘ 旺財吠叫／趴下
  - ✘ 老爸烤香腸側面
- **音效**：✘ 各員工標誌性聲音（阿迪仔的手機通知、旺財狗吠）

### 3.9 離開攤位：7 種活動選單
- **位置**：`src/data/activities.ts` (240 行)
- **玩家動作**：員工接手後，玩家選擇去哪裡做什麼
- **7 種活動**：
  1. 招攬客人（喊話）
  2. 考察對手攤位
  3. 搗亂對手攤位
  4. 巡邏夜市
  5. 去黑市找貨
  6. 街頭表演（烤夾雜耍）
  7. 跟隔壁攤借食材
- **素材需求**：
  - ✘ 7 個活動的插畫／圖示卡
  - ✘ 每個活動的結果彈窗插圖（總共 24+ 個結果）
  - ✘ 各活動地點背景（暗巷、表演點、隔壁攤）
- **UI Buttons**：
  - 7 個活動選擇
  - 「取消離開」返回
  - 「確認」執行
- **音效**：✘ 各場景環境音（暗巷回音、街頭鼓掌）

### 3.10 烤制騷擾事件（Grill Events）
- **位置**：`src/data/grill-events.ts` (266 行)
- **玩家動作**：烤制中途突發事件彈窗
- **4 類事件**：
  1. **Karen**（奧客大嬸）
  2. **Thug**（刺青小哥／流氓）
  3. **Beggar**（乞丐）
  4. **Inspector**（食安稽查員）
- **素材需求**：
  - ✔ `customer-karen.png`（奧客）
  - ✔ `customer-thug.png`（流氓）
  - ✔ `customer-beggar.png`（乞丐）
  - ✔ `customer-inspector.png`（稽查員）
  - ✘ 4 種事件的情境插畫（比頭像更大）
  - ✘ 對話框 UI（可能沿用 `dialogue-box.png`）
- **UI Buttons**：每個事件 3 個選項按鈕
- **音效**：
  - ✘ 事件觸發警示音
  - ✘ Karen 尖叫
  - ✘ 流氓低吼
  - ✘ 稽查員哨音

### 3.11 客人反擊系統（Customer Comments）
- **位置**：`src/data/customerComments.ts`
- **玩家動作**：碳化或差評時，客人會「碎碎念」
- **素材需求**：✘ 各種反擊字泡泡（需求根據 comment 庫來設計）
- **音效**：✘ 各種客人罵人聲

---

## 第 4 章：事件場景（EventScene）

### 4.1 事件展示
- **位置**：`src/scenes/EventScene.ts` + `EventPanel.ts`
- **玩家動作**：日間某時段彈出事件選項
- **素材需求**：
  - ✔ `bg-event.png`（事件背景）
- **19 種隨機事件**：
  | 事件 ID | 類別 | 圖 | 狀態 |
  |---------|------|----|------|
  | costco-guy | customer | ✔ event-costco-guy.png | 完成 |
  | food-critic | customer | ✔ event-food-critic.png | 完成 |
  | drunk-uncle | customer | ✔ event-drunk-uncle.png | 完成 |
  | instagram-karen | customer | ✘ | **缺** |
  | kid-tantrum | customer | ✘ | **缺** |
  | protection-fee | gangster | ✔ event-thugs.png | 可共用 |
  | territory-threat | gangster | ✘ | **缺** |
  | gang-offer | underground | ✘ | **缺** |
  | management-fee-weekly | gangster | ✘ | **缺** |
  | inspector-surprise | gangster | ✔ event-inspector.png | 完成 |
  | influencer-livestream | customer | ✘ | **缺** |
  | competitor-spy | underground | ✘ | **缺** |
  | media-crisis-exposed | chaos | ✘ | **缺** |
  | employee-strike | social | ✘ | **缺** |
  | expired-ingredient-gamble | chaos | ✘ | **缺** |
  | underground-delivery | underground | ✘ | **缺** |
  | food-festival | positive | ✔ event-food-festival.png | 完成 |
  | celebrity-visit | positive | ✘ | **缺** |
  | rain-bonus | positive | ✔ event-rain.png | 完成 |
- **缺失統計**：19 個事件只有 6 張圖 → **需補 13 張事件插畫**
- **UI Buttons**：每事件 3 個選項，共 57 個選項按鈕（大多是文字即可）
- **音效**：
  - ✘ 事件觸發（不同類別不同調性）
  - ✘ 每個選項結果音

---

## 第 5 章：戰鬥場景（BattleScene）

### 5.1 戰鬥主場景
- **位置**：`src/scenes/BattleScene.ts` (1652 行)
- **玩家動作**：點擊／滑鼠左右鍵攻擊、躲避、放大招
- **素材需求**：
  - ✔ `battle-cover.png`（戰鬥開場 banner）
  - ✔ `player.png`（玩家角色）
  - ✔ `hp-bar-player.png`、✔ `hp-bar-opponent.png`
  - ✘ 戰鬥場景背景（夜市街景、聚光燈）
  - ✘ 能量條 UI
  - ✘ 冷卻時間 CD 圖示（一般攻擊、重擊、特殊技 3 個）
- **UI Buttons**：
  1. 左鍵 → 普通攻擊（烤夾戳）
  2. 右鍵 → 重擊（需要能量）
  3. 空白鍵 → 特殊技（能量滿才能放）
  4. 方向鍵 → 移動／躲避
- **音效**：
  - ✘ 戰鬥 BGM（台式 + 打鬥感）
  - ✘ 烤夾攻擊音
  - ✘ 爆擊特效音
  - ✘ 躲避瞬間音
  - ✘ 血量低警告

### 5.2 武器／技能素材
- **素材需求**：
  - ✔ `tongs.png`（烤夾）
  - ✔ `battle-attack-normal.png`（普攻特效）
  - ✔ `battle-attack-cheese.png`（起司爆漿大招）
  - ✔ `battle-attack-garlic.png`（蒜味轟炸大招）
  - ✘ 其他 7 種香腸的特殊大招特效圖（9 - 2 = **7 張缺**）
- **音效**：✘ 各香腸大招的獨特音效

### 5.3 8 個對手
- **資料**：`src/data/opponents.ts`
- **素材清單**：
  | 對手 ID | 地盤 | 圖檔 | 狀態 |
  |---------|------|------|------|
  | toilet-uncle | 廁所旁 | ✔ opponent-toilet-uncle.png | 完成 |
  | alley-gang | 暗巷口 | ✔ opponent-alley-gang.png | 完成 |
  | uncle | 水溝邊 | ✔ opponent-uncle.png | 完成 |
  | influencer | 十字路口 | ✔ opponent-influencer.png | 完成 |
  | fat-sister | 廟口前 | ✔ opponent-fat-sister.png | 完成 |
  | student | 夜市入口 | ✔ opponent-student.png | 完成 |
  | sausage-prince | 舞台旁 | ✔ opponent-sausage-prince.png | 完成 |
  | sausage-king | 夜市正中央 | ✔ opponent-sausage-king.png | 完成 |
- **每個對手需要**：
  - ✔ 靜態圖（全部 8 個都有）
  - ✘ 勝利姿勢
  - ✘ 被擊敗姿勢
  - ✘ 對話泡泡 × 4 種情境（遭遇／戰前嗆聲／勝／敗）
- **現狀**：對手基礎圖齊全，表情／動作變化全缺

### 5.4 戰鬥 UI 細節
- **CombatPanel**（BattleScene 內）:`src/ui/panels/CombatPanel.ts` (318 行)
  - ✘ HP 數字飄字
  - ✘ 傷害數字（普擊／爆擊不同顏色）
  - ✘ 閃避文字（MISS！）
  - ✘ 頭擊文字（HEADSHOT！）
- **BattlePrepPanel**：`src/ui/panels/BattlePrepPanel.ts` (356 行)
  - 戰前選擇：花錢挑戰 vs 放棄
  - ✘ 戰前準備卡片 UI
  - ✘ 費用顯示（大紅字）
  - ✘「挑戰」按鈕、「放棄」按鈕

---

## 第 6 章：晚上場景（EveningScene）

### 6.1 選攤位 / 繳房租
- **位置**：`src/scenes/EveningScene.ts` (162 行)
- **玩家動作**：戰鬥勝利後選擇移動到哪個 tier
- **素材需求**：
  - ✘ 夜晚夜市俯瞰圖（黑暗 + 燈光）
  - ✘ 9 個攤位圖示（tier 1~9）

### 6.2 MapPanel 地圖面板
- **位置**：`src/ui/panels/MapPanel.ts` (448 行)
- **素材需求**：
  - ✔ `nightmarket-map.png`（夜市地圖底）
  - ✔ `map-tile-02.png` 到 `map-tile-10.png`（9 個攤位圖塊）
  - ✘ 玩家當前位置標記（閃爍箭頭）
  - ✘ 對手佔領標記（紅色）
  - ✘ 可挑戰標記（黃色）
- **UI Buttons**：
  - 9 個攤位選擇按鈕
  - 「移動」確認按鈕
  - 「取消」返回

---

## 第 7 章：每日結算（SummaryScene）

### 7.1 當日報告
- **位置**：`src/scenes/SummaryScene.ts` (217 行) + `SummaryPanel.ts` (529 行)
- **玩家動作**：看今天賺多少、賣多少、評分等
- **顯示項目**：
  1. 當日收入／支出／淨利
  2. 賣出香腸數
  3. Perfect / OK / Burnt 統計
  4. 聲望變化
  5. 客人評分（1-5 星分佈）
  6. 廢棄量（保溫區+烤架剩餘）
  7. 成就解鎖（若有）
- **素材需求**：
  - ✘ 結算畫面背景（夜市收攤、月光）
  - ✘ 漂亮的統計圖表 UI（可以考慮簡易的長條圖）
  - ✘ 成就解鎖動畫（徽章飛入、金光）
- **UI Buttons**：
  - 「明天繼續」
  - 「看詳細統計」
  - 「回主選單」（謹慎處理存檔）
- **音效**：
  - ✘ 收攤音樂（輕快結算風）
  - ✘ 成就達成「叮～」

### 7.2 15 個成就徽章
- **資料**：`src/data/achievements.ts`
- **素材狀態**：
  | 成就 | 圖檔 | 狀態 |
  |------|------|------|
  | first_sale | ✔ badge-first_gold.png | 完成 |
  | perfect_10 | ✔ badge-grill_master.png | 完成 |
  | arsonist | ✔ badge-arsonist.png | 完成 |
  | millionaire | ✔ badge-millionaire.png | 完成 |
  | bankrupt_once | ✔ badge-bankrupt.png | 完成 |
  | loan_shark | ✔ badge-debt_king.png | 完成 |
  | debt_free | ✔ badge-debt_free.png | 完成 |
  | turf_3 | ✔ badge-small_territory.png | 完成 |
  | turf_7 | ✔ badge-half_empire.png | 完成 |
  | night_king | ✔ badge-nightmarket_king.png | 完成 |
  | survivor_10 | ✔ badge-ten_days.png | 完成 |
  | survivor_20 | ✔ badge-twenty_days.png | 完成 |
  | battle_ace | ✔ badge-undefeated.png | 完成 |
  | rich_start | ✔ badge-finance_master.png | 完成 |
  | all_types | ✔ badge-variety_collector.png | 完成 |
- **現狀**：**15/15 徽章圖全齊**

---

## 第 8 章：商店場景（ShopScene + ShopPanel）

### 8.1 商店主介面（分頁）
- **位置**：`src/ui/panels/ShopPanel.ts` (1646 行！)
- **玩家動作**：切換 tab 買升級 / 員工 / 行銷 / 金融 / 娛樂 / 黑市
- **素材需求**：
  - ✔ `bg-shop.png`（商店背景）
  - ✔ `card-frame.png`（卡片外框）
  - ✘ 6 個 tab 按鈕各自圖示（升級／員工／行銷／借貸／娛樂／黑市）
- **UI Buttons**：
  - Tab 切換 6 顆
  - 各 tab 內的物品卡片（數量視 tab 而定）

### 8.2 升級 Tab（5 種）
- **資料**：`src/data/upgrades.ts`
- **素材清單**：
  | 升級 ID | 圖檔 | 狀態 |
  |---------|------|------|
  | grill-expand | ✔ upgrade-grill-expand.png | 完成 |
  | mini-fridge | ✔ upgrade-mini-fridge.png | 完成 |
  | neon-sign | ✔ upgrade-neon-sign.png | 完成 |
  | seating | ✔ upgrade-seating.png | 完成 |
  | auto-grill | ✔ upgrade-auto-grill.png | 完成 |
- **現狀**：5/5 圖齊，需加購買後「已購買」標記

### 8.3 員工 Tab（4 種）
- 共用 `worker-*.png` → 見 3.8

### 8.4 行銷 Tab（4 種）
- **資料**：`src/data/upgrades.ts`（MARKETING_ITEMS）
- **素材清單**：
  | 行銷 ID | 圖檔 | 狀態 |
  |---------|------|------|
  | flyer | ✔ marketing-flyer.png | 完成 |
  | discount-sign | ✔ marketing-discount-sign.png | 完成 |
  | free-sample | ✔ marketing-free-sample.png | 完成 |
  | sausagebox | ✔ marketing-sausagebox.png | 完成 |
- **現狀**：4/4 齊

### 8.5 金融 Tab
- **位置**：貸款／互助會 UI 在 `ShopPanel` 中
- **素材需求**：
  - ✘ 銀行櫃台圖
  - ✘ 地下錢莊圖（陰暗、大哥坐鎮）
  - ✘ 互助會 5 人圍坐圖
  - ✘ 錢幣動畫（堆疊、流入流出）
- **UI Buttons**：
  - 貸款：銀行借 / 地下錢莊借 / 還款
  - 互助會：加入、競標、跑路按鈕（慎重）

### 8.6 娛樂 Tab（CasinoPanel）
- **位置**：`src/ui/panels/CasinoPanel.ts` (525 行)
- **素材需求**：
  - ✘ 賭場背景（紅色絨毯、霓虹燈）
  - ✘ 骰子動畫
  - ✘ 輪盤動畫
  - ✘ 籌碼圖
- **UI Buttons**：下注按鈕、拉霸拉桿、結果確認

### 8.7 黑市 Tab（BlackMarketPanel）
- **位置**：`src/ui/panels/BlackMarketPanel.ts` (170 行)
- **4 個道具**：
  | 道具 ID | 名稱 | 圖檔 |
  |---------|------|------|
  | mystery-meat | 神秘肉 | ✘ **缺** |
  | super-spice | 違禁香料 | ✘ **缺** |
  | expired-luxury | 過期高檔食材 | ✘ **缺** |
  | rival-recipe | 偷來的配方 | ✘ **缺** |
- **素材需求**：
  - ✘ 黑市入口（暗巷、霓虹燈）
  - ✘ 神秘供應商頭像
  - ✘ 4 個道具圖（**全缺**）
- **音效**：✘ 暗巷環境音、耳語聲

### 8.8 香腸箱 Panel（SausageBoxPanel — 抽腸機）
- **位置**：`src/ui/panels/SausageBoxPanel.ts` (546 行)
- **玩家動作**：抽抽樂玩法（莊家）
- **素材需求**：
  - ✔ `marketing-sausagebox.png`（箱子本體）
  - ✘ 開箱動畫（蓋子打開、光芒）
  - ✘ 各稀有度的香腸從箱子裡彈出動畫
  - ✘ 稀有度特效（普通灰、稀有藍、超稀有金）

---

## 第 9 章：自走棋戰鬥（AutoChess，可能未完全啟用）

### 9.1 AutoChessEngine
- **位置**：`src/systems/AutoChessEngine.ts` (591 行)
- **狀態**：程式碼存在但啟用狀況需確認
- **若要啟用，素材需求**：
  - ✘ 3x3 戰棋格背景
  - ✘ 每個香腸棋子的棋盤圖（縮小版 + 星級框）
  - ✘ 戰鬥動作（移動、攻擊、死亡）動畫
  - ✘ 回合結束 banner

---

## 第 10 章：結局畫面（EndingPanel）

### 10.1 EndingPanel
- **位置**：`src/ui/panels/EndingPanel.ts` (369 行)
- **玩家動作**：30 天結束後看結局
- **結局分支**（依據 game state）：
  - 夜市之王（佔滿 9 格）
  - 千萬富翁（錢 > X）
  - 破產流氓（破產 + 地下聲望高）
  - 負債逃亡（跑路互助會）
  - 平凡收攤（其他）
- **素材需求**：
  - ✘ 5 張結局插圖（**全缺**）
  - ✘ 結局字幕滾動背景
- **音效**：✘ 各結局主題音樂

---

## 總素材缺口統計

### 圖片
| 類別 | 已有 | 需補 | 優先度 |
|------|------|------|-------|
| 香腸熟度變化 | 9 靜態 | 63（9×7 狀態） | **P1** |
| 事件插畫 | 6 | 13 | **P1** |
| 黑市道具 | 0 | 4 | **P1** |
| 結局插圖 | 0 | 5 | **P1** |
| day30 里程碑 | 0 | 1 | **P1** |
| 對手表情／動作 | 8 靜態 | 24（8×3 狀態） | P2 |
| 員工動作 | 4 靜態 | 8+ | P2 |
| 特殊香腸大招特效 | 2 | 7 | P2 |
| 活動插畫 | 0 | 7 | P2 |
| 抽香腸箱動畫 | 0 | 1 | P3 |
| 賭場素材 | 0 | 多 | P3 |
| 自走棋素材 | 0 | 多 | P3（若啟用） |

### 音效（幾乎全缺）
| 類別 | 需求數 | 優先度 |
|------|--------|-------|
| BGM | 5（早／烤／戰／事件／結算） | **P1** |
| UI 點擊／切換 | 10+ | **P1** |
| 烤制音效 | 10+ | **P1** |
| 戰鬥音效 | 15+ | P2 |
| 客人／角色配音 | 30+ | P3 |

---

## 合作分工建議（Game Jam 版）

### 角色 A：美術（圖像設計）
**Priority 1（必做）**：
1. 9 香腸 × 7 熟度狀態 = 63 張（**最大量**）
2. 13 張事件插畫
3. 4 個黑市道具圖
4. 5 張結局插圖
5. day30 里程碑

**Priority 2（加分）**：
6. 對手 8 × 3 表情動作
7. 員工 4 × 2 動作
8. 7 張活動插畫

### 角色 B：音效／音樂
**Priority 1**：
1. 5 首 BGM（早／烤／戰／事件／結算）
2. 10+ UI 點擊音
3. 10+ 烤制音效（滋滋、翻面、完美叮、燒焦）

**Priority 2**：
4. 15+ 戰鬥音效
5. 能量滿「丟她木炭！」配音

### 角色 C：UI 設計師
**Priority 1**：
1. 耐心條、能量條、HP 條統一設計
2. 訂單泡泡、評分星星 UI
3. StatusBar 重繪（6 個指標排版）
4. 調味料站檯面設計

**Priority 2**：
5. 結算圖表
6. 抽香腸箱動畫設計稿
7. 按鈕統一規範（顏色、字體、hover 狀態）

### 角色 D：前端／程式
**Priority 1（技術債）**：
1. GrillScene 拆成 5 個 Manager class（見 `deep-analysis-2026-04-17.md`）
2. 消滅 40 處 `as any`
3. 加存檔／讀檔功能

**Priority 2**：
4. 打磨各 Panel 的 hover／active 狀態
5. 場景轉場動畫

### 角色 E：遊戲設計（數值調整）
1. 30 天節奏重新平衡
2. 9 香腸戰鬥數值檢查
3. 8 對手難度曲線
4. 經濟系統壓力測試

---

## Game Jam 奪冠策略建議

### 要贏需要有三個層次
1. **第一眼抓住人**：開場 30 秒內要讓評審記住
   - 建議：把「丟她木炭！」特殊技做到極致浮誇
   - 主視覺要夠騷（台式庸俗美學是武器）

2. **核心循環爽**：30 秒到 5 分鐘之間
   - 烤制的完美 combo 要讓人起雞皮疙瘩
   - 音效配合很重要（完美叮 + 金光）

3. **深度讓人想講**：5 分鐘後
   - 地下經濟、互助會、黑市這些系統要能在短時間內觸發
   - 建議 demo 版把 30 天縮成 5 天極速體驗

### 最不可或缺的 5 件事（如果時間緊）
1. **烤制核心音效齊** — 沒這個爽不起來
2. **BGM 至少一首** — 沒 BGM 氣氛全無
3. **StatusBar 視覺升級** — 評審第一眼看到
4. **主視覺／封面夠騷** — 入選與否
5. **結局至少做 2 個** — 破產結局 + 夜市之王結局

---

## 快速查表：已有素材總覽

共 111 個檔案（`public/` 底下）：
- 15 徽章、9 香腸、4 員工、8 對手、8 調味料、8 客人、7 事件、6 story、5 升級、4 行銷、9 地圖、其他工具圖（烤架、火焰、HP 條等）
- BGM：1（`bgm-grill.mp3`）

---

*本文件為靜態盤點，程式碼若更新請同步修訂。*

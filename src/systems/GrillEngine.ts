// GrillEngine — pure logic, no Phaser dependency
// Handles sausage state, cooking ticks, flip, serve judgment

export type HeatLevel = 'low' | 'medium' | 'high';
export type GrillQuality = 'perfect' | 'ok' | 'half-cooked' | 'raw' | 'slightly-burnt' | 'burnt' | 'carbonized';

// ── Stage system ─────────────────────────────────────────────────────────────
export type CookingStage = 'raw' | 'surface' | 'half' | 'golden' | 'hot' | 'burnt';

export const STAGE_THRESHOLDS: Record<CookingStage, [number, number]> = {
  raw:     [0,   20],
  surface: [20,  45],
  half:    [45,  65],
  golden:  [65,  90],
  hot:     [90,  100],
  burnt:   [100, 9999],
};

export function getCookingStage(doneness: number): CookingStage {
  if (doneness < 20)  return 'raw';
  if (doneness < 45)  return 'surface';
  if (doneness < 65)  return 'half';
  if (doneness < 90)  return 'golden';
  if (doneness < 100) return 'hot';
  return 'burnt';
}

export function getStageDisplayInfo(stage: CookingStage): {
  color: number;
  label: string;
  borderGlow: number;
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
// ─────────────────────────────────────────────────────────────────────────────

export interface GrillingSausage {
  id: string;
  sausageTypeId: string;
  topDoneness: number;    // 0-120
  bottomDoneness: number; // 0-120
  currentSide: 'top' | 'bottom'; // which side faces DOWN (toward heat)
  served: boolean;
  topStage: CookingStage;
  bottomStage: CookingStage;
  lastStageChangeTime: number; // seconds, used for effect debounce
  // Wave 4b fields
  flipCount: number;        // 翻面次數，初始 0
  oilBrushed: boolean;      // 已刷油，初始 false
  lastFlipTime: number;     // cooldown 用，秒，初始 0
  isPressed: boolean;       // 是否正在按壓（互動期間短暫 true），初始 false
}

// Doneness units per second
export const HEAT_RATES: Record<HeatLevel, number> = {
  low: 6,
  medium: 12,
  high: 22,
};

let sausageCounter = 0;

export function createGrillingSausage(sausageTypeId: string): GrillingSausage {
  return {
    id: `sausage-${++sausageCounter}`,
    sausageTypeId,
    topDoneness: 0,
    bottomDoneness: 0,
    currentSide: 'bottom', // bottom faces down first
    served: false,
    topStage: 'raw',
    bottomStage: 'raw',
    lastStageChangeTime: 0,
    flipCount: 0,
    oilBrushed: false,
    lastFlipTime: 0,
    isPressed: false,
  };
}

export function updateSausage(
  sausage: GrillingSausage,
  heatLevel: HeatLevel,
  deltaSeconds: number,
  isSimulation?: boolean,
): GrillingSausage {
  if (sausage.served) return sausage;

  const simMultiplier = isSimulation ? 0.5 : 1.0;
  const rate = HEAT_RATES[heatLevel] * deltaSeconds * simMultiplier;

  // The side facing DOWN gets heat; cap at 120 to allow carbonization range
  let updated: GrillingSausage;
  if (sausage.currentSide === 'bottom') {
    updated = {
      ...sausage,
      bottomDoneness: Math.min(120, sausage.bottomDoneness + rate),
    };
  } else {
    updated = {
      ...sausage,
      topDoneness: Math.min(120, sausage.topDoneness + rate),
    };
  }

  // Sync stage fields — caller can diff old vs new to detect transitions
  const newTopStage = getCookingStage(updated.topDoneness);
  const newBottomStage = getCookingStage(updated.bottomDoneness);
  if (newTopStage !== updated.topStage || newBottomStage !== updated.bottomStage) {
    updated = {
      ...updated,
      topStage: newTopStage,
      bottomStage: newBottomStage,
    };
  }

  return updated;
}

export function flipSausage(sausage: GrillingSausage): GrillingSausage {
  if (sausage.served) return sausage;
  return {
    ...sausage,
    currentSide: sausage.currentSide === 'bottom' ? 'top' : 'bottom',
  };
}

export function judgeQuality(sausage: GrillingSausage, isSimulation?: boolean): GrillQuality {
  const { topDoneness, bottomDoneness } = sausage;
  const avg = (topDoneness + bottomDoneness) / 2;

  if (isSimulation) {
    // Wider perfect zone: 55-95 instead of 71-90
    if (avg > 110)  return 'carbonized';
    if (avg >= 100) return 'burnt';
    if (avg >= 96)  return 'slightly-burnt';
    if (avg >= 55)  return 'perfect';
    if (avg >= 35)  return 'ok';
    if (avg >= 20)  return 'half-cooked';
    return 'raw';
  }

  if (avg > 100)  return 'carbonized';
  if (avg >= 98)  return 'burnt';
  if (avg >= 93)  return 'slightly-burnt';
  if (avg >= 60)  return 'perfect';
  if (avg >= 45)  return 'ok';
  if (avg >= 25)  return 'half-cooked';
  return 'raw';
}

export function getQualityScore(quality: GrillQuality): number {
  switch (quality) {
    case 'perfect':       return 1.5;
    case 'ok':            return 1.0;
    case 'half-cooked':   return 0.5;
    case 'raw':           return 0;   // cannot serve
    case 'slightly-burnt':return 0.6;
    case 'burnt':         return 0.3;
    case 'carbonized':    return 0;   // cannot serve
  }
}

/**
 * Returns a hex color for a given doneness value (0-120).
 * 0: pink (raw)  →  70: golden (perfect)  →  100: charcoal (burnt)  →  120: pitch black (carbonized)
 */
export function getSausageColor(doneness: number): number {
  if (doneness <= 70) {
    // Pink (0xffb6c1) → Golden (0xdaa520) at t=0..1
    const t = doneness / 70;
    const r = Math.round(0xff + (0xda - 0xff) * t);
    const g = Math.round(0xb6 + (0xa5 - 0xb6) * t);
    const b = Math.round(0xc1 + (0x20 - 0xc1) * t);
    return (r << 16) | (g << 8) | b;
  } else if (doneness <= 100) {
    // Golden (0xdaa520) → Charcoal (0x333333) at t=0..1
    const t = (doneness - 70) / 30;
    const r = Math.round(0xda + (0x33 - 0xda) * t);
    const g = Math.round(0xa5 + (0x33 - 0xa5) * t);
    const b = Math.round(0x20 + (0x33 - 0x20) * t);
    return (r << 16) | (g << 8) | b;
  } else {
    // Charcoal (0x333333) → Pitch black (0x111111) at t=0..1
    const t = (doneness - 100) / 20;
    const r = Math.round(0x33 + (0x11 - 0x33) * t);
    const g = Math.round(0x33 + (0x11 - 0x33) * t);
    const b = Math.round(0x33 + (0x11 - 0x33) * t);
    return (r << 16) | (g << 8) | b;
  }
}

/**
 * Returns the average doneness of both sides, for visual display.
 */
export function getAverageDoneness(sausage: GrillingSausage): number {
  return (sausage.topDoneness + sausage.bottomDoneness) / 2;
}

/**
 * Returns doneness bar color reflecting new quality zones:
 * 0-30: grey (raw), 31-50: blue (half-cooked), 51-70: yellow (ok),
 * 71-90: green (perfect), 91-95: orange (slightly-burnt), 96-100: red (burnt), 100+: dark red (carbonized)
 */
export function getDonenessBarColor(doneness: number): number {
  if (doneness <= 30) {
    // Grey — raw zone
    return 0x888888;
  } else if (doneness <= 50) {
    // Blue — half-cooked zone
    return 0x4488ff;
  } else if (doneness <= 70) {
    // Yellow — ok zone
    return 0xffcc00;
  } else if (doneness <= 90) {
    // Green — perfect zone
    return 0x00cc44;
  } else if (doneness <= 95) {
    // Orange — slightly-burnt zone
    return 0xff8800;
  } else if (doneness <= 100) {
    // Red — burnt zone
    return 0xff2200;
  } else {
    // Dark red — carbonized zone
    return 0x880000;
  }
}

// ── Wave 4b: new interaction functions ───────────────────────────────────────

/**
 * tryFlipSausage — 帶 300ms cooldown 的翻面。
 * 回傳 null 表示 cooldown 中，無法翻面。
 */
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

/**
 * pressSausage — 按壓加熱當前面 +3/秒。
 * 若處於 hot 階段按壓 → 直接設為 105（破裂、變 burnt）。
 */
export function pressSausage(s: GrillingSausage, deltaSec: number): GrillingSausage {
  if (s.served) return s;
  const currentDoneness = s.currentSide === 'bottom' ? s.bottomDoneness : s.topDoneness;
  const stage = getCookingStage(currentDoneness);
  if (stage === 'hot') {
    // 破裂 — 直接進入 burnt
    const field = s.currentSide === 'bottom' ? 'bottomDoneness' : 'topDoneness';
    return { ...s, [field]: 105 };
  }
  const addition = 3 * deltaSec;
  if (s.currentSide === 'bottom') {
    return { ...s, bottomDoneness: Math.min(120, s.bottomDoneness + addition) };
  }
  return { ...s, topDoneness: Math.min(120, s.topDoneness + addition) };
}

/**
 * brushOil — 刷油。
 * 必須雙面都達 half 階段以上、且尚未刷過。
 * 成功回傳新物件；不符合條件回傳 null。
 */
export function brushOil(s: GrillingSausage): GrillingSausage | null {
  if (s.served || s.oilBrushed) return null;
  const stageOrder: CookingStage[] = ['raw', 'surface', 'half', 'golden', 'hot', 'burnt'];
  const topIdx = stageOrder.indexOf(getCookingStage(s.topDoneness));
  const botIdx = stageOrder.indexOf(getCookingStage(s.bottomDoneness));
  if (Math.min(topIdx, botIdx) < 2) return null; // 雙面都需達 half（index 2）
  return { ...s, oilBrushed: true };
}

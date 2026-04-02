// GrillEngine — pure logic, no Phaser dependency
// Handles sausage state, cooking ticks, flip, serve judgment

export type HeatLevel = 'low' | 'medium' | 'high';
export type GrillQuality = 'perfect' | 'ok' | 'half-cooked' | 'raw' | 'slightly-burnt' | 'burnt' | 'carbonized';

export interface GrillingSausage {
  id: string;
  sausageTypeId: string;
  topDoneness: number;    // 0-100
  bottomDoneness: number; // 0-100
  currentSide: 'top' | 'bottom'; // which side faces DOWN (toward heat)
  served: boolean;
}

// Doneness units per second
export const HEAT_RATES: Record<HeatLevel, number> = {
  low: 10,
  medium: 20,
  high: 35,
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
  if (sausage.currentSide === 'bottom') {
    return {
      ...sausage,
      bottomDoneness: Math.min(120, sausage.bottomDoneness + rate),
    };
  } else {
    return {
      ...sausage,
      topDoneness: Math.min(120, sausage.topDoneness + rate),
    };
  }
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
  if (avg >= 96)  return 'burnt';
  if (avg >= 91)  return 'slightly-burnt';
  if (avg >= 71)  return 'perfect';
  if (avg >= 51)  return 'ok';
  if (avg >= 31)  return 'half-cooked';
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

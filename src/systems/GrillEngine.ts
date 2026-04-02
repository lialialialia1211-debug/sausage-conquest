// GrillEngine — pure logic, no Phaser dependency
// Handles sausage state, cooking ticks, flip, serve judgment

export type HeatLevel = 'low' | 'medium' | 'high';
export type GrillQuality = 'perfect' | 'ok' | 'raw' | 'burnt';

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
): GrillingSausage {
  if (sausage.served) return sausage;

  const rate = HEAT_RATES[heatLevel] * deltaSeconds;

  // The side facing DOWN gets heat
  if (sausage.currentSide === 'bottom') {
    return {
      ...sausage,
      bottomDoneness: Math.min(100, sausage.bottomDoneness + rate),
    };
  } else {
    return {
      ...sausage,
      topDoneness: Math.min(100, sausage.topDoneness + rate),
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

export function judgeQuality(sausage: GrillingSausage): GrillQuality {
  const { topDoneness, bottomDoneness } = sausage;

  // If either side is burnt
  if (topDoneness > 90 || bottomDoneness > 90) return 'burnt';

  // If either side is raw
  if (topDoneness < 40 || bottomDoneness < 40) return 'raw';

  // Both sides in perfect range (60-90)
  if (topDoneness >= 60 && topDoneness <= 90 && bottomDoneness >= 60 && bottomDoneness <= 90) {
    return 'perfect';
  }

  return 'ok';
}

export function getQualityScore(quality: GrillQuality): number {
  switch (quality) {
    case 'perfect': return 1.5;
    case 'ok':      return 1.0;
    case 'raw':     return 0.5;
    case 'burnt':   return 0;
  }
}

/**
 * Returns a hex color for a given doneness value (0-100).
 * 0: pink (raw)  →  60: golden (perfect)  →  100: charcoal (burnt)
 */
export function getSausageColor(doneness: number): number {
  if (doneness <= 60) {
    // Pink (0xffb6c1) → Golden (0xdaa520)  at t=0..1
    const t = doneness / 60;
    const r = Math.round(0xff + (0xda - 0xff) * t);
    const g = Math.round(0xb6 + (0xa5 - 0xb6) * t);
    const b = Math.round(0xc1 + (0x20 - 0xc1) * t);
    return (r << 16) | (g << 8) | b;
  } else {
    // Golden (0xdaa520) → Charcoal (0x333333) at t=0..1
    const t = (doneness - 60) / 40;
    const r = Math.round(0xda + (0x33 - 0xda) * t);
    const g = Math.round(0xa5 + (0x33 - 0xa5) * t);
    const b = Math.round(0x20 + (0x33 - 0x20) * t);
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
 * Returns doneness bar color: green → yellow → red
 */
export function getDonenessBarColor(doneness: number): number {
  if (doneness < 50) {
    // White/grey (not ready)
    return 0x888888;
  } else if (doneness <= 80) {
    // Green → yellow (good zone)
    const t = (doneness - 50) / 30;
    const r = Math.round(0x00 + 0xff * t);
    const g = 0xcc;
    const b = 0x00;
    return (r << 16) | (g << 8) | b;
  } else {
    // Yellow → red (danger zone)
    const t = (doneness - 80) / 20;
    const r = 0xff;
    const g = Math.round(0xcc * (1 - t));
    const b = 0x00;
    return (r << 16) | (g << 8) | b;
  }
}

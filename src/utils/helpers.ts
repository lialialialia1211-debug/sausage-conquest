// Common utility functions

export function formatMoney(amount: number): string {
  return `$${amount.toLocaleString()}`;
}

export function formatDay(day: number): string {
  return `Day ${day}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

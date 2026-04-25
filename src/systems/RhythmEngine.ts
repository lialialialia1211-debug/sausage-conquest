// RhythmEngine.ts — Judgement window constants and hit-judge function (Wave 6b+)

export type HitJudgement = 'perfect' | 'great' | 'good' | 'miss';

/** Timing windows (seconds) for each judgement tier. These are one-sided (delta <= window). */
export const JUDGE_WINDOWS = {
  perfect: 0.05,  // ±50ms
  great:   0.10,  // ±100ms
  good:    0.15,  // ±150ms
} as const;

/**
 * Compares the press time against the note's scheduled hit time.
 *
 * @param noteTime   Scheduled hit time in seconds (from chart start)
 * @param pressTime  The moment the player pressed (same time source)
 * @returns 'perfect' | 'great' | 'good' if within a window, null otherwise.
 *          A null return means the press is outside all windows — the caller
 *          decides whether to treat this as a MISS or a no-op.
 */
export function judgeHit(noteTime: number, pressTime: number): HitJudgement | null {
  const delta = Math.abs(noteTime - pressTime);
  if (delta <= JUDGE_WINDOWS.perfect) return 'perfect';
  if (delta <= JUDGE_WINDOWS.great)   return 'great';
  if (delta <= JUDGE_WINDOWS.good)    return 'good';
  return null;
}

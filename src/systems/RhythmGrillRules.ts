import { JUDGE_WINDOWS, type HitJudgement } from './RhythmEngine';
import type { GrillDifficulty } from '../config/grillBalance';

export type RhythmAccuracy = Exclude<HitJudgement, 'miss'>;

export function getJudgeWindowMultiplier(difficulty: GrillDifficulty): number {
  return difficulty === 'casual' ? 2.0 : 1.0;
}

export function judgeRhythmHit(
  noteTime: number,
  pressTime: number,
  difficulty: GrillDifficulty,
): HitJudgement | null {
  const multiplier = getJudgeWindowMultiplier(difficulty);
  const delta = Math.abs(noteTime - pressTime);
  if (delta <= JUDGE_WINDOWS.perfect * multiplier) return 'perfect';
  if (delta <= JUDGE_WINDOWS.great * multiplier) return 'great';
  if (delta <= JUDGE_WINDOWS.good * multiplier) return 'good';
  return null;
}

export function getGoodWindowSeconds(difficulty: GrillDifficulty): number {
  return JUDGE_WINDOWS.good * getJudgeWindowMultiplier(difficulty);
}

export function getRhythmHeatBoost(judgement: HitJudgement): number {
  if (judgement === 'perfect') return 18;
  if (judgement === 'great') return 13;
  if (judgement === 'good') return 9;
  return 0;
}

export function getComboMilestone(combo: number): 10 | 20 | 50 | 100 | null {
  if (combo < 10) return null;
  if (combo >= 100) return 100;
  if (combo >= 50) return 50;
  if (combo >= 20) return 20;
  return 10;
}

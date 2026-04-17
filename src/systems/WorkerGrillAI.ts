// WorkerGrillAI — pure logic module for worker-automated grilling
// Called by GrillScene each frame when the player is away from the stall

import { gameState } from '../state/GameState';
import { WORKERS } from '../data/workers';
import type { Worker } from '../types';
import type { GrillingSausage, HeatLevel } from './GrillEngine';

interface WorkerAction {
  type: 'place' | 'flip' | 'serve' | 'distracted' | 'idle';
  slotIndex?: number;
  message: string;
}

// Get all hired workers that can grill
export function getGrillingWorkers(): Worker[] {
  return (gameState.hiredWorkers || [])
    .map(id => WORKERS.find(w => w.id === id))
    .filter((w): w is Worker => !!w && w.grillSkill.canGrill);
}

// Get workers that help with serving (mei)
export function getServingWorkers(): Worker[] {
  return (gameState.hiredWorkers || [])
    .map(id => WORKERS.find(w => w.id === id))
    .filter((w): w is Worker => !!w && w.id === 'mei');
}

/**
 * Called every tick by GrillScene when player is away.
 * Workers automatically manage the grill based on their skills.
 * Returns a list of actions taken this tick for UI feedback.
 */
export function tickWorkerAI(
  grillSlots: Array<{ sausage: GrillingSausage | null; isEmpty: boolean }>,
  _warmingZoneCount: number,
  _heatLevel: HeatLevel,
  _dt: number,
  inventorySnapshot: Record<string, number>,
  elapsedSinceLastAction: number,  // seconds since last worker action
): WorkerAction[] {
  const workers = getGrillingWorkers();
  if (workers.length === 0) return [];

  const actions: WorkerAction[] = [];

  // Workers act every 2-3 seconds (not every frame)
  if (elapsedSinceLastAction < 2.0) return [];

  for (const worker of workers) {
    const skill = worker.grillSkill;

    // Check for distraction
    if (Math.random() < skill.burnChance) {
      actions.push({
        type: 'distracted',
        message: `${worker.emoji} ${worker.name}在${worker.id === 'adi' ? '滑手機' : '發呆'}...`,
      });
      continue; // Skip this worker's turn
    }

    // Priority 1: Flip sausages that need flipping
    let acted = false;
    for (let i = 0; i < grillSlots.length; i++) {
      const slot = grillSlots[i];
      if (!slot.sausage || slot.isEmpty) continue;

      const s = slot.sausage;
      const activeSide = s.currentSide === 'bottom' ? s.bottomDoneness : s.topDoneness;
      const otherSide = s.currentSide === 'bottom' ? s.topDoneness : s.bottomDoneness;

      // Flip when active side >= 70 and other side < 70
      if (activeSide >= 70 && otherSide < 70) {
        // Accuracy check — might flip at wrong time
        if (Math.random() < skill.flipAccuracy) {
          actions.push({
            type: 'flip',
            slotIndex: i,
            message: `${worker.emoji} ${worker.name}翻面了`,
          });
        }
        acted = true;
        break; // One action per worker per tick
      }
    }
    if (acted) continue;

    // Priority 2: Move done sausages to warming zone
    for (let i = 0; i < grillSlots.length; i++) {
      const slot = grillSlots[i];
      if (!slot.sausage || slot.isEmpty) continue;

      const s = slot.sausage;
      const avg = (s.topDoneness + s.bottomDoneness) / 2;

      // Serve when both sides are reasonably done (avg >= 60)
      if (s.topDoneness >= 30 && s.bottomDoneness >= 30 && avg >= 60) {
        actions.push({
          type: 'serve',
          slotIndex: i,
          message: `${worker.emoji} ${worker.name}把香腸放入保溫箱`,
        });
        acted = true;
        break; // One action per worker per tick
      }
    }
    if (acted) continue;

    // Priority 3: Place new sausages on empty slots
    const emptySlotIndex = grillSlots.findIndex(s => s.isEmpty || !s.sausage);
    if (emptySlotIndex >= 0) {
      // Find first available sausage type in inventory
      const availableType = Object.entries(inventorySnapshot).find(([_, qty]) => qty > 0);
      if (availableType) {
        actions.push({
          type: 'place',
          slotIndex: emptySlotIndex,
          message: `${worker.emoji} ${worker.name}放了一根香腸上烤架`,
        });
        break; // Only one place action per tick
      }
    }
  }

  return actions;
}

/**
 * Check if the player has enough workers to leave the stall.
 * Need at least 1 worker who can grill.
 */
export function canPlayerLeave(): boolean {
  return getGrillingWorkers().length > 0;
}

/**
 * Simulate a batch of grilling while player is away on an activity.
 * Called when an activity completes to fast-forward worker actions.
 * Returns summary of what happened.
 */
export function simulateWorkerGrilling(
  durationSeconds: number,
  _grillSlotCount: number,
  _heatLevel: HeatLevel,
  _inventorySnapshot: Record<string, number>,
): {
  sausagesGrilled: number;
  sausagesBurnt: number;
  feedbackMessages: string[];
} {
  const workers = getGrillingWorkers();
  if (workers.length === 0) {
    return { sausagesGrilled: 0, sausagesBurnt: 0, feedbackMessages: ['沒有工讀生在顧攤位！'] };
  }

  // Simple simulation: each grilling worker handles ~1 sausage per 15 seconds
  const totalCapacity = workers.length * Math.floor(durationSeconds / 15);
  let grilled = 0;
  let burnt = 0;
  const messages: string[] = [];

  for (let i = 0; i < totalCapacity; i++) {
    const worker = workers[i % workers.length];
    const skill = worker.grillSkill;

    // Check if distracted
    if (Math.random() < skill.burnChance) {
      burnt++;
      messages.push(`${worker.emoji} ${worker.name}烤焦了一根...`);
    } else {
      grilled++;
    }
  }

  if (grilled > 0) {
    messages.push(`工讀生們共烤好了 ${grilled} 根香腸`);
  }
  if (burnt > 0) {
    messages.push(`不過也烤焦了 ${burnt} 根`);
  }

  return { sausagesGrilled: grilled, sausagesBurnt: burnt, feedbackMessages: messages };
}

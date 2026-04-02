/**
 * AutoChessEngine.ts
 *
 * Pure auto-chess battle engine for the Taiwan night-market sausage tycoon game.
 * No Phaser dependency — all logic only.
 *
 * Responsibilities:
 *  1. Creating ChessPiece instances from SausageType data
 *  2. Generating AI opponent armies scaled by slot difficulty
 *  3. Evolution / merge system: 3 same-id + same-stars → next star level (max ★2)
 *  4. Turn-based auto-combat (speed-sorted action order)
 *  5. Win / loss / draw resolution with slot progression
 */

import type { ChessPiece, AutoChessState, ChessPieceType } from '../types';
import { SAUSAGE_TYPES } from '../data/sausages';
import { GRID_SLOTS } from '../data/map';
import { gameState, updateGameState } from '../state/GameState';

// ── Piece Creation ────────────────────────────────────────────────────────────

let pieceIdCounter = 0;

/** Star-level attack / HP multipliers: base, ★1, ★2 */
const STAR_MULT: Record<number, number> = { 0: 1, 1: 1.5, 2: 2.5 };

/**
 * Create a ChessPiece from a registered sausage type.
 *
 * @param sausageId - Matches SausageType.id from SAUSAGE_TYPES
 * @param team      - 'player' or 'opponent'
 * @param stars     - Evolution level: 0 (base) | 1 (★1) | 2 (★2)
 * @returns ChessPiece or null if sausageId is not found
 */
export function createPiece(
  sausageId: string,
  team: 'player' | 'opponent',
  stars: 0 | 1 | 2 = 0,
): ChessPiece | null {
  const sausage = SAUSAGE_TYPES.find(s => s.id === sausageId);
  if (!sausage) return null;

  const mult = STAR_MULT[stars] ?? 1;
  const hp   = Math.round(sausage.battle.hp  * mult);
  const atk  = Math.round(sausage.battle.atk * mult);

  return {
    id:       `piece_${++pieceIdCounter}`,
    sausageId,
    name:     sausage.name,
    emoji:    sausage.emoji,
    type:     sausage.battle.type as ChessPieceType,
    hp,
    maxHp:    hp,
    atk,
    spd:      sausage.battle.spd,
    stars,
    gridX:    0,
    gridY:    0,
    team,
    isAlive:  true,
  };
}

// ── Piece Cost ────────────────────────────────────────────────────────────────

/**
 * Returns the purchase cost for a single base-level piece.
 * Falls back to 999 if sausageId is unknown.
 */
export function getPieceCost(sausageId: string): number {
  return SAUSAGE_TYPES.find(s => s.id === sausageId)?.cost ?? 999;
}

// ── Evolution / Merge System ──────────────────────────────────────────────────

export interface MergeResult {
  merged:    boolean;
  pieces:    ChessPiece[];
  newPiece?: ChessPiece;
}

/**
 * Attempt to merge the target piece with two other identical pieces
 * (same sausageId, same stars, same team).
 *
 * Merging rules:
 *  - 3× base  → 1× ★1
 *  - 3× ★1   → 1× ★2
 *  - ★2 pieces cannot evolve further
 *
 * The three consumed pieces are removed from the returned array and the
 * upgraded piece is appended.  Grid position and team are preserved from
 * the target piece.
 */
export function tryMerge(pieces: ChessPiece[], targetId: string): MergeResult {
  const target = pieces.find(p => p.id === targetId);
  if (!target) return { merged: false, pieces };

  // Cannot evolve past ★2
  if (target.stars >= 2) return { merged: false, pieces };

  const candidates = pieces.filter(
    p =>
      p.id        !== target.id &&
      p.sausageId === target.sausageId &&
      p.stars     === target.stars &&
      p.team      === target.team,
  );

  if (candidates.length < 2) return { merged: false, pieces };

  const toConsume = new Set([target.id, candidates[0].id, candidates[1].id]);
  const remaining = pieces.filter(p => !toConsume.has(p.id));

  const nextStars = (target.stars + 1) as 0 | 1 | 2;
  const newPiece  = createPiece(target.sausageId, target.team, nextStars);
  if (!newPiece) return { merged: false, pieces };

  // Inherit battlefield position from the target
  newPiece.gridX = target.gridX;
  newPiece.gridY = target.gridY;

  remaining.push(newPiece);
  return { merged: true, pieces: remaining, newPiece };
}

// ── AI Opponent Army Generation ───────────────────────────────────────────────

/**
 * Build an opponent army scaled to the given slot's opponentDifficulty (1-5).
 *
 * Scaling rules:
 *  - Piece count:  min(6, 2 + difficulty)  →  3 … 7 pieces
 *  - Sausage pool: widens with difficulty (more expensive types unlock)
 *  - Star chance:  increases with difficulty
 *
 * Pieces are pre-positioned on the right half of the battlefield (gridX 3-5).
 */
export function generateOpponentArmy(opponentSlot: number): ChessPiece[] {
  const slotData   = GRID_SLOTS.find(s => s.tier === opponentSlot);
  const difficulty = slotData?.opponentDifficulty ?? 1;

  // Build a cost-gated pool: difficulty gates which sausage tiers the AI can use
  const costCap = [0, 12, 22, 30, 35, 999][Math.min(difficulty, 5)];
  const eligibleTypes = SAUSAGE_TYPES.filter(s => s.cost <= costCap);

  // Fallback to first 3 types if nothing qualifies
  const pool =
    eligibleTypes.length > 0
      ? eligibleTypes.map(s => s.id)
      : SAUSAGE_TYPES.slice(0, 3).map(s => s.id);

  const pieceCount = Math.min(6, 2 + difficulty); // 3 … 7

  const pieces: ChessPiece[] = [];

  for (let i = 0; i < pieceCount; i++) {
    const sausageId = pool[i % pool.length];

    // Determine evolution level based on difficulty
    let stars: 0 | 1 | 2 = 0;
    const roll = Math.random();
    if (difficulty >= 4 && roll < 0.30) stars = 2;
    else if (difficulty >= 3 && roll < 0.40) stars = 1;
    else if (difficulty >= 2 && roll < 0.20) stars = 1;

    const piece = createPiece(sausageId, 'opponent', stars);
    if (!piece) continue;

    // Position: right half of a 6×3 grid (columns 3-5)
    piece.gridX = 3 + (i % 3);
    piece.gridY = Math.floor(i / 3);
    pieces.push(piece);
  }

  return pieces;
}

// ── Battle Entry Cost ─────────────────────────────────────────────────────────

export interface BattleCostInfo {
  playerCost: number;
  canAfford:  boolean;
}

/**
 * Battle entry costs 60 % of the player's current money.
 * Returns { playerCost, canAfford }.
 */
export function calculateBattleCost(): BattleCostInfo {
  const cost = Math.floor(gameState.money * 0.6);
  return {
    playerCost: cost,
    canAfford:  gameState.money >= cost && cost > 0,
  };
}

// ── Battle State Initialisation ───────────────────────────────────────────────

/**
 * Position both armies on a shared 8×3 grid and build the initial
 * AutoChessState ready for combat.
 *
 * Player pieces occupy columns 0-2; opponent pieces occupy columns 5-7.
 */
export function initBattleState(
  playerPieces:   ChessPiece[],
  opponentPieces: ChessPiece[],
  budget:         number,
): AutoChessState {
  // Deep-copy to avoid mutating external references
  const pPieces = playerPieces.map(p => ({ ...p }));
  const oPieces = opponentPieces.map(p => ({ ...p }));

  pPieces.forEach((p, i) => {
    p.gridX = i % 3;
    p.gridY = Math.floor(i / 3);
  });

  oPieces.forEach((p, i) => {
    p.gridX = 5 + (i % 3);
    p.gridY = Math.floor(i / 3);
  });

  return {
    playerPieces:   pPieces,
    opponentPieces: oPieces,
    playerHp:       20,
    opponentHp:     20,
    round:          0,
    maxRounds:      20,
    phase:          'prep',
    battleLog:      [],
    budget,
  };
}

// ── Combat Helpers ────────────────────────────────────────────────────────────

/** Roll a damage value with ±10 % variance and a 10 % crit chance (×1.5). */
function calcDamage(attacker: ChessPiece, _defender: ChessPiece): number {
  const variance = 0.9 + Math.random() * 0.2;          // 0.90 – 1.10
  const crit     = Math.random() < 0.1 ? 1.5 : 1.0;   // 10 % crit
  return Math.max(1, Math.round(attacker.atk * variance * crit));
}

/** Renders the ★ suffix shown in log messages (empty string for base pieces). */
function starLabel(piece: ChessPiece): string {
  return piece.stars > 0 ? '★'.repeat(piece.stars) : '';
}

/**
 * Apply damage to a target piece, marking it as defeated when HP reaches 0.
 * Returns the actual damage dealt.
 */
function applyDamage(target: ChessPiece, dmg: number): number {
  const actual = Math.min(target.hp, dmg);
  target.hp -= actual;
  if (target.hp <= 0) {
    target.hp      = 0;
    target.isAlive = false;
  }
  return actual;
}

/** Returns the first living tank on the given team, or undefined. */
function findTank(pieces: ChessPiece[]): ChessPiece | undefined {
  return pieces.find(p => p.isAlive && p.type === 'tank');
}

// ── Execute One Combat Round ──────────────────────────────────────────────────

/**
 * Resolve one round of combat.
 *
 * Action order is determined by descending speed (ties broken by array order).
 * Each living piece acts once per round according to its ChessPieceType:
 *
 *  • normal    – attack the frontline enemy (tank if present, otherwise first alive)
 *  • ranged    – attack the lowest-HP enemy (ignores taunt)
 *  • aoe       – split damage equally among all living enemies
 *  • tank      – heavy strike on the frontline enemy; draws 'normal' targeting
 *  • assassin  – bypass enemies and deal direct damage to the opposing base HP
 *  • support   – heal the most-wounded ally; attacks weakly when all allies are full
 *
 * Returns a new AutoChessState (immutable — input is not mutated).
 */
export function executeRound(state: AutoChessState): AutoChessState {
  // Shallow-copy top level; deep-copy piece arrays to avoid mutation
  const newState: AutoChessState = {
    ...state,
    round:          state.round + 1,
    playerPieces:   state.playerPieces.map(p => ({ ...p })),
    opponentPieces: state.opponentPieces.map(p => ({ ...p })),
    battleLog:      [...state.battleLog],
    playerHp:       state.playerHp,
    opponentHp:     state.opponentHp,
  };

  // Gather all living pieces; sort by speed descending
  const actingOrder = [
    ...newState.playerPieces,
    ...newState.opponentPieces,
  ]
    .filter(p => p.isAlive)
    .sort((a, b) => b.spd - a.spd || 0);

  for (const piece of actingOrder) {
    if (!piece.isAlive) continue;

    const isPlayer  = piece.team === 'player';
    const enemies   = (isPlayer ? newState.opponentPieces : newState.playerPieces).filter(p => p.isAlive);
    const allies    = (isPlayer ? newState.playerPieces   : newState.opponentPieces).filter(p => p.isAlive);
    const pieceTag  = `${piece.emoji}${piece.name}${starLabel(piece)}`;

    if (enemies.length === 0) break;

    switch (piece.type) {
      // ── 普通近戰 ──────────────────────────────────────────────────────────
      case 'normal': {
        // Taunt: target tank if present
        const target = findTank(enemies) ?? enemies[0];
        const dmg    = calcDamage(piece, target);
        const actual = applyDamage(target, dmg);
        newState.battleLog.push(
          `${pieceTag} 攻擊 ${target.emoji}${target.name} 造成 ${actual} 傷害${!target.isAlive ? '（擊敗！）' : ''}`,
        );
        break;
      }

      // ── 遠程 ──────────────────────────────────────────────────────────────
      case 'ranged': {
        // Targets lowest-HP enemy (snipe the weak), ignores taunt
        const target = enemies.reduce((a, b) => a.hp < b.hp ? a : b);
        const dmg    = calcDamage(piece, target);
        const actual = applyDamage(target, dmg);
        newState.battleLog.push(
          `${pieceTag} 遠程狙擊 ${target.emoji}${target.name} 造成 ${actual} 傷害${!target.isAlive ? '（擊敗！）' : ''}`,
        );
        break;
      }

      // ── 群體傷害 ──────────────────────────────────────────────────────────
      case 'aoe': {
        // Splits total ATK equally across all living enemies (minimum 1 each)
        const dmgEach = Math.max(1, Math.floor(piece.atk / enemies.length));
        const killed: string[] = [];
        enemies.forEach(e => {
          applyDamage(e, dmgEach);
          if (!e.isAlive) killed.push(`${e.emoji}${e.name}`);
        });
        const killedText = killed.length > 0 ? `（擊敗：${killed.join('、')}）` : '';
        newState.battleLog.push(
          `${pieceTag} 群體爆炸！每位敵人受到 ${dmgEach} 傷害${killedText}`,
        );
        break;
      }

      // ── 坦克 ──────────────────────────────────────────────────────────────
      case 'tank': {
        // Heavy swing at frontline; also acts as a taunt magnet for 'normal' pieces
        const target = findTank(enemies) ?? enemies[0];
        const dmg    = calcDamage(piece, target);
        const actual = applyDamage(target, dmg);
        newState.battleLog.push(
          `${pieceTag} 重擊 ${target.emoji}${target.name} 造成 ${actual} 傷害${!target.isAlive ? '（擊敗！）' : ''}`,
        );
        break;
      }

      // ── 刺客 ─────────────────────────────────────────────────────────────
      case 'assassin': {
        // Bypasses enemy pieces; damages opposing base directly
        const baseDmg = Math.max(1, Math.round(piece.atk * 0.5));
        if (isPlayer) {
          newState.opponentHp = Math.max(0, newState.opponentHp - baseDmg);
          newState.battleLog.push(
            `${pieceTag} 潛入敵方主堡！造成 ${baseDmg} 基地傷害（剩 ${newState.opponentHp} HP）`,
          );
        } else {
          newState.playerHp = Math.max(0, newState.playerHp - baseDmg);
          newState.battleLog.push(
            `${pieceTag} 突破你的防線！造成 ${baseDmg} 基地傷害（剩 ${newState.playerHp} HP）`,
          );
        }
        break;
      }

      // ── 補師 ─────────────────────────────────────────────────────────────
      case 'support': {
        const woundedAllies = allies.filter(p => p.hp < p.maxHp);
        if (woundedAllies.length > 0) {
          // Heal most-wounded ally
          const target  = woundedAllies.reduce((a, b) => a.hp < b.hp ? a : b);
          const healAmt = 5;
          target.hp     = Math.min(target.maxHp, target.hp + healAmt);
          newState.battleLog.push(
            `${pieceTag} 治療 ${target.emoji}${target.name} 回復 ${healAmt} HP（現在 ${target.hp}/${target.maxHp}）`,
          );
        } else {
          // Nothing to heal — weak attack on the frontline enemy
          const target = findTank(enemies) ?? enemies[0];
          const dmg    = Math.max(1, Math.floor(piece.atk * 0.5));
          const actual = applyDamage(target, dmg);
          newState.battleLog.push(
            `${pieceTag} 輔助攻擊 ${target.emoji}${target.name} 造成 ${actual} 傷害${!target.isAlive ? '（擊敗！）' : ''}`,
          );
        }
        break;
      }
    }
  }

  return newState;
}

// ── Battle End Conditions ─────────────────────────────────────────────────────

export interface BattleEndResult {
  ended:  boolean;
  winner: 'player' | 'opponent' | 'draw' | null;
}

/**
 * Check whether the battle has concluded.
 *
 * Evaluation order:
 *  1. Base HP depletion (assassins / special effects)
 *  2. All pieces of one team eliminated
 *  3. Both teams simultaneously eliminated → draw
 *  4. Round cap reached → winner is whichever team has more living pieces
 */
export function checkBattleEnd(state: AutoChessState): BattleEndResult {
  if (state.playerHp   <= 0) return { ended: true, winner: 'opponent' };
  if (state.opponentHp <= 0) return { ended: true, winner: 'player'   };

  const playerAlive   = state.playerPieces.filter(p  => p.isAlive).length;
  const opponentAlive = state.opponentPieces.filter(p => p.isAlive).length;

  if (playerAlive === 0 && opponentAlive === 0) return { ended: true, winner: 'draw' };
  if (playerAlive === 0) return { ended: true, winner: 'opponent' };
  if (opponentAlive === 0) return { ended: true, winner: 'player'  };

  if (state.round >= state.maxRounds) {
    if (playerAlive > opponentAlive) return { ended: true, winner: 'player'   };
    if (opponentAlive > playerAlive) return { ended: true, winner: 'opponent' };
    return { ended: true, winner: 'draw' };
  }

  return { ended: false, winner: null };
}

// ── Battle Result Application ─────────────────────────────────────────────────

/**
 * Apply the battle outcome to the global game state.
 *
 * Win  → advance one tier on the night-market map
 * Loss → 50 % chance to be pushed back one tier
 * Draw → no positional change
 *
 * Returns a Chinese summary string suitable for display in the UI.
 */
export function applyBattleResult(winner: 'player' | 'opponent' | 'draw'): string {
  const currentSlot = gameState.playerSlot;

  if (winner === 'player') {
    const newSlot    = Math.min(9, currentSlot + 1);
    const newMap     = { ...gameState.map };
    newMap[newSlot]  = 'player';
    newMap[currentSlot] = 'enemy';

    updateGameState({
      playerSlot: newSlot,
      map:        newMap,
      stats:      { ...gameState.stats, battlesWon: gameState.stats.battlesWon + 1 },
    });

    const slotData = GRID_SLOTS.find(s => s.tier === newSlot);
    return `勝利！你從第 ${currentSlot} 層躍升至第 ${newSlot} 層 — ${slotData?.emoji ?? ''} ${slotData?.name ?? ''}`;
  }

  if (winner === 'opponent') {
    const pushedBack = currentSlot > 1 && Math.random() < 0.5;

    if (pushedBack) {
      const newSlot       = currentSlot - 1;
      const newMap        = { ...gameState.map };
      newMap[currentSlot] = 'enemy';
      newMap[newSlot]     = 'player';

      updateGameState({
        playerSlot: newSlot,
        map:        newMap,
        stats:      { ...gameState.stats, battlesLost: gameState.stats.battlesLost + 1 },
      });

      return `慘敗⋯你被打回第 ${newSlot} 層。整理一下，下次捲土重來！`;
    }

    updateGameState({
      stats: { ...gameState.stats, battlesLost: gameState.stats.battlesLost + 1 },
    });
    return '戰敗，但勉強守住了陣地。';
  }

  // Draw
  return '平手！雙方精疲力竭，各自撤退，維持現狀。';
}

// ── Simulation-mode Buffs ─────────────────────────────────────────────────────

/**
 * When the player is in 'simulation' mode, boost all piece HP by 50 %.
 * Mutates the pieces in-place (call before initBattleState).
 */
export function applySimulationBuff(pieces: ChessPiece[]): void {
  if (gameState.gameMode !== 'simulation') return;
  pieces.forEach(p => {
    p.hp    = Math.round(p.hp    * 1.5);
    p.maxHp = Math.round(p.maxHp * 1.5);
  });
}

// ── Available Piece Types for Purchase ───────────────────────────────────────

export interface PurchasableType {
  sausageId: string;
  name:      string;
  emoji:     string;
  cost:      number;
  type:      string;
}

/**
 * Returns the list of sausage types the player has unlocked and can field
 * as chess pieces, along with display metadata and purchase cost.
 */
export function getAvailablePieceTypes(): PurchasableType[] {
  return SAUSAGE_TYPES
    .filter(s => gameState.unlockedSausages.includes(s.id))
    .map(s => ({
      sausageId: s.id,
      name:      s.name,
      emoji:     s.emoji,
      cost:      s.cost,
      type:      s.battle.type,
    }));
}

// ── Full Battle Simulation (utility) ─────────────────────────────────────────

export interface SimulationResult {
  winner:    'player' | 'opponent' | 'draw';
  rounds:    number;
  finalState: AutoChessState;
}

/**
 * Run the battle to completion without UI interaction.
 * Useful for preview / odds calculation.
 *
 * @param playerPieces   - Player's army (will be deep-copied internally)
 * @param opponentPieces - Opponent's army (will be deep-copied internally)
 * @param budget         - Budget value to embed in the returned state
 */
export function simulateBattle(
  playerPieces:   ChessPiece[],
  opponentPieces: ChessPiece[],
  budget = 0,
): SimulationResult {
  let state = initBattleState(playerPieces, opponentPieces, budget);
  state = { ...state, phase: 'battle' };

  let endCheck = checkBattleEnd(state);

  while (!endCheck.ended) {
    state    = executeRound(state);
    endCheck = checkBattleEnd(state);
  }

  return {
    winner:     endCheck.winner ?? 'draw',
    rounds:     state.round,
    finalState: { ...state, phase: 'done' },
  };
}

// BattleEngine — pure turn-based battle logic, no Phaser dependencies
import type { BattleType } from '../types';
import { SAUSAGE_MAP } from '../data/sausages';
import { OPPONENT_MAP } from '../data/opponents';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BattleUnit {
  id: string;
  sausageTypeId: string;
  hp: number;
  maxHp: number;
  atk: number;
  spd: number;
  type: BattleType;
  team: 'player' | 'opponent';
  alive: boolean;
}

export interface BattleAction {
  attackerId: string;
  defenderId: string;
  damage: number;
  isCrit: boolean;
  typeAdvantage: boolean;
  defenderHpAfter: number;
  defenderDied: boolean;
  logText: string;
}

export interface BattleRound {
  roundNumber: number;
  actions: BattleAction[];
}

export interface BattleResult {
  winner: 'player' | 'opponent' | 'timeout';
  rounds: BattleRound[];
  playerUnitsRemaining: number;
  opponentUnitsRemaining: number;
  finalPlayerHpPct: number;
  finalOpponentHpPct: number;
}

// ── Type advantage table ───────────────────────────────────────────────────────
// P0 partial triangle: aoe beats ranged (garlic > flying-fish)
// garlic(aoe) → flying-fish(ranged): +0.5 damage bonus
// normal has no advantages or disadvantages

export function getTypeAdvantage(attackerType: BattleType, defenderType: BattleType): number {
  if (attackerType === 'aoe' && defenderType === 'ranged') return 0.5;
  if (attackerType === 'ranged' && defenderType === 'normal') return 0.25;
  return 0;
}

// ── Unit factory ───────────────────────────────────────────────────────────────

export function createBattleUnit(sausageTypeId: string, team: 'player' | 'opponent', index: number): BattleUnit {
  const sausageType = SAUSAGE_MAP[sausageTypeId];
  if (!sausageType) {
    throw new Error(`Unknown sausage type: ${sausageTypeId}`);
  }
  return {
    id: `${team}-${sausageTypeId}-${index}`,
    sausageTypeId,
    hp: sausageType.battle.hp,
    maxHp: sausageType.battle.hp,
    atk: sausageType.battle.atk,
    spd: sausageType.battle.spd,
    type: sausageType.battle.type,
    team,
    alive: true,
  };
}

export function generateOpponentUnits(opponentId: string, count: number): BattleUnit[] {
  const opponent = OPPONENT_MAP[opponentId];
  if (!opponent) {
    // Fallback to default black-pig
    return Array.from({ length: count }, (_, i) => createBattleUnit('black-pig', 'opponent', i));
  }

  const units: BattleUnit[] = [];
  for (let i = 0; i < count; i++) {
    // Cycle through preferred types
    const typeId = opponent.preferredTypes[i % opponent.preferredTypes.length];
    units.push(createBattleUnit(typeId, 'opponent', i));
  }
  return units;
}

// ── Battle execution ───────────────────────────────────────────────────────────

const MAX_ROUNDS = 10;

function getAliveUnits(units: BattleUnit[]): BattleUnit[] {
  return units.filter(u => u.alive);
}

function computeDamage(attacker: BattleUnit, defender: BattleUnit): { damage: number; isCrit: boolean; typeAdvantage: boolean } {
  const typeBonus = getTypeAdvantage(attacker.type, defender.type);
  const typeAdvantage = typeBonus > 0;
  const randFactor = 0.9 + Math.random() * 0.2; // 0.9~1.1
  const isCrit = Math.random() < 0.10; // 10% crit chance
  const critMult = isCrit ? 1.5 : 1.0;

  const damage = Math.round(attacker.atk * (1 + typeBonus) * randFactor * critMult);
  return { damage, isCrit, typeAdvantage };
}

function buildLogText(
  attackerName: string,
  defenderName: string,
  damage: number,
  isCrit: boolean,
  typeAdvantage: boolean,
  defenderDied: boolean,
): string {
  let text = '';
  if (typeAdvantage && isCrit) {
    text = `「${attackerName} 剋制爆擊！轟出 ${damage} 傷害！」`;
  } else if (isCrit) {
    text = `「${attackerName} 暴擊！造成 ${damage} 傷害！」`;
  } else if (typeAdvantage) {
    text = `「${attackerName} 屬性剋制！造成 ${damage} 傷害！」`;
  } else {
    text = `「${attackerName} 攻擊！造成 ${damage} 傷害」`;
  }
  if (defenderDied) {
    text += `⋯⋯${defenderName} 陣亡！`;
  }
  return text;
}

export function executeBattle(playerUnitsIn: BattleUnit[], opponentUnitsIn: BattleUnit[]): BattleResult {
  // Deep copy so we don't mutate the originals
  const playerUnits: BattleUnit[] = playerUnitsIn.map(u => ({ ...u }));
  const opponentUnits: BattleUnit[] = opponentUnitsIn.map(u => ({ ...u }));
  const rounds: BattleRound[] = [];

  const getSausageName = (unit: BattleUnit): string => {
    return SAUSAGE_MAP[unit.sausageTypeId]?.name ?? unit.sausageTypeId;
  };

  for (let roundNum = 1; roundNum <= MAX_ROUNDS; roundNum++) {
    const alivePlayers = getAliveUnits(playerUnits);
    const aliveOpponents = getAliveUnits(opponentUnits);

    if (alivePlayers.length === 0 || aliveOpponents.length === 0) break;

    const actions: BattleAction[] = [];

    // Sort all alive units by speed (higher spd attacks first)
    // Each side's front unit attacks the other side's front unit
    const attackingPairs: Array<{ attacker: BattleUnit; defender: BattleUnit }> = [];

    // Front units attack each other simultaneously
    const frontPlayer = alivePlayers[0];
    const frontOpponent = aliveOpponents[0];

    attackingPairs.push({ attacker: frontPlayer, defender: frontOpponent });
    attackingPairs.push({ attacker: frontOpponent, defender: frontPlayer });

    // Sort by speed so faster unit goes first
    attackingPairs.sort((a, b) => b.attacker.spd - a.attacker.spd);

    for (const pair of attackingPairs) {
      const { attacker, defender } = pair;
      if (!attacker.alive || !defender.alive) continue;

      const { damage, isCrit, typeAdvantage } = computeDamage(attacker, defender);
      const newHp = Math.max(0, defender.hp - damage);
      defender.hp = newHp;
      const defenderDied = newHp === 0;
      if (defenderDied) defender.alive = false;

      const action: BattleAction = {
        attackerId: attacker.id,
        defenderId: defender.id,
        damage,
        isCrit,
        typeAdvantage,
        defenderHpAfter: newHp,
        defenderDied,
        logText: buildLogText(
          getSausageName(attacker),
          getSausageName(defender),
          damage,
          isCrit,
          typeAdvantage,
          defenderDied,
        ),
      };
      actions.push(action);
    }

    rounds.push({ roundNumber: roundNum, actions });

    // Check if battle is over after this round
    if (getAliveUnits(playerUnits).length === 0 || getAliveUnits(opponentUnits).length === 0) break;
  }

  // Determine winner
  const finalAlivePlayers = getAliveUnits(playerUnits);
  const finalAliveOpponents = getAliveUnits(opponentUnits);

  const playerHpTotal = finalAlivePlayers.reduce((sum, u) => sum + u.hp, 0);
  const playerMaxHpTotal = finalAlivePlayers.reduce((sum, u) => sum + u.maxHp, 0) ||
    playerUnits.reduce((sum, u) => sum + u.maxHp, 0);

  const opponentHpTotal = finalAliveOpponents.reduce((sum, u) => sum + u.hp, 0);
  const opponentMaxHpTotal = finalAliveOpponents.reduce((sum, u) => sum + u.maxHp, 0) ||
    opponentUnits.reduce((sum, u) => sum + u.maxHp, 0);

  const playerHpPct = playerMaxHpTotal > 0 ? playerHpTotal / playerMaxHpTotal : 0;
  const opponentHpPct = opponentMaxHpTotal > 0 ? opponentHpTotal / opponentMaxHpTotal : 0;

  let winner: 'player' | 'opponent' | 'timeout';
  if (finalAliveOpponents.length === 0 && finalAlivePlayers.length > 0) {
    winner = 'player';
  } else if (finalAlivePlayers.length === 0 && finalAliveOpponents.length > 0) {
    winner = 'opponent';
  } else {
    // Timeout: compare remaining HP percentage
    winner = playerHpPct >= opponentHpPct ? 'player' : 'opponent';
    if (playerHpPct !== opponentHpPct) {
      winner = playerHpPct >= opponentHpPct ? 'player' : 'opponent';
    } else {
      winner = 'timeout';
    }
  }

  return {
    winner,
    rounds,
    playerUnitsRemaining: finalAlivePlayers.length,
    opponentUnitsRemaining: finalAliveOpponents.length,
    finalPlayerHpPct: playerHpPct,
    finalOpponentHpPct: opponentHpPct,
  };
}

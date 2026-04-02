import type { CombatAction, CombatOutcome, CustomerPersonality } from '../types';
import { gameState, spendMoney, addMoney, changeReputation, changeUndergroundRep, addChaos, updateGameState } from '../state/GameState';

export const PERSONALITY_NAMES: Record<CustomerPersonality, string> = {
  normal: '普通客人',
  karen: '奧客大嬸',
  enforcer: '地頭蛇手下',
  inspector: '食安稽查員',
  fatcat: '冤大頭',
  spy: '競業臥底',
  influencer: '網紅',
};

/**
 * Resolves a combat action against a customer and returns the outcome.
 * Does NOT apply any side effects — call applyCombatOutcome for that.
 */
export function resolveCombat(
  action: CombatAction,
  personality: CustomerPersonality,
  witnessCount: number
): CombatOutcome {
  const witnessEffect = witnessCount * (gameState.hasBodyguard ? 0.7 : 1.0);

  switch (action) {
    case 'push': {
      const success = gameState.hasBodyguard ? true : Math.random() < 0.7;
      if (success) {
        return {
          success: true,
          moneyDelta: 0,
          repDelta: witnessCount > 2 ? -3 : 0,
          undergroundRepDelta: 3,
          witnessEffect,
          resultText: '你把他推開了，他踉蹌幾步後罵罵咧咧走了',
          chaosPoints: 1,
        };
      }
      return {
        success: false,
        moneyDelta: 0,
        repDelta: -5,
        undergroundRepDelta: -2,
        witnessEffect,
        resultText: '他反手一推，你跌坐在地上，旁邊的人都在看...',
        chaosPoints: 1,
      };
    }

    case 'splash': {
      let repDelta = 0;
      if (witnessCount === 0) repDelta = -1;
      else if (witnessCount <= 3) repDelta = -4;
      else repDelta = -8;

      if (personality === 'spy') {
        return {
          success: true,
          moneyDelta: -15,
          repDelta,
          undergroundRepDelta: 15,
          witnessEffect,
          resultText: '一碗滷汁潑在臥底臉上，他的假鬍子掉了！',
          chaosPoints: 2,
        };
      }
      return {
        success: true,
        moneyDelta: -15,
        repDelta,
        undergroundRepDelta: 5,
        witnessEffect,
        resultText: '醬料噴得他滿臉都是，場面一度混亂',
        chaosPoints: 2,
      };
    }

    case 'pan': {
      if (witnessCount < 3) {
        return {
          success: true,
          moneyDelta: 0,
          repDelta: -10,
          undergroundRepDelta: 20,
          witnessEffect,
          resultText: '你一鍋蓋過去，他應聲倒地。幸好沒什麼人看到',
          chaosPoints: 5,
        };
      }
      const repDelta = gameState.hasBodyguard ? -20 : -30;
      return {
        success: true,
        moneyDelta: 0,
        repDelta,
        undergroundRepDelta: 20,
        witnessEffect,
        resultText: '鍋子打下去的聲音響徹整條街，明天地方新聞見',
        chaosPoints: 5,
      };
    }

    case 'bodyguard': {
      updateGameState({ hasBodyguard: true, bodyguardDaysLeft: 3 });
      return {
        success: true,
        moneyDelta: -300,
        repDelta: 0,
        undergroundRepDelta: 10,
        witnessEffect,
        resultText: '花了 $300 請了個兄弟，接下來三天有人罩',
        chaosPoints: 2,
      };
    }

    case 'fake_slip': {
      const success = Math.random() < 0.75;
      if (success) {
        return {
          success: true,
          moneyDelta: -20,
          repDelta: 0,
          undergroundRepDelta: 8,
          witnessEffect,
          resultText: '你華麗地滑倒，順便把他絆倒了。完美犯罪，沒有證據',
          chaosPoints: 3,
        };
      }
      return {
        success: false,
        moneyDelta: -20,
        repDelta: -8,
        undergroundRepDelta: 5,
        witnessEffect,
        resultText: '演技太差被識破了，對方怒視著你：「你當我白痴？」',
        chaosPoints: 3,
      };
    }

    case 'bribe': {
      const baseCost = personality === 'inspector' ? -200 : -100;
      const success = Math.random() < 0.85;
      if (success) {
        const resultText =
          personality === 'inspector'
            ? '紅包塞過去，稽查員笑著說「這次就算了」'
            : '塞了一疊鈔票，對方數了數，滿意地離開';
        return {
          success: true,
          moneyDelta: baseCost,
          repDelta: 0,
          undergroundRepDelta: 5,
          witnessEffect,
          resultText,
          chaosPoints: 3,
        };
      }
      // 15% fail: fishing operation — penalty doubles the cost
      return {
        success: false,
        moneyDelta: baseCost * 2,
        repDelta: -20,
        undergroundRepDelta: -5,
        witnessEffect,
        resultText: '居然是釣魚執法！罰款加倍！',
        chaosPoints: 3,
      };
    }
  }
}

function getChaosDescription(outcome: CombatOutcome): string {
  if (outcome.resultText.includes('推')) return '輕推客人';
  if (outcome.resultText.includes('醬料') || outcome.resultText.includes('滷汁')) return '潑食材';
  if (outcome.resultText.includes('鍋')) return '用鍋打人';
  if (outcome.resultText.includes('兄弟') && outcome.resultText.includes('罩')) return '聘請保鑣';
  if (outcome.resultText.includes('滑倒') || outcome.resultText.includes('絆倒')) return '假裝滑倒';
  if (outcome.resultText.includes('紅包') || outcome.resultText.includes('鈔票') || outcome.resultText.includes('釣魚')) return '行賄';
  return '衝突事件';
}

/**
 * Applies all stat changes from a CombatOutcome to the game state.
 */
export function applyCombatOutcome(outcome: CombatOutcome): void {
  if (outcome.moneyDelta > 0) addMoney(outcome.moneyDelta);
  if (outcome.moneyDelta < 0) spendMoney(Math.abs(outcome.moneyDelta));
  if (outcome.repDelta !== 0) changeReputation(outcome.repDelta);
  if (outcome.undergroundRepDelta !== 0) changeUndergroundRep(outcome.undergroundRepDelta);
  if (outcome.chaosPoints > 0) addChaos(outcome.chaosPoints, getChaosDescription(outcome));
}

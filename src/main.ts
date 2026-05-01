import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MorningScene } from './scenes/MorningScene';
import { EveningScene } from './scenes/EveningScene';
import { GrillScene } from './scenes/GrillScene';
import { BattleScene } from './scenes/BattleScene';
import { SummaryScene } from './scenes/SummaryScene';
import { ShopScene } from './scenes/ShopScene';
import { UIManager } from './ui/UIManager';
import { EventBus } from './utils/EventBus';
import { setupTestTools } from './dev/TestTools';

// Initialize HTML overlay UI manager
const uiManager = new UIManager();

// Phaser game configuration
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  backgroundColor: '#0a0a0f',
  scale: {
    mode: Phaser.Scale.RESIZE,
    parent: 'game-container',
    width: '100%',
    height: '100%',
  },
  scene: [
    BootScene,
    MorningScene,
    EveningScene,
    GrillScene,
    BattleScene,
    SummaryScene,
    ShopScene,
  ],
};

// Start the game
const game = new Phaser.Game(config);
setupTestTools(game);

// Verify EventBus bidirectional communication on startup
EventBus.once('scene-ready', (sceneName: string) => {
  console.log(`[EventBus] Scene ready: ${sceneName}`);
});

// Expose for debugging in dev mode
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).game = game;
  (window as unknown as Record<string, unknown>).EventBus = EventBus;
  (window as unknown as Record<string, unknown>).uiManager = uiManager;
}

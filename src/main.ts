import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { DifficultyScene } from './scenes/DifficultyScene';
import { MorningScene } from './scenes/MorningScene';
import { EveningScene } from './scenes/EveningScene';
import { GrillScene } from './scenes/GrillScene';
import { BattleScene } from './scenes/BattleScene';
import { EventScene } from './scenes/EventScene';
import { SummaryScene } from './scenes/SummaryScene';
import { ShopScene } from './scenes/ShopScene';
import { UIManager } from './ui/UIManager';
import { EventBus } from './utils/EventBus';

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
    DifficultyScene,
    MorningScene,
    EveningScene,
    GrillScene,
    BattleScene,
    EventScene,
    SummaryScene,
    ShopScene,
  ],
};

// Start the game
const game = new Phaser.Game(config);

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

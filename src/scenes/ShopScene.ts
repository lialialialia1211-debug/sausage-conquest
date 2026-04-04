import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';

// ShopScene: placeholder — upgrade shop (triggers overlay)
// Not in basic P0 cycle, skipped until later
export class ShopScene extends Phaser.Scene {
  private readyForNext = false;

  constructor() {
    super({ key: 'ShopScene' });
  }

  preload(): void {
    // All textures preloaded in BootScene
  }

  create(): void {
    this.readyForNext = false;
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x00050a, 0x00050a, 0x000a15, 0x000a15, 1);
    bg.fillRect(0, 0, width, height);

    if (this.textures.exists('bg-shop')) {
      this.add.image(width / 2, height / 2, 'bg-shop').setDisplaySize(width, height).setAlpha(0.2);
    }

    this.add.text(cx, cy, '', { fontSize: '80px' }).setOrigin(0.5).setAlpha(0.15);

    this.add.text(cx, cy + 70, `升級商店`, {
      fontSize: '18px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#223344',
    }).setOrigin(0.5);

    this.cameras.main.fadeIn(400, 0, 0, 0);

    EventBus.emit('show-panel', 'shop');
    EventBus.emit('scene-ready', 'ShopScene');

    EventBus.once('shop-done', this.onShopDone, this);
  }

  private onShopDone = (): void => {
    if (this.readyForNext) return;
    this.readyForNext = true;

    EventBus.emit('hide-panel');
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('MorningScene');
    });
  };

  shutdown(): void {
    EventBus.off('shop-done', this.onShopDone, this);
  }
}

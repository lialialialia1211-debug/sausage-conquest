// CustomerQueue — Phaser Container managing the visual customer queue
import Phaser from 'phaser';
import type { Customer } from '../types';

const CUSTOMER_SLOT_W = 56;
const CUSTOMER_FONT_SIZE = '30px';
const PATIENCE_BAR_H = 4;
const PATIENCE_BAR_W = 40;

// Emoji states based on patience fraction (1 = full, 0 = empty)
function getCustomerEmoji(patienceFrac: number): string {
  if (patienceFrac > 0.66) return '😊';
  if (patienceFrac > 0.33) return '😐';
  return '😤';
}

interface CustomerDisplay {
  customer: Customer;
  container: Phaser.GameObjects.Container;
  emojiText: Phaser.GameObjects.Text;
  patBarBg: Phaser.GameObjects.Graphics;
  patBarFill: Phaser.GameObjects.Graphics;
  remainingPatience: number;
  initialPatience: number;
  state: 'waiting' | 'served' | 'leaving';
}

export class CustomerQueue extends Phaser.GameObjects.Container {
  private displays: CustomerDisplay[] = [];
  private queueY: number;
  private onCustomerTimeout: ((customerId: string) => void) | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    scene.add.existing(this);
    this.queueY = 0;
  }

  onTimeout(cb: (customerId: string) => void): this {
    this.onCustomerTimeout = cb;
    return this;
  }

  addCustomer(customer: Customer): void {
    const slotIndex = this.displays.length;
    const cx = slotIndex * CUSTOMER_SLOT_W;

    const container = this.scene.add.container(cx + 200, this.queueY); // start off right
    this.add(container);

    const emojiText = this.scene.add.text(0, 0, '😊', {
      fontSize: CUSTOMER_FONT_SIZE,
    }).setOrigin(0.5);

    const patBarBg = this.scene.add.graphics();
    patBarBg.fillStyle(0x333333, 1);
    patBarBg.fillRect(-PATIENCE_BAR_W / 2, 22, PATIENCE_BAR_W, PATIENCE_BAR_H);

    const patBarFill = this.scene.add.graphics();

    container.add([emojiText, patBarBg, patBarFill]);

    const display: CustomerDisplay = {
      customer,
      container,
      emojiText,
      patBarBg,
      patBarFill,
      remainingPatience: customer.patience,
      initialPatience: customer.patience,
      state: 'waiting',
    };

    this.displays.push(display);
    this.redrawPatienceBar(display);

    // Slide in from right
    this.scene.tweens.add({
      targets: container,
      x: cx,
      duration: 300,
      ease: 'Back.Out',
    });
  }

  tick(deltaSeconds: number): void {
    const toRemove: CustomerDisplay[] = [];

    for (const display of this.displays) {
      if (display.state !== 'waiting') continue;

      display.remainingPatience -= deltaSeconds;
      const frac = Math.max(0, display.remainingPatience / display.initialPatience);

      // Update emoji based on patience
      display.emojiText.setText(getCustomerEmoji(frac));

      // Update patience bar
      this.redrawPatienceBar(display);

      if (display.remainingPatience <= 0) {
        display.state = 'leaving';
        toRemove.push(display);
        this.playLeaveAnimation(display);
      }
    }

    for (const d of toRemove) {
      if (this.onCustomerTimeout) {
        this.onCustomerTimeout(d.customer.id);
      }
    }
  }

  /**
   * Returns the first waiting customer (front of queue), or null.
   */
  getNextCustomer(): Customer | null {
    const waiting = this.displays.find(d => d.state === 'waiting');
    return waiting ? waiting.customer : null;
  }

  /**
   * Marks a customer as served (happy animation).
   */
  serveCustomer(customerId: string, perfect: boolean): void {
    const display = this.displays.find(d => d.customer.id === customerId && d.state === 'waiting');
    if (!display) return;

    display.state = 'served';
    display.emojiText.setText(perfect ? '😍' : '🙂');

    // Slide out left with happy bounce
    this.scene.tweens.add({
      targets: display.container,
      x: display.container.x - 80,
      y: display.container.y - 20,
      alpha: 0,
      duration: 500,
      ease: 'Power2',
      onComplete: () => {
        this.removeDisplay(display);
        this.repositionQueue();
      },
    });
  }

  /**
   * Removes the front customer (they leave without buying).
   */
  dismissFrontCustomer(): void {
    const display = this.displays.find(d => d.state === 'waiting');
    if (!display) return;
    display.state = 'leaving';
    this.playLeaveAnimation(display);
  }

  getWaitingCount(): number {
    return this.displays.filter(d => d.state === 'waiting').length;
  }

  private playLeaveAnimation(display: CustomerDisplay): void {
    display.emojiText.setText('😤');

    this.scene.tweens.add({
      targets: display.container,
      x: display.container.x - 60,
      alpha: 0,
      duration: 400,
      ease: 'Power2',
      onComplete: () => {
        this.removeDisplay(display);
        this.repositionQueue();
      },
    });
  }

  private removeDisplay(display: CustomerDisplay): void {
    const idx = this.displays.indexOf(display);
    if (idx >= 0) this.displays.splice(idx, 1);
    display.container.destroy();
  }

  private repositionQueue(): void {
    // Slide remaining customers to correct positions
    let slotIndex = 0;
    for (const d of this.displays) {
      if (d.state === 'waiting') {
        const targetX = slotIndex * CUSTOMER_SLOT_W;
        this.scene.tweens.add({
          targets: d.container,
          x: targetX,
          duration: 200,
          ease: 'Power1',
        });
        slotIndex++;
      }
    }
  }

  private redrawPatienceBar(display: CustomerDisplay): void {
    const frac = Math.max(0, display.remainingPatience / display.initialPatience);
    const fillW = Math.round(frac * PATIENCE_BAR_W);

    display.patBarFill.clear();

    // Color: green → yellow → red
    let color: number;
    if (frac > 0.6) color = 0x22cc44;
    else if (frac > 0.3) color = 0xeecc00;
    else color = 0xff3322;

    display.patBarFill.fillStyle(color, 1);
    display.patBarFill.fillRect(-PATIENCE_BAR_W / 2, 22, fillW, PATIENCE_BAR_H);
  }
}

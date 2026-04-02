// CustomerQueue — Phaser Container managing the visual customer queue
// Customers enter from right, slide left to fill gaps, show patience bar + emoji states
import Phaser from 'phaser';
import type { Customer } from '../types';
import { SAUSAGE_MAP } from '../data/sausages';
import { CONDIMENTS } from '../data/condiments';

const CUSTOMER_SLOT_W = 168;
const PATIENCE_BAR_H = 12;
const PATIENCE_BAR_W = 144;

// Emoji based on patience fraction
function getCustomerEmoji(frac: number): string {
  if (frac > 0.8) return '😋';
  if (frac > 0.6) return '😊';
  if (frac > 0.4) return '😐';
  if (frac > 0.2) return '😤';
  return '🤬';
}

interface CustomerDisplay {
  customer: Customer;
  container: Phaser.GameObjects.Container;
  emojiText: Phaser.GameObjects.Text;
  patBarBg: Phaser.GameObjects.Graphics;
  patBarFill: Phaser.GameObjects.Graphics;
  orderBubble: Phaser.GameObjects.Text | null;
  badgeBubble: Phaser.GameObjects.Text | null;
  remainingPatience: number;
  initialPatience: number;
  state: 'waiting' | 'served' | 'leaving';
}

export class CustomerQueue extends Phaser.GameObjects.Container {
  private displays: CustomerDisplay[] = [];
  private onCustomerTimeoutCb: ((customerId: string) => void) | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    scene.add.existing(this);
  }

  onTimeout(cb: (customerId: string) => void): this {
    this.onCustomerTimeoutCb = cb;
    return this;
  }

  addCustomer(customer: Customer): void {
    // Spawn far right, then tween to proper slot position
    const slotIndex = this.displays.filter(d => d.state === 'waiting').length;
    const targetX = slotIndex * CUSTOMER_SLOT_W;
    const spawnX = targetX + 660; // enter from right

    const container = this.scene.add.container(spawnX, 0);
    this.add(container);

    const emojiText = this.scene.add.text(0, 0, getCustomerEmoji(1), {
      fontSize: '84px',
      align: 'center',
    }).setOrigin(0.5);

    const patBarBg = this.scene.add.graphics();
    patBarBg.fillStyle(0x333333, 1);
    patBarBg.fillRect(-PATIENCE_BAR_W / 2, 66, PATIENCE_BAR_W, PATIENCE_BAR_H);

    const patBarFill = this.scene.add.graphics();

    // Order bubble: show sausage emoji + condiment emojis above customer
    let orderBubble: Phaser.GameObjects.Text | null = null;
    let badgeBubble: Phaser.GameObjects.Text | null = null;

    if (customer.order) {
      const sausageInfo = SAUSAGE_MAP[customer.order.sausageType];
      const sausageEmoji = sausageInfo?.emoji ?? '🌭';
      const condimentEmojis = (customer.order.condiments || [])
        .map((id: string) => CONDIMENTS.find(c => c.id === id)?.emoji ?? '')
        .join('');
      const bubbleText = condimentEmojis ? `${sausageEmoji}${condimentEmojis}` : sausageEmoji;

      orderBubble = this.scene.add.text(0, -108, bubbleText, {
        fontSize: '39px',
        align: 'center',
      }).setOrigin(0.5);
    }

    if (customer.loyaltyBadge && customer.loyaltyBadge !== 'none') {
      const badgeEmoji = customer.loyaltyBadge === 'gold' ? '🥇'
        : customer.loyaltyBadge === 'silver' ? '🥈' : '🥉';
      badgeBubble = this.scene.add.text(CUSTOMER_SLOT_W / 2 - 18, -90, badgeEmoji, {
        fontSize: '33px',
      }).setOrigin(0.5);
    }

    const toAdd: Phaser.GameObjects.GameObject[] = [emojiText, patBarBg, patBarFill];
    if (orderBubble) toAdd.push(orderBubble);
    if (badgeBubble) toAdd.push(badgeBubble);
    container.add(toAdd);

    const display: CustomerDisplay = {
      customer,
      container,
      emojiText,
      patBarBg,
      patBarFill,
      orderBubble,
      badgeBubble,
      remainingPatience: customer.patience,
      initialPatience: customer.patience,
      state: 'waiting',
    };

    this.displays.push(display);
    this.redrawPatienceBar(display);

    // Slide in from right
    this.scene.tweens.add({
      targets: container,
      x: targetX,
      duration: 320,
      ease: 'Back.Out',
    });
  }

  tick(deltaSeconds: number): void {
    const timedOut: CustomerDisplay[] = [];

    for (const display of this.displays) {
      if (display.state !== 'waiting') continue;

      display.remainingPatience -= deltaSeconds;
      const frac = Math.max(0, display.remainingPatience / display.initialPatience);

      display.emojiText.setText(getCustomerEmoji(frac));
      this.redrawPatienceBar(display);

      if (display.remainingPatience <= 0) {
        display.state = 'leaving';
        timedOut.push(display);
        this.playLeaveAnimation(display, false);
      }
    }

    for (const d of timedOut) {
      if (this.onCustomerTimeoutCb) {
        this.onCustomerTimeoutCb(d.customer.id);
      }
    }
  }

  getNextCustomer(): Customer | null {
    const waiting = this.displays.find(d => d.state === 'waiting');
    return waiting ? waiting.customer : null;
  }

  serveCustomer(customerId: string, perfect: boolean): void {
    const display = this.displays.find(
      d => d.customer.id === customerId && d.state === 'waiting',
    );
    if (!display) return;

    display.state = 'served';
    display.emojiText.setText(perfect ? '😍' : '🙂');

    if (perfect) {
      this.spawnHeart(display.container.x, display.container.y);
    }

    // Slide out left with bounce
    this.scene.tweens.add({
      targets: display.container,
      x: display.container.x - 70,
      y: display.container.y - 18,
      alpha: 0,
      duration: 480,
      ease: 'Power2',
      onComplete: () => {
        if (display.container && display.container.active) {
          this.removeDisplay(display);
        }
        this.repositionQueue();
      },
    });
  }

  dismissFrontCustomer(): void {
    const display = this.displays.find(d => d.state === 'waiting');
    if (!display) return;
    display.state = 'leaving';
    this.playLeaveAnimation(display, true);
  }

  getWaitingCount(): number {
    return this.displays.filter(d => d.state === 'waiting').length;
  }

  getWaitingCustomers(): Customer[] {
    return this.displays
      .filter(d => d.state === 'waiting')
      .map(d => d.customer);
  }

  getCustomerPatienceRatio(customerId: string): number {
    const display = this.displays.find(d => d.customer.id === customerId && d.state === 'waiting');
    if (!display) return 0.5;
    return Math.max(0, display.remainingPatience / display.initialPatience);
  }

  // Reset all waiting customers' patience to full
  resetAllPatience(): void {
    for (const display of this.displays) {
      if (display.state !== 'waiting') continue;
      display.remainingPatience = display.initialPatience;
      this.redrawPatienceBar(display);
    }
  }

  // Multiply all waiting customers' remaining patience by a factor
  multiplyAllPatience(multiplier: number): void {
    for (const display of this.displays) {
      if (display.state !== 'waiting') continue;
      display.remainingPatience *= multiplier;
      this.redrawPatienceBar(display);
    }
  }

  private playLeaveAnimation(display: CustomerDisplay, dismissedByServe: boolean): void {
    if (!dismissedByServe) {
      display.emojiText.setText('😤');
    }

    this.scene.tweens.add({
      targets: display.container,
      x: display.container.x - 65,
      alpha: 0,
      duration: 400,
      ease: 'Power2',
      onComplete: () => {
        if (display.container && display.container.active) {
          this.removeDisplay(display);
        }
        this.repositionQueue();
      },
    });
  }

  private spawnHeart(cx: number, cy: number): void {
    const heart = this.scene.add.text(
      this.x + cx,
      this.y + cy - 10,
      '❤️',
      { fontSize: '18px' },
    ).setOrigin(0.5).setDepth(200);

    this.scene.tweens.add({
      targets: heart,
      y: heart.y - 40,
      alpha: 0,
      duration: 700,
      ease: 'Power2',
      onComplete: () => heart.destroy(),
    });
  }

  private removeDisplay(display: CustomerDisplay): void {
    const idx = this.displays.indexOf(display);
    if (idx >= 0) this.displays.splice(idx, 1);
    display.container.destroy();
  }

  private repositionQueue(): void {
    let slotIndex = 0;
    for (const d of this.displays) {
      if (d.state === 'waiting') {
        const targetX = slotIndex * CUSTOMER_SLOT_W;
        this.scene.tweens.add({
          targets: d.container,
          x: targetX,
          duration: 220,
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

    let color: number;
    if (frac > 0.6) color = 0x22cc44;
    else if (frac > 0.3) color = 0xeecc00;
    else color = 0xff3322;

    if (fillW > 0) {
      display.patBarFill.fillStyle(color, 1);
      display.patBarFill.fillRect(-PATIENCE_BAR_W / 2, 66, fillW, PATIENCE_BAR_H);
    }
  }
}

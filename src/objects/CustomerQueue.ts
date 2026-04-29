// CustomerQueue — Phaser Container managing the visual customer queue
// Customers enter from right, slide left to fill gaps, show patience bar + emoji states
import Phaser from 'phaser';
import type { Customer } from '../types';
import { SAUSAGE_MAP } from '../data/sausages';
import { gameState } from '../state/GameState';

const CUSTOMER_SLOT_W = 200;
const PATIENCE_BAR_H = 10;
const PATIENCE_BAR_W = 150;
export const MAX_VISIBLE_CUSTOMERS = 6;
const SIDE_CUSTOMER_COUNT = 2;

// Patience indicator based on fraction
function getCustomerEmoji(frac: number): string {
  if (frac > 0.8) return '◎';
  if (frac > 0.6) return '○';
  if (frac > 0.4) return '△';
  if (frac > 0.2) return '▽';
  return '✕';
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
  hidden: boolean;
}

export class CustomerQueue extends Phaser.GameObjects.Container {
  private displays: CustomerDisplay[] = [];
  private onCustomerTimeoutCb: ((customerId: string) => void) | null = null;
  private readonly topY: number;

  constructor(scene: Phaser.Scene, _x: number, y: number) {
    super(scene, 0, 0);
    this.topY = y;
    scene.add.existing(this);
  }

  onTimeout(cb: (customerId: string) => void): this {
    this.onCustomerTimeoutCb = cb;
    return this;
  }

  addCustomer(customer: Customer): void {
    // Spawn far right, then tween to proper slot position
    const slotIndex = this.displays.filter(d => d.state === 'waiting').length;
    const target = this.getSlotPosition(slotIndex);
    const spawnX = this.scene.scale.width + 140; // enter from right

    const container = this.scene.add.container(spawnX, target.y);
    this.add(container);

    const emojiText = this.scene.add.text(0, 0, getCustomerEmoji(1), {
      fontSize: '72px',
      align: 'center',
    }).setOrigin(0.5);

    // Try to show customer portrait image
    const personalityImageMap: Record<string, string> = {
      karen: 'customer-karen',
      enforcer: 'customer-thug',
      inspector: 'customer-inspector',
      fatcat: 'customer-fatcat',
      spy: 'customer-inspector', // reuse inspector
      influencer: 'customer-influencer',
      beggar: 'customer-beggar',
    };
    const imageKey = personalityImageMap[customer.personality]
      || (Math.random() < 0.5 ? 'customer-normal-male' : 'customer-normal-female');

    if (this.scene.textures.exists(imageKey)) {
      const portrait = this.scene.add.image(0, 0, imageKey);
      const pScale = Math.min(140 / portrait.width, 140 / portrait.height);
      portrait.setScale(pScale);
      container.add(portrait);
      // Move emoji behind/hide it
      emojiText.setAlpha(0);
      emojiText.setY(-18); // move emoji above as a small indicator
      emojiText.setFontSize(16);
    }

    const patBarBg = this.scene.add.graphics();
    patBarBg.fillStyle(0x333333, 1);
    patBarBg.fillRect(-PATIENCE_BAR_W / 2, 74, PATIENCE_BAR_W, PATIENCE_BAR_H);
    const patBarFrame = this.scene.textures.exists('ui-customer-patience-bar')
      ? this.scene.add.image(0, 79, 'ui-customer-patience-bar')
          .setDisplaySize(PATIENCE_BAR_W + 20, 28)
          .setAlpha(0.8)
      : null;

    const patBarFill = this.scene.add.graphics();

    // Order bubble: show sausage emoji + condiment emojis above customer
    let orderBubble: Phaser.GameObjects.Text | null = null;
    let badgeBubble: Phaser.GameObjects.Text | null = null;

    if (customer.order) {
      const sausageInfo = SAUSAGE_MAP[customer.order.sausageType];
      const baseName = sausageInfo?.name ?? '香腸';
      // Append garlic emoji if customer wants garlic
      const bubbleText = customer.order.wantGarlic ? `${baseName} 🧄` : baseName;

      orderBubble = this.scene.add.text(0, -78, bubbleText, {
        fontSize: '26px',
        align: 'center',
      }).setOrigin(0.5);
    }

    if (customer.loyaltyBadge && customer.loyaltyBadge !== 'none') {
      const badgeLabel = customer.loyaltyBadge === 'gold' ? '金'
        : customer.loyaltyBadge === 'silver' ? '銀' : '銅';
      badgeBubble = this.scene.add.text(CUSTOMER_SLOT_W / 2 - 10, -50, badgeLabel, {
        fontSize: '22px',
      }).setOrigin(0.5);
    }

    // Personality-based visual frame
    const frameGfx = this.scene.add.graphics();
    const frameColors: Record<string, number> = {
      karen: 0xff4444,
      enforcer: 0xff8800,
      inspector: 0x4488ff,
      fatcat: 0xffcc00,
      spy: 0x8844ff,
      influencer: 0xff44ff,
    };
    const frameColor = frameColors[customer.personality];
    if (frameColor) {
      frameGfx.lineStyle(2, frameColor, 0.8);
      frameGfx.strokeRoundedRect(
        -CUSTOMER_SLOT_W / 2 + 4, -32,
        CUSTOMER_SLOT_W - 8, 74,
        6,
      );
    }
    if (customer.isVIP) {
      frameGfx.lineStyle(3, 0xffcc00, 1);
      frameGfx.strokeRoundedRect(
        -CUSTOMER_SLOT_W / 2 + 2, -34,
        CUSTOMER_SLOT_W - 4, 78,
        8,
      );
    }

    // Returning customer name tag and wave animation
    let nameTag: Phaser.GameObjects.Text | null = null;
    if (customer.loyaltyBadge && customer.loyaltyBadge !== 'none' && customer.loyaltyId) {
      const loyalty = gameState?.customerLoyalty?.[customer.loyaltyId];
      if (loyalty) {
        nameTag = this.scene.add.text(0, 52, loyalty.name, {
          fontSize: '14px',
          color: '#ffcc00',
          backgroundColor: '#1a1a0a',
          padding: { x: 5, y: 2 },
        }).setOrigin(0.5);
      }

      this.scene.tweens.add({
        targets: container,
        scaleX: { from: 1, to: 1.15 },
        scaleY: { from: 1, to: 1.15 },
        duration: 200,
        yoyo: true,
        repeat: 1,
        ease: 'Sine.easeInOut',
        delay: 400,
      });
    }

    const toAdd: Phaser.GameObjects.GameObject[] = [frameGfx, emojiText];
    if (patBarFrame) toAdd.push(patBarFrame);
    toAdd.push(patBarBg, patBarFill);
    if (orderBubble) toAdd.push(orderBubble);
    if (badgeBubble) toAdd.push(badgeBubble);
    if (nameTag) toAdd.push(nameTag);
    container.add(toAdd);
    container.sendToBack(frameGfx);

    // S7.1: hide customers beyond MAX_VISIBLE_CUSTOMERS (logic still runs)
    const isHidden = slotIndex >= MAX_VISIBLE_CUSTOMERS;
    if (isHidden) {
      container.setVisible(false);
    }

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
      hidden: isHidden,
    };

    this.displays.push(display);
    this.redrawPatienceBar(display);

    // Slide in from right (only if visible)
    if (!isHidden) {
      this.scene.tweens.add({
        targets: container,
        x: target.x,
        y: target.y,
        duration: 320,
        ease: 'Back.Out',
      });
    }
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
    display.emojiText.setText(perfect ? '◎+' : '○');

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
        this.recomputeVisibility();
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

  // Add flat seconds to all waiting customers' remaining patience (capped at initial)
  addPatienceSeconds(seconds: number): void {
    for (const display of this.displays) {
      if (display.state !== 'waiting') continue;
      display.remainingPatience = Math.min(display.initialPatience, display.remainingPatience + seconds);
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
      display.emojiText.setText('✕');
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
        this.recomputeVisibility();
      },
    });
  }

  private spawnHeart(cx: number, cy: number): void {
    const heart = this.scene.add.text(
      this.x + cx,
      this.y + cy - 10,
      '+',
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
        const target = this.getSlotPosition(slotIndex);
        this.scene.tweens.add({
          targets: d.container,
          x: target.x,
          y: target.y,
          duration: 220,
          ease: 'Power1',
        });
        slotIndex++;
      }
    }
  }

  // S7.1: recompute which customers are visible (first MAX_VISIBLE_CUSTOMERS waiting ones)
  recomputeVisibility(): void {
    let visibleCount = 0;
    for (const d of this.displays) {
      if (d.state !== 'waiting') continue;
      const shouldBeVisible = visibleCount < MAX_VISIBLE_CUSTOMERS;
      d.hidden = !shouldBeVisible;
      if (d.container?.active) {
        d.container.setVisible(shouldBeVisible);
      }
      visibleCount++;
    }
  }

  // S7.1: count hidden waiting customers (for candidate label)
  getHiddenWaitingCount(): number {
    return this.displays.filter(d => d.state === 'waiting' && d.hidden).length;
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
      display.patBarFill.fillRect(-PATIENCE_BAR_W / 2, 74, fillW, PATIENCE_BAR_H);
    }
  }

  private getSlotPosition(slotIndex: number): { x: number; y: number } {
    const { width, height } = this.scene.scale;
    const topSlots = Math.max(1, MAX_VISIBLE_CUSTOMERS - SIDE_CUSTOMER_COUNT);
    if (slotIndex < topSlots) {
      const usableSlotW = Math.min(CUSTOMER_SLOT_W, Math.max(148, width / topSlots));
      const startX = width / 2 - ((topSlots - 1) * usableSlotW) / 2;
      return {
        x: startX + slotIndex * usableSlotW,
        y: this.topY,
      };
    }

    const sideIndex = slotIndex - topSlots;
    const sideMargin = Math.max(84, Math.min(124, width * 0.09));
    const sideY = Math.min(height - 190, Math.max(this.topY + 120, height * 0.62));
    return {
      x: sideIndex % 2 === 0 ? sideMargin : width - sideMargin,
      y: sideY,
    };
  }
}

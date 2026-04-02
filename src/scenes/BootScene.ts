import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { updateGameState } from '../state/GameState';
import { GRID_SLOTS } from '../data/map';
import { PROLOGUE_PAGES } from '../data/dialogue';
import { sfx } from '../utils/SoundFX';

// Page background tints for each prologue page
const PAGE_TINTS = [
  { top: 0x050508, bot: 0x0d0d14 },  // Page 1: dim office (cold dark)
  { top: 0x1a0d00, bot: 0x2a1800 },  // Page 2: night market warmth (amber dark)
  { top: 0x0a1220, bot: 0x102040 },  // Page 3: hopeful dawn (deep blue-teal)
];

// BootScene: opening title + multi-page prologue story + start button
// Transitions to MorningScene when player clicks start
export class BootScene extends Phaser.Scene {
  private currentPage = 0;
  private typingTimer?: Phaser.Time.TimerEvent;
  private canAdvance = false;

  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    this.load.image('cover', 'cover.png');
  }

  create(): void {
    this.currentPage = 0;
    this.canAdvance = false;
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    // Background — will be recoloured per page
    const bg = this.add.graphics();
    this.drawBackground(bg, width, height, 0);

    // Title: cover image logo (replaces text title)
    let title: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
    if (this.textures.exists('cover')) {
      const cover = this.add.image(cx, cy - 110, 'cover');
      const maxW = width * 0.75;
      const maxH = height * 0.25;
      const scale = Math.min(maxW / cover.width, maxH / cover.height);
      cover.setScale(scale).setDepth(1);
      title = cover;
    } else {
      // Fallback text title if image fails to load
      title = this.add.text(cx, cy - 110, '腸征天下', {
        fontSize: '56px',
        fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
        color: '#ffe600',
        stroke: '#ff6b00',
        strokeThickness: 2,
      }).setOrigin(0.5);
    }

    // Flicker animation for title
    this.tweens.add({
      targets: title,
      alpha: { from: 1, to: 0.88 },
      duration: 120,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
      delay: 3000,
      repeatDelay: 2000,
    });

    // Subtitle
    this.add.text(cx, cy - 45, '台灣夜市香腸征服之路', {
      fontSize: '18px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#ff6b00',
    }).setOrigin(0.5);

    // Story card background
    const storyBg = this.add.graphics();
    storyBg.fillStyle(0x12121a, 0.9);
    storyBg.lineStyle(1, 0xffe600, 0.4);
    storyBg.fillRoundedRect(cx - 270, cy - 60, 540, 140, 6);
    storyBg.strokeRoundedRect(cx - 270, cy - 60, 540, 140, 6);
    storyBg.setAlpha(0);

    // Story text (typing effect target)
    const storyText = this.add.text(cx, cy + 10, '', {
      fontSize: '16px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#ccccee',
      align: 'center',
      lineSpacing: 8,
      wordWrap: { width: 500 },
    }).setOrigin(0.5).setAlpha(0);

    // Page indicator dots
    const dotY = cy + 102;
    const dots: Phaser.GameObjects.Graphics[] = [];
    for (let i = 0; i < PROLOGUE_PAGES.length; i++) {
      const dot = this.add.graphics();
      const dotX = cx + (i - 1) * 18;
      dot.fillStyle(i === 0 ? 0xffe600 : 0x555566, 1);
      dot.fillCircle(dotX, dotY, 4);
      dot.setAlpha(0);
      dots.push(dot);
    }

    // "點擊繼續" hint
    const hintText = this.add.text(cx, cy + 120, '點擊繼續 ▶', {
      fontSize: '13px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#776644',
    }).setOrigin(0.5).setAlpha(0);

    // Pulsing hint animation (starts after hint fades in)
    const hintPulse = this.tweens.add({
      targets: hintText,
      alpha: { from: 0.9, to: 0.3 },
      duration: 700,
      yoyo: true,
      repeat: -1,
      paused: true,
    });

    // ── Mode selection cards (hidden until all pages done) ───────────────
    const cardWidth = 160;
    const cardHeight = 180;
    const gap = 20;
    const leftX = cx - cardWidth - gap / 2;
    const rightX = cx + gap / 2;
    const cardY = cy - 40;

    // Helper: start the game with a chosen mode
    const startGame = (mode: string) => {
      sfx.initOnUserGesture();
      // Initialize map: slot 1 = player, rest = enemy
      const initialMap: Record<number, string> = {};
      for (const slot of GRID_SLOTS) {
        initialMap[slot.id] = slot.tier === 1 ? 'player' : (slot.opponentId || 'enemy');
      }
      updateGameState({ map: initialMap, playerSlot: 1, gameMode: mode });
      this.cameras.main.fadeOut(500, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('MorningScene');
      });
    };

    // Normal mode card
    const normalCard = this.add.rectangle(
      leftX + cardWidth / 2, cardY + cardHeight / 2,
      cardWidth, cardHeight, 0x1a1a3e, 0.9,
    ).setStrokeStyle(2, 0xff6600).setInteractive({ useHandCursor: true }).setAlpha(0);

    const normalEmoji = this.add.text(leftX + cardWidth / 2, cardY + 30, '🔥', {
      fontSize: '40px',
    }).setOrigin(0.5).setAlpha(0);

    const normalTitle = this.add.text(leftX + cardWidth / 2, cardY + 75, '直接烤', {
      fontSize: '20px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#ff6600',
      fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0);

    const normalDesc = this.add.text(leftX + cardWidth / 2, cardY + 110, '正常難度\n香腸要你自己顧', {
      fontSize: '12px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#aaaaaa',
      align: 'center',
    }).setOrigin(0.5).setAlpha(0);

    normalCard.on('pointerover', () => normalCard.setStrokeStyle(3, 0xff8833));
    normalCard.on('pointerout',  () => normalCard.setStrokeStyle(2, 0xff6600));
    normalCard.on('pointerdown', () => startGame('normal'));

    // Simulation mode card
    const simCard = this.add.rectangle(
      rightX + cardWidth / 2, cardY + cardHeight / 2,
      cardWidth, cardHeight, 0x1a1a3e, 0.9,
    ).setStrokeStyle(2, 0x00cc88).setInteractive({ useHandCursor: true }).setAlpha(0);

    const simEmoji = this.add.text(rightX + cardWidth / 2, cardY + 30, '🧪', {
      fontSize: '40px',
    }).setOrigin(0.5).setAlpha(0);

    const simTitle = this.add.text(rightX + cardWidth / 2, cardY + 75, '模擬烤', {
      fontSize: '20px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#00cc88',
      fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0);

    const simDesc = this.add.text(rightX + cardWidth / 2, cardY + 110, '難度降低 50%\n適合新手練習', {
      fontSize: '12px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#aaaaaa',
      align: 'center',
    }).setOrigin(0.5).setAlpha(0);

    simCard.on('pointerover', () => simCard.setStrokeStyle(3, 0x33ffaa));
    simCard.on('pointerout',  () => simCard.setStrokeStyle(2, 0x00cc88));
    simCard.on('pointerdown', () => startGame('simulation'));

    // Collect all card objects for fade-in together
    const modeCardObjects = [normalCard, normalEmoji, normalTitle, normalDesc, simCard, simEmoji, simTitle, simDesc];

    // ── Typing engine ──────────────────────────────────────────────────
    const showPage = (pageIndex: number) => {
      this.canAdvance = false;
      hintPulse.pause();
      hintText.setAlpha(0);

      const fullText = PROLOGUE_PAGES[pageIndex];
      let charIndex = 0;
      storyText.setText('');

      // Update dots
      dots.forEach((d, i) => {
        d.clear();
        const dotX = cx + (i - 1) * 18;
        d.fillStyle(i === pageIndex ? 0xffe600 : 0x555566, 1);
        d.fillCircle(dotX, dotY, 4);
      });

      // Clear any existing typing timer
      if (this.typingTimer) {
        this.typingTimer.remove(false);
      }

      this.typingTimer = this.time.addEvent({
        delay: 32,
        repeat: fullText.length - 1,
        callback: () => {
          charIndex++;
          storyText.setText(fullText.slice(0, charIndex));
          if (charIndex >= fullText.length) {
            // Typing done — allow advance
            this.canAdvance = true;
            this.tweens.add({ targets: hintText, alpha: 0.9, duration: 300 });
            hintPulse.resume();
          }
        },
      });
    };

    // Click anywhere (except start button) to advance pages or skip typing
    this.input.on('pointerdown', (_ptr: Phaser.Input.Pointer, _go: Phaser.GameObjects.GameObject[]) => {
      if (this.currentPage >= PROLOGUE_PAGES.length) return; // start button handles this phase

      if (!this.canAdvance) {
        // Skip typing — show full text immediately
        if (this.typingTimer) this.typingTimer.remove(false);
        storyText.setText(PROLOGUE_PAGES[this.currentPage]);
        this.canAdvance = true;
        this.tweens.add({ targets: hintText, alpha: 0.9, duration: 200 });
        hintPulse.resume();
        return;
      }

      // Advance to next page
      this.currentPage++;

      if (this.currentPage >= PROLOGUE_PAGES.length) {
        // All pages done — show mode selection cards
        hintPulse.stop();
        this.tweens.add({ targets: [hintText, ...dots], alpha: 0, duration: 300 });
        this.tweens.add({
          targets: modeCardObjects,
          alpha: 1,
          duration: 600,
          ease: 'Power2',
        });
        return;
      }

      // Transition to next page: fade out story, redraw bg, fade in
      hintPulse.pause();
      this.tweens.add({
        targets: storyText,
        alpha: 0,
        duration: 250,
        onComplete: () => {
          this.drawBackground(bg, width, height, this.currentPage);
          showPage(this.currentPage);
          this.tweens.add({ targets: storyText, alpha: 1, duration: 300 });
        },
      });
    });

    // ── Initial fade-in sequence ───────────────────────────────────────
    this.tweens.add({
      targets: [storyBg, storyText, ...dots, hintText],
      alpha: (target: Phaser.GameObjects.GameObject) => {
        // hintText starts hidden; dots start at 1
        if (target === hintText) return 0;
        if (target === storyText) return 1;
        return 1;
      },
      duration: 800,
      delay: 400,
      ease: 'Power2',
      onComplete: () => {
        showPage(0);
      },
    });

    // Notify EventBus
    EventBus.emit('scene-ready', 'BootScene');
    EventBus.once('test-boot', () => {
      console.log('[EventBus] BootScene received test-boot signal from UI');
    });
  }

  private drawBackground(g: Phaser.GameObjects.Graphics, w: number, h: number, pageIndex: number): void {
    const { top, bot } = PAGE_TINTS[pageIndex] ?? PAGE_TINTS[0];
    g.clear();
    g.fillGradientStyle(top, top, bot, bot, 1);
    g.fillRect(0, 0, w, h);
    this.drawNeonLines(g, w, h, pageIndex);
  }

  private drawNeonLines(g: Phaser.GameObjects.Graphics, w: number, h: number, pageIndex: number): void {
    const lineColors = [
      { h: 0xffe600, v: 0xff6b00 },  // office: yellow/orange
      { h: 0xff6b00, v: 0xffaa00 },  // night market: orange/amber
      { h: 0x44aaff, v: 0x0066cc },  // hopeful: blue
    ];
    const c = lineColors[pageIndex] ?? lineColors[0];

    g.lineStyle(1, c.h, 0.06);
    for (let i = 0; i < 8; i++) {
      const y = (h / 8) * i;
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.strokePath();
    }
    g.lineStyle(1, c.v, 0.05);
    for (let i = 0; i < 12; i++) {
      const x = (w / 12) * i;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.strokePath();
    }
  }
}

import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { updateGameState } from '../state/GameState';
import { GRID_SLOTS } from '../data/map';
import { SAUSAGE_TYPES } from '../data/sausages';
import { PROLOGUE_PAGES } from '../data/dialogue';
import { sfx } from '../utils/SoundFX';
import { resetCustomerEngine } from '../systems/CustomerEngine';
import { resetAutoChessEngine } from '../systems/AutoChessEngine';
import { resetCasinoEngine } from '../systems/CasinoEngine';
import { resetAchievements } from '../systems/AchievementEngine';
import { UI_ASSETS } from '../data/uiAssets';
import { CUSTOMER_VARIANT_KEYS } from '../data/customerPortraits';
import { SONGS } from '../data/songs';

// Bump this string whenever chart-grill-theme.json changes so browsers pick up the new chart
const CHART_VERSION = '2026050501';

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
  private prologueImage?: Phaser.GameObjects.Image;
  private modeVideo?: Phaser.GameObjects.Video;
  private modeVideoShade?: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // ?? Cover & Prologue ??
    this.load.image('cover', 'cover.png');
    this.load.image('logo-ex', 'logo-ex.png');
    this.load.image('prologue-1', 'story-prologue-1.png');
    this.load.image('prologue-2', 'story-prologue-2.png');
    this.load.image('prologue-3', 'story-prologue-3.png');

    // ?? Backgrounds ??
    this.load.image('bg-grill', 'bg-grill.png');
    this.load.image('bg-shop', 'bg-shop.png');

    // ?? Grill scene assets ??
    this.load.image('grill-mesh', 'grill-mesh.png');
    this.load.image('fire-flame', 'fire-flame.png');
    this.load.image('fire-intense', 'fire-intense.png');
    this.load.image('heat-box', 'heat-box.png');
    this.load.image('grill-meter', 'grill-meter.png');
    this.load.image('tongs', 'tongs.png');
    this.load.image('queue-bg', 'queue-bg.png');
    this.load.image('karen-alert', 'karen-alert.png');
    this.load.image('dialogue-box', 'dialogue-box.png');

    // ?? Event splash images ??
    this.load.image('event-costco-guy', 'event-costco-guy.png');
    this.load.image('event-drunk-uncle', 'event-drunk-uncle.png');
    this.load.image('event-food-critic', 'event-food-critic.png');
    this.load.image('event-food-festival', 'event-food-festival.png');
    this.load.image('event-inspector', 'event-inspector.png');
    this.load.image('event-thugs', 'event-thugs.png');
    this.load.image('card-frame', 'card-frame.png');
    this.load.image('nightmarket-map', 'nightmarket-map.png');

    // ?? Sausage art (5 types) ??
    const sausageIds = ['flying-fish-roe', 'cheese', 'big-taste', 'big-wrap-small', 'great-wall'];
    sausageIds.forEach(id => this.load.image(`sausage-${id}`, `sausage-${id}.png`));

    // ?? Condiment art (garlic only) ??
    this.load.image('condiment-garlic-paste', 'condiment-garlic-paste.png');

    // ?? Customer portraits (8 types) ??
    const customerTypes = ['normal-male', 'normal-female', 'karen', 'thug', 'beggar', 'inspector', 'fatcat', 'influencer'];
    customerTypes.forEach(t => this.load.image(`customer-${t}`, `customer-${t}.png`));
    CUSTOMER_VARIANT_KEYS.forEach(key => this.load.image(key, `customers/${key}.png`));

    // ?? Opponent portraits (8) ??
    const opponents = ['toilet-uncle', 'alley-gang', 'uncle', 'influencer', 'fat-sister', 'student', 'sausage-prince', 'sausage-king'];
    opponents.forEach(id => this.load.image(`opponent-${id}`, `opponent-${id}.png`));

    // ?? Player & Battle ??
    this.load.image('player-portrait', 'player.png');
    this.load.image('battle-cover', 'battle-cover.png');
    this.load.image('battle-attack-normal', 'battle-attack-normal.png');
    this.load.image('battle-attack-garlic', 'battle-attack-garlic.png');
    this.load.image('battle-attack-cheese', 'battle-attack-cheese.png');
    this.load.image('hp-bar-player', 'hp-bar-player.png');
    this.load.image('hp-bar-opponent', 'hp-bar-opponent.png');

    // ?? Story day illustrations ??
    [5, 10, 15, 20, 25].forEach(d => this.load.image(`story-day${d}`, `story-day${d}.png`));

    // ?? Map tiles (9) ??
    for (let i = 2; i <= 10; i++) {
      this.load.image(`map-tile-${String(i).padStart(2, '0')}`, `map-tile-${String(i).padStart(2, '0')}.png`);
    }

    // ?? HUD icons ??
    this.load.image('hud-money', 'hud-money.png');
    this.load.image('hud-day', 'hud-day.png');

    // ?? Generated UI assets ??
    UI_ASSETS.forEach(asset => this.load.image(asset.key, `${import.meta.env.BASE_URL}${asset.path}`));

    // ?? BGM ??
    this.load.audio('bgm-grill', 'bgm-grill.mp3');
    this.load.video('intro-story-video', 'videos/r18-loop.mp4', true);

    // ?? Wave 6a: Rhythm chart + theme BGM ??
    // Chart/audio manifest. Keep song keys stable; GrillScene selects by gameState.
    const loadedAudio = new Set<string>();
    SONGS.forEach(song => {
      Object.values(song.variants).forEach(variant => {
        this.load.json(variant.chartKey, `${variant.chartPath}?v=${CHART_VERSION}`);
        if (!loadedAudio.has(variant.audioKey)) {
          this.load.audio(variant.audioKey, variant.audioPath);
          loadedAudio.add(variant.audioKey);
        }
      });
    });
  }

  create(): void {
    this.currentPage = 0;
    this.canAdvance = false;
    EventBus.emit('hide-panel');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.stopModeVideoBackground, this);
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    // Background ??will be recoloured per page
    const bg = this.add.graphics();
    bg.setDepth(0);
    this.drawBackground(bg, width, height, 0);

    // Title: logo-ex (preferred) ??cover (fallback) ??text fallback
    let title: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
    if (this.textures.exists('logo-ex')) {
      const logo = this.add.image(cx, height * 0.29, 'logo-ex');
      const maxW = width * 0.96;
      const maxH = height * 0.62;
      const scale = Math.min(maxW / logo.width, maxH / logo.height);
      logo.setScale(scale).setDepth(10);
      title = logo;
    } else if (this.textures.exists('cover')) {
      const cover = this.add.image(cx, height * 0.22, 'cover');
      const maxW = width * 0.85;
      const maxH = height * 0.22;
      const scale = Math.min(maxW / cover.width, maxH / cover.height);
      cover.setScale(scale).setDepth(10);
      title = cover;
    } else {
      // Fallback text title if image fails to load
      title = this.add.text(cx, cy - 110, '?詨?憭拐?', {
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
    sfx.playTitleVoice();
    this.input.once('pointerdown', () => {
      sfx.initOnUserGesture();
      sfx.playTitleVoice();
    });
    this.input.keyboard?.once('keydown', () => {
      sfx.initOnUserGesture();
      sfx.playTitleVoice();
    });

    // Story card background ??pushed down to avoid blocking the enlarged LOGO
    const storyY = height * 0.78;
    const storyBg = this.add.graphics();
    storyBg.fillStyle(0x000000, 0.75);
    storyBg.lineStyle(2, 0xffe600, 0.5);
    storyBg.fillRoundedRect(cx - 360, storyY - 90, 720, 180, 10);
    storyBg.strokeRoundedRect(cx - 360, storyY - 90, 720, 180, 10);
    storyBg.setAlpha(0).setDepth(5);

    // Story text (typing effect target, centred)
    const storyText = this.add.text(cx, storyY, '', {
      fontSize: '24px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#ffffff',
      align: 'center',
      lineSpacing: 10,
      wordWrap: { width: 700 },
    }).setOrigin(0.5).setAlpha(0).setDepth(6);

    // Page indicator dots (at bottom)
    const dotY = height - 30;
    const dots: Phaser.GameObjects.Graphics[] = [];
    for (let i = 0; i < PROLOGUE_PAGES.length; i++) {
      const dot = this.add.graphics();
      const dotX = cx + (i - 1) * 18;
      dot.fillStyle(i === 0 ? 0xffe600 : 0x555566, 1);
      dot.fillCircle(dotX, dotY, 4);
      dot.setAlpha(0).setDepth(6);
      dots.push(dot);
    }

    // "暺?蝜潛?" hint
    const hintText = this.add.text(cx, height - 48, '點擊繼續', {
      fontSize: '13px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#ffcc88',
    }).setOrigin(0.5).setAlpha(0).setDepth(6);

    // Pulsing hint animation (starts after hint fades in)
    const hintPulse = this.tweens.add({
      targets: hintText,
      alpha: { from: 0.9, to: 0.3 },
      duration: 700,
      yoyo: true,
      repeat: -1,
      paused: true,
    });

    // ?? Mode selection: ??憭批?憛???急 / 撠?⊥?嚗?????????????????
    // Helper: start the game with a chosen mode + difficulty
    const startGame = (mode: string, difficulty: 'hardcore' | 'casual') => {
      window.sessionStorage.removeItem('sausage-test-short-grill');
      this.stopModeVideoBackground();
      sfx.initOnUserGesture();
      if (difficulty === 'hardcore') {
        sfx.playHardcoreIntroVoice();
      } else {
        sfx.playKiyokuwaVoice();
      }
      resetCustomerEngine();
      resetAutoChessEngine();
      resetCasinoEngine();
      resetAchievements();
      const initialMap: Record<number, string> = {};
      for (const slot of GRID_SLOTS) {
        initialMap[slot.id] = slot.tier === 1 ? 'player' : (slot.opponentId || 'enemy');
      }
      const starterInventory: Record<string, number> = {};
      const starterPrices: Record<string, number> = {};
      for (const sausage of SAUSAGE_TYPES) {
        starterInventory[sausage.id] = 80;
        starterPrices[sausage.id] = sausage.suggestedPrice;
      }
      updateGameState({
        map: initialMap,
        playerSlot: 1,
        selectedSlot: 1,
        gameMode: mode,
        difficulty,
        inventory: starterInventory,
        purchaseQuantities: starterInventory,
        prices: starterPrices,
      });
      leftZone.disableInteractive();
      rightZone.disableInteractive();
      this.tweens.add({
        targets: [title, ...modeCardObjects],
        alpha: 0,
        duration: 180,
        ease: 'Quad.Out',
      });
      let songSelected = false;
      EventBus.once('song-select-done', () => {
        if (songSelected) return;
        songSelected = true;
        EventBus.emit('hide-panel');
        this.scene.start('GrillScene');
      });
      EventBus.emit('show-panel', 'song-select');
    };

    // ?券 alpha=0 ?梯?嚗rologue 蝯???fade in
    // 蝮桀? 40%嚗 60%嚗蒂蝵桐葉嚗 敺?width*0.20 ??width*0.80嚗 敺?0.50 ??0.76
    const modeCardW = Math.min(width * 0.34, height * 0.48 * (768 / 512), 470);
    const modeCardH = modeCardW * (512 / 768);
    const modeY = height * 0.73;
    const leftX = width * 0.31;
    const rightX = width * 0.69;

    const leftBg = this.add.image(leftX, modeY, 'ui-mode-hardcore-card')
      .setDisplaySize(modeCardW, modeCardH)
      .setDepth(15)
      .setAlpha(0);
    const rightBg = this.add.image(rightX, modeY, 'ui-mode-casual-card')
      .setDisplaySize(modeCardW, modeCardH)
      .setDepth(15)
      .setAlpha(0);

    const leftTitle = this.add.text(leftX, modeY - 6, '指烤火拼', {
      fontSize: '34px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#ffffff',
      stroke: '#3a0700',
      strokeThickness: 7,
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(20).setAlpha(0);

    const leftSub = this.add.text(leftX, modeY + 34, 'HARDCORE', {
      fontSize: '13px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#ffb23c',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(20).setAlpha(0);

    const leftDesc = this.add.text(leftX, modeY + 58, '完整經營壓力 / 高密度節奏', {
      fontSize: '13px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#ffd9a0',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(20).setAlpha(0);

    const rightTitle = this.add.text(rightX, modeY - 6, '小烤怡情', {
      fontSize: '34px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#ffffff',
      stroke: '#001414',
      strokeThickness: 8,
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(20).setAlpha(0);

    const rightSub = this.add.text(rightX, modeY + 34, 'CASUAL', {
      fontSize: '13px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#66fff0',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(20).setAlpha(0);

    const rightDesc = this.add.text(rightX, modeY + 58, '輕鬆節奏 / 快速體驗', {
      fontSize: '13px',
      fontFamily: 'Microsoft JhengHei, PingFang TC, sans-serif',
      color: '#d8fff8',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(20).setAlpha(0);

    const leftModeObjects = [leftBg, leftTitle, leftSub, leftDesc];
    const rightModeObjects = [rightBg, rightTitle, rightSub, rightDesc];
    const modeHoverBaseScale = new Map<Phaser.GameObjects.GameObject, { x: number; y: number }>();
    [...leftModeObjects, ...rightModeObjects].forEach((obj) => {
      if ('scaleX' in obj && 'scaleY' in obj) {
        const scalable = obj as Phaser.GameObjects.Image | Phaser.GameObjects.Text;
        modeHoverBaseScale.set(obj, { x: scalable.scaleX, y: scalable.scaleY });
      }
    });
    const setModeHover = (objects: Phaser.GameObjects.GameObject[], hovered: boolean) => {
      const scale = hovered ? 1.035 : 1;
      objects.forEach((obj) => {
        const base = modeHoverBaseScale.get(obj);
        if (base && 'setScale' in obj && typeof obj.setScale === 'function') {
          (obj as Phaser.GameObjects.Image | Phaser.GameObjects.Text).setScale(base.x * scale, base.y * scale);
        }
      });
    };

    const leftZone = this.add.zone(leftX, modeY, modeCardW * 0.86, modeCardH * 0.72);
    leftZone.on('pointerdown', () => startGame('normal', 'hardcore'));
    leftZone.on('pointerover', () => setModeHover(leftModeObjects, true));
    leftZone.on('pointerout',  () => setModeHover(leftModeObjects, false));

    const rightZone = this.add.zone(rightX, modeY, modeCardW * 0.86, modeCardH * 0.72);
    rightZone.on('pointerdown', () => startGame('simulation', 'casual'));
    rightZone.on('pointerover', () => setModeHover(rightModeObjects, true));
    rightZone.on('pointerout',  () => setModeHover(rightModeObjects, false));

    const enableModeZones = () => {
      leftZone.setInteractive({ cursor: 'pointer' });
      rightZone.setInteractive({ cursor: 'pointer' });
      sfx.playComePlayVoice();
    };

    // Collect for fade-in
    const modeCardObjects = [
      leftBg, rightBg,
      leftTitle, leftSub, leftDesc,
      rightTitle, rightSub, rightDesc,
    ];

    // ?? Typing engine ??????????????????????????????????????????????????
    const showPage = (pageIndex: number) => {
      this.canAdvance = false;
      hintPulse.pause();
      hintText.setAlpha(0);

      // Destroy previous page illustration
      if (this.prologueImage) {
        this.prologueImage.destroy();
        this.prologueImage = undefined;
      }

      // Show per-page illustration as near-fullscreen background
      const prologueImageKey = `prologue-${pageIndex + 1}`;
      if (this.textures.exists(prologueImageKey)) {
        const img = this.add.image(cx, cy, prologueImageKey);
        // Fill the screen (cover mode)
        const coverScale = Math.max(width / img.width, height / img.height);
        img.setScale(coverScale).setAlpha(0.55).setDepth(0);

        // Subtle slow zoom animation
        this.tweens.add({
          targets: img,
          scale: coverScale * 1.05,
          duration: 8000,
          ease: 'Sine.easeInOut',
        });

        this.prologueImage = img;
      }

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
            // Typing done ??allow advance
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
        // Skip typing ??show full text immediately
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
        // All pages done ??show mode selection cards
        hintPulse.stop();
        if (this.prologueImage) {
          this.prologueImage.destroy();
          this.prologueImage = undefined;
        }
        this.createModeVideoBackground(width, height);
        this.tweens.add({
          targets: title,
          y: height * 0.25,
          scaleX: title.scaleX * 1.45,
          scaleY: title.scaleY * 1.45,
          duration: 450,
          ease: 'Power2',
        });
        this.tweens.add({ targets: [storyBg, storyText, hintText, ...dots], alpha: 0, duration: 300 });
        this.tweens.add({
          targets: modeCardObjects,
          alpha: 1,
          duration: 600,
          ease: 'Power2',
          onComplete: enableModeZones,
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

    // ?? Initial fade-in sequence ???????????????????????????????????????
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

  private createModeVideoBackground(w: number, h: number): void {
    if (!this.cache.video.exists('intro-story-video')) return;
    if (this.modeVideo) return;

    try {
      const video = this.add.video(w / 2, h / 2, 'intro-story-video');
      const sourceW = video.width || 854;
      const sourceH = video.height || 480;
      const coverScale = Math.max(w / sourceW, h / sourceH);
      video
        .setScale(coverScale)
        .setDepth(1)
        .setAlpha(0.46)
        .setMute(true)
        .play(true);

      const shade = this.add.graphics();
      shade.setDepth(2);
      shade.fillStyle(0x06101f, 0.58);
      shade.fillRect(0, 0, w, h);

      this.modeVideo = video;
      this.modeVideoShade = shade;
    } catch (error) {
      console.warn('[BootScene] mode video background unavailable:', error);
    }
  }

  private stopModeVideoBackground(): void {
    if (this.modeVideo) {
      try {
        this.modeVideo.stop();
      } catch (_error) {
        // Ignore shutdown races while the scene is changing.
      }
      if (this.modeVideo.active) this.modeVideo.destroy();
      this.modeVideo = undefined;
    }
    if (this.modeVideoShade) {
      if (this.modeVideoShade.active) this.modeVideoShade.destroy();
      this.modeVideoShade = undefined;
    }
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


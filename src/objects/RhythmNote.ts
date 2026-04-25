// RhythmNote.ts — Sausage-shaped flying note for the taiko-style rhythm track (Wave 6a+)
import Phaser from 'phaser';
import type { ChartNote } from '../data/chart';
import { SAUSAGE_MAP } from '../data/sausages';

// Note body radius
const NOTE_RADIUS = 28;

// Colours per note type
const COLOR_DON = 0xff3344; // red — don (咚)
const COLOR_KA  = 0x3388ff; // blue — ka (喀)

export class RhythmNote extends Phaser.GameObjects.Container {
  /** The chart note data this object represents (readable by GrillScene). */
  public readonly note: ChartNote;

  /** Whether this note has already been judged (hit or auto-missed). Prevents double-judging. */
  private _hit = false;

  constructor(scene: Phaser.Scene, x: number, y: number, note: ChartNote) {
    super(scene, x, y);
    this.note = note;

    // ── Body circle ─────────────────────────────────────────────────────────
    const bodyColor = note.type === 'don' ? COLOR_DON : COLOR_KA;
    const body = scene.add.graphics();
    // Fill
    body.fillStyle(bodyColor, 1);
    body.fillCircle(0, 0, NOTE_RADIUS);
    // White stroke
    body.lineStyle(3, 0xffffff, 0.9);
    body.strokeCircle(0, 0, NOTE_RADIUS);
    this.add(body);

    // ── Sausage artwork or emoji fallback ────────────────────────────────────
    const textureKey = `sausage-${note.sausage}`;
    if (scene.textures.exists(textureKey)) {
      // Scale the sausage PNG to fit inside the circle (target ~40×40)
      const artImage = scene.add.image(0, 0, textureKey);
      const targetSize = NOTE_RADIUS * 1.3;
      const scale = Math.min(targetSize / artImage.width, targetSize / artImage.height);
      artImage.setScale(scale);
      this.add(artImage);
    } else {
      // Fallback: show sausage emoji from data
      const sausageType = SAUSAGE_MAP[note.sausage];
      const fallbackEmoji = sausageType?.emoji ?? '';
      const emojiText = scene.add.text(0, 0, fallbackEmoji, {
        fontSize: '22px',
      }).setOrigin(0.5);
      this.add(emojiText);
    }

    // Register with scene so depth / input work correctly
    scene.add.existing(this);
  }

  /**
   * Update the note's x position based on current rhythm time.
   *
   * Linear interpolation: at (hitTime - leadTime) the note is at spawnX,
   * at hitTime it is at hitX.
   *
   * @param currentTime  Current rhythm clock time in seconds
   * @param hitTime      Scheduled hit time in seconds
   * @param hitX         X coordinate of the judgement circle
   * @param spawnX       X coordinate where the note spawns (right edge)
   * @param leadTime     Seconds before hit time when the note appears
   */
  /** Mark this note as judged. After calling this, isHit returns true. */
  markHit(): void {
    this._hit = true;
  }

  /** True if this note has already been judged (hit or auto-missed). */
  get isHit(): boolean {
    return this._hit;
  }

  setPositionByTime(
    currentTime: number,
    hitTime: number,
    hitX: number,
    spawnX: number,
    leadTime: number,
  ): void {
    const ratio = (currentTime - (hitTime - leadTime)) / leadTime;
    this.x = spawnX + (hitX - spawnX) * ratio;
  }
}

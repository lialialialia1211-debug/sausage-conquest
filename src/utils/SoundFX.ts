/**
 * SoundFX — Procedural sound effects via Web Audio API.
 * No external audio files required. All sounds are generated at runtime.
 */

class SoundFX {
  private ctx: AudioContext | null = null;
  private muted = false;
  private masterGain: GainNode | null = null;

  initOnUserGesture(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 1;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 1;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain) {
      this.masterGain.gain.value = muted ? 0 : 1;
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  // ================================================================
  // Grill sounds
  // ================================================================

  /** Flip sausage — short "swish" (50ms bandpass white noise) */
  playFlip(): void {
    this.playNoise(0.05, 2000, 'bandpass', 0.25);
  }

  /** Perfect serve — bright "ding!" (880 Hz sine, 200ms, quick decay) */
  playPerfect(): void {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;
    const duration = 0.2;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain!);

    osc.start(now);
    osc.stop(now + duration);
  }

  /** Burnt — hissing "sss" (300ms lowpass noise with decay) */
  playBurnt(): void {
    this.playNoise(0.3, 800, 'lowpass', 0.15);
  }

  /** Cash register — double ding (C6 = 1047 Hz, two pings 50ms apart) */
  playCashRegister(): void {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;

    const playDing = (startTime: number): void => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1047, startTime);

      gain.gain.setValueAtTime(0.35, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(startTime);
      osc.stop(startTime + 0.18);
    };

    playDing(now);
    playDing(now + 0.05);
  }

  /** Customer leaves unhappy — descending tone (300 Hz → 200 Hz over 200ms) */
  playCustomerLeave(): void {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;
    const duration = 0.2;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.linearRampToValueAtTime(200, now + duration);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain!);

    osc.start(now);
    osc.stop(now + duration);
  }

  // ================================================================
  // Battle sounds
  // ================================================================

  /** Attack hit — punch sound (80ms noise burst + 100ms low sine at 100 Hz) */
  playAttack(): void {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;

    // Noise transient
    this.playNoiseAt(ctx, now, 0.08, 300, 'bandpass', 0.3);

    // Low thud
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain!);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  /** Critical hit — bigger punch (attack + extra volume + high-freq shimmer) */
  playCritical(): void {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;

    // Louder noise burst
    this.playNoiseAt(ctx, now, 0.1, 400, 'bandpass', 0.5);

    // Deep thud — louder than regular attack
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);

    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain!);

    osc.start(now);
    osc.stop(now + 0.15);

    // High shimmer for "critical" feel
    const shimmer = ctx.createOscillator();
    const shimmerGain = ctx.createGain();

    shimmer.type = 'sine';
    shimmer.frequency.setValueAtTime(1200, now);
    shimmer.frequency.exponentialRampToValueAtTime(800, now + 0.12);

    shimmerGain.gain.setValueAtTime(0.15, now);
    shimmerGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    shimmer.connect(shimmerGain);
    shimmerGain.connect(this.masterGain!);

    shimmer.start(now);
    shimmer.stop(now + 0.12);
  }

  /** Victory — ascending arpeggio C5-E5-G5 (100ms each) */
  playVictory(): void {
    const notes: [number, number][] = [
      [523.25, 0],    // C5
      [659.25, 0.1],  // E5
      [783.99, 0.2],  // G5
    ];
    this.playArpeggio(notes, 0.1, 0.4);
  }

  /** Sausage swing — whoosh (sawtooth 400→100 Hz, 150ms) */
  playSwing(): void {
    if (!this.ctx || this.muted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
    osc.connect(gain).connect(this.masterGain!);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  /** Heavy hit impact — low thump + noise burst */
  playHeavyHit(): void {
    if (!this.ctx || this.muted) return;
    // Low thump
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
    osc.connect(gain).connect(this.masterGain!);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
    // Noise burst
    const bufferSize = this.ctx.sampleRate * 0.08;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
    noise.connect(noiseGain).connect(this.masterGain!);
    noise.start();
  }

  /** Special attack explosion — shaped noise burst with lowpass sweep */
  playExplosion(): void {
    if (!this.ctx || this.muted) return;
    const bufferSize = this.ctx.sampleRate * 0.4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.4);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);
    noise.connect(filter).connect(gain).connect(this.masterGain!);
    noise.start();
  }

  /** Player gets hit — descending square wave (200→100 Hz, 150ms) */
  playPlayerHit(): void {
    if (!this.ctx || this.muted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
    osc.connect(gain).connect(this.masterGain!);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  /** Defeat — descending arpeggio G4-E4-C4 (150ms each) */
  playDefeat(): void {
    const notes: [number, number][] = [
      [392.0, 0],     // G4
      [329.63, 0.15], // E4
      [261.63, 0.3],  // C4
    ];
    this.playArpeggio(notes, 0.15, 0.3);
  }

  // ================================================================
  // UI sounds
  // ================================================================

  /** Button click — light tap (660 Hz sine, 50ms, quick decay) */
  playClick(): void {
    this.playTone(660, 0.05, 'sine', 0.2);
  }

  /** Achievement unlocked — sparkle (ascending arpeggio with harmonics) */
  playAchievement(): void {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;

    // Base arpeggio
    const notes: [number, number][] = [
      [523.25, 0],    // C5
      [659.25, 0.07], // E5
      [783.99, 0.14], // G5
      [1046.5, 0.21], // C6
    ];

    notes.forEach(([freq, offset]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + offset;

      osc.type = 'triangle'; // richer than sine — adds harmonic shimmer
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(t);
      osc.stop(t + 0.18);
    });
  }

  /** Event notification — two-tone alert (440 Hz then 554 Hz, 100ms each) */
  playEventAlert(): void {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;

    const playAlertTone = (freq: number, startTime: number): void => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, startTime);

      // Square wave is naturally harsh — keep volume low
      gain.gain.setValueAtTime(0.08, startTime);
      gain.gain.setValueAtTime(0.08, startTime + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.1);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(startTime);
      osc.stop(startTime + 0.1);
    };

    playAlertTone(440, now);
    playAlertTone(554.37, now + 0.11);
  }

  // ================================================================
  // Helper methods
  // ================================================================

  /**
   * Play a simple oscillator tone.
   * Connects to masterGain so mute is respected.
   */
  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume = 0.3,
  ): void {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain!);

    osc.start(now);
    osc.stop(now + duration);
  }

  /**
   * Play filtered white noise starting at ctx.currentTime.
   */
  private playNoise(
    duration: number,
    filterFreq: number,
    filterType: BiquadFilterType = 'bandpass',
    volume = 0.2,
  ): void {
    const ctx = this.ensureContext();
    this.playNoiseAt(ctx, ctx.currentTime, duration, filterFreq, filterType, volume);
  }

  /**
   * Play filtered white noise at a specific AudioContext timestamp.
   * Separated from playNoise so battle sounds can schedule noise precisely.
   */
  private playNoiseAt(
    ctx: AudioContext,
    startTime: number,
    duration: number,
    filterFreq: number,
    filterType: BiquadFilterType,
    volume: number,
  ): void {
    const sampleRate = ctx.sampleRate;
    const bufferSize = Math.ceil(sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, startTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);

    source.start(startTime);
    source.stop(startTime + duration);
  }

  /**
   * Play a sequence of [frequency, timeOffset] pairs as sine tones.
   * @param notes     Array of [frequency (Hz), start offset (seconds)]
   * @param duration  Duration of each note in seconds
   * @param volume    Peak gain per note
   */
  private playArpeggio(
    notes: [number, number][],
    duration: number,
    volume: number,
  ): void {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;

    notes.forEach(([freq, offset]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + offset;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(t);
      osc.stop(t + duration);
    });
  }
}

export const sfx = new SoundFX();

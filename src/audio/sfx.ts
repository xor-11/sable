import { GameEvent } from '../engine/types';

/**
 * Retro Web Audio API Chiptune Sound Effects Synthesizer.
 * Procedurally generates crisp low-latency audio cues without external audio files.
 */

const MUTE_STORAGE_KEY = 'sable_audio_muted';

class ChiptuneAudioController {
  private ctx: AudioContext | null = null;
  private muted: boolean;

  constructor() {
    let savedMute = false;
    try {
      savedMute = localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
    } catch {
      savedMute = false;
    }
    this.muted = savedMute;
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(value: boolean): void {
    this.muted = value;
    try {
      localStorage.setItem(MUTE_STORAGE_KEY, String(value));
    } catch {
      // Ignore
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    if (!this.muted) {
      this.playTone(520, 0.05, 'square', 0.04, 680);
    }
    return this.muted;
  }

  private getContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private playTone(
    freqStart: number,
    durationSec: number,
    type: OscillatorType,
    volume: number,
    freqEnd?: number,
    delaySec = 0
  ): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + durationSec);
    }

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + durationSec + 0.01);
  }

  private playNoiseBurst(durationSec: number, volume: number, delaySec = 0): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime + delaySec;
    const sampleCount = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(900, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    src.start(now);
    src.stop(now + durationSec + 0.01);
  }

  playEvents(events: GameEvent[]): void {
    if (this.muted || events.length === 0) return;

    // Prioritize highest-impact sound events to avoid cacophony in multi-event turns
    const priority = (t: GameEvent['type']): number => {
      switch (t) {
        case 'VICTORY':
        case 'DEATH':
        case 'FUSE_REVIVE':
          return 10;
        case 'BOSS_PHASE':
        case 'LEVEL_UP':
        case 'STAIRS':
          return 8;
        case 'SURGE':
        case 'EXPLOSION':
        case 'SCROLL':
          return 7;
        case 'CRIT':
        case 'KILL':
          return 6;
        case 'HIT':
        case 'PLAYER_HIT':
        case 'HEAL':
        case 'ENERGY':
          return 4;
        case 'PICKUP':
        case 'TELEPORT':
          return 3;
        case 'BUMP_WALL':
          return 2;
        default:
          return 1;
      }
    };

    const sorted = [...events].sort((a, b) => priority(b.type) - priority(a.type));
    const top = sorted[0];

    switch (top.type) {
      case 'STEP':
        this.playTone(135, 0.025, 'triangle', 0.025, 95);
        break;
      case 'BUMP_WALL':
        this.playTone(85, 0.04, 'square', 0.03, 60);
        break;
      case 'HIT':
        this.playTone(260, 0.06, 'square', 0.055, 110);
        break;
      case 'CRIT':
        this.playTone(440, 0.06, 'sawtooth', 0.065, 220);
        this.playTone(660, 0.09, 'square', 0.055, 880, 0.04);
        break;
      case 'PLAYER_HIT':
        this.playTone(165, 0.09, 'sawtooth', 0.06, 75);
        break;
      case 'KILL':
        this.playTone(320, 0.06, 'square', 0.055, 540);
        this.playTone(540, 0.09, 'square', 0.045, 760, 0.05);
        break;
      case 'SURGE':
      case 'SCROLL':
        this.playTone(880, 0.14, 'sawtooth', 0.06, 260);
        this.playNoiseBurst(0.12, 0.045, 0.02);
        break;
      case 'EXPLOSION':
        this.playNoiseBurst(0.18, 0.075);
        this.playTone(120, 0.18, 'sawtooth', 0.06, 40);
        break;
      case 'PICKUP':
        this.playTone(520, 0.05, 'triangle', 0.05, 780);
        break;
      case 'HEAL':
      case 'ENERGY':
        this.playTone(400, 0.07, 'triangle', 0.055, 620);
        this.playTone(620, 0.09, 'triangle', 0.05, 840, 0.06);
        break;
      case 'TELEPORT':
        this.playTone(720, 0.08, 'sine', 0.045, 240);
        break;
      case 'LEVEL_UP':
        this.playTone(440, 0.08, 'square', 0.05, 440, 0);
        this.playTone(554, 0.08, 'square', 0.05, 554, 0.08);
        this.playTone(659, 0.08, 'square', 0.05, 659, 0.16);
        this.playTone(880, 0.18, 'square', 0.055, 880, 0.24);
        break;
      case 'STAIRS':
        this.playTone(420, 0.07, 'triangle', 0.05, 310, 0);
        this.playTone(310, 0.08, 'triangle', 0.05, 210, 0.07);
        this.playTone(210, 0.11, 'triangle', 0.05, 140, 0.14);
        break;
      case 'BOSS_PHASE':
        this.playTone(180, 0.12, 'sawtooth', 0.065, 110, 0);
        this.playTone(220, 0.16, 'sawtooth', 0.065, 95, 0.12);
        break;
      case 'FUSE_REVIVE':
        this.playNoiseBurst(0.1, 0.05, 0);
        this.playTone(330, 0.1, 'square', 0.06, 660, 0.08);
        this.playTone(660, 0.16, 'square', 0.06, 990, 0.18);
        break;
      case 'VICTORY':
        this.playTone(523, 0.1, 'square', 0.06, 523, 0);
        this.playTone(659, 0.1, 'square', 0.06, 659, 0.11);
        this.playTone(784, 0.1, 'square', 0.06, 784, 0.22);
        this.playTone(1046, 0.28, 'square', 0.065, 1046, 0.33);
        break;
      case 'DEATH':
        this.playTone(260, 0.16, 'sawtooth', 0.065, 180, 0);
        this.playTone(180, 0.18, 'sawtooth', 0.065, 110, 0.16);
        this.playTone(110, 0.34, 'sawtooth', 0.06, 55, 0.34);
        break;
    }
  }
}

export const sfx = new ChiptuneAudioController();

/**
 * Web Audio API Sound Synthesizer for Silkroad Bot
 * Generates custom retro and game-style alert chimes natively without external mp3 files.
 */

class BotAudioSynth {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.5;
  }

  initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  setEnabled(val) {
    this.enabled = !!val;
  }

  playTone(freq, type = 'sine', duration = 0.15, delay = 0, gainVal = 0.3) {
    if (!this.enabled) return;
    this.initContext();
    if (!this.ctx) return;

    const startTime = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    const actualGain = gainVal * this.volume;
    gainNode.gain.setValueAtTime(0.001, startTime);
    gainNode.gain.exponentialRampToValueAtTime(actualGain, startTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  playStart() {
    // Joyful ascending arpeggio (C5 -> E5 -> G5 -> C6)
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      this.playTone(freq, 'triangle', 0.12, idx * 0.08, 0.25);
    });
  }

  playStop() {
    // Descending tone (G5 -> E5 -> C5)
    const notes = [783.99, 659.25, 523.25];
    notes.forEach((freq, idx) => {
      this.playTone(freq, 'sine', 0.15, idx * 0.1, 0.25);
    });
  }

  playAlert() {
    // Urgent dual-beep warning
    this.playTone(880, 'sawtooth', 0.12, 0, 0.3);
    this.playTone(880, 'sawtooth', 0.12, 0.15, 0.3);
  }

  playRareDrop() {
    // High-pitched sparkling chime
    const notes = [1318.51, 1567.98, 2093.00, 2637.02];
    notes.forEach((freq, idx) => {
      this.playTone(freq, 'sine', 0.18, idx * 0.07, 0.3);
    });
  }

  playDeath() {
    // Deep minor chord
    this.playTone(220, 'sawtooth', 0.6, 0, 0.35);
    this.playTone(261.63, 'sawtooth', 0.6, 0.05, 0.3);
    this.playTone(329.63, 'sawtooth', 0.7, 0.1, 0.25);
  }

  playClick() {
    this.playTone(1200, 'sine', 0.03, 0, 0.1);
  }
}

// Attach to window / export
if (typeof window !== 'undefined') {
  window.BotAudioSynth = BotAudioSynth;
}

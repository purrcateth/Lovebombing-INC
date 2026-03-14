// ---------------------------------------------------------------------------
// BeatAudioEngine - Web Audio API drum sequencer (no samples, pure synthesis)
// ---------------------------------------------------------------------------

export interface BeatPattern {
  bpm: number;
  steps: number;
  tracks: BeatTrack[];
}

export interface BeatTrack {
  name: string;
  instrument: string; // "kick" | "snare" | "hihat" | "clap" | "melody_C4" etc. | "recording_0" etc.
  pattern: boolean[];
  volume: number;
}

// Melody note frequencies (C4 - B4 + C5)
export const MELODY_NOTES: { name: string; freq: number; key: string }[] = [
  { name: "C4", freq: 261.63, key: "c4" },
  { name: "D4", freq: 293.66, key: "d4" },
  { name: "E4", freq: 329.63, key: "e4" },
  { name: "F4", freq: 349.23, key: "f4" },
  { name: "G4", freq: 392.0, key: "g4" },
  { name: "A4", freq: 440.0, key: "a4" },
  { name: "B4", freq: 493.88, key: "b4" },
  { name: "C5", freq: 523.25, key: "c5" },
];

// ---------------------------------------------------------------------------
// Default pattern factory
// ---------------------------------------------------------------------------

export function createDefaultPattern(): BeatPattern {
  const steps = 16;
  return {
    bpm: 120,
    steps,
    tracks: [
      {
        name: "Kick",
        instrument: "kick",
        pattern: new Array(steps).fill(false),
        volume: 0.9,
      },
      {
        name: "Snare",
        instrument: "snare",
        pattern: new Array(steps).fill(false),
        volume: 0.7,
      },
      {
        name: "Hi-Hat",
        instrument: "hihat",
        pattern: new Array(steps).fill(false),
        volume: 0.5,
      },
      {
        name: "Clap",
        instrument: "clap",
        pattern: new Array(steps).fill(false),
        volume: 0.6,
      },
      // Melody notes
      ...MELODY_NOTES.map((note) => ({
        name: note.name,
        instrument: `melody_${note.key}`,
        pattern: new Array(steps).fill(false),
        volume: 0.5,
      })),
    ],
  };
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class BeatAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Scheduler state
  private timerId: ReturnType<typeof setInterval> | null = null;
  private currentStep = 0;
  private nextStepTime = 0;
  private pattern: BeatPattern | null = null;
  private onStepChange: ((step: number) => void) | null = null;

  // Recording buffers (keyed by instrument name)
  private recordingBuffers: Map<string, AudioBuffer> = new Map();

  // Lookahead constants (seconds / ms)
  private readonly scheduleAheadTime = 0.1; // how far ahead to schedule (s)
  private readonly lookaheadMs = 25; // how often the scheduler fires (ms)

  // ---------- public API ----------

  /** Create / resume AudioContext (call on user gesture). */
  init(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  /** Start playback of the given pattern. */
  play(pattern: BeatPattern, onStepChange?: (step: number) => void): void {
    this.init();
    this.stop();

    this.pattern = pattern;
    this.onStepChange = onStepChange ?? null;
    this.currentStep = 0;
    this.nextStepTime = this.ctx!.currentTime + 0.05; // tiny lead-in

    this.timerId = setInterval(() => this.scheduler(), this.lookaheadMs);
  }

  /** Stop playback. */
  stop(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.currentStep = 0;
    this.pattern = null;
    this.onStepChange = null;
  }

  /** Update tempo (takes effect on next scheduled step). */
  setTempo(bpm: number): void {
    if (this.pattern) {
      this.pattern.bpm = bpm;
    }
  }

  /** Update the pattern while playing (e.g. when user toggles cells). */
  updatePattern(pattern: BeatPattern): void {
    if (this.pattern) {
      this.pattern.tracks = pattern.tracks;
      this.pattern.bpm = pattern.bpm;
    }
  }

  /** Preview a single instrument sound immediately (on cell click). */
  previewSound(instrument: string, volume: number = 0.7): void {
    this.init();
    const now = this.ctx!.currentTime;
    this.triggerInstrument(instrument, now, volume);
  }

  /** Store a recorded audio buffer for playback in the sequencer. */
  addRecordingBuffer(instrumentKey: string, buffer: AudioBuffer): void {
    this.recordingBuffers.set(instrumentKey, buffer);
  }

  /** Record audio from microphone, returns the buffer. */
  async recordAudio(durationMs: number = 2000): Promise<AudioBuffer> {
    this.init();
    const ctx = this.ctx!;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = ctx.createMediaStreamSource(stream);

    const sampleRate = ctx.sampleRate;
    const length = Math.ceil(sampleRate * (durationMs / 1000));
    const offlineCtx = new OfflineAudioContext(1, length, sampleRate);

    // We use MediaRecorder for simplicity, then decode
    const mediaRecorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];

    return new Promise<AudioBuffer>((resolve, reject) => {
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        source.disconnect();
        try {
          const blob = new Blob(chunks, { type: "audio/webm" });
          const arrayBuffer = await blob.arrayBuffer();
          const decoded = await ctx.decodeAudioData(arrayBuffer);

          // Trim to requested duration
          const trimmedLength = Math.min(decoded.length, length);
          const trimmedBuffer = ctx.createBuffer(1, trimmedLength, sampleRate);
          trimmedBuffer.copyToChannel(decoded.getChannelData(0).slice(0, trimmedLength), 0);

          resolve(trimmedBuffer);
        } catch (err) {
          reject(err);
        }
      };

      mediaRecorder.onerror = () => {
        stream.getTracks().forEach((t) => t.stop());
        source.disconnect();
        reject(new Error("Recording failed"));
      };

      mediaRecorder.start();
      setTimeout(() => mediaRecorder.stop(), durationMs);
    });
  }

  // ---------- scheduler ----------

  private scheduler(): void {
    if (!this.ctx || !this.pattern) return;

    while (this.nextStepTime < this.ctx.currentTime + this.scheduleAheadTime) {
      this.scheduleStep(this.currentStep, this.nextStepTime);
      this.advanceStep();
    }
  }

  private scheduleStep(step: number, time: number): void {
    if (!this.pattern) return;

    // Fire UI callback (roughly aligned – push to next frame)
    const delayMs = Math.max(0, (time - this.ctx!.currentTime) * 1000);
    setTimeout(() => {
      this.onStepChange?.(step);
    }, delayMs);

    // Trigger each active track
    for (const track of this.pattern.tracks) {
      if (!track.pattern[step]) continue;
      this.triggerInstrument(track.instrument, time, track.volume);
    }
  }

  private triggerInstrument(instrument: string, time: number, volume: number): void {
    if (instrument.startsWith("melody_")) {
      const key = instrument.replace("melody_", "");
      const note = MELODY_NOTES.find((n) => n.key === key);
      if (note) this.playMelody(time, volume, note.freq);
    } else if (instrument.startsWith("recording_")) {
      this.playRecording(time, volume, instrument);
    } else {
      switch (instrument) {
        case "kick":
          this.playKick(time, volume);
          break;
        case "snare":
          this.playSnare(time, volume);
          break;
        case "hihat":
          this.playHiHat(time, volume);
          break;
        case "clap":
          this.playClap(time, volume);
          break;
      }
    }
  }

  private advanceStep(): void {
    if (!this.pattern) return;
    const secondsPerStep = 60 / this.pattern.bpm / 4; // 16th notes
    this.nextStepTime += secondsPerStep;
    this.currentStep = (this.currentStep + 1) % this.pattern.steps;
  }

  // ---------- synthesised drum sounds (808-style, inspired by Ableton Learning Music) ----------

  /**
   * Kick: deep 808 kick with sine wave pitch sweep and sub-bass body.
   */
  private playKick(time: number, volume: number): void {
    const ctx = this.ctx!;

    // Main body — sine sweep from 160 Hz down to 50 Hz
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(160, time);
    osc.frequency.exponentialRampToValueAtTime(50, time + 0.07);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.3);

    gain.gain.setValueAtTime(volume, time);
    gain.gain.setValueAtTime(volume * 0.8, time + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(time);
    osc.stop(time + 0.4);

    // Click transient — short burst for attack
    const click = ctx.createOscillator();
    const clickGain = ctx.createGain();
    click.type = "sine";
    click.frequency.setValueAtTime(1500, time);
    click.frequency.exponentialRampToValueAtTime(200, time + 0.02);
    clickGain.gain.setValueAtTime(volume * 0.3, time);
    clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
    click.connect(clickGain);
    clickGain.connect(this.masterGain!);
    click.start(time);
    click.stop(time + 0.02);
  }

  /**
   * Snare: 808-style snare with tuned body oscillators + noise snap.
   */
  private playSnare(time: number, volume: number): void {
    const ctx = this.ctx!;

    // --- noise component (snare wires) ---
    const noiseDuration = 0.2;
    const noiseBuffer = this.createNoiseBuffer(noiseDuration);
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;

    const hipass = ctx.createBiquadFilter();
    hipass.type = "highpass";
    hipass.frequency.value = 2000;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(volume * 0.7, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + noiseDuration);

    noiseSrc.connect(hipass);
    hipass.connect(noiseGain);
    noiseGain.connect(this.masterGain!);
    noiseSrc.start(time);
    noiseSrc.stop(time + noiseDuration);

    // --- body tone (two detuned oscillators for thickness) ---
    const freqs = [180, 330];
    for (const freq of freqs) {
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      oscGain.gain.setValueAtTime(volume * 0.5, time);
      oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
      osc.connect(oscGain);
      oscGain.connect(this.masterGain!);
      osc.start(time);
      osc.stop(time + 0.1);
    }
  }

  /**
   * Hi-Hat: metallic closed hi-hat using square waves at inharmonic ratios + highpass noise.
   */
  private playHiHat(time: number, volume: number): void {
    const ctx = this.ctx!;
    const duration = 0.08;

    // Metallic component — stacked square waves at inharmonic frequencies
    const ratios = [2, 3, 4.16, 5.43, 6.79, 8.21];
    const fundamental = 40;
    for (const ratio of ratios) {
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = fundamental * ratio;
      oscGain.gain.setValueAtTime(volume * 0.04, time);
      oscGain.gain.exponentialRampToValueAtTime(0.001, time + duration);

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = "bandpass";
      bandpass.frequency.value = 10000;
      bandpass.Q.value = 1;

      osc.connect(bandpass);
      bandpass.connect(oscGain);
      oscGain.connect(this.masterGain!);
      osc.start(time);
      osc.stop(time + duration);
    }

    // Noise shimmer
    const noiseBuffer = this.createNoiseBuffer(duration);
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    const hipass = ctx.createBiquadFilter();
    hipass.type = "highpass";
    hipass.frequency.value = 7000;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(volume * 0.3, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    noiseSrc.connect(hipass);
    hipass.connect(noiseGain);
    noiseGain.connect(this.masterGain!);
    noiseSrc.start(time);
    noiseSrc.stop(time + duration);
  }

  /**
   * Clap: realistic handclap with multiple staggered noise bursts
   * followed by a longer reverb-like tail — 808 style.
   */
  private playClap(time: number, volume: number): void {
    const ctx = this.ctx!;

    // 3-4 rapid micro-bursts simulating multiple hands
    const burstCount = 4;
    const burstSpacing = 0.012; // 12ms between each micro-burst
    const burstDuration = 0.025;

    for (let i = 0; i < burstCount; i++) {
      const offset = time + i * burstSpacing;
      const noiseBuffer = this.createNoiseBuffer(burstDuration);
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = noiseBuffer;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = "bandpass";
      bandpass.frequency.value = 2400;
      bandpass.Q.value = 0.5;

      const gain = ctx.createGain();
      const burstVol = volume * (0.6 + i * 0.13); // crescendo
      gain.gain.setValueAtTime(burstVol, offset);
      gain.gain.exponentialRampToValueAtTime(0.001, offset + burstDuration);

      noiseSrc.connect(bandpass);
      bandpass.connect(gain);
      gain.connect(this.masterGain!);
      noiseSrc.start(offset);
      noiseSrc.stop(offset + burstDuration);
    }

    // Longer tail (reverb body)
    const tailStart = time + burstCount * burstSpacing;
    const tailDuration = 0.15;
    const tailBuffer = this.createNoiseBuffer(tailDuration);
    const tailSrc = ctx.createBufferSource();
    tailSrc.buffer = tailBuffer;

    const tailBP = ctx.createBiquadFilter();
    tailBP.type = "bandpass";
    tailBP.frequency.value = 2200;
    tailBP.Q.value = 0.8;

    const tailGain = ctx.createGain();
    tailGain.gain.setValueAtTime(volume * 0.8, tailStart);
    tailGain.gain.exponentialRampToValueAtTime(0.001, tailStart + tailDuration);

    tailSrc.connect(tailBP);
    tailBP.connect(tailGain);
    tailGain.connect(this.masterGain!);
    tailSrc.start(tailStart);
    tailSrc.stop(tailStart + tailDuration);
  }

  /**
   * Melody: sine wave with a soft attack/decay envelope at the given frequency.
   */
  private playMelody(time: number, volume: number, freq: number): void {
    const ctx = this.ctx!;
    const duration = 0.25;

    const osc = ctx.createOscillator();
    osc.type = "triangle"; // warm, rounded tone
    osc.frequency.setValueAtTime(freq, time);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume * 0.6, time + 0.01); // fast attack
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration); // smooth decay

    osc.connect(gain);
    gain.connect(this.masterGain!);

    osc.start(time);
    osc.stop(time + duration);
  }

  /**
   * Play a recorded audio buffer.
   */
  private playRecording(time: number, volume: number, instrumentKey: string): void {
    const ctx = this.ctx!;
    const buffer = this.recordingBuffers.get(instrumentKey);
    if (!buffer) return;

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, time);

    src.connect(gain);
    gain.connect(this.masterGain!);

    src.start(time);
  }

  // ---------- helpers ----------

  private createNoiseBuffer(duration: number): AudioBuffer {
    const ctx = this.ctx!;
    const sampleRate = ctx.sampleRate;
    const length = Math.ceil(sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }
}

import type { State } from "@/sim/types";

export class DeskSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private humGain: GainNode | null = null;
  private alarmGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private boomed = false;
  muted = false;

  unlock(): void {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!this.ctx) {
      const ctx = new Ctx();
      this.ctx = ctx;
      const master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);
      this.master = master;

      const humGain = ctx.createGain();
      humGain.gain.value = 0;
      humGain.connect(master);
      this.humGain = humGain;

      const low = ctx.createOscillator();
      low.type = "sine";
      low.frequency.value = 48;
      low.connect(humGain);
      const mid = ctx.createOscillator();
      mid.type = "triangle";
      mid.frequency.value = 96;
      const midGain = ctx.createGain();
      midGain.gain.value = 0.22;
      mid.connect(midGain);
      midGain.connect(humGain);
      low.start();
      mid.start();

      const alarm = ctx.createOscillator();
      alarm.type = "square";
      alarm.frequency.value = 620;
      const alarmGain = ctx.createGain();
      alarmGain.gain.value = 0;
      alarm.connect(alarmGain);
      alarmGain.connect(master);
      alarm.start();
      this.alarmGain = alarmGain;

      const samples = ctx.sampleRate;
      const buffer = ctx.createBuffer(1, samples, samples);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buffer;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.85, this.ctx.currentTime, 0.03);
    }
  }

  update(s: State, severe: boolean): void {
    if (!this.ctx || !this.humGain || !this.alarmGain) return;
    const now = this.ctx.currentTime;
    const pumps = s.pumps.filter(Boolean).length;
    const hum = this.muted ? 0 : Math.min(0.16, 0.02 + pumps * 0.01 + s.n * s.steam * 0.05);
    this.humGain.gain.setTargetAtTime(hum, now, 0.08);
    const pulse = severe && !this.muted ? Math.abs(Math.sin(s.realT * 7)) * 0.035 : 0;
    this.alarmGain.gain.setTargetAtTime(pulse, now, 0.02);
    if (!this.muted && s.n > 0.02) {
      const rate = Math.min(40, s.n * 14);
      if (Math.random() < rate / 60) this.blip(900 + Math.random() * 800, 0.012, 0.02);
    }
    if (s.exploded && !this.boomed) {
      this.boomed = true;
      this.boom();
    }
    if (!s.exploded) this.boomed = false;
  }

  click(): void {
    this.blip(160 + Math.random() * 50, 0.045, 0.04);
  }

  private blip(freq: number, dur: number, gain: number): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(gain, ctx.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(amp);
    amp.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  }

  private boom(): void {
    if (!this.ctx || !this.master || !this.noise || this.muted) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 400;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.5, ctx.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.4);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    src.start();
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(90, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(28, ctx.currentTime + 1);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.4, ctx.currentTime);
    og.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
    osc.connect(og);
    og.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + 1.3);
  }
}

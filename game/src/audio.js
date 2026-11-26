// Synthesised sound: no audio files, no network. The engine is two detuned
// oscillators through a low-pass filter, the wind is filtered noise, and the
// ring chime, touchdown thud and crash are short envelopes. Everything is
// created lazily on the first user gesture, so the page never fights the
// browser's autoplay rules; screenshot mode never starts audio at all.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc1 = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.45;
      master.connect(ctx.destination);
      engineOsc1 = ctx.createOscillator();
      engineOsc1.type = 'sawtooth';
      engineOsc1.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 110.5;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc1.connect(filter);
      engineOsc2.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc1.start();
      engineOsc2.start();
      // Wind: a looped noise buffer through a band-pass.
      const len = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      noise.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      noise.start();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function tone(freq, at, dur, type = 'sine', gain = 0.2) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  return {
    // Call from any user gesture; safe to call repeatedly.
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
    },
    // Per-frame: throttle 0..1, speed m/s, onGround.
    update(throttle, speed, onGround) {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      const freq = 48 + throttle * 72;
      engineOsc1.frequency.setTargetAtTime(freq, t, 0.1);
      engineOsc2.frequency.setTargetAtTime(freq * 2.01, t, 0.1);
      engineGain.gain.setTargetAtTime(onGround ? 0.02 + throttle * 0.05 : 0.03 + throttle * 0.09, t, 0.1);
      windGain.gain.setTargetAtTime(Math.min(0.16, (speed / 82) * 0.16), t, 0.15);
      windFilter.frequency.setTargetAtTime(500 + speed * 9, t, 0.15);
    },
    ring() {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      tone(880, t, 0.35, 'sine', 0.22);
      tone(1318.5, t + 0.09, 0.4, 'sine', 0.18);
    },
    land() {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      tone(72, t, 0.5, 'sine', 0.35);
      tone(144, t + 0.05, 0.3, 'sine', 0.2);
    },
    crash() {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      tone(55, t, 0.8, 'sawtooth', 0.3);
      tone(38, t + 0.1, 0.9, 'sine', 0.35);
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.45;
      return muted;
    },
    get muted() {
      return muted;
    },
  };
}

// Synthesized sound. Everything is generated with the Web Audio API, so the game ships
// without audio files. A compressor keeps stacked sounds from clipping and a small reverb
// gives them some space.

let ac = null;
let master = null;
let reverb = null;
let noiseBuf = null;
let paused = false; // the app is in the background: no sound at all

function audio() {
  if (paused) return null;
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.85;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    master.connect(comp).connect(ac.destination);
    const conv = ac.createConvolver();
    conv.buffer = impulse(2.4, 2.8);
    const wet = ac.createGain();
    wet.gain.value = 0.28;
    reverb = ac.createGain();
    reverb.connect(conv).connect(wet).connect(master);
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

function impulse(seconds, decay) {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function noiseBuffer() {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** Sends a node to the speakers, and part of it to the reverb. */
function route(node, wet) {
  node.connect(master);
  if (wet > 0) {
    const s = ac.createGain();
    s.gain.value = wet;
    node.connect(s).connect(reverb);
  }
}

function envelope(t, peak, attack, dur) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  return g;
}

/** One oscillator note with a quick attack and an exponential fade. */
function tone({ f, f2 = null, type = 'sine', dur = 0.2, gain = 0.12, delay = 0, attack = 0.005, wet = 0.25, filter = null }) {
  if (!audio()) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  let node = o.connect(envelope(t, gain, attack, dur));
  if (filter) {
    const fl = ac.createBiquadFilter();
    fl.type = filter.type;
    fl.frequency.value = filter.f;
    fl.Q.value = filter.q ?? 0.7;
    node = node.connect(fl);
  }
  route(node, wet);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Filtered noise: whooshes, thuds, crackles. */
function noise({ dur = 0.2, gain = 0.1, delay = 0, type = 'lowpass', f = 1000, f2 = null, q = 0.8, attack = 0.005, wet = 0.2 }) {
  if (!audio()) return;
  const t = ac.currentTime + delay;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer();
  src.loop = true;
  const fl = ac.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  fl.Q.value = q;
  route(src.connect(fl).connect(envelope(t, gain, attack, dur)), wet);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

/** A bell: a sine carrier whose pitch is wobbled by an inharmonic partner that dies away. */
function bell({ f, dur = 1.2, gain = 0.1, delay = 0, ratio = 3.5, index = 2.2, wet = 0.45 }) {
  if (!audio()) return;
  const t = ac.currentTime + delay;
  const car = ac.createOscillator();
  car.frequency.value = f;
  const mod = ac.createOscillator();
  mod.frequency.value = f * ratio;
  const depth = ac.createGain();
  depth.gain.setValueAtTime(f * index, t);
  depth.gain.exponentialRampToValueAtTime(f * 0.01, t + dur);
  mod.connect(depth).connect(car.frequency);
  route(car.connect(envelope(t, gain, 0.004, dur)), wet);
  car.start(t);
  mod.start(t);
  car.stop(t + dur + 0.05);
  mod.stop(t + dur + 0.05);
}

/** A plucked note: a filtered triangle with a bright overtone. */
function pluck({ f, dur = 0.35, gain = 0.13, delay = 0, wet = 0.3 }) {
  tone({ f, type: 'triangle', dur, gain, delay, wet, filter: { type: 'lowpass', f: f * 4 } });
  tone({ f: f * 2, dur: dur * 0.5, gain: gain * 0.35, delay, wet });
}

/** A deep, soft explosion. */
function boom(gain = 0.25, delay = 0) {
  tone({ f: 95, f2: 32, dur: 0.7, gain, delay, wet: 0.2 });
  noise({ dur: 0.6, gain: gain * 0.6, delay, type: 'lowpass', f: 900, f2: 120, wet: 0.35 });
}

/** A tone whose filter keeps opening and closing: a "wah-wah" wobble. */
function wah({ f, dur = 0.9, gain = 0.1, rate = 7, lo = 350, hi = 2600, type = 'sawtooth', delay = 0, wet = 0.3 }) {
  if (!audio()) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.value = f;
  const fl = ac.createBiquadFilter();
  fl.type = 'lowpass';
  fl.Q.value = 7;
  fl.frequency.value = (lo + hi) / 2;
  const lfo = ac.createOscillator();
  lfo.frequency.value = rate;
  const depth = ac.createGain();
  depth.gain.value = (hi - lo) / 2;
  lfo.connect(depth).connect(fl.frequency);
  route(o.connect(fl).connect(envelope(t, gain, 0.03, dur)), wet);
  o.start(t);
  lfo.start(t);
  o.stop(t + dur + 0.05);
  lfo.stop(t + dur + 0.05);
}

/** Noise through a narrow, drifting band: wind, from a soft breath to a whistle. */
function wind({ dur = 0.9, gain = 0.1, f = 800, drift = 400, rate = 1.2, q = 6, attack = 0.15, delay = 0, wet = 0.5 }) {
  if (!audio()) return;
  const t = ac.currentTime + delay;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer();
  src.loop = true;
  const fl = ac.createBiquadFilter();
  fl.type = 'bandpass';
  fl.Q.value = q;
  fl.frequency.value = f;
  const lfo = ac.createOscillator();
  lfo.frequency.value = rate;
  const depth = ac.createGain();
  depth.gain.value = drift;
  lfo.connect(depth).connect(fl.frequency);
  route(src.connect(fl).connect(envelope(t, gain, attack, dur)), wet);
  src.start(t, Math.random() * 0.5);
  lfo.start(t);
  src.stop(t + dur + 0.05);
  lfo.stop(t + dur + 0.05);
}

/** A horn-like swell: a sawtooth whose filter opens quickly, then slowly closes. */
function brass({ f, dur = 1.2, gain = 0.07, delay = 0, wet = 0.45 }) {
  if (!audio()) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = f;
  const fl = ac.createBiquadFilter();
  fl.type = 'lowpass';
  fl.Q.value = 2;
  fl.frequency.setValueAtTime(f * 1.2, t);
  fl.frequency.linearRampToValueAtTime(f * 7, t + 0.14);
  fl.frequency.exponentialRampToValueAtTime(f * 1.5, t + dur);
  route(o.connect(fl).connect(envelope(t, gain, 0.05, dur)), wet);
  o.start(t);
  o.stop(t + dur + 0.05);
}

let shaper = null;
/** A gritty, distorted noise burst: rock and gravel. */
function crunch({ dur = 0.2, gain = 0.14, f = 900, delay = 0, wet = 0.15 }) {
  if (!audio()) return;
  if (!shaper) {
    shaper = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      shaper[i] = Math.tanh(x * 6);
    }
  }
  const t = ac.currentTime + delay;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer();
  src.loop = true;
  const ws = ac.createWaveShaper();
  ws.curve = shaper;
  const fl = ac.createBiquadFilter();
  fl.type = 'bandpass';
  fl.frequency.value = f;
  fl.Q.value = 1.4;
  // a choppy envelope: a few grains rather than one smooth hiss
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  for (let i = 0; i < 4; i++) {
    const at = t + (i * dur) / 4;
    g.gain.setValueAtTime(gain * (1 - i * 0.2), at);
    g.gain.exponentialRampToValueAtTime(0.0005, at + dur / 5);
  }
  route(src.connect(ws).connect(fl).connect(g), wet);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

/** A run of little water bloops. */
function bubbles(n, base, delay = 0) {
  for (let i = 0; i < n; i++) {
    const f = base * (0.8 + Math.random() * 0.8);
    tone({ f, f2: f * 1.9, dur: 0.07, gain: 0.07, delay: delay + i * 0.06 + Math.random() * 0.03, wet: 0.35 });
  }
}

/** A radio-like run of short ticks, like the beat of a pulsar. */
function pulses({ n = 8, f = 1300, gap = 0.09, gain = 0.07, delay = 0 }) {
  for (let i = 0; i < n; i++) tone({ f, dur: 0.035, gain: gain * (1 - i / (n + 2)), type: 'square', delay: delay + i * gap * (1 + i * 0.08), wet: 0.3, filter: { type: 'lowpass', f: 3200 } });
}

/** An electric snap: a square chirp up and a crackle. */
function zap(delay = 0) {
  tone({ f: 220, f2: 2600, dur: 0.16, gain: 0.06, type: 'square', delay, wet: 0.2, filter: { type: 'lowpass', f: 4200 } });
  noise({ dur: 0.14, gain: 0.06, type: 'highpass', f: 3500, delay, wet: 0.2 });
}

// A major pentatonic scale, so merges in a row and combos still sound musical.
const SCALE = [0, 2, 4, 7, 9];
function note(step) {
  const oct = Math.floor(step / 5);
  const s = ((step % 5) + 5) % 5;
  return 261.63 * Math.pow(2, oct + SCALE[s] / 12); // step 0 = middle C
}

// Every merge has its own kind of sound, not just its own pitch. All of them sit in the
// range a phone speaker plays well. Indexed by the tier being merged; k raises the pitch for combos.
const MERGE = [
  // moons: a glassy ting
  (k) => {
    bell({ f: note(17 + k), dur: 0.55, gain: 0.09, ratio: 7.1, index: 1.2, wet: 0.35 });
    tone({ f: note(22 + k), dur: 0.18, gain: 0.03, delay: 0.03, wet: 0.4 });
  },
  // mercury: a metallic clink-clink
  (k) => {
    bell({ f: note(14 + k) * 1.5, dur: 0.22, gain: 0.1, ratio: 5.43, index: 4, wet: 0.15 });
    bell({ f: note(13 + k) * 1.5, dur: 0.22, gain: 0.08, ratio: 5.43, index: 4, delay: 0.07, wet: 0.15 });
    noise({ dur: 0.03, gain: 0.08, type: 'highpass', f: 5000, wet: 0 });
  },
  // mars: a gravelly crunch
  (k) => {
    crunch({ dur: 0.24, gain: 0.15, f: 900 + k * 80 });
    pluck({ f: note(9 + k), gain: 0.1 });
  },
  // venus: a breathy swell of cloud
  (k) => {
    wind({ dur: 0.95, gain: 0.12, f: 900, drift: 500, rate: 1.5, q: 3 });
    [0, 2].forEach((s) => tone({ f: note(12 + k + s), dur: 0.9, gain: 0.05, type: 'triangle', attack: 0.18, wet: 0.5 }));
  },
  // earth: a water bloop and bubbles
  (k) => {
    tone({ f: 1100, f2: 260, dur: 0.16, gain: 0.13, wet: 0.3 });
    bubbles(6, 500 + k * 60, 0.08);
  },
  // neptune: a whistling, icy wind and falling glass
  (k) => {
    wind({ dur: 1, gain: 0.07, f: 1900, drift: 700, rate: 2.2, q: 14 });
    for (let i = 0; i < 5; i++) tone({ f: note(22 + k - i), dur: 0.22, gain: 0.04, delay: 0.1 + i * 0.07, wet: 0.6 });
  },
  // uranus: a wobbling wah-wah
  (k) => {
    wah({ f: note(5 + k) / 2, dur: 0.95, gain: 0.11, rate: 7 });
    wah({ f: note(7 + k) / 2, dur: 0.95, gain: 0.06, rate: 5.5, type: 'square' });
  },
  // saturn: a big ringing gong
  (k) => {
    bell({ f: note(5 + k), dur: 3, gain: 0.14, ratio: 1.41, index: 5, wet: 0.6 });
    bell({ f: note(5 + k) * 2.76, dur: 1.4, gain: 0.04, ratio: 1.41, index: 2, wet: 0.6 });
  },
  // jupiter: rolling thunder and horns
  (k) => {
    noise({ dur: 1.4, gain: 0.14, type: 'lowpass', f: 600, f2: 150, attack: 0.15, wet: 0.4 });
    crunch({ dur: 0.3, gain: 0.07, f: 400, delay: 0.1 });
    [0, 2, 4].forEach((s, i) => brass({ f: note(k + s), dur: 1.3, gain: 0.05, delay: 0.1 + i * 0.04 }));
  },
  // sun: a roar of fire and a bright fanfare
  (k) => {
    noise({ dur: 0.9, gain: 0.12, type: 'bandpass', f: 300, f2: 3500, q: 0.8, attack: 0.1, wet: 0.4 });
    [0, 2, 4, 5, 7].forEach((s, i) => bell({ f: note(12 + k + s), dur: 0.9, gain: 0.07, delay: 0.12 + i * 0.08 }));
    [0, 2, 4].forEach((s) => brass({ f: note(5 + k + s), dur: 1.4, gain: 0.04, delay: 0.5 }));
  },
  // red giant: a slow, ominous swell
  (k) => {
    wah({ f: note(-2 + k), dur: 1.6, gain: 0.08, rate: 1.2, lo: 200, hi: 1200 });
    [0, 3, 7].forEach((s) => tone({ f: 196 * Math.pow(2, (s + k) / 12), dur: 1.8, gain: 0.05, type: 'triangle', attack: 0.4, wet: 0.6 }));
  },
  // blue giant: crackling electric zaps and a high shimmer
  (k) => {
    zap(0);
    zap(0.12);
    zap(0.26);
    noise({ dur: 1.1, gain: 0.06, type: 'highpass', f: 5000, attack: 0.3, wet: 0.6 });
    bell({ f: note(20 + k), dur: 1.2, gain: 0.06, delay: 0.3 });
  },
  // supernova: an explosion with debris and a rising chord
  (k) => {
    boom(0.34);
    noise({ dur: 1.2, gain: 0.1, type: 'highpass', f: 1500, f2: 7000, attack: 0.05, wet: 0.6 });
    for (let i = 0; i < 8; i++) crunch({ dur: 0.06, gain: 0.05, f: 700 + Math.random() * 2000, delay: 0.1 + Math.random() * 0.6 });
    [0, 2, 4, 7].forEach((s, i) => tone({ f: note(10 + k + s), dur: 1.4, gain: 0.05, type: 'triangle', attack: 0.2, delay: 0.3 + i * 0.1, wet: 0.6 }));
  },
  // pulsar: a run of radio pulses
  (k) => {
    pulses({ n: 10, f: 1200 + k * 60, gap: 0.08 });
  },
];

export const Sfx = {
  /** The app went to the background. */
  pause() {
    paused = true;
    if (ac) ac.suspend();
  },

  resume() {
    paused = false;
    if (ac) ac.resume();
  },

  /** power 0 is a tap: a soft drop instead of a launch. */
  shoot(power) {
    if (power <= 0) {
      tone({ f: 520, f2: 300, dur: 0.12, gain: 0.08, wet: 0.2 });
      return;
    }
    noise({ dur: 0.18 + power * 0.12, gain: 0.05 + power * 0.07, type: 'bandpass', f: 500 + power * 1500, f2: 300, q: 1.2, wet: 0.15 });
    tone({ f: 300 + power * 260, f2: 160, dur: 0.14, gain: 0.07, type: 'triangle', wet: 0.15 });
  },

  /** A planet touching another: lower for big planets, louder for hard hits, a jelly boing when very hard. */
  land(speed, radius = 30) {
    const g = Math.min(0.16, 0.02 + speed * 0.006);
    const f = 220 * Math.sqrt(30 / radius);
    tone({ f, f2: f * 0.55, dur: 0.14, gain: g, wet: 0.12 });
    noise({ dur: 0.08, gain: g * 0.5, type: 'lowpass', f: 600, wet: 0.05 });
    if (speed > 14) tone({ f: f * 1.6, f2: f * 0.9, dur: 0.3, gain: g * 0.45, type: 'sine', delay: 0.03, wet: 0.2 });
  },

  merge(tier, combo) {
    (MERGE[tier] || MERGE[0])(Math.min(Math.max(combo - 1, 0), 5));
  },

  tick(step) {
    tone({ f: note(9 + step), dur: 0.05, gain: 0.04, type: 'square', wet: 0, filter: { type: 'lowpass', f: 2500 } });
  },

  swap() {
    tone({ f: note(12), dur: 0.08, gain: 0.07, type: 'triangle', wet: 0.1 });
    tone({ f: note(14), dur: 0.1, gain: 0.07, type: 'triangle', delay: 0.06, wet: 0.1 });
  },

  bonk() {
    tone({ f: 190, f2: 120, dur: 0.14, gain: 0.12, type: 'triangle', wet: 0.1 });
  },

  /** The ring grows: a soft rising whoosh and an opening chord. */
  ringGrow() {
    noise({ dur: 0.7, gain: 0.05, type: 'bandpass', f: 300, f2: 2400, q: 1.6, attack: 0.15, wet: 0.5 });
    [0, 4, 7].forEach((s, i) => tone({ f: note(7 + s), dur: 0.8, gain: 0.035, type: 'triangle', attack: 0.08, delay: 0.1 + i * 0.07, wet: 0.6 }));
  },

  /** A booster becomes available for the first time. */
  unlock() {
    [0, 2, 4, 5, 7].forEach((s, i) => bell({ f: note(15 + s), dur: 0.6, gain: 0.05, delay: i * 0.06 }));
  },

  /** A revive: a deep surge that swells outward. */
  revive() {
    tone({ f: 70, f2: 140, dur: 1.1, gain: 0.16, attack: 0.1, wet: 0.4 });
    noise({ dur: 1.2, gain: 0.07, type: 'bandpass', f: 200, f2: 3000, q: 1, attack: 0.2, wet: 0.6 });
    [0, 2, 4, 7].forEach((s, i) => bell({ f: note(12 + s), dur: 1.2, gain: 0.06, delay: 0.35 + i * 0.09 }));
  },

  cometHit() {
    noise({ dur: 0.5, gain: 0.08, type: 'bandpass', f: 1500, f2: 6000, q: 2, wet: 0.5 });
    bell({ f: note(17), dur: 1.4, gain: 0.1, delay: 0.05 });
    bell({ f: note(19), dur: 1.4, gain: 0.07, delay: 0.12 });
  },

  discover(tier = 0) {
    const base = 10 + Math.min(tier, 8);
    [0, 2, 4, 5].forEach((s, i) => bell({ f: note(base + s), dur: 0.9, gain: 0.08, delay: i * 0.09 }));
  },

  /** A warning beep each second a planet sits outside the ring; higher as time runs out. */
  danger(secondsLeft) {
    const f = secondsLeft <= 1 ? 880 : secondsLeft <= 2 ? 740 : 620;
    tone({ f, dur: 0.12, gain: 0.08, type: 'square', wet: 0.1, filter: { type: 'lowpass', f: 2200 } });
    tone({ f: f * 0.75, dur: 0.12, gain: 0.06, type: 'square', delay: 0.13, wet: 0.1, filter: { type: 'lowpass', f: 2200 } });
  },

  laserCharge() {
    tone({ f: 220, f2: 1400, dur: 0.5, gain: 0.05, type: 'sawtooth', wet: 0.2, filter: { type: 'lowpass', f: 2400, q: 6 } });
    tone({ f: 440, f2: 1800, dur: 0.5, gain: 0.04, delay: 0.08, wet: 0.3 });
  },

  laserFire() {
    tone({ f: 1800, f2: 420, dur: 0.5, gain: 0.05, type: 'square', wet: 0.2, filter: { type: 'lowpass', f: 3000 } });
    noise({ dur: 0.55, gain: 0.07, type: 'bandpass', f: 3000, q: 2, wet: 0.2 });
    tone({ f: 160, f2: 110, dur: 0.55, gain: 0.08, type: 'sawtooth', wet: 0.1, filter: { type: 'lowpass', f: 600 } });
  },

  vaporize() {
    boom(0.26);
    noise({ dur: 0.4, gain: 0.08, type: 'highpass', f: 3000, delay: 0.05, wet: 0.4 });
    for (let i = 0; i < 5; i++) noise({ dur: 0.05, gain: 0.05, type: 'bandpass', f: 1500 + Math.random() * 3000, q: 3, delay: 0.1 + Math.random() * 0.4, wet: 0.3 });
  },

  darkWarn() {
    [0, 0.26, 0.52].forEach((d) => {
      tone({ f: 70, dur: 0.22, gain: 0.2, delay: d, wet: 0.2 });
      tone({ f: 140, dur: 0.18, gain: 0.05, type: 'square', delay: d, wet: 0.1, filter: { type: 'lowpass', f: 500 } });
    });
  },

  darkApproach() {
    noise({ dur: 1.2, gain: 0.16, type: 'lowpass', f: 90, f2: 500, attack: 0.6, wet: 0.3 });
    tone({ f: 45, f2: 70, dur: 1.2, gain: 0.18, attack: 0.5, wet: 0.2 });
  },

  darkImpact() {
    boom(0.38);
    tone({ f: 60, f2: 28, dur: 1.1, gain: 0.25, wet: 0.3 });
    noise({ dur: 0.25, gain: 0.14, type: 'bandpass', f: 2200, q: 1.5, wet: 0.2 }); // the crack
    for (let i = 0; i < 8; i++) noise({ dur: 0.06, gain: 0.05, type: 'bandpass', f: 800 + Math.random() * 2500, q: 3, delay: 0.1 + Math.random() * 0.6, wet: 0.3 });
  },

  fusion() {
    tone({ f: 110, f2: 330, dur: 0.9, gain: 0.08, type: 'sawtooth', attack: 0.2, wet: 0.3, filter: { type: 'lowpass', f: 1400, q: 4 } });
    [0, 2, 4, 7].forEach((s, i) => bell({ f: note(12 + s), dur: 0.8, gain: 0.05, delay: 0.15 + i * 0.07 }));
  },

  vortexOpen() {
    noise({ dur: 1.1, gain: 0.12, type: 'bandpass', f: 2500, f2: 180, q: 2, attack: 0.05, wet: 0.5 });
    tone({ f: 300, f2: 55, dur: 1, gain: 0.14, wet: 0.3 });
  },

  vortexClose() {
    tone({ f: 70, f2: 420, dur: 0.25, gain: 0.12, wet: 0.3 });
    noise({ dur: 0.3, gain: 0.08, type: 'highpass', f: 2500, wet: 0.4 });
  },

  swallow(n) {
    const f = 700 * Math.pow(0.97, Math.min(n, 30));
    tone({ f, f2: f * 0.35, dur: 0.22, gain: 0.08, wet: 0.35 });
  },

  blackHole() {
    tone({ f: 110, f2: 30, dur: 2.2, gain: 0.26, wet: 0.4 });
    noise({ dur: 2, gain: 0.12, type: 'lowpass', f: 2000, f2: 100, attack: 0.3, wet: 0.5 });
    [0, 3, 7].forEach((s, i) => tone({ f: 220 * Math.pow(2, s / 12), dur: 2.4, gain: 0.04, type: 'triangle', attack: 0.4, delay: 0.2 + i * 0.1, wet: 0.7 }));
  },

  universe() {
    [0, 2, 4, 5, 7, 9].forEach((s, i) => bell({ f: note(10 + s), dur: 1.6, gain: 0.07, delay: i * 0.08 }));
    noise({ dur: 1.6, gain: 0.06, type: 'highpass', f: 4000, attack: 0.3, wet: 0.7 });
  },

  gameOver() {
    [0, -2, -4, -7].forEach((s, i) => tone({ f: 330 * Math.pow(2, s / 12), dur: 0.5, gain: 0.08, type: 'triangle', delay: i * 0.16, wet: 0.4 }));
  },

  click() {
    tone({ f: 900, dur: 0.04, gain: 0.04, type: 'triangle', wet: 0 });
  },
};

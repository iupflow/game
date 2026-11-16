// Tiny synthesized sound effects, so the prototype ships without audio files.
let ctx = null;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, duration, type = 'sine', gain = 0.15, slideTo = null) {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  const t = ac.currentTime;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + duration);
}

export const Sfx = {
  drop() {
    tone(220, 0.08, 'triangle', 0.08, 160);
  },
  merge(tier, combo) {
    const base = 330 * Math.pow(1.122, tier + Math.min(combo, 8));
    tone(base, 0.16, 'sine', 0.16, base * 1.5);
    tone(base * 1.5, 0.22, 'triangle', 0.07);
  },
  gameOver() {
    tone(300, 0.5, 'sawtooth', 0.08, 80);
  },
  click() {
    tone(520, 0.05, 'square', 0.04);
  },
};

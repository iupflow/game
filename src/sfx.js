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

function tone(freq, duration, type = 'sine', gain = 0.15, slideTo = null, delay = 0) {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  const t = ac.currentTime + delay;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

export const Sfx = {
  shoot(power) {
    tone(260 + power * 200, 0.12, 'triangle', 0.09, 140);
  },
  land(speed) {
    const g = Math.min(0.12, 0.02 + speed * 0.006);
    tone(150, 0.1, 'sine', g, 70);
  },
  merge(tier, combo) {
    const base = 300 * Math.pow(1.122, tier + Math.min(combo, 8) * 2);
    tone(base, 0.14, 'sine', 0.16, base * 1.5);
    tone(base * 2, 0.2, 'triangle', 0.06, base * 2.4, 0.03);
    tone(90, 0.12, 'sine', 0.12, 50);
  },
  discover() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.12, null, i * 0.09));
  },
  star() {
    [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.16, 'sine', 0.1, null, i * 0.06));
  },
  boom() {
    tone(120, 0.45, 'sawtooth', 0.2, 30);
    tone(60, 0.5, 'sine', 0.25, 25);
  },
  shake() {
    tone(90, 0.3, 'triangle', 0.16, 60);
  },
  gameOver() {
    tone(300, 0.5, 'sawtooth', 0.08, 80);
  },
  click() {
    tone(520, 0.05, 'square', 0.04);
  },
};

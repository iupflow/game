// What a merge looks like and the trail a launched planet leaves, in each planet skin.
// Every effect stays small and close to the planet it belongs to.
// Mixed into GameScene, so `this` is the scene.
import Phaser from 'phaser';
import { TEX_SCALE, neonColorOf } from '../art.js';

const ADD = Phaser.BlendModes.ADD;
const HEARTS = [0xff8fc6, 0xffc2e2, 0xffffff, 0xd9b8ff];
const CANDY = [0xff6fa8, 0xffd84d, 0x6fe3b4, 0x6fb8ff, 0xff9a4d, 0xffffff, 0xc59bff];
const PIXEL = 6; // the pixel skin's effects move on a grid of this many units
const snap = (v) => Math.round(v / PIXEL) * PIXEL;

export const SkinFxMixin = {
  /** The burst of a merge at (x, y) on screen; rs: the new body's radius on screen. */
  skinBurst(x, y, rs, tier, color, light, big, boost) {
    const id = (this.skin && this.skin.id) || 'classic';
    if (id === 'kawaii') this.burstHearts(x, y, rs, tier, color, light, big, boost);
    else if (id === 'candy') this.burstSprinkles(x, y, rs, tier, color, light, big, boost);
    else if (id === 'pixel') this.burstPixels(x, y, rs, tier, color, light, big, boost);
    else if (id === 'neon') this.burstBolts(x, y, rs, tier, color, light, big, boost);
    else this.burstClassic(x, y, rs, tier, color, light, big, boost);
  },

  /** A soft glow in the body's colour that stays close to it. */
  bloomAt(x, y, rs, tint, from, to, ms, alpha = 0.7) {
    const bloom = this.add.image(x, y, 'soft').setTint(tint).setBlendMode(ADD).setDepth(40).setAlpha(alpha).setScale((rs * from) / 64 / TEX_SCALE);
    this.tweens.add({
      targets: bloom,
      props: { scale: { value: (rs * to) / 64 / TEX_SCALE, ease: 'Cubic.out' }, alpha: { value: 0, ease: 'Quad.in' } },
      duration: ms,
      onComplete: () => bloom.destroy(),
    });
  },

  /** Classic: a glow, one fine ring hugging the body and a few sparks; light rays for the stars. */
  burstClassic(x, y, rs, tier, color, light, big, boost) {
    this.bloomAt(x, y, rs, light, 0.7, 1.35 + 0.2 * big, 320 + big * 160);
    const ring = this.add.circle(x, y, rs * 0.95).setStrokeStyle(2.5, light, 0.9).setDepth(40).setBlendMode(ADD);
    this.tweens.add({
      targets: ring,
      props: { radius: { value: rs * (1.3 + 0.15 * big), ease: 'Cubic.out' }, alpha: { value: 0, ease: 'Quad.in' } },
      duration: 360 + big * 160,
      onComplete: () => ring.destroy(),
    });
    const n = Math.min(18, 6 + tier + boost * 2);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const star = i % 4 === 0;
      const d = this.add
        .image(x + Math.cos(ang) * rs * 0.85, y + Math.sin(ang) * rs * 0.85, star ? 'spark' : 'dot')
        .setTint(i % 2 ? color : light)
        .setScale(((star ? 0.42 : 0.3) + Math.random() * 0.15) / TEX_SCALE)
        .setDepth(40)
        .setBlendMode(ADD);
      const dist = rs + 8 + Math.random() * (14 + big * 10);
      this.tweens.add({
        targets: d,
        props: {
          x: { value: x + Math.cos(ang) * dist, ease: 'Cubic.out' },
          y: { value: y + Math.sin(ang) * dist, ease: 'Cubic.out' },
          alpha: { value: 0, ease: 'Quad.in' },
          scale: { value: 0.08 / TEX_SCALE, ease: 'Quad.in' },
          angle: { value: 120, ease: 'Linear' },
        },
        duration: 380 + Math.random() * 180 + big * 120,
        onComplete: () => d.destroy(),
      });
    }
    if (tier >= 9) {
      const rays = this.add.graphics().setPosition(x, y).setDepth(40).setBlendMode(ADD);
      const k = 8;
      const inner = rs * 0.9;
      const len = rs * 1.35;
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2;
        rays.fillStyle(light, 0.45);
        rays.beginPath();
        rays.moveTo(Math.cos(a - 0.035) * inner, Math.sin(a - 0.035) * inner);
        rays.lineTo(Math.cos(a) * len, Math.sin(a) * len);
        rays.lineTo(Math.cos(a + 0.035) * inner, Math.sin(a + 0.035) * inner);
        rays.closePath();
        rays.fillPath();
      }
      rays.setScale(0.9);
      this.tweens.add({
        targets: rays,
        props: { scale: { value: 1.08, ease: 'Cubic.out' }, rotation: { value: 0.25, ease: 'Cubic.out' }, alpha: { value: 0, ease: 'Quad.in' } },
        duration: 520,
        onComplete: () => rays.destroy(),
      });
    }
  },

  /** Kawaii: a pink glow, little hearts popping out and floating up, a few twinkles. */
  burstHearts(x, y, rs, tier, color, light, big, boost) {
    this.bloomAt(x, y, rs, 0xffc2e2, 0.7, 1.3 + 0.15 * big, 380 + big * 120, 0.6);
    const n = Math.min(12, 5 + Math.floor(tier / 2) + boost * 2);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.6;
      const size = (0.36 + Math.random() * 0.16) * (0.85 + big * 0.35);
      const h = this.add
        .image(x + Math.cos(ang) * rs * 0.8, y + Math.sin(ang) * rs * 0.8, 'heart')
        .setTint(HEARTS[i % HEARTS.length])
        .setScale((size * 0.3) / TEX_SCALE)
        .setRotation((Math.random() - 0.5) * 0.6)
        .setDepth(40);
      const dist = rs + 6 + Math.random() * (12 + big * 10);
      this.tweens.add({
        targets: h,
        props: {
          x: { value: x + Math.cos(ang) * dist, ease: 'Cubic.out' },
          y: { value: y + Math.sin(ang) * dist - 14 - Math.random() * 12, ease: 'Sine.out' },
          scale: { value: size / TEX_SCALE, ease: 'Back.out' },
          alpha: { value: 0, ease: 'Quint.in' },
        },
        duration: 620 + Math.random() * 220 + big * 140,
        onComplete: () => h.destroy(),
      });
    }
    for (let i = 0; i < 4; i++) {
      const ang = Math.random() * Math.PI * 2;
      const d = rs * (0.9 + Math.random() * 0.35);
      const s = this.add.image(x + Math.cos(ang) * d, y + Math.sin(ang) * d, 'spark').setScale(0.05 / TEX_SCALE).setDepth(40).setBlendMode(ADD);
      this.tweens.add({ targets: s, scale: 0.36 / TEX_SCALE, angle: 90, duration: 220, delay: 80 + i * 70, yoyo: true, onComplete: () => s.destroy() });
    }
  },

  /** Jelly candy: a glossy ring and a handful of sprinkles that fly out, spin and drop a little. */
  burstSprinkles(x, y, rs, tier, color, light, big, boost) {
    this.bloomAt(x, y, rs, light, 0.7, 1.25 + 0.15 * big, 300 + big * 120, 0.55);
    const ring = this.add.circle(x, y, rs * 0.96).setStrokeStyle(3, 0xffffff, 0.9).setDepth(40);
    this.tweens.add({
      targets: ring,
      props: { radius: { value: rs * (1.22 + 0.12 * big), ease: 'Back.out' }, alpha: { value: 0, ease: 'Quad.in' } },
      duration: 380 + big * 120,
      onComplete: () => ring.destroy(),
    });
    const n = Math.min(18, 8 + tier + boost * 2);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const sp = this.add
        .image(x + Math.cos(ang) * rs * 0.8, y + Math.sin(ang) * rs * 0.8, 'sprinkle')
        .setTint(CANDY[i % CANDY.length])
        .setScale(((0.5 + Math.random() * 0.25) * (0.85 + big * 0.35)) / TEX_SCALE)
        .setRotation(Math.random() * Math.PI)
        .setDepth(40);
      const dist = rs + 8 + Math.random() * (14 + big * 12);
      const spin = (Math.random() < 0.5 ? -1 : 1) * (120 + Math.random() * 160);
      this.tweens.add({
        targets: sp,
        props: {
          x: { value: x + Math.cos(ang) * dist, ease: 'Cubic.out' },
          y: { value: y + Math.sin(ang) * dist + 10 + Math.random() * 10, ease: 'Quad.in' },
          angle: { value: sp.angle + spin, ease: 'Cubic.out' },
          alpha: { value: 0, ease: 'Quint.in' },
        },
        duration: 560 + Math.random() * 200 + big * 120,
        onComplete: () => sp.destroy(),
      });
    }
  },

  /** Pixel: square pixels hop out on a grid in steps, and a pixel ring grows in steps. */
  burstPixels(x, y, rs, tier, color, light, big, boost) {
    const cx = snap(x);
    const cy = snap(y);
    const colors = [light, color, 0xffffff];
    const n = 8 + (tier >= 5 ? 8 : 0) + boost * 4;
    for (let i = 0; i < n; i++) {
      const ang = (i / Math.min(n, 16)) * Math.PI * 2 + (i >= 16 ? 0.2 : 0);
      const r0 = rs * 0.8 + (i >= 8 ? PIXEL : 0);
      const r1 = rs + PIXEL * (2 + (i % 3)) + big * PIXEL * 2;
      const sq = this.add
        .image(cx + snap(Math.cos(ang) * r0), cy + snap(Math.sin(ang) * r0), 'px')
        .setTint(colors[i % colors.length])
        .setScale((PIXEL / 10) / TEX_SCALE)
        .setDepth(40);
      this.tweens.add({
        targets: sq,
        props: {
          x: { value: cx + snap(Math.cos(ang) * r1), ease: 'Stepped', easeParams: [4] },
          y: { value: cy + snap(Math.sin(ang) * r1), ease: 'Stepped', easeParams: [4] },
          alpha: { value: 0, ease: 'Stepped', easeParams: [3] },
        },
        duration: 420 + big * 120,
        onComplete: () => sq.destroy(),
      });
    }
    // a ring of pixels that grows in three steps
    const g = this.add.graphics().setDepth(40);
    const steps = [1.0, 1.18, 1.36];
    steps.forEach((k, s) => {
      this.time.delayedCall(s * 90, () => {
        if (!g.active) return;
        g.clear();
        const r = rs * k;
        const count = Math.max(12, Math.round((r * Math.PI * 2) / (PIXEL * 1.6)));
        g.fillStyle(s === 0 ? 0xffffff : light, 1 - s * 0.3);
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          g.fillRect(cx + snap(Math.cos(a) * r) - PIXEL / 2, cy + snap(Math.sin(a) * r) - PIXEL / 2, PIXEL, PIXEL);
        }
      });
    });
    this.time.delayedCall(steps.length * 90 + 40, () => g.destroy());
  },

  /** Neon: a bright ring and jagged sparks of electricity that crackle out and flicker. */
  burstBolts(x, y, rs, tier, color, light, big, boost) {
    const neon = neonColorOf(tier);
    this.bloomAt(x, y, rs, neon, 0.8, 1.3 + 0.15 * big, 280 + big * 120, 0.55);
    const ring = this.add.circle(x, y, rs * 0.95).setStrokeStyle(3, neon, 1).setDepth(40).setBlendMode(ADD);
    this.tweens.add({
      targets: ring,
      props: { radius: { value: rs * (1.28 + 0.12 * big), ease: 'Cubic.out' }, alpha: { value: 0, ease: 'Quad.in' } },
      duration: 320 + big * 120,
      onComplete: () => ring.destroy(),
    });
    const g = this.add.graphics().setPosition(x, y).setDepth(40).setBlendMode(ADD);
    const bolts = Math.min(9, 4 + Math.floor(tier / 3) + boost);
    const draw = () => {
      g.clear();
      for (let i = 0; i < bolts; i++) {
        const a = (i / bolts) * Math.PI * 2 + Math.random() * 0.5;
        const r0 = rs * 0.8;
        const r1 = rs * (1.3 + Math.random() * 0.25 + big * 0.1);
        const pts = [];
        const segs = 4;
        for (let k = 0; k <= segs; k++) {
          const r = r0 + ((r1 - r0) * k) / segs;
          const off = k === 0 || k === segs ? 0 : (Math.random() - 0.5) * 9;
          pts.push(Math.cos(a) * r - Math.sin(a) * off, Math.sin(a) * r + Math.cos(a) * off);
        }
        for (const [w, c, al] of [[6, neon, 0.35], [2, 0xffffff, 0.95]]) {
          g.lineStyle(w, c, al);
          g.beginPath();
          g.moveTo(pts[0], pts[1]);
          for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1]);
          g.strokePath();
        }
      }
    };
    draw();
    // crackle: off, on again in a new shape, then fade
    this.time.delayedCall(60, () => g.active && g.setAlpha(0.15));
    this.time.delayedCall(110, () => {
      if (!g.active) return;
      draw();
      g.setAlpha(1);
      this.tweens.add({ targets: g, alpha: 0, duration: 220, delay: 60, ease: 'Quad.in', onComplete: () => g.destroy() });
    });
  },

  /** While a launched planet flies, it leaves a trail in the skin's style (classic leaves none). */
  skinTrail(now) {
    const id = this.skin && this.skin.id;
    if (!id || id === 'classic') return;
    const every = id === 'neon' ? 16 : 42;
    if (now - (this.trailAt || 0) < every) return;
    this.trailAt = now;
    const s = this.fieldScale;
    for (const p of this.pieces) {
      if (!p.flying || !p.body || p.tier < 0) continue;
      const v = p.body.velocity;
      const speed = Math.hypot(v.x, v.y);
      if (speed < 1.5) continue;
      const at = this.toScreen(p.x, p.y);
      const a = Math.atan2(v.y, v.x) + this.worldRot;
      const back = p.rv * s * 0.55;
      const x = at.x - Math.cos(a) * back;
      const y = at.y - Math.sin(a) * back;
      const color = p.def.color;
      if (id === 'kawaii') {
        const h = this.add
          .image(x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 10, 'heart')
          .setTint(HEARTS[(this.trailN = (this.trailN || 0) + 1) % HEARTS.length])
          .setScale(0.46 / TEX_SCALE)
          .setRotation((Math.random() - 0.5) * 0.5)
          .setDepth(19);
        this.tweens.add({ targets: h, y: h.y - 14, alpha: 0, scale: 0.16 / TEX_SCALE, duration: 600, ease: 'Quad.in', onComplete: () => h.destroy() });
      } else if (id === 'candy') {
        const sprinkle = Math.random() < 0.4;
        const d = this.add
          .image(x + (Math.random() - 0.5) * 12, y + (Math.random() - 0.5) * 12, sprinkle ? 'sprinkle' : 'dot')
          .setTint(CANDY[Math.floor(Math.random() * CANDY.length)])
          .setScale((sprinkle ? 0.5 : 0.36 + Math.random() * 0.14) / TEX_SCALE)
          .setRotation(Math.random() * Math.PI)
          .setDepth(19);
        this.tweens.add({ targets: d, y: d.y + 8, alpha: 0, duration: 560, ease: 'Quad.in', onComplete: () => d.destroy() });
      } else if (id === 'pixel') {
        // two pixels side by side, in the planet's colour and a lighter one
        for (const [ox, tint] of [[0, color], [PIXEL, 0xffffff]]) {
          const sq = this.add.image(snap(x) + (Math.random() < 0.5 ? ox : 0), snap(y) + (Math.random() < 0.5 ? 0 : ox), 'px').setTint(tint).setScale((PIXEL * 1.3) / 10 / TEX_SCALE).setDepth(19);
          this.tweens.add({ targets: sq, alpha: 0, duration: 520, ease: 'Stepped', easeParams: [3], onComplete: () => sq.destroy() });
        }
      } else if (id === 'neon') {
        const neon = neonColorOf(p.kind);
        const glow = this.add.image(x, y, 'soft').setTint(neon).setBlendMode(ADD).setAlpha(0.55).setScale((p.rv * s * 0.9) / 64 / TEX_SCALE).setDepth(19);
        this.tweens.add({ targets: glow, alpha: 0, scale: glow.scale * 0.4, duration: 300, onComplete: () => glow.destroy() });
      }
    }
  },
};

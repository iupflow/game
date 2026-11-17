// Special planets from the launcher: the rainbow star, the star bomb and golden planets.
// Mixed into GameScene, so `this` is the scene.
import Phaser from 'phaser';
import { Sfx } from '../sfx.js';
import { Haptics } from '../haptics.js';
import { TIERS, TEX_SCALE } from '../art.js';
import { store } from '../ads.js';

const SPECIAL_FROM = 4; // specials start once an Earth has been made in this game
const RAINBOW_CHANCE = 0.035;
const BOMB_CHANCE = 0.03;
const GOLDEN_CHANCE = 0.06;
const BOMB_FUSE_MS = 700; // from landing to the blast
const BOMB_RANGE = 115; // how far the blast clears small planets, in field units
export const GOLDEN_POINTS = 3; // a merge with a golden planet scores this many times as much
export const GOLDEN_COINS = 5;

const TIPS = {
  rainbow: ['RAINBOW STAR', 'Merges with any planet it touches'],
  bomb: ['STAR BOMB', 'Blows away the small planets around it'],
  golden: ['GOLDEN PLANET', 'Merge it for triple points and stardust'],
};

export const SpecialsMixin = {
  /** What the launcher gives next: a body of the chain, sometimes golden, now and then a rainbow star or a star bomb. */
  rollNext() {
    const rule = this.rule || {};
    let kind = this.rollTier();
    let golden = false;
    if (this.runMax >= SPECIAL_FROM && !this.lastWasSpecial) {
      const x = this.rng();
      const pr = RAINBOW_CHANCE * (rule.rainbow || 1);
      const pb = BOMB_CHANCE * (rule.bomb || 1);
      if (x < pr) kind = 'rainbow';
      else if (x < pr + pb) kind = 'bomb';
      else if (this.rng() < GOLDEN_CHANCE * (rule.golden || 1)) golden = true;
    }
    this.lastWasSpecial = typeof kind !== 'number' || golden;
    return { kind, golden };
  },

  /** The first time a special planet is coming, say what it does. */
  tipSpecial(kind, golden) {
    const id = golden ? 'golden' : typeof kind === 'number' ? null : kind;
    if (!id || !TIPS[id] || store.get(`jd3_tip_${id}`, false)) return;
    store.set(`jd3_tip_${id}`, true);
    this.banner(TIPS[id][0], TIPS[id][1], id === 'golden' ? '#ffd93d' : id === 'bomb' ? '#ff9a5a' : '#e3b8ff', kind);
  },

  /** Two planets touch and one of them is special. */
  specialContact(A, B) {
    for (const [s, o] of [[A, B], [B, A]]) {
      if (s.kind === 'bomb' && !s.armedAt) s.armedAt = this.time.now;
      if (s.kind === 'rainbow' && !s.used && o.tier >= 0 && !o.merging) {
        // the rainbow star takes on the colours of the planet it touched and merges with it
        s.used = true;
        o.merging = true;
        this.specialQueue.push([s, o]);
      }
    }
  },

  processSpecials(now) {
    while (this.specialQueue.length) {
      const [s, target] = this.specialQueue.shift();
      if (!s.body || !target.body) continue;
      const pair = [s, target].map((p) => ({ x: p.x, y: p.y, rv: p.rv, kind: p.kind }));
      const { x, y, tier, golden } = target;
      this.removePiece(s);
      this.removePiece(target);
      this.combo = now - this.lastMergeAt < 1300 ? this.combo + 1 : 1;
      this.lastMergeAt = now;
      const { shown, points } = this.evolve(x, y, tier);
      let total = points * this.combo * this.universe;
      if (golden) {
        total *= GOLDEN_POINTS;
        this.gainCoins(GOLDEN_COINS, x, y);
      }
      this.addScore(total);
      this.mergeFx(x, y, shown, total, pair);
      this.shockwave(x, y, TIERS[shown].r + 70, 1.8 + shown * 0.2);
      Sfx.rainbow();
      Haptics.merge(tier + 2);
    }
  },

  /** Bombs arm when they land (or after a long flight), flash faster and faster, then go off. */
  stepBombs(now) {
    for (const p of [...this.pieces]) {
      if (p.kind !== 'bomb') continue;
      if (!p.armedAt && (!p.flying || now - p.born > 1600)) p.armedAt = now;
      if (!p.armedAt) continue;
      const t = now - p.armedAt;
      p.tint = Math.sin(t * (0.02 + t * 0.00005)) > 0 ? 0xff8f8f : 0xffffff;
      p.popTarget = 1 + 0.2 * Math.min(1, t / BOMB_FUSE_MS);
      if (t >= BOMB_FUSE_MS) this.explodeBomb(p);
    }
  },

  /** The blast clears the small planets around it and pushes the rest back. */
  explodeBomb(b) {
    const { x, y } = b;
    const small = Math.max(2, this.launchLow() + 1);
    this.removePiece(b);
    let n = 0;
    for (const p of [...this.pieces]) {
      if (p.kind === 'bomb' && !p.armedAt) p.armedAt = this.time.now - BOMB_FUSE_MS * 0.6; // a chain reaction
      if (p.tier < 0 || p.merging || p.tier > small) continue;
      if (Math.hypot(p.x - x, p.y - y) - p.r < BOMB_RANGE) {
        this.poof(p, 0xffa25a);
        n++;
      }
    }
    this.shockwave(x, y, BOMB_RANGE + 60, 4.5);
    this.calmUntil = Math.max(this.calmUntil, this.time.now + 1200);
    const at = this.toScreen(x, y);
    const s = this.fieldScale;
    const ADD = Phaser.BlendModes.ADD;
    const bloom = this.add.image(at.x, at.y, 'soft').setTint(0xffb35a).setBlendMode(ADD).setDepth(40).setScale((30 * s) / 64 / TEX_SCALE);
    this.tweens.add({
      targets: bloom,
      props: { scale: { value: ((BOMB_RANGE + 20) * s) / 64 / TEX_SCALE, ease: 'Cubic.out' }, alpha: { value: 0, ease: 'Quad.in' } },
      duration: 520,
      onComplete: () => bloom.destroy(),
    });
    const ring = this.add.circle(at.x, at.y, 20 * s).setStrokeStyle(4, 0xffe2a0, 0.95).setDepth(40).setBlendMode(ADD);
    this.tweens.add({
      targets: ring,
      props: { radius: { value: BOMB_RANGE * s, ease: 'Cubic.out' }, alpha: { value: 0, ease: 'Quad.in' } },
      duration: 480,
      onComplete: () => ring.destroy(),
    });
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + Math.random() * 0.3;
      const d = (40 + Math.random() * 60) * s;
      const sp = this.add.image(at.x, at.y, i % 3 ? 'dot' : 'spark').setTint(i % 2 ? 0xffd27a : 0xff7a3a).setBlendMode(ADD).setDepth(40).setScale(0.45 / TEX_SCALE);
      this.tweens.add({
        targets: sp,
        props: { x: { value: at.x + Math.cos(a) * d, ease: 'Cubic.out' }, y: { value: at.y + Math.sin(a) * d, ease: 'Cubic.out' }, alpha: { value: 0, ease: 'Quad.in' } },
        duration: 450 + Math.random() * 250,
        onComplete: () => sp.destroy(),
      });
    }
    if (n) {
      this.addScore(n * 5 * this.universe);
      this.floatText(at.x, at.y - 30, `BOOM ×${n}`, '#ffc27a', 28);
    }
    this.cameras.main.shake(130, 0.003);
    Sfx.bomb();
    Haptics.heavy();
  },

  /** A small planet burns away in a puff (bombs, the Sun's flares, beams). */
  poof(p, color) {
    const at = this.toScreen(p.x, p.y);
    const rs = p.rv * this.fieldScale;
    const ADD = Phaser.BlendModes.ADD;
    const puff = this.add.image(at.x, at.y, 'soft').setTint(color).setBlendMode(ADD).setDepth(40).setScale((rs * 0.8) / 64 / TEX_SCALE);
    this.tweens.add({
      targets: puff,
      props: { scale: { value: (rs * 1.6) / 64 / TEX_SCALE, ease: 'Cubic.out' }, alpha: { value: 0, ease: 'Quad.in' } },
      duration: 320,
      onComplete: () => puff.destroy(),
    });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.random();
      const sp = this.add.image(at.x, at.y, 'dot').setTint(color).setBlendMode(ADD).setDepth(40).setScale(0.32 / TEX_SCALE);
      this.tweens.add({
        targets: sp,
        props: { x: { value: at.x + Math.cos(a) * (rs + 14), ease: 'Cubic.out' }, y: { value: at.y + Math.sin(a) * (rs + 14), ease: 'Cubic.out' }, alpha: { value: 0, ease: 'Quad.in' } },
        duration: 380,
        onComplete: () => sp.destroy(),
      });
    }
    this.removePiece(p);
  },
};

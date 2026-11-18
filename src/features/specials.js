// Special planets from the launcher: the star bomb.
// Mixed into GameScene, so `this` is the scene.
import Phaser from 'phaser';
import { Sfx } from '../sfx.js';
import { Haptics } from '../haptics.js';
import { TEX_SCALE } from '../art.js';
import { store } from '../ads.js';
import { mix } from '../jelly.js';

const SPECIAL_FROM = 4; // specials start once an Earth has been made in this game
const BOMB_CHANCE = 0.03;
const BOMB_FUSE_MS = 1300; // from landing to the blast: long enough to see what it will hit
const BOMB_RANGE = 115; // how far the blast clears small planets, in field units

const TIPS = {
  bomb: ['STAR BOMB', 'Blows away the small planets around it'],
};

export const SpecialsMixin = {
  /** What the launcher gives next: a body of the chain, now and then a star bomb. */
  rollNext() {
    const rule = this.rule || {};
    let kind = this.rollTier();
    if (this.runMax >= SPECIAL_FROM && !this.lastWasSpecial && this.rng() < BOMB_CHANCE * (rule.bomb || 1)) kind = 'bomb';
    this.lastWasSpecial = typeof kind !== 'number';
    return kind;
  },

  /** The first time a special planet is coming, say what it does. */
  tipSpecial(kind) {
    const id = typeof kind === 'number' ? null : kind;
    if (!id || !TIPS[id] || store.get(`jd3_tip_${id}`, false)) return;
    store.set(`jd3_tip_${id}`, true);
    this.banner(TIPS[id][0], TIPS[id][1], '#ff9a5a', kind);
  },

  /** Two planets touch and one of them is special: a bomb arms on its first touch. */
  specialContact(A, B) {
    for (const s of [A, B]) if (s.kind === 'bomb' && !s.armedAt) s.armedAt = this.time.now;
  },

  /** The biggest planet a blast blows away: Mars, or one step above the smallest the launcher gives. */
  bombSmall() {
    return Math.max(2, this.launchLow() + 1);
  },

  /**
   * Bombs arm when they land (or after a long flight) and count down: the fuse sparks, the
   * beeps get faster, the bomb swells, and the zone it will clear is drawn round it.
   */
  stepBombs(now) {
    for (const p of [...this.pieces]) {
      if (p.kind !== 'bomb') continue;
      if (!p.armedAt && (!p.flying || now - p.born > 1600)) {
        p.armedAt = now;
        p.nextTick = now;
        Sfx.bombArm();
      }
      if (!p.armedAt) continue;
      const t = Math.min(1, (now - p.armedAt) / BOMB_FUSE_MS);
      p.tint = Math.sin((now - p.armedAt) * (0.016 + t * 0.03)) > 0 ? 0xff8f8f : 0xffffff;
      p.popTarget = 1 + 0.22 * t;
      if (now >= p.nextTick) {
        Sfx.bombTick(t);
        p.nextTick = now + 280 - 210 * t;
      }
      if (now - (p.sparkAt || 0) > 45) {
        p.sparkAt = now;
        this.fuseSpark(p);
      }
      if (t >= 1) this.explodeBomb(p);
    }
    this.markBombTargets(now);
  },

  /** A spark from the burning fuse. */
  fuseSpark(b) {
    const at = this.toScreen(b.x, b.y);
    const r = b.rv * this.fieldScale;
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
    const sp = this.add.image(at.x, at.y - r * 0.9, 'spark').setTint(Math.random() < 0.5 ? 0xffe08a : 0xff9a4a).setBlendMode(Phaser.BlendModes.ADD).setDepth(41).setScale((0.25 + Math.random() * 0.2) / TEX_SCALE);
    this.tweens.add({ targets: sp, x: sp.x + Math.cos(a) * 26, y: sp.y + Math.sin(a) * 26, alpha: 0, scale: 0.04 / TEX_SCALE, angle: 90, duration: 320, onComplete: () => sp.destroy() });
  },

  /** The planets an armed bomb will blow away tremble and glow red, so you can see what it hits. */
  markBombTargets(now) {
    const small = this.bombSmall();
    const marked = new Set();
    for (const b of this.pieces) {
      if (b.kind !== 'bomb' || !b.armedAt) continue;
      for (const p of this.pieces) {
        if (p.tier < 0 || p.merging || p.tier > small) continue;
        if (Math.hypot(p.x - b.x, p.y - b.y) - p.r < BOMB_RANGE) marked.add(p);
      }
    }
    for (const p of this.pieces) {
      if (marked.has(p)) {
        p.bombMarked = true;
        p.tint = Math.sin(now * 0.03) > 0 ? 0xffaa9a : 0xffffff;
        if (Math.random() < 0.35) p.impulse(Math.random() * Math.PI, 0.03);
      } else if (p.bombMarked) {
        p.bombMarked = false;
        p.tint = 0xffffff;
      }
    }
  },

  /** Every frame: the zone each armed bomb will clear, and how much of its fuse is left. */
  drawBombs(now) {
    if (!this.bombGfx) this.bombGfx = this.add.graphics().setDepth(36);
    const g = this.bombGfx;
    g.clear();
    const s = this.fieldScale;
    for (const b of this.pieces) {
      if (b.kind !== 'bomb' || !b.armedAt) continue;
      const t = Math.min(1, (now - b.armedAt) / BOMB_FUSE_MS);
      const at = this.toScreen(b.x, b.y);
      const pulse = 0.5 + 0.5 * Math.sin((now - b.armedAt) * (0.012 + t * 0.03));
      const color = mix(0xffb35a, 0xff3b3b, t);
      const r = BOMB_RANGE * s;
      g.fillStyle(color, 0.05 + 0.08 * t + 0.04 * pulse);
      g.fillCircle(at.x, at.y, r);
      // a dashed ring that closes in a little as the fuse burns down
      const rr = r * (1.08 - 0.08 * t);
      const dashes = 28;
      const spin = now * 0.0015;
      g.lineStyle(3, color, 0.45 + 0.45 * pulse);
      for (let i = 0; i < dashes; i++) {
        const a0 = spin + (i / dashes) * Math.PI * 2;
        g.beginPath();
        g.arc(at.x, at.y, rr, a0, a0 + ((Math.PI * 2) / dashes) * 0.55);
        g.strokePath();
      }
      // the fuse left, as an arc round the bomb
      g.lineStyle(4, 0xffe08a, 0.95);
      g.beginPath();
      g.arc(at.x, at.y, b.rv * s * 1.1 + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - t));
      g.strokePath();
    }
  },

  /**
   * The blast: a beat of stillness, a flash and a punch of the camera, then the small planets in
   * the zone burst one after another (nearest first) and everything else is thrown back.
   */
  explodeBomb(b) {
    const now = this.time.now;
    const { x, y } = b;
    const small = this.bombSmall();
    this.removePiece(b);
    const hit = [];
    for (const p of [...this.pieces]) {
      if (p.kind === 'bomb' && !p.armedAt) p.armedAt = now - BOMB_FUSE_MS * 0.6; // a chain reaction
      if (p.tier < 0 || p.merging || p.tier > small) continue;
      const d = Math.hypot(p.x - x, p.y - y) - p.r;
      if (d < BOMB_RANGE) hit.push([d, p]);
    }
    hit.sort((a, c) => a[0] - c[0]);
    hit.forEach(([, p], i) => {
      p.merging = true; // it is going: no merges meanwhile
      this.time.delayedCall(60 + i * 45, () => {
        if (this.pieces.includes(p)) this.poof(p, 0xffa25a, true);
      });
    });
    this.shockwave(x, y, BOMB_RANGE + 80, 5.5);
    this.calmUntil = Math.max(this.calmUntil, now + 1500);
    this.hitStopUntil = now + 90;
    this.slowUntil = Math.max(this.slowUntil, now + 340);
    const at = this.toScreen(x, y);
    const s = this.fieldScale;
    const ADD = Phaser.BlendModes.ADD;
    const bloom = this.add.image(at.x, at.y, 'soft').setTint(0xffb35a).setBlendMode(ADD).setDepth(40).setScale((40 * s) / 64 / TEX_SCALE);
    this.tweens.add({
      targets: bloom,
      props: { scale: { value: ((BOMB_RANGE + 40) * s) / 64 / TEX_SCALE, ease: 'Cubic.out' }, alpha: { value: 0, ease: 'Quad.in' } },
      duration: 560,
      onComplete: () => bloom.destroy(),
    });
    const core = this.add.image(at.x, at.y, 'soft').setTint(0xfff2d0).setBlendMode(ADD).setDepth(41).setScale((26 * s) / 64 / TEX_SCALE);
    this.tweens.add({ targets: core, scale: (70 * s) / 64 / TEX_SCALE, alpha: 0, duration: 260, ease: 'Cubic.out', onComplete: () => core.destroy() });
    [[0, 5, 0xffe2a0, 480], [70, 2.5, 0xffffff, 380]].forEach(([delay, width, color, ms]) => {
      const ring = this.add.circle(at.x, at.y, 20 * s).setStrokeStyle(width, color, 0.95).setDepth(40).setBlendMode(ADD);
      this.tweens.add({
        targets: ring,
        props: { radius: { value: (BOMB_RANGE + 10) * s, ease: 'Cubic.out' }, alpha: { value: 0, ease: 'Quad.in' } },
        delay,
        duration: ms,
        onComplete: () => ring.destroy(),
      });
    });
    // sparks and dark shards of the bomb's shell
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + Math.random() * 0.3;
      const shard = i % 3 === 0;
      const d = (shard ? 70 + Math.random() * 70 : 40 + Math.random() * 60) * s;
      const sp = this.add
        .image(at.x, at.y, shard ? 'px' : i % 2 ? 'dot' : 'spark')
        .setTint(shard ? 0x4a3a40 : i % 2 ? 0xffd27a : 0xff7a3a)
        .setBlendMode(shard ? Phaser.BlendModes.NORMAL : ADD)
        .setDepth(40)
        .setRotation(Math.random() * Math.PI)
        .setScale((shard ? 0.5 + Math.random() * 0.4 : 0.45) / TEX_SCALE);
      this.tweens.add({
        targets: sp,
        props: { x: { value: at.x + Math.cos(a) * d, ease: 'Cubic.out' }, y: { value: at.y + Math.sin(a) * d, ease: 'Cubic.out' }, alpha: { value: 0, ease: 'Quad.in' }, angle: { value: sp.angle + 200, ease: 'Linear' } },
        duration: 500 + Math.random() * 300,
        onComplete: () => sp.destroy(),
      });
    }
    const label = hit.length ? `CLEARED ×${hit.length}` : 'BOOM!';
    const t = this.text(at.x, at.y - 34, label, hit.length ? 34 : 30, '#ffc27a').setOrigin(0.5).setDepth(42).setStroke('#4a1a06', 7).setScale(0.4);
    this.tweens.add({ targets: t, scale: 1, duration: 260, ease: 'Back.out' });
    this.tweens.add({ targets: t, y: t.y - 36, alpha: 0, delay: 700, duration: 450, ease: 'Cubic.in', onComplete: () => t.destroy() });
    this.ringFlash = 1;
    this.ringFlashColor = 0xffa25a;
    this.ringSpinV = 3;
    const cam = this.cameras.main;
    cam.shake(220, 0.006);
    // a soft flash of warm light, not a blinding one
    const flash = this.add.rectangle(this.W / 2, this.H / 2, this.W * 3, this.H * 3, 0xffb070, 0.3).setDepth(45).setBlendMode(ADD);
    this.tweens.add({ targets: flash, alpha: 0, duration: 220, ease: 'Quad.out', onComplete: () => flash.destroy() });
    cam.setZoom(TEX_SCALE * 1.035);
    this.tweens.add({ targets: cam, zoom: TEX_SCALE, duration: 340, ease: 'Back.out' });
    Sfx.bomb();
    Haptics.heavy();
    this.time.delayedCall(140, () => Haptics.medium());
  },

  /** A small planet burns away in a puff (bombs, the Sun's flares, beams). */
  poof(p, color, big = false) {
    const at = this.toScreen(p.x, p.y);
    const rs = p.rv * this.fieldScale * (big ? 1.3 : 1);
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

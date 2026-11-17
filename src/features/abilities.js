// Planet powers: some bodies do something the moment a merge makes them.
// Mixed into GameScene, so `this` is the scene.
import Phaser from 'phaser';
import { Sfx } from '../sfx.js';
import { Haptics } from '../haptics.js';
import { TEX_SCALE, portraitKey, PORTRAIT_R } from '../art.js';

const SATURN = 7;
const JUPITER = 8;
const SUN = 9;
const SUPERNOVA = 12;
const PULSAR = 13;

export const ABILITIES = {
  [SATURN]: { name: 'RING CATCH', text: 'Its rings catch nearby moons', color: '#ffe3a8' },
  [JUPITER]: { name: 'GREAT STORM', text: 'Its storm stirs small planets together', color: '#ffc49a' },
  [SUN]: { name: 'SOLAR FLARE', text: 'Burns away moons that touch it', color: '#ffd27a' },
  [SUPERNOVA]: { name: 'SHOCKWAVE', text: 'Blasts away the small debris around it', color: '#bfe0ff' },
  [PULSAR]: { name: 'BEAM SWEEP', text: 'Its beams sweep small planets away', color: '#c9f4ff' },
};

const STORM_MS = 2600;
const SWEEP_MS = 3200;

export const AbilitiesMixin = {
  /** A merge just made p: if it has a power, it uses it now. */
  triggerAbility(p) {
    const a = ABILITIES[p.tier];
    if (!a) return;
    const at = this.toScreen(p.x, p.y);
    this.floatText(at.x, at.y - p.rv * this.fieldScale - 26, a.name, a.color, 24);
    if (p.tier === SATURN) this.ringCatch(p);
    else if (p.tier === JUPITER) this.greatStorm(p);
    else if (p.tier === SUN) this.solarFlare(p);
    else if (p.tier === SUPERNOVA) this.shockBlast(p);
    else if (p.tier === PULSAR) this.beamSweep(p);
  },

  /** Saturn: the rings catch up to three moons nearby; they circle into the rings and are gone. */
  ringCatch(sat) {
    const near = this.pieces
      .filter((p) => p.tier >= 0 && p.tier <= 1 && !p.merging && p !== sat && Math.hypot(p.x - sat.x, p.y - sat.y) < sat.r * 2.4 + p.r)
      .sort((a, b) => Math.hypot(a.x - sat.x, a.y - sat.y) - Math.hypot(b.x - sat.x, b.y - sat.y))
      .slice(0, 3);
    near.forEach((p, i) => {
      const start = this.toScreen(p.x, p.y);
      const img = this.add.image(start.x, start.y, portraitKey(p.kind)).setScale((p.rv * this.fieldScale) / PORTRAIT_R / TEX_SCALE).setDepth(36);
      const s0 = img.scale;
      const a0 = Math.atan2(p.y - sat.y, p.x - sat.x);
      const d0 = Math.hypot(p.x - sat.x, p.y - sat.y);
      this.removePiece(p);
      const o = { t: 0 };
      this.tweens.add({
        targets: o,
        t: 1,
        delay: i * 90,
        duration: 900,
        ease: 'Sine.inOut',
        onUpdate: () => {
          // spiral round into the ring, following Saturn as it moves
          const a = a0 + o.t * Math.PI * 1.6;
          const d = d0 + (sat.r * 1.45 - d0) * o.t;
          const at = this.toScreen(sat.x + Math.cos(a) * d, sat.y + Math.sin(a) * d * 0.45);
          img.setPosition(at.x, at.y).setScale(s0 * (1 - 0.8 * o.t)).setAlpha(1 - o.t * 0.9);
        },
        onComplete: () => img.destroy(),
      });
    });
    if (near.length) this.addScore(near.length * 4 * this.universe);
    Sfx.ringCatch(near.length);
    Haptics.medium();
  },

  /** Jupiter: a storm whirls the small planets around it for a moment, so they bump and merge. */
  greatStorm(jup) {
    this.storms.push({ host: jup, born: this.time.now, until: this.time.now + STORM_MS });
    Sfx.storm();
    Haptics.medium();
  },

  stepStorms(now) {
    this.storms = this.storms.filter((s) => now < s.until && s.host.body);
    for (const s of this.storms) {
      const h = s.host;
      const fade = Math.min(1, (s.until - now) / 600);
      const caught = this.pieces.filter((p) => p !== h && p.tier >= 0 && p.tier <= 3 && !p.fusing && !p.merging && Math.hypot(p.x - h.x, p.y - h.y) < h.r * 2.8 + p.r);
      for (const p of caught) {
        const dx = p.x - h.x;
        const dy = p.y - h.y;
        const d = Math.hypot(dx, dy) || 1;
        const b = p.body;
        const k = (b.mass / (1000 / 60) ** 2) * fade;
        // round and round, and a little inward
        b.force.x += (-dy / d) * 0.25 * k - (dx / d) * 0.12 * k;
        b.force.y += (dx / d) * 0.25 * k - (dy / d) * 0.12 * k;
        // and round the storm toward the nearest planet of the same kind, so the two meet and merge
        // (straight at it would often mean straight into Jupiter)
        let mate = null;
        let best = Infinity;
        for (const q of caught) {
          if (q === p || q.tier !== p.tier) continue;
          const dq = Math.hypot(q.x - p.x, q.y - p.y);
          if (dq < best) {
            best = dq;
            mate = q;
          }
        }
        if (!mate) continue;
        if (best < (p.r + mate.r) * 1.6) {
          b.force.x += ((mate.x - p.x) / best) * 0.6 * k;
          b.force.y += ((mate.y - p.y) / best) * 0.6 * k;
          continue;
        }
        const ap = Math.atan2(dy, dx);
        let delta = Math.atan2(mate.y - h.y, mate.x - h.x) - ap;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));
        // directly opposite: one goes each way round
        const dir = Math.abs(Math.abs(delta) - Math.PI) < 0.35 ? (p.id < mate.id ? 1 : -1) : Math.sign(delta) || 1;
        b.force.x += -Math.sin(ap) * dir * 0.7 * k;
        b.force.y += Math.cos(ap) * dir * 0.7 * k;
      }
    }
  },

  /** The Sun: a flare burns away the moons and Mercuries touching it. */
  solarFlare(sun) {
    let n = 0;
    for (const p of [...this.pieces]) {
      if (p === sun || p.tier < 0 || p.tier > 1 || p.merging) continue;
      if (Math.hypot(p.x - sun.x, p.y - sun.y) - p.r - sun.r < sun.r * 0.5) {
        this.poof(p, 0xffa040);
        n++;
      }
    }
    if (n) this.addScore(n * 4 * this.universe);
    this.burstRing(sun, 0xffb347, 1.7);
    Sfx.flare();
    Haptics.medium();
  },

  /** A supernova: the blast clears the small debris around it and pushes everything else back. */
  shockBlast(sn) {
    const small = Math.max(2, this.launchLow() + 1);
    let n = 0;
    for (const p of [...this.pieces]) {
      if (p === sn || p.tier < 0 || p.tier > small || p.merging) continue;
      if (Math.hypot(p.x - sn.x, p.y - sn.y) - p.r < sn.r * 2.4) {
        this.poof(p, 0xa6c9ff);
        n++;
      }
    }
    if (n) this.addScore(n * 6 * this.universe);
    this.shockwave(sn.x, sn.y, sn.r * 3.2, 6);
    this.calmUntil = Math.max(this.calmUntil, this.time.now + 2500);
    this.burstRing(sn, 0xbfe0ff, 2.6);
    this.cameras.main.shake(160, 0.003);
    Sfx.shock();
    Haptics.heavy();
  },

  /** A pulsar: two beams sweep round for a few seconds, burning away the small planets they touch. */
  beamSweep(pul) {
    this.sweeps.push({ host: pul, born: this.time.now, until: this.time.now + SWEEP_MS, a0: Math.random() * Math.PI });
    Sfx.sweep();
    Haptics.medium();
  },

  stepSweeps(now) {
    this.sweeps = this.sweeps.filter((s) => now < s.until && s.host.body);
    const small = Math.max(3, this.launchLow() + 2);
    for (const s of this.sweeps) {
      const h = s.host;
      const a = s.a0 + (now - s.born) * 0.0032;
      for (const dir of [a, a + Math.PI]) {
        const ux = Math.cos(dir);
        const uy = Math.sin(dir);
        for (const p of [...this.pieces]) {
          if (p === h || p.tier < 0 || p.tier > small || p.merging) continue;
          const ox = p.x - h.x;
          const oy = p.y - h.y;
          const along = ox * ux + oy * uy;
          const across = Math.abs(ox * uy - oy * ux);
          if (along > h.r * 0.9 && along < h.r * 4.2 && across < p.r * 0.7 + 6) {
            this.poof(p, 0xbff2ff);
            this.addScore(5 * this.universe);
          }
        }
      }
    }
  },

  /** Storms and beams, drawn every frame. */
  drawAbilities(now) {
    const g = this.abilityGfx;
    g.clear();
    const s = this.fieldScale;
    for (const st of this.storms) {
      const h = st.host;
      const at = this.toScreen(h.x, h.y);
      const fade = Math.min(1, (st.until - now) / 600, (now - st.born) / 300);
      for (let arm = 0; arm < 3; arm++) {
        g.lineStyle(3, 0xffc49a, 0.35 * fade);
        g.beginPath();
        for (let k = 0; k <= 24; k++) {
          const t = k / 24;
          const a = arm * ((Math.PI * 2) / 3) + now * 0.004 + t * 2.4;
          const r = (h.r * (1.15 + t * 1.5)) * s;
          const x = at.x + Math.cos(a + this.worldRot) * r;
          const y = at.y + Math.sin(a + this.worldRot) * r;
          if (k === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.strokePath();
      }
    }
    for (const sw of this.sweeps) {
      const h = sw.host;
      const at = this.toScreen(h.x, h.y);
      const fade = Math.min(1, (sw.until - now) / 500, (now - sw.born) / 250);
      const a = sw.a0 + (now - sw.born) * 0.0032 + this.worldRot;
      for (const dir of [a, a + Math.PI]) {
        const len = h.r * 4.2 * s;
        const w = 0.05;
        g.fillStyle(0xd8f8ff, 0.4 * fade);
        g.beginPath();
        g.moveTo(at.x + Math.cos(dir - w) * h.r * 0.9 * s, at.y + Math.sin(dir - w) * h.r * 0.9 * s);
        g.lineTo(at.x + Math.cos(dir) * len, at.y + Math.sin(dir) * len);
        g.lineTo(at.x + Math.cos(dir + w) * h.r * 0.9 * s, at.y + Math.sin(dir + w) * h.r * 0.9 * s);
        g.closePath();
        g.fillPath();
      }
    }
  },

  /** A ring of light running out from a body. */
  burstRing(p, color, reach) {
    const at = this.toScreen(p.x, p.y);
    const rs = p.rv * this.fieldScale;
    const ring = this.add.circle(at.x, at.y, rs).setStrokeStyle(5, color, 0.9).setDepth(40).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: ring,
      props: { radius: { value: rs * reach, ease: 'Cubic.out' }, alpha: { value: 0, ease: 'Quad.in' } },
      duration: 600,
      onComplete: () => ring.destroy(),
    });
  },
};

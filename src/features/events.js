// Cosmic events: every so often, for a little while, something happens to the whole field.
// They change the situation, never the boosters: nothing here hands out a booster.
// Mixed into GameScene, so `this` is the scene.
import Phaser from 'phaser';
import { Sfx } from '../sfx.js';
import { Haptics } from '../haptics.js';
import { TEX_SCALE, TIERS } from '../art.js';
import { mix } from '../jelly.js';

const TIER_COLOR = (tier) => TIERS[tier].color;

export const EVENTS = {
  meteors: { name: 'METEOR SHOWER', text: 'Small planets rain in for a while', ms: 11000, color: '#ffb27a' },
  zerog: { name: 'ZERO GRAVITY', text: 'Drag planets together · 2× diamond luck', ms: 8500, color: '#9fe8ff' },
};
const EVENTS_FROM = 4; // events start once an Earth has been made
const FIRST_EVENT_MS = 40000; // of play
const EVENT_GAP = [38000, 52000];
const METEOR_EVERY = 850;
const FLOAT_MS = 6000; // zero gravity: how long everything floats before gravity comes back
const DRIFT_EVERY = 450; // while weightless, currents nudge every floating planet this often

export const EventsMixin = {
  resetEvents() {
    this.event = null;
    this.zeroG = null;
    this.playMs = 0;
    this.nextEventAt = FIRST_EVENT_MS * ((this.rule && this.rule.eventGap) || 1);
  },

  /** Every frame while playing, with the game time that passed. */
  updateEvents(now, dt) {
    this.playMs += dt;
    const ev = this.event;
    if (ev) {
      if (this.playMs >= ev.until) this.endEvent();
      else this.tickEvent(now);
    } else if (this.runMax >= EVENTS_FROM && this.playMs >= this.nextEventAt) {
      const pool = (this.rule && this.rule.events) || Object.keys(EVENTS);
      this.startEvent(pool[Math.floor(this.rng() * pool.length)], now);
    }
    this.refreshEventLabel();
  },

  startEvent(id, now) {
    const def = EVENTS[id];
    this.event = { id, until: this.playMs + def.ms, nextAt: this.playMs + 300, lastFx: 0 };
    this.banner(def.name, def.text, def.color);
    Sfx.event();
    Haptics.medium();
    if (id === 'zerog') this.startZeroG(now);
  },

  tickEvent(now) {
    const ev = this.event;
    if (ev.id === 'meteors' && this.playMs >= ev.nextAt) {
      ev.nextAt = this.playMs + METEOR_EVERY;
      this.dropMeteor(now);
    }
    if (ev.id === 'zerog') this.tickZeroG(now);
    // meteors leave fiery trails while they fly
    if (now - ev.lastFx > 45) {
      ev.lastFx = now;
      for (const p of this.pieces) {
        if (!p.meteor || !p.flying) continue;
        const at = this.toScreen(p.x, p.y);
        const d = this.add.image(at.x, at.y, 'dot').setTint(Math.random() < 0.5 ? 0xffb35a : 0xffe08a).setBlendMode(Phaser.BlendModes.ADD).setDepth(19).setScale((0.35 + Math.random() * 0.25) / TEX_SCALE);
        this.tweens.add({ targets: d, alpha: 0, scale: 0.05 / TEX_SCALE, duration: 420, onComplete: () => d.destroy() });
      }
    }
  },

  endEvent() {
    this.event = null;
    if (this.grab) this.dropGrab();
    this.clearZeroHint();
    this.zeroG = null;
    if (this.zeroTint) {
      this.zeroTint.destroy();
      this.zeroTint = null;
    }
    const [lo, hi] = EVENT_GAP;
    this.nextEventAt = this.playMs + (lo + this.rng() * (hi - lo)) * ((this.rule && this.rule.eventGap) || 1);
    this.refreshEventLabel();
  },

  /** A small planet (the smallest the launcher gives) streaks in from outside the ring. */
  dropMeteor(now) {
    const a = this.rng() * Math.PI * 2;
    const far = (this.ringScreen() + 150) / this.fieldScale;
    const p = this.spawnPiece(this.CX + Math.cos(a) * far, this.CY + Math.sin(a) * far, this.launchLow());
    const aim = a + Math.PI + (this.rng() - 0.5) * 0.5;
    const speed = 7 + this.rng() * 3;
    this.matter.body.setVelocity(p.body, { x: Math.cos(aim) * speed, y: Math.sin(aim) * speed });
    p.body.frictionAir = 0.002;
    p.flying = true;
    p.meteor = true;
    p.born = now;
    Sfx.meteor();
  },

  /**
   * Zero gravity: the well goes dark, a wave pushes everything apart and the planets float and
   * tumble. Shots fly straight, so planets can be knocked together like billiard balls. A ring
   * round the well counts the float down (the last three seconds out loud); then gravity comes back
   * hard: a pull closes in from the edges and the field slams together in a new order.
   * No countdown runs meanwhile.
   */
  startZeroG(now) {
    this.zeroG = { back: now + FLOAT_MS, returned: false, lastCount: 4, returnedAt: 0, shakeAt: 0, driftAt: now + DRIFT_EVERY };
    // no shots and no new planets while weightless: the planets are moved by hand instead
    this.aiming = false;
    this.setPower(0);
    if (this.zeroHint) this.zeroHint.destroy();
    this.zeroHint = this.text(this.W / 2, 1032, '', 24, '#bff2ff').setOrigin(0.5).setDepth(42).setStroke('#0b3a5a', 6);
    this.refreshZeroHint();
    this.tweens.add({ targets: this.zeroHint, alpha: 0.45, duration: 700, yoyo: true, repeat: -1 });
    for (const p of this.pieces) {
      if (!p.body) continue;
      const dx = p.x - this.CX;
      const dy = p.y - this.CY;
      const d = Math.hypot(dx, dy) || 1;
      const out = 1.6 + this.rng() * 1.2; // they drift well apart: bringing twins together takes work
      const side = (this.rng() - 0.5) * 1.6;
      const v = p.body.velocity;
      this.matter.body.setVelocity(p.body, { x: v.x + (dx / d) * out - (dy / d) * side, y: v.y + (dy / d) * out + (dx / d) * side });
      this.matter.body.setAngularVelocity(p.body, (Math.random() - 0.5) * 0.08); // they tumble
      p.impulse(Math.atan2(dy, dx), 0.12); // a jolt as gravity lets go
    }
    this.calmUntil = Math.max(this.calmUntil, now + EVENTS.zerog.ms + 1500);
    this.ringFlash = 1;
    this.ringFlashColor = 0x9fe8ff;
    // the well goes out, and a wave runs from it
    this.tweens.add({ targets: this.coreParts, alpha: 0.12, duration: 500 });
    const ADD = Phaser.BlendModes.ADD;
    for (let i = 0; i < 3; i++) {
      const ring = this.add.circle(this.CX, this.CY, 24).setStrokeStyle(5 - i * 1.5, 0x9fe8ff, 0.9).setDepth(39).setBlendMode(ADD);
      this.tweens.add({ targets: ring, radius: 430 + i * 50, alpha: 0, delay: i * 120, duration: 950, ease: 'Cubic.out', onComplete: () => ring.destroy() });
    }
    // everything takes on a cool, weightless light
    if (this.zeroTint) this.zeroTint.destroy();
    this.zeroTint = this.add.rectangle(this.W / 2, this.H / 2, this.W * 3, this.H * 3, 0x5fd0ff, 0).setDepth(18).setBlendMode(ADD);
    this.tweens.add({ targets: this.zeroTint, alpha: 0.07, duration: 600 });
    Sfx.zeroG();
    Haptics.medium();
  },

  tickZeroG(now) {
    const z = this.zeroG;
    if (!z) return;
    if (!z.returned) {
      const left = z.back - now;
      const sec = Math.ceil(left / 1000);
      if (sec >= 1 && sec <= 3 && sec < z.lastCount) {
        z.lastCount = sec;
        this.zeroCount(sec);
      }
      if (left <= 0) this.gravityReturns(now);
      else if (now >= z.driftAt) {
        // slow currents keep every floating planet wandering, so nothing stays where it was put
        z.driftAt = now + DRIFT_EVERY;
        for (const p of this.pieces) {
          if (!p.body || (this.grab && this.grab.p === p)) continue;
          const a = Math.random() * Math.PI * 2;
          const k = 0.25 + Math.random() * 0.3;
          const v = p.body.velocity;
          this.matter.body.setVelocity(p.body, { x: v.x * 0.9 + Math.cos(a) * k, y: v.y * 0.9 + Math.sin(a) * k });
        }
      }
    }
    // floating specks drifting up while it lasts
    if (!z.returned && Math.random() < 0.45) {
      const x = Math.random() * this.W;
      const y = 280 + Math.random() * 760;
      const d = this.add.image(x, y, Math.random() < 0.3 ? 'spark' : 'dot').setTint(0xbff2ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(17).setAlpha(0).setScale((0.25 + Math.random() * 0.35) / TEX_SCALE);
      this.tweens.add({ targets: d, alpha: { from: 0, to: 0.75 }, y: y - 70, angle: 90, duration: 1000, yoyo: true, onComplete: () => d.destroy() });
    }
  },

  /** 3, 2, 1: a big number pops up over the well, with a beep. */
  zeroCount(sec) {
    const t = this.text(this.CX, this.CY - 120, String(sec), 70, '#bff2ff').setOrigin(0.5).setDepth(42).setStroke('#0b3a5a', 9).setScale(0.3);
    this.tweens.add({ targets: t, scale: 1.1, duration: 260, ease: 'Back.out' });
    this.tweens.add({ targets: t, alpha: 0, scale: 1.4, delay: 520, duration: 360, onComplete: () => t.destroy() });
    this.ringFlash = 0.6;
    this.ringFlashColor = 0x9fe8ff;
    Sfx.countdown(sec);
    Haptics.light();
  },

  /** Gravity comes back: the well lights up, a pull closes in from the edges, light streaks in. */
  gravityReturns(now) {
    const z = this.zeroG;
    z.returned = true;
    z.returnedAt = now;
    this.dropGrab();
    this.clearZeroHint();
    const CX = this.CX;
    const CY = this.CY;
    const ADD = Phaser.BlendModes.ADD;
    this.floatText(this.W / 2, 300, 'GRAVITY RETURNS!', '#9fe8ff', 36);
    this.ringFlash = 1;
    this.ringFlashColor = 0xffffff;
    this.ringSpinV = 4;
    this.tweens.add({ targets: this.coreParts, alpha: 1, duration: 200 });
    if (this.zeroTint) {
      const tint = this.zeroTint;
      this.zeroTint = null;
      this.tweens.add({ targets: tint, alpha: 0, duration: 500, onComplete: () => tint.destroy() });
    }
    for (let i = 0; i < 2; i++) {
      const ring = this.add.circle(CX, CY, 470 - i * 60).setStrokeStyle(6 - i * 2, 0xbff2ff, 0.85).setDepth(39).setBlendMode(ADD);
      this.tweens.add({ targets: ring, radius: 26, alpha: 0.15, delay: i * 90, duration: 430, ease: 'Cubic.in', onComplete: () => ring.destroy() });
    }
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 260 + Math.random() * 220;
      const d = this.add.image(CX + Math.cos(a) * r, CY + Math.sin(a) * r, 'dot').setTint(i % 2 ? 0xbff2ff : 0xffffff).setBlendMode(ADD).setDepth(39).setRotation(a).setScale(1.6 / TEX_SCALE, 0.22 / TEX_SCALE).setAlpha(0.8);
      this.tweens.add({ targets: d, x: CX + Math.cos(a) * 40, y: CY + Math.sin(a) * 40, alpha: 0, delay: Math.random() * 120, duration: 360, ease: 'Cubic.in', onComplete: () => d.destroy() });
    }
    const flash = this.add.image(CX, CY, 'soft').setTint(0xdff8ff).setBlendMode(ADD).setDepth(39).setScale(0.6 / TEX_SCALE);
    this.tweens.add({ targets: flash, scale: 4 / TEX_SCALE, alpha: 0, delay: 380, duration: 500, ease: 'Cubic.out', onComplete: () => flash.destroy() });
    this.cameras.main.shake(160, 0.004);
    Sfx.gravityBack();
    Haptics.heavy();
  },

  /** While gravity slams the field back together, hard hits spark and shake the screen a little. */
  slamHit(A, B, closing) {
    const z = this.zeroG;
    const now = this.time.now;
    if (!z || !z.returned || now - z.returnedAt > 1800 || closing < 5) return;
    const x = (A.x * B.r + B.x * A.r) / (A.r + B.r);
    const y = (A.y * B.r + B.y * A.r) / (A.r + B.r);
    const at = this.toScreen(x, y);
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = this.add.image(at.x, at.y, i % 2 ? 'spark' : 'dot').setTint(0xdff8ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(40).setScale(0.34 / TEX_SCALE);
      this.tweens.add({ targets: sp, x: at.x + Math.cos(a) * 26, y: at.y + Math.sin(a) * 26, alpha: 0, duration: 300, onComplete: () => sp.destroy() });
    }
    if (now - z.shakeAt > 140) {
      z.shakeAt = now;
      this.cameras.main.shake(80, Math.min(0.004, 0.0004 * closing));
    }
  },

  /** Under the field while weightless: what to do. */
  refreshZeroHint() {
    const z = this.zeroG;
    if (!this.zeroHint || !z) return;
    this.zeroHint.setText('Drag planets to pair them up');
  },

  /** Weightless right now (the float, before gravity comes back)? */
  floatingNow() {
    const z = this.zeroG;
    return !!z && !z.returned && this.time.now < z.back;
  },

  /**
   * While weightless, a touch picks up the planet under the finger, or the planet waiting on the
   * orbit (which then comes off it to be placed by hand). Returns true when something was picked up.
   */
  tryGrab(pointer) {
    const f = this.toField(pointer.worldX, pointer.worldY);
    const slop = 20 / this.fieldScale;
    // whichever is nearest the finger: a floating planet, or the one waiting on the orbit
    const candidates = this.pieces.filter((p) => p.body && !p.merging);
    if (this.held && this.state === 'aim') candidates.push(this.held);
    let best = null;
    let bestD = Infinity;
    for (const p of candidates) {
      const d = Math.hypot(p.x - f.x, p.y - f.y) - p.r;
      if (d < slop && d < bestD) {
        best = p;
        bestD = d;
      }
    }
    if (!best) return false;
    if (best === this.held) best = this.releaseHeld();
    this.grab = { p: best, x: f.x, y: f.y };
    best.popTarget = 1.08;
    best.flying = false;
    Sfx.boing(3);
    Haptics.light();
    return true;
  },

  /** The waiting planet comes off the orbit into the field, to be placed by hand. */
  releaseHeld() {
    const b = this.held;
    this.held = null;
    this.aiming = false;
    this.setPower(0);
    b.addBody();
    b.flying = false;
    b.born = this.time.now;
    this.pieces.push(b);
    if (b.tier > this.biggest) this.biggest = b.tier;
    this.state = 'flying';
    this.nextHeldAt = this.time.now + 450;
    return b;
  },

  moveGrab(pointer) {
    const f = this.toField(pointer.worldX, pointer.worldY);
    this.grab.x = f.x;
    this.grab.y = f.y;
  },

  /** Every physics step: the planet in hand follows the finger, pushing others out of its way. */
  stepGrab() {
    const g = this.grab;
    if (!g.p.body || g.p.merging) {
      this.grab = null;
      return;
    }
    const b = g.p.body;
    let vx = (g.x - b.position.x) * 0.2;
    let vy = (g.y - b.position.y) * 0.2;
    const sp = Math.hypot(vx, vy);
    if (sp > 11) {
      vx *= 11 / sp;
      vy *= 11 / sp;
    }
    this.matter.body.setVelocity(b, { x: vx, y: vy });
  },

  /** Let go: it keeps drifting the way it was moving (a flick throws it). */
  dropGrab() {
    const g = this.grab;
    this.grab = null;
    if (!g || !g.p.body) return;
    g.p.popTarget = 1;
    const v = g.p.body.velocity;
    const sp = Math.hypot(v.x, v.y);
    if (sp > 9) this.matter.body.setVelocity(g.p.body, { x: (v.x * 9) / sp, y: (v.y * 9) / sp });
  },

  clearZeroHint() {
    if (!this.zeroHint) return;
    this.tweens.killTweensOf(this.zeroHint);
    this.zeroHint.destroy();
    this.zeroHint = null;
  },

  /**
   * While weightless, each planet is joined to its nearest twin (the planet waiting on the orbit
   * included) by a dotted line in its colour, and planets that have a twin wear a ring, so the
   * pairs to bring together are easy to see; the planet in hand gets a bright ring.
   */
  drawTwins(now) {
    if (!this.twinGfx) this.twinGfx = this.add.graphics().setDepth(36);
    const g = this.twinGfx;
    g.clear();
    if (!this.floatingNow()) return;
    const s = this.fieldScale;
    const list = this.pieces.filter((p) => p.tier >= 0 && p.body && !p.merging);
    if (this.held && this.held.tier >= 0) list.push(this.held);
    const done = new Set();
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.006);
    for (const p of list) {
      if (done.has(p)) continue;
      let twin = null;
      let best = Infinity;
      for (const q of list) {
        if (q === p || q.tier !== p.tier || done.has(q)) continue;
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < best) {
          best = d;
          twin = q;
        }
      }
      if (!twin) continue;
      done.add(p);
      done.add(twin);
      const color = mix(TIER_COLOR(p.tier), 0xffffff, 0.35);
      const a = this.toScreen(p.x, p.y);
      const b = this.toScreen(twin.x, twin.y);
      for (const [o, at] of [[p, a], [twin, b]]) {
        g.lineStyle(3, color, 0.55 + 0.35 * pulse);
        g.strokeCircle(at.x, at.y, o.rv * s + 5 + 2 * pulse);
      }
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const from = p.rv * s + 9;
      const to = len - twin.rv * s - 9;
      if (to <= from) continue;
      const shift = (now * 0.03) % 16;
      for (const [width, c, alpha] of [[6, 0x0b0820, 0.45], [3, color, 0.95]]) {
        g.lineStyle(width, c, alpha);
        for (let d = from + shift - 16; d < to; d += 16) {
          const d0 = Math.max(from, d);
          const d1 = Math.min(to, d + 8);
          if (d1 <= d0) continue;
          g.beginPath();
          g.moveTo(a.x + (dx * d0) / len, a.y + (dy * d0) / len);
          g.lineTo(a.x + (dx * d1) / len, a.y + (dy * d1) / len);
          g.strokePath();
        }
      }
    }
    if (this.grab && this.grab.p.body) {
      const p = this.grab.p;
      const at = this.toScreen(p.x, p.y);
      g.lineStyle(3, 0xffffff, 0.9);
      g.strokeCircle(at.x, at.y, p.rv * s + 9);
    }
  },

  /** Every frame while floating: a ring round the well shows how long until gravity returns. */
  drawZeroG(now) {
    if (!this.zeroGfx) this.zeroGfx = this.add.graphics().setDepth(36).setBlendMode(Phaser.BlendModes.ADD);
    const g = this.zeroGfx;
    g.clear();
    this.drawTwins(now);
    const z = this.zeroG;
    if (!z || z.returned) return;
    const left = Math.max(0, (z.back - now) / FLOAT_MS);
    const bright = left < 0.6 && Math.sin(now * 0.025) > 0 ? 1 : 0.75; // it blinks near the end
    g.lineStyle(10, 0x9fe8ff, 0.14);
    g.strokeCircle(this.CX, this.CY, 54);
    g.lineStyle(5, 0xbff2ff, bright);
    g.beginPath();
    g.arc(this.CX, this.CY, 54, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
    g.strokePath();
  },

  /** How gravity is changed by an event right now: almost none while floating, then strong. */
  eventGravity(now) {
    const z = this.zeroG;
    if (!z) return 1;
    return now < z.back ? 0.02 : 2.6;
  },

  /** A small label under the pause button while an event lasts. */
  refreshEventLabel() {
    const ev = this.event;
    if (!ev) {
      this.eventLabel.setVisible(false);
      return;
    }
    const z = this.zeroG;
    if (ev.id === 'zerog' && z && z.returned) {
      this.eventLabel.setVisible(false); // gravity is back: nothing left to count
      return;
    }
    const left = Math.max(0, Math.ceil((ev.id === 'zerog' && z ? z.back - this.time.now : ev.until - this.playMs) / 1000));
    this.eventLabel.setVisible(true).setText(`${EVENTS[ev.id].name}  ${left}s`).setColor(EVENTS[ev.id].color);
  },
};

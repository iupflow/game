// Cosmic events: every so often, for a little while, something happens to the whole field.
// They change the situation, never the boosters: nothing here hands out a booster.
// Mixed into GameScene, so `this` is the scene.
import Phaser from 'phaser';
import { Sfx } from '../sfx.js';
import { Haptics } from '../haptics.js';
import { TEX_SCALE } from '../art.js';

export const EVENTS = {
  meteors: { name: 'METEOR SHOWER', text: 'Small planets rain in for a while', ms: 11000, color: '#ffb27a' },
  zerog: { name: 'ZERO GRAVITY', text: 'Everything floats apart… then falls back together', ms: 7500, color: '#9fe8ff' },
};
const EVENTS_FROM = 4; // events start once an Earth has been made
const FIRST_EVENT_MS = 40000; // of play
const EVENT_GAP = [38000, 52000];
const METEOR_EVERY = 850;
const FLOAT_MS = 5000; // zero gravity: how long everything floats before gravity comes back

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
    const ev = this.event;
    this.event = null;
    this.zeroG = null;
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
   * Zero gravity: everything drifts apart and floats for a few seconds, then gravity comes back
   * hard and slams the field together again in a new order. No countdown runs meanwhile.
   */
  startZeroG(now) {
    this.zeroG = { back: now + FLOAT_MS, returned: false };
    for (const p of this.pieces) {
      if (!p.body) continue;
      const dx = p.x - this.CX;
      const dy = p.y - this.CY;
      const d = Math.hypot(dx, dy) || 1;
      const out = 1.2 + this.rng() * 1.6;
      const side = (this.rng() - 0.5) * 1.6;
      const v = p.body.velocity;
      this.matter.body.setVelocity(p.body, { x: v.x + (dx / d) * out - (dy / d) * side, y: v.y + (dy / d) * out + (dx / d) * side });
    }
    this.calmUntil = Math.max(this.calmUntil, now + EVENTS.zerog.ms + 1500);
    this.ringFlash = 1;
    this.ringFlashColor = 0x9fe8ff;
  },

  tickZeroG(now) {
    const z = this.zeroG;
    if (!z) return;
    if (!z.returned && now >= z.back) {
      z.returned = true;
      this.floatText(this.W / 2, 300, 'GRAVITY RETURNS!', '#9fe8ff', 32);
      this.ringFlash = 1;
      this.ringFlashColor = 0xffffff;
      this.ringSpinV = 4;
      Sfx.shock();
      Haptics.heavy();
    }
    // floating dust drifting up while it lasts
    if (!z.returned && Math.random() < 0.25) {
      const x = Math.random() * this.W;
      const y = 300 + Math.random() * 700;
      const d = this.add.image(x, y, 'dot').setTint(0xbff2ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(17).setAlpha(0).setScale((0.25 + Math.random() * 0.3) / TEX_SCALE);
      this.tweens.add({ targets: d, alpha: { from: 0, to: 0.7 }, y: y - 60, duration: 900, yoyo: true, onComplete: () => d.destroy() });
    }
  },

  /** How gravity is changed by an event right now: almost none while floating, then strong. */
  eventGravity(now) {
    const z = this.zeroG;
    if (!z) return 1;
    return now < z.back ? 0.08 : 2.6;
  },

  /** A small label under the pause button while an event lasts. */
  refreshEventLabel() {
    const ev = this.event;
    if (!ev) {
      this.eventLabel.setVisible(false);
      return;
    }
    const left = Math.max(0, Math.ceil((ev.until - this.playMs) / 1000));
    this.eventLabel.setVisible(true).setText(`${EVENTS[ev.id].name}  ${left}s`).setColor(EVENTS[ev.id].color);
  },
};

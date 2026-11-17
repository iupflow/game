// Cosmic events: every so often, for a little while, something happens to the whole field.
// Mixed into GameScene, so `this` is the scene.
import Phaser from 'phaser';
import { Sfx } from '../sfx.js';
import { Haptics } from '../haptics.js';
import { TEX_SCALE, portraitKey, PORTRAIT_R } from '../art.js';

export const EVENTS = {
  meteors: { name: 'METEOR SHOWER', text: 'Small planets rain in for a while', ms: 11000, color: '#ffb27a' },
  gravity: { name: 'GRAVITY SURGE', text: 'Gravity pulls everything in tight', ms: 9000, color: '#c9b8ff' },
  wormhole: { name: 'WORMHOLES', text: 'Fly into one, come out of the other', ms: 14000, color: '#9fe8ff' },
  comet: { name: 'GOLDEN COMET', text: 'Tap it to catch it!', ms: 6500, color: '#ffd93d' },
};
const EVENTS_FROM = 4; // events start once an Earth has been made
const FIRST_EVENT_MS = 40000; // of play
const EVENT_GAP = [38000, 52000];
const METEOR_EVERY = 850;
const PORTAL_R = 30;
const COMET_COINS = 15;

export const EventsMixin = {
  resetEvents() {
    this.event = null;
    this.portals = null;
    this.goldComet = null;
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
    if (id === 'gravity') this.gravBoostUntil = now + def.ms;
    if (id === 'wormhole') {
      const a = this.rng() * Math.PI * 2;
      const r = this.limitRadius() * 0.62;
      this.portals = [
        { x: this.CX + Math.cos(a) * r, y: this.CY + Math.sin(a) * r, color: 0xc98cff },
        { x: this.CX - Math.cos(a) * r, y: this.CY - Math.sin(a) * r, color: 0x7fe3ff },
      ];
    }
    if (id === 'comet') this.launchGoldComet();
  },

  tickEvent(now) {
    const ev = this.event;
    if (ev.id === 'meteors' && this.playMs >= ev.nextAt) {
      ev.nextAt = this.playMs + METEOR_EVERY;
      this.dropMeteor(now);
    }
    if (ev.id === 'gravity' && this.playMs >= ev.nextAt) {
      // ripples running in toward the well
      ev.nextAt = this.playMs + 700;
      const ring = this.add.circle(this.CX, this.CY, this.ringScreen() + 30).setStrokeStyle(3, 0xc9b8ff, 0.7).setDepth(36).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: ring, props: { radius: { value: 20, ease: 'Quad.in' }, alpha: { value: 0, ease: 'Quad.in' } }, duration: 900, onComplete: () => ring.destroy() });
    }
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
    this.portals = null;
    if (this.goldComet) this.goldComet.leave();
    const [lo, hi] = EVENT_GAP;
    this.nextEventAt = this.playMs + (lo + this.rng() * (hi - lo)) * ((this.rule && this.rule.eventGap) || 1);
    if (ev && ev.id === 'gravity') this.gravBoostUntil = 0;
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

  /** Wormholes: a planet flying into one comes out of the other, still moving the same way. */
  stepWormholes(now) {
    if (!this.portals) return;
    const [A, B] = this.portals;
    for (const p of this.pieces) {
      if (!p.body || (p.portalUntil || 0) > now || p.fusing) continue;
      const v = p.body.velocity;
      const speed = Math.hypot(v.x, v.y);
      if (speed < 1.2) continue;
      for (const [from, to] of [[A, B], [B, A]]) {
        if (Math.hypot(p.x - from.x, p.y - from.y) > PORTAL_R + p.r * 0.3) continue;
        const out = PORTAL_R + p.r * 0.7;
        this.matter.body.setPosition(p.body, { x: to.x + (v.x / speed) * out, y: to.y + (v.y / speed) * out });
        p.x = p.body.position.x;
        p.y = p.body.position.y;
        p.portalUntil = now + 900;
        p.impulse(Math.atan2(v.y, v.x), 0.12);
        for (const q of [from, to]) {
          const at = this.toScreen(q.x, q.y);
          const flash = this.add.image(at.x, at.y, 'soft').setTint(q.color).setBlendMode(Phaser.BlendModes.ADD).setDepth(36).setScale(0.5 / TEX_SCALE);
          this.tweens.add({ targets: flash, scale: 1.2 / TEX_SCALE, alpha: 0, duration: 350, onComplete: () => flash.destroy() });
        }
        Sfx.warp();
        Haptics.light();
        break;
      }
    }
  },

  /** A golden comet crosses the top of the screen; tapping it pays stardust and a booster. */
  launchGoldComet() {
    const fromLeft = this.rng() < 0.5;
    const y = 300 + this.rng() * 120;
    const x0 = fromLeft ? -70 : this.W + 70;
    const x1 = fromLeft ? this.W + 70 : -70;
    const glow = this.add.image(x0, y, 'soft').setTint(0xffd04a).setBlendMode(Phaser.BlendModes.ADD).setDepth(45).setScale(1.1 / TEX_SCALE);
    const img = this.add.image(x0, y, portraitKey('comet')).setTint(0xffe08a).setDepth(46).setScale(30 / PORTRAIT_R / TEX_SCALE);
    img.setRotation(fromLeft ? 0 : Math.PI);
    const c = { img, glow, caught: false, lastTrail: 0 };
    c.leave = () => {
      if (!c.img.active) return;
      this.tweens.killTweensOf([c.img, c.glow]);
      c.img.destroy();
      c.glow.destroy();
      if (this.goldComet === c) this.goldComet = null;
    };
    this.tweens.add({
      targets: [img, glow],
      x: x1,
      y: y + (this.rng() - 0.5) * 80,
      duration: 5600,
      ease: 'Sine.inOut',
      onUpdate: () => {
        const now = this.time.now;
        if (now - c.lastTrail < 40) return;
        c.lastTrail = now;
        const d = this.add.image(img.x, img.y, Math.random() < 0.3 ? 'spark' : 'dot').setTint(0xffe08a).setBlendMode(Phaser.BlendModes.ADD).setDepth(44).setScale(0.4 / TEX_SCALE);
        this.tweens.add({ targets: d, alpha: 0, scale: 0.05 / TEX_SCALE, y: d.y + 12, duration: 600, onComplete: () => d.destroy() });
      },
      onComplete: () => {
        c.leave();
        if (this.event && this.event.id === 'comet') this.endEvent();
      },
    });
    this.goldComet = c;
  },

  /** A tap on the golden comet catches it. Returns true when the tap was used for that. */
  tryCatchComet(p) {
    const c = this.goldComet;
    if (!c || c.caught || !c.img.active) return false;
    if (Math.hypot(p.worldX - c.img.x, p.worldY - c.img.y) > 70) return false;
    c.caught = true;
    const { x, y } = c.img;
    this.gainCoinsAt(COMET_COINS, x, y);
    // and a booster, if there are boosters today
    if (!(this.rule && this.rule.noBoosters)) {
      const keys = ['laser', 'fusion', 'vortex', 'smash', ...(this.cometUnlocked ? ['comet'] : [])];
      const key = keys[Math.floor(Math.random() * keys.length)];
      this.boost[key].left++;
      this.boost[key].got++;
      this.refreshBoosters();
      this.floatText(x, y + 40, `+1 ${this.btn[key].boosterName}`, '#9fe8ff', 26);
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const sp = this.add.image(x, y, i % 2 ? 'spark' : 'dot').setTint(0xffe08a).setBlendMode(Phaser.BlendModes.ADD).setDepth(46).setScale(0.5 / TEX_SCALE);
      this.tweens.add({ targets: sp, x: x + Math.cos(a) * 60, y: y + Math.sin(a) * 60, alpha: 0, duration: 500, onComplete: () => sp.destroy() });
    }
    c.leave();
    if (this.event && this.event.id === 'comet') this.endEvent();
    Sfx.unlock();
    Haptics.success();
    return true;
  },

  /** Portals, drawn every frame. */
  drawEvents(now) {
    const g = this.eventGfx;
    g.clear();
    if (!this.portals) return;
    const s = this.fieldScale;
    const left = this.event ? (this.event.until - this.playMs) / 600 : 0;
    const fade = Math.max(0, Math.min(1, left));
    for (const [i, q] of this.portals.entries()) {
      const at = this.toScreen(q.x, q.y);
      const R = PORTAL_R * s;
      g.fillStyle(0x05020f, 0.75 * fade);
      g.fillCircle(at.x, at.y, R * 0.8);
      for (let k = 0; k < 3; k++) {
        const a = now * 0.004 * (i ? -1 : 1) + (k * Math.PI * 2) / 3;
        g.lineStyle(3, q.color, 0.9 * fade);
        g.beginPath();
        g.arc(at.x, at.y, R * (0.55 + k * 0.22), a, a + 2.2, false);
        g.strokePath();
      }
      g.lineStyle(2, q.color, 0.5 * fade);
      g.strokeCircle(at.x, at.y, R);
    }
  },

  /** A small label under the stardust counter while an event lasts. */
  refreshEventLabel() {
    const ev = this.event;
    if (!ev || ev.id === 'comet') {
      this.eventLabel.setVisible(false);
      return;
    }
    const left = Math.max(0, Math.ceil((ev.until - this.playMs) / 1000));
    this.eventLabel.setVisible(true).setText(`${EVENTS[ev.id].name}  ${left}s`).setColor(EVENTS[ev.id].color);
  },
};

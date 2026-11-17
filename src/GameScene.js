import Phaser from 'phaser';
import { Ads, store } from './ads.js';
import { Sfx } from './sfx.js';
import { Haptics } from './haptics.js';
import { TIERS, HOLE, MAX_PLANET, TEX_SCALE, PORTRAIT_R, makeTextures, portraitKey, shade } from './art.js';
import { Planet, CORE, DRAG, SQUASH_GAIN } from './Planet.js';
import { PlanetBatch } from './PlanetBatch.js';

export const W = 720;
export const H = 1280;

const CX = W / 2; // the gravity well
const CY = 640;
const CAPTURE_R = 34; // a launched planet that reaches the centre untouched is caught here
const CAPTURE_STEPS = 50;
const R_LIMIT = 275; // a settled planet reaching past this ring ends the game
const R_LAUNCH = 300; // planets wait on this orbit before launch
const STEP = 1000 / 60;
const STEP2 = STEP * STEP;
const GRAVITY = 0.15; // pull toward the centre, in px per step^2
const MIN_SPEED = 3.5; // launch speed range, in px per step
const MAX_SPEED = 28;
const PULL_DEAD = 22; // a drag shorter than this does not arm a shot
const PULL_MAX = 250; // drag length for full power
const PULL_BACK = 16; // how far the planet visibly draws back at full power
const FLIGHT_DRAG = 0.002; // air drag while a launched planet is still in flight
const IMPACT_SQUASH = 0.0114; // peak squash per unit of impact speed, between equal weights
const MAX_SQUASH = 0.42;
const RIPPLE_MIN = 0.8; // planets pressed together faster than this keep squashing
const SKIN_SPRING = 0.13; // how hard the soft skins push back (lower = squishier)
const SKIN_DAMPING = 0.2;
const WORLD_SPIN = 0.07; // the whole field slowly turns, radians per second
const SHOT_COOLDOWN = 450;
const DANGER_LIMIT_MS = 1800;
const SETTLE_MS = 1000;
const SETTLED_SPEED = 1.2; // only planets slower than this count as resting outside the ring
const COMET_BASE = 150; // energy for the first comet of a game
const COMET_STEP = 60; // every comet launched makes the next one cost this much more
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const UI = 50;
const FX = 40;
const OVERLAY = 100;
const INITIAL_SEEN = [0, 1, 2];
const SPAWN_WEIGHTS = [38, 30, 20, 12]; // only the four smallest bodies are ever launched

function mix(c1, c2, t) {
  const ch = (c, s) => (c >> s) & 255;
  const m = (s) => Math.round(ch(c1, s) + (ch(c2, s) - ch(c1, s)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}
const powerColor = (p) => (p < 0.5 ? mix(0x7fe3ff, 0xffd84a, p * 2) : mix(0xffd84a, 0xff5a4d, (p - 0.5) * 2));

export class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  create() {
    this.CX = CX;
    this.CY = CY;
    this.cameras.main.setZoom(TEX_SCALE).centerOn(W / 2, H / 2);
    makeTextures(this);

    this.pieces = [];
    this.dying = [];
    this.mergeQueue = [];
    this.cometQueue = [];
    this.bombQueue = [];
    this.contacts = new Set();
    this.held = null;
    this.hole = null;
    this.state = 'flying'; // aim | flying | crunch | over | busy | paused
    this.nextHeldAt = 0;
    this.acc = 0;
    this.slowUntil = 0;
    this.worldRot = 0;
    this.aimAngle = Math.PI / 2;
    this.aiming = false;
    this.pullStart = null;
    this.power = 0;
    this.pullStep = 0;
    this.pressAt = 0;
    this.lastNudgeAt = -1e9;
    this.gravX = CX;
    this.gravY = CY;
    this.gravScale = 1;
    this.maxTier = -1;

    this.score = 0;
    this.best = store.get('jd2_best', 0);
    this.universe = 1;
    this.combo = 0;
    this.lastMergeAt = 0;
    this.runMax = 2; // decides which planets can come out of the launcher
    this.biggest = 0;
    this.energy = 0;
    this.cometPending = false;
    this.cometUses = 0;
    this.bombs = 1;
    this.shakes = 1;
    this.revived = false;
    this.seen = store.get('jd2_seen', INITIAL_SEEN);

    this.drawBackground();
    this.backLayer = this.add.container(CX, CY).setDepth(10);
    this.bandGfx = this.add.graphics().setDepth(15);
    this.batch = new PlanetBatch(this, CX, CY).setDepth(20);
    this.frontLayer = this.add.container(CX, CY).setDepth(30);
    this.aimGfx = this.add.graphics().setDepth(36);
    this.buildField();
    this.buildHud();
    this.buildBottomBar();

    this.dots = [];
    for (let i = 0; i < 12; i++) this.dots.push(this.add.image(0, 0, 'dot').setDepth(35).setVisible(false));

    const tutorials = store.get('jd2_tut2', 0);
    if (tutorials < 3) {
      store.set('jd2_tut2', tutorials + 1);
      this.hint = this.text(W / 2, 1066, 'Pull back to aim  •  Release to launch', 24, '#ffffff').setOrigin(0.5).setAlpha(0.85);
      this.tweens.add({ targets: this.hint, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
    }

    this.nextKind = this.rollTier();
    this.prepareHeld();

    // slingshot: press anywhere, pull away from the well, release.
    // The pull's direction picks where on the orbit the planet starts; its length sets the power.
    this.input.on('pointerdown', (p, over) => {
      if (over.length || this.state !== 'aim' || !this.held) return;
      this.aiming = true;
      this.pullStart = { x: p.worldX, y: p.worldY };
      this.pressAt = this.time.now;
      this.setPower(0);
    });
    this.input.on('pointermove', (p) => {
      if (this.aiming) this.updatePull(p);
    });
    const release = (p) => {
      if (!this.aiming) return;
      this.updatePull(p);
      this.aiming = false;
      if (this.power > 0 && this.state === 'aim') {
        this.fire();
      } else {
        if (this.state === 'aim' && this.time.now - this.pressAt < 300) this.nudgeHint();
        this.setPower(0);
      }
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
  }

  // ---------- helpers ----------

  text(x, y, str, size, color = '#ffffff') {
    return this.add
      .text(x, y, str, { fontFamily: FONT, fontSize: size, color, fontStyle: 'bold' })
      .setResolution(TEX_SCALE)
      .setDepth(UI);
  }

  portrait(x, y, kind, radius) {
    return this.add.image(x, y, portraitKey(kind)).setScale(radius / PORTRAIT_R / TEX_SCALE);
  }

  /** Field coordinates (what physics uses) to screen coordinates (the field turns). */
  toScreen(x, y) {
    const c = Math.cos(this.worldRot);
    const s = Math.sin(this.worldRot);
    const dx = x - CX;
    const dy = y - CY;
    return { x: CX + dx * c - dy * s, y: CY + dx * s + dy * c };
  }

  floatText(x, y, str, color, size = 26) {
    const t = this.text(x, y, str, size, color).setOrigin(0.5).setDepth(FX + 1).setStroke('#150a33', 6);
    this.tweens.add({ targets: t, y: y - 60, alpha: 0, duration: 900, ease: 'Cubic.out', onComplete: () => t.destroy() });
  }

  fieldMaxTier() {
    let m = -1;
    for (const p of this.pieces) if (p.tier > m) m = p.tier;
    return m;
  }

  cometCost() {
    return COMET_BASE + COMET_STEP * this.cometUses;
  }

  // ---------- setup ----------

  drawBackground() {
    const g = this.add.graphics();
    g.fillGradientStyle(0x150a33, 0x150a33, 0x05030f, 0x05030f, 1);
    g.fillRect(-W, -H, W * 3, H * 3);
    for (const [x, y, s, tint] of [[150, 380, 5.2, 0x5b2bbf], [600, 900, 6, 0x1f4fb5], [520, 300, 3.6, 0xa0328f]]) {
      this.add.image(x, y, 'soft').setScale(s / TEX_SCALE).setTint(tint).setAlpha(0.2).setBlendMode(Phaser.BlendModes.ADD);
    }
    for (let i = 0; i < 110; i++) {
      g.fillStyle(0xffffff, 0.25 + Math.random() * 0.6);
      g.fillCircle(Math.random() * W, Math.random() * H, 0.6 + Math.random() * 1.5);
    }
    for (let i = 0; i < 9; i++) {
      const s = this.add.image(Math.random() * W, 200 + Math.random() * 900, 'spark').setScale(0.35 / TEX_SCALE).setAlpha(0.2);
      this.tweens.add({ targets: s, alpha: 0.9, duration: 900 + Math.random() * 1500, yoyo: true, repeat: -1, delay: Math.random() * 2000 });
    }
  }

  buildField() {
    const g = this.add.graphics();
    g.lineStyle(3, 0xffffff, 0.07);
    g.strokeCircle(0, 0, R_LAUNCH);
    g.lineStyle(2, 0x9f8cff, 0.1);
    g.strokeCircle(0, 0, R_LIMIT * 0.66);
    g.strokeCircle(0, 0, R_LIMIT * 0.33);
    this.limitRing = this.add.graphics();
    this.drawLimitRing(0xb9a8e6);
    this.limitRing.setAlpha(0.4);
    const well = this.add.image(0, 0, 'soft').setScale(2.6 / TEX_SCALE).setTint(0x9f6bff).setAlpha(0.55).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: well, scale: 3.3 / TEX_SCALE, alpha: 0.3, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    // the heart of the well
    const coreGlow = this.add.image(0, 0, 'soft').setScale(0.7 / TEX_SCALE).setTint(0xd9c8ff).setBlendMode(Phaser.BlendModes.ADD);
    const coreBall = this.add.circle(0, 0, 9, 0xf6f0ff);
    this.tweens.add({ targets: coreGlow, scale: 0.95 / TEX_SCALE, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.coreParts = [coreGlow, coreBall];
    this.backLayer.add([g, this.limitRing, well, coreGlow, coreBall]);
  }

  drawLimitRing(color) {
    const g = this.limitRing;
    g.clear();
    g.lineStyle(4, color, 1);
    const n = 48;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      g.beginPath();
      g.arc(0, 0, R_LIMIT, a0, a0 + (Math.PI * 2) / n / 2, false);
      g.strokePath();
    }
    this.limitColor = color;
  }

  buildHud() {
    this.text(40, 36, 'SCORE', 20, '#b9a8e6');
    this.scoreText = this.text(40, 56, '0', 58);
    this.bestText = this.text(40, 122, 'BEST ' + this.best, 20, '#b9a8e6');
    this.universeText = this.text(40, 148, '', 20, '#ffd93d');

    // comet meter
    this.meterGfx = this.add.graphics().setDepth(UI);
    this.meterIcon = this.portrait(CX, 86, 'comet', 22).setDepth(UI);
    this.meterLabel = this.text(CX, 140, 'COMET', 15, '#b9a8e6').setOrigin(0.5);
    this.drawMeter();

    // next planet; tap to swap
    this.text(W - 40, 36, 'NEXT', 20, '#b9a8e6').setOrigin(1, 0);
    const nx = W - 92;
    const ny = 104;
    const zone = this.add.circle(nx, ny, 46, 0xffffff, 0.08).setDepth(UI).setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => this.swap());
    this.nextIcon = this.portrait(nx, ny, 0, 28).setDepth(UI);
    this.text(nx, 153, 'tap to swap', 14, '#8f7fc2').setOrigin(0.5, 0);

    this.comboText = this.text(W / 2, 232, '', 40, '#ffd93d').setOrigin(0.5).setAlpha(0).setDepth(FX + 2);
  }

  drawMeter() {
    const g = this.meterGfx;
    const frac = this.cometPending ? 1 : Math.min(1, this.energy / this.cometCost());
    g.clear();
    g.fillStyle(0xffffff, 0.08);
    g.fillCircle(CX, 86, 44);
    g.lineStyle(8, 0xffffff, 0.14);
    g.strokeCircle(CX, 86, 40);
    if (frac > 0) {
      g.lineStyle(8, 0x7fe3ff, 1);
      g.beginPath();
      g.arc(CX, 86, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, false);
      g.strokePath();
    }
    this.meterIcon.setAlpha(0.35 + 0.65 * frac);
  }

  boosterButton(x, y, iconKey, iconScale, onTap) {
    const bg = this.add.graphics();
    bg.fillStyle(0x1b0e3d, 1);
    bg.fillRoundedRect(-50, -44, 100, 100, 22);
    bg.fillStyle(0x3d2a85, 1);
    bg.fillRoundedRect(-50, -50, 100, 100, 22);
    const icon = this.add.image(0, -2, iconKey).setScale(iconScale / TEX_SCALE);
    const badgeBg = this.add.graphics();
    const badge = this.add.text(38, -42, '', { fontFamily: FONT, fontSize: 18, color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setResolution(TEX_SCALE);
    const c = this.add.container(x, y, [bg, icon, badgeBg, badge]).setDepth(UI);
    c.setSize(100, 100).setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => c.setScale(0.94));
    c.on('pointerout', () => c.setScale(1));
    c.on('pointerup', () => {
      c.setScale(1);
      Sfx.click();
      onTap();
    });
    c.setCount = (n) => {
      badgeBg.clear();
      badgeBg.fillStyle(n > 0 ? 0xff5d73 : 0x37b24d, 1);
      if (n > 0) badgeBg.fillCircle(38, -42, 17);
      else badgeBg.fillRoundedRect(12, -58, 52, 32, 16);
      badge.setText(n > 0 ? String(n) : 'AD ▶');
      badge.setFontSize(n > 0 ? 20 : 15);
    };
    return c;
  }

  buildBottomBar() {
    this.bombBtn = this.boosterButton(100, 1202, portraitKey('bomb'), 0.62, () => this.useBomb());
    this.shakeBtn = this.boosterButton(W - 100, 1202, 'icon_shake', 1.05, () => this.useShake());
    this.bombBtn.setCount(this.bombs);
    this.shakeBtn.setCount(this.shakes);

    // album strip: every body in the chain, unknown ones as silhouettes
    const cols = 6;
    const cell = 58;
    const x0 = W / 2 - ((cols - 1) * cell) / 2;
    const y0 = 1174;
    const panel = this.add.graphics().setDepth(UI);
    panel.fillStyle(0xffffff, 0.07);
    panel.fillRoundedRect(x0 - 40, y0 - 34, (cols - 1) * cell + 80, 124, 20);
    const zone = this.add.zone(W / 2, y0 + 28, (cols - 1) * cell + 80, 124).setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => this.openAlbum());
    this.strip = TIERS.map((t, i) => {
      const x = x0 + (i % cols) * cell;
      const y = y0 + Math.floor(i / cols) * 56;
      const img = this.portrait(x, y, i, 15).setDepth(UI);
      const q = this.text(x, y, '?', 22, '#8f7fc2').setOrigin(0.5);
      return { img, q };
    });
    this.refreshStrip();
  }

  refreshStrip() {
    this.strip.forEach(({ img, q }, i) => {
      const known = this.seen.includes(i);
      if (known) img.clearTint().setAlpha(1);
      else img.setTintFill(0x2c1d66).setAlpha(0.9);
      q.setVisible(!known);
    });
  }

  // ---------- aiming and launching ----------

  rollTier() {
    const top = Phaser.Math.Clamp(this.runMax - 3, 2, SPAWN_WEIGHTS.length - 1);
    let total = 0;
    for (let i = 0; i <= top; i++) total += SPAWN_WEIGHTS[i];
    let n = Math.random() * total;
    for (let i = 0; i <= top; i++) {
      n -= SPAWN_WEIGHTS[i];
      if (n < 0) return i;
    }
    return 0;
  }

  setHeld(kind) {
    if (this.held) this.held.destroy();
    this.held = new Planet(this, kind, CX, CY);
    this.updateHeld();
  }

  prepareHeld() {
    if (this.cometPending) {
      this.cometPending = false;
      this.energy = 0;
      this.meterLabel.setText('COMET').setColor('#b9a8e6');
      this.drawMeter();
      this.setHeld('comet');
      if (!store.get('jd2_comet_tip', false)) {
        store.set('jd2_comet_tip', true);
        this.banner('COMET', 'Upgrades any planet except your biggest', '#7fe3ff', 'comet');
      }
    } else {
      this.setHeld(this.nextKind);
      this.nextKind = this.rollTier();
      this.refreshNext();
    }
    this.state = 'aim';
  }

  refreshNext() {
    this.nextIcon.setTexture(portraitKey(this.nextKind));
    this.tweens.add({ targets: this.nextIcon, scale: { from: 0.2 / TEX_SCALE, to: 28 / PORTRAIT_R / TEX_SCALE }, duration: 180, ease: 'Back.out' });
  }

  swap() {
    if (this.state !== 'aim' || !this.held || this.held.tier < 0 || this.aiming) return;
    Sfx.click();
    Haptics.light();
    const current = this.held.kind;
    this.setHeld(this.nextKind);
    this.nextKind = current;
    this.refreshNext();
  }

  updatePull(p) {
    const dx = p.worldX - this.pullStart.x;
    const dy = p.worldY - this.pullStart.y;
    const len = Math.hypot(dx, dy);
    if (len < PULL_DEAD) {
      this.setPower(0); // dragging back to where you started cancels the shot
      return;
    }
    this.aimAngle = Math.atan2(dy, dx);
    this.setPower(Math.min(1, (len - PULL_DEAD) / (PULL_MAX - PULL_DEAD)));
  }

  setPower(v) {
    this.power = v;
    // a tick when the shot arms and at every quarter of power, felt as much as heard
    const step = v <= 0 ? 0 : Math.min(5, 1 + Math.floor(v * 4));
    if (step > this.pullStep) {
      Sfx.tick(step);
      if (step === 5) Haptics.medium();
      else Haptics.light();
    }
    this.pullStep = step;
  }

  nudgeHint() {
    const now = this.time.now;
    if (now - this.lastNudgeAt < 1500) return;
    this.lastNudgeAt = now;
    this.floatText(W / 2, 1066, 'Pull back, then let go', '#ffffff', 26);
  }

  /** The waiting planet sits on the orbit at the aim angle, drawn back by the pull. */
  updateHeld() {
    const h = this.held;
    if (!h) return;
    const a = this.aimAngle - this.worldRot;
    const pw = this.aiming ? this.power : 0;
    const rr = R_LAUNCH + pw * PULL_BACK;
    h.x = CX + Math.cos(a) * rr;
    h.y = CY + Math.sin(a) * rr;
    h.tailAngle = a + Math.PI;
    if (pw > 0) {
      // stretched along the pull like a drawn slingshot
      const tq = -pw * 0.2;
      h.qx += (tq * Math.cos(2 * a) - h.qx) * 0.3;
      h.qy += (tq * Math.sin(2 * a) - h.qy) * 0.3;
    }
  }

  drawAim() {
    const g = this.aimGfx;
    const band = this.bandGfx;
    g.clear();
    band.clear();
    const h = this.held;
    if (!h || !this.aiming || this.power <= 0 || this.state !== 'aim') {
      for (const d of this.dots) d.setVisible(false);
      return;
    }
    const pw = this.power;
    const ux = Math.cos(this.aimAngle);
    const uy = Math.sin(this.aimAngle);
    const hp = this.toScreen(h.x, h.y);

    // rubber band from the orbit to the planet
    band.lineStyle(7 - 4 * pw, 0xbfe9ff, 0.5);
    for (const s of [-1, 1]) {
      const a = this.aimAngle + s * 0.17;
      band.lineBetween(CX + Math.cos(a) * (R_LAUNCH - 2), CY + Math.sin(a) * (R_LAUNCH - 2), hp.x, hp.y);
    }

    // where it will first touch something (field coordinates)
    const fdx = CX - h.x;
    const fdy = CY - h.y;
    const dist = Math.hypot(fdx, fdy) || 1;
    const dirX = fdx / dist;
    const dirY = fdy / dist;
    let reach = dist - 6;
    let first = null;
    for (const p of this.pieces) {
      const ox = p.x - h.x;
      const oy = p.y - h.y;
      const along = ox * dirX + oy * dirY;
      if (along <= 0) continue;
      const rr = (p.r + h.r) * 0.94;
      const perp2 = ox * ox + oy * oy - along * along;
      if (perp2 >= rr * rr) continue;
      const hit = along - Math.sqrt(rr * rr - perp2);
      if (hit < reach) {
        reach = hit;
        first = p;
      }
    }

    // a comet shows what it will upgrade, or that the target is too big
    let dotColor = 0xffffff;
    if (h.kind === 'comet' && first && first.tier >= 0) {
      const blocked = first.tier >= this.fieldMaxTier();
      const at = this.toScreen(first.x, first.y);
      const color = blocked ? 0xff5d73 : 0x7fe3ff;
      g.lineStyle(5, color, 0.95);
      g.strokeCircle(at.x, at.y, first.rv + 8);
      if (blocked) dotColor = 0xff5d73;
    }

    let i = 0;
    for (let t = h.r + 16; t < reach && i < this.dots.length; t += 24) {
      this.dots[i]
        .setVisible(true)
        .setTint(dotColor)
        .setPosition(hp.x - ux * t, hp.y - uy * t)
        .setScale((0.7 - i * 0.025) / TEX_SCALE)
        .setAlpha(0.85 - i * 0.05);
      i++;
    }
    for (; i < this.dots.length; i++) this.dots[i].setVisible(false);

    // power gauge around the planet
    const pr = h.r * h.pop + 13;
    g.lineStyle(7, 0xffffff, 0.14);
    g.strokeCircle(hp.x, hp.y, pr);
    g.lineStyle(7, powerColor(pw), 1);
    g.beginPath();
    g.arc(hp.x, hp.y, pr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pw, false);
    g.strokePath();
  }

  fire() {
    if (this.state !== 'aim' || !this.held || this.power <= 0) return;
    const b = this.held;
    const power = this.power;
    this.held = null;
    this.setPower(0);
    b.addBody();
    const dx = CX - b.x;
    const dy = CY - b.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * Math.pow(power, 1.2);
    this.matter.body.setVelocity(b.body, { x: (dx / d) * speed, y: (dy / d) * speed });
    b.body.frictionAir = FLIGHT_DRAG; // no drag in flight, so the power you pull is the power that lands
    b.flying = true;
    b.born = this.time.now;
    b.impulse(Math.atan2(dy, dx), -0.1 - power * 0.25); // the released slingshot stretches it along the flight
    if (b.kind === 'comet') this.cometUses++;
    if (b.tier > this.biggest) this.biggest = b.tier;
    this.pieces.push(b);
    this.state = 'flying';
    this.nextHeldAt = this.time.now + SHOT_COOLDOWN;
    Sfx.shoot(power);
    if (power > 0.75) Haptics.medium();
    else Haptics.light();
    if (this.hint) {
      this.hint.destroy();
      this.hint = null;
    }
  }

  // ---------- boosters ----------

  async rewarded() {
    const before = this.state;
    this.state = 'busy';
    const watched = await Ads.showRewarded();
    this.state = before;
    return watched;
  }

  async useBomb() {
    if (this.state !== 'aim' || !this.held || this.held.kind === 'bomb' || this.aiming) return;
    if (this.bombs <= 0) {
      if (await this.rewarded()) this.bombs++;
      this.bombBtn.setCount(this.bombs);
      return;
    }
    this.bombs--;
    this.bombBtn.setCount(this.bombs);
    const current = this.held.kind;
    if (current === 'comet') this.cometPending = true;
    else {
      this.nextKind = current;
      this.refreshNext();
    }
    this.setHeld('bomb');
    Haptics.medium();
  }

  async useShake() {
    if (this.state !== 'aim' && this.state !== 'flying') return;
    if (this.shakes <= 0) {
      if (await this.rewarded()) this.shakes++;
      this.shakeBtn.setCount(this.shakes);
      return;
    }
    this.shakes--;
    this.shakeBtn.setCount(this.shakes);
    const now = this.time.now;
    for (const p of this.pieces) {
      // everything is thrown outward and sideways, then falls back into a new arrangement
      const dx = p.x - CX;
      const dy = p.y - CY;
      const d = Math.hypot(dx, dy) || 1;
      const out = Phaser.Math.FloatBetween(4, 7);
      const side = Phaser.Math.FloatBetween(-4, 4);
      const v = p.body.velocity;
      this.matter.body.setVelocity(p.body, { x: v.x + (dx / d) * out - (dy / d) * side, y: v.y + (dy / d) * out + (dx / d) * side });
      p.impulse(Math.atan2(dy, dx), 0.24);
      p.born = now;
      p.dangerMs = 0;
    }
    this.cameras.main.shake(350, 0.012);
    Sfx.shake();
    Haptics.success();
  }

  // ---------- physics ----------

  /** One fixed step: gravity toward the well, springy skins between planets, then the hard cores. */
  physicsStep() {
    const list = this.pieces;
    const n = list.length;
    const crunch = this.state === 'crunch';
    const g = GRAVITY * this.gravScale;
    const swirl = crunch ? 0.45 : 0;
    let maxTier = -1;
    for (const p of list) {
      if (p.tier > maxTier) maxTier = p.tier;
      const b = p.body;
      const dx = this.gravX - b.position.x;
      const dy = this.gravY - b.position.y;
      const d = Math.hypot(dx, dy) || 1;
      const f = (g * Math.min(1, d / 40) * b.mass) / STEP2 / d;
      b.force.x += (dx - dy * swirl) * f;
      b.force.y += (dy + dx * swirl) * f;
    }
    this.maxTier = maxTier;

    const previous = this.contacts;
    const contacts = new Set();

    // a planet that reaches the centre without touching anything is caught by the well
    // and eases to rest there, instead of flying straight through and out the other side
    for (const p of list) {
      const b = p.body;
      const dx = b.position.x - CX;
      const dy = b.position.y - CY;
      if (p.flying && !crunch && dx * dx + dy * dy < CAPTURE_R * CAPTURE_R) {
        const speed = Math.hypot(b.velocity.x, b.velocity.y);
        p.captured = CAPTURE_STEPS;
        p.squash(Math.atan2(b.velocity.y, b.velocity.x), Math.min(MAX_SQUASH, speed * IMPACT_SQUASH * 2));
        this.land(p, speed);
      }
      if (p.captured > 0) {
        p.captured--;
        const ax = -0.04 * dx - 0.4 * b.velocity.x; // critically damped: no overshoot back and forth
        const ay = -0.04 * dy - 0.4 * b.velocity.y;
        b.force.x += (b.mass * ax) / STEP2;
        b.force.y += (b.mass * ay) / STEP2;
      }
    }

    for (let i = 0; i < n; i++) {
      const A = list[i];
      const a = A.body;
      for (let j = i + 1; j < n; j++) {
        const B = list[j];
        const b = B.body;
        const sum = A.r + B.r;
        const dx = b.position.x - a.position.x;
        const dy = b.position.y - a.position.y;
        if (dx > sum || dx < -sum || dy > sum || dy < -sum) continue;
        const d = Math.hypot(dx, dy);
        if (d >= sum || d < 0.001) continue;
        const nx = dx / d;
        const ny = dy / d;
        const overlap = sum - d;
        const vn = (b.velocity.x - a.velocity.x) * nx + (b.velocity.y - a.velocity.y) * ny; // < 0 when closing

        const key = A.id < B.id ? A.id * 65536 + B.id : B.id * 65536 + A.id;
        contacts.add(key);
        if (!previous.has(key)) {
          this.onTouch(A, B, nx, ny, -vn);
        } else if (-vn > RIPPLE_MIN) {
          // planets already touching get pressed by the impact too, so it ripples through the cluster
          const k = ((-vn - RIPPLE_MIN) * 0.004) / (a.mass + b.mass);
          const ang = Math.atan2(ny, nx);
          A.impulse(ang, k * b.mass);
          B.impulse(ang, k * a.mass);
        }

        // springy skin: pushes back harder the deeper it is pressed
        const reduced = (a.mass * b.mass) / (a.mass + b.mass);
        const depth = Math.min(1, overlap / (sum * (1 - CORE)));
        let force = reduced * (SKIN_SPRING * overlap * (1 + 1.5 * depth * depth) - SKIN_DAMPING * vn);
        if (force > 0) {
          force /= STEP2;
          a.force.x -= nx * force;
          a.force.y -= ny * force;
          b.force.x += nx * force;
          b.force.y += ny * force;
        }

        if (A.tier < 0) this.specialHit(A, B);
        else if (B.tier < 0) this.specialHit(B, A);
        else if (A.tier === B.tier && overlap > 1.5 && !A.merging && !B.merging) {
          A.merging = B.merging = true;
          this.mergeQueue.push([A, B]);
        }
      }
    }
    this.contacts = contacts;
    this.matter.world.step(STEP);
  }

  /**
   * First contact between two planets. Both squash, split by weight:
   * a light planet hitting a heavy one squashes a lot and barely dents it, and the other way round.
   */
  onTouch(A, B, nx, ny, closing) {
    if (closing > 1) {
      const mA = A.body.mass;
      const mB = B.body.mass;
      const base = (closing * IMPACT_SQUASH * 2) / (mA + mB);
      const ang = Math.atan2(ny, nx);
      A.squash(ang, Math.min(MAX_SQUASH, base * mB));
      B.squash(ang, Math.min(MAX_SQUASH, base * mA));
    }
    for (const p of [A, B]) if (p.flying) this.land(p, closing);
  }

  /** A launched planet's first contact: normal drag from now on, and feedback that scales with the hit. */
  land(p, closing) {
    p.flying = false;
    if (p.body) p.body.frictionAir = DRAG;
    if (closing <= 2) return;
    Sfx.land(closing);
    if (closing > 18) {
      Haptics.heavy();
      this.cameras.main.shake(90, 0.002 + closing * 0.0001);
    } else if (closing > 9) Haptics.medium();
    else Haptics.light();
  }

  specialHit(s, other) {
    if (s.used || other.tier < 0) return;
    if (s.kind === 'comet') {
      if (other.merging) return;
      if (other.tier >= this.maxTier) {
        // comets can't push your biggest planet any further; it just bounces off
        const now = this.time.now;
        if (now - (s.blockedAt ?? -1e9) > 700) {
          s.blockedAt = now;
          const at = this.toScreen((s.body.position.x + other.body.position.x) / 2, (s.body.position.y + other.body.position.y) / 2);
          this.floatText(at.x, at.y, 'TOO BIG', '#ff9a9a');
          Sfx.bonk();
          Haptics.light();
        }
        return;
      }
      s.used = other.merging = true;
      this.cometQueue.push([s, other]);
    } else if (s.kind === 'bomb') {
      s.used = true;
      this.bombQueue.push(s);
    }
  }

  removePiece(p) {
    const i = this.pieces.indexOf(p);
    if (i >= 0) this.pieces.splice(i, 1);
    p.destroy();
  }

  discover(tier) {
    if (tier > this.biggest) this.biggest = tier;
    if (this.seen.includes(tier)) return false;
    this.seen.push(tier);
    store.set('jd2_seen', this.seen);
    this.refreshStrip();
    this.showDiscovery(tier);
    return true;
  }

  spawnPiece(x, y, tier) {
    const b = new Planet(this, tier, x, y);
    b.addBody();
    b.pop = 0.5;
    b.pv = 0.16;
    this.pieces.push(b);
    if (tier > this.runMax) this.runMax = tier;
    this.discover(tier);
    return b;
  }

  /** Nearby planets get pushed away and wobble. */
  shockwave(x, y, range, strength) {
    for (const p of this.pieces) {
      const dx = p.x - x;
      const dy = p.y - y;
      const d = Math.hypot(dx, dy) || 1;
      const edge = d - p.r;
      if (edge > range) continue;
      const f = strength * (1 - Math.max(0, edge) / range);
      const v = p.body.velocity;
      this.matter.body.setVelocity(p.body, { x: v.x + (dx / d) * f, y: v.y + (dy / d) * f });
      p.impulse(Math.atan2(dy, dx), 0.16 * (f / strength));
    }
  }

  /** Merge result: the next body in the chain, or the black hole at the very end. */
  evolve(x, y, tier) {
    const next = tier + 1;
    const base = ((next + 1) * (next + 2)) / 2;
    if (next >= HOLE) {
      this.startCrunch(x, y);
      return { shown: MAX_PLANET, points: base * 5 };
    }
    this.spawnPiece(x, y, next);
    return { shown: next, points: base };
  }

  processQueues() {
    const now = this.time.now;
    while (this.mergeQueue.length) {
      const [a, b] = this.mergeQueue.shift();
      if (!a.body || !b.body) continue;
      const x = (a.x + b.x) / 2;
      const y = (a.y + b.y) / 2;
      const tier = a.tier;
      this.removePiece(a);
      this.removePiece(b);
      this.combo = now - this.lastMergeAt < 1300 ? this.combo + 1 : 1;
      this.lastMergeAt = now;
      const { shown, points } = this.evolve(x, y, tier);
      const total = points * this.combo * this.universe;
      this.addScore(total);
      this.mergeFx(x, y, shown, total);
      this.shockwave(x, y, TIERS[shown].r + 70, 1.8 + shown * 0.2);
      this.addEnergy(6 + tier * 2);
      Sfx.merge(tier, this.combo);
      Haptics.merge(tier + 1);
      if (tier >= 2) this.slowUntil = now + 60 + tier * 7;
    }

    while (this.cometQueue.length) {
      const [s, target] = this.cometQueue.shift();
      if (!s.body || !target.body) continue;
      const { x, y, tier } = target;
      this.removePiece(s);
      this.removePiece(target);
      const { shown, points } = this.evolve(x, y, tier);
      const total = points * 2 * this.universe;
      this.addScore(total);
      this.mergeFx(x, y, shown, total);
      this.shockwave(x, y, TIERS[shown].r + 70, 2.2);
      Sfx.star();
      Haptics.heavy();
    }

    while (this.bombQueue.length) {
      const bomb = this.bombQueue.shift();
      if (bomb.body) this.explode(bomb);
    }
  }

  explode(bomb) {
    const { x, y } = bomb;
    this.removePiece(bomb);
    let points = 0;
    for (const p of [...this.pieces]) {
      if (p.tier < 0) continue;
      if (Math.hypot(p.x - x, p.y - y) - p.r < 95) {
        points += (p.tier + 1) * 2 * this.universe;
        this.mergeFx(p.x, p.y, p.tier, 0);
        this.removePiece(p);
      }
    }
    if (points) this.addScore(points);
    const at = this.toScreen(x, y);
    const flash = this.add.image(at.x, at.y, 'soft').setTint(0xffd9a0).setScale(1 / TEX_SCALE).setDepth(FX).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: flash, scale: 7 / TEX_SCALE, alpha: 0, duration: 420, ease: 'Cubic.out', onComplete: () => flash.destroy() });
    this.shockwave(x, y, 280, 6);
    this.cameras.main.shake(260, 0.014);
    Sfx.boom();
    Haptics.success();
  }

  addEnergy(n) {
    if (this.cometPending) return;
    this.energy += n;
    if (this.energy >= this.cometCost()) {
      this.cometPending = true;
      Sfx.star();
      Haptics.medium();
      this.tweens.add({ targets: this.meterIcon, scale: { from: 44 / PORTRAIT_R / TEX_SCALE, to: 22 / PORTRAIT_R / TEX_SCALE }, duration: 400, ease: 'Back.out' });
      this.meterLabel.setText('READY!').setColor('#7fe3ff');
    }
    this.drawMeter();
  }

  addScore(points) {
    this.score += Math.round(points);
    this.scoreText.setText(String(this.score));
    this.tweens.add({ targets: this.scoreText, scale: { from: 1.18, to: 1 }, duration: 160 });
    if (this.score > this.best) {
      this.best = this.score;
      store.set('jd2_best', this.best);
      this.bestText.setText('BEST ' + this.best);
    }
  }

  // ---------- the black hole ----------

  /** Two supernovas collapse: the hole swallows the whole field, then a new universe begins. */
  startCrunch(x, y) {
    const now = this.time.now;
    this.hole = new Planet(this, HOLE, x, y);
    this.hole.pop = 0.2;
    this.hole.pv = 0.2;
    this.state = 'crunch';
    this.crunchStart = now;
    this.nextSwallowAt = now + 900; // a beat to take in what just appeared
    this.swallowed = 0;
    this.aiming = false;
    this.setPower(0);
    this.gravX = x;
    this.gravY = y;
    this.gravScale = 2.6;
    this.tweens.add({ targets: this.coreParts, alpha: 0.15, duration: 400 });
    if (!this.discover(HOLE)) this.banner('BLACK HOLE!', 'Everything falls in…', '#ffb347');
    this.cameras.main.shake(500, 0.012);
    Sfx.boom();
    Haptics.success();
  }

  swallow(p) {
    const i = this.pieces.indexOf(p);
    if (i >= 0) this.pieces.splice(i, 1);
    p.removeBody();
    p.popTarget = 0;
    this.dying.push(p);
    this.swallowed++;
    this.addScore((Math.max(0, p.tier) + 1) * 6 * this.universe);
    this.hole.pv += 0.07;
    this.hole.impulse(Math.random() * Math.PI, 0.12);
    Sfx.swallow(this.swallowed);
    Haptics.light();
  }

  updateCrunch(now) {
    const h = this.hole;
    if (now >= this.nextSwallowAt && this.pieces.length) {
      // one planet at a time, nearest first, faster and faster
      let nearest = null;
      let best = Infinity;
      for (const p of this.pieces) {
        const d = Math.hypot(p.x - h.x, p.y - h.y) - p.r;
        if (d < best) {
          best = d;
          nearest = p;
        }
      }
      const late = now - this.crunchStart > 6000;
      if (late || best < h.r * 0.7) {
        this.swallow(nearest);
        this.nextSwallowAt = now + Math.max(55, 190 - this.swallowed * 9);
      }
    }
    if (!this.pieces.length && !this.dying.length && now >= this.nextSwallowAt + 500) this.endCrunch();
  }

  endCrunch() {
    const h = this.hole;
    const at = this.toScreen(h.x, h.y);
    h.destroy();
    this.hole = null;
    this.gravX = CX;
    this.gravY = CY;
    this.gravScale = 1;
    this.tweens.add({ targets: this.coreParts, alpha: 1, duration: 600 });
    this.universe++;
    this.addScore(1000 * (this.universe - 1));
    this.universeText.setText(`UNIVERSE ${this.universe}  ·  SCORE ×${this.universe}`);
    const flash = this.add.image(at.x, at.y, 'soft').setScale(1 / TEX_SCALE).setDepth(FX).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: flash, scale: 16 / TEX_SCALE, alpha: 0, duration: 700, ease: 'Cubic.out', onComplete: () => flash.destroy() });
    this.banner(`UNIVERSE ${this.universe}`, `All scores ×${this.universe}`, '#7fe3ff');
    this.cameras.main.flash(300, 255, 255, 255);
    Sfx.discover();
    Haptics.success();
    if (this.held) this.state = 'aim';
    else {
      this.state = 'flying';
      this.nextHeldAt = this.time.now + 500;
    }
  }

  // ---------- effects ----------

  mergeFx(wx, wy, tier, points) {
    const { x, y } = this.toScreen(wx, wy);
    const t = TIERS[tier];
    const ring = this.add.circle(x, y, t.r, 0xffffff, 0).setStrokeStyle(6, 0xffffff, 0.9).setDepth(FX);
    this.tweens.add({ targets: ring, scale: 1.8, alpha: 0, duration: 320, ease: 'Cubic.out', onComplete: () => ring.destroy() });
    const n = 7 + tier;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const d = this.add
        .image(x, y, i % 3 ? 'dot' : 'spark')
        .setTint(i % 2 ? t.color : 0xffffff)
        .setScale((0.5 + Math.random() * 0.7) / TEX_SCALE)
        .setDepth(FX);
      const dist = t.r + 30 + Math.random() * 60;
      this.tweens.add({
        targets: d,
        x: x + Math.cos(ang) * dist,
        y: y + Math.sin(ang) * dist,
        alpha: 0,
        scale: 0.1 / TEX_SCALE,
        angle: 180,
        duration: 380 + Math.random() * 240,
        ease: 'Cubic.out',
        onComplete: () => d.destroy(),
      });
    }
    if (points > 0) {
      const label = this.text(x, y, '+' + Math.round(points), 26 + tier * 2).setOrigin(0.5).setDepth(FX + 1).setStroke('#150a33', 6);
      this.tweens.add({ targets: label, y: y - 70, alpha: 0, duration: 750, ease: 'Cubic.out', onComplete: () => label.destroy() });
    }
    if (this.combo >= 2 && points > 0) {
      this.comboText.setText('COMBO x' + this.combo).setAlpha(1).setScale(1.3);
      this.tweens.killTweensOf(this.comboText);
      this.tweens.add({ targets: this.comboText, scale: 1, duration: 150 });
      this.tweens.add({ targets: this.comboText, alpha: 0, delay: 800, duration: 300 });
    }
    if (tier >= 4) this.cameras.main.shake(120, 0.003 + tier * 0.0007);
  }

  /** A card that drops in under the top bar, so it never hides the centre of the field. */
  banner(title, subtitle, color, kind = null) {
    const y = 270;
    const hasPic = kind !== null;
    const picW = hasPic ? 110 : 0;
    const t1 = this.add.text(0, -26, title, { fontFamily: FONT, fontSize: 34, color, fontStyle: 'bold' }).setOrigin(0.5).setResolution(TEX_SCALE);
    const t2 = this.add.text(0, 22, subtitle, { fontFamily: FONT, fontSize: 24, color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setResolution(TEX_SCALE);
    const w = Phaser.Math.Clamp(Math.max(t1.width, t2.width) + 70 + picW, 460, 680);
    const tx = picW / 2;
    t1.x = tx;
    t2.x = tx;
    const bg = this.add.graphics();
    bg.fillStyle(0x0b0524, 0.9);
    bg.fillRoundedRect(-w / 2, -70, w, 140, 28);
    bg.lineStyle(4, Phaser.Display.Color.HexStringToColor(color).color, 0.9);
    bg.strokeRoundedRect(-w / 2, -70, w, 140, 28);
    const items = [bg];
    if (hasPic) items.push(this.portrait(-w / 2 + 64, 0, kind, 40));
    items.push(t1, t2);
    const c = this.add.container(W / 2, y - 60, items).setDepth(60).setAlpha(0);
    this.tweens.add({ targets: c, y, alpha: 1, duration: 260, ease: 'Back.out' });
    this.tweens.add({ targets: c, alpha: 0, y: y - 40, delay: 1900, duration: 300, onComplete: () => c.destroy() });
  }

  showDiscovery(tier) {
    Sfx.discover();
    Haptics.success();
    this.banner('NEW DISCOVERY', TIERS[tier].name, '#ffd93d', tier);
    for (let i = 0; i < 22; i++) {
      const d = this.add
        .image(W / 2, 270, 'spark')
        .setTint(Phaser.Display.Color.HSVToRGB(Math.random(), 0.6, 1).color)
        .setScale((0.6 + Math.random()) / TEX_SCALE)
        .setDepth(59);
      const ang = Math.random() * Math.PI * 2;
      const dist = 180 + Math.random() * 200;
      this.tweens.add({
        targets: d,
        x: W / 2 + Math.cos(ang) * dist,
        y: 270 + Math.sin(ang) * dist * 0.6 + 60,
        alpha: 0,
        angle: 360,
        duration: 800 + Math.random() * 500,
        ease: 'Cubic.out',
        onComplete: () => d.destroy(),
      });
    }
  }

  // ---------- main loop ----------

  update(_time, delta) {
    const now = this.time.now;
    const crunch = this.state === 'crunch';
    if (crunch || this.state === 'aim' || this.state === 'flying') {
      this.worldRot += ((WORLD_SPIN * Math.min(delta, 50)) / 1000) * (crunch ? 5 : 1);
      this.acc += Math.min(delta, 50) * (now < this.slowUntil ? 0.3 : 1);
      let steps = 0;
      while (this.acc >= STEP && steps < 3) {
        this.physicsStep();
        this.acc -= STEP;
        steps++;
      }
      if (steps === 3) this.acc = 0;
      this.processQueues();
      if (this.state === 'crunch') this.updateCrunch(now);
      else {
        this.checkPieces(now, delta);
        if (this.state === 'flying' && now >= this.nextHeldAt) this.prepareHeld();
      }
    }
    this.backLayer.rotation = this.worldRot;
    this.batch.rotation = this.worldRot;
    this.frontLayer.rotation = this.worldRot;
    this.updateHeld();
    this.renderPlanets(delta, now);
    this.drawAim();
  }

  checkPieces(now, delta) {
    let worst = 0;
    for (const p of [...this.pieces]) {
      const age = now - p.born;
      if (p.flying && age > 1800) this.land(p, 0);
      if (p.tier < 0) {
        // a special that never found a target fizzles out
        if (age > 5000 && !p.used) {
          if (p.kind === 'bomb') this.explode(p);
          else {
            this.mergeFx(p.x, p.y, 0, 0);
            this.removePiece(p);
          }
        }
        continue;
      }
      const reach = Math.hypot(p.x - CX, p.y - CY) + p.r;
      const v = p.body.velocity;
      if (age < SETTLE_MS || reach <= R_LIMIT) p.dangerMs = 0;
      else if (Math.hypot(v.x, v.y) < SETTLED_SPEED) p.dangerMs += delta; // knocked-out planets get time to fall back
      if (p.dangerMs > worst) worst = p.dangerMs;
    }
    const danger = worst > 0;
    if (danger !== (this.limitColor === 0xff5d73)) this.drawLimitRing(danger ? 0xff5d73 : 0xb9a8e6);
    this.limitRing.setAlpha(danger ? 0.55 + 0.45 * Math.abs(Math.sin(now / 90)) : 0.4);
    if (worst > DANGER_LIMIT_MS) this.gameOver();
  }

  renderPlanets(delta, now) {
    const list = this.pieces;
    for (const p of list) {
      p.sync();
      p.planes.length = 0;
    }
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const ra = a.rv;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const rb = b.rv;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const sum = ra + rb;
        if (dx > sum || dx < -sum || dy > sum || dy < -sum) continue;
        const d = Math.hypot(dx, dy);
        if (d >= sum || d < 0.001) continue;
        const nx = dx / d;
        const ny = dy / d;
        // the lighter planet gives way: it takes the larger share of the dent
        const share = b.w / (a.w + b.w);
        const da = ra - (sum - d) * share;
        a.planes.push(nx, ny, da);
        b.planes.push(-nx, -ny, d - da);
      }
    }
    const draw = this.batch.planets;
    draw.length = 0;
    for (const p of list) {
      p.update(delta, now);
      draw.push(p);
    }
    if (this.hole) {
      this.hole.update(delta, now);
      draw.push(this.hole);
    }
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const p = this.dying[i];
      if (this.hole) {
        p.x += (this.hole.x - p.x) * 0.2;
        p.y += (this.hole.y - p.y) * 0.2;
      }
      p.update(delta, now);
      if (p.pop < 0.1) {
        p.destroy();
        this.dying.splice(i, 1);
      } else draw.push(p);
    }
    if (this.held) {
      this.held.update(delta, now);
      draw.push(this.held);
    }
  }

  // ---------- game over, revive, ads ----------

  gameOver() {
    this.state = 'over';
    this.aiming = false;
    this.setPower(0);
    Sfx.gameOver();
    Haptics.heavy();
    this.showGameOver();
  }

  button(x, y, w, h, label, color, onClick, fontSize = 30) {
    const bg = this.add.graphics();
    bg.fillStyle(shade(color, 0.7), 1);
    bg.fillRoundedRect(-w / 2, -h / 2 + 6, w, h, 20);
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 20);
    const text = this.add.text(0, 0, label, { fontFamily: FONT, fontSize, color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setResolution(TEX_SCALE);
    const c = this.add.container(x, y, [bg, text]).setDepth(OVERLAY);
    c.setSize(w, h).setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => c.setScale(0.96));
    c.on('pointerout', () => c.setScale(1));
    c.on('pointerup', () => {
      c.setScale(1);
      Sfx.click();
      onClick(c, text);
    });
    c.label = text;
    return c;
  }

  panel(x, y, w, h) {
    const dim = this.add.rectangle(W / 2, H / 2, W * 3, H * 3, 0x05020f, 0.8).setInteractive().setDepth(OVERLAY);
    const g = this.add.graphics().setDepth(OVERLAY);
    g.fillStyle(0x2a1a66, 1);
    g.fillRoundedRect(x, y, w, h, 36);
    g.lineStyle(4, 0xffffff, 0.15);
    g.strokeRoundedRect(x, y, w, h, 36);
    return [dim, g];
  }

  showGameOver() {
    const items = this.panel(70, 250, W - 140, 800);
    const add = (o) => {
      items.push(o.setDepth(OVERLAY));
      return o;
    };
    add(this.text(W / 2, 312, 'GAME OVER', 50).setOrigin(0.5));
    add(this.text(W / 2, 400, String(this.score), 92, '#ffd93d').setOrigin(0.5));
    const isBest = this.score > 0 && this.score >= this.best;
    add(this.text(W / 2, 474, isBest ? 'NEW BEST!' : 'BEST ' + this.best, 26, isBest ? '#8ce99a' : '#b9a8e6').setOrigin(0.5));

    add(this.portrait(W / 2 - 150, 570, this.biggest, 38));
    add(this.text(W / 2 - 80, 536, 'BIGGEST', 18, '#b9a8e6'));
    add(this.text(W / 2 - 80, 558, TIERS[this.biggest].name, 32));
    add(this.text(W / 2 - 80, 598, `Album ${this.seen.length} / ${TIERS.length}`, 18, '#b9a8e6'));

    let y = 720;
    if (!this.revived) {
      const revive = this.button(W / 2, y, 440, 92, '▶  REVIVE  (watch ad)', 0x37b24d, async () => {
        if (this.state !== 'over') return;
        this.state = 'busy';
        const watched = await Ads.showRewarded();
        if (watched) {
          items.forEach((o) => o.destroy());
          this.revive();
        } else {
          this.state = 'over';
        }
      });
      items.push(revive);
      y += 112;
    }
    const again = this.button(W / 2, y, 440, 92, 'PLAY AGAIN', 0x4c6ef5, async () => {
      if (this.state !== 'over') return;
      this.state = 'busy';
      await Ads.betweenGames();
      this.scene.restart();
    });
    items.push(again);
    y += 104;
    const noAds = this.button(W / 2, y, 440, 64, Ads.removed ? 'Ads removed ✓' : 'Remove Ads  $2.99', 0x6741d9, async (c) => {
      if (Ads.removed || this.state !== 'over') return;
      this.state = 'busy';
      const ok = await Ads.purchaseRemoveAds();
      if (ok) c.label.setText('Ads removed ✓');
      this.state = 'over';
    }, 24);
    items.push(noAds);
  }

  /** Reward for watching an ad: the outer shell is blown away and play continues. */
  revive() {
    this.revived = true;
    for (const p of [...this.pieces]) {
      if (Math.hypot(p.x - CX, p.y - CY) + p.r > R_LIMIT * 0.62) {
        this.mergeFx(p.x, p.y, Math.max(0, p.tier), 0);
        this.removePiece(p);
      } else {
        p.dangerMs = 0;
      }
    }
    this.mergeQueue.length = 0;
    this.cometQueue.length = 0;
    this.bombQueue.length = 0;
    this.combo = 0;
    this.acc = 0;
    Haptics.success();
    if (this.held) this.state = 'aim';
    else {
      this.state = 'flying';
      this.nextHeldAt = this.time.now + 200;
    }
  }

  // ---------- album ----------

  openAlbum() {
    if (this.state !== 'aim' && this.state !== 'flying') return;
    const before = this.state;
    const pausedAt = this.time.now;
    this.state = 'paused';
    this.aiming = false;
    this.setPower(0);
    Sfx.click();
    const items = this.panel(50, 170, W - 100, 940);
    const add = (o) => {
      items.push(o.setDepth(OVERLAY));
      return o;
    };
    add(this.text(W / 2, 222, 'STAR ALBUM', 44).setOrigin(0.5));
    add(this.text(W / 2, 270, `${this.seen.length} of ${TIERS.length} discovered`, 22, '#b9a8e6').setOrigin(0.5));
    TIERS.forEach((t, i) => {
      const x = W / 2 + ((i % 3) - 1) * 190;
      const y = 384 + Math.floor(i / 3) * 172;
      const known = this.seen.includes(i);
      const pic = add(this.portrait(x, y, i, 36));
      if (!known) pic.setTintFill(0x1b0e3d);
      add(this.text(x, y + 64, known ? t.name : '???', 22, known ? '#ffffff' : '#8f7fc2').setOrigin(0.5));
      if (!known) add(this.text(x, y, '?', 44, '#8f7fc2').setOrigin(0.5));
    });
    const close = this.button(W / 2, 1050, 300, 76, 'CLOSE', 0x4c6ef5, () => {
      items.forEach((o) => o.destroy());
      // time spent in the album does not count against cooldowns or danger timers
      const pausedFor = this.time.now - pausedAt;
      this.nextHeldAt += pausedFor;
      this.lastMergeAt += pausedFor;
      for (const p of this.pieces) p.born += pausedFor;
      this.state = before;
    });
    items.push(close);
  }
}

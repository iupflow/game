import Phaser from 'phaser';
import { Ads, store } from './ads.js';
import { Sfx } from './sfx.js';
import { Haptics } from './haptics.js';
import {
  TIERS,
  HOLE,
  MAX_PLANET,
  TEX_SCALE,
  PORTRAIT_R,
  ALL_KINDS,
  makeCommonTextures,
  makeKindTextures,
  hasKindTextures,
  portraitKey,
  shade,
} from './art.js';
import { Planet, CORE, DRAG } from './Planet.js';
import { PlanetBatch } from './PlanetBatch.js';

export const W = 720;
export const H = 1280;

const CX = W / 2; // the gravity well
const CY = 640;
const CAPTURE_R = 34; // a launched planet that reaches the centre untouched is caught here
const CAPTURE_STEPS = 50;
const R_LIMIT = 275; // the ring planets must stay inside, on screen
const R_LAUNCH = 300; // planets wait on this orbit before launch, on screen
// As bigger bodies appear the view pulls back, so the ring holds more space: by the biggest tier reached.
const FIELD_SCALE = (tier) => (tier >= 13 ? 0.75 : tier >= 12 ? 0.85 : tier >= 11 ? 0.97 : 1);
const STEP = 1000 / 60;
const STEP2 = STEP * STEP;
const GRAVITY = 0.15; // pull toward the centre, in px per step^2
const DROP_SPEED = 0.6; // a tap lets the planet go almost at rest: gravity does the rest
const MIN_SPEED = 3; // launch speed range for a pull, in px per step
const MAX_SPEED = 28;
const PULL_DEAD = 18; // a drag shorter than this is a tap, not a pull
const PULL_MAX = 165; // drag length for full power, when the screen leaves room for it
const PULL_MIN_FULL = 70; // near a screen edge, full power is reached sooner, but never sooner than this
const PULL_BACK = 16; // how far the planet visibly draws back at full power
const FLIGHT_DRAG = 0.002; // air drag while a launched planet is still in flight
const SCATTER_DRAG = 0.012; // little drag while the field is scattered, so planets fly freely
const BOUNCY_DAMPING = 0.04; // while scattered, planets bounce off each other instead of sticking
const BOUNCY_RESTITUTION = 0.55;
const WALL_SIDE = 6; // the screen edges are walls, so nothing is ever flung out of sight
const WALL_TOP = 186;
const WALL_BOTTOM = 1062;
const IMPACT_SQUASH = 0.0114; // peak squash per unit of impact speed, between equal weights
const MAX_SQUASH = 0.42;
const RIPPLE_MIN = 0.8; // planets pressed together faster than this keep squashing
const SKIN_SPRING = 0.13; // how hard the soft skins push back (lower = squishier)
const SKIN_DAMPING = 0.2;
const WORLD_SPIN = 0.07; // the whole field slowly turns, radians per second
const SHOT_COOLDOWN = 450;
const DANGER_LIMIT_MS = 5000; // how long a planet may rest outside the ring
const DANGER_MARGIN = 6; // a planet must be clearly outside, not just touching the line
const REST_SPEED = 0.3; // slower than this counts as resting...
const REST_MS = 450; // ...once it has stayed that slow this long
const SETTLE_MS = 1000;
const COMET_BASE = 150; // energy for the first comet of a game
const COMET_STEP = 60; // every comet launched makes the next one cost this much more
const WRECKER_SPEED = 19; // px per step
const LASER_CHARGE_MS = 420;
const LASER_FIRST_MS = 520; // how long the beam stays on the first target
const LASER_NEXT_MS = 260; // and on each one after it
const FUSION_MS = 2600;
const VORTEX_MS = 3200;
const VORTEX_R = 30; // the vortex's core
const VORTEX_RANGE = 185; // how far its pull reaches: about two thirds of the ring, so where you open it matters
const VORTEX_MAX_TIER = 4; // it swallows anything up to Earth size
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const UI = 50;
const FX = 40;
const OVERLAY = 100;
const INITIAL_SEEN = [0, 1, 2];
const SPAWN_WEIGHTS = [38, 30, 20, 12]; // for the smallest to the biggest body the launcher can give
/**
 * Which bodies the launcher can give: Moon to Mars at first, then Venus too. Once a Sun is made the
 * Moons stop coming, and from the Blue Giant on Mercury stops too, so the long road through the stars
 * keeps moving. Nothing bigger than Earth is ever launched.
 */
function launchRange(runMax) {
  const lo = runMax >= 11 ? 2 : runMax >= 9 ? 1 : 0;
  const hi = Math.min(4, lo + 3, Math.max(2, runMax - 3));
  return [lo, hi];
}
const FIRST_KINDS = [0, 1, 2, 'comet', 'wrecker']; // what the first screen shows; the rest is textured in the background
const HINT_Y = 1032;

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
    makeCommonTextures(this);
    for (const kind of FIRST_KINDS) makeKindTextures(this, kind);

    this.pieces = [];
    this.dying = [];
    this.mergeQueue = [];
    this.cometQueue = [];
    this.contacts = new Set();
    this.held = null;
    this.hole = null;
    this.wrecker = null;
    this.wreckerIncoming = false;
    this.vortex = null;
    this.fusionPairs = null;
    this.fusionUntil = 0;
    this.scatterUntil = 0;
    this.culprit = null;
    this.beam = null;
    this.state = 'flying'; // aim | flying | crunch | over | busy | paused
    this.nextHeldAt = 0;
    this.acc = 0;
    this.slowUntil = 0;
    this.calmUntil = 0;
    this.gravBoostUntil = 0;
    this.worldRot = 0;
    this.fieldScale = 1;
    this.universeMax = 0; // the biggest tier reached in this universe; sets how far the view pulls back
    this.aimAngle = Math.PI / 2;
    this.aiming = false;
    this.pulled = false;
    this.pullStart = null;
    this.power = 0;
    this.pullStep = 0;
    this.targeting = null; // 'laser' | 'vortex' while the next tap picks a target
    this.laserBusy = false;
    this.gravX = CX;
    this.gravY = CY;
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
    this.lasers = 1;
    this.fusions = 1;
    this.vortexes = 1;
    this.wreckers = 1;
    this.revived = false;
    this.seen = store.get('jd3_seen', INITIAL_SEEN);
    this.bannerQueue = [];
    this.bannerBusy = false;

    this.drawBackground();
    this.ringLayer = this.add.container(CX, CY).setDepth(9); // field decoration: turns, never scales
    this.backLayer = this.add.container(CX, CY).setDepth(10);
    this.bandGfx = this.add.graphics().setDepth(15);
    this.batch = new PlanetBatch(this, CX, CY).setDepth(20);
    this.frontLayer = this.add.container(CX, CY).setDepth(30);
    this.fusionGfx = this.add.graphics().setDepth(33).setBlendMode(Phaser.BlendModes.ADD);
    this.vortexGfx = this.add.graphics().setDepth(34);
    this.aimGfx = this.add.graphics().setDepth(36);
    this.dangerGfx = this.add.graphics().setDepth(37);
    this.beamGfx = this.add.graphics().setDepth(FX + 2).setBlendMode(Phaser.BlendModes.ADD);
    this.buildField();
    this.buildHud();
    this.buildBottomBar();

    this.dots = [];
    for (let i = 0; i < 12; i++) this.dots.push(this.add.image(0, 0, 'dot').setDepth(35).setVisible(false));

    const tutorials = store.get('jd2_tut3', 0);
    if (tutorials < 3) {
      store.set('jd2_tut3', tutorials + 1);
      this.hint = this.text(W / 2, HINT_Y, 'Tap to drop  •  Pull back to launch', 24, '#ffffff').setOrigin(0.5).setAlpha(0.85);
      this.tweens.add({ targets: this.hint, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
    }
    this.targetHint = this.text(W / 2, HINT_Y, '', 26, '#ff9ae6').setOrigin(0.5).setVisible(false);
    this.dangerLabel = this.text(0, 0, '', 34, '#ffffff').setOrigin(0.5).setDepth(38).setStroke('#7a0f2a', 7).setVisible(false);

    this.nextKind = this.rollTier();
    this.prepareHeld();

    // the bigger bodies are textured one per frame after start-up, so the game appears at once
    this.textureQueue = ALL_KINDS.filter((k) => !hasKindTextures(this, k));
    if (this.textureQueue.length) {
      this.time.addEvent({
        delay: 1,
        repeat: this.textureQueue.length - 1,
        callback: () => {
          const kind = this.textureQueue.shift();
          if (kind !== undefined && !hasKindTextures(this, kind)) makeKindTextures(this, kind);
          this.refreshStrip();
        },
      });
    }

    // Tap: the planet is let go from the orbit at the angle you tapped, and gravity pulls it in.
    // Pull: press anywhere and drag; the drag's direction picks the side, its length the power.
    this.input.on('pointerdown', (p, over) => {
      if (this.targeting) {
        if (!over.length) this.pickTarget(p);
        return;
      }
      if (over.length || this.state !== 'aim' || !this.held) return;
      this.aiming = true;
      this.pulled = false;
      this.pullStart = { x: p.worldX, y: p.worldY };
      this.setPower(0);
    });
    this.input.on('pointermove', (p) => {
      if (this.aiming) this.updatePull(p);
    });
    const release = (p) => {
      if (!this.aiming) return;
      this.updatePull(p);
      this.aiming = false;
      if (this.state !== 'aim') {
        this.setPower(0);
      } else if (this.power > 0) {
        this.fire(this.power);
      } else if (!this.pulled) {
        const dx = this.pullStart.x - CX;
        const dy = this.pullStart.y - CY;
        if (Math.hypot(dx, dy) > 40) this.aimAngle = Math.atan2(dy, dx);
        this.fire(0);
      } else {
        this.setPower(0); // pulled, then brought back to the start: cancelled
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

  /**
   * A button that only reacts when the press also started on it, so a pull that happens
   * to end over a button does not trigger it.
   */
  tappable(obj, onTap, pressScale = 0.94) {
    obj.setInteractive({ useHandCursor: true });
    obj.on('pointerdown', () => {
      obj.pressed = true;
      if (pressScale !== 1) obj.setScale(pressScale);
    });
    obj.on('pointerout', () => {
      obj.pressed = false;
      if (pressScale !== 1) obj.setScale(1);
    });
    obj.on('pointerup', () => {
      if (pressScale !== 1) obj.setScale(1);
      if (!obj.pressed) return;
      obj.pressed = false;
      if (this.targeting && obj !== this.targetingBtn) this.cancelTargeting();
      onTap(obj);
    });
    return obj;
  }

  /** Field coordinates (what physics uses) to screen coordinates: the field turns and, late on, pulls back. */
  toScreen(x, y) {
    const s = this.fieldScale;
    const c = Math.cos(this.worldRot);
    const n = Math.sin(this.worldRot);
    const dx = (x - CX) * s;
    const dy = (y - CY) * s;
    return { x: CX + dx * c - dy * n, y: CY + dx * n + dy * c };
  }

  /** Screen coordinates back to field coordinates. */
  toField(x, y) {
    const s = this.fieldScale;
    const c = Math.cos(-this.worldRot);
    const n = Math.sin(-this.worldRot);
    const dx = x - CX;
    const dy = y - CY;
    return { x: CX + (dx * c - dy * n) / s, y: CY + (dx * n + dy * c) / s };
  }

  /** The ring's radius in field units: it holds more space once the view has pulled back. */
  limitRadius() {
    return R_LIMIT / this.fieldScale;
  }

  /** The part of the world the player's finger can reach: the whole window, in world units. */
  reachableBounds() {
    const b = this.scale.canvasBounds;
    if (!b || !b.width) return { left: 0, right: W, top: 0, bottom: H };
    const k = W / b.width;
    return {
      left: -b.left * k,
      right: (window.innerWidth - b.left) * k,
      top: -b.top * k,
      bottom: (window.innerHeight - b.top) * k,
    };
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

  canUseBooster() {
    return this.state === 'aim' || this.state === 'flying';
  }

  // ---------- setup ----------

  drawBackground() {
    const g = this.add.graphics();
    g.fillGradientStyle(0x221a5a, 0x221a5a, 0x0c0a26, 0x0c0a26, 1);
    g.fillRect(-W, -H, W * 3, H * 3);
    for (const [x, y, s, tint] of [[150, 380, 5.2, 0x6a45d8], [600, 900, 6, 0x3a6fd8], [520, 300, 3.6, 0xc05aa8]]) {
      this.add.image(x, y, 'soft').setScale(s / TEX_SCALE).setTint(tint).setAlpha(0.22).setBlendMode(Phaser.BlendModes.ADD);
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
    this.drawLimitRing(0xc9bcff);
    this.limitRing.setAlpha(0.55);
    const well = this.add.image(0, 0, 'soft').setScale(2.6 / TEX_SCALE).setTint(0x9f6bff).setAlpha(0.55).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: well, scale: 3.3 / TEX_SCALE, alpha: 0.3, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    // the heart of the well
    const coreGlow = this.add.image(0, 0, 'soft').setScale(0.7 / TEX_SCALE).setTint(0xd9c8ff).setBlendMode(Phaser.BlendModes.ADD);
    const coreBall = this.add.circle(0, 0, 9, 0xf6f0ff);
    this.tweens.add({ targets: coreGlow, scale: 0.95 / TEX_SCALE, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.coreParts = [coreGlow, coreBall];
    this.ringLayer.add([g, this.limitRing, well, coreGlow, coreBall]);
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
    const zone = this.add.circle(nx, ny, 46, 0xffffff, 0.08).setDepth(UI);
    this.tappable(zone, () => this.swap(), 1);
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

  boosterButton(x, y, iconKey, iconScale, label, onTap) {
    const bg = this.add.graphics();
    bg.fillStyle(0x1b0e3d, 1);
    bg.fillRoundedRect(-52, -44, 104, 100, 22);
    bg.fillStyle(0x3d2a85, 1);
    bg.fillRoundedRect(-52, -50, 104, 100, 22);
    const ring = this.add.graphics();
    const icon = this.add.image(0, -9, iconKey).setScale(iconScale / TEX_SCALE);
    const name = this.add.text(0, 33, label, { fontFamily: FONT, fontSize: 13, color: '#cfc4ff', fontStyle: 'bold' }).setOrigin(0.5).setResolution(TEX_SCALE);
    const badgeBg = this.add.graphics();
    const badge = this.add.text(40, -42, '', { fontFamily: FONT, fontSize: 18, color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setResolution(TEX_SCALE);
    const c = this.add.container(x, y, [bg, ring, icon, name, badgeBg, badge]).setDepth(UI);
    c.setSize(104, 100);
    this.tappable(c, () => {
      Sfx.click();
      onTap();
    });
    c.setCount = (n) => {
      badgeBg.clear();
      badgeBg.fillStyle(n > 0 ? 0xff5d73 : 0x37b24d, 1);
      if (n > 0) badgeBg.fillCircle(40, -42, 17);
      else badgeBg.fillRoundedRect(14, -58, 52, 32, 16);
      badge.setText(n > 0 ? String(n) : 'AD ▶');
      badge.setFontSize(n > 0 ? 20 : 15);
    };
    c.setActive = (on) => {
      ring.clear();
      if (on) {
        ring.lineStyle(5, 0xff6ae0, 1);
        ring.strokeRoundedRect(-54, -52, 108, 104, 24);
      }
    };
    return c;
  }

  buildBottomBar() {
    const y = 1206;
    this.laserBtn = this.boosterButton(96, y, 'icon_laser', 0.9, 'LASER', () => this.useLaser());
    this.fusionBtn = this.boosterButton(272, y, 'icon_fusion', 1, 'FUSION', () => this.useFusion());
    this.vortexBtn = this.boosterButton(448, y, 'icon_vortex', 1, 'VORTEX', () => this.useVortex());
    this.wreckerBtn = this.boosterButton(624, y, portraitKey('wrecker'), 0.55, 'SMASH', () => this.useWrecker());
    this.laserBtn.setCount(this.lasers);
    this.fusionBtn.setCount(this.fusions);
    this.vortexBtn.setCount(this.vortexes);
    this.wreckerBtn.setCount(this.wreckers);

    // album strip: only the bodies found so far, then one '?'. Nothing about what is still
    // hidden is shown, not even how many there are. Tap for the album.
    this.stripY = 1096;
    this.stripPanel = this.add.graphics().setDepth(UI);
    const zone = this.add.zone(W / 2, this.stripY, W - 40, 56);
    this.tappable(zone, () => this.openAlbum(), 1);
    this.strip = TIERS.map(() => this.add.image(0, this.stripY, 'dot').setDepth(UI).setVisible(false));
    this.stripMore = this.text(0, this.stripY, '?', 22, '#c9b8ff').setOrigin(0.5);
    this.tweens.add({ targets: this.stripMore, alpha: 0.45, duration: 900, yoyo: true, repeat: -1 });
    this.refreshStrip();
  }

  /** The bodies found so far, in chain order. */
  found() {
    return TIERS.map((t, i) => i).filter((i) => this.seen.includes(i));
  }

  refreshStrip() {
    if (!this.strip) return;
    const found = this.found().filter((i) => hasKindTextures(this, i));
    const more = this.found().length < TIERS.length;
    const n = found.length + (more ? 1 : 0);
    const cell = Math.min(52, 600 / Math.max(1, n - 1));
    const x0 = W / 2 - ((n - 1) * cell) / 2;
    this.strip.forEach((img) => img.setVisible(false));
    found.forEach((tier, i) => {
      const img = this.strip[i];
      if (img.texture.key !== portraitKey(tier)) img.setTexture(portraitKey(tier)).setScale(14 / PORTRAIT_R / TEX_SCALE);
      img.setPosition(x0 + i * cell, this.stripY).setVisible(true);
    });
    this.stripMore.setVisible(more).setX(x0 + found.length * cell);
    const w = (n - 1) * cell + 64;
    this.stripPanel.clear();
    this.stripPanel.fillStyle(0xffffff, 0.07);
    this.stripPanel.fillRoundedRect(W / 2 - w / 2, this.stripY - 26, w, 52, 26);
  }

  // ---------- aiming and launching ----------

  rollTier() {
    const [lo, hi] = launchRange(this.runMax);
    let total = 0;
    for (let t = lo; t <= hi; t++) total += SPAWN_WEIGHTS[t - lo];
    let n = Math.random() * total;
    for (let t = lo; t <= hi; t++) {
      n -= SPAWN_WEIGHTS[t - lo];
      if (n < 0) return t;
    }
    return lo;
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
    Sfx.swap();
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
      this.setPower(0); // a tap so far, or a pull brought back to the start (cancel)
      return;
    }
    this.pulled = true;
    const ux = dx / len;
    const uy = dy / len;
    this.aimAngle = Math.atan2(uy, ux);
    // full power is always reachable before the finger hits the edge of the screen
    const b = this.reachableBounds();
    const s = this.pullStart;
    let room = Infinity;
    if (ux > 0.001) room = Math.min(room, (b.right - s.x) / ux);
    if (ux < -0.001) room = Math.min(room, (b.left - s.x) / ux);
    if (uy > 0.001) room = Math.min(room, (b.bottom - s.y) / uy);
    if (uy < -0.001) room = Math.min(room, (b.top - s.y) / uy);
    const full = Phaser.Math.Clamp(room - 12, PULL_MIN_FULL, PULL_MAX);
    this.setPower(Math.min(1, (len - PULL_DEAD) / (full - PULL_DEAD)));
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

  /** The waiting planet sits on the orbit at the aim angle, drawn back by the pull. */
  updateHeld() {
    const h = this.held;
    if (!h) return;
    const a = this.aimAngle - this.worldRot;
    const pw = this.aiming ? this.power : 0;
    const rr = (R_LAUNCH + pw * PULL_BACK) / this.fieldScale;
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

  drawAim(now) {
    const g = this.aimGfx;
    const band = this.bandGfx;
    const s = this.fieldScale;
    g.clear();
    band.clear();
    if (this.targeting === 'laser') {
      // every planet can be picked: show a reticle on each
      const pulse = 0.55 + 0.45 * Math.abs(Math.sin(now / 160));
      g.lineStyle(4, 0xff5ad8, pulse);
      for (const p of this.pieces) {
        if (p.tier < 0) continue;
        const at = this.toScreen(p.x, p.y);
        const r = p.rv * s + 10;
        for (let k = 0; k < 4; k++) {
          const a = (k * Math.PI) / 2 + now / 900;
          g.beginPath();
          g.arc(at.x, at.y, r, a - 0.4, a + 0.4, false);
          g.strokePath();
        }
      }
    } else if (this.targeting === 'vortex') {
      // the area a vortex can be opened in
      g.lineStyle(3, 0xb48cff, 0.3 + 0.2 * Math.abs(Math.sin(now / 200)));
      g.strokeCircle(CX, CY, R_LIMIT + 10);
    }
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
    for (const side of [-1, 1]) {
      const a = this.aimAngle + side * 0.17;
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
      g.strokeCircle(at.x, at.y, first.rv * s + 8);
      if (blocked) dotColor = 0xff5d73;
    }

    let i = 0;
    for (let t = h.r * s + 16; t < reach * s && i < this.dots.length; t += 24) {
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
    const pr = h.r * h.pop * s + 13;
    g.lineStyle(7, 0xffffff, 0.14);
    g.strokeCircle(hp.x, hp.y, pr);
    g.lineStyle(7, powerColor(pw), 1);
    g.beginPath();
    g.arc(hp.x, hp.y, pr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pw, false);
    g.strokePath();
  }

  /** power 0 is a tap: the planet is let go almost at rest and falls in. */
  fire(power) {
    if (this.state !== 'aim' || !this.held) return;
    this.updateHeld(); // a tap may have just moved the aim; launch from where the planet now is
    const b = this.held;
    this.held = null;
    this.setPower(0);
    b.addBody();
    const dx = CX - b.x;
    const dy = CY - b.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = power > 0 ? MIN_SPEED + (MAX_SPEED - MIN_SPEED) * Math.pow(power, 1.2) : DROP_SPEED;
    this.matter.body.setVelocity(b.body, { x: (dx / d) * speed, y: (dy / d) * speed });
    b.body.frictionAir = FLIGHT_DRAG; // no drag in flight, so the power you pull is the power that lands
    b.flying = true;
    b.born = this.time.now;
    if (power > 0) b.impulse(Math.atan2(dy, dx), -0.1 - power * 0.25); // the released slingshot stretches it
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

  /** Shared start of a booster: false when it cannot be used now. With none left, an ad refills one. */
  async takeBooster(countKey, btn) {
    if (!this.canUseBooster()) return false;
    if (this[countKey] <= 0) {
      if (await this.rewarded()) this[countKey]++;
      btn.setCount(this[countKey]);
      return false;
    }
    return true;
  }

  spendBooster(countKey, btn) {
    this[countKey]--;
    btn.setCount(this[countKey]);
  }

  startTargeting(mode, btn, hint) {
    this.targeting = mode;
    this.targetingBtn = btn;
    this.aiming = false;
    this.setPower(0);
    btn.setActive(true);
    this.targetHint.setText(hint).setVisible(true);
    if (this.hint) this.hint.setVisible(false);
    Haptics.light();
  }

  cancelTargeting() {
    if (this.targetingBtn) this.targetingBtn.setActive(false);
    this.targeting = null;
    this.targetingBtn = null;
    this.targetHint.setVisible(false);
    if (this.hint) this.hint.setVisible(true);
  }

  pickTarget(p) {
    if (this.targeting === 'vortex') {
      // anywhere on the field
      if (Math.hypot(p.worldX - CX, p.worldY - CY) < R_LIMIT + 70) this.openVortex(this.toField(p.worldX, p.worldY));
      else this.cancelTargeting();
      return;
    }
    let best = null;
    let bestD = Infinity;
    for (const q of this.pieces) {
      if (q.tier < 0) continue;
      const at = this.toScreen(q.x, q.y);
      const d = Math.hypot(p.worldX - at.x, p.worldY - at.y) - q.rv * this.fieldScale;
      if (d < 16 && d < bestD) {
        best = q;
        bestD = d;
      }
    }
    if (best) this.fireLaser(best);
    else this.cancelTargeting();
  }

  // Orbital laser: tap a planet, and a satellite vaporizes every planet of that kind, one after another.

  async useLaser() {
    if (this.laserBusy) return;
    if (this.targeting === 'laser') {
      this.cancelTargeting();
      return;
    }
    if (!(await this.takeBooster('lasers', this.laserBtn))) return;
    if (!this.pieces.some((p) => p.tier >= 0)) {
      this.floatText(W / 2, HINT_Y, 'Nothing to aim at yet', '#ffffff');
      return;
    }
    if (this.targeting) this.cancelTargeting();
    this.startTargeting('laser', this.laserBtn, 'Tap a planet: every one of its kind is vaporized');
  }

  fireLaser(picked) {
    this.cancelTargeting();
    this.spendBooster('lasers', this.laserBtn);
    this.laserBusy = true;
    // every planet of the picked kind, starting with the picked one, then nearest next
    const rest = this.pieces.filter((p) => p.tier === picked.tier && p !== picked);
    const targets = [picked];
    while (rest.length) {
      const last = targets[targets.length - 1];
      let k = 0;
      for (let i = 1; i < rest.length; i++) if (Math.hypot(rest[i].x - last.x, rest[i].y - last.y) < Math.hypot(rest[k].x - last.x, rest[k].y - last.y)) k = i;
      targets.push(rest.splice(k, 1)[0]);
    }
    for (const t of targets) t.merging = true; // keep them out of merges while they are being destroyed
    const now = this.time.now;
    this.calmUntil = Math.max(this.calmUntil, now + 340 + LASER_CHARGE_MS + LASER_FIRST_MS + LASER_NEXT_MS * targets.length + 800);
    const at = this.toScreen(picked.x, picked.y);
    const sx = Phaser.Math.Clamp(at.x + (at.x < CX ? 90 : -90), 120, W - 120);
    const sat = this.add.image(sx, -80, 'satellite').setDepth(FX + 3).setScale(1.25 / TEX_SCALE);
    const lens = this.add.image(sx, -80, 'soft').setDepth(FX + 4).setTint(0xff4fd8).setBlendMode(Phaser.BlendModes.ADD).setScale(0.05);
    const beam = { sat, lens, targets, index: 0, last: at, start: 0, nextAt: 0 };
    beam.aimSat = () => {
      const target = beam.targets[beam.index];
      const t = target && target.body ? this.toScreen(target.x, target.y) : beam.last;
      beam.last = t;
      // the barrel points along the texture's +y; turn it toward the target
      sat.rotation = Math.atan2(t.y - sat.y, t.x - sat.x) - Math.PI / 2;
      const lx = sat.x - Math.sin(sat.rotation) * 19;
      const ly = sat.y + Math.cos(sat.rotation) * 19;
      lens.setPosition(lx, ly);
      return { lx, ly, t };
    };
    if (targets.length > 1) this.floatText(W / 2, 300, `${TIERS[picked.tier].name} ×${targets.length}`, '#ff9ae6', 30);
    Sfx.laserCharge();
    this.tweens.add({
      targets: sat,
      y: 236,
      duration: 340,
      ease: 'Back.out',
      onUpdate: beam.aimSat,
      onComplete: () => {
        this.tweens.add({ targets: lens, scale: 0.9 / TEX_SCALE, duration: LASER_CHARGE_MS, ease: 'Cubic.in' });
        for (let k = 0; k < 3; k++) this.time.delayedCall(k * 130, () => Haptics.light());
        this.time.delayedCall(LASER_CHARGE_MS, () => {
          beam.start = this.time.now;
          beam.nextAt = this.time.now + LASER_FIRST_MS;
          this.beam = beam;
          Sfx.laserFire();
          Haptics.heavy();
        });
      },
    });
  }

  /** Each frame of the beam: aim at the current target, heat it, and move on when it is gone. */
  drawBeam(now) {
    const b = this.beam;
    const g = this.beamGfx;
    g.clear();
    if (!b) return;
    while (b.index < b.targets.length && !b.targets[b.index].body) b.index++;
    if (now >= b.nextAt && b.index < b.targets.length) {
      this.vaporize(b.targets[b.index]);
      b.index++;
      b.nextAt = now + LASER_NEXT_MS;
      if (b.index < b.targets.length) Sfx.laserFire();
    }
    if (b.index >= b.targets.length) {
      this.beam = null;
      this.tweens.add({ targets: b.lens, scale: 0.01, alpha: 0, duration: 200, onComplete: () => b.lens.destroy() });
      this.tweens.add({
        targets: b.sat,
        y: -90,
        duration: 380,
        delay: 120,
        ease: 'Cubic.in',
        onComplete: () => {
          b.sat.destroy();
          this.laserBusy = false;
        },
      });
      return;
    }
    const { lx, ly, t } = b.aimSat();
    const target = b.targets[b.index];
    const span = b.index === 0 ? LASER_FIRST_MS : LASER_NEXT_MS;
    const k = 1 - Math.max(0, b.nextAt - now) / span;
    const flick = 0.85 + 0.15 * Math.sin(now / 18);
    for (const [w, color, alpha] of [[34, 0xff3bd2, 0.22], [18, 0xff6ae0, 0.5], [7, 0xffd6f6, 0.95]]) {
      g.lineStyle(w * flick, color, alpha);
      g.lineBetween(lx, ly, t.x, t.y);
    }
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(t.x, t.y, 10 + 8 * flick);
    // the target heats up and shudders
    target.tint = mix(0xffffff, 0xff8a6a, k);
    target.impulse(Math.random() * Math.PI, 0.025);
    if (Math.random() < 0.6) {
      const sp = this.add.image(t.x, t.y, 'spark').setDepth(FX + 2).setTint(Math.random() < 0.5 ? 0xffd6f6 : 0xffb36b).setScale((0.4 + Math.random() * 0.4) / TEX_SCALE).setBlendMode(Phaser.BlendModes.ADD);
      const a = Math.random() * Math.PI * 2;
      const dd = 40 + Math.random() * 60;
      this.tweens.add({ targets: sp, x: t.x + Math.cos(a) * dd, y: t.y + Math.sin(a) * dd, alpha: 0, duration: 380, onComplete: () => sp.destroy() });
    }
  }

  vaporize(target) {
    if (!target.body) return;
    const { x, y, tier } = target;
    const at = this.toScreen(x, y);
    const t = TIERS[tier];
    const rs = t.r * this.fieldScale;
    this.addScore((tier + 1) * 4 * this.universe);
    const n = 22 + tier * 3;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = rs * (0.8 + Math.random() * 2.2);
      const sp = this.add
        .image(at.x + Math.cos(a) * rs * 0.4, at.y + Math.sin(a) * rs * 0.4, i % 4 ? 'dot' : 'spark')
        .setDepth(FX)
        .setTint(i % 3 ? t.color : 0xffd6a0)
        .setScale((0.4 + Math.random() * 0.9) / TEX_SCALE);
      this.tweens.add({ targets: sp, x: at.x + Math.cos(a) * d, y: at.y + Math.sin(a) * d, alpha: 0, scale: 0.05, duration: 500 + Math.random() * 500, ease: 'Cubic.out', onComplete: () => sp.destroy() });
    }
    const flash = this.add.image(at.x, at.y, 'soft').setTint(0xffc2ef).setScale(rs / 40 / TEX_SCALE).setDepth(FX).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: flash, scale: rs / 9 / TEX_SCALE, alpha: 0, duration: 480, ease: 'Cubic.out', onComplete: () => flash.destroy() });
    this.removePiece(target);
    this.shockwave(x, y, t.r + 110, 3);
    this.cameras.main.shake(120, 0.003);
    Sfx.vaporize();
    Haptics.success();
  }

  // Fusion: every matching pair on the field lifts off, flies over everything else straight to
  // its partner, and merges. New pairs are looked for every few frames, so merges can chain.

  async useFusion() {
    if (this.fusionPairs) return;
    if (!(await this.takeBooster('fusions', this.fusionBtn))) return;
    if (!this.findPairs().length) {
      this.floatText(W / 2, HINT_Y, 'No matching pairs yet', '#ffffff');
      return;
    }
    if (this.targeting) this.cancelTargeting();
    this.spendBooster('fusions', this.fusionBtn);
    const now = this.time.now;
    this.fusionUntil = now + FUSION_MS;
    this.fusionPairs = [];
    this.armPairs(this.findPairs());
    this.nextPairAt = now + 250;
    this.calmUntil = Math.max(this.calmUntil, now + FUSION_MS + 1000);
    const ring = this.add.circle(CX, CY, 20).setStrokeStyle(8, 0x7fe3ff, 0.9).setDepth(FX);
    this.tweens.add({ targets: ring, radius: 520, alpha: 0, duration: 700, ease: 'Cubic.out', onComplete: () => ring.destroy() });
    Sfx.fusion();
    Haptics.medium();
  }

  /** Closest pairs of the same kind, greedily, among planets not already flying to a partner. */
  findPairs() {
    const byTier = new Map();
    for (const p of this.pieces) {
      if (p.tier < 0 || p.merging || p.fusing) continue;
      if (!byTier.has(p.tier)) byTier.set(p.tier, []);
      byTier.get(p.tier).push(p);
    }
    const pairs = [];
    for (const list of byTier.values()) {
      while (list.length >= 2) {
        let bi = 0;
        let bj = 1;
        let bd = Infinity;
        for (let i = 0; i < list.length; i++) {
          for (let j = i + 1; j < list.length; j++) {
            const d = Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y);
            if (d < bd) {
              bd = d;
              bi = i;
              bj = j;
            }
          }
        }
        pairs.push([list[bi], list[bj]]);
        list.splice(bj, 1);
        list.splice(bi, 1);
      }
    }
    return pairs;
  }

  /**
   * A fusing planet passes over everything except its partner: each pair gets its own collision
   * group, which always collides within itself, and collides with nothing else.
   */
  setFusing(p, partner, group = 0) {
    p.fusing = !!partner;
    p.fusePartner = partner;
    p.popTarget = partner ? 1.12 : 1; // a little bigger while lifted
    if (p.body) {
      const f = p.body.collisionFilter;
      f.group = partner ? group : 0;
      f.category = partner ? 0x0004 : 0x0001;
      f.mask = partner ? 0 : 0xffffffff;
    }
  }

  armPairs(pairs) {
    for (const [a, b] of pairs) {
      this.pairGroup = (this.pairGroup || 0) + 1;
      this.setFusing(a, b, this.pairGroup);
      this.setFusing(b, a, this.pairGroup);
      this.fusionPairs.push([a, b]);
    }
  }

  endFusion() {
    if (!this.fusionPairs) return;
    for (const [a, b] of this.fusionPairs) {
      if (a.fusing) this.setFusing(a, null);
      if (b.fusing) this.setFusing(b, null);
    }
    this.fusionPairs = null;
  }

  stepFusion(now) {
    if (!this.fusionPairs) return;
    if (now >= this.fusionUntil) {
      this.endFusion();
      return;
    }
    // drop pairs that are done (merged or gone), then look for new ones
    this.fusionPairs = this.fusionPairs.filter(([a, b]) => {
      const alive = a.body && b.body;
      if (!alive) {
        if (a.body && a.fusing) this.setFusing(a, null);
        if (b.body && b.fusing) this.setFusing(b, null);
      }
      return alive;
    });
    if (now >= this.nextPairAt) {
      this.armPairs(this.findPairs());
      this.nextPairAt = now + 250;
    }
    for (const [a, b] of this.fusionPairs) {
      if (a.merging || b.merging) continue;
      // both fly to the point between them, quickly but smoothly
      const mx = (a.body.position.x + b.body.position.x) / 2;
      const my = (a.body.position.y + b.body.position.y) / 2;
      for (const p of [a, b]) {
        const dx = mx - p.body.position.x;
        const dy = my - p.body.position.y;
        const d = Math.hypot(dx, dy) || 1;
        const v = Math.min(16, 2 + d * 0.14);
        this.matter.body.setVelocity(p.body, { x: (dx / d) * v, y: (dy / d) * v });
      }
    }
  }

  drawFusion(now) {
    const g = this.fusionGfx;
    g.clear();
    if (!this.fusionPairs) return;
    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(now / 90));
    for (const [a, b] of this.fusionPairs) {
      if (!a.body || !b.body) continue;
      const pa = this.toScreen(a.x, a.y);
      const pb = this.toScreen(b.x, b.y);
      g.lineStyle(10, 0x5fd8ff, 0.18 * pulse);
      g.lineBetween(pa.x, pa.y, pb.x, pb.y);
      g.lineStyle(3, 0xe6fbff, 0.8 * pulse);
      g.lineBetween(pa.x, pa.y, pb.x, pb.y);
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle((pa.x + pb.x) / 2, (pa.y + pb.y) / 2, 5 + 3 * pulse);
    }
  }

  // Vortex: tap a spot and a small black hole opens there for a few seconds. It drags everything
  // nearby into a spin and swallows the planets up to Earth size; bigger ones just get pulled about.

  async useVortex() {
    if (this.vortex) return;
    if (this.targeting === 'vortex') {
      this.cancelTargeting();
      return;
    }
    if (!(await this.takeBooster('vortexes', this.vortexBtn))) return;
    if (this.targeting) this.cancelTargeting();
    this.startTargeting('vortex', this.vortexBtn, 'Tap where to open a vortex');
  }

  openVortex(at) {
    this.cancelTargeting();
    this.spendBooster('vortexes', this.vortexBtn);
    const now = this.time.now;
    this.vortex = { x: at.x, y: at.y, born: now, until: now + VORTEX_MS, swallowed: 0 };
    this.calmUntil = Math.max(this.calmUntil, now + VORTEX_MS + 1000);
    Sfx.vortexOpen();
    Haptics.heavy();
  }

  stepVortex(now) {
    const v = this.vortex;
    if (!v) return;
    if (now >= v.until) {
      this.closeVortex();
      return;
    }
    const grow = Math.min(1, (now - v.born) / 400); // it opens up over a moment
    for (const p of [...this.pieces]) {
      const b = p.body;
      const dx = v.x - b.position.x;
      const dy = v.y - b.position.y;
      const d = Math.hypot(dx, dy) || 1;
      const range = VORTEX_RANGE + p.r;
      if (d > range) continue;
      const k = 1 - d / range;
      const pull = (0.3 + 1.2 * k * k) * grow; // px per step^2
      const spin = 0.7 * k * grow;
      const ax = (dx / d) * pull - (dy / d) * spin;
      const ay = (dy / d) * pull + (dx / d) * spin;
      b.force.x += (b.mass * ax) / STEP2;
      b.force.y += (b.mass * ay) / STEP2;
      if (p.tier >= 0 && p.tier <= VORTEX_MAX_TIER && !p.merging && d < VORTEX_R * grow + p.r * 0.55) this.swallowIntoVortex(p);
    }
  }

  swallowIntoVortex(p) {
    const v = this.vortex;
    const i = this.pieces.indexOf(p);
    if (i >= 0) this.pieces.splice(i, 1);
    p.removeBody();
    p.popTarget = 0;
    p.sinkTo = v;
    this.dying.push(p);
    v.swallowed++;
    this.addScore((p.tier + 1) * 5 * this.universe);
    Sfx.swallow(v.swallowed);
    Haptics.light();
  }

  closeVortex() {
    const v = this.vortex;
    this.vortex = null;
    const at = this.toScreen(v.x, v.y);
    const flash = this.add.image(at.x, at.y, 'soft').setTint(0xd2b8ff).setBlendMode(Phaser.BlendModes.ADD).setScale(0.6 / TEX_SCALE).setDepth(FX);
    this.tweens.add({ targets: flash, scale: 4 / TEX_SCALE, alpha: 0, duration: 420, ease: 'Cubic.out', onComplete: () => flash.destroy() });
    this.shockwave(v.x, v.y, 150, 2.5);
    if (v.swallowed) this.floatText(at.x, at.y - 40, `${v.swallowed} swallowed`, '#d9c8ff', 28);
    Sfx.vortexClose();
    Haptics.medium();
  }

  drawVortex(now) {
    const g = this.vortexGfx;
    g.clear();
    const v = this.vortex;
    if (!v) return;
    const s = this.fieldScale;
    const at = this.toScreen(v.x, v.y);
    const grow = Math.min(1, (now - v.born) / 400);
    const fade = Math.min(1, (v.until - now) / 300);
    const R = VORTEX_R * s * grow * fade;
    // the pull's reach, faintly
    g.lineStyle(2, 0xb48cff, 0.18 * grow * fade);
    g.strokeCircle(at.x, at.y, (VORTEX_RANGE * s) * (0.9 + 0.1 * Math.sin(now / 150)));
    // swirling arms
    for (let arm = 0; arm < 4; arm++) {
      const base = now / 260 + (arm * Math.PI) / 2;
      for (let k = 0; k < 14; k++) {
        const t = k / 14;
        const a = base + t * 3.2;
        const rr = R * (1.2 + t * 2.8);
        g.fillStyle(arm % 2 ? 0xc79bff : 0x7f9bff, (1 - t) * 0.7 * grow * fade);
        g.fillCircle(at.x + Math.cos(a) * rr, at.y + Math.sin(a) * rr, (3.2 - t * 2) * s + 1);
      }
    }
    // the dark core with a bright rim
    g.fillStyle(0x07040f, 1);
    g.fillCircle(at.x, at.y, R);
    g.lineStyle(4, 0xe8dcff, 0.9 * fade);
    g.strokeCircle(at.x, at.y, R + 1);
  }

  // Dark matter: a dense black ball crashes in like a break shot in billiards. Everything flies
  // apart, bounces off each other and off the screen edges, then gravity gathers the planets
  // back together in a new, random arrangement.

  async useWrecker() {
    if (this.wrecker || this.wreckerIncoming) return;
    if (!(await this.takeBooster('wreckers', this.wreckerBtn))) return;
    if (!this.pieces.some((p) => p.tier >= 0)) {
      this.floatText(W / 2, HINT_Y, 'Nothing to smash yet', '#ffffff');
      return;
    }
    if (this.targeting) this.cancelTargeting();
    this.spendBooster('wreckers', this.wreckerBtn);
    this.wreckerIncoming = true;

    // aim at the middle of the cluster, from a random side, slightly off-centre
    let mx = 0;
    let my = 0;
    let mm = 0;
    for (const p of this.pieces) {
      mx += p.x * p.r * p.r;
      my += p.y * p.r * p.r;
      mm += p.r * p.r;
    }
    const tx = mm ? mx / mm : CX;
    const ty = mm ? my / mm : CY;
    const ang = Math.random() * Math.PI * 2;
    const off = (Math.random() - 0.5) * 50;
    const far = 1000 / this.fieldScale; // always starts off screen
    const sx = tx + Math.cos(ang) * far - Math.sin(ang) * off;
    const sy = ty + Math.sin(ang) * far + Math.cos(ang) * off;

    // warn where it will come from
    const from = this.toScreen(sx, sy);
    const dx = from.x - CX;
    const dy = from.y - CY;
    const k = Math.min((W / 2 - 50) / Math.max(1, Math.abs(dx)), (H / 2 - 230) / Math.max(1, Math.abs(dy)));
    const wx = CX + dx * k;
    const wy = CY + dy * k;
    const warn = this.add.image(wx, wy, 'chevron').setDepth(FX + 3).setScale(1.2 / TEX_SCALE).setRotation(Math.atan2(-dy, -dx));
    const glowW = this.add.image(wx, wy, 'soft').setDepth(FX + 2).setTint(0x8f7bff).setBlendMode(Phaser.BlendModes.ADD).setScale(1.8 / TEX_SCALE);
    this.tweens.add({ targets: [warn, glowW], alpha: 0.2, duration: 140, yoyo: true, repeat: 3 });
    Sfx.darkWarn();
    Haptics.medium();
    this.time.delayedCall(260, () => Haptics.medium());
    this.time.delayedCall(520, () => Haptics.medium());
    this.time.delayedCall(820, () => {
      warn.destroy();
      glowW.destroy();
      this.wreckerIncoming = false;
      const r = new Planet(this, 'wrecker', sx, sy);
      const dl = Math.hypot(tx - sx, ty - sy) || 1;
      r.vx = ((tx - sx) / dl) * WRECKER_SPEED;
      r.vy = ((ty - sy) / dl) * WRECKER_SPEED;
      r.tailAngle = Math.atan2(r.vy, r.vx);
      r.pop = 1;
      r.hits = new Set();
      r.impacted = false;
      this.wrecker = r;
      Sfx.darkApproach();
    });
  }

  /** The break shot: every planet is sent flying away from the point of impact. */
  breakShot(x, y, fx, fy, now) {
    for (const p of this.pieces) {
      const b = p.body;
      let dx = b.position.x - x;
      let dy = b.position.y - y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      const near = Math.max(0.5, 1 - d / 650); // close planets fly hardest, but everything moves
      const speed = (8 + Math.random() * 6) * near;
      const spin = (Math.random() - 0.5) * 7; // a random sideways kick, so every scatter is different
      this.matter.body.setVelocity(b, { x: dx * speed - dy * spin + fx * 4, y: dy * speed + dx * spin + fy * 4 });
      p.squash(Math.atan2(dy, dx), MAX_SQUASH * near);
      p.born = now;
      p.flying = false;
    }
    this.scatterUntil = now + 1200; // free flight: little drag, bouncy collisions
    this.gravBoostUntil = now + 4200; // then gravity pulls everything back a little harder
    this.calmUntil = Math.max(this.calmUntil, now + 6000); // no game over while the field is in pieces
  }

  /** One physics step of the dark matter ball: it moves straight on and bats aside whatever it touches. */
  stepWrecker(now) {
    const r = this.wrecker;
    r.x += r.vx;
    r.y += r.vy;
    const speed = Math.hypot(r.vx, r.vy);
    const fx = r.vx / speed;
    const fy = r.vy / speed;
    const lx = -fy;
    const ly = fx;
    for (const p of this.pieces) {
      const b = p.body;
      const dx = b.position.x - r.x;
      const dy = b.position.y - r.y;
      const sum = r.r + p.r;
      if (dx > sum || dx < -sum || dy > sum || dy < -sum) continue;
      const d = Math.hypot(dx, dy) || 1;
      const overlap = sum - d;
      if (overlap <= 0) continue;
      if (!r.impacted) {
        r.impacted = true;
        this.breakShot(r.x + fx * r.r, r.y + fy * r.r, fx, fy, now);
        this.impactFx(r.x + (dx / d) * r.r, r.y + (dy / d) * r.r);
      }
      // whatever is in the way is knocked off to the side, never carried along
      let side = dx * lx + dy * ly;
      if (Math.abs(side) < 3) side = p.id % 2 ? 1 : -1;
      const sg = Math.sign(side);
      let vf = b.velocity.x * fx + b.velocity.y * fy;
      let vl = b.velocity.x * lx + b.velocity.y * ly;
      if (dx * fx + dy * fy > 0) vf = Math.max(vf, speed * 0.85);
      vl = sg * Math.max(vl * sg, 7 + overlap * 0.4);
      this.matter.body.setVelocity(b, { x: fx * vf + lx * vl, y: fy * vf + ly * vl });
      if (!r.hits.has(p.id)) {
        r.hits.add(p.id);
        p.squash(Math.atan2(dy, dx), MAX_SQUASH);
        if (r.hits.size % 2 === 1) {
          Sfx.land(16, p.r);
          Haptics.medium();
        }
      }
    }
    // gone once it is well past the field and moving away
    const ex = r.x - CX;
    const ey = r.y - CY;
    const gone = 1150 / this.fieldScale;
    if (ex * ex + ey * ey > gone * gone && ex * r.vx + ey * r.vy > 0) {
      r.destroy();
      this.wrecker = null;
    }
  }

  /** The moment of impact: shock rings, a flash and flying shards instead of a big screen shake, so nothing is hidden. */
  impactFx(x, y) {
    const at = this.toScreen(x, y);
    [
      [0, 0xffffff, 560, 8],
      [70, 0x9a88ff, 720, 6],
    ].forEach(([delay, color, to, w]) => {
      const ring = this.add.circle(at.x, at.y, 30).setStrokeStyle(w, color, 0.9).setDepth(FX);
      this.tweens.add({ targets: ring, radius: to, alpha: 0, delay, duration: 560, ease: 'Cubic.out', onComplete: () => ring.destroy() });
    });
    const flash = this.add.image(at.x, at.y, 'soft').setTint(0xddd2ff).setBlendMode(Phaser.BlendModes.ADD).setScale(1 / TEX_SCALE).setDepth(FX);
    this.tweens.add({ targets: flash, scale: 6 / TEX_SCALE, alpha: 0, duration: 380, ease: 'Cubic.out', onComplete: () => flash.destroy() });
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 90 + Math.random() * 220;
      const shard = this.add
        .image(at.x, at.y, i % 3 ? 'dot' : 'spark')
        .setDepth(FX)
        .setTint(i % 2 ? 0xb7a8ff : 0x2a2340)
        .setScale((0.4 + Math.random() * 0.7) / TEX_SCALE)
        .setRotation(Math.random() * 6);
      if (i % 2) shard.setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: shard, x: at.x + Math.cos(a) * d, y: at.y + Math.sin(a) * d, alpha: 0, angle: 200, duration: 600 + Math.random() * 400, ease: 'Cubic.out', onComplete: () => shard.destroy() });
    }
    this.cameras.main.shake(140, 0.0035); // just a nudge
    Sfx.darkImpact();
    Haptics.success();
  }

  emitDarkDust() {
    const r = this.wrecker;
    if (!r) return;
    const at = this.toScreen(r.x, r.y);
    const back = r.tailAngle + this.worldRot + Math.PI;
    for (let i = 0; i < 2; i++) {
      const a = back + (Math.random() - 0.5) * 1.4;
      const d = r.r * this.fieldScale * (0.7 + Math.random() * 0.4);
      const e = this.add
        .image(at.x + Math.cos(a) * d, at.y + Math.sin(a) * d, i ? 'dot' : 'spark')
        .setDepth(19)
        .setTint(i ? 0x1c1630 : 0xa898ff)
        .setScale((0.4 + Math.random() * 0.6) / TEX_SCALE);
      if (!i) e.setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: e,
        x: e.x + Math.cos(back) * (40 + Math.random() * 60),
        y: e.y + Math.sin(back) * (40 + Math.random() * 60),
        alpha: 0,
        scale: 0.05,
        duration: 450 + Math.random() * 300,
        onComplete: () => e.destroy(),
      });
    }
  }

  // ---------- physics ----------

  /** One fixed step: gravity toward the well, springy skins between planets, then the hard cores. */
  physicsStep(now) {
    const list = this.pieces;
    const crunch = this.state === 'crunch';
    const scattering = now < this.scatterUntil;
    const g = GRAVITY * (crunch ? 2.6 : scattering ? 0.7 : now < this.gravBoostUntil ? 2 : 1);
    const swirl = crunch ? 0.45 : 0;
    const damping = scattering ? BOUNCY_DAMPING : SKIN_DAMPING;
    const restitution = scattering ? BOUNCY_RESTITUTION : 0.12;
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
      const drag = p.flying ? FLIGHT_DRAG : scattering ? SCATTER_DRAG : DRAG;
      if (b.frictionAir !== drag) b.frictionAir = drag;
      if (b.restitution !== restitution) b.restitution = restitution;
    }
    this.maxTier = maxTier;

    // the screen edges are walls: a planet flung out bounces back instead of leaving the screen
    const s = this.fieldScale;
    const cr = Math.cos(this.worldRot);
    const sr = Math.sin(this.worldRot);
    for (const p of list) {
      const b = p.body;
      const dx = (b.position.x - CX) * s;
      const dy = (b.position.y - CY) * s;
      const sx = CX + dx * cr - dy * sr;
      const sy = CY + dx * sr + dy * cr;
      const pr = p.r * s;
      const walls = [];
      if (sx < WALL_SIDE + pr) walls.push(1, 0, WALL_SIDE + pr - sx);
      else if (sx > W - WALL_SIDE - pr) walls.push(-1, 0, sx - (W - WALL_SIDE - pr));
      if (sy < WALL_TOP + pr) walls.push(0, 1, WALL_TOP + pr - sy);
      else if (sy > WALL_BOTTOM - pr) walls.push(0, -1, sy - (WALL_BOTTOM - pr));
      for (let w = 0; w < walls.length; w += 3) {
        // the wall's inward normal, turned from screen into field coordinates
        const fx = walls[w] * cr + walls[w + 1] * sr;
        const fy = -walls[w] * sr + walls[w + 1] * cr;
        const vn = b.velocity.x * fx + b.velocity.y * fy;
        if (vn < 0) {
          this.matter.body.setVelocity(b, { x: b.velocity.x - 1.6 * vn * fx, y: b.velocity.y - 1.6 * vn * fy });
          if (-vn > 2) p.squash(Math.atan2(fy, fx), Math.min(MAX_SQUASH, -vn * IMPACT_SQUASH * 2));
        }
        const depth = walls[w + 2] / s;
        this.matter.body.setPosition(b, { x: b.position.x + fx * depth, y: b.position.y + fy * depth });
      }
    }

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

    if (this.wrecker) this.stepWrecker(now);
    this.stepFusion(now);
    this.stepVortex(now); // may swallow planets, so the count is taken only after this

    const n = list.length;
    const previous = this.contacts;
    const contacts = new Set();
    for (let i = 0; i < n; i++) {
      const A = list[i];
      const a = A.body;
      for (let j = i + 1; j < n; j++) {
        const B = list[j];
        if ((A.fusing || B.fusing) && A.fusePartner !== B) continue; // a fusing planet flies over the others
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
        let force = reduced * (SKIN_SPRING * overlap * (1 + 1.5 * depth * depth) - damping * vn);
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
    Sfx.land(closing, p.r);
    if (closing > 18) Haptics.heavy();
    else if (closing > 9) Haptics.medium();
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
    }
  }

  removePiece(p) {
    const i = this.pieces.indexOf(p);
    if (i >= 0) this.pieces.splice(i, 1);
    p.destroy();
  }

  discover(tier) {
    if (tier > this.biggest) this.biggest = tier;
    if (tier < HOLE && tier > this.universeMax) this.universeMax = tier;
    if (this.seen.includes(tier)) return false;
    this.seen.push(tier);
    store.set('jd3_seen', this.seen);
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
      Sfx.cometHit();
      Haptics.heavy();
    }
  }

  addEnergy(n) {
    if (this.cometPending) return;
    this.energy += n;
    if (this.energy >= this.cometCost()) {
      this.cometPending = true;
      Sfx.cometReady();
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
    if (this.targeting) this.cancelTargeting();
    this.endFusion();
    if (this.vortex) this.closeVortex();
    this.gravX = x;
    this.gravY = y;
    this.tweens.add({ targets: this.coreParts, alpha: 0.15, duration: 400 });
    if (!this.discover(HOLE)) this.banner('BLACK HOLE!', 'Everything falls in…', '#ffb347');
    this.cameras.main.shake(300, 0.005);
    Sfx.blackHole();
    Haptics.success();
  }

  swallow(p) {
    const i = this.pieces.indexOf(p);
    if (i >= 0) this.pieces.splice(i, 1);
    p.removeBody();
    p.popTarget = 0;
    p.sinkTo = this.hole;
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
    this.universeMax = 0; // a new, small universe: the view comes back in
    this.tweens.add({ targets: this.coreParts, alpha: 1, duration: 600 });
    this.universe++;
    this.addScore(1000 * (this.universe - 1));
    this.universeText.setText(`UNIVERSE ${this.universe}  ·  SCORE ×${this.universe}`);
    const flash = this.add.image(at.x, at.y, 'soft').setScale(1 / TEX_SCALE).setDepth(FX).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: flash, scale: 16 / TEX_SCALE, alpha: 0, duration: 700, ease: 'Cubic.out', onComplete: () => flash.destroy() });
    this.banner(`UNIVERSE ${this.universe}`, `All scores ×${this.universe}`, '#7fe3ff');
    this.cameras.main.flash(300, 255, 255, 255);
    Sfx.universe();
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
    const rs = t.r * this.fieldScale;
    const ring = this.add.circle(x, y, rs, 0xffffff, 0).setStrokeStyle(6, 0xffffff, 0.9).setDepth(FX);
    this.tweens.add({ targets: ring, scale: 1.8, alpha: 0, duration: 320, ease: 'Cubic.out', onComplete: () => ring.destroy() });
    const n = 7 + tier;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const d = this.add
        .image(x, y, i % 3 ? 'dot' : 'spark')
        .setTint(i % 2 ? t.color : 0xffffff)
        .setScale((0.5 + Math.random() * 0.7) / TEX_SCALE)
        .setDepth(FX);
      const dist = rs + 30 + Math.random() * 60;
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
    if (tier >= 6) this.cameras.main.shake(100, 0.0015 + tier * 0.0002);
  }

  /** A card that drops in under the top bar, so it never hides the centre of the field. */
  /** Banners queue up, so two discoveries in one combo are shown one after the other. */
  banner(title, subtitle, color, kind = null) {
    this.bannerQueue.push([title, subtitle, color, kind]);
    if (!this.bannerBusy) this.nextBanner();
  }

  nextBanner() {
    const next = this.bannerQueue.shift();
    this.bannerBusy = !!next;
    if (!next) return;
    const [title, subtitle, color, kind] = next;
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
    // it stays about two seconds, or makes way sooner when another one is waiting
    const shownAt = this.time.now;
    const check = this.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        const age = this.time.now - shownAt;
        if (age < 1900 && !(age >= 1000 && this.bannerQueue.length)) return;
        check.remove();
        this.tweens.add({ targets: c, alpha: 0, y: y - 40, duration: 260, onComplete: () => {
          c.destroy();
          this.nextBanner();
        } });
      },
    });
  }

  showDiscovery(tier) {
    Sfx.discover(tier);
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
    let rate = 0;
    if (crunch || this.state === 'aim' || this.state === 'flying') {
      this.worldRot += ((WORLD_SPIN * Math.min(delta, 50)) / 1000) * (crunch ? 5 : 1);
      // time slows right down while a target is being picked, and briefly on big merges
      rate = this.targeting ? 0.15 : now < this.slowUntil ? 0.3 : 1;
      this.acc += Math.min(delta, 50) * rate;
      let steps = 0;
      while (this.acc >= STEP && steps < 3) {
        this.physicsStep(now);
        this.acc -= STEP;
        steps++;
      }
      if (steps === 3) this.acc = 0;
      this.processQueues();
      if (this.state === 'crunch') this.updateCrunch(now);
      else {
        // the countdown runs on game time, so it slows down with everything else
        this.checkPieces(now, Math.min(delta, 50) * rate);
        if (this.state === 'flying' && now >= this.nextHeldAt) this.prepareHeld();
      }
      if (this.wrecker && steps > 0) this.emitDarkDust();
    }
    // the view pulls back smoothly as bigger bodies appear
    const target = FIELD_SCALE(this.universeMax);
    if (Math.abs(target - this.fieldScale) > 0.0005) this.fieldScale += (target - this.fieldScale) * Math.min(1, Math.min(delta, 50) / 600);
    for (const layer of [this.backLayer, this.batch, this.frontLayer]) layer.setScale(this.fieldScale).setRotation(this.worldRot);
    this.ringLayer.rotation = this.worldRot;
    this.updateHeld();
    this.renderPlanets(delta, now);
    this.drawAim(now);
    this.drawFusion(now);
    this.drawVortex(now);
    this.drawDanger(now);
    this.drawBeam(now);
  }

  /**
   * The lose rule: a planet resting clearly outside the ring for 5 seconds ends the game.
   * Only resting counts: while a planet is moving its countdown waits. Each planet counts down
   * on its own, with a ring, a number, a beep and a buzz every second, and the count winds
   * back down when it gets back inside.
   */
  checkPieces(now, dt) {
    let worst = null;
    const calm = now < this.calmUntil;
    const limit = this.limitRadius();
    const margin = DANGER_MARGIN / this.fieldScale;
    for (const p of [...this.pieces]) {
      const age = now - p.born;
      if (p.flying && age > 1800) this.land(p, 0);
      if (p.tier < 0) {
        // a comet that never found a target fizzles out
        if (age > 5000 && !p.used) {
          this.mergeFx(p.x, p.y, 0, 0);
          this.removePiece(p);
        }
        continue;
      }
      const v = p.body.velocity;
      if (Math.hypot(v.x, v.y) < REST_SPEED) p.restMs = (p.restMs || 0) + dt;
      else p.restMs = 0;
      const over = Math.hypot(p.x - CX, p.y - CY) + p.r - limit;
      if (calm || age < SETTLE_MS) p.dangerMs = 0;
      else if (over > margin) {
        if (p.restMs >= REST_MS) p.dangerMs += dt; // resting outside: count down; moving: wait
      } else if (over <= 0) p.dangerMs = Math.max(0, p.dangerMs - dt * 2);
      if (p.dangerMs > 0) {
        const left = Math.max(1, Math.ceil((DANGER_LIMIT_MS - p.dangerMs) / 1000));
        if (p.dangerSec === undefined || left < p.dangerSec) {
          Sfx.danger(left);
          if (left <= 1) Haptics.heavy();
          else Haptics.medium();
          if (p.dangerSec === undefined && !store.get('jd2_danger_tip2', false)) {
            store.set('jd2_danger_tip2', true);
            this.banner('KEEP PLANETS INSIDE', '5 s resting outside the ring ends the game', '#ff8fa3');
          }
        }
        p.dangerSec = left;
      } else {
        p.dangerSec = undefined;
      }
      if (p.dangerMs > 0 && (!worst || p.dangerMs > worst.dangerMs)) worst = p;
    }
    const danger = !!worst;
    if (danger !== (this.limitColor === 0xff5d73)) this.drawLimitRing(danger ? 0xff5d73 : 0xc9bcff);
    this.limitRing.setAlpha(danger ? 0.6 + 0.4 * Math.abs(Math.sin(now / 110)) : 0.55);
    this.worstDanger = worst;
    if (worst && worst.dangerMs > DANGER_LIMIT_MS) this.gameOver(worst);
  }

  /** A shrinking red ring and a number on each planet that is about to end the game. */
  drawDanger(now) {
    const g = this.dangerGfx;
    g.clear();
    const s = this.fieldScale;
    const list = this.state === 'over' ? (this.culprit ? [this.culprit] : []) : this.pieces.filter((p) => p.dangerMs > 0);
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(now / 120));
    for (const p of list) {
      const at = this.toScreen(p.x, p.y);
      const r = p.rv * s + 10;
      const left = this.state === 'over' ? 0 : 1 - Math.min(1, p.dangerMs / DANGER_LIMIT_MS);
      g.lineStyle(10, 0xff4d6d, 0.25 * pulse);
      g.strokeCircle(at.x, at.y, r + 4);
      g.lineStyle(6, 0xff4d6d, this.state === 'over' ? pulse : 0.95);
      if (left > 0) {
        g.beginPath();
        g.arc(at.x, at.y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left, false);
        g.strokePath();
      } else {
        g.strokeCircle(at.x, at.y, r);
      }
    }
    const w = this.state === 'over' ? null : this.worstDanger;
    if (w && w.body) {
      const at = this.toScreen(w.x, w.y);
      this.dangerLabel.setVisible(true).setPosition(at.x, at.y).setText(String(w.dangerSec ?? 5)).setScale(0.9 + 0.15 * pulse);
    } else {
      this.dangerLabel.setVisible(false);
    }
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
        if ((a.fusing || b.fusing) && a.fusePartner !== b) continue;
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
    // planets pressed by the dark matter ball flatten against it
    const r = this.wrecker;
    if (r) {
      for (const p of list) {
        const dx = p.x - r.x;
        const dy = p.y - r.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < p.rv + r.rv) p.planes.push(-dx / d, -dy / d, d - r.rv * 0.97);
      }
    }
    const draw = this.batch.planets;
    draw.length = 0;
    for (const p of list) {
      p.update(delta, now);
      if (!p.fusing) draw.push(p);
    }
    for (const p of list) if (p.fusing) draw.push(p); // lifted planets pass over the rest
    if (this.hole) {
      this.hole.update(delta, now);
      draw.push(this.hole);
    }
    if (r) {
      r.planes.length = 0;
      r.update(delta, now);
      draw.push(r);
    }
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const p = this.dying[i];
      const sink = p.sinkTo;
      if (sink) {
        p.x += (sink.x - p.x) * 0.2;
        p.y += (sink.y - p.y) * 0.2;
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

  /** culprit: the planet that stayed outside the ring. It is pointed out before the results appear. */
  gameOver(culprit = null) {
    this.state = 'over';
    this.culprit = culprit;
    this.aiming = false;
    this.setPower(0);
    if (this.targeting) this.cancelTargeting();
    Sfx.gameOver();
    Haptics.heavy();
    if (culprit) {
      const at = this.toScreen(culprit.x, culprit.y);
      this.floatText(Phaser.Math.Clamp(at.x, 170, W - 170), at.y - culprit.rv * this.fieldScale - 24, 'Outside the ring!', '#ff8fa3', 30);
      this.time.delayedCall(1200, () => this.showGameOver());
    } else {
      this.showGameOver();
    }
  }

  button(x, y, w, h, label, color, onClick, fontSize = 30) {
    const bg = this.add.graphics();
    bg.fillStyle(shade(color, 0.7), 1);
    bg.fillRoundedRect(-w / 2, -h / 2 + 6, w, h, 20);
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 20);
    const text = this.add.text(0, 0, label, { fontFamily: FONT, fontSize, color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setResolution(TEX_SCALE);
    const c = this.add.container(x, y, [bg, text]).setDepth(OVERLAY);
    c.setSize(w, h);
    this.tappable(
      c,
      () => {
        Sfx.click();
        onClick(c, text);
      },
      0.96,
    );
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
    if (this.culprit) add(this.text(W / 2, 506, `A ${TIERS[this.culprit.tier].name} stayed outside the ring`, 20, '#ff9fb2').setOrigin(0.5));

    if (!hasKindTextures(this, this.biggest)) makeKindTextures(this, this.biggest);
    add(this.portrait(W / 2 - 150, 570, this.biggest, 38));
    add(this.text(W / 2 - 80, 536, 'BIGGEST', 18, '#b9a8e6'));
    add(this.text(W / 2 - 80, 558, TIERS[this.biggest].name, 32));
    add(this.text(W / 2 - 80, 598, `${this.seen.length} discovered`, 18, '#b9a8e6'));

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
    this.culprit = null;
    const keep = this.limitRadius() * 0.62;
    for (const p of [...this.pieces]) {
      if (Math.hypot(p.x - CX, p.y - CY) + p.r > keep) {
        this.mergeFx(p.x, p.y, Math.max(0, p.tier), 0);
        this.removePiece(p);
      } else {
        p.dangerMs = 0;
        p.dangerSec = undefined;
      }
    }
    this.calmUntil = this.time.now + 1500;
    this.mergeQueue.length = 0;
    this.cometQueue.length = 0;
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
    const found = this.found();
    for (const kind of found) if (!hasKindTextures(this, kind)) makeKindTextures(this, kind);
    this.refreshStrip();
    // the panel grows with what you have found; anything not yet found is not shown at all
    const more = found.length < TIERS.length;
    const cards = found.length + (more ? 1 : 0);
    const cols = 4;
    const rows = Math.ceil(cards / cols);
    const cellW = 150;
    const cellH = 158;
    const h = 266 + rows * cellH;
    const top = Math.round(H / 2 - 40 - h / 2);
    const items = this.panel(50, top, W - 100, h);
    const add = (o) => {
      items.push(o.setDepth(OVERLAY));
      return o;
    };
    add(this.text(W / 2, top + 58, 'STAR ALBUM', 44).setOrigin(0.5));
    add(this.text(W / 2, top + 106, `${found.length} discovered`, 22, '#b9a8e6').setOrigin(0.5));
    const cardAt = (i) => {
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, cards - row * cols);
      return { x: W / 2 + (i % cols - (inRow - 1) / 2) * cellW, y: top + 200 + row * cellH };
    };
    found.forEach((tier, i) => {
      const { x, y } = cardAt(i);
      add(this.portrait(x, y, tier, 34));
      add(this.text(x, y + 58, TIERS[tier].name, 20).setOrigin(0.5));
    });
    if (more) {
      // one mystery card: it says there is more, but not what, or how much
      const { x, y } = cardAt(found.length);
      const g = add(this.add.graphics());
      g.fillStyle(0x140a33, 1);
      g.fillCircle(x, y, 34);
      g.lineStyle(3, 0xc9b8ff, 0.5);
      g.strokeCircle(x, y, 34);
      const q = add(this.text(x, y, '?', 40, '#c9b8ff').setOrigin(0.5));
      this.tweens.add({ targets: q, alpha: 0.4, duration: 900, yoyo: true, repeat: -1 });
      add(this.text(x, y + 58, 'Keep merging', 18, '#8f7fc2').setOrigin(0.5));
    }
    const close = this.button(W / 2, top + h - 66, 300, 76, 'CLOSE', 0x4c6ef5, () => {
      items.forEach((o) => o.destroy());
      // time spent in the album does not count against cooldowns, boosters or danger timers
      const pausedFor = this.time.now - pausedAt;
      this.nextHeldAt += pausedFor;
      this.lastMergeAt += pausedFor;
      this.calmUntil += pausedFor;
      this.gravBoostUntil += pausedFor;
      this.scatterUntil += pausedFor;
      this.fusionUntil += pausedFor;
      this.nextPairAt = (this.nextPairAt || 0) + pausedFor;
      if (this.vortex) {
        this.vortex.born += pausedFor;
        this.vortex.until += pausedFor;
      }
      for (const p of this.pieces) p.born += pausedFor;
      this.state = before;
    });
    items.push(close);
  }
}

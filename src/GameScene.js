import Phaser from 'phaser';
import { Ads, store } from './ads.js';
import { Sfx } from './sfx.js';
import { Haptics } from './haptics.js';
import { TIERS, MAX_TIER, TEX_SCALE, PORTRAIT_R, makeTextures, portraitKey, defOf, shade } from './art.js';
import { Blob, DEPTH } from './Blob.js';

export const W = 720;
export const H = 1280;

const LEFT = 40;
const RIGHT = 680;
const FLOOR = 1120;
const CEILING = 150;
const DANGER_Y = 390; // a settled jelly above this line ends the game
const LX = W / 2; // launcher
const LY = 255;
const STEP = 1000 / 60;
const GRAVITY_STEP = 1.4 * 0.001 * STEP * STEP; // velocity gained per physics step
const AIR = 1 - 0.008;
const SHOT_COOLDOWN = 520;
const DANGER_LIMIT_MS = 1800;
const SETTLE_MS = 1200;
const MIN_SPEED = 3;
const MAX_SPEED = 27;
const STAR_COST = 100;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const UI = 50;
const OVERLAY = 100;
const INITIAL_SEEN = [0, 1, 2];
const SPAWN_WEIGHTS = [34, 28, 20, 12, 6];

export class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  create() {
    this.cameras.main.setZoom(TEX_SCALE).centerOn(W / 2, H / 2);
    makeTextures(this);

    this.pieces = [];
    this.mergeQueue = [];
    this.starQueue = [];
    this.bombQueue = [];
    this.held = null;
    this.state = 'flying'; // aim | flying | over | busy | paused
    this.nextHeldAt = 0;
    this.acc = 0;
    this.slowUntil = 0;
    this.aiming = false;
    this.aim = null;

    this.score = 0;
    this.best = store.get('jd_best', 0);
    this.combo = 0;
    this.lastMergeAt = 0;
    this.runMax = 2; // decides which jellies can come out of the launcher
    this.biggest = 0;
    this.energy = 0;
    this.starPending = false;
    this.bombs = 1;
    this.shakes = 1;
    this.revived = false;
    this.seen = store.get('jd_seen', INITIAL_SEEN);

    this.drawBackground();
    this.buildWalls();
    this.bodyGfx = this.add.graphics().setDepth(DEPTH.body);
    this.buildHud();
    this.buildBottomBar();

    this.dots = [];
    for (let i = 0; i < 15; i++) this.dots.push(this.add.image(0, 0, 'dot').setDepth(5).setVisible(false));

    const tutorials = store.get('jd_tut', 0);
    if (tutorials < 3) {
      store.set('jd_tut', tutorials + 1);
      this.hint = this.text(W / 2, 470, 'Drag to aim  •  Release to shoot', 26, '#ffffff').setOrigin(0.5).setAlpha(0.85);
      this.tweens.add({ targets: this.hint, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
    }

    this.nextKind = this.rollTier();
    this.prepareHeld();

    this.input.on('pointerdown', (p, over) => {
      if (over.length || this.state !== 'aim') return;
      this.aiming = true;
      this.updateAim(p);
    });
    this.input.on('pointermove', (p) => {
      if (this.aiming) this.updateAim(p);
    });
    const release = (p) => {
      if (!this.aiming) return;
      this.updateAim(p);
      this.aiming = false;
      this.fire();
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    this.matter.world.on('collisionstart', (e) => this.onCollide(e, true));
    this.matter.world.on('collisionactive', (e) => this.onCollide(e, false));
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

  // ---------- setup ----------

  drawBackground() {
    const g = this.add.graphics();
    g.fillGradientStyle(0x2a1458, 0x2a1458, 0x12082b, 0x12082b, 1);
    g.fillRect(-W, -H, W * 3, H * 3);
    g.fillStyle(0xffffff, 0.05);
    g.fillRoundedRect(LEFT, CEILING + 30, RIGHT - LEFT, FLOOR - CEILING - 30, 24);
    g.lineStyle(6, 0xffffff, 0.22);
    g.strokeRoundedRect(LEFT - 3, CEILING + 30, RIGHT - LEFT + 6, FLOOR - CEILING - 27, 24);
    // launcher cradle
    g.lineStyle(5, 0xffffff, 0.16);
    g.strokeCircle(LX, LY, 86);
    this.dangerLine = this.add.graphics();
    this.dangerLine.lineStyle(4, 0xff6b81, 1);
    for (let x = LEFT + 10; x < RIGHT - 10; x += 28) this.dangerLine.lineBetween(x, DANGER_Y, x + 14, DANGER_Y);
    this.dangerLine.setAlpha(0.35);
  }

  buildWalls() {
    const T = 200;
    const opts = { isStatic: true, friction: 0.3 };
    this.matter.add.rectangle(LEFT - T / 2, H / 2, T, H * 3, opts);
    this.matter.add.rectangle(RIGHT + T / 2, H / 2, T, H * 3, opts);
    this.matter.add.rectangle(W / 2, CEILING - T / 2, W + 2 * T, T, opts);
    const floor = this.matter.add.rectangle(W / 2, FLOOR + T / 2, W + 2 * T, T, opts);
    floor.isFloor = true;
  }

  buildHud() {
    this.text(LEFT, 36, 'SCORE', 20, '#b9a8e6');
    this.scoreText = this.text(LEFT, 56, '0', 58);
    this.bestText = this.text(LEFT, 122, 'BEST ' + this.best, 20, '#b9a8e6');

    // wild star meter
    this.meterGfx = this.add.graphics().setDepth(UI);
    this.meterStar = this.add.image(LX, 86, 'spark').setDepth(UI).setScale(1.5 / TEX_SCALE).setTint(0xffe14d);
    this.meterLabel = this.text(LX, 140, 'WILD STAR', 15, '#b9a8e6').setOrigin(0.5);
    this.drawMeter();

    // next jelly; tap to swap
    this.text(RIGHT, 36, 'NEXT', 20, '#b9a8e6').setOrigin(1, 0);
    const nx = RIGHT - 52;
    const ny = 104;
    const zone = this.add.circle(nx, ny, 46, 0xffffff, 0.08).setDepth(UI).setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => this.swap());
    this.nextIcon = this.portrait(nx, ny, 0, 30).setDepth(UI);
    this.text(nx, 153, 'tap to swap', 14, '#8f7fc2').setOrigin(0.5, 0);

    this.comboText = this.text(W / 2, 330, '', 40, '#ffd93d').setOrigin(0.5).setAlpha(0);
  }

  drawMeter() {
    const g = this.meterGfx;
    const frac = this.starPending ? 1 : Math.min(1, this.energy / STAR_COST);
    g.clear();
    g.fillStyle(0xffffff, 0.08);
    g.fillCircle(LX, 86, 44);
    g.lineStyle(8, 0xffffff, 0.14);
    g.strokeCircle(LX, 86, 40);
    if (frac > 0) {
      g.lineStyle(8, 0xffd93d, 1);
      g.beginPath();
      g.arc(LX, 86, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, false);
      g.strokePath();
    }
    this.meterStar.setAlpha(0.35 + 0.65 * frac);
  }

  boosterButton(x, y, iconKey, iconScale, onTap) {
    const bg = this.add.graphics();
    bg.fillStyle(0x24124d, 1);
    bg.fillRoundedRect(-50, -44, 100, 100, 22);
    bg.fillStyle(0x4a2f96, 1);
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
    this.bombBtn = this.boosterButton(LEFT + 60, 1202, portraitKey('bomb'), 0.5, () => this.useBomb());
    this.shakeBtn = this.boosterButton(RIGHT - 60, 1202, 'icon_shake', 1.05, () => this.useShake());
    this.bombBtn.setCount(this.bombs);
    this.shakeBtn.setCount(this.shakes);

    // album strip: every jelly in the chain, unknown ones as silhouettes
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
      const img = this.portrait(x, y + 3, i, 17).setDepth(UI);
      const q = this.text(x, y + 2, '?', 22, '#8f7fc2').setOrigin(0.5);
      return { img, q };
    });
    this.refreshStrip();
  }

  refreshStrip() {
    this.strip.forEach(({ img, q }, i) => {
      const known = this.seen.includes(i);
      if (known) img.clearTint().setAlpha(1);
      else img.setTintFill(0x3b2478).setAlpha(0.9);
      q.setVisible(!known);
    });
  }

  // ---------- aiming and shooting ----------

  rollTier() {
    const top = Phaser.Math.Clamp(this.runMax - 2, 2, 4);
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
    this.held = new Blob(this, kind, LX, LY);
  }

  prepareHeld() {
    if (this.starPending) {
      this.starPending = false;
      this.energy = 0;
      this.meterLabel.setText('WILD STAR').setColor('#b9a8e6');
      this.drawMeter();
      this.setHeld('star');
    } else {
      this.setHeld(this.nextKind);
      this.nextKind = this.rollTier();
      this.refreshNext();
    }
    this.state = 'aim';
  }

  refreshNext() {
    this.nextIcon.setTexture(portraitKey(this.nextKind));
    this.tweens.add({ targets: this.nextIcon, scale: { from: 0.2 / TEX_SCALE, to: 30 / PORTRAIT_R / TEX_SCALE }, duration: 180, ease: 'Back.out' });
  }

  swap() {
    if (this.state !== 'aim' || !this.held || this.held.tier < 0) return;
    Sfx.click();
    Haptics.light();
    const current = this.held.kind;
    this.setHeld(this.nextKind);
    this.nextKind = current;
    this.refreshNext();
  }

  updateAim(p) {
    const dx = p.worldX - LX;
    const dy = p.worldY - LY;
    if (p.worldY < CEILING + 20) {
      this.aim = null; // dragging back up to the top cancels the shot
    } else {
      let ang = Math.atan2(dy, dx);
      if (ang < 0) ang = dx >= 0 ? 0 : Math.PI;
      ang = Phaser.Math.Clamp(ang, 0.2, Math.PI - 0.2);
      const power = Phaser.Math.Clamp((Math.hypot(dx, dy) - 50) / 640, 0, 1);
      const speed = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * Math.pow(power, 1.15);
      this.aim = { ang, power, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed };
    }
    this.drawAim();
  }

  drawAim() {
    const a = this.aim;
    if (!a || !this.aiming || !this.held) {
      this.dots.forEach((d) => d.setVisible(false));
      return;
    }
    const r = this.held.r;
    let x = LX;
    let y = LY;
    let vx = a.vx;
    let vy = a.vy;
    let shown = 0;
    for (let i = 1; shown < this.dots.length && i <= 60; i++) {
      vx *= AIR;
      vy = vy * AIR + GRAVITY_STEP;
      x += vx;
      y += vy;
      if (x < LEFT + r) {
        x = LEFT + r;
        vx = -vx * 0.3;
      } else if (x > RIGHT - r) {
        x = RIGHT - r;
        vx = -vx * 0.3;
      }
      if (y > FLOOR - r) break;
      if (i % 2 === 0 && Math.hypot(x - LX, y - LY) > r + 14) {
        const d = this.dots[shown];
        d.setVisible(true).setPosition(x, y);
        d.setScale((0.75 - shown * 0.03) / TEX_SCALE).setAlpha(0.8 - shown * 0.045);
        shown++;
      }
    }
    for (let i = shown; i < this.dots.length; i++) this.dots[i].setVisible(false);
    // the held jelly squashes back like a drawn slingshot
    this.held.qx += (a.power * 0.16 * Math.cos(2 * a.ang) - this.held.qx) * 0.5;
    this.held.qy += (a.power * 0.16 * Math.sin(2 * a.ang) - this.held.qy) * 0.5;
  }

  fire() {
    const a = this.aim;
    this.dots.forEach((d) => d.setVisible(false));
    if (!a || this.state !== 'aim' || !this.held) return;
    const b = this.held;
    this.held = null;
    b.addBody();
    this.matter.body.setVelocity(b.body, { x: a.vx, y: a.vy });
    b.born = this.time.now;
    b.fresh = true;
    if (b.tier > this.biggest) this.biggest = b.tier;
    b.impulse(a.ang + Math.PI / 2, 0.12 + a.power * 0.2);
    this.pieces.push(b);
    this.state = 'flying';
    this.nextHeldAt = this.time.now + SHOT_COOLDOWN;
    Sfx.shoot(a.power);
    Haptics.light();
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
    if (this.state !== 'aim' || !this.held || this.held.kind === 'bomb') return;
    if (this.bombs <= 0) {
      if (await this.rewarded()) this.bombs++;
      this.bombBtn.setCount(this.bombs);
      return;
    }
    this.bombs--;
    this.bombBtn.setCount(this.bombs);
    const current = this.held.kind;
    if (current === 'star') this.starPending = true;
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
      const v = p.body.velocity;
      this.matter.body.setVelocity(p.body, { x: v.x + Phaser.Math.FloatBetween(-7, 7), y: v.y - Phaser.Math.FloatBetween(9, 15) });
      p.impulse(Math.PI / 2, 0.2);
      p.born = now;
      p.dangerMs = 0;
    }
    this.cameras.main.shake(350, 0.012);
    Sfx.shake();
    Haptics.success();
  }

  // ---------- physics events ----------

  onCollide(event, isStart) {
    for (const pair of event.pairs) {
      const A = pair.bodyA.blob;
      const B = pair.bodyB.blob;
      if (!A && !B) continue;

      if (isStart) {
        const n = pair.collision.normal;
        const va = pair.bodyA.velocity;
        const vb = pair.bodyB.velocity;
        const rel = Math.abs((va.x - vb.x) * n.x + (va.y - vb.y) * n.y);
        if (rel > 1.2) {
          const amount = Math.min(rel * 0.014, 0.22);
          const ang = Math.atan2(n.y, n.x);
          if (A) A.impulse(ang, amount);
          if (B) B.impulse(ang, amount);
        }
        for (const b of [A, B]) {
          if (b && b.fresh) {
            b.fresh = false;
            if (rel > 2) {
              Sfx.land(rel);
              if (rel > 9) Haptics.light();
            }
          }
        }
      }

      if (A && A.tier < 0) {
        this.specialHit(A, B, pair.bodyB);
        continue;
      }
      if (B && B.tier < 0) {
        this.specialHit(B, A, pair.bodyA);
        continue;
      }
      if (!A || !B || A.tier !== B.tier || A.merging || B.merging) continue;
      A.merging = B.merging = true;
      this.mergeQueue.push([A, B]);
    }
  }

  specialHit(s, other, otherBody) {
    if (s.used) return;
    if (s.kind === 'star' && other && other.tier >= 0 && !other.merging) {
      s.used = other.merging = true;
      this.starQueue.push([s, other]);
    } else if (s.kind === 'bomb' && (other || otherBody.isFloor)) {
      s.used = true;
      this.bombQueue.push(s);
    }
  }

  removePiece(p) {
    const i = this.pieces.indexOf(p);
    if (i >= 0) this.pieces.splice(i, 1);
    p.destroy();
  }

  spawnPiece(x, y, tier) {
    const r = TIERS[tier].r;
    const b = new Blob(this, tier, Phaser.Math.Clamp(x, LEFT + r, RIGHT - r), Math.min(y, FLOOR - r));
    b.addBody();
    b.pop = 0.55;
    b.pv = 0.13;
    b.happyUntil = this.time.now + 800;
    this.pieces.push(b);
    if (tier > this.runMax) this.runMax = tier;
    if (tier > this.biggest) this.biggest = tier;
    if (!this.seen.includes(tier)) {
      this.seen.push(tier);
      store.set('jd_seen', this.seen);
      this.refreshStrip();
      this.showDiscovery(tier);
    }
    return b;
  }

  /** Nearby jellies get pushed away and wobble. */
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
      p.impulse(Math.atan2(dy, dx), 0.12 * (f / strength));
    }
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
      const next = tier + 1;
      let points = ((next + 1) * (next + 2)) / 2;
      if (next <= MAX_TIER) {
        this.spawnPiece(x, y, next);
      } else {
        points *= 5; // two kings burst for a huge bonus
        Sfx.discover();
      }
      points *= this.combo;
      this.addScore(points);
      const shown = Math.min(next, MAX_TIER);
      this.mergeFx(x, y, shown, points);
      this.shockwave(x, y, TIERS[shown].r + 90, 1.6 + shown * 0.15);
      this.addEnergy(6 + tier * 2);
      Sfx.merge(tier, this.combo);
      Haptics.merge(next);
      if (next >= 3) this.slowUntil = now + 60 + next * 6;
    }

    while (this.starQueue.length) {
      const [s, target] = this.starQueue.shift();
      if (!s.body || !target.body) continue;
      const { x, y, tier } = target;
      this.removePiece(s);
      this.removePiece(target);
      const next = Math.min(tier + 1, MAX_TIER);
      if (tier < MAX_TIER) this.spawnPiece(x, y, next);
      const points = (next + 1) * (next + 2);
      this.addScore(points);
      this.mergeFx(x, y, next, points);
      this.shockwave(x, y, TIERS[next].r + 90, 2);
      Sfx.star();
      Haptics.heavy();
    }

    while (this.bombQueue.length) {
      const bomb = this.bombQueue.shift();
      if (!bomb.body) continue;
      this.explode(bomb);
    }
  }

  explode(bomb) {
    const { x, y } = bomb;
    this.removePiece(bomb);
    let points = 0;
    for (const p of [...this.pieces]) {
      if (p.tier < 0) continue;
      if (Math.hypot(p.x - x, p.y - y) - p.r < 115) {
        points += (p.tier + 1) * 2;
        this.mergeFx(p.x, p.y, p.tier, 0);
        this.removePiece(p);
      }
    }
    if (points) this.addScore(points);
    const flash = this.add.circle(x, y, 60, 0xffe9a8, 0.9).setDepth(40);
    this.tweens.add({ targets: flash, scale: 3.6, alpha: 0, duration: 380, ease: 'Cubic.out', onComplete: () => flash.destroy() });
    this.shockwave(x, y, 300, 7);
    this.cameras.main.shake(260, 0.014);
    Sfx.boom();
    Haptics.success();
  }

  addEnergy(n) {
    if (this.starPending) return;
    this.energy += n;
    if (this.energy >= STAR_COST) {
      this.starPending = true;
      Sfx.star();
      Haptics.medium();
      this.tweens.add({ targets: this.meterStar, scale: { from: 2.6 / TEX_SCALE, to: 1.5 / TEX_SCALE }, duration: 400, ease: 'Back.out' });
      this.meterLabel.setText('READY!').setColor('#ffd93d');
    }
    this.drawMeter();
  }

  addScore(points) {
    this.score += points;
    this.scoreText.setText(String(this.score));
    this.tweens.add({ targets: this.scoreText, scale: { from: 1.18, to: 1 }, duration: 160 });
    if (this.score > this.best) {
      this.best = this.score;
      store.set('jd_best', this.best);
      this.bestText.setText('BEST ' + this.best);
    }
  }

  // ---------- effects ----------

  mergeFx(x, y, tier, points) {
    const t = TIERS[tier];
    const ring = this.add.circle(x, y, t.r, 0xffffff, 0).setStrokeStyle(6, 0xffffff, 0.9).setDepth(40);
    this.tweens.add({ targets: ring, scale: 1.7, alpha: 0, duration: 320, ease: 'Cubic.out', onComplete: () => ring.destroy() });
    const n = 7 + tier;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const d = this.add
        .image(x, y, i % 3 ? 'dot' : 'spark')
        .setTint(i % 2 ? t.color : 0xffffff)
        .setScale((0.5 + Math.random() * 0.7) / TEX_SCALE)
        .setDepth(40);
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
      const label = this.text(x, y, '+' + points, 28 + tier * 2).setOrigin(0.5).setDepth(41).setStroke('#2b1b3d', 6);
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

  showDiscovery(tier) {
    Sfx.discover();
    Haptics.success();
    const y = 640;
    const bg = this.add.graphics();
    bg.fillStyle(0x12082b, 0.82);
    bg.fillRoundedRect(-230, -150, 460, 300, 32);
    bg.lineStyle(4, 0xffd93d, 0.9);
    bg.strokeRoundedRect(-230, -150, 460, 300, 32);
    const title = this.add.text(0, -112, 'NEW JELLY!', { fontFamily: FONT, fontSize: 30, color: '#ffd93d', fontStyle: 'bold' }).setOrigin(0.5).setResolution(TEX_SCALE);
    const pic = this.portrait(0, 6, tier, 62);
    const name = this.add.text(0, 112, TIERS[tier].name, { fontFamily: FONT, fontSize: 36, color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setResolution(TEX_SCALE);
    const c = this.add.container(W / 2, y, [bg, title, pic, name]).setDepth(60).setScale(0.3).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 260, ease: 'Back.out' });
    this.tweens.add({ targets: c, alpha: 0, y: y - 40, delay: 1500, duration: 300, onComplete: () => c.destroy() });
    for (let i = 0; i < 26; i++) {
      const d = this.add
        .image(W / 2, y, 'spark')
        .setTint(Phaser.Display.Color.HSVToRGB(Math.random(), 0.6, 1).color)
        .setScale((0.6 + Math.random()) / TEX_SCALE)
        .setDepth(59);
      const ang = Math.random() * Math.PI * 2;
      const dist = 200 + Math.random() * 220;
      this.tweens.add({
        targets: d,
        x: W / 2 + Math.cos(ang) * dist,
        y: y + Math.sin(ang) * dist + 80,
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
    if (this.state === 'aim' || this.state === 'flying') {
      this.acc += Math.min(delta, 50) * (now < this.slowUntil ? 0.3 : 1);
      let steps = 0;
      while (this.acc >= STEP && steps < 3) {
        this.matter.world.step(STEP);
        this.acc -= STEP;
        steps++;
      }
      if (steps === 3) this.acc = 0;
      this.processQueues();
      this.checkPieces(now, delta);
      if (this.state === 'flying' && now >= this.nextHeldAt) this.prepareHeld();
    }
    this.renderBlobs(delta, now);
  }

  checkPieces(now, delta) {
    let worst = 0;
    for (const p of [...this.pieces]) {
      const age = now - p.born;
      if (p.tier < 0) {
        // a special that never found a target fizzles out
        if (age > 4500 && !p.used) {
          if (p.kind === 'bomb') this.explode(p);
          else {
            this.mergeFx(p.x, p.y, 0, 0);
            this.removePiece(p);
          }
        }
        continue;
      }
      const top = p.y - p.r;
      const settled = age > SETTLE_MS;
      p.scared = settled && top < DANGER_Y + 45;
      if (settled && top < DANGER_Y) p.dangerMs += delta;
      else p.dangerMs = 0;
      if (p.dangerMs > worst) worst = p.dangerMs;
    }
    this.dangerLine.setAlpha(worst > 0 ? 0.5 + 0.5 * Math.abs(Math.sin(now / 90)) : 0.35);
    if (worst > DANGER_LIMIT_MS) this.gameOver();
  }

  renderBlobs(delta, now) {
    const list = this.pieces;
    for (const b of list) {
      b.sync();
      b.planes.length = 0;
      const rv = b.rv;
      if (b.x - LEFT < rv) b.planes.push(-1, 0, b.x - LEFT);
      if (RIGHT - b.x < rv) b.planes.push(1, 0, RIGHT - b.x);
      if (FLOOR - b.y < rv) b.planes.push(0, 1, FLOOR - b.y);
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
        if (Math.abs(dx) > sum || Math.abs(dy) > sum) continue;
        const d = Math.hypot(dx, dy);
        if (d >= sum || d < 0.001) continue;
        const nx = dx / d;
        const ny = dy / d;
        const da = (d * ra) / sum;
        a.planes.push(nx, ny, da);
        b.planes.push(-nx, -ny, d - da);
      }
    }
    const g = this.bodyGfx;
    g.clear();
    for (const b of list) {
      b.update(delta, now);
      b.draw(g, now);
    }
    if (this.held) {
      this.held.planes.length = 0;
      this.held.update(delta, now);
      this.held.draw(g, now);
    }
  }

  // ---------- game over, revive, ads ----------

  gameOver() {
    this.state = 'over';
    this.aiming = false;
    this.dots.forEach((d) => d.setVisible(false));
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
    const dim = this.add.rectangle(W / 2, H / 2, W * 3, H * 3, 0x0b0420, 0.78).setInteractive().setDepth(OVERLAY);
    const g = this.add.graphics().setDepth(OVERLAY);
    g.fillStyle(0x3a2175, 1);
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

    const biggest = this.biggest;
    add(this.portrait(W / 2 - 150, 570, biggest, 44));
    add(this.text(W / 2 - 90, 536, 'BIGGEST JELLY', 18, '#b9a8e6'));
    add(this.text(W / 2 - 90, 558, TIERS[biggest].name, 32));
    add(this.text(W / 2 - 90, 598, `Album ${this.seen.length} / ${TIERS.length}`, 18, '#b9a8e6'));

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

  /** Reward for watching an ad: clear the top half of the jar and keep playing. */
  revive() {
    this.revived = true;
    const cutoff = DANGER_Y + (FLOOR - DANGER_Y) * 0.45;
    for (const p of [...this.pieces]) {
      if (p.y - p.r < cutoff) {
        this.mergeFx(p.x, p.y, Math.max(0, p.tier), 0);
        this.removePiece(p);
      } else {
        p.dangerMs = 0;
      }
    }
    this.mergeQueue.length = 0;
    this.starQueue.length = 0;
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
    Sfx.click();
    const items = this.panel(50, 170, W - 100, 940);
    const add = (o) => {
      items.push(o.setDepth(OVERLAY));
      return o;
    };
    add(this.text(W / 2, 222, 'JELLY ALBUM', 44).setOrigin(0.5));
    add(this.text(W / 2, 270, `${this.seen.length} of ${TIERS.length} discovered`, 22, '#b9a8e6').setOrigin(0.5));
    TIERS.forEach((t, i) => {
      const x = W / 2 + ((i % 3) - 1) * 190;
      const y = 392 + Math.floor(i / 3) * 172;
      const known = this.seen.includes(i);
      const pic = add(this.portrait(x, y, i, 40));
      if (!known) pic.setTintFill(0x24124d);
      add(this.text(x, y + 62, known ? t.name : '???', 22, known ? '#ffffff' : '#8f7fc2').setOrigin(0.5));
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

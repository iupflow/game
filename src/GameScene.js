import Phaser from 'phaser';
import { Ads, store } from './ads.js';
import { Sfx } from './sfx.js';

export const W = 720;
export const H = 1280;

const LEFT = 40;
const RIGHT = 680;
const FLOOR = 1210;
const DANGER_Y = 340; // a settled piece above this line ends the game
const DROP_Y = 240;
const DROP_COOLDOWN = 450;
const DANGER_LIMIT_MS = 1800;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// Each tier merges into the next one.
const TIERS = [
  { r: 26, color: 0xff6b81 },
  { r: 36, color: 0xffa24c },
  { r: 48, color: 0xffd93d },
  { r: 60, color: 0x8ce99a },
  { r: 74, color: 0x38d9a9 },
  { r: 90, color: 0x4dabf7 },
  { r: 106, color: 0x748ffc },
  { r: 124, color: 0xb197fc },
  { r: 144, color: 0xf783ac },
  { r: 166, color: 0xff8787 },
  { r: 190, color: 0xfff3bf },
];
const SPAWN_WEIGHTS = [34, 28, 20, 12, 6]; // only the 5 smallest tiers are dropped
const PAD = 4;

function shade(color, factor) {
  const c = Phaser.Display.Color.IntegerToColor(color);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * factor)));
  return Phaser.Display.Color.GetColor(f(c.red), f(c.green), f(c.blue));
}

export class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  create() {
    this.pieces = [];
    this.mergeQueue = [];
    this.score = 0;
    this.best = store.get('jd_best', 0);
    this.combo = 0;
    this.lastMergeAt = 0;
    this.state = 'aim'; // aim | wait | over | busy
    this.revived = false;
    this.inputReadyAt = this.time.now + 300;

    this.makeTextures();
    this.drawBackground();
    this.buildWalls();
    this.buildHud();

    this.nextTier = this.rollTier();
    this.prepareHeld();

    this.input.on('pointerdown', (p) => this.aimAt(p));
    this.input.on('pointermove', (p) => this.aimAt(p));
    this.input.on('pointerup', (p) => {
      if (this.time.now < this.inputReadyAt) return;
      this.aimAt(p);
      this.drop();
    });

    this.matter.world.on('collisionstart', (e) => this.onCollide(e));
    this.matter.world.on('collisionactive', (e) => this.onCollide(e));
  }

  // ---------- setup ----------

  makeTextures() {
    TIERS.forEach((t, i) => {
      const key = 't' + i;
      if (this.textures.exists(key)) return;
      const r = t.r;
      const c = r + PAD;
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(shade(t.color, 0.72), 1);
      g.fillCircle(c, c, r);
      g.fillStyle(t.color, 1);
      g.fillCircle(c, c - r * 0.05, r * 0.93);
      g.fillStyle(0xffffff, 0.45);
      g.fillEllipse(c - r * 0.35, c - r * 0.45, r * 0.5, r * 0.3);
      // face
      const eye = Math.max(3, r * 0.1);
      g.fillStyle(0x2b1b3d, 1);
      g.fillCircle(c - r * 0.3, c - r * 0.05, eye);
      g.fillCircle(c + r * 0.3, c - r * 0.05, eye);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(c - r * 0.3 + eye * 0.3, c - r * 0.05 - eye * 0.3, eye * 0.35);
      g.fillCircle(c + r * 0.3 + eye * 0.3, c - r * 0.05 - eye * 0.3, eye * 0.35);
      g.lineStyle(Math.max(2, r * 0.07), 0x2b1b3d, 1);
      g.beginPath();
      g.arc(c, c + r * 0.12, r * 0.2, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(160));
      g.strokePath();
      g.fillStyle(0xff5c8a, 0.35);
      g.fillCircle(c - r * 0.52, c + r * 0.18, r * 0.12);
      g.fillCircle(c + r * 0.52, c + r * 0.18, r * 0.12);
      g.generateTexture(key, c * 2, c * 2);
      g.destroy();
    });
    if (!this.textures.exists('dot')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffffff, 1);
      g.fillCircle(8, 8, 8);
      g.generateTexture('dot', 16, 16);
      g.destroy();
    }
  }

  drawBackground() {
    const g = this.add.graphics();
    g.fillGradientStyle(0x2a1458, 0x2a1458, 0x12082b, 0x12082b, 1);
    g.fillRect(0, 0, W, H);
    // jar
    g.fillStyle(0xffffff, 0.06);
    g.fillRoundedRect(LEFT, DANGER_Y - 60, RIGHT - LEFT, FLOOR - DANGER_Y + 60, 24);
    g.lineStyle(6, 0xffffff, 0.25);
    g.strokeRoundedRect(LEFT - 3, DANGER_Y - 60, RIGHT - LEFT + 6, FLOOR - DANGER_Y + 63, 24);
    // danger line
    this.dangerLine = this.add.graphics();
    this.dangerLine.lineStyle(4, 0xff6b81, 1);
    for (let x = LEFT + 10; x < RIGHT - 10; x += 28) {
      this.dangerLine.lineBetween(x, DANGER_Y, x + 14, DANGER_Y);
    }
    this.dangerLine.setAlpha(0.35);
    // aim guide
    this.guide = this.add.rectangle(W / 2, (DROP_Y + FLOOR) / 2, 3, FLOOR - DROP_Y, 0xffffff, 0.12);
  }

  buildWalls() {
    const T = 200;
    const opts = { isStatic: true, friction: 0.3 };
    this.matter.add.rectangle(LEFT - T / 2, H / 2 - 400, T, H + 1200, opts);
    this.matter.add.rectangle(RIGHT + T / 2, H / 2 - 400, T, H + 1200, opts);
    this.matter.add.rectangle(W / 2, FLOOR + T / 2, W + 2 * T, T, opts);
  }

  buildHud() {
    this.add.text(LEFT, 44, 'SCORE', { fontFamily: FONT, fontSize: 22, color: '#b9a8e6', fontStyle: 'bold' });
    this.scoreText = this.add.text(LEFT, 68, '0', { fontFamily: FONT, fontSize: 64, color: '#ffffff', fontStyle: 'bold' });
    this.bestText = this.add.text(LEFT, 142, 'BEST ' + this.best, {
      fontFamily: FONT, fontSize: 22, color: '#b9a8e6', fontStyle: 'bold',
    });
    this.add.text(RIGHT, 44, 'NEXT', { fontFamily: FONT, fontSize: 22, color: '#b9a8e6', fontStyle: 'bold' }).setOrigin(1, 0);
    this.add.circle(RIGHT - 50, 122, 50, 0xffffff, 0.08);
    this.nextIcon = this.add.image(RIGHT - 50, 122, 't0');
    this.comboText = this.add
      .text(W / 2, 110, '', { fontFamily: FONT, fontSize: 40, color: '#ffd93d', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setAlpha(0);
  }

  // ---------- core loop ----------

  rollTier() {
    const total = SPAWN_WEIGHTS.reduce((a, b) => a + b, 0);
    let n = Math.random() * total;
    for (let i = 0; i < SPAWN_WEIGHTS.length; i++) {
      n -= SPAWN_WEIGHTS[i];
      if (n < 0) return i;
    }
    return 0;
  }

  prepareHeld() {
    this.heldTier = this.nextTier;
    this.nextTier = this.rollTier();
    const x = this.held ? this.held.x : W / 2;
    if (this.held) this.held.destroy();
    this.held = this.add.image(x, DROP_Y, 't' + this.heldTier).setScale(0);
    this.tweens.add({ targets: this.held, scale: 1, duration: 160, ease: 'Back.out' });
    this.nextIcon.setTexture('t' + this.nextTier);
    this.nextIcon.setScale(Math.min(1, 38 / TIERS[this.nextTier].r));
    this.clampHeld(x);
    this.state = 'aim';
  }

  clampHeld(x) {
    const r = TIERS[this.heldTier].r;
    this.held.x = Phaser.Math.Clamp(x, LEFT + r + 2, RIGHT - r - 2);
    this.guide.x = this.held.x;
  }

  aimAt(pointer) {
    if (this.state !== 'aim' && this.state !== 'wait') return;
    if (this.held && this.held.active) this.clampHeld(pointer.worldX);
  }

  drop() {
    if (this.state !== 'aim') return;
    this.state = 'wait';
    const x = this.held.x;
    this.held.setVisible(false);
    this.spawn(x, DROP_Y, this.heldTier);
    Sfx.drop();
    this.time.delayedCall(DROP_COOLDOWN, () => {
      if (this.state === 'wait') this.prepareHeld();
    });
  }

  spawn(x, y, tier) {
    const p = this.matter.add.image(x, y, 't' + tier);
    p.setCircle(TIERS[tier].r, { restitution: 0.15, friction: 0.35, frictionAir: 0.008, density: 0.0012 });
    p.tier = tier;
    p.born = this.time.now;
    p.dangerMs = 0;
    p.merging = false;
    this.pieces.push(p);
    return p;
  }

  onCollide(event) {
    if (this.state === 'over' || this.state === 'busy') return;
    for (const pair of event.pairs) {
      const a = pair.bodyA.gameObject;
      const b = pair.bodyB.gameObject;
      if (!a || !b || a.tier === undefined || a.tier !== b.tier) continue;
      if (a.merging || b.merging || !a.active || !b.active) continue;
      a.merging = b.merging = true;
      this.mergeQueue.push([a, b]);
    }
  }

  processMerges() {
    while (this.mergeQueue.length) {
      const [a, b] = this.mergeQueue.shift();
      if (!a.active || !b.active) continue;
      const x = (a.x + b.x) / 2;
      const y = (a.y + b.y) / 2;
      const tier = a.tier;
      this.removePiece(a);
      this.removePiece(b);

      const now = this.time.now;
      this.combo = now - this.lastMergeAt < 1200 ? this.combo + 1 : 1;
      this.lastMergeAt = now;

      const next = tier + 1;
      let points = ((next + 1) * (next + 2)) / 2;
      if (next < TIERS.length) {
        const r = TIERS[next].r;
        this.spawn(Phaser.Math.Clamp(x, LEFT + r, RIGHT - r), Math.min(y, FLOOR - r), next);
      } else {
        points *= 3; // two of the largest vanish for a big bonus
      }
      points *= this.combo;
      this.addScore(points);
      this.mergeFx(x, y, Math.min(next, TIERS.length - 1), points);
      Sfx.merge(tier, this.combo);
      if (navigator.vibrate) navigator.vibrate(tier > 4 ? 30 : 12);
    }
  }

  removePiece(p) {
    const i = this.pieces.indexOf(p);
    if (i >= 0) this.pieces.splice(i, 1);
    p.destroy();
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

  mergeFx(x, y, tier, points) {
    const t = TIERS[tier];
    const ring = this.add.circle(x, y, t.r, t.color, 0).setStrokeStyle(6, 0xffffff, 0.9);
    this.tweens.add({ targets: ring, scale: 1.5, alpha: 0, duration: 300, onComplete: () => ring.destroy() });
    const n = 6 + tier;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const d = this.add.image(x, y, 'dot').setTint(t.color).setScale(0.6 + Math.random() * 0.6);
      const dist = t.r + 30 + Math.random() * 50;
      this.tweens.add({
        targets: d,
        x: x + Math.cos(ang) * dist,
        y: y + Math.sin(ang) * dist,
        alpha: 0,
        scale: 0.1,
        duration: 380 + Math.random() * 200,
        ease: 'Cubic.out',
        onComplete: () => d.destroy(),
      });
    }
    const label = this.add
      .text(x, y, '+' + points, { fontFamily: FONT, fontSize: 30 + tier * 2, color: '#ffffff', fontStyle: 'bold', stroke: '#2b1b3d', strokeThickness: 6 })
      .setOrigin(0.5);
    this.tweens.add({ targets: label, y: y - 70, alpha: 0, duration: 700, ease: 'Cubic.out', onComplete: () => label.destroy() });
    if (this.combo >= 2) {
      this.comboText.setText('COMBO x' + this.combo).setAlpha(1).setScale(1.3);
      this.tweens.killTweensOf(this.comboText);
      this.tweens.add({ targets: this.comboText, scale: 1, duration: 150 });
      this.tweens.add({ targets: this.comboText, alpha: 0, delay: 800, duration: 300 });
    }
    if (tier >= 5) this.cameras.main.shake(120, 0.004 + tier * 0.0006);
  }

  update(_time, delta) {
    if (this.state === 'over' || this.state === 'busy') return;
    this.processMerges();

    let worst = 0;
    const now = this.time.now;
    for (const p of this.pieces) {
      const top = p.y - TIERS[p.tier].r;
      const settled = now - p.born > 1000;
      if (settled && top < DANGER_Y) p.dangerMs += delta;
      else p.dangerMs = 0;
      if (p.dangerMs > worst) worst = p.dangerMs;
    }
    this.dangerLine.setAlpha(worst > 0 ? 0.5 + 0.5 * Math.abs(Math.sin(now / 90)) : 0.35);
    if (worst > DANGER_LIMIT_MS) this.gameOver();
  }

  // ---------- game over, revive, ads ----------

  gameOver() {
    this.state = 'over';
    this.matter.world.pause();
    if (this.held) this.held.setVisible(false);
    this.guide.setVisible(false);
    Sfx.gameOver();
    this.showGameOver();
  }

  button(x, y, w, h, label, color, onClick, fontSize = 30) {
    const bg = this.add.graphics();
    bg.fillStyle(shade(color, 0.7), 1);
    bg.fillRoundedRect(-w / 2, -h / 2 + 6, w, h, 20);
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 20);
    const text = this.add.text(0, 0, label, { fontFamily: FONT, fontSize, color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    const c = this.add.container(x, y, [bg, text]);
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

  showGameOver() {
    const items = [];
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x0b0420, 0.75).setInteractive();
    const panel = this.add.graphics();
    panel.fillStyle(0x3a2175, 1);
    panel.fillRoundedRect(80, 330, W - 160, 640, 36);
    panel.lineStyle(4, 0xffffff, 0.15);
    panel.strokeRoundedRect(80, 330, W - 160, 640, 36);
    const title = this.add.text(W / 2, 400, 'GAME OVER', { fontFamily: FONT, fontSize: 52, color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    const score = this.add.text(W / 2, 500, String(this.score), { fontFamily: FONT, fontSize: 96, color: '#ffd93d', fontStyle: 'bold' }).setOrigin(0.5);
    const isBest = this.score > 0 && this.score >= this.best;
    const best = this.add
      .text(W / 2, 580, isBest ? 'NEW BEST!' : 'BEST ' + this.best, { fontFamily: FONT, fontSize: 28, color: isBest ? '#8ce99a' : '#b9a8e6', fontStyle: 'bold' })
      .setOrigin(0.5);
    items.push(dim, panel, title, score, best);

    let y = 680;
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

    items.forEach((o) => o.setDepth(100));
  }

  /** Reward for watching an ad: clear the top half of the jar and keep playing. */
  revive() {
    this.revived = true;
    const cutoff = DANGER_Y + (FLOOR - DANGER_Y) * 0.45;
    for (const p of [...this.pieces]) {
      if (p.y - TIERS[p.tier].r < cutoff) {
        this.mergeFx(p.x, p.y, p.tier, 0);
        this.removePiece(p);
      } else {
        p.dangerMs = 0;
      }
    }
    this.mergeQueue.length = 0;
    this.combo = 0;
    this.matter.world.resume();
    this.guide.setVisible(true);
    this.inputReadyAt = this.time.now + 300;
    this.prepareHeld();
  }
}

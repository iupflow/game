// The home screen, the pause menu, saving and continuing a game, the daily challenge and the
// shop, plus diamonds (the one currency) and the skin and background in use.
// Mixed into GameScene, so `this` is the scene.
import { Sfx } from '../sfx.js';
import { Haptics } from '../haptics.js';
import { Meta } from '../meta.js';
import { Ads, store } from '../ads.js';
import { SKINS, THEMES, GEM_PACKS, skinById, themeById, applyPageTheme, uiPalette } from '../themes.js';
import { dailyChallenge, seededRandom, todayKey } from '../daily.js';
import { TIERS, HOLE, TEX_SCALE, PORTRAIT_R, setArtSkin, wearsSkin, faceStyleOf, dropSkinTextures, skinPreview, hasKindTextures, makeKindTextures } from '../art.js';
import { skyPreview } from '../backgrounds.js';

const OVERLAY = 100;
const GEMS = OVERLAY + 5; // the diamond counter stays readable over the menus
const GEM_X = 48;
const GEM_Y = 58;
const SAVE_EVERY_MS = 4000;
const SAVE_VERSION = 1;
const SAVED_KINDS = (kind) => typeof kind === 'number' || kind === 'bomb';

/**
 * Diamonds drop from merges, rarely: the bigger the body made, the better the chance.
 * About 0.4% for a Mercury, 1.4% for an Earth, 5% for a Saturn, 13% for the Sun and 48% for a
 * Supernova, so most games find one to three. A black hole always gives BLACK_HOLE_GEMS.
 */
export const gemChance = (tier) => Math.min(0.6, 0.0025 * Math.pow(1.55, tier));
export const BLACK_HOLE_GEMS = 5;

export const MenuMixin = {
  // ---------- diamonds ----------

  buildGems() {
    this.gemsInFlight = 0;
    this.gemIcon = this.add.image(GEM_X, GEM_Y, 'gem').setScale(0.82 / TEX_SCALE).setDepth(GEMS);
    this.gemText = this.text(GEM_X + 26, GEM_Y + 1, '', 32).setOrigin(0, 0.5).setDepth(GEMS).setStroke('#150a33', 6);
    this.refreshGems();
  },

  /** The wallet, less the diamonds still flying to it. */
  refreshGems(pop = false) {
    this.gemText.setText(Math.max(0, Meta.gems - this.gemsInFlight).toLocaleString('en-US'));
    if (pop) {
      this.tweens.add({ targets: this.gemText, scale: { from: 1.3, to: 1 }, duration: 220, ease: 'Back.out' });
      this.tweens.add({ targets: this.gemIcon, scale: { from: 1.15 / TEX_SCALE, to: 0.82 / TEX_SCALE }, duration: 220, ease: 'Back.out' });
    }
  },

  /**
   * Diamonds found at a point on the screen: they go into the wallet at once (nothing is lost if
   * the game is closed), and a diamond pops out there and flies up to the counter.
   */
  gainGemsAt(n, sx, sy) {
    if (n <= 0) return;
    Meta.addGems(n);
    this.runGems += n;
    this.gemsInFlight += n;
    const shown = Math.min(n, 6);
    for (let i = 0; i < shown; i++) {
      const share = i < shown - 1 ? 1 : n - (shown - 1);
      const ox = shown > 1 ? (i - (shown - 1) / 2) * 22 : 0;
      const gem = this.add.image(sx + ox, sy, 'gem').setDepth(GEMS + 1).setScale(0);
      this.tweens.add({ targets: gem, scale: 0.95 / TEX_SCALE, y: sy - 26, duration: 260, ease: 'Back.out', delay: i * 60 });
      this.tweens.add({
        targets: gem,
        x: GEM_X,
        y: GEM_Y,
        scale: 0.6 / TEX_SCALE,
        delay: 520 + i * 90,
        duration: 620,
        ease: 'Cubic.in',
        onComplete: () => {
          gem.destroy();
          this.gemsInFlight -= share;
          this.refreshGems(true);
          Sfx.gemIn();
        },
      });
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const sp = this.add.image(sx, sy - 20, 'spark').setTint(0xbff6ff).setScale(0.3 / TEX_SCALE).setDepth(GEMS + 1);
      this.tweens.add({ targets: sp, x: sx + Math.cos(a) * 34, y: sy - 20 + Math.sin(a) * 34, alpha: 0, scale: 0.05 / TEX_SCALE, duration: 420, onComplete: () => sp.destroy() });
    }
    const label = this.text(sx, sy - 58, `+${n}`, 26, '#9ff3ff').setOrigin(0.5).setDepth(GEMS + 1).setStroke('#0b2a4a', 6);
    this.tweens.add({ targets: label, y: sy - 90, alpha: 0, delay: 300, duration: 700, onComplete: () => label.destroy() });
    this.refreshGems();
    Sfx.gem();
    Haptics.light();
  },

  /** The same, at a point of the field. */
  gainGems(n, fx, fy) {
    const at = this.toScreen(fx, fy);
    this.gainGemsAt(n, at.x, at.y);
  },

  /** A merge made a body of this tier at (fx, fy): sometimes a diamond drops. */
  rollGem(tier, fx, fy) {
    if (Math.random() < gemChance(tier)) this.gainGems(1, fx, fy);
  },

  // ---------- looks ----------

  applyLooks() {
    this.skin = skinById(Meta.using('skin'));
    this.theme = themeById(Meta.using('theme'));
    this.pal = uiPalette(this.theme);
    setArtSkin(this.skin.id);
    applyPageTheme(this.theme);
  },

  /** A planet in the chosen skin: the kawaii skin gives it a face. */
  dress(p) {
    if (this.skin.face && wearsSkin(p.kind)) p.addFace(faceStyleOf(p.kind));
  },

  // ---------- the game's own controls, hidden on the home screen ----------

  setGameUi(on) {
    this.gameUiOn = on;
    for (const o of this.gameUi) {
      o.setVisible(on);
      if (o.input) o.input.enabled = on;
    }
    this.refreshStrip();
  },

  // ---------- home ----------

  showHome() {
    const W = this.W;
    this.state = 'menu';
    this.inGame = false;
    this.setGameUi(false);
    if (this.hint) this.hint.setVisible(false);
    const items = (this.homeItems = []);
    this.homeAlpha = 1;
    const add = (o, depth = OVERLAY) => {
      items.push(o.setDepth(depth));
      return o;
    };
    // no veil over the sky: just soft shade behind the title and the buttons, so they read well
    add(this.add.image(W / 2, 330, 'soft').setTint(this.pal.dim).setAlpha(0.55).setScale(8.5 / TEX_SCALE, 3.4 / TEX_SCALE), OVERLAY - 2);
    add(this.add.image(W / 2, 1000, 'soft').setTint(this.pal.dim).setAlpha(0.6).setScale(9 / TEX_SCALE, 6 / TEX_SCALE), OVERLAY - 2);
    this.homeOrbit(items);
    this.jellyTitle(items, 312);
    add(this.text(W / 2, 384, 'Merge planets. Grow the universe.', 24, this.pal.light).setOrigin(0.5));
    // the biggest body ever made, as a little trophy
    const record = Meta.record;
    if (record >= 0) {
      if (!hasKindTextures(this, record)) makeKindTextures(this, record);
      add(this.portrait(W / 2 - 104, 478, record, 30));
      add(this.text(W / 2 - 34, 462, 'BIGGEST EVER', 16, this.pal.soft).setOrigin(0, 0.5));
      add(this.text(W / 2 - 34, 492, TIERS[record].name, 28).setOrigin(0, 0.5));
    }

    const saved = this.savedGame();
    let y;
    if (saved) {
      items.push(this.button(W / 2, 770, 420, 86, '▶  CONTINUE', 0x37b24d, () => this.startGame(saved.mode, saved), 36, { breathe: true }));
      items.push(this.button(W / 2, 866, 420, 62, 'NEW GAME', this.pal.button2, () => this.confirmNewGame('normal'), 24));
      y = 950;
    } else {
      items.push(this.button(W / 2, 800, 420, 86, '▶  PLAY', 0x37b24d, () => this.startGame('normal'), 36, { breathe: true }));
      y = 900;
    }
    const daily = dailyChallenge();
    const dailyBtn = this.button(W / 2, y, 420, 64, 'DAILY CHALLENGE', this.pal.button, () => this.openDaily(), 24, { textColor: '#ffd08a' });
    items.push(dailyBtn);
    // a small badge on the button (it wobbles with it): a dot while today's challenge is open, a tick once done
    const done = Meta.daily(daily.date).done;
    const badge = this.add.container(196, -28);
    const bg = this.add.graphics();
    bg.fillStyle(done ? 0x2f9e44 : 0xff4d6d, 1);
    bg.fillCircle(0, 0, 13);
    bg.lineStyle(1.5, 0xffffff, 0.9);
    bg.strokeCircle(0, 0, 13);
    badge.add([bg, this.text(0, 1, done ? '✓' : '!', 17).setOrigin(0.5)]);
    dailyBtn.add(badge);
    if (!done) this.tweens.add({ targets: badge, scale: 1.15, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    y += 82;
    items.push(this.button(W / 2 - 106, y, 202, 62, 'SHOP', this.pal.button, () => this.openShop(), 24));
    items.push(this.button(W / 2 + 106, y, 202, 62, 'ALBUM', this.pal.button2, () => this.openAlbum(), 24));
    if (!this.premium) {
      items.push(
        this.button(W / 2, y + 76, 420, 50, 'No Ads + Max Boosters  $2.99', 0x7950f2, async () => {
          if (this.premium) return;
          if (await Ads.purchasePremium()) {
            this.applyPremium();
            this.closeHome();
            this.showHome();
          }
        }, 19),
      );
    }
  },

  /**
   * The name as jelly letters in candy colours: they drop in one by one, land with a squash and
   * then breathe in a slow wave. Each one wobbles when touched.
   */
  jellyTitle(items, y) {
    const W = this.W;
    const colors = ['#ff8fc6', '#ffb86b', '#ffe066', '#7ee8b5', '#7fd0ff', '#b59cff'];
    const letters = [];
    let width = 0;
    let n = 0;
    for (const ch of 'JELLY DROP') {
      if (ch === ' ') {
        letters.push(null);
        width += 22;
        continue;
      }
      const t = this.text(0, 0, ch, 84, colors[n++ % colors.length])
        .setOrigin(0.5, 0.8)
        .setStroke(this.pal.stroke, 12)
        .setShadow(0, 6, 'rgba(0,0,0,0.28)', 0, true, true);
      letters.push(t);
      width += t.width - 10;
    }
    let x = W / 2 - width / 2;
    let i = 0;
    for (const t of letters) {
      if (!t) {
        x += 22;
        continue;
      }
      const w = t.width - 10;
      t.setPosition(x + w / 2, y).setDepth(OVERLAY);
      items.push(t);
      x += w;
      // it falls in and lands with a squash
      const delay = 120 + i * 70;
      t.y = y - 360 - i * 18;
      t.setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, duration: 120, delay });
      this.tweens.add({
        targets: t,
        y,
        duration: 420,
        delay,
        ease: 'Quad.in',
        onComplete: () => {
          if (!t.active) return;
          this.jelly.wobble(t, 0.16);
          if (i % 3 === 0) Sfx.boing(i);
        },
      });
      this.tappable(t, () => {
        this.jelly.wobble(t, 0.2);
        Sfx.boing(Math.floor(Math.random() * 6));
      }, { breathe: true });
      t.jelly.t = i * 0.55; // the breathing runs along the word like a wave
      i++;
    }
  },

  /** A few planets in the skin in use, circling the well on a tilted orbit behind the menu. */
  homeOrbit(items) {
    const CX = this.CX;
    const CY = this.CY;
    const orbits = [
      [0, 13, 112, 0.0009, 0.2],
      [2, 17, 146, 0.0006, 2.4],
      [4, 20, 176, 0.00045, 4.2],
    ];
    const bodies = orbits.map(([kind, r, rx, speed, a]) => {
      const img = this.portrait(CX, CY, kind, r);
      img.orbiting = true;
      items.push(img);
      return { img, r, rx, ry: rx * 0.3, speed, a, wob: Math.random() * 6 };
    });
    const tilt = -0.16;
    const step = (_t, delta) => {
      const dt = Math.min(delta, 40);
      for (const b of bodies) {
        if (!b.img.active) continue;
        b.a += b.speed * dt;
        b.wob += dt * 0.004;
        const ox = Math.cos(b.a) * b.rx;
        const oy = Math.sin(b.a) * b.ry;
        const front = Math.sin(b.a); // below the well = nearer to us
        const k = (1 + 0.16 * front) * (b.r / PORTRAIT_R) / TEX_SCALE;
        const q = Math.sin(b.wob) * 0.04;
        b.img.setPosition(CX + ox * Math.cos(tilt) - oy * Math.sin(tilt), CY + ox * Math.sin(tilt) + oy * Math.cos(tilt));
        b.img.setScale(k * (1 + q), k * (1 - q));
        b.img.setDepth(front > 0 ? 12 : 8).setAlpha((0.7 + (0.3 * (front + 1)) / 2) * this.homeAlpha);
      }
    };
    this.events.on('update', step);
    this.homeStep = step;
  },

  /** While a panel is open over the home screen, the menu under it steps back. */
  fadeHome(on) {
    if (!this.homeItems) return;
    this.homeAlpha = on ? 0.12 : 1;
    for (const o of this.homeItems) {
      if (!o.active || o.orbiting) continue;
      this.tweens.add({ targets: o, alpha: this.homeAlpha, duration: 180 });
    }
  },

  closeHome() {
    for (const o of this.homeItems || []) {
      this.tweens.killTweensOf(o);
      o.destroy();
    }
    if (this.homeStep) this.events.off('update', this.homeStep);
    this.homeStep = null;
    this.homeItems = null;
  },

  /** A game left unfinished, if it can still be continued. */
  savedGame() {
    const s = Meta.savedGame;
    return s && s.v === SAVE_VERSION && Array.isArray(s.pieces) ? s : null;
  },

  /** Starting over while a game is waiting to be continued: ask first. */
  confirmNewGame(mode) {
    if (!this.savedGame()) {
      this.startGame(mode);
      return;
    }
    const W = this.W;
    const items = this.panel(90, 440, W - 180, 420);
    const add = (o) => {
      items.push(o.setDepth(OVERLAY));
      return o;
    };
    const close = () => this.closePanel(items);
    add(this.text(W / 2, 512, 'START OVER?', 40).setOrigin(0.5));
    add(this.text(W / 2, 566, 'The game you left will be lost', 22, this.pal.light).setOrigin(0.5));
    items.push(
      this.button(W / 2, 656, 340, 70, mode === 'daily' ? 'PLAY DAILY' : 'NEW GAME', this.pal.button2, () => {
        close();
        Meta.clearSavedGame();
        this.startGame(mode);
      }, 26),
    );
    items.push(this.button(W / 2, 748, 340, 60, 'KEEP IT', 0x37b24d, close, 23));
  },

  /** Leave the home screen and play: a normal game or today's challenge, new or continued. */
  startGame(mode = 'normal', saved = null) {
    this.closeHome();
    this.setGameUi(true);
    this.mode = mode;
    if (mode === 'daily') {
      this.daily = dailyChallenge(saved ? saved.daily : todayKey());
      this.rule = this.daily.rule;
      this.rng = seededRandom(this.daily.seed);
    } else {
      this.daily = null;
      this.rule = null;
      this.rng = Math.random;
    }
    const rule = this.rule || {};
    this.gravityMul = rule.gravity || 1;
    this.spinMul = rule.spin || 1;
    this.ringScale = rule.ringScale || 1;
    if (rule.noBoosters) {
      for (const b of Object.values(this.boost)) {
        b.left = 0;
        b.got = 99; // and no ads for them either
      }
    }
    this.dailyReached = false;
    this.resetEvents();
    this.inGame = true;
    if (saved) this.restoreGame(saved);
    else {
      Meta.clearSavedGame(); // a new game replaces anything left over
      this.ringR = this.ringTarget();
      this.nextKind = this.rollNext();
      this.prepareHeld();
    }
    this.refreshBoosters();
    this.refreshGoal();
    this.saveAt = this.time.now + SAVE_EVERY_MS;
    if (this.hint) this.hint.setVisible(true);
  },

  // ---------- saving and continuing ----------

  /**
   * Keeps the game in progress, so it can be continued after going home or closing the app.
   * Called every few seconds, when the app goes to the background and when leaving to the home
   * screen. Losing ends a game for good: its save is gone the moment it is lost.
   */
  saveGame() {
    if (!this.inGame || this.hole || this.state === 'crunch' || this.state === 'over' || this.state === 'busy') return;
    const r1 = (v) => Math.round(v * 10) / 10;
    const r2 = (v) => Math.round(v * 100) / 100;
    const pieces = [];
    for (const p of this.pieces) {
      if (!p.body || !SAVED_KINDS(p.kind)) continue;
      const v = p.body.velocity;
      pieces.push([p.kind, r1(p.x), r1(p.y), r2(v.x), r2(v.y)]);
    }
    const boost = {};
    for (const [k, b] of Object.entries(this.boost)) boost[k] = [b.left, b.got];
    Meta.saveGame({
      v: SAVE_VERSION,
      mode: this.mode,
      daily: this.daily ? this.daily.date : null,
      rng: this.rng.getState ? this.rng.getState() : null,
      pieces,
      held: this.held ? this.held.kind : null,
      next: this.nextKind,
      runMax: this.runMax,
      universe: this.universe,
      universeMax: this.universeMax,
      biggest: this.biggest,
      reviveRing: this.reviveRing,
      revived: this.revived,
      boost,
      worldRot: r2(this.worldRot),
      playMs: Math.round(this.playMs),
      nextEventAt: Math.round(this.nextEventAt),
      runGems: this.runGems,
      newRecord: this.newRecord,
      dailyReached: this.dailyReached,
      lastWasSpecial: this.lastWasSpecial,
    });
  },

  /** Puts a saved game back exactly as it was left (moving planets keep moving). */
  restoreGame(s) {
    if (s.rng != null && this.rng.setState) this.rng.setState(s.rng);
    this.runMax = s.runMax;
    this.universe = s.universe || 1;
    this.universeMax = s.universeMax || 0;
    this.biggest = s.biggest || 0;
    this.reviveRing = s.reviveRing || 0;
    this.revived = !!s.revived;
    for (const [k, [left, got]] of Object.entries(s.boost || {})) {
      if (this.boost[k]) Object.assign(this.boost[k], { left, got });
    }
    if (this.premium) this.applyPremium(); // bought since: top every booster up
    this.worldRot = s.worldRot || 0;
    this.playMs = s.playMs || 0;
    if (s.nextEventAt) this.nextEventAt = s.nextEventAt;
    this.runGems = s.runGems || 0;
    this.newRecord = !!s.newRecord;
    this.dailyReached = !!s.dailyReached;
    this.lastWasSpecial = !!s.lastWasSpecial;
    this.ringR = this.ringTarget();
    this.restoring = true; // no discoveries, ring growth or goals while the field is put back
    for (const [kind, x, y, vx, vy] of s.pieces) {
      const p = this.spawnPiece(x, y, kind);
      this.matter.body.setVelocity(p.body, { x: vx, y: vy });
      p.born = -1e9;
      p.pop = 1;
      p.pv = 0;
    }
    this.restoring = false;
    this.calmUntil = this.time.now + 2000; // a moment to look before any countdown can start
    this.refreshUniverse();
    this.nextKind = s.next;
    if (s.held !== null && s.held !== undefined) {
      this.setHeld(s.held);
      this.refreshNext();
      this.state = 'aim';
    } else {
      this.prepareHeld();
    }
  },

  // ---------- pause ----------

  openPause() {
    if (this.state !== 'aim' && this.state !== 'flying') return;
    const resume = this.holdGame();
    Sfx.click();
    const W = this.W;
    const items = this.panel(100, 320, W - 200, 540);
    const add = (o) => {
      items.push(o.setDepth(OVERLAY));
      return o;
    };
    add(this.text(W / 2, 388, 'PAUSED', 46).setOrigin(0.5));
    items.push(
      this.button(W / 2, 486, 380, 76, '▶  RESUME', 0x37b24d, () => this.closePanel(items, resume), 30, { breathe: true }),
    );
    items.push(this.button(W / 2, 580, 380, 60, 'RESTART', this.pal.button2, () => this.leaveGame(true), 24));
    items.push(this.button(W / 2, 660, 380, 60, 'HOME', this.pal.button, () => this.leaveGame(false), 24));
    // settings that last between games
    const toggle = (x, name, key, apply) => {
      const label = () => `${name}: ${store.get(key, true) ? 'ON' : 'OFF'}`;
      items.push(
        this.button(x, 768, 184, 52, label(), this.pal.button, (c, text) => {
          const on = !store.get(key, true);
          store.set(key, on);
          apply(on);
          text.setText(label());
        }, 18),
      );
    };
    toggle(W / 2 - 96, 'SOUND', 'jd3_sound', (on) => Sfx.setMuted(!on));
    toggle(W / 2 + 96, 'VIBRATION', 'jd3_vibe', (on) => Haptics.setEnabled(on));
  },

  /** From the pause menu: HOME keeps the game to continue later; RESTART starts a new one. */
  async leaveGame(again) {
    if (this.state !== 'paused') return;
    if (again) {
      this.state = 'busy';
      Meta.clearSavedGame();
      await Ads.betweenGames();
      this.scene.restart({ play: true, mode: this.mode });
      return;
    }
    this.saveGame();
    this.inGame = false;
    this.state = 'busy';
    this.scene.restart({});
  },

  // ---------- the daily challenge ----------

  refreshGoal() {
    if (this.mode !== 'daily') {
      this.goalText.setVisible(false);
      return;
    }
    const g = this.daily.goal;
    const name = this.seen.includes(g) ? `make a ${TIERS[g].name}` : `reach body no. ${g + 1}`;
    this.goalText.setVisible(true).setText(`GOAL: ${name}${this.dailyReached ? '  ✓' : ''}`);
  },

  /** A body was made: in the daily challenge, check the goal. */
  checkDailyGoal(tier) {
    if (this.mode !== 'daily' || this.dailyReached || tier < this.daily.goal || tier >= HOLE) return;
    this.dailyReached = true;
    if (this.daily.date !== todayKey()) {
      this.banner('GOAL REACHED', 'That day’s challenge is over', '#8ce99a');
    } else {
      const rec = Meta.daily(this.daily.date);
      if (!rec.done) {
        rec.done = true;
        Meta.saveDaily(rec);
        this.gainGemsAt(this.daily.reward, this.W / 2, 330);
        this.banner('DAILY COMPLETE!', `+${this.daily.reward} diamonds`, '#9ff3ff');
        Haptics.success();
      } else {
        this.banner('DAILY GOAL REACHED', "Today's reward is already yours", '#8ce99a');
      }
    }
    this.refreshGoal();
  },

  openDaily() {
    const W = this.W;
    const daily = dailyChallenge();
    const rec = Meta.daily(daily.date);
    const items = this.panel(70, 250, W - 140, 720);
    const add = (o) => {
      items.push(o.setDepth(OVERLAY));
      return o;
    };
    const close = () => this.closePanel(items);
    add(this.text(W / 2, 312, 'DAILY CHALLENGE', 40).setOrigin(0.5));
    add(this.text(W / 2, 360, daily.date, 20, this.pal.soft).setOrigin(0.5));
    add(this.text(W / 2, 450, daily.rule.name, 46, '#ffcf8a').setOrigin(0.5));
    add(this.text(W / 2, 506, daily.rule.text, 22, this.pal.light).setOrigin(0.5));
    const g = daily.goal;
    const goal = this.seen.includes(g) ? `Make a ${TIERS[g].name}` : `Reach body no. ${g + 1} of the chain`;
    add(this.text(W / 2, 572, `Goal: ${goal}`, 24).setOrigin(0.5));
    add(this.text(W / 2, 618, 'Same planets, same order for everyone today', 18, this.pal.faint).setOrigin(0.5));
    if (rec.done) {
      add(this.text(W / 2, 672, 'Done today ✓', 26, '#8ce99a').setOrigin(0.5));
    } else {
      const label = add(this.text(W / 2 + 18, 672, `Reward: ${daily.reward}`, 26, '#9ff3ff').setOrigin(0.5));
      add(this.add.image(label.x + label.width / 2 + 22, 672, 'gem').setScale(0.6 / TEX_SCALE));
    }
    items.push(
      this.button(W / 2, 776, 380, 78, '▶  PLAY', 0xf08c2e, () => {
        close();
        this.confirmNewGame('daily');
      }, 32, { breathe: true }),
    );
    items.push(this.button(W / 2, 876, 240, 58, 'CLOSE', this.pal.button2, close, 22));
  },

  // ---------- the shop ----------

  /** tab: 'skin' (planets), 'theme' (backgrounds) or 'gems' (diamond packs). */
  openShop(tab = 'skin', pop = true) {
    const W = this.W;
    const items = this.panel(28, 132, W - 56, 1030, pop);
    const add = (o) => {
      items.push(o.setDepth(OVERLAY));
      return o;
    };
    const close = () => {
      this.closePanel(items);
      this.previewJobs = [];
    };
    const reopen = (t = tab) => {
      items.forEach((o) => o.destroy());
      this.panelGone();
      this.previewJobs = [];
      this.openShop(t, false);
    };
    add(this.text(W / 2, 186, 'SHOP', 42).setOrigin(0.5));
    const tabs = [['skin', 'PLANETS'], ['theme', 'SKIES'], ['gems', 'DIAMONDS']];
    const tabBtns = {};
    tabs.forEach(([id, label], i) => {
      const b = this.button(W / 2 + (i - 1) * 206, 256, 192, 52, label, this.pal.button, () => id !== tab && reopen(id), 19, { fill: id === tab ? 1.9 : 0.7 });
      if (id !== tab) b.label.setAlpha(0.7);
      tabBtns[id] = b;
      items.push(b);
    });
    const ctx = { items, add, close, reopen, tabBtns };
    if (tab === 'gems') this.shopGems(ctx);
    else this.shopLooks(tab, ctx);
    items.push(this.button(W / 2, 1090, 240, 56, 'CLOSE', this.pal.button2, close, 22));
  },

  /** A row in the shop: a card with a picture on the left, a name, a line about it and a button. */
  shopRow(ctx, y, h, highlight) {
    const W = this.W;
    const g = ctx.add(this.add.graphics());
    g.fillStyle(highlight ? this.pal.cardOn : this.pal.card, highlight ? 0.55 : 0.42);
    g.fillRoundedRect(48, y - h / 2, W - 96, h, 20);
    g.lineStyle(1.5, highlight ? 0x8ce99a : 0xffffff, highlight ? 0.9 : 0.12);
    g.strokeRoundedRect(48, y - h / 2, W - 96, h, 20);
  },

  /** A buy button showing a diamond and the price. */
  priceButton(x, y, price, onTap) {
    const b = this.button(x, y, 128, 48, String(price), 0x3d9be9, onTap, 21);
    b.label.x = 14;
    b.add(this.add.image(-34, 0, 'gem').setScale(0.55 / TEX_SCALE));
    return b;
  },

  shopLooks(type, ctx) {
    const W = this.W;
    const list = type === 'skin' ? SKINS : THEMES;
    const top = 352;
    const rowH = 132;
    this.previewJobs = [];
    list.forEach((def, i) => {
      const y = top + i * (rowH + 12);
      const owned = Meta.owns(type, def.id);
      const inUse = Meta.using(type) === def.id;
      this.shopRow(ctx, y, rowH, inUse);
      if (type === 'skin') {
        // two bodies in the skin: a planet and a ringed one; drawn a moment later, one by one
        [[4, 92, 26], [7, 178, 20]].forEach(([kind, x, R]) => {
          const pic = ctx.add(this.add.image(x, y, 'dot').setVisible(false));
          this.previewJobs.push(() => {
            if (!pic.active) return;
            pic.setTexture(skinPreview(this, def.id, kind, R)).setScale(1 / TEX_SCALE).setVisible(true);
          });
        });
      } else {
        const key = skyPreview(this, def, 150, 100);
        ctx.add(this.add.image(130, y, key).setScale(1 / TEX_SCALE));
        const frame = ctx.add(this.add.graphics());
        frame.lineStyle(2, 0xffffff, 0.35);
        frame.strokeRoundedRect(55, y - 50, 150, 100, 10);
      }
      ctx.add(this.text(234, y - 30, def.name, 26).setOrigin(0, 0.5));
      ctx.add(this.text(234, y + 16, def.text, 16, this.pal.soft).setOrigin(0, 0.5).setWordWrapWidth(272));
      const bx = W - 128;
      if (inUse) {
        const b = this.button(bx, y, 128, 48, 'IN USE', 0x2f9e44, () => {}, 18);
        ctx.items.push(b);
      } else if (owned) {
        ctx.items.push(this.button(bx, y, 128, 48, 'USE', this.pal.button2, () => this.useLook(type, def.id), 20));
      } else {
        ctx.items.push(
          this.priceButton(bx, y, def.price, () => {
            if (!Meta.spendGems(def.price)) {
              this.floatText(bx - 40, y - 46, 'Not enough diamonds', '#ff9fb2', 22);
              Sfx.bonk();
              this.jelly.pop(ctx.tabBtns.gems, 0.12);
              return;
            }
            Meta.own(type, def.id);
            Sfx.unlock();
            Haptics.success();
            this.useLook(type, def.id);
          }),
        );
      }
    });
    // the skin pictures are drawn one at a time, so opening the shop never stalls
    if (this.previewJobs.length) {
      this.time.addEvent({
        delay: 30,
        repeat: this.previewJobs.length - 1,
        callback: () => {
          const job = this.previewJobs && this.previewJobs.shift();
          if (job) job();
        },
      });
    }
  },

  /** Wear a skin or background: the scene starts again in it, with the shop still open. */
  useLook(type, id) {
    const oldSkin = this.skin.id;
    Meta.use(type, id);
    this.applyLooks();
    if (type === 'skin' && oldSkin !== this.skin.id) dropSkinTextures(this, oldSkin);
    this.scene.restart({ shop: type });
  },

  shopGems(ctx) {
    const W = this.W;
    ctx.add(this.add.image(W / 2 - 70, 352, 'gem').setScale(1.3 / TEX_SCALE));
    const balance = ctx.add(this.text(W / 2 - 34, 354, Meta.gems.toLocaleString('en-US'), 44, '#9ff3ff').setOrigin(0, 0.5));
    GEM_PACKS.forEach((pack, i) => {
      const y = 492 + i * 150;
      this.shopRow(ctx, y, 134, false);
      // a little heap of diamonds, bigger for bigger packs
      const heap = [[0, 0]].concat(i >= 1 ? [[-22, 14], [22, 14]] : []).concat(i >= 2 ? [[-12, -14], [14, -16], [0, 22]] : []);
      heap.forEach(([dx, dy]) => ctx.add(this.add.image(126 + dx, y + dy, 'gem').setScale((i ? 0.85 : 1.1) / TEX_SCALE)));
      ctx.add(this.text(220, y - 22, `${pack.gems} diamonds`, 28).setOrigin(0, 0.5));
      if (pack.bonus) ctx.add(this.text(220, y + 18, `${pack.bonus} extra`, 20, '#8ce99a').setOrigin(0, 0.5));
      ctx.items.push(
        this.button(W - 128, y, 146, 52, pack.price, 0x37b24d, async () => {
          const ok = await Ads.purchaseGems(pack);
          if (!ok || !balance.active) return;
          this.gainGemsAt(pack.gems, W - 128, y);
          balance.setText(Meta.gems.toLocaleString('en-US'));
          this.tweens.add({ targets: balance, scale: { from: 1.25, to: 1 }, duration: 300, ease: 'Back.out' });
          Haptics.success();
        }, 24),
      );
    });
    ctx.add(
      this.text(W / 2, 948, 'Diamonds also drop now and then when planets merge.\nThe bigger the planet, the better the chance.', 19, this.pal.soft)
        .setOrigin(0.5)
        .setAlign('center'),
    );
  },
};

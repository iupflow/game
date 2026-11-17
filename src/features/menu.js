// The home screen, the shop and the daily challenge, plus stardust (the coin), skins and themes.
// Mixed into GameScene, so `this` is the scene.
import { Sfx } from '../sfx.js';
import { Haptics } from '../haptics.js';
import { Meta } from '../meta.js';
import { Ads, store } from '../ads.js';
import { SKINS, THEMES, skinById, themeById, applyPageTheme } from '../themes.js';
import { dailyChallenge, seededRandom } from '../daily.js';
import { TIERS, HOLE, TEX_SCALE, FACE_R } from '../art.js';

const OVERLAY = 100;
const UI = 50;
const COINS_PER_POINTS = 150; // a game pays one stardust for every this many points

export const MenuMixin = {
  // ---------- stardust ----------

  buildCoins() {
    const W = this.W;
    // stardust: under the score; the daily goal and the current event: under the pause button
    this.coinIcon = this.add.image(54, 165, 'coin').setScale(0.75 / TEX_SCALE).setDepth(UI + 1);
    this.coinText = this.text(74, 165, '', 24, '#ffe08a').setOrigin(0, 0.5).setDepth(UI + 1);
    this.goalText = this.text(W / 2, 112, '', 18, '#ffcf8a').setOrigin(0.5).setDepth(UI + 1).setVisible(false);
    this.eventLabel = this.text(W / 2, 138, '', 18, '#ffffff').setOrigin(0.5).setDepth(UI + 1).setVisible(false);
    this.refreshCoins();
  },

  /** The wallet plus what has been picked up in this game and not banked yet. */
  refreshCoins(pop = false) {
    this.coinText.setText((Meta.coins + this.runCoins - this.runCoinsBanked).toLocaleString('en-US'));
    if (pop) {
      this.tweens.add({ targets: this.coinText, scale: { from: 1.3, to: 1 }, duration: 220, ease: 'Back.out' });
      this.tweens.add({ targets: this.coinIcon, scale: { from: 1.1 / TEX_SCALE, to: 0.75 / TEX_SCALE }, duration: 220, ease: 'Back.out' });
    }
  },

  /** Stardust picked up in a game, floating up from a point on the screen. */
  gainCoinsAt(n, sx, sy) {
    this.runCoins += n;
    this.floatText(sx, sy - 20, `+${n} ✦`, '#ffe08a', 26);
    this.refreshCoins(true);
    Sfx.coin();
  },

  gainCoins(n, fx, fy) {
    const at = this.toScreen(fx, fy);
    this.gainCoinsAt(n, at.x, at.y);
  },

  /**
   * At game over everything earned so far goes into the wallet: what was picked up, plus one
   * stardust per COINS_PER_POINTS points. After a revive only what is new is added. Returns the
   * total earned in this game.
   */
  bankCoins() {
    const earned = this.runCoins + Math.floor(this.score / COINS_PER_POINTS);
    Meta.addCoins(earned - this.coinsBanked);
    this.coinsBanked = earned;
    this.runCoinsBanked = this.runCoins;
    this.refreshCoins();
    return earned;
  },

  // ---------- looks ----------

  applyLooks() {
    this.skin = skinById(Meta.using('skin'));
    this.theme = themeById(Meta.using('theme'));
    applyPageTheme(this.theme);
  },

  /** A planet in the chosen skin: a colour filter, or a face. */
  dress(p) {
    if (p.tier < 0 || p.tier >= HOLE) return;
    if (this.skin.tint) p.tint = this.skin.tint;
    if (this.skin.face) p.addFace();
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
    this.setGameUi(false);
    if (this.hint) this.hint.setVisible(false);
    const items = (this.homeItems = []);
    const add = (o) => {
      items.push(o.setDepth(OVERLAY));
      return o;
    };
    add(this.add.rectangle(W / 2, this.H / 2, W * 3, this.H * 3, 0x05020f, 0.35));
    const title = add(this.text(W / 2, 300, 'JELLY DROP', 78, '#ffffff').setOrigin(0.5).setStroke('#3a2490', 12));
    this.tweens.add({ targets: title, scale: { from: 1, to: 1.04 }, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    add(this.text(W / 2, 374, 'Merge planets. Grow the universe.', 24, '#d6ccff').setOrigin(0.5));
    add(this.text(W / 2, 430, `BEST  ${this.best.toLocaleString('en-US')}`, 24, '#ffd93d').setOrigin(0.5));

    items.push(this.button(W / 2, 800, 440, 104, '▶  PLAY', 0x37b24d, () => this.startGame('normal'), 42));
    const daily = dailyChallenge();
    const rec = Meta.daily(daily.date);
    items.push(this.button(W / 2, 924, 440, 84, 'DAILY CHALLENGE', 0xf08c2e, () => this.openDaily(), 30));
    add(this.text(W / 2, 980, `${daily.rule.name}  ·  ${rec.done ? 'done today ✓' : `+${daily.reward} ✦`}`, 20, rec.done ? '#8ce99a' : '#ffcf8a').setOrigin(0.5));
    items.push(this.button(W / 2 - 112, 1062, 208, 76, 'SHOP', 0x7a4fd8, () => this.openShop(), 28));
    items.push(this.button(W / 2 + 112, 1062, 208, 76, 'ALBUM', 0x4c6ef5, () => this.openAlbum(), 28));
    if (!this.premium) {
      items.push(
        this.button(W / 2, 1160, 440, 60, 'No Ads + Max Boosters  $2.99', 0x5a3aa8, async () => {
          if (this.premium) return;
          if (await Ads.purchasePremium()) {
            this.applyPremium();
            this.closeHome();
            this.showHome();
          }
        }, 22),
      );
    }
  },

  closeHome() {
    for (const o of this.homeItems || []) {
      this.tweens.killTweensOf(o);
      o.destroy();
    }
    this.homeItems = null;
  },

  /** Leave the home screen and play: a normal game, or today's challenge. */
  startGame(mode = 'normal') {
    this.closeHome();
    this.setGameUi(true);
    this.mode = mode;
    if (mode === 'daily') {
      this.daily = dailyChallenge();
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
    this.ringR = this.ringTarget();
    if (rule.noBoosters) {
      for (const b of Object.values(this.boost)) {
        b.left = 0;
        b.got = 99; // and no ads for them either
      }
    }
    this.refreshBoosters();
    this.dailyReached = false;
    this.refreshGoal();
    this.resetEvents();
    const next = this.rollNext();
    this.nextKind = next.kind;
    this.nextGolden = next.golden;
    this.prepareHeld();
    if (this.hint) this.hint.setVisible(true);
  },

  // ---------- pause ----------

  openPause() {
    if (this.state !== 'aim' && this.state !== 'flying') return;
    const resume = this.holdGame();
    Sfx.click();
    const W = this.W;
    const items = this.panel(90, 300, W - 180, 620);
    const add = (o) => {
      items.push(o.setDepth(OVERLAY));
      return o;
    };
    add(this.text(W / 2, 372, 'PAUSED', 50).setOrigin(0.5));
    items.push(
      this.button(W / 2, 486, 400, 92, '▶  RESUME', 0x37b24d, () => {
        items.forEach((o) => o.destroy());
        resume();
      }, 34),
    );
    items.push(this.button(W / 2, 598, 400, 76, 'RESTART', 0x4c6ef5, () => this.leaveGame(true), 28));
    items.push(this.button(W / 2, 694, 400, 76, 'HOME', 0x3b5bdb, () => this.leaveGame(false), 28));
    // settings that last between games
    const toggle = (x, name, key, apply) => {
      const label = () => `${name}: ${store.get(key, true) ? 'ON' : 'OFF'}`;
      items.push(
        this.button(x, 818, 196, 64, label(), 0x6741d9, (c, text) => {
          const on = !store.get(key, true);
          store.set(key, on);
          apply(on);
          text.setText(label());
        }, 21),
      );
    };
    toggle(W / 2 - 104, 'SOUND', 'jd3_sound', (on) => Sfx.setMuted(!on));
    toggle(W / 2 + 104, 'VIBRATION', 'jd3_vibe', (on) => Haptics.setEnabled(on));
  },

  /** Leave a game from the pause menu: what was earned is kept; then a new game, or home. */
  async leaveGame(again) {
    if (this.state !== 'paused') return;
    this.state = 'busy';
    this.bankCoins();
    this.saveDailyBest();
    await Ads.betweenGames();
    this.scene.restart(again ? { play: true, mode: this.mode } : {});
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
    const rec = Meta.daily(this.daily.date);
    if (!rec.done) {
      rec.done = true;
      Meta.saveDaily(rec);
      this.gainCoinsAt(this.daily.reward, this.W / 2, 240);
      this.banner('DAILY COMPLETE!', `+${this.daily.reward} stardust`, '#ffd93d');
      Haptics.success();
    } else {
      this.banner('DAILY GOAL REACHED', "Today's reward is already yours", '#8ce99a');
    }
    this.refreshGoal();
  },

  /** At game over: today's best score in the challenge. */
  saveDailyBest() {
    if (this.mode !== 'daily') return;
    const rec = Meta.daily(this.daily.date);
    if (this.score > rec.best) {
      rec.best = this.score;
      Meta.saveDaily(rec);
    }
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
    const close = () => items.forEach((o) => o.destroy());
    add(this.text(W / 2, 312, 'DAILY CHALLENGE', 40).setOrigin(0.5));
    add(this.text(W / 2, 360, daily.date, 20, '#b9a8e6').setOrigin(0.5));
    add(this.text(W / 2, 450, daily.rule.name, 46, '#ffcf8a').setOrigin(0.5));
    add(this.text(W / 2, 506, daily.rule.text, 22, '#e6deff').setOrigin(0.5));
    const g = daily.goal;
    const goal = this.seen.includes(g) ? `Make a ${TIERS[g].name}` : `Reach body no. ${g + 1} of the chain`;
    add(this.text(W / 2, 572, `Goal: ${goal}`, 24).setOrigin(0.5));
    add(this.text(W / 2, 618, 'Same planets, same order for everyone today', 18, '#9f8fd0').setOrigin(0.5));
    add(
      this.text(W / 2, 668, rec.done ? `Done today ✓   ·   best ${rec.best.toLocaleString('en-US')}` : `Reward: +${daily.reward} ✦ stardust`, 24, rec.done ? '#8ce99a' : '#ffe08a').setOrigin(0.5),
    );
    items.push(
      this.button(W / 2, 780, 400, 96, '▶  PLAY', 0xf08c2e, () => {
        close();
        this.startGame('daily');
      }, 38),
    );
    items.push(this.button(W / 2, 892, 260, 68, 'CLOSE', 0x4c6ef5, close, 26));
  },

  // ---------- the shop ----------

  openShop() {
    const W = this.W;
    const items = this.panel(40, 150, W - 80, 980);
    const add = (o) => {
      items.push(o.setDepth(OVERLAY));
      return o;
    };
    const close = () => items.forEach((o) => o.destroy());
    const reopen = () => {
      close();
      this.openShop();
    };
    add(this.text(W / 2, 208, 'SHOP', 44).setOrigin(0.5));
    add(this.add.image(W / 2 - 40, 262, 'coin').setScale(0.85 / TEX_SCALE));
    add(this.text(W / 2 - 18, 262, Meta.coins.toLocaleString('en-US'), 28, '#ffe08a').setOrigin(0, 0.5));

    const card = (type, def, x, y, drawPreview) => {
      const owned = Meta.owns(type, def.id);
      const inUse = Meta.using(type) === def.id;
      const bg = add(this.add.graphics());
      bg.fillStyle(inUse ? 0x3d2a85 : 0x1b0e3d, 1);
      bg.fillRoundedRect(x - 68, y - 100, 136, 214, 22);
      if (inUse) {
        bg.lineStyle(4, 0x8ce99a, 1);
        bg.strokeRoundedRect(x - 68, y - 100, 136, 214, 22);
      }
      drawPreview(x, y - 38);
      add(this.text(x, y + 30, def.name, 17).setOrigin(0.5));
      const label = inUse ? 'IN USE' : owned ? 'USE' : `✦ ${def.price}`;
      const color = inUse ? 0x2f9e44 : owned ? 0x4c6ef5 : 0xe0a020;
      items.push(
        this.button(x, y + 78, 118, 46, label, color, () => {
          if (inUse) return;
          if (!owned) {
            if (!Meta.spend(def.price)) {
              this.floatText(x, y - 40, 'Not enough stardust', '#ff9fb2', 22);
              Sfx.bonk();
              return;
            }
            Meta.own(type, def.id);
            Sfx.unlock();
            Haptics.success();
          }
          Meta.use(type, def.id);
          this.applyLooks();
          if (type === 'theme') this.drawBackground();
          this.refreshCoins();
          reopen();
        }, 20),
      );
    };

    add(this.text(W / 2, 330, 'PLANETS', 24, '#cfc4ff').setOrigin(0.5));
    SKINS.forEach((skin, i) => {
      card('skin', skin, W / 2 + (i - 1.5) * 150, 470, (x, y) => {
        const pic = add(this.portrait(x, y, 4, 40));
        if (skin.tint) pic.setTint(skin.tint);
        if (skin.face) add(this.add.image(x, y, 'face_happy').setScale((40 * 1.04) / FACE_R / TEX_SCALE));
      });
    });
    add(this.text(W / 2, 640, 'BACKGROUNDS', 24, '#cfc4ff').setOrigin(0.5));
    THEMES.forEach((theme, i) => {
      card('theme', theme, W / 2 + (i - 1.5) * 150, 780, (x, y) => {
        const g = add(this.add.graphics());
        g.fillGradientStyle(theme.top, theme.top, theme.bottom, theme.bottom, 1);
        g.fillRect(x - 54, y - 36, 108, 72);
        theme.glows.forEach((c, k) => {
          g.fillStyle(c, 0.45);
          g.fillCircle(x - 30 + k * 30, y - 8 + (k % 2) * 16, 14);
        });
        g.fillStyle(0xffffff, 0.8);
        for (let k = 0; k < 7; k++) g.fillCircle(x - 48 + ((k * 37) % 96), y - 30 + ((k * 23) % 60), 1.2);
      });
    });
    add(this.text(W / 2, 948, 'Earn stardust by playing: every game, golden planets, golden comets', 18, '#9f8fd0').setOrigin(0.5));
    items.push(this.button(W / 2, 1040, 260, 68, 'CLOSE', 0x4c6ef5, close, 26));
  },
};

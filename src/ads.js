// Ad + purchase layer.
// In the browser this shows placeholder overlays so the game flow can be tested.
// When packaging with Capacitor, replace the three "platform" functions below
// with real SDK calls (e.g. AdMob / AppLovin MAX and the store billing plugin).

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable: keep running without persistence */
    }
  },
};

const INTERSTITIAL_EVERY = 3; // show one every N finished games
const INTERSTITIAL_GRACE = 3; // never during the first N games

function placeholderAd({ title, seconds, skippable }) {
  const fast = typeof window !== 'undefined' && window.__FAST_ADS;
  const total = fast ? 0.1 : seconds;
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;inset:0;z-index:9999;background:#000d;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;color:#fff;font:600 20px system-ui,sans-serif;gap:16px;text-align:center;';
    const label = document.createElement('div');
    label.textContent = title;
    const count = document.createElement('div');
    count.style.cssText = 'font-size:48px;font-weight:800;';
    const note = document.createElement('div');
    note.style.cssText = 'font-size:13px;opacity:.6;font-weight:400;';
    note.textContent = 'Ad placeholder (real ads appear in the store build)';
    el.append(label, count, note);
    let close = null;
    if (skippable) {
      close = document.createElement('button');
      close.textContent = 'Skip';
      close.style.cssText =
        'margin-top:8px;padding:10px 28px;border-radius:999px;border:0;font:600 16px system-ui;';
      close.onclick = () => finish(false);
      el.append(close);
    }
    document.body.append(el);
    const started = performance.now();
    const timer = setInterval(() => {
      const left = total - (performance.now() - started) / 1000;
      count.textContent = String(Math.max(0, Math.ceil(left)));
      if (left <= 0) finish(true);
    }, 50);
    function finish(completed) {
      clearInterval(timer);
      el.remove();
      resolve(completed);
    }
  });
}

// ---- platform functions (swap these for real SDK calls) ----
const platform = {
  showInterstitial: () => placeholderAd({ title: 'Advertisement', seconds: 3, skippable: false }),
  showRewarded: () => placeholderAd({ title: 'Watch to earn your reward', seconds: 4, skippable: true }),
  purchaseRemoveAds: async () => window.__TEST_PURCHASE || window.confirm('Remove ads for $2.99? (test purchase, no charge)'),
};

export const Ads = {
  get removed() {
    return store.get('jd_noads', false);
  },

  /** Call when a game ends and the player starts another. Resolves when play may continue. */
  async betweenGames() {
    const played = store.get('jd_games', 0) + 1;
    store.set('jd_games', played);
    if (this.removed) return;
    if (played <= INTERSTITIAL_GRACE) return;
    if (played % INTERSTITIAL_EVERY !== 0) return;
    await platform.showInterstitial();
  },

  /** Rewarded video. Resolves true only if the player watched to the end. */
  showRewarded() {
    return platform.showRewarded();
  },

  /** One-time purchase that disables interstitials. Rewarded ads stay available. */
  async purchaseRemoveAds() {
    if (this.removed) return true;
    const ok = await platform.purchaseRemoveAds();
    if (ok) store.set('jd_noads', true);
    return ok;
  },
};

export { store };

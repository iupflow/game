# Jelly Drop

A lightweight drop-and-merge physics game prototype (Phaser 3 + Vite), intended to be
packaged for iOS and Android with Capacitor.

## Run

```
npm install
npm run dev      # development server
npm run build    # production build in dist/
```

## Structure

- `src/GameScene.js` – gameplay: aiming, dropping, merging, scoring, game over, revive
- `src/ads.js` – ad and purchase layer. Uses placeholder overlays in the browser;
  replace the `platform` functions with real SDK calls for the store build
- `src/sfx.js` – synthesized sound effects

## Monetization flow

- Rewarded ad: one revive per game
- Interstitial: every 3rd game, never during the first 3 games
- "Remove Ads" purchase: disables interstitials, rewarded ads stay available

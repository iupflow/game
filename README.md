# Jelly Drop

A lightweight aim-and-merge physics game prototype (Phaser 3 + Vite), intended to be
packaged for iOS and Android with Capacitor.

Drag to aim, release to shoot a jelly into the jar. Two of the same kind merge into
the next creature in a 12-step chain. Jellies are drawn as soft bodies: they squash
against each other and wobble on impact.

## Run

```
npm install
npm run dev      # development server
npm run build    # production build in dist/
```

## Structure

- `src/GameScene.js` – gameplay: aiming, shooting, merging, boosters, album, game over
- `src/Blob.js` – one jelly: physics circle plus the soft-body outline drawn each frame
- `src/art.js` – the creature chain and all procedural art (no image files)
- `src/ads.js` – ad and purchase layer. Uses placeholder overlays in the browser;
  replace the `platform` functions with real SDK calls for the store build
- `src/haptics.js` – vibration (Capacitor Haptics in the store build, browser fallbacks)
- `src/sfx.js` – synthesized sound effects

## Game systems

- Album: every new creature is recorded; unknown ones show as silhouettes
- Wild Star: merging charges a meter; when full, the next shot upgrades whatever it hits
- Boosters: one bomb and one jar shake per game, more through rewarded ads
- Swap: tap the NEXT jelly to exchange it with the one in the launcher

## Monetization flow

- Rewarded ad: one revive per game, extra boosters
- Interstitial: every 3rd game, never during the first 3 games
- "Remove Ads" purchase: disables interstitials, rewarded ads stay available

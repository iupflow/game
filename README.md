# Jelly Drop (working title)

A lightweight merge game prototype (Phaser 3 + Vite), intended to be packaged for
iOS and Android with Capacitor.

A gravity well sits in the middle of the screen. Slide a finger around the outer ring
to choose where the next planet comes from, release to launch it inward. Two of the
same kind merge into the next body in a 12-step chain that runs from an asteroid to a
supernova. Two supernovas collapse into a black hole, which swallows the whole field
and starts a new universe with a higher score multiplier.

## Run

```
npm install
npm run dev      # development server
npm run build    # production build in dist/
```

## Structure

- `src/GameScene.js` – gameplay: radial gravity, launching, merging, boosters, the
  black hole sequence, album, game over
- `src/Planet.js` – one planet: a hard physics core wrapped in a springy skin, plus
  the springs that make its picture squash, stretch and wobble
- `src/PlanetBatch.js` – draws planets as deforming textured meshes (WebGL)
- `src/art.js` – the chain and all procedural art (no image files)
- `src/ads.js` – ad and purchase layer. Uses placeholder overlays in the browser;
  replace the `platform` functions with real SDK calls for the store build
- `src/haptics.js` – vibration (Capacitor Haptics in the store build, browser fallbacks)
- `src/sfx.js` – synthesized sound effects

## Game systems

- Soft bodies: planets sink into each other on impact and bounce back; the whole
  surface deforms, not only the outline
- Album: every new body is recorded; unknown ones show as silhouettes
- Comet: merging charges a meter; when full, the next shot upgrades whatever it hits
- Boosters: one bomb and one shake per game, more through rewarded ads
- Swap: tap the NEXT planet to exchange it with the one waiting on the ring
- The field slowly rotates, so timing matters

## Monetization flow

- Rewarded ad: one revive per game, extra boosters
- Interstitial: every 3rd game, never during the first 3 games
- "Remove Ads" purchase: disables interstitials, rewarded ads stay available

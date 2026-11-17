# Jelly Drop (working title)

A lightweight merge game prototype (Phaser 3 + Vite), intended to be packaged for
iOS and Android with Capacitor.

A gravity well sits in the middle of the screen. Tap to drop the next planet from that
side of the outer orbit and let gravity pull it in, or press anywhere and pull back like
a slingshot: the direction of the pull picks where on the orbit the planet starts, and
the length of the pull sets how hard it is launched toward the centre. Full power is
always reachable before the finger meets the edge of the screen. Two of the
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
- `src/art.js` – the chain and all procedural art (no image files). Planet surfaces are
  rendered per pixel as softly textured spheres in a gentle, stylised palette; a separate
  light layer adds a rim glow and a glossy highlight (no dark side) and stays fixed while
  planets turn. The small bodies are textured before the first frame, the big ones in the
  background
- `src/ads.js` – ad and purchase layer. Uses placeholder overlays in the browser;
  replace the `platform` functions with real SDK calls for the store build
- `src/haptics.js` – vibration (Capacitor Haptics in the store build, browser fallbacks)
- `src/sfx.js` – synthesized sound (Web Audio, no files): a different merge sound for every
  planet, all on one pentatonic scale so merges and combos sound musical, plus a compressor
  and a small reverb

## Game systems

- Power: a short pull rolls a planet in gently, a long pull slams it into the
  cluster and knocks planets around. Launched planets fly without drag, so the power
  you pull is the power that lands
- Weight: every hit squashes both planets, split by weight. A light planet hitting a
  heavy one flattens itself and barely dents the heavy one, and the other way round
- Soft bodies: planets sink into each other on impact and bounce back; the whole
  surface deforms, not only the outline
- A planet that reaches the centre without touching anything is caught by the well
  and eases to rest there
- Album: every new body is recorded; unknown ones show as silhouettes
- Comet: merging charges a meter; when full, the next shot upgrades the planet it
  hits. It cannot upgrade the biggest planet on the field (it bounces off, and the aim
  line turns red beforehand), and each comet costs more charge than the last, so
  comets help smaller planets catch up but cannot carry one planet to a black hole
- Orbital laser booster: pick any planet and a satellite vaporizes it
- Smash booster: a deep-black ball of dark matter crashes in like a billiards break shot.
  Every planet flies apart, bouncing off each other and off the screen edges, then gravity
  gathers them back into a new, random arrangement
- One of each booster per game, more through rewarded ads
- Buttons only react when the press starts on them, so a pull that ends over the bottom
  bar never triggers it
- Swap: tap the NEXT planet to exchange it with the one waiting on the ring
- The field slowly rotates, so timing matters

## Losing

A planet resting clearly outside the dashed ring for 3 seconds ends the game. Each planet
counts down on its own with a red ring, a number, a beep and a buzz every second, and the
count winds back down if it gets back inside. The game-over screen names the planet.

## Monetization flow

- Rewarded ad: one revive per game, extra boosters
- Interstitial: every 3rd game, never during the first 3 games
- "Remove Ads" purchase: disables interstitials, rewarded ads stay available

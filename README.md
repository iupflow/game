# Jelly Drop (working title)

A lightweight merge game prototype (Phaser 3 + Vite), intended to be packaged for
iOS and Android with Capacitor.

A gravity well sits in the middle of the screen. Tap to drop the next planet from that
side of the outer orbit and let gravity pull it in, or press anywhere and pull back like
a slingshot: the direction of the pull picks where on the orbit the planet starts, and
the length of the pull sets how hard it is launched toward the centre. Full power is
always reachable before the finger meets the edge of the screen. Two of the
same kind merge into the next body in a 15-step chain: Moon, Mercury, Mars, Venus, Earth,
Neptune, Uranus, Saturn, Jupiter, Sun, Red Giant, Blue Giant, Supernova, Pulsar. Two pulsars
collapse into a black hole, which swallows the whole field and starts a new universe with a
higher score multiplier.

## Run

```
npm install
npm run dev      # development server
npm run build    # production build in dist/
```

The iOS and Android apps are built with Capacitor; see [BUILD.md](BUILD.md).

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
- `src/haptics.js` – vibration (Capacitor Haptics in the apps, browser fallbacks)
- `src/native.js` – app-only glue: hides the status bar and launch screen, silences sound
  in the background, sends the Android back button to the home screen
- `android/`, `ios/` – the native app projects (Capacitor); `assets/` – icon and launch
  screen sources
- `src/sfx.js` – synthesized sound (Web Audio, no files). Every merge has its own kind of
  sound, not just its own pitch: a glassy ting for moons, a metal clink for Mercury, a gravel
  crunch for Mars, a cloudy breath for Venus, bubbles for Earth, an icy whistle for Neptune,
  a wah-wah for Uranus, a gong for Saturn, thunder and horns for Jupiter, a fiery fanfare for
  the Sun, a slow swell for the Red Giant, electric zaps for the Blue Giant, an explosion for
  the Supernova and radio pulses for the Pulsar. Notes sit on one pentatonic scale so combos
  sound musical; a compressor and a small reverb glue it together

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
- Merges: the two planets rush into each other, and a small effect stays close to the new
  body: a soft glow in its colour, one fine ring hugging it and a few small sparks just past
  its edge (a few more on combos). Stars also get short, fine rays that turn as they fade
- Album: only bodies already found are shown. Nothing about the rest is given away, not
  even that there is more
- The ring grows with the biggest body made so far. Its size is exactly what the next step
  needs: room for the biggest body, one of every smaller body down to the smallest the
  launcher still gives (that one twice, since the last pair sets the chain off) and four
  stray planets. Careful play fits; dropping planets anywhere soon spills over. It starts
  small (radius 84 with a Mars) and grows on screen with a ripple each time a bigger body
  appears, up to its full size at the Blue Giant; past that the view pulls back instead
  (0.88 for the Supernova, 0.78 for the Pulsar). A new universe starts small again
- The ring is alive: a soft glow, three lights with tails running round it, and a colour
  that moves from lavender through sky blue and mint (planets) to gold, orange, pink and
  violet (stars). Every time it grows it brightens and turns a little, one fine wave slips
  just past the new edge, small sparkles twinkle along it and a small RING UP appears.
  It pulses red, with racing lights, while a planet counts down, flashes green on a revive
  and cyan when a new universe begins
- Laser booster: tap a planet, and a satellite vaporizes every planet of that kind, one
  beam after another
- Fusion booster: every matching pair lifts off, flies over the others to its partner and
  merges; new pairs are looked for as it goes, so merges chain
- Vortex booster: tap a spot and a small black hole opens there for a few seconds, pulling
  everything nearby into a spin and swallowing the planets up to Earth size
- Smash booster: a deep-black ball of dark matter crashes in like a billiards break shot.
  Every planet flies apart, bouncing off each other and off the screen edges, then gravity
  gathers them back into a new, random arrangement
- Comet booster: locked until the first Uranus is made, then unlocked for good. Tap a
  planet and a comet streaks in and lifts it one step up the chain. Your biggest kind on
  the field can't be picked, so the comet helps the others catch up instead of racing one
  planet to a black hole
- Booster limits per game, by strength:

  | Booster | Free at start | Most per game |
  | ------- | ------------- | ------------- |
  | Laser   | 1             | 2             |
  | Fusion  | 0             | 1             |
  | Vortex  | 1             | 2             |
  | Smash   | 1             | 2             |
  | Comet   | 1             | 2             |

  With none left, a rewarded ad adds one, but only until the game's maximum is reached;
  after that the button stays empty until the next game. Premium players start every game
  with the maximum
- Launcher: it gives Moon to Mars at first, then Venus too. Once a Sun is made the Moons
  stop coming, and from the Blue Giant on Mercury stops too, so the long road through the
  stars keeps moving. Nothing bigger than Earth is ever launched
- Buttons only react when the press starts on them, so a pull that ends over the bottom
  bar never triggers it
- Swap: tap the NEXT planet to exchange it with the one waiting on the ring
- The field slowly rotates, so timing matters

## Losing

A planet resting clearly outside the dashed ring for 5 seconds ends the game. Only resting
counts: while a planet is still travelling (flying in, rolling, being knocked away) its
countdown waits, which leaves time to use a booster. Being jostled in place by the cluster
still counts as resting, so firing shots quickly does not keep the countdown away. Each planet counts down on its own with a red ring, a number, a beep and a buzz
every second, and the count winds back down if it gets back inside. The game-over screen
names the planet.

One revive per game: for a rewarded ad, or free with Premium. Nothing is destroyed. A
gravity surge grows the ring one step, as if the next body had already been made, pulls
everything in tight for a moment and restarts every countdown. When that next body really
is made, the ring has already grown, so the extra room is borrowed, not given.

## Monetization flow

- Rewarded ad: the revive (once per game), and boosters up to each one's per-game maximum
- Interstitial: every 3rd game, never during the first 3 games
- Premium purchase ($2.99, placeholder price): no interstitials, every booster at its
  maximum from the start of each game, and a free revive

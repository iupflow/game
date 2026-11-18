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
collapse into a black hole, which swallows the whole field, leaves diamonds behind and starts
a new universe.

There is no score: it is a relaxed game about growing the biggest body you can. The game opens
on a home screen: Play (or Continue, when a game was left unfinished), the Daily Challenge, the
Shop and the Album, with the biggest body ever made shown as a little trophy. Along the way the
launcher sometimes gives a star bomb, some bodies have powers when they are made, cosmic events
shake things up every so often, and diamonds buy planet skins and backgrounds. The pause button
(top, middle) leads to resume, restart, home and the sound and vibration settings; leaving the
app pauses the game too.

## Look and feel

- Everything that can be tapped moves like jelly: buttons, booster buttons, the pause button,
  NEXT, the album strip, shop tabs, even the letters of the title. Under the pointer it swells a
  little and keeps wobbling; pressed, it squashes flat; let go, it springs back with a bounce.
  The main button on a screen (PLAY or CONTINUE, RESUME, REVIVE, the daily PLAY) breathes
  gently at rest
- Buttons are slim panes of tinted glass: see-through, so the sky shows behind them, a faint
  sheen over the top and a fine bright edge, no heavy base. Only the main button of a screen is
  a little more solid, with a soft glow of its colour; the rest share the sky's colours (the
  daily challenge keeps a warm label). They light up a little while touched
- Menus belong to the sky: panels are glass in the colours of the background in use, over a
  tinted veil that lets the moving sky show through, and they pop open with a wobble and shrink
  away when closed; while one is open over the home screen, the menu under it steps back. Cards,
  the booster bar, banners and secondary text take the sky's colours too (teal under the aurora,
  ember red in the inferno)
- The home screen has no dark veil: the name is made of jelly letters in candy colours that drop
  in and land with a squash, and planets in the skin in use circle the well behind the menu

Boosters only ever come from their per-game allowance: no event, special planet or reward
hands out extra ones, so the allowance stays a real limit.

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
- `src/features/` – mixed into the scene: `specials.js` (star bomb), `abilities.js` (planet
  powers), `events.js` (cosmic events), `menu.js` (home screen, pause menu, saving and
  continuing, shop, daily challenge, diamonds), `skinfx.js` (each skin's merge burst and trail)
- `src/meta.js` – what lasts between games: diamonds, purchases, the biggest body ever made,
  today's challenge and the game left unfinished; `src/themes.js` – the skins, backgrounds and
  diamond packs on sale, and the interface colours for each sky; `src/backgrounds.js` – the
  moving skies; `src/jelly.js` – the jelly UI (its springs and its pictures); `src/daily.js` – the seeded
  daily challenge
- `src/Planet.js` – one planet: a hard physics core wrapped in a springy skin, plus
  the springs that make its picture squash, stretch and wobble
- `src/PlanetBatch.js` – draws planets as deforming textured meshes (WebGL)
- `src/art.js` – the chain and all procedural art (no image files). Planet surfaces are
  rendered per pixel as softly textured spheres in a gentle, stylised palette; a separate
  light layer adds a rim glow and a glossy highlight (no dark side) and stays fixed while
  planets turn. Each skin has its own surfaces, light layer and parts, keyed by skin, so only
  the skin in use is ever made. The small bodies are textured before the first frame, the
  big ones in the background
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

## Special planets

Once an Earth has been made, the launcher sometimes gives a Star Bomb (about 3%, shown in NEXT
and explained the first time it comes). It arms when it lands and burns down for 1.3 seconds:
the zone it will clear is drawn round it, the fuse left shows as an arc, sparks fly, the beeps
get faster, and the small planets in the zone (up to Mars, or one step above the smallest the
launcher gives) glow red and tremble, so you can see what it will take. Then a beat of stillness,
a warm flash, a punch of the camera and a shock wave: the planets in the zone burst one after
another, nearest first, everything else is thrown back, and CLEARED ×N says how many went. A
blast sets off other bombs.

## Planet powers

Some bodies do something the moment a merge makes them. The discovery banner says what:

- Saturn, Ring Catch: its rings catch up to three moons or Mercuries nearby
- Jupiter, Great Storm: for a moment the small planets around it whirl round it, and each
  is steered round the storm toward its nearest twin, so they meet and merge
- Sun, Solar Flare: burns away the moons and Mercuries touching it
- Supernova, Shockwave: clears the small debris around it and pushes everything else back
- Pulsar, Beam Sweep: two beams sweep round for three seconds, burning away small planets

## Cosmic events

From the first Earth on, about every 40–50 seconds of play something happens for a while,
announced with a banner and a countdown under the pause button. Events change the situation;
none of them gives boosters:

- Meteor Shower (11 s): small planets streak in from outside the ring
- Zero Gravity (7.5 s): the well goes dark, a wave pushes everything apart and the planets float
  and tumble in a cool light for 5 seconds. Shots fly straight with nothing pulling them, so
  floating planets can be knocked into each other like billiard balls. A ring round the well
  counts the float down, the last three seconds out loud; then gravity comes back hard: a pull
  closes in from the edges, light streaks into the well and the field slams together in a new
  order, hard hits sparking and shaking the screen. No countdown runs meanwhile

Merges in quick succession get a cheer (NICE!, GREAT!, AMAZING!, STELLAR!), nothing more.

## Diamonds

Diamonds are the one currency, and they are meant to be rare. They come from two places:

- Merges: any merge can drop one, and the bigger the body it makes, the better the chance:
  about 0.4% for a Mercury, 1.4% for an Earth, 5% for a Saturn, 13% for the Sun and 48% for a
  Supernova (at most 60%). Most games find one to three. A black hole always leaves 5. The
  diamond pops out where it was found and flies to the counter at the top left; it is in the
  wallet at once, so closing the game never loses it. The daily challenge pays 3–5 more
- Diamond packs in the shop: 60 for $0.99, 330 for $4.99, 700 for $9.99 (placeholder prices;
  in the browser a test purchase, free)

## The shop

Three tabs: Planets, Skies and Diamonds. A skin or a sky is bought once with diamonds and can
be switched any time after.

Planet skins change the look of the whole chain, Moon to Pulsar (the black hole and the star
bomb keep their own), how the planets move, what a merge looks like and the trail a launched
planet leaves:

| Skin | Price | Planets | Merge | Trail |
| ---- | ----- | ------- | ----- | ----- |
| Classic | free | soft painted planets | a glow, a fine ring, sparks; rays for stars | – |
| Kawaii | 120 | milky pastels with sparkles, a soft outline and a big toy shine, faces that blink and look startled; extra squishy, little hops at rest | hearts pop out and float up | little hearts |
| Jelly Candy | 160 | a flavour each: sugared gumdrop with sprinkles, caramel, strawberry and blueberry swirls, lemon drop, blue raspberry marble, peach jelly with a candy-striped ring, a gobstopper, orange, cherry and blue jellies, cotton candy, a rainbow lollipop; glassy shine, squishy | a glossy ring and sprinkles that spin and drop | sugar and sprinkles |
| Pixel | 160 | real pixel art on one grid, a small palette, dark outline and stepped shading that stay level on screen; stiffer | squares hop out in steps, a pixel ring grows in steps | stepped pixels |
| Neon | 200 | dark glass traced with glowing grid and contour lines in the planet's colour, neon rings and halo; flickers like a neon tube now and then | jagged sparks of electricity crackle out | a glowing streak |

Skies (backgrounds), each with its own motion; the page around the game follows the sky:

| Sky | Price | |
| --- | ----- | - |
| Purple Nebula | free | twinkling stars, slowly breathing nebulae |
| Aurora | 120 | curtains of northern lights sway over the field, snow drifts down, mountains below |
| Deep Ocean | 120 | sunbeams sway down through the water, bubbles rise, dunes on the sea floor |
| Inferno | 120 | embers drift up from a flickering, glowing deep |
| Spiral Galaxy | 180 | a slowly turning galaxy at a slant, with shooting stars |

## The daily challenge

Everyone gets the same planets in the same order (the launcher runs on a seed made from the
date), plus a rule for the day (low gravity, meteor day, a ring 8% smaller, no boosters but
more bombs, a faster-turning field, zero-G day) and a goal body. Reaching it the first time
that day pays 3–5 diamonds. On the home screen the button carries a small badge: a dot while
today's challenge is open, a tick once it is done.

## Saving and continuing

A game in progress is saved every few seconds, when the app goes to the background and when
HOME is chosen in the pause menu. The home screen then offers CONTINUE, which puts back every
planet where it was (still moving if it was), the next planets, the boosters left, the ring and
the universe; the daily challenge carries on with the same planets. NEW GAME asks before it
throws a waiting game away. Losing ends a game for good: its save is gone the moment it is lost,
and the only way on is the revive on the game-over screen (never in the pause menu).

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

The game-over screen shows the biggest body made in that game (and NEW RECORD when it beats
every game before), and the diamonds found.

## Monetization flow

- Rewarded ad: the revive (once per game), and boosters up to each one's per-game maximum
- Interstitial: every 3rd game, never during the first 3 games
- Premium purchase ($2.99, placeholder price): no interstitials, every booster at its
  maximum from the start of each game, and a free revive
- Diamond packs (consumable purchases) for skins and skies

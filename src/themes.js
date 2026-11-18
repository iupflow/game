// Things to buy with diamonds: planet skins and backgrounds. Plus the diamond packs, and the
// interface colours that go with each background.
import { mix as mixColor } from './jelly.js';

// Each skin changes how the planets look (art.js), how they move (squish: wobble strength;
// upright: the picture never turns; hop: little bounces at rest; flicker: like a neon tube),
// what a merge looks like and the trail a launched planet leaves (features/skinfx.js).
export const SKINS = [
  { id: 'classic', name: 'Classic', price: 0, text: 'Soft painted planets' },
  { id: 'kawaii', name: 'Kawaii', price: 120, face: true, squish: 1.35, hop: true, text: 'Pastel planets with faces. Merges burst into hearts' },
  { id: 'candy', name: 'Jelly Candy', price: 160, squish: 1.25, text: 'Glossy candy and jelly. Merges throw sprinkles' },
  { id: 'pixel', name: 'Pixel', price: 160, squish: 0.55, upright: true, text: 'Retro pixel art. Merges pop into pixels' },
  { id: 'neon', name: 'Neon', price: 200, flicker: true, text: 'Glowing neon lines. Merges crackle with sparks' },
];

// top and bottom: the sky gradient; glows: the three soft nebulae; each also has its own motion
export const THEMES = [
  { id: 'nebula', name: 'Purple Nebula', price: 0, top: 0x221a5a, bottom: 0x0c0a26, glows: [0x6a45d8, 0x3a6fd8, 0xc05aa8], text: 'Twinkling stars in a violet nebula' },
  { id: 'aurora', name: 'Aurora', price: 120, top: 0x0c2f3c, bottom: 0x030b12, glows: [0x2fd6a0, 0x2a8fc0, 0x7a5ad8], text: 'Curtains of northern lights sway over the field' },
  { id: 'ocean', name: 'Deep Ocean', price: 120, top: 0x0d3a70, bottom: 0x03102a, glows: [0x3a8ad8, 0x2ac6d8, 0x5a5ad8], text: 'Sunbeams from above and rising bubbles' },
  { id: 'inferno', name: 'Inferno', price: 120, top: 0x46100f, bottom: 0x120305, glows: [0xff5a2a, 0xc0303a, 0xff9a3a], text: 'Embers drift up from a glowing deep' },
  { id: 'galaxy', name: 'Spiral Galaxy', price: 180, top: 0x140e3a, bottom: 0x04030e, glows: [0x7a6aff, 0x4a8aff, 0xd06ac0], text: 'A slowly turning galaxy, with shooting stars' },
];

export const GEM_PACKS = [
  { id: 'gems_60', gems: 60, price: '$0.99' },
  { id: 'gems_330', gems: 330, price: '$4.99', bonus: '+10%' },
  { id: 'gems_700', gems: 700, price: '$9.99', bonus: '+17%' },
];

export const skinById = (id) => SKINS.find((s) => s.id === id) || SKINS[0];
export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

function mix(c1, c2, t) {
  const ch = (c, s) => (c >> s) & 255;
  const m = (s) => Math.round(ch(c1, s) + (ch(c2, s) - ch(c1, s)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}
const css = (c) => '#' + c.toString(16).padStart(6, '0');

// a few scattered stars, the same as in index.html
const PAGE_STARS = [
  'radial-gradient(1.3px 1.3px at 22% 31%, rgba(255,255,255,.75), transparent)',
  'radial-gradient(1px 1px at 71% 63%, rgba(255,255,255,.55), transparent)',
  'radial-gradient(1.5px 1.5px at 46% 82%, rgba(255,255,255,.6), transparent)',
  'radial-gradient(1px 1px at 86% 14%, rgba(255,255,255,.5), transparent)',
  'radial-gradient(1.2px 1.2px at 9% 71%, rgba(255,255,255,.45), transparent)',
];

/**
 * The page behind the game (seen above and below it on tall phones) continues the theme's sky:
 * the game draws its gradient over three screen heights, so its visible edges sit at 1/3 and 2/3.
 */
export function applyPageTheme(theme) {
  const top = css(mix(theme.top, theme.bottom, 1 / 3));
  const bottom = css(mix(theme.top, theme.bottom, 2 / 3));
  const el = document.documentElement;
  el.style.backgroundColor = bottom;
  el.style.backgroundImage = [...PAGE_STARS, `linear-gradient(${top}, ${bottom})`].join(', ');
}

const hexOf = (c) => '#' + c.toString(16).padStart(6, '0');

/**
 * The interface in the colours of a sky, so the menus and panels belong to the background
 * instead of sitting on top of it. Plain buttons, panels, cards and secondary text all follow it;
 * buttons that mean something (play, the daily challenge, diamonds) keep their own colours.
 */
export function uiPalette(theme) {
  const [g0, g1] = theme.glows;
  const base = mixColor(theme.top, g0, 0.38);
  return {
    dim: theme.bottom,
    panel: mixColor(base, 0x000000, 0.22),
    panelTop: mixColor(base, 0xffffff, 0.14),
    rim: mixColor(g0, 0xffffff, 0.35),
    card: mixColor(theme.bottom, base, 0.6),
    cardOn: mixColor(base, 0xffffff, 0.1),
    button: mixColor(g0, theme.top, 0.35),
    button2: mixColor(g1, theme.top, 0.35),
    soft: hexOf(mixColor(g0, 0xffffff, 0.62)),
    faint: hexOf(mixColor(g0, 0xffffff, 0.38)),
    light: hexOf(mixColor(g0, 0xffffff, 0.84)),
    stroke: hexOf(mixColor(theme.top, 0x000000, 0.25)),
  };
}

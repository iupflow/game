// Things to buy with stardust: planet skins and background themes.

export const SKINS = [
  { id: 'classic', name: 'Classic', price: 0 },
  { id: 'faces', name: 'Cute Faces', price: 500, face: true },
  { id: 'frost', name: 'Frost', price: 300, tint: 0xc8e6ff },
  { id: 'gold', name: 'Royal Gold', price: 800, tint: 0xffe0a0 },
];

// top and bottom: the sky gradient; glows: the three soft nebulae
export const THEMES = [
  { id: 'nebula', name: 'Purple Nebula', price: 0, top: 0x221a5a, bottom: 0x0c0a26, glows: [0x6a45d8, 0x3a6fd8, 0xc05aa8] },
  { id: 'aurora', name: 'Aurora', price: 400, top: 0x0e3b47, bottom: 0x06141d, glows: [0x2fd6a0, 0x3a9fd8, 0x7a5ad8] },
  { id: 'crimson', name: 'Crimson', price: 400, top: 0x47142f, bottom: 0x170710, glows: [0xd84a6a, 0x9a3ad8, 0xff8a4a] },
  { id: 'ocean', name: 'Deep Ocean', price: 400, top: 0x0f2a5c, bottom: 0x050d24, glows: [0x3a8ad8, 0x2ac6d8, 0x5a5ad8] },
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

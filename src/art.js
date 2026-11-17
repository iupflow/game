// Procedural art: every planet, ring and glow is drawn with canvas 2D,
// so the game ships without image files.

export const TEX_SCALE = Math.min(2, Math.max(1, Math.ceil(window.devicePixelRatio || 1)));

const TAU = Math.PI * 2;
const rad = (deg) => (deg * Math.PI) / 180;

/** Texture padding around a planet, in world units. */
export const PAD = 4;
/** The generic lighting overlays are drawn at this radius. */
export const SHADE_R = 64;

// ---------- helpers ----------

export function shade(color, f) {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * f));
  const b = Math.min(255, Math.round((color & 255) * f));
  return (r << 16) | (g << 8) | b;
}

function rng(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
function circle(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
}
function ellipse(ctx, x, y, rx, ry, fill, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
}
function radial(ctx, x, y, r0, r1, stops) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  stops.forEach(([at, color]) => g.addColorStop(at, color));
  return g;
}
/** An irregular rounded patch: continents, maria, storm cells. */
function patch(ctx, x, y, r, fill, rand, wobble = 0.35, points = 9) {
  const pts = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * TAU;
    const rr = r * (1 - wobble + rand() * wobble * 2);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8]);
  }
  ctx.beginPath();
  for (let i = 0; i < points; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % points];
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    if (i === 0) ctx.moveTo(mx, my);
    const [x3, y3] = pts[(i + 2) % points];
    ctx.quadraticCurveTo(x2, y2, (x2 + x3) / 2, (y2 + y3) / 2);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
function crater(ctx, x, y, r, dark, light) {
  circle(ctx, x, y, r, dark);
  ctx.beginPath();
  ctx.arc(x, y, r, rad(20), rad(200));
  ctx.strokeStyle = light;
  ctx.lineWidth = Math.max(1, r * 0.28);
  ctx.stroke();
}
/** Horizontal cloud bands with wavy edges, for gas giants. */
function bands(ctx, R, colors, rand, waviness = 0.05) {
  const n = colors.length;
  const h = (2 * R) / n;
  for (let i = 0; i < n; i++) {
    const y0 = -R + i * h;
    const phase = rand() * TAU;
    ctx.beginPath();
    ctx.moveTo(-R, y0 + h + 2);
    ctx.lineTo(-R, y0);
    for (let x = -R; x <= R; x += R / 6) {
      ctx.lineTo(x, y0 + Math.sin(x / (R * 0.32) + phase) * R * waviness);
    }
    ctx.lineTo(R, y0 + h + 2);
    ctx.closePath();
    ctx.fillStyle = colors[i];
    ctx.fill();
  }
}
function wisp(ctx, R, y, len, width, color, rand) {
  const x = (rand() - 0.5) * R * 1.2;
  ctx.beginPath();
  ctx.moveTo(x - len / 2, y);
  ctx.quadraticCurveTo(x, y - width * (0.5 + rand()), x + len / 2, y + width * (rand() - 0.5));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.stroke();
}
function star(ctx, x, y, r, points, fill, inner = 0.45, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = rot + (i * Math.PI) / points;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

// ---------- planet surfaces ----------
// Each painter fills a disc of radius R centred on (0,0); the caller clips to the disc.

const SURFACE = {
  asteroid(ctx, R) {
    const rand = rng(11);
    circle(ctx, 0, 0, R, radial(ctx, -0.3 * R, -0.3 * R, 0, 1.4 * R, [[0, '#b3a391'], [1, '#6b5d50']]));
    for (let i = 0; i < 4; i++) patch(ctx, (rand() - 0.5) * R * 1.3, (rand() - 0.5) * R * 1.3, R * 0.35, 'rgba(70,58,48,.35)', rand);
    for (const [x, y, r] of [[-0.35, -0.2, 0.24], [0.3, 0.3, 0.3], [0.25, -0.45, 0.15], [-0.3, 0.45, 0.17]]) {
      crater(ctx, x * R, y * R, r * R, '#5d5045', '#c9baa7');
    }
  },
  moon(ctx, R) {
    const rand = rng(23);
    circle(ctx, 0, 0, R, radial(ctx, -0.3 * R, -0.3 * R, 0, 1.4 * R, [[0, '#eef0f5'], [1, '#aab0bd']]));
    for (const [x, y, r] of [[-0.3, -0.25, 0.42], [0.35, 0.1, 0.35], [-0.1, 0.5, 0.3]]) patch(ctx, x * R, y * R, r * R, 'rgba(140,147,163,.55)', rand);
    for (const [x, y, r] of [[0.4, -0.45, 0.14], [-0.5, 0.25, 0.12], [0.1, 0.05, 0.1], [0.45, 0.5, 0.16], [-0.2, -0.6, 0.09]]) {
      crater(ctx, x * R, y * R, r * R, '#9aa1b0', '#f6f7fa');
    }
  },
  mars(ctx, R) {
    const rand = rng(37);
    circle(ctx, 0, 0, R, radial(ctx, -0.3 * R, -0.3 * R, 0, 1.4 * R, [[0, '#f08a5d'], [1, '#b8431f']]));
    for (const [x, y, r] of [[-0.3, 0.1, 0.45], [0.4, -0.2, 0.3], [0.2, 0.5, 0.34]]) patch(ctx, x * R, y * R, r * R, 'rgba(140,48,22,.6)', rand);
    ctx.beginPath();
    ctx.moveTo(-0.5 * R, -0.1 * R);
    ctx.quadraticCurveTo(0, 0.12 * R, 0.5 * R, -0.02 * R);
    ctx.strokeStyle = 'rgba(96,30,14,.7)';
    ctx.lineWidth = R * 0.07;
    ctx.lineCap = 'round';
    ctx.stroke();
    ellipse(ctx, 0, -0.95 * R, 0.55 * R, 0.24 * R, '#fff4ec');
    ellipse(ctx, 0, 0.98 * R, 0.4 * R, 0.16 * R, '#fff4ec');
  },
  venus(ctx, R) {
    const rand = rng(41);
    circle(ctx, 0, 0, R, radial(ctx, -0.3 * R, -0.3 * R, 0, 1.4 * R, [[0, '#ffd2b8'], [1, '#d9623f']]));
    // thick swirling cloud cover
    for (let i = 0; i < 6; i++) {
      const y = -0.75 * R + i * 0.3 * R;
      ctx.beginPath();
      ctx.moveTo(-R, y + 0.3 * R);
      ctx.bezierCurveTo(-0.5 * R, y - 0.45 * R, 0.2 * R, y + 0.55 * R, R, y - 0.3 * R);
      ctx.strokeStyle = i % 2 ? 'rgba(255,238,220,.75)' : 'rgba(190,70,60,.45)';
      ctx.lineWidth = R * (0.1 + rand() * 0.08);
      ctx.stroke();
    }
    patch(ctx, -0.25 * R, -0.1 * R, 0.2 * R, 'rgba(255,244,230,.7)', rand, 0.3);
  },
  earth(ctx, R) {
    const rand = rng(53);
    circle(ctx, 0, 0, R, radial(ctx, -0.3 * R, -0.3 * R, 0, 1.4 * R, [[0, '#58a8ff'], [1, '#1c55c0']]));
    for (const [x, y, r] of [[-0.42, -0.2, 0.4], [0.35, -0.38, 0.3], [0.3, 0.35, 0.38], [-0.35, 0.55, 0.22]]) {
      patch(ctx, x * R, y * R, r * R, '#4fc466', rand, 0.4);
      patch(ctx, x * R + r * R * 0.15, y * R + r * R * 0.1, r * R * 0.5, '#3aa152', rand, 0.4, 7);
    }
    ellipse(ctx, 0, -0.97 * R, 0.5 * R, 0.2 * R, '#f4fbff');
    ellipse(ctx, 0, 0.99 * R, 0.42 * R, 0.16 * R, '#f4fbff');
    for (let i = 0; i < 5; i++) wisp(ctx, R, -0.6 * R + i * 0.3 * R, R * (0.5 + rand() * 0.5), R * 0.09, 'rgba(255,255,255,.8)', rand);
  },
  neptune(ctx, R) {
    const rand = rng(67);
    circle(ctx, 0, 0, R, radial(ctx, -0.3 * R, -0.3 * R, 0, 1.4 * R, [[0, '#6f8dff'], [1, '#2a37a8']]));
    bands(ctx, R, ['rgba(120,150,255,.0)', 'rgba(130,160,255,.4)', 'rgba(60,80,210,.3)', 'rgba(140,170,255,.35)', 'rgba(50,60,190,.3)', 'rgba(110,140,255,.25)'], rand, 0.04);
    ellipse(ctx, 0.25 * R, 0.2 * R, 0.26 * R, 0.14 * R, 'rgba(22,32,120,.75)');
    for (let i = 0; i < 3; i++) wisp(ctx, R, -0.4 * R + i * 0.4 * R, R * 0.5, R * 0.05, 'rgba(235,245,255,.75)', rand);
  },
  saturn(ctx, R) {
    const rand = rng(71);
    bands(ctx, R, ['#f3e0ae', '#e2c283', '#f0d79d', '#cfa560', '#ecd193', '#d9b572', '#f1dba6', '#d0aa66'], rand, 0.025);
  },
  jupiter(ctx, R) {
    const rand = rng(83);
    bands(ctx, R, ['#e9d2ad', '#c98250', '#f3e3c6', '#b8673a', '#ecd0a5', '#d08f5b', '#f0dcbb', '#c27748', '#e3c59d'], rand, 0.05);
    ellipse(ctx, 0.3 * R, 0.3 * R, 0.27 * R, 0.17 * R, '#f1c9a0');
    ellipse(ctx, 0.3 * R, 0.3 * R, 0.21 * R, 0.12 * R, '#c8402a');
    ellipse(ctx, 0.27 * R, 0.28 * R, 0.1 * R, 0.05 * R, '#e2694b');
  },
  sun(ctx, R) {
    const rand = rng(97);
    circle(ctx, 0, 0, R, radial(ctx, 0, 0, 0, R, [[0, '#fffbe2'], [0.55, '#ffd84a'], [1, '#ff9a1f']]));
    for (let i = 0; i < 14; i++) {
      const a = rand() * TAU;
      const d = rand() * 0.8 * R;
      patch(ctx, Math.cos(a) * d, Math.sin(a) * d, R * (0.08 + rand() * 0.12), i % 3 ? 'rgba(255,255,220,.4)' : 'rgba(255,120,20,.35)', rand, 0.4, 7);
    }
  },
  redgiant(ctx, R) {
    const rand = rng(101);
    circle(ctx, 0, 0, R, radial(ctx, 0, 0, 0, R, [[0, '#ffd0b0'], [0.5, '#ff6a45'], [1, '#bd2419']]));
    for (let i = 0; i < 16; i++) {
      const a = rand() * TAU;
      const d = rand() * 0.85 * R;
      patch(ctx, Math.cos(a) * d, Math.sin(a) * d, R * (0.1 + rand() * 0.14), i % 2 ? 'rgba(150,20,14,.4)' : 'rgba(255,190,140,.35)', rand, 0.45, 7);
    }
  },
  supernova(ctx, R) {
    circle(ctx, 0, 0, R, radial(ctx, 0, 0, 0, R, [[0, '#ffffff'], [0.45, '#d6f6ff'], [0.8, '#7fb2ff'], [1, '#5a6cff']]));
    ctx.save();
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < 12; i++) {
      ctx.rotate(TAU / 12);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(R, -R * 0.07);
      ctx.lineTo(R, R * 0.07);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? '#ffffff' : '#c8e9ff';
      ctx.fill();
    }
    ctx.restore();
    circle(ctx, 0, 0, R * 0.42, radial(ctx, 0, 0, 0, R * 0.42, [[0, '#ffffff'], [1, 'rgba(255,255,255,0)']]));
  },
  blackhole(ctx, R) {
    circle(ctx, 0, 0, R, '#04020a');
    circle(ctx, 0, 0, R, radial(ctx, 0, 0, R * 0.55, R, [[0, 'rgba(60,20,120,0)'], [0.8, 'rgba(120,50,200,.35)'], [1, 'rgba(255,200,130,.9)']]));
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.93, 0, TAU);
    ctx.strokeStyle = '#ffe9c2';
    ctx.lineWidth = R * 0.06;
    ctx.shadowColor = '#ffb347';
    ctx.shadowBlur = R * 0.25;
    ctx.stroke();
    ctx.shadowBlur = 0;
  },
  comet(ctx, R) {
    circle(ctx, 0, 0, R, radial(ctx, -0.2 * R, -0.2 * R, 0, 1.3 * R, [[0, '#ffffff'], [0.5, '#bff3ff'], [1, '#5ccfff']]));
    star(ctx, 0, 0, R * 0.62, 5, '#ffe14d');
    star(ctx, 0, 0, R * 0.34, 5, '#fff7c2');
  },
  bomb(ctx, R) {
    circle(ctx, 0, 0, R, radial(ctx, -0.3 * R, -0.3 * R, 0, 1.4 * R, [[0, '#6b6478'], [1, '#26222e']]));
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.52, 0, TAU);
    ctx.strokeStyle = '#17141c';
    ctx.lineWidth = R * 0.1;
    ctx.stroke();
    ctx.shadowColor = '#ff3b3b';
    ctx.shadowBlur = R * 0.5;
    circle(ctx, 0, 0, R * 0.3, '#ff5a4d');
    ctx.shadowBlur = 0;
    circle(ctx, -0.08 * R, -0.08 * R, R * 0.1, '#ffd0c8');
  },
};

// ---------- parts drawn outside the disc: rings, glows, tails ----------
// size: half-extent of the canvas in planet radii.

function ringArc(ctx, R, rx, ry, width, color, front) {
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * R, ry * R, 0, front ? 0 : Math.PI, front ? Math.PI : TAU);
  ctx.strokeStyle = color;
  ctx.lineWidth = width * R;
  ctx.stroke();
}
function glow(ctx, R, size, stops) {
  circle(ctx, 0, 0, size * R, radial(ctx, 0, 0, R * 0.6, size * R, stops));
}

const PARTS = {
  saturnRing: {
    size: 1.8,
    draw(ctx, R, front) {
      ctx.rotate(rad(-16));
      ringArc(ctx, R, 1.58, 0.44, 0.13, '#d9c391', front);
      ringArc(ctx, R, 1.38, 0.38, 0.1, '#b79a66', front);
      ringArc(ctx, R, 1.24, 0.34, 0.05, '#e9d8ae', front);
    },
  },
  sunGlow: {
    size: 1.7,
    blend: 'add',
    draw(ctx, R) {
      glow(ctx, R, 1.7, [[0, 'rgba(255,200,70,.75)'], [0.5, 'rgba(255,150,40,.25)'], [1, 'rgba(255,120,20,0)']]);
    },
  },
  redGlow: {
    size: 1.6,
    blend: 'add',
    draw(ctx, R) {
      glow(ctx, R, 1.6, [[0, 'rgba(255,90,60,.7)'], [0.5, 'rgba(230,50,40,.22)'], [1, 'rgba(200,30,30,0)']]);
    },
  },
  novaGlow: {
    size: 2,
    blend: 'add',
    spin: 'slow',
    draw(ctx, R) {
      glow(ctx, R, 1.9, [[0, 'rgba(170,220,255,.8)'], [0.5, 'rgba(110,150,255,.25)'], [1, 'rgba(90,110,255,0)']]);
      for (let i = 0; i < 8; i++) {
        ctx.rotate(TAU / 8);
        const len = (i % 2 ? 1.55 : 1.95) * R;
        const g = ctx.createLinearGradient(0, 0, len, 0);
        g.addColorStop(0, 'rgba(255,255,255,.9)');
        g.addColorStop(1, 'rgba(160,200,255,0)');
        ctx.beginPath();
        ctx.moveTo(0, -R * 0.12);
        ctx.lineTo(len, 0);
        ctx.lineTo(0, R * 0.12);
        ctx.closePath();
        ctx.fillStyle = g;
        ctx.fill();
      }
    },
  },
  holeGlow: {
    size: 2.2,
    blend: 'add',
    draw(ctx, R) {
      glow(ctx, R, 2.2, [[0, 'rgba(255,150,60,.55)'], [0.45, 'rgba(180,70,220,.22)'], [1, 'rgba(90,30,160,0)']]);
    },
  },
  holeDisk: {
    size: 2.1,
    draw(ctx, R, front) {
      ctx.rotate(rad(-12));
      ringArc(ctx, R, 1.85, 0.5, 0.2, 'rgba(255,120,30,.75)', front);
      ringArc(ctx, R, 1.62, 0.43, 0.2, '#ffb347', front);
      ringArc(ctx, R, 1.4, 0.36, 0.16, '#ffe9c2', front);
    },
  },
  cometTail: {
    size: 3.4,
    blend: 'add',
    spin: 'velocity',
    draw(ctx, R) {
      // points along -x; the sprite is turned so it trails behind the motion
      const g = ctx.createLinearGradient(0, 0, -3.3 * R, 0);
      g.addColorStop(0, 'rgba(190,240,255,.85)');
      g.addColorStop(1, 'rgba(90,160,255,0)');
      ctx.beginPath();
      ctx.moveTo(0, -0.9 * R);
      ctx.quadraticCurveTo(-1.6 * R, -0.5 * R, -3.3 * R, 0);
      ctx.quadraticCurveTo(-1.6 * R, 0.5 * R, 0, 0.9 * R);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
    },
  },
  bombSpikes: {
    size: 1.5,
    spin: 'planet',
    draw(ctx, R) {
      for (let i = 0; i < 8; i++) {
        ctx.rotate(TAU / 8);
        ctx.beginPath();
        ctx.moveTo(R * 0.8, -R * 0.2);
        ctx.lineTo(R * 1.38, 0);
        ctx.lineTo(R * 0.8, R * 0.2);
        ctx.closePath();
        ctx.fillStyle = '#3a3445';
        ctx.fill();
        circle(ctx, R * 1.36, 0, R * 0.08, '#ff5a4d');
      }
    },
  },
};

// ---------- the chain ----------
// light: which lighting overlay to draw on top ('shade' = lit planet, 'gloss' = glowing body)
// parts: [name, front?] - drawn behind the planet unless front is true

export const TIERS = [
  { name: 'Asteroid', r: 21, color: 0xa39482, surface: 'asteroid', light: 'shade', parts: [] },
  { name: 'Moon', r: 26, color: 0xd5d9e0, surface: 'moon', light: 'shade', parts: [] },
  { name: 'Mars', r: 32, color: 0xe0683f, surface: 'mars', light: 'shade', parts: [] },
  { name: 'Venus', r: 39, color: 0xf0946a, surface: 'venus', light: 'shade', parts: [] },
  { name: 'Earth', r: 47, color: 0x3b8cf0, surface: 'earth', light: 'shade', parts: [] },
  { name: 'Neptune', r: 56, color: 0x4263eb, surface: 'neptune', light: 'shade', parts: [] },
  { name: 'Saturn', r: 66, color: 0xe3c27a, surface: 'saturn', light: 'shade', parts: [['saturnRing', false], ['saturnRing', true]] },
  { name: 'Jupiter', r: 78, color: 0xd98f55, surface: 'jupiter', light: 'shade', parts: [] },
  { name: 'Sun', r: 92, color: 0xffc93a, surface: 'sun', light: 'gloss', parts: [['sunGlow', false]] },
  { name: 'Red Giant', r: 108, color: 0xff5a3c, surface: 'redgiant', light: 'gloss', parts: [['redGlow', false]] },
  { name: 'Supernova', r: 126, color: 0x9fd8ff, surface: 'supernova', light: 'gloss', parts: [['novaGlow', false]] },
  { name: 'Black Hole', r: 80, color: 0xffb347, surface: 'blackhole', light: null, parts: [['holeGlow', false], ['holeDisk', false], ['holeDisk', true]] },
];

export const SPECIALS = {
  comet: { name: 'Comet', r: 24, color: 0xbff3ff, surface: 'comet', light: 'gloss', parts: [['cometTail', false]] },
  bomb: { name: 'Bomb', r: 26, color: 0xff5a4d, surface: 'bomb', light: 'shade', parts: [['bombSpikes', false]] },
};

export const HOLE = TIERS.length - 1; // the black hole
export const MAX_PLANET = HOLE - 1; // the largest ordinary body

export const defOf = (kind) => (typeof kind === 'number' ? TIERS[kind] : SPECIALS[kind]);
export const partInfo = (name) => PARTS[name];

// ---------- drawing ----------

function drawSurface(ctx, kind, R) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.clip();
  SURFACE[defOf(kind).surface](ctx, R);
  ctx.restore();
}

function drawLight(ctx, R, type) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.clip();
  if (type === 'shade') {
    circle(ctx, 0, 0, R, radial(ctx, -0.38 * R, -0.42 * R, 0, 1.15 * R, [[0, 'rgba(255,255,255,.34)'], [0.5, 'rgba(255,255,255,.05)'], [1, 'rgba(255,255,255,0)']]));
    const g = ctx.createRadialGradient(-0.3 * R, -0.35 * R, 0.5 * R, -0.1 * R, -0.12 * R, 1.22 * R);
    g.addColorStop(0, 'rgba(12,6,46,0)');
    g.addColorStop(1, 'rgba(12,6,46,.62)');
    circle(ctx, 0, 0, R, g);
  } else {
    circle(ctx, 0, 0, R, radial(ctx, -0.35 * R, -0.4 * R, 0, 1.1 * R, [[0, 'rgba(255,255,255,.3)'], [0.6, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,0)']]));
  }
  // the glossy spot that makes it read as jelly
  ctx.globalAlpha = 0.62;
  ellipse(ctx, -0.4 * R, -0.5 * R, 0.24 * R, 0.12 * R, '#ffffff', -0.62);
  ctx.globalAlpha = 0.3;
  ellipse(ctx, 0.42 * R, 0.52 * R, 0.16 * R, 0.07 * R, '#ffffff', -0.62);
  ctx.restore();
}

function drawPart(ctx, name, R, front) {
  ctx.save();
  PARTS[name].draw(ctx, R, front);
  ctx.restore();
}

/** Static picture of a body, centred on (0,0): used for icons, the album and previews. */
export function drawPortrait(ctx, kind, R) {
  const def = defOf(kind);
  for (const [name, front] of def.parts) {
    if (front) continue;
    ctx.save();
    if (PARTS[name].blend === 'add') ctx.globalCompositeOperation = 'lighter';
    drawPart(ctx, name, R, false);
    ctx.restore();
  }
  drawSurface(ctx, kind, R);
  if (def.light) drawLight(ctx, R, def.light);
  for (const [name, front] of def.parts) if (front) drawPart(ctx, name, R, true);
}

function canvasTex(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return;
  const S = TEX_SCALE;
  const tex = scene.textures.createCanvas(key, Math.ceil(w * S), Math.ceil(h * S));
  const ctx = tex.getContext();
  ctx.scale(S, S);
  ctx.translate(w / 2, h / 2);
  draw(ctx);
  tex.refresh();
}

export const PORTRAIT_R = 48;
export const PORTRAIT_SIZE = PORTRAIT_R * 4.4;
export const surfaceKey = (kind) => `surface_${kind}`;
export const partKey = (kind, i) => `part_${kind}_${i}`;
export const portraitKey = (kind) => `portrait_${kind}`;

export function makeTextures(scene) {
  const kinds = [...TIERS.keys(), 'comet', 'bomb'];
  for (const kind of kinds) {
    const def = defOf(kind);
    const R = def.r;
    const size = (R + PAD) * 2;
    canvasTex(scene, surfaceKey(kind), size, size, (ctx) => drawSurface(ctx, kind, R));
    def.parts.forEach(([name, front], i) => {
      const s = PARTS[name].size * R * 2;
      canvasTex(scene, partKey(kind, i), s, s, (ctx) => drawPart(ctx, name, R, front));
    });
    canvasTex(scene, portraitKey(kind), PORTRAIT_SIZE, PORTRAIT_SIZE, (ctx) => drawPortrait(ctx, kind, PORTRAIT_R));
  }
  const shadeSize = (SHADE_R + PAD) * 2;
  canvasTex(scene, 'light_shade', shadeSize, shadeSize, (ctx) => drawLight(ctx, SHADE_R, 'shade'));
  canvasTex(scene, 'light_gloss', shadeSize, shadeSize, (ctx) => drawLight(ctx, SHADE_R, 'gloss'));

  canvasTex(scene, 'dot', 20, 20, (ctx) => circle(ctx, 0, 0, 9, '#ffffff'));
  canvasTex(scene, 'spark', 40, 40, (ctx) => star(ctx, 0, 0, 18, 4, '#ffffff', 0.3));
  canvasTex(scene, 'soft', 128, 128, (ctx) => circle(ctx, 0, 0, 64, radial(ctx, 0, 0, 0, 64, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']])));
  canvasTex(scene, 'icon_shake', 80, 80, (ctx) => {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    circle(ctx, 0, 0, 13, '#ffd84a');
    circle(ctx, -4, -4, 4, '#fff3b0');
    for (const s of [-1, 1]) {
      for (const r of [22, 31]) {
        ctx.beginPath();
        ctx.arc(0, 0, r, s > 0 ? -0.6 : Math.PI - 0.6, s > 0 ? 0.6 : Math.PI + 0.6);
        ctx.stroke();
      }
    }
  });
}

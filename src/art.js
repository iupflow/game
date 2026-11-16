// Procedural art: every jelly, face and accessory is drawn with canvas 2D,
// so the game ships without image files.

export const TEX_SCALE = Math.min(2, Math.max(1, Math.ceil(window.devicePixelRatio || 1)));

const INK = '#2b1b3d';
const TAU = Math.PI * 2;
const rad = (deg) => (deg * Math.PI) / 180;

// ---------- colour helpers ----------

export function shade(color, f) {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * f));
  const b = Math.min(255, Math.round((color & 255) * f));
  return (r << 16) | (g << 8) | b;
}
export function tint(color, t) {
  const mix = (v) => Math.round(v + (255 - v) * t);
  return (mix((color >> 16) & 255) << 16) | (mix((color >> 8) & 255) << 8) | mix(color & 255);
}
export const css = (color) => '#' + color.toString(16).padStart(6, '0');

// ---------- small drawing helpers ----------

function circle(ctx, x, y, r, fill, stroke, lw) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}
function ellipse(ctx, x, y, rx, ry, fill, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
}
function poly(ctx, pts, fill, stroke, lw) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.lineJoin = 'round';
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}
function leaf(ctx, x, y, len, wid, rot, fill, stroke, lw) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(wid, -len * 0.55, 0, -len);
  ctx.quadraticCurveTo(-wid, -len * 0.55, 0, 0);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  ctx.restore();
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
function line(ctx, x1, y1, x2, y2, color, lw) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.stroke();
}

// ---------- accessories ----------
// Drawn with the attach point at (0,0) and "outward from the body" as -y.
// `size` is the half-extent of the canvas needed, in units of the body radius.

const ACC = {
  dropTip: {
    size: 0.9,
    draw(ctx, R, c) {
      ctx.beginPath();
      ctx.moveTo(-0.5 * R, 0.35 * R);
      ctx.quadraticCurveTo(-0.12 * R, -0.2 * R, 0.06 * R, -0.72 * R);
      ctx.quadraticCurveTo(0.2 * R, -0.2 * R, 0.5 * R, 0.35 * R);
      ctx.closePath();
      ctx.fillStyle = css(c.base);
      ctx.fill();
      ctx.strokeStyle = css(c.rim);
      ctx.lineWidth = Math.max(2, R * 0.09);
      ctx.lineJoin = 'round';
      ctx.stroke();
    },
  },
  sprout: {
    size: 0.9,
    draw(ctx, R) {
      line(ctx, 0, 0.2 * R, 0, -0.3 * R, '#3f8f2f', R * 0.11);
      leaf(ctx, 0, -0.26 * R, 0.52 * R, 0.3 * R, -0.85, '#7be04f', '#3f8f2f', R * 0.06);
      leaf(ctx, 0, -0.26 * R, 0.6 * R, 0.32 * R, 0.7, '#9cf06a', '#3f8f2f', R * 0.06);
    },
  },
  tuft: {
    size: 0.8,
    draw(ctx, R) {
      leaf(ctx, 0, 0.15 * R, 0.5 * R, 0.14 * R, -0.55, '#ffb52e', '#d98a12', R * 0.04);
      leaf(ctx, 0, 0.15 * R, 0.5 * R, 0.14 * R, 0.55, '#ffb52e', '#d98a12', R * 0.04);
      leaf(ctx, 0, 0.15 * R, 0.66 * R, 0.16 * R, 0, '#ffc94d', '#d98a12', R * 0.04);
    },
  },
  wing: {
    size: 0.6,
    draw(ctx, R) {
      ctx.beginPath();
      ctx.ellipse(0, -0.05 * R, 0.2 * R, 0.3 * R, 0, 0, TAU);
      ctx.fillStyle = '#ffbf33';
      ctx.fill();
      ctx.strokeStyle = '#d98a12';
      ctx.lineWidth = R * 0.05;
      ctx.stroke();
    },
  },
  catEar: {
    size: 0.9,
    draw(ctx, R, c) {
      poly(ctx, [[-0.36 * R, 0.3 * R], [0, -0.52 * R], [0.36 * R, 0.3 * R]], css(c.base), css(c.rim), R * 0.1);
      poly(ctx, [[-0.17 * R, 0.25 * R], [0, -0.26 * R], [0.17 * R, 0.25 * R]], '#ffc2d4');
    },
  },
  bunnyEar: {
    size: 1.4,
    draw(ctx, R, c) {
      ctx.beginPath();
      ctx.ellipse(0, -0.5 * R, 0.2 * R, 0.78 * R, 0, 0, TAU);
      ctx.fillStyle = css(c.base);
      ctx.fill();
      ctx.strokeStyle = css(c.rim);
      ctx.lineWidth = R * 0.08;
      ctx.stroke();
      ellipse(ctx, 0, -0.52 * R, 0.09 * R, 0.52 * R, '#ffe1ec');
    },
  },
  plate: {
    size: 0.6,
    draw(ctx, R) {
      poly(ctx, [[-0.2 * R, 0.2 * R], [0, -0.34 * R], [0.2 * R, 0.2 * R]], '#ffb347', '#c9772a', R * 0.05);
    },
  },
  owlTuft: {
    size: 0.8,
    draw(ctx, R, c) {
      poly(ctx, [[-0.26 * R, 0.3 * R], [0.12 * R, -0.5 * R], [0.3 * R, 0.3 * R]], css(c.rim), css(shade(c.rim, 0.8)), R * 0.06);
      poly(ctx, [[-0.1 * R, 0.25 * R], [0.1 * R, -0.24 * R], [0.2 * R, 0.25 * R]], css(c.light));
    },
  },
  fin: {
    size: 0.9,
    draw(ctx, R, c) {
      ctx.beginPath();
      ctx.moveTo(-0.28 * R, 0.25 * R);
      ctx.quadraticCurveTo(-0.14 * R, -0.6 * R, 0.4 * R, -0.5 * R);
      ctx.quadraticCurveTo(0.2 * R, -0.1 * R, 0.28 * R, 0.25 * R);
      ctx.closePath();
      ctx.fillStyle = css(shade(c.base, 0.86));
      ctx.fill();
      ctx.strokeStyle = css(c.rim);
      ctx.lineWidth = R * 0.06;
      ctx.lineJoin = 'round';
      ctx.stroke();
    },
  },
  spout: {
    size: 0.9,
    draw(ctx, R) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#bfe9ff';
      ctx.lineWidth = R * 0.07;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, 0.1 * R);
        ctx.quadraticCurveTo(0, -0.5 * R, s * 0.3 * R, -0.42 * R);
        ctx.stroke();
        circle(ctx, s * 0.36 * R, -0.36 * R, 0.08 * R, '#e6f7ff');
      }
      line(ctx, 0, 0.1 * R, 0, -0.5 * R, '#bfe9ff', R * 0.07);
      circle(ctx, 0, -0.6 * R, 0.09 * R, '#e6f7ff');
    },
  },
  horn: {
    size: 0.9,
    draw(ctx, R) {
      ctx.beginPath();
      ctx.moveTo(-0.18 * R, 0.25 * R);
      ctx.quadraticCurveTo(-0.24 * R, -0.42 * R, 0.2 * R, -0.62 * R);
      ctx.quadraticCurveTo(0.08 * R, -0.2 * R, 0.2 * R, 0.25 * R);
      ctx.closePath();
      ctx.fillStyle = '#fff1c9';
      ctx.fill();
      ctx.strokeStyle = '#c29a5e';
      ctx.lineWidth = R * 0.055;
      ctx.lineJoin = 'round';
      ctx.stroke();
    },
  },
  flame: {
    size: 1,
    draw(ctx, R) {
      const flame = (s, fill) => {
        ctx.beginPath();
        ctx.moveTo(-0.3 * R * s, 0.25 * R);
        ctx.bezierCurveTo(-0.42 * R * s, -0.2 * R * s, -0.05 * R * s, -0.3 * R * s, 0.04 * R * s, -0.78 * R * s);
        ctx.bezierCurveTo(0.14 * R * s, -0.4 * R * s, 0.42 * R * s, -0.3 * R * s, 0.3 * R * s, 0.25 * R);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      };
      flame(1, '#ff8a1f');
      flame(0.62, '#ffd84a');
    },
  },
  crystal: {
    size: 0.9,
    draw(ctx, R) {
      const g = ctx.createLinearGradient(0, 0.2 * R, 0, -0.7 * R);
      g.addColorStop(0, '#7fd4ff');
      g.addColorStop(1, '#ffffff');
      poly(ctx, [[0, 0.3 * R], [-0.18 * R, -0.18 * R], [0, -0.7 * R], [0.18 * R, -0.18 * R]], g, '#5fb4e6', R * 0.045);
      line(ctx, 0, 0.2 * R, 0, -0.6 * R, 'rgba(255,255,255,.8)', R * 0.03);
    },
  },
  antenna: {
    size: 0.9,
    draw(ctx, R) {
      ctx.beginPath();
      ctx.moveTo(0, 0.2 * R);
      ctx.quadraticCurveTo(0.12 * R, -0.2 * R, 0, -0.5 * R);
      ctx.strokeStyle = '#8f7bff';
      ctx.lineWidth = R * 0.05;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.shadowColor = '#fff3a0';
      ctx.shadowBlur = R * 0.2;
      star(ctx, 0, -0.56 * R, 0.17 * R, 5, '#ffe66b');
      ctx.shadowBlur = 0;
    },
  },
  ringBack: {
    size: 1.4,
    center: true,
    draw(ctx, R) {
      ctx.save();
      ctx.rotate(rad(-16));
      ctx.beginPath();
      ctx.ellipse(0, 0.1 * R, 1.2 * R, 0.32 * R, 0, Math.PI, TAU);
      ctx.strokeStyle = '#ffd98a';
      ctx.lineWidth = R * 0.11;
      ctx.stroke();
      ctx.restore();
    },
  },
  ringFront: {
    size: 1.4,
    center: true,
    draw(ctx, R) {
      ctx.save();
      ctx.rotate(rad(-16));
      ctx.beginPath();
      ctx.ellipse(0, 0.1 * R, 1.2 * R, 0.32 * R, 0, 0, Math.PI);
      ctx.strokeStyle = '#ffd98a';
      ctx.lineWidth = R * 0.11;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 0.1 * R, 1.2 * R, 0.32 * R, 0, 0.1, Math.PI - 0.1);
      ctx.strokeStyle = '#fff3cf';
      ctx.lineWidth = R * 0.035;
      ctx.stroke();
      ctx.restore();
    },
  },
  crown: {
    size: 1,
    draw(ctx, R) {
      const g = ctx.createLinearGradient(0, -0.6 * R, 0, 0.25 * R);
      g.addColorStop(0, '#fff3a6');
      g.addColorStop(1, '#f5a623');
      poly(
        ctx,
        [
          [-0.5 * R, 0.28 * R], [-0.58 * R, -0.36 * R], [-0.27 * R, -0.08 * R], [0, -0.56 * R],
          [0.27 * R, -0.08 * R], [0.58 * R, -0.36 * R], [0.5 * R, 0.28 * R],
        ],
        g,
        '#a8620a',
        R * 0.05,
      );
      circle(ctx, -0.58 * R, -0.38 * R, 0.07 * R, '#ff5d73', '#a8620a', R * 0.03);
      circle(ctx, 0.58 * R, -0.38 * R, 0.07 * R, '#ff5d73', '#a8620a', R * 0.03);
      circle(ctx, 0, -0.6 * R, 0.085 * R, '#5dd6ff', '#a8620a', R * 0.03);
      circle(ctx, 0, 0.02 * R, 0.085 * R, '#ff5d73', '#a8620a', R * 0.03);
      circle(ctx, -0.27 * R, 0.08 * R, 0.055 * R, '#5dd6ff');
      circle(ctx, 0.27 * R, 0.08 * R, 0.055 * R, '#5dd6ff');
    },
  },
  fuse: {
    size: 0.9,
    draw(ctx, R) {
      ctx.beginPath();
      ctx.moveTo(0, 0.2 * R);
      ctx.quadraticCurveTo(0.05 * R, -0.3 * R, 0.25 * R, -0.42 * R);
      ctx.strokeStyle = '#c9a26b';
      ctx.lineWidth = R * 0.12;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.shadowColor = '#ffb52e';
      ctx.shadowBlur = R * 0.3;
      star(ctx, 0.3 * R, -0.48 * R, 0.26 * R, 6, '#ffe66b', 0.5);
      ctx.shadowBlur = 0;
      star(ctx, 0.3 * R, -0.48 * R, 0.13 * R, 6, '#ffffff', 0.5);
    },
  },
};

// ---------- the evolution chain ----------
// acc: [name, angle in degrees (-90 = top), inset in radii, options]

const acc = (name, angle, inset = 0.1, opts = {}) => ({ name, angle, inset, ...opts });

export const TIERS = [
  { name: 'Drip', r: 25, color: 0x6fd3ff, face: { mouth: 'smile' }, acc: [acc('dropTip', -90, 0.3)] },
  { name: 'Sprout', r: 34, color: 0x8be36b, face: { mouth: 'smile', extra: 'freckles' }, acc: [acc('sprout', -90)] },
  {
    name: 'Peep', r: 45, color: 0xffe14d, face: { mouth: 'beak' },
    acc: [acc('tuft', -90), acc('wing', 20, 0.12), acc('wing', 160, 0.12)],
  },
  {
    name: 'Mew', r: 57, color: 0xff9f45, face: { mouth: 'cat', extra: 'tabby' },
    acc: [acc('catEar', -128, 0.16), acc('catEar', -52, 0.16)],
  },
  {
    name: 'Hop', r: 71, color: 0xff8fb8, face: { mouth: 'teeth' },
    acc: [acc('bunnyEar', -112, 0.12), acc('bunnyEar', -68, 0.12)],
  },
  {
    name: 'Spike', r: 87, color: 0x2fcfb0, face: { mouth: 'fang', extra: 'belly' },
    acc: [-150, -120, -90, -60, -30].map((a) => acc('plate', a, 0.06)),
  },
  {
    name: 'Hoot', r: 104, color: 0x9b7bff, face: { eye: 'big', mouth: 'beak', extra: 'feathers' },
    acc: [acc('owlTuft', -128, 0.14, { flip: true }), acc('owlTuft', -52, 0.14)],
  },
  {
    name: 'Finn', r: 123, color: 0x4d9bff, face: { mouth: 'wide', extra: 'whale' },
    acc: [acc('spout', -90, 0.05), acc('fin', 28, 0.1), acc('fin', 152, 0.1, { flip: true })],
  },
  {
    name: 'Ember', r: 144, color: 0xff5a4d, face: { eye: 'fierce', mouth: 'fangs', extra: 'belly' },
    acc: [acc('flame', -90, 0.08), acc('horn', -132, 0.1, { flip: true }), acc('horn', -48, 0.1)],
  },
  {
    name: 'Frost', r: 167, color: 0xbfeaff, face: { eye: 'cool', mouth: 'small', extra: 'frost' },
    acc: [acc('crystal', -90, 0.08), acc('crystal', -122, 0.1), acc('crystal', -58, 0.1)],
  },
  {
    name: 'Nova', r: 192, color: 0x4a35b5, face: { eye: 'glow', mouth: 'small', extra: 'stars' },
    acc: [
      acc('antenna', -112, 0.06, { flip: true }), acc('antenna', -68, 0.06),
      acc('ringBack', 0, 0), acc('ringFront', 0, 0, { front: true }),
    ],
  },
  { name: 'King Jelly', r: 218, color: 0xffc93a, face: { mouth: 'mustache', extra: 'sparkle' }, acc: [acc('crown', -90, 0.12)] },
];

export const SPECIALS = {
  star: { name: 'Wild Star', r: 34, color: 0xffe14d, face: { mouth: 'smile', extra: 'starmark' }, acc: [] },
  bomb: { name: 'Bomb', r: 32, color: 0x4a4458, face: { eye: 'fierce', mouth: 'fangs' }, acc: [acc('fuse', -90, 0.1)] },
};

export const MAX_TIER = TIERS.length - 1;

export function defOf(kind) {
  return typeof kind === 'number' ? TIERS[kind] : SPECIALS[kind];
}
export function colorsOf(kind) {
  const base = defOf(kind).color;
  const dark = kind === 10 || kind === 'bomb';
  return { base, rim: shade(base, dark ? 0.6 : 0.72), light: dark ? tint(base, 0.14) : tint(base, 0.28) };
}

// ---------- faces ----------

function drawEyes(ctx, R, style, expr) {
  const ex = style === 'big' ? 0.33 * R : 0.32 * R;
  const ey = -0.08 * R;
  const er = 0.105 * R;
  for (const s of [-1, 1]) {
    const x = s * ex;
    if (expr === 'happy' || expr === 'blink') {
      ctx.beginPath();
      ctx.arc(x, ey + 0.05 * R, er * 1.2, Math.PI + 0.3, TAU - 0.3);
      ctx.strokeStyle = style === 'glow' ? '#d9fbff' : INK;
      ctx.lineWidth = 0.075 * R;
      ctx.lineCap = 'round';
      ctx.stroke();
      continue;
    }
    if (expr === 'scared') {
      circle(ctx, x, ey, er * 1.55, '#ffffff', INK, 0.04 * R);
      circle(ctx, x, ey + er * 0.2, er * 0.5, INK);
      continue;
    }
    if (style === 'big') {
      circle(ctx, x, ey, 0.25 * R, '#fff6d6', INK, 0.045 * R);
      circle(ctx, x, ey, 0.17 * R, '#ffb52e');
      circle(ctx, x, ey, 0.105 * R, INK);
      circle(ctx, x - 0.045 * R, ey - 0.05 * R, 0.04 * R, '#ffffff');
    } else if (style === 'glow') {
      ctx.shadowColor = '#7ff3ff';
      ctx.shadowBlur = 0.2 * R;
      circle(ctx, x, ey, er * 1.1, '#e9fdff');
      ctx.shadowBlur = 0;
    } else if (style === 'cool') {
      ctx.beginPath();
      ctx.arc(x, ey, er * 1.2, -0.05, Math.PI + 0.05);
      ctx.closePath();
      ctx.fillStyle = INK;
      ctx.fill();
      line(ctx, x - er * 1.5, ey - 0.005 * R, x + er * 1.5, ey - 0.005 * R, INK, 0.05 * R);
      circle(ctx, x - er * 0.35, ey + er * 0.4, er * 0.3, '#ffffff');
    } else {
      circle(ctx, x, ey, er, INK);
      circle(ctx, x - er * 0.3, ey - er * 0.35, er * 0.38, '#ffffff');
      if (style === 'fierce') {
        line(ctx, x - s * er * 1.5, ey - er * 1.1, x + s * er * 1.3, ey - er * 2.1, INK, 0.06 * R);
      }
    }
  }
}

function drawMouth(ctx, R, style, expr) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (style === 'beak') {
    const open = expr === 'idle' || expr === 'blink' ? 0 : 0.07 * R;
    poly(ctx, [[-0.13 * R, 0.08 * R], [0.13 * R, 0.08 * R], [0, 0.22 * R]], '#ff9a2e', '#c2620f', 0.035 * R);
    if (open) poly(ctx, [[-0.09 * R, 0.2 * R], [0.09 * R, 0.2 * R], [0, 0.2 * R + open * 1.6]], '#e9801c', '#c2620f', 0.03 * R);
    return;
  }
  if (expr === 'scared') {
    ctx.beginPath();
    ctx.ellipse(0, 0.22 * R, 0.065 * R, 0.085 * R, 0, 0, TAU);
    ctx.fillStyle = '#7a2340';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.04 * R;
    ctx.stroke();
    return;
  }
  if (style === 'mustache') {
    ctx.fillStyle = '#6b3a12';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, 0.1 * R);
      ctx.bezierCurveTo(s * 0.12 * R, 0.02 * R, s * 0.3 * R, 0.06 * R, s * 0.42 * R, 0.0 * R);
      ctx.bezierCurveTo(s * 0.36 * R, 0.2 * R, s * 0.14 * R, 0.24 * R, 0, 0.14 * R);
      ctx.fill();
    }
  }
  if (expr === 'happy') {
    const y = style === 'mustache' ? 0.22 * R : 0.12 * R;
    ctx.beginPath();
    ctx.arc(0, y, 0.17 * R, 0, Math.PI);
    ctx.closePath();
    ctx.fillStyle = '#7a2340';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.045 * R;
    ctx.stroke();
    ellipse(ctx, 0, y + 0.115 * R, 0.085 * R, 0.045 * R, '#ff7d9c');
    if (style === 'fangs' || style === 'fang') {
      poly(ctx, [[0.06 * R, y], [0.12 * R, y], [0.09 * R, y + 0.07 * R]], '#ffffff');
      if (style === 'fangs') poly(ctx, [[-0.06 * R, y], [-0.12 * R, y], [-0.09 * R, y + 0.07 * R]], '#ffffff');
    }
    return;
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.06 * R;
  const smile = (y, r, a = 0.15) => {
    ctx.beginPath();
    ctx.arc(0, y, r, a * Math.PI, (1 - a) * Math.PI);
    ctx.stroke();
  };
  switch (style) {
    case 'cat':
      poly(ctx, [[-0.05 * R, 0.07 * R], [0.05 * R, 0.07 * R], [0, 0.12 * R]], '#ff7d9c');
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(s * 0.08 * R, 0.13 * R, 0.08 * R, 0, Math.PI);
        ctx.stroke();
      }
      break;
    case 'teeth':
      ellipse(ctx, 0, 0.08 * R, 0.05 * R, 0.035 * R, '#ff5d86');
      smile(0.08 * R, 0.15 * R, 0.2);
      ctx.fillStyle = '#ffffff';
      ctx.lineWidth = 0.03 * R;
      for (const x of [-0.075 * R, 0.005 * R]) {
        ctx.beginPath();
        ctx.rect(x, 0.215 * R, 0.07 * R, 0.1 * R);
        ctx.fill();
        ctx.stroke();
      }
      break;
    case 'fang':
      smile(0.08 * R, 0.17 * R);
      poly(ctx, [[0.07 * R, 0.225 * R], [0.14 * R, 0.19 * R], [0.12 * R, 0.29 * R]], '#ffffff', INK, 0.025 * R);
      break;
    case 'wide':
      smile(-0.02 * R, 0.36 * R, 0.24);
      break;
    case 'fangs':
      smile(0.0 * R, 0.26 * R, 0.2);
      for (const s of [-1, 1]) {
        poly(ctx, [[s * 0.1 * R, 0.235 * R], [s * 0.17 * R, 0.2 * R], [s * 0.15 * R, 0.31 * R]], '#ffffff', INK, 0.022 * R);
      }
      break;
    case 'small':
      smile(0.13 * R, 0.085 * R);
      break;
    case 'mustache':
      smile(0.16 * R, 0.1 * R, 0.25);
      break;
    default:
      smile(0.09 * R, 0.16 * R);
  }
}

function drawExtra(ctx, R, extra, c) {
  switch (extra) {
    case 'freckles':
      for (const [x, y] of [[-0.2, -0.5], [0.05, -0.6], [0.28, -0.46]]) circle(ctx, x * R, y * R, 0.045 * R, css(shade(c.base, 0.8)));
      break;
    case 'tabby':
      for (const x of [-0.15, 0, 0.15]) line(ctx, x * R, -0.66 * R, x * R * 0.8, -0.44 * R, css(shade(c.base, 0.72)), 0.07 * R);
      for (const s of [-1, 1]) {
        line(ctx, s * 0.5 * R, 0.1 * R, s * 0.78 * R, 0.04 * R, INK, 0.028 * R);
        line(ctx, s * 0.5 * R, 0.17 * R, s * 0.78 * R, 0.2 * R, INK, 0.028 * R);
      }
      break;
    case 'belly':
      ellipse(ctx, 0, 0.58 * R, 0.46 * R, 0.24 * R, 'rgba(255,255,255,.38)');
      break;
    case 'feathers':
      ctx.strokeStyle = css(shade(c.base, 0.7));
      ctx.lineWidth = 0.04 * R;
      ctx.lineCap = 'round';
      for (const [x, y] of [[-0.2, 0.48], [0.2, 0.48], [0, 0.6], [-0.36, 0.62], [0.36, 0.62]]) {
        ctx.beginPath();
        ctx.arc(x * R, y * R, 0.07 * R, 0.1 * Math.PI, 0.9 * Math.PI);
        ctx.stroke();
      }
      break;
    case 'whale':
      ellipse(ctx, 0, 0.6 * R, 0.56 * R, 0.24 * R, 'rgba(255,255,255,.45)');
      ctx.strokeStyle = 'rgba(77,155,255,.6)';
      ctx.lineWidth = 0.025 * R;
      for (const x of [-0.25, 0, 0.25]) {
        ctx.beginPath();
        ctx.moveTo(x * R, 0.46 * R);
        ctx.lineTo(x * R * 1.1, 0.74 * R);
        ctx.stroke();
      }
      break;
    case 'frost': {
      ellipse(ctx, 0, 0.6 * R, 0.5 * R, 0.22 * R, 'rgba(255,255,255,.6)');
      ctx.strokeStyle = '#6cc4f5';
      ctx.lineWidth = 0.03 * R;
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 0.11 * R, -0.5 * R + Math.sin(a) * 0.11 * R);
        ctx.lineTo(-Math.cos(a) * 0.11 * R, -0.5 * R - Math.sin(a) * 0.11 * R);
        ctx.stroke();
      }
      break;
    }
    case 'stars': {
      const pts = [
        [-0.55, -0.42, 0.07], [0.5, -0.5, 0.05], [0.08, -0.62, 0.09], [-0.2, 0.5, 0.06], [0.42, 0.52, 0.08],
        [-0.6, 0.3, 0.04], [0.66, 0.08, 0.04], [-0.05, 0.68, 0.04], [0.2, -0.38, 0.035], [-0.36, -0.62, 0.035],
      ];
      pts.forEach(([x, y, r], i) => {
        if (i % 2) circle(ctx, x * R, y * R, r * R * 0.6, 'rgba(210,235,255,.9)');
        else star(ctx, x * R, y * R, r * R * 1.5, 4, i % 4 ? '#fff3a0' : '#9ff3ff', 0.35);
      });
      break;
    }
    case 'sparkle':
      for (const [x, y, r] of [[-0.56, -0.4, 0.1], [0.58, -0.3, 0.07], [0.5, 0.46, 0.09], [-0.5, 0.5, 0.06]]) {
        star(ctx, x * R, y * R, r * R * 1.4, 4, 'rgba(255,255,255,.95)', 0.3);
      }
      break;
    case 'starmark':
      star(ctx, 0, -0.5 * R, 0.24 * R, 5, '#ffffff');
      break;
    default:
  }
}

function drawFace(ctx, R, kind, expr) {
  const def = defOf(kind);
  const c = colorsOf(kind);
  const f = def.face;
  drawExtra(ctx, R, f.extra, c);
  const blush = kind === 10 || kind === 'bomb' ? 'rgba(255,120,170,.28)' : 'rgba(255,80,130,.3)';
  ellipse(ctx, -0.55 * R, 0.17 * R, 0.12 * R, 0.085 * R, blush);
  ellipse(ctx, 0.55 * R, 0.17 * R, 0.12 * R, 0.085 * R, blush);
  drawEyes(ctx, R, f.eye || 'dot', expr);
  drawMouth(ctx, R, f.mouth, expr);
  if (expr === 'scared') {
    // sweat drop
    ctx.beginPath();
    ctx.moveTo(0.62 * R, -0.5 * R);
    ctx.quadraticCurveTo(0.74 * R, -0.3 * R, 0.62 * R, -0.26 * R);
    ctx.quadraticCurveTo(0.5 * R, -0.3 * R, 0.62 * R, -0.5 * R);
    ctx.fillStyle = '#bdeeff';
    ctx.fill();
  }
}

function drawAcc(ctx, R, a, c) {
  ctx.save();
  if (a.flip) ctx.scale(-1, 1);
  ACC[a.name].draw(ctx, R, c);
  ctx.restore();
}

/** Static picture of a jelly, centred on (0,0): used for icons, the album and previews. */
export function drawPortrait(ctx, kind, R) {
  const def = defOf(kind);
  const c = colorsOf(kind);
  const place = (a) => {
    ctx.save();
    if (!ACC[a.name].center) {
      const ang = rad(a.angle);
      ctx.translate(Math.cos(ang) * R * (1 - a.inset), Math.sin(ang) * R * (1 - a.inset));
      ctx.rotate(ang + Math.PI / 2);
    }
    drawAcc(ctx, R, a, c);
    ctx.restore();
  };
  def.acc.filter((a) => !a.front).forEach(place);
  const rw = Math.max(2.5, R * 0.07);
  circle(ctx, 0, 0, R, css(c.rim));
  circle(ctx, 0, 0, R - rw, css(c.base));
  circle(ctx, -0.1 * R, -0.12 * R, R * 0.6, css(c.light));
  ctx.save();
  ctx.globalAlpha = 0.55;
  ellipse(ctx, -0.38 * R, -0.5 * R, 0.2 * R, 0.11 * R, '#ffffff', -0.6);
  ctx.restore();
  drawFace(ctx, R, kind, 'idle');
  def.acc.filter((a) => a.front).forEach(place);
}

// ---------- texture generation ----------

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

export const PORTRAIT_R = 60;
export const PORTRAIT_SIZE = PORTRAIT_R * 4.2;
export const EXPRESSIONS = ['idle', 'blink', 'happy', 'scared'];
export const accKey = (kind, i) => `acc_${kind}_${i}`;
export const faceKey = (kind, expr) => `face_${kind}_${expr}`;
export const portraitKey = (kind) => `portrait_${kind}`;
export const accSize = (name) => ACC[name].size;
export const accIsCentered = (name) => !!ACC[name].center;

export function makeTextures(scene) {
  const kinds = [...TIERS.keys(), 'star', 'bomb'];
  for (const kind of kinds) {
    const def = defOf(kind);
    const R = def.r;
    const c = colorsOf(kind);
    for (const expr of EXPRESSIONS) {
      canvasTex(scene, faceKey(kind, expr), R * 1.8, R * 1.8, (ctx) => drawFace(ctx, R, kind, expr));
    }
    def.acc.forEach((a, i) => {
      const size = ACC[a.name].size * R * 2;
      canvasTex(scene, accKey(kind, i), size, size, (ctx) => drawAcc(ctx, R, a, c));
    });
    canvasTex(scene, portraitKey(kind), PORTRAIT_SIZE, PORTRAIT_SIZE, (ctx) => drawPortrait(ctx, kind, PORTRAIT_R));
  }
  canvasTex(scene, 'shine', 64, 40, (ctx) => {
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
    g.addColorStop(0, 'rgba(255,255,255,.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.scale(1, 0.6);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, TAU);
    ctx.fill();
  });
  canvasTex(scene, 'dot', 20, 20, (ctx) => circle(ctx, 0, 0, 9, '#ffffff'));
  canvasTex(scene, 'spark', 40, 40, (ctx) => star(ctx, 0, 0, 18, 4, '#ffffff', 0.3));
  canvasTex(scene, 'icon_shake', 80, 80, (ctx) => {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.save();
    ctx.rotate(-0.2);
    ctx.beginPath();
    ctx.roundRect(-16, -20, 32, 42, 8);
    ctx.stroke();
    circle(ctx, -5, 8, 5, '#ffe14d');
    circle(ctx, 6, 0, 4, '#ff8fb8');
    ctx.restore();
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * 14, 0, 18, s > 0 ? -0.7 : Math.PI - 0.7, s > 0 ? 0.7 : Math.PI + 0.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s * 14, 0, 27, s > 0 ? -0.5 : Math.PI - 0.5, s > 0 ? 0.5 : Math.PI + 0.5);
      ctx.stroke();
    }
  });
}

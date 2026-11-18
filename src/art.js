// Procedural art. Planet surfaces are rendered pixel by pixel as noise-textured spheres,
// and a separate lighting layer (day/night terminator, atmosphere, highlight) is drawn
// over them, so the light stays put while a planet turns. No image files are shipped.

export const TEX_SCALE = Math.min(2, Math.max(1, Math.ceil(window.devicePixelRatio || 1)));

const TAU = Math.PI * 2;
const rad = (deg) => (deg * Math.PI) / 180;

/** Texture padding around a planet, in world units. */
export const PAD = 4;

// ---------- colour helpers ----------

export function shade(color, f) {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * f));
  const b = Math.min(255, Math.round((color & 255) * f));
  return (r << 16) | (g << 8) | b;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
function mixTo(out, c, t) {
  out[0] += (c[0] - out[0]) * t;
  out[1] += (c[1] - out[1]) * t;
  out[2] += (c[2] - out[2]) * t;
}
function scaleRGB(out, f) {
  out[0] *= f;
  out[1] *= f;
  out[2] *= f;
}

/** Colour ramp: stops are [position, 0xRRGGBB], sorted by position. */
function ramp(stops) {
  const ts = stops.map((s) => s[0]);
  const cs = stops.map((s) => rgb(s[1]));
  const last = cs.length - 1;
  return (t, out) => {
    let i = 1;
    while (i <= last && t > ts[i]) i++;
    if (i > last) {
      out[0] = cs[last][0];
      out[1] = cs[last][1];
      out[2] = cs[last][2];
      return;
    }
    const a = cs[i - 1];
    const b = cs[i];
    const k = clamp01((t - ts[i - 1]) / (ts[i] - ts[i - 1]));
    out[0] = a[0] + (b[0] - a[0]) * k;
    out[1] = a[1] + (b[1] - a[1]) * k;
    out[2] = a[2] + (b[2] - a[2]) * k;
  };
}

/** Repeating bands of colour by a continuous coordinate, with soft edges between bands. */
function bands(colors) {
  const cs = colors.map(rgb);
  const n = cs.length;
  return (t, out) => {
    const f = Math.floor(t);
    const i = ((f % n) + n) % n;
    const a = cs[i];
    const b = cs[(i + 1) % n];
    const k = smooth(0.3, 0.7, t - f);
    out[0] = a[0] + (b[0] - a[0]) * k;
    out[1] = a[1] + (b[1] - a[1]) * k;
    out[2] = a[2] + (b[2] - a[2]) * k;
  };
}

// ---------- noise ----------

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function grad(h, x, y, z) {
  h &= 15;
  const a = h < 8 ? x : y;
  const b = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return (h & 1 ? -a : a) + (h & 2 ? -b : b);
}

/** 3D gradient noise, roughly in [-1, 1]. */
function makeNoise(seed) {
  const rnd = seeded(seed * 7919 + 17);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  return (x, y, z) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const X = xi & 255;
    const Y = yi & 255;
    const Z = zi & 255;
    x -= xi;
    y -= yi;
    z -= zi;
    const u = x * x * x * (x * (x * 6 - 15) + 10);
    const v = y * y * y * (y * (y * 6 - 15) + 10);
    const w = z * z * z * (z * (z * 6 - 15) + 10);
    const A = perm[X] + Y;
    const AA = perm[A] + Z;
    const AB = perm[A + 1] + Z;
    const B = perm[X + 1] + Y;
    const BA = perm[B] + Z;
    const BB = perm[B + 1] + Z;
    const x1 = x - 1;
    const y1 = y - 1;
    const z1 = z - 1;
    const a0 = grad(perm[AA], x, y, z);
    const a1 = grad(perm[BA], x1, y, z);
    const b0 = grad(perm[AB], x, y1, z);
    const b1 = grad(perm[BB], x1, y1, z);
    const c0 = grad(perm[AA + 1], x, y, z1);
    const c1 = grad(perm[BA + 1], x1, y, z1);
    const d0 = grad(perm[AB + 1], x, y1, z1);
    const d1 = grad(perm[BB + 1], x1, y1, z1);
    const ab0 = a0 + u * (a1 - a0);
    const ab1 = b0 + u * (b1 - b0);
    const cd0 = c0 + u * (c1 - c0);
    const cd1 = d0 + u * (d1 - d0);
    const e0 = ab0 + v * (ab1 - ab0);
    const e1 = cd0 + v * (cd1 - cd0);
    return e0 + w * (e1 - e0);
  };
}

/** Fractal noise: octaves of the same noise at rising frequency. About [-1, 1], mostly within ±0.6. */
function fbm(n, x, y, z, octaves) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * n(x, y, z);
    norm += amp;
    x *= 2.03;
    y *= 2.03;
    z *= 2.03;
    amp *= 0.5;
  }
  return sum / norm;
}

// ---------- sphere geometry ----------

/** Unit vector for a latitude/longitude, in the planet's own frame (y points south, like the screen). */
function dirOf(lat, lon) {
  return [Math.cos(lat) * Math.sin(lon), -Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
}

/**
 * Distance to a feature centred at `c` on the sphere, measured in an ellipse of half-sizes
 * a (east-west) and b (north-south), in radii. Below 1 means inside. Infinity on the far side.
 */
function ellipseDist(P, c, a, b) {
  const dot = P[0] * c[0] + P[1] * c[1] + P[2] * c[2];
  if (dot <= 0) return Infinity;
  // east: perpendicular to the pole (y axis) and c; north completes the frame
  let ex = c[2];
  let ez = -c[0];
  const el = Math.hypot(ex, ez) || 1;
  ex /= el;
  ez /= el;
  const nx = -c[1] * ez;
  const ny = c[2] * ex - c[0] * ez;
  const nz = c[1] * ex;
  const dx = P[0] - c[0];
  const dy = P[1] - c[1];
  const dz = P[2] - c[2];
  const u = (dx * ex + dz * ez) / a;
  const v = (dx * nx + dy * ny + dz * nz) / b;
  return Math.sqrt(u * u + v * v);
}

function makeCraters(seed, count, rMin, rMax) {
  const rnd = seeded(seed);
  const list = [];
  for (let i = 0; i < count; i++) {
    const lat = Math.asin(rnd() * 2 - 1);
    const lon = rnd() * TAU;
    const r = rMin + (rMax - rMin) * Math.pow(rnd(), 1.5);
    list.push([...dirOf(lat, lon), r]);
  }
  return list;
}

const WHITE = [255, 255, 255];

/** Soft craters: a gently darker bowl and a faint lighter rim, no hard edges. */
function craters(list, P, out, strength) {
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const dx = P[0] - c[0];
    const dy = P[1] - c[1];
    const dz = P[2] - c[2];
    const t = Math.sqrt(dx * dx + dy * dy + dz * dz) / c[3];
    if (t > 1.5) continue;
    if (t < 1) scaleRGB(out, 1 - strength * 0.5 * smooth(1, 0.35, t));
    mixTo(out, WHITE, strength * 0.35 * Math.exp(-((t - 1.05) * (t - 1.05)) / 0.03));
  }
}

// ---------- planet surfaces ----------
// A soft, stylised look: gentle colours, a few large features, no fine noise.
// Each factory returns (P, mu, out) => void: P is the point on the unit sphere in the planet's
// own frame, mu is how directly it faces the viewer (1 at the centre, 0 at the edge) and
// out is [r, g, b, alpha 0..1].

const SURFACES = {
  mercury() {
    const n = makeNoise(16);
    const m = makeNoise(17);
    const list = makeCraters(18, 11, 0.08, 0.26);
    const col = ramp([[-0.6, 0x8f857c], [0, 0xa89d92], [0.6, 0xc9bfb3]]);
    const RAY = rgb(0xece4da);
    return (P, mu, out) => {
      col(fbm(n, P[0] * 2.4, P[1] * 2.4, P[2] * 2.4, 3) * 1.3, out);
      craters(list, P, out, 0.32);
      // a couple of young, bright craters with streaks of ejecta
      const ray = smooth(0.55, 0.85, Math.abs(m(P[0] * 6, P[1] * 6, P[2] * 6)));
      mixTo(out, RAY, ray * 0.18);
    };
  },

  moon() {
    const n = makeNoise(21);
    const m = makeNoise(22);
    const list = makeCraters(23, 8, 0.1, 0.26);
    const MARE = rgb(0xa9a6bf);
    return (P, mu, out) => {
      const g = fbm(n, P[0] * 2.2, P[1] * 2.2, P[2] * 2.2, 3);
      out[0] = 222 + g * 26;
      out[1] = 220 + g * 26;
      out[2] = 234 + g * 18;
      mixTo(out, MARE, smooth(0.04, 0.2, fbm(m, P[0] * 1.3, P[1] * 1.3, P[2] * 1.3, 3)) * 0.8);
      craters(list, P, out, 0.25);
    };
  },

  mars() {
    const n = makeNoise(31);
    const m = makeNoise(32);
    const q = makeNoise(33);
    const col = ramp([[-0.6, 0xd5603f], [0, 0xec8158], [0.6, 0xf6a37a]]);
    const DARK = rgb(0xc2563d);
    const CAP = rgb(0xfff6f0);
    return (P, mu, out) => {
      const lat = Math.asin(Math.max(-1, Math.min(1, -P[1])));
      col(fbm(n, P[0] * 2, P[1] * 2, P[2] * 2, 3) * 1.3, out);
      mixTo(out, DARK, smooth(0.06, 0.24, fbm(m, P[0] * 1.4, P[1] * 1.4, P[2] * 1.4, 3)) * 0.75);
      mixTo(out, CAP, smooth(1.12, 1.2, Math.abs(lat) + 0.05 * fbm(q, P[0] * 4, P[1] * 4, P[2] * 4, 2)));
    };
  },

  venus() {
    const n = makeNoise(41);
    const w = makeNoise(42);
    const col = ramp([[-0.8, 0xeeb867], [-0.2, 0xf6cf8a], [0.3, 0xfadfa8], [0.8, 0xfdeccb]]);
    return (P, mu, out) => {
      const lat = Math.asin(Math.max(-1, Math.min(1, -P[1])));
      const wx = fbm(w, P[0] * 1.4, P[1] * 1.4, P[2] * 1.4, 2);
      col(0.5 * Math.sin(lat * 5 + 2.2 * wx) + 0.35 * fbm(n, P[0] * 2.4, P[1] * 2.4, P[2] * 2.4, 2), out);
    };
  },

  earth() {
    const land = makeNoise(51);
    const tone = makeNoise(52);
    const cloud = makeNoise(53);
    const warp = makeNoise(54);
    const ocean = ramp([[0, 0x4aa8f7], [0.1, 0x3a8eec], [0.35, 0x2f74da]]);
    const GREEN = rgb(0x5fc86b);
    const LIGHT = rgb(0x93dc77);
    const SAND = rgb(0xe8cb85);
    const ICE = rgb(0xf4faff);
    return (P, mu, out) => {
      const lat = Math.asin(Math.max(-1, Math.min(1, -P[1])));
      const alat = Math.abs(lat);
      const e = fbm(land, P[0] * 1.5, P[1] * 1.5, P[2] * 1.5, 4) - 0.05;
      if (e < 0) {
        ocean(-e, out);
      } else {
        out[0] = GREEN[0];
        out[1] = GREEN[1];
        out[2] = GREEN[2];
        mixTo(out, LIGHT, smooth(-0.2, 0.3, fbm(tone, P[0] * 2.5, P[1] * 2.5, P[2] * 2.5, 2)) * 0.7);
        mixTo(out, SAND, smooth(0.2, 0.35, alat) * (1 - smooth(0.5, 0.65, alat)) * 0.8);
      }
      // a soft, light shoreline
      mixTo(out, [190, 232, 255], Math.exp(-(e * e) / 0.0004) * 0.5);
      mixTo(out, ICE, smooth(1.1, 1.2, alat + 0.05 * fbm(tone, P[0] * 4, P[1] * 4, P[2] * 4, 2)));
      const wq = fbm(warp, P[0] * 1.6, P[1] * 1.6, P[2] * 1.6, 2);
      const c = fbm(cloud, P[0] * 2.2 + wq, P[1] * 3.2, P[2] * 2.2 - wq, 3);
      mixTo(out, WHITE, smooth(0.12, 0.4, c) * 0.7);
    };
  },

  neptune() {
    const n = makeNoise(61);
    const w = makeNoise(62);
    const col = ramp([[-0.6, 0x3a6ce6], [0, 0x5288f5], [0.6, 0x8ab2ff]]);
    const spot = dirOf(-0.4, 0.35);
    const SPOT = rgb(0x2c58c9);
    return (P, mu, out) => {
      const lat = Math.asin(Math.max(-1, Math.min(1, -P[1])));
      col(0.35 * Math.sin(lat * 7 + 1.2 * fbm(w, P[0] * 2, P[1] * 2, P[2] * 2, 2)) + 0.3 * fbm(n, P[0] * 2.4, P[1] * 2.4, P[2] * 2.4, 2), out);
      const d = ellipseDist(P, spot, 0.24, 0.13);
      if (d < 1.4) mixTo(out, SPOT, 1 - smooth(0.6, 1.2, d));
      mixTo(out, WHITE, smooth(0.86, 0.97, 1 - Math.abs(n(P[0] * 3, P[1] * 16, P[2] * 3))) * smooth(0, 0.3, fbm(w, P[0] * 1.3 + 7, P[1] * 1.3, P[2] * 1.3, 2)) * 0.4);
    };
  },

  uranus() {
    const n = makeNoise(66);
    const col = ramp([[-0.6, 0x7fd9d6], [0, 0x9ce6e2], [0.6, 0xc3f3ef]]);
    return (P, mu, out) => {
      const lat = Math.asin(Math.max(-1, Math.min(1, -P[1])));
      // almost featureless: a soft haze with faint bands
      col(0.25 * Math.sin(lat * 6) + 0.25 * fbm(n, P[0] * 1.6, P[1] * 1.6, P[2] * 1.6, 2), out);
    };
  },

  saturn() {
    const w = makeNoise(72);
    const col = bands([0xf6e2b0, 0xeccb8e, 0xfaecca, 0xe4c086, 0xf4dca6, 0xe9c690]);
    return (P, mu, out) => {
      const lat = Math.asin(Math.max(-1, Math.min(1, -P[1])));
      col(lat * 4 + 0.18 * fbm(w, P[0] * 2.5, P[1] * 2.5, P[2] * 2.5, 2), out);
    };
  },

  jupiter() {
    const w = makeNoise(82);
    const col = bands([0xf8ead6, 0xeab28a, 0xfcf3e6, 0xdc9a72, 0xf5e0c6, 0xd38e68]);
    const grs = dirOf(-0.36, 0.55);
    const RED = rgb(0xe2774f);
    const RIM = rgb(0xfbe3cb);
    return (P, mu, out) => {
      const lat = Math.asin(Math.max(-1, Math.min(1, -P[1])));
      const wave = fbm(w, P[0] * 2.4, P[1] * 5, P[2] * 2.4, 3);
      col(lat * 4.6 + 0.4 * wave, out);
      const d = ellipseDist(P, grs, 0.3, 0.17);
      if (d < 1.5) {
        mixTo(out, RIM, smooth(1.45, 1.05, d) * 0.7);
        mixTo(out, RED, 1 - smooth(0.5, 1.0, d));
      }
    };
  },

  sun() {
    const n = makeNoise(91);
    const col = ramp([[0.55, 0xff9f2e], [0.75, 0xffc247], [0.9, 0xffe07a], [1, 0xfff4bf]]);
    return (P, mu, out) => {
      col(0.55 + 0.45 * Math.pow(mu, 0.6) + 0.06 * fbm(n, P[0] * 3, P[1] * 3, P[2] * 3, 3), out);
    };
  },

  redgiant() {
    const n = makeNoise(101);
    const col = ramp([[0.5, 0xe2483a], [0.72, 0xff6a4f], [0.9, 0xff9a76], [1, 0xffc3a3]]);
    return (P, mu, out) => {
      col(0.5 + 0.48 * Math.pow(mu, 0.7) + 0.08 * fbm(n, P[0] * 2.6, P[1] * 2.6, P[2] * 2.6, 3), out);
    };
  },

  bluegiant() {
    const n = makeNoise(106);
    const col = ramp([[0.5, 0x4f7dff], [0.72, 0x7fb0ff], [0.9, 0xc2dcff], [1, 0xf4f8ff]]);
    return (P, mu, out) => {
      col(0.5 + 0.48 * Math.pow(mu, 0.6) + 0.07 * fbm(n, P[0] * 3, P[1] * 3, P[2] * 3, 3), out);
    };
  },

  supernova() {
    const n = makeNoise(111);
    const m = makeNoise(112);
    const body = ramp([[0, 0xffffff], [0.35, 0xdaf3ff], [0.65, 0xa6c9ff], [1, 0xb79dff]]);
    const PINK = rgb(0xffa3dc);
    return (P, mu, out) => {
      const r = Math.sqrt(Math.max(0, 1 - mu * mu));
      body(r + 0.1 * fbm(m, P[0] * 2, P[1] * 2, P[2] * 2, 2), out);
      mixTo(out, PINK, smooth(0.82, 0.96, 1 - Math.abs(fbm(n, P[0] * 2.6, P[1] * 2.6, P[2] * 2.6, 3))) * smooth(0.3, 0.7, r) * 0.7);
      out[3] = 1 - 0.45 * smooth(0.86, 1, r);
    };
  },

  // a neutron star: a blinding white-blue core wrapped in magnetic loops
  pulsar() {
    const n = makeNoise(126);
    const body = ramp([[0, 0xffffff], [0.45, 0xd6f6ff], [0.75, 0x8ad4ff], [1, 0x9a7dff]]);
    const LOOP = rgb(0xf4e9ff);
    return (P, mu, out) => {
      const r = Math.sqrt(Math.max(0, 1 - mu * mu));
      body(r, out);
      const loops = 1 - Math.abs(n(P[0] * 2.2, P[1] * 5, P[2] * 2.2));
      mixTo(out, LOOP, smooth(0.86, 0.97, loops) * smooth(0.25, 0.75, r) * 0.8);
    };
  },

  blackhole() {
    const RING = rgb(0xffe2b0);
    return (P, mu, out) => {
      const r = Math.sqrt(Math.max(0, 1 - mu * mu));
      out[0] = 4;
      out[1] = 3;
      out[2] = 10;
      mixTo(out, RING, Math.exp(-((r - 0.94) * (r - 0.94)) / 0.0012)); // photon ring
    };
  },

  comet() {
    const n = makeNoise(121);
    const col = ramp([[-0.5, 0x8fb8e6], [0.2, 0xc6e2ff], [0.7, 0xf2fbff]]);
    return (P, mu, out) => {
      col(fbm(n, P[0] * 2.4, P[1] * 2.4, P[2] * 2.4, 3) * 1.3, out);
    };
  },

  // A star bomb: dark rock split by glowing cracks
  bomb() {
    const n = makeNoise(161);
    const m = makeNoise(162);
    const col = ramp([[-0.6, 0x2a2026], [0, 0x3d3036], [0.6, 0x5a4850]]);
    const HOT = rgb(0xff7a2e);
    const CORE = rgb(0xffe08a);
    return (P, mu, out) => {
      col(fbm(m, P[0] * 2.5, P[1] * 2.5, P[2] * 2.5, 3) * 1.3, out);
      const c = Math.abs(fbm(n, P[0] * 2.2, P[1] * 2.2, P[2] * 2.2, 3));
      const crack = 1 - smooth(0.02, 0.09, c);
      mixTo(out, HOT, crack);
      mixTo(out, CORE, (1 - smooth(0.0, 0.03, c)) * 0.8);
    };
  },

  // Dark matter: a dense, deep-black stone that looks impossible to break.
  // Chunky grain in a few close shades of near-black, with faint cold flecks.
  dark() {
    const n = makeNoise(141);
    const m = makeNoise(142);
    const SHADES = [rgb(0x07070b), rgb(0x0f0f15), rgb(0x18181f), rgb(0x22222b)];
    const FLECK = rgb(0x4b4a63);
    return (P, mu, out) => {
      // blocky grain: noise sampled on a coarse lattice, then snapped to a few shades
      const q = 9;
      const v = n(Math.floor(P[0] * q) + 0.5, Math.floor(P[1] * q) + 0.5, Math.floor(P[2] * q) + 0.5);
      const big = fbm(m, P[0] * 1.8, P[1] * 1.8, P[2] * 1.8, 2);
      const k = Math.max(0, Math.min(3, Math.floor((v * 0.8 + big * 0.6 + 0.6) * 2.4)));
      out[0] = SHADES[k][0];
      out[1] = SHADES[k][1];
      out[2] = SHADES[k][2];
      const fleck = n(Math.floor(P[0] * 26) + 0.5, Math.floor(P[1] * 26) + 0.5, Math.floor(P[2] * 26) + 0.5);
      if (fleck > 0.42) mixTo(out, FLECK, 0.6);
    };
  },
};

// ---------- the light layer ----------
// No shadows: roundness comes from a soft rim glow, a broad sheen and a small glossy spot,
// all a little stronger toward the upper left.

function glossFor(params) {
  const rim = rgb(params.rim);
  return (x, y, z, out) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    const over = (cr, cg, cb, ca) => {
      r = cr * ca + r * (1 - ca);
      g = cg * ca + g * (1 - ca);
      b = cb * ca + b * (1 - ca);
      a = ca + a * (1 - ca);
    };
    const upperLeft = smooth(-0.9, 0.9, -(x + y) * 0.7);
    over(rim[0], rim[1], rim[2], Math.min(1, Math.pow(1 - z, 2.4) * params.rimK * (0.55 + 0.45 * upperLeft)));
    const sx = x + 0.32;
    const sy = y + 0.38;
    over(255, 255, 255, Math.exp(-(sx * sx + sy * sy) / 0.2) * params.sheen);
    const gx = x + 0.4;
    const gy = y + 0.48;
    over(255, 255, 255, Math.exp(-(gx * gx + gy * gy * 2.2) / 0.012) * params.gloss);
    if (a > 0.0001) {
      out[0] = r / a;
      out[1] = g / a;
      out[2] = b / a;
    }
    out[3] = a;
  };
}

// ---------- parts drawn outside the disc: rings, glows, tails ----------
// size: half-extent of the canvas in planet radii. blend 'add' = drawn additively.

function glow(ctx, R, size, stops) {
  const g = ctx.createRadialGradient(0, 0, R * 0.55, 0, 0, size * R);
  stops.forEach(([at, c]) => g.addColorStop(at, c));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, size * R, 0, TAU);
  ctx.fill();
}

/** Half of an elliptical annulus (front = the half nearer the viewer, below the centre). */
function ringBand(ctx, R, r0, r1, tilt, color, front) {
  const a0 = front ? 0 : Math.PI;
  const a1 = front ? Math.PI : TAU;
  ctx.beginPath();
  ctx.ellipse(0, 0, r1 * R, r1 * R * tilt, 0, a0, a1, false);
  ctx.ellipse(0, 0, r0 * R, r0 * R * tilt, 0, a1, a0, true);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

const SATURN_RINGS = (() => {
  // ringlets from inside out: [inner, outer, r, g, b, alpha]
  const rnd = seeded(77);
  const list = [];
  const zones = [
    [1.2, 1.33, [214, 200, 176], 0.3], // faint inner ring
    [1.33, 1.6, [250, 234, 198], 0.92], // bright broad ring
    [1.6, 1.65, [60, 50, 40], 0.04], // the gap
    [1.65, 1.86, [238, 220, 184], 0.78], // outer ring
  ];
  for (const [a, b, c, al] of zones) {
    const steps = Math.max(1, Math.round((b - a) / 0.012));
    for (let i = 0; i < steps; i++) {
      const r0 = a + ((b - a) * i) / steps;
      const r1 = a + ((b - a) * (i + 1)) / steps;
      const k = 0.75 + rnd() * 0.5;
      list.push([r0, r1, c.map((v) => Math.min(255, Math.round(v * (0.92 + rnd() * 0.16)))), Math.min(1, al * k)]);
    }
  }
  list.push([1.76, 1.775, [20, 14, 10], 0.0]); // a thin gap in the outer ring
  return list;
})();

function satellite(ctx, s) {
  // solar wings
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 23 * s, -4 * s);
    const g = ctx.createLinearGradient(0, -9 * s, 0, 9 * s);
    g.addColorStop(0, '#2f5fd0');
    g.addColorStop(1, '#16307a');
    ctx.fillStyle = g;
    ctx.fillRect(-12 * s, -9 * s, 24 * s, 18 * s);
    ctx.strokeStyle = 'rgba(160,200,255,.55)';
    ctx.lineWidth = 0.8 * s;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 6 * s, -9 * s);
      ctx.lineTo(i * 6 * s, 9 * s);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-12 * s, 0);
    ctx.lineTo(12 * s, 0);
    ctx.stroke();
    ctx.strokeStyle = '#a9c6ff';
    ctx.lineWidth = 1.2 * s;
    ctx.strokeRect(-12 * s, -9 * s, 24 * s, 18 * s);
    ctx.restore();
  }
  ctx.fillStyle = '#8b93a6';
  ctx.fillRect(-12 * s, -5.5 * s, 24 * s, 3 * s);
  // body: gold foil hexagon
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    ctx.lineTo(Math.cos(a) * 10 * s, -4 * s + Math.sin(a) * 10 * s);
  }
  ctx.closePath();
  const gb = ctx.createLinearGradient(-10 * s, -14 * s, 10 * s, 6 * s);
  gb.addColorStop(0, '#fff1b8');
  gb.addColorStop(0.5, '#e0a93a');
  gb.addColorStop(1, '#8a5a12');
  ctx.fillStyle = gb;
  ctx.fill();
  ctx.strokeStyle = '#5c3b0a';
  ctx.lineWidth = 1 * s;
  ctx.stroke();
  // emitter barrel pointing down, glowing lens
  ctx.fillStyle = '#c9ced9';
  ctx.fillRect(-4 * s, 4 * s, 8 * s, 10 * s);
  ctx.fillStyle = '#6f7686';
  ctx.fillRect(-5 * s, 12 * s, 10 * s, 3 * s);
  ctx.shadowColor = '#ff3bd2';
  ctx.shadowBlur = 8 * s;
  ctx.beginPath();
  ctx.arc(0, 17 * s, 4 * s, 0, TAU);
  ctx.fillStyle = '#ff6ae0';
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(-1.2 * s, 16 * s, 1.4 * s, 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

const PARTS = {
  saturnRing: {
    size: 2,
    draw(ctx, R, front) {
      ctx.rotate(rad(-14));
      for (const [r0, r1, c, al] of SATURN_RINGS) {
        if (al <= 0.01) continue;
        ringBand(ctx, R, r0, r1, 0.3, `rgba(${c[0]},${c[1]},${c[2]},${al})`, front);
      }
    },
  },
  sunGlow: {
    size: 1.9,
    blend: 'add',
    spin: 'slow',
    draw(ctx, R) {
      glow(ctx, R, 1.9, [[0, 'rgba(255,214,110,.8)'], [0.35, 'rgba(255,160,50,.32)'], [1, 'rgba(255,120,20,0)']]);
      // coronal streamers
      const rnd = seeded(5);
      for (let i = 0; i < 12; i++) {
        ctx.save();
        ctx.rotate((i / 12) * TAU + rnd() * 0.4);
        const len = (1.35 + rnd() * 0.5) * R;
        const g = ctx.createLinearGradient(R * 0.8, 0, len, 0);
        g.addColorStop(0, 'rgba(255,220,140,.35)');
        g.addColorStop(1, 'rgba(255,170,60,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(R * 0.85, -R * 0.12);
        ctx.quadraticCurveTo(len * 0.8, -R * 0.03, len, 0);
        ctx.quadraticCurveTo(len * 0.8, R * 0.03, R * 0.85, R * 0.12);
        ctx.fill();
        ctx.restore();
      }
    },
  },
  redGlow: {
    size: 1.7,
    blend: 'add',
    draw(ctx, R) {
      glow(ctx, R, 1.7, [[0, 'rgba(255,90,50,.72)'], [0.4, 'rgba(220,40,30,.25)'], [1, 'rgba(160,20,20,0)']]);
    },
  },
  novaGlow: {
    size: 2.2,
    blend: 'add',
    spin: 'slow',
    draw(ctx, R) {
      glow(ctx, R, 2.1, [[0, 'rgba(190,225,255,.85)'], [0.35, 'rgba(120,150,255,.3)'], [1, 'rgba(90,100,255,0)']]);
      // shock-front wisps
      const rnd = seeded(9);
      for (let i = 0; i < 26; i++) {
        const a = rnd() * TAU;
        const d = (1.05 + rnd() * 0.7) * R;
        ctx.save();
        ctx.rotate(a);
        ctx.fillStyle = i % 3 ? 'rgba(255,150,90,.18)' : 'rgba(150,200,255,.22)';
        ctx.beginPath();
        ctx.ellipse(d, 0, R * (0.12 + rnd() * 0.18), R * 0.035, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      // diffraction spikes
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI) / 2 + Math.PI / 4);
        const g = ctx.createLinearGradient(0, 0, 2.2 * R, 0);
        g.addColorStop(0, 'rgba(255,255,255,.9)');
        g.addColorStop(1, 'rgba(170,210,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, -R * 0.05);
        ctx.lineTo(2.2 * R, 0);
        ctx.lineTo(0, R * 0.05);
        ctx.fill();
        ctx.restore();
      }
    },
  },
  uranusRing: {
    size: 1.9,
    draw(ctx, R, front) {
      // Uranus lies on its side, so its thin rings stand almost upright
      ctx.rotate(rad(78));
      for (const [r0, r1, al] of [[1.42, 1.5, 0.55], [1.58, 1.64, 0.4], [1.7, 1.73, 0.3]]) {
        ringBand(ctx, R, r0, r1, 0.22, `rgba(220,250,255,${al})`, front);
      }
    },
  },
  blueGlow: {
    size: 1.8,
    blend: 'add',
    spin: 'slow',
    draw(ctx, R) {
      glow(ctx, R, 1.8, [[0, 'rgba(150,190,255,.85)'], [0.35, 'rgba(90,130,255,.32)'], [1, 'rgba(70,90,255,0)']]);
      for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.rotate((i / 6) * TAU + 0.3);
        const g = ctx.createLinearGradient(0, 0, 1.75 * R, 0);
        g.addColorStop(0, 'rgba(230,240,255,.6)');
        g.addColorStop(1, 'rgba(150,180,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(R * 0.8, -R * 0.06);
        ctx.lineTo(1.75 * R, 0);
        ctx.lineTo(R * 0.8, R * 0.06);
        ctx.fill();
        ctx.restore();
      }
    },
  },
  pulsarGlow: {
    size: 2,
    blend: 'add',
    draw(ctx, R) {
      glow(ctx, R, 2, [[0, 'rgba(180,230,255,.85)'], [0.35, 'rgba(150,120,255,.3)'], [1, 'rgba(120,80,255,0)']]);
    },
  },
  pulsarBeams: {
    size: 3.2,
    blend: 'add',
    spin: 'fast',
    draw(ctx, R) {
      // two beams of light from the magnetic poles; the part turns, sweeping them around
      for (const dir of [-1, 1]) {
        const g = ctx.createLinearGradient(0, 0, 0, dir * 3.1 * R);
        g.addColorStop(0, 'rgba(255,255,255,.95)');
        g.addColorStop(0.4, 'rgba(160,230,255,.5)');
        g.addColorStop(1, 'rgba(140,120,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-R * 0.12, dir * R * 0.6);
        ctx.lineTo(-R * 0.55, dir * 3.1 * R);
        ctx.lineTo(R * 0.55, dir * 3.1 * R);
        ctx.lineTo(R * 0.12, dir * R * 0.6);
        ctx.fill();
      }
    },
  },
  holeGlow: {
    size: 2.4,
    blend: 'add',
    draw(ctx, R) {
      glow(ctx, R, 2.4, [[0, 'rgba(255,160,70,.55)'], [0.4, 'rgba(190,80,220,.2)'], [1, 'rgba(90,30,160,0)']]);
    },
  },
  holeDisk: {
    size: 2.4,
    draw(ctx, R, front) {
      ctx.rotate(rad(-10));
      const tilt = 0.24;
      // brighter on the side turning toward us
      const g = ctx.createLinearGradient(-2.3 * R, 0, 2.3 * R, 0);
      g.addColorStop(0, 'rgba(255,248,225,1)');
      g.addColorStop(0.45, 'rgba(255,190,90,1)');
      g.addColorStop(1, 'rgba(200,70,30,.85)');
      for (const [r0, r1, al] of [[1.25, 2.25, 0.35], [1.25, 1.85, 0.6], [1.25, 1.5, 0.95]]) {
        ctx.globalAlpha = al;
        ringBand(ctx, R, r0, r1, tilt, g, front);
      }
      ctx.globalAlpha = 1;
      if (!front) {
        // light from the far side of the disk, bent up over the top of the hole
        ctx.rotate(rad(10));
        ctx.lineCap = 'round';
        for (const [rr, w, al] of [[1.12, 0.2, 0.35], [1.08, 0.09, 0.9]]) {
          ctx.beginPath();
          ctx.arc(0, 0, rr * R, Math.PI * 1.04, Math.PI * 1.96);
          ctx.strokeStyle = `rgba(255,214,150,${al})`;
          ctx.lineWidth = w * R;
          ctx.stroke();
        }
      }
    },
  },
  coma: {
    size: 2.4,
    blend: 'add',
    draw(ctx, R) {
      glow(ctx, R, 2.4, [[0, 'rgba(190,250,255,.9)'], [0.3, 'rgba(110,210,255,.35)'], [1, 'rgba(80,160,255,0)']]);
    },
  },
  cometTail: {
    size: 4.2,
    blend: 'add',
    spin: 'velocity',
    draw(ctx, R) {
      // points along -x; turned so it trails behind the motion
      const dust = ctx.createLinearGradient(0, 0, -4 * R, 0);
      dust.addColorStop(0, 'rgba(255,245,215,.7)');
      dust.addColorStop(1, 'rgba(255,220,170,0)');
      ctx.fillStyle = dust;
      ctx.beginPath();
      ctx.moveTo(0, -0.9 * R);
      ctx.quadraticCurveTo(-2 * R, -0.4 * R, -4 * R, 0.9 * R);
      ctx.quadraticCurveTo(-2 * R, 0.6 * R, 0, 0.9 * R);
      ctx.fill();
      const ion = ctx.createLinearGradient(0, 0, -4.1 * R, 0);
      ion.addColorStop(0, 'rgba(150,220,255,.9)');
      ion.addColorStop(1, 'rgba(80,140,255,0)');
      ctx.fillStyle = ion;
      ctx.beginPath();
      ctx.moveTo(0, -0.45 * R);
      ctx.lineTo(-4.1 * R, -0.08 * R);
      ctx.lineTo(-4.1 * R, 0.08 * R);
      ctx.lineTo(0, 0.45 * R);
      ctx.fill();
    },
  },
  darkHalo: {
    size: 1.9,
    draw(ctx, R) {
      // a heavy, smoky darkness around it, edged with a cold violet line
      const g = ctx.createRadialGradient(0, 0, R * 0.9, 0, 0, R * 1.85);
      g.addColorStop(0, 'rgba(6,4,16,.75)');
      g.addColorStop(0.45, 'rgba(14,8,34,.35)');
      g.addColorStop(1, 'rgba(14,8,34,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.85, 0, TAU);
      ctx.fill();
      ctx.lineWidth = R * 0.035;
      ctx.strokeStyle = 'rgba(150,130,255,.45)';
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.04, 0, TAU);
      ctx.stroke();
    },
  },
  darkSpark: {
    size: 1.7,
    blend: 'add',
    spin: 'slow',
    draw(ctx, R) {
      const rnd = seeded(14);
      for (let i = 0; i < 18; i++) {
        const a = rnd() * TAU;
        const d = R * (1.12 + rnd() * 0.4);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * d, Math.sin(a) * d, R * (0.012 + rnd() * 0.02), 0, TAU);
        ctx.fillStyle = `rgba(170,150,255,${0.35 + rnd() * 0.5})`;
        ctx.fill();
      }
    },
  },
  bombGlow: {
    size: 1.8,
    blend: 'add',
    draw(ctx, R) {
      glow(ctx, R, 1.8, [[0, 'rgba(255,170,80,.75)'], [0.35, 'rgba(255,110,40,.28)'], [1, 'rgba(255,80,20,0)']]);
      // a burning fuse on top
      ctx.strokeStyle = 'rgba(255,220,150,.9)';
      ctx.lineWidth = R * 0.08;
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.95);
      ctx.quadraticCurveTo(R * 0.25, -R * 1.25, R * 0.12, -R * 1.45);
      ctx.stroke();
      const s = ctx.createRadialGradient(R * 0.12, -R * 1.45, 0, R * 0.12, -R * 1.45, R * 0.32);
      s.addColorStop(0, 'rgba(255,255,220,1)');
      s.addColorStop(0.4, 'rgba(255,200,90,.8)');
      s.addColorStop(1, 'rgba(255,120,30,0)');
      ctx.fillStyle = s;
      ctx.beginPath();
      ctx.arc(R * 0.12, -R * 1.45, R * 0.32, 0, TAU);
      ctx.fill();
    },
  },
  darkTrail: {
    size: 3.6,
    spin: 'velocity',
    draw(ctx, R) {
      const g = ctx.createLinearGradient(0, 0, -3.5 * R, 0);
      g.addColorStop(0, 'rgba(10,6,26,.7)');
      g.addColorStop(0.6, 'rgba(40,24,90,.25)');
      g.addColorStop(1, 'rgba(60,40,140,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -0.98 * R);
      ctx.quadraticCurveTo(-1.8 * R, -0.62 * R, -3.5 * R, 0);
      ctx.quadraticCurveTo(-1.8 * R, 0.62 * R, 0, 0.98 * R);
      ctx.fill();
    },
  },
};

// ---------- the chain ----------
// light: lighting-layer parameters, or null for bodies that shine on their own.
// parts: [name, front?] - drawn behind the planet unless front is true.

// rim: colour of the soft glow around the edge; rimK its strength; sheen and gloss the highlights
const ROCK = { rim: 0xffffff, rimK: 0.35, sheen: 0.12, gloss: 0.32 };
const STAR = { rim: 0xfff8dc, rimK: 0.3, sheen: 0.1, gloss: 0 };

export const TIERS = [
  { name: 'Moon', r: 20, color: 0xdcdaea, surface: 'moon', light: ROCK, parts: [] },
  { name: 'Mercury', r: 24, color: 0xb1a69b, surface: 'mercury', light: ROCK, parts: [] },
  { name: 'Mars', r: 28, color: 0xec8158, surface: 'mars', light: { rim: 0xffd2bf, rimK: 0.45, sheen: 0.12, gloss: 0.35 }, parts: [] },
  { name: 'Venus', r: 33, color: 0xf6cf8a, surface: 'venus', light: { rim: 0xfff4da, rimK: 0.5, sheen: 0.12, gloss: 0.35 }, parts: [] },
  { name: 'Earth', r: 39, color: 0x3a8eec, surface: 'earth', light: { rim: 0xb8e2ff, rimK: 0.65, sheen: 0.12, gloss: 0.45 }, parts: [] },
  { name: 'Neptune', r: 45, color: 0x5288f5, surface: 'neptune', light: { rim: 0xc6e8ff, rimK: 0.6, sheen: 0.12, gloss: 0.4 }, parts: [] },
  { name: 'Uranus', r: 52, color: 0x9ce6e2, surface: 'uranus', light: { rim: 0xe2fffd, rimK: 0.55, sheen: 0.12, gloss: 0.4 }, parts: [['uranusRing', false], ['uranusRing', true]] },
  { name: 'Saturn', r: 60, color: 0xf0d39c, surface: 'saturn', light: { rim: 0xfff4dc, rimK: 0.45, sheen: 0.12, gloss: 0.35 }, parts: [['saturnRing', false], ['saturnRing', true]] },
  { name: 'Jupiter', r: 69, color: 0xeab28a, surface: 'jupiter', light: { rim: 0xffefe0, rimK: 0.45, sheen: 0.12, gloss: 0.35 }, parts: [] },
  { name: 'Sun', r: 79, color: 0xffc247, surface: 'sun', light: STAR, parts: [['sunGlow', false]] },
  { name: 'Red Giant', r: 90, color: 0xff6a4f, surface: 'redgiant', light: STAR, parts: [['redGlow', false]] },
  { name: 'Blue Giant', r: 102, color: 0x8ab4ff, surface: 'bluegiant', light: { rim: 0xeaf2ff, rimK: 0.35, sheen: 0.1, gloss: 0 }, parts: [['blueGlow', false]] },
  { name: 'Supernova', r: 115, color: 0xa6c9ff, surface: 'supernova', light: null, parts: [['novaGlow', false]] },
  { name: 'Pulsar', r: 129, color: 0xb6e6ff, surface: 'pulsar', light: null, parts: [['pulsarGlow', false], ['pulsarBeams', false]] },
  { name: 'Black Hole', r: 85, color: 0xffb347, surface: 'blackhole', light: null, parts: [['holeGlow', false], ['holeDisk', false], ['holeDisk', true]] },
];

export const SPECIALS = {
  comet: { name: 'Comet', r: 24, color: 0xc6e2ff, surface: 'comet', light: { rim: 0xe6fcff, rimK: 0.7, sheen: 0.14, gloss: 0.45 }, parts: [['coma', false], ['cometTail', false]] },
  // launched now and then: blows the small planets around it away
  bomb: { name: 'Star Bomb', r: 26, color: 0xff7a2e, surface: 'bomb', light: { rim: 0xffb27a, rimK: 0.5, sheen: 0.08, gloss: 0.4 }, parts: [['bombGlow', false]] },
  // a dense ball of dark matter: deep black, a cold violet edge, a hard polished glint
  wrecker: { name: 'Dark Matter', r: 72, color: 0x2a2440, surface: 'dark', light: { rim: 0x9a88ff, rimK: 0.55, sheen: 0.05, gloss: 0.55 }, parts: [['darkTrail', false], ['darkHalo', false], ['darkSpark', false]] },
};

export const HOLE = TIERS.length - 1; // the black hole
export const MAX_PLANET = HOLE - 1; // the largest ordinary body

export const defOf = (kind) => (typeof kind === 'number' ? TIERS[kind] : SPECIALS[kind]);
export const partInfo = (name) => PARTS[name];

// ---------- skins ----------
// The chain, Moon to Pulsar, can be drawn in a skin: its own surfaces, light layer and parts,
// not just a colour filter. Textures are keyed by skin, so only the skin in use is ever made.
// The black hole and the special bodies (comet, bomb, dark matter) always keep their own look.

export const ART_SKINS = ['classic', 'kawaii', 'candy', 'pixel', 'neon'];
let SKIN = 'classic';

export function setArtSkin(id) {
  SKIN = ART_SKINS.includes(id) ? id : 'classic';
}

export const artSkin = () => SKIN;
export const wearsSkin = (kind) => typeof kind === 'number' && kind < HOLE;
const skinOf = (kind, skin) => (wearsSkin(kind) ? skin || SKIN : 'classic');
const tagOf = (kind, skin) => {
  const s = skinOf(kind, skin);
  return s === 'classic' ? String(kind) : `${s}_${kind}`;
};

function toHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function fromHsl(h, s, l, out) {
  const hue = (t) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  out[0] = 255 * (s ? hue(h + 1 / 3) : l);
  out[1] = 255 * (s ? hue(h) : l);
  out[2] = 255 * (s ? hue(h - 1 / 3) : l);
  return out;
}

/** Soft, milky pastel of a colour (kawaii). */
function pastelize(out) {
  const [h, s, l] = toHsl(out[0], out[1], out[2]);
  return fromHsl(h, Math.min(0.66, s * 0.8 + 0.16), 0.7 + l * 0.2, out);
}

/** The glowing tube colour of a body's colour (neon): full saturation, bright. */
function neonOf(color) {
  const [r, g, b] = rgb(color);
  const [h, s] = toHsl(r, g, b);
  return fromHsl(h, s < 0.08 ? 0 : 1, s < 0.08 ? 0.85 : 0.62, [0, 0, 0]).map(Math.round);
}
/** The same, as 0xRRGGBB (for tints). */
export function neonColor(color) {
  const c = neonOf(color);
  return (c[0] << 16) | (c[1] << 8) | c[2];
}
const css3 = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

function eachPixel(canvas, fn) {
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const px = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    px[0] = d[i];
    px[1] = d[i + 1];
    px[2] = d[i + 2];
    d[i + 3] = fn(px, d[i + 3]);
    d[i] = px[0];
    d[i + 1] = px[1];
    d[i + 2] = px[2];
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// --- pixel: everything sits on one grid of big square pixels, with a limited palette ---

const PX = 3.2; // world units per pixel

/** Snaps colours to a small palette: a few hues, saturations and shades (never quite white). */
function paletteSnap(px) {
  const [h, s, l] = toHsl(px[0], px[1], px[2]);
  fromHsl(Math.round(h * 24) / 24, Math.round(s * 4) / 4, Math.min(6 / 7, Math.round(l * 7) / 7), px);
}

/**
 * A part turned into pixels: cells across its canvas, snapped colours. A solid part (a ring) gets
 * stepped alpha, kept even where it is thin; a glow keeps its smooth alpha, so it shades off in
 * blocks instead of becoming a dull disc.
 */
function pixelateCanvas(canvas, cells, glowing) {
  const small = document.createElement('canvas');
  small.width = cells;
  small.height = cells;
  const sctx = small.getContext('2d');
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(canvas, 0, 0, cells, cells);
  eachPixel(small, (px, a) => {
    paletteSnap(px);
    if (glowing) return a;
    return a < 20 ? 0 : Math.ceil((a / 255) * 4) * 63.75;
  });
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, canvas.width, canvas.height);
  ctx.restore();
  return canvas;
}

/** A sphere on a coarse grid: one shader sample per cell, hard edges. */
function renderGrid(cells, rCells, shadeFn, frame) {
  const canvas = document.createElement('canvas');
  canvas.width = cells;
  canvas.height = cells;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(cells, cells);
  const d = img.data;
  const c = cells / 2;
  const out = [0, 0, 0, 1];
  const P = [0, 0, 0];
  const edge = 1 + 0.35 / rCells;
  for (let j = 0; j < cells; j++) {
    const y0 = (j + 0.5 - c) / rCells;
    for (let i = 0; i < cells; i++) {
      const x0 = (i + 0.5 - c) / rCells;
      const rr = x0 * x0 + y0 * y0;
      if (rr > edge) continue;
      const k = rr > 0.998 ? 0.998 / Math.sqrt(rr) : 1;
      const x = x0 * k;
      const y = y0 * k;
      const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
      out[3] = 1;
      if (frame) {
        frame(x, y, z, P);
        shadeFn(P, z, out);
      } else {
        shadeFn(x, y, z, out);
      }
      const o = (j * cells + i) * 4;
      d[o] = out[0];
      d[o + 1] = out[1];
      d[o + 2] = out[2];
      d[o + 3] = Math.round(255 * clamp01(out[3]));
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function upscale(small, size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, size, size);
  return c;
}

const gridOf = (def) => Math.max(10, Math.round(((def.r + PAD) * 2) / PX));

/** Pixel shading, fixed on screen: a dark outline, two steps of shadow, a hard highlight. */
function pixelLight(def, rCells, kind) {
  const edge = 1 - 1.1 / rCells;
  const OUT = rgb(shade(def.color, 0.32));
  const star = kind >= 9;
  const L = [-0.45, -0.55, 0.7];
  const ll = Math.hypot(L[0], L[1], L[2]);
  return (x, y, z, out) => {
    if (Math.hypot(x, y) > edge) {
      out[0] = OUT[0];
      out[1] = OUT[1];
      out[2] = OUT[2];
      out[3] = 1;
      return;
    }
    const lam = (x * L[0] + y * L[1] + z * L[2]) / ll;
    out[0] = 255;
    out[1] = 255;
    out[2] = 255;
    if (lam > 0.93) out[3] = 0.62;
    else if (lam > 0.86) out[3] = 0.22;
    else if (!star && lam < 0.08) {
      out[0] = OUT[0];
      out[1] = OUT[1];
      out[2] = OUT[2];
      out[3] = 0.42;
    } else if (!star && lam < 0.36) {
      out[0] = OUT[0];
      out[1] = OUT[1];
      out[2] = OUT[2];
      out[3] = 0.2;
    } else out[3] = 0;
  };
}

// --- candy: glossy hard candy and jelly, each body its own flavour ---

const CANDY_COLORS = [0xff6fa8, 0xffd84d, 0x6fe3b4, 0x6fb8ff, 0xff9a4d, 0xffffff, 0xc59bff];
// [pattern, colour A, colour B]
const CANDY = [
  ['sprinkles', 0xf8f1ff, 0xe2d3fb], // Moon: a sugared gumdrop with sprinkles
  ['swirl', 0xc98a46, 0xf8e6c6], // Mercury: caramel swirl
  ['swirl', 0xff4d6e, 0xfff0f3], // Mars: strawberry swirl
  ['bands', 0xffd13d, 0xfff6c4], // Venus: lemon drop
  ['marble', 0x3ea8ff, 0x86e36a], // Earth: blue raspberry and green apple
  ['swirl', 0x5068ff, 0xeef1ff], // Neptune: blueberry mint
  ['swirl', 0x2fdcc4, 0xf0fffb], // Uranus: spearmint
  ['jelly', 0xffa45c, 0xffe8cc], // Saturn: peach jelly
  ['gobstopper', 0xff7a59, 0xfff2e0], // Jupiter: a gobstopper
  ['jelly', 0xff9a1a, 0xfff0a0], // Sun: orange jelly
  ['jelly', 0xff2f55, 0xffc4cf], // Red Giant: cherry jelly
  ['jelly', 0x4a86ff, 0xd8e8ff], // Blue Giant: blue raspberry jelly
  ['cotton', 0xff9ad6, 0x9ad8ff], // Supernova: cotton candy
  ['rainbow', 0xffffff, 0xffffff], // Pulsar: a rainbow lollipop
];
const GOBSTOPPER = [0xff7a59, 0xffd166, 0xff8fc8, 0x9b7bff, 0x6fe3b4, 0xfff2e0];

function capsules(seed, count, size) {
  const rnd = seeded(seed);
  const list = [];
  for (let i = 0; i < count; i++) {
    const lat = Math.asin(rnd() * 2 - 1);
    const lon = rnd() * TAU;
    list.push({ c: dirOf(lat, lon), turn: rnd() * Math.PI, color: rgb(CANDY_COLORS[i % CANDY_COLORS.length]), len: size * (0.8 + rnd() * 0.5) });
  }
  return list;
}

/** Is P on one of the sprinkles? Returns its colour, or null. */
function onSprinkle(list, P, width) {
  for (const s of list) {
    const c = s.c;
    const dot = P[0] * c[0] + P[1] * c[1] + P[2] * c[2];
    if (dot < 0.9) continue;
    let ex = c[2];
    let ez = -c[0];
    const el = Math.hypot(ex, ez) || 1;
    ex /= el;
    ez /= el;
    const nx = -c[1] * ez;
    const ny = c[2] * ex - c[0] * ez;
    const nz = c[1] * ex;
    const dx = P[0] - c[0];
    const dy = P[1] - c[1];
    const dz = P[2] - c[2];
    const u = dx * ex + dz * ez;
    const v = dx * nx + dy * ny + dz * nz;
    const cs = Math.cos(s.turn);
    const sn = Math.sin(s.turn);
    const a = Math.abs(u * cs + v * sn);
    const b = Math.abs(-u * sn + v * cs);
    const along = Math.max(0, a - s.len / 2);
    if (along * along + b * b < width * width) return s.color;
  }
  return null;
}

function candySurface(kind) {
  const [pattern, ca, cb] = CANDY[kind];
  const A = rgb(ca);
  const B = rgb(cb);
  const EDGE = rgb(shade(ca, 0.72));
  const n = makeNoise(300 + kind);
  const m = makeNoise(320 + kind);
  const sprinkles = pattern === 'sprinkles' || kind === 4 ? capsules(340 + kind, kind === 4 ? 16 : 34, 0.13) : null;
  const bubbles = pattern === 'jelly' ? makeCraters(360 + kind, 7, 0.05, 0.12) : null;
  const gob = bands(GOBSTOPPER);
  const tmp = [0, 0, 0];
  return (P, mu, out) => {
    const lat = Math.asin(Math.max(-1, Math.min(1, -P[1])));
    const lon = Math.atan2(P[0], P[2]);
    let t = 0;
    if (pattern === 'swirl') t = smooth(-0.18, 0.18, Math.sin(lon * 4 + lat * 5));
    else if (pattern === 'bands') t = smooth(-0.25, 0.25, Math.sin(lat * 9 + 0.6 * fbm(n, P[0] * 2, P[1] * 2, P[2] * 2, 2)));
    else if (pattern === 'marble') t = smooth(-0.3, 0.3, Math.sin((P[0] + P[1] * 0.6) * 5 + 5 * fbm(n, P[0] * 1.6, P[1] * 1.6, P[2] * 1.6, 3)));
    else if (pattern === 'cotton') t = smooth(-0.15, 0.2, fbm(n, P[0] * 2.4, P[1] * 2.4, P[2] * 2.4, 4));
    else if (pattern === 'sprinkles') t = smooth(-0.3, 0.4, fbm(n, P[0] * 2, P[1] * 2, P[2] * 2, 2)) * 0.5;
    else if (pattern === 'jelly') t = Math.pow(mu, 1.6) * 0.75;
    out[0] = A[0] + (B[0] - A[0]) * t;
    out[1] = A[1] + (B[1] - A[1]) * t;
    out[2] = A[2] + (B[2] - A[2]) * t;
    if (pattern === 'gobstopper') gob(lat * 4.2 + 0.25 * fbm(n, P[0] * 2.2, P[1] * 2.2, P[2] * 2.2, 2), out);
    if (pattern === 'rainbow') {
      const h = (lon / TAU) * 2 + lat * 0.7;
      fromHsl(h, 0.85, 0.66, out);
      mixTo(out, WHITE, smooth(0.9, 0.99, Math.cos(lon * 6 + lat * 4.2)) * 0.85); // thin white spirals
    }
    if (pattern === 'cotton') mixTo(out, WHITE, smooth(0.18, 0.42, fbm(m, P[0] * 3, P[1] * 3, P[2] * 3, 3)) * 0.65);
    if (bubbles) {
      for (const c of bubbles) {
        const dx = P[0] - c[0];
        const dy = P[1] - c[1];
        const dz = P[2] - c[2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) / c[3];
        if (d < 1.2) mixTo(out, WHITE, (smooth(1.15, 0.95, d) - smooth(0.85, 0.4, d) * 0.6) * 0.5);
      }
    }
    if (sprinkles) {
      const sc = onSprinkle(sprinkles, P, 0.028);
      if (sc) {
        tmp[0] = sc[0];
        tmp[1] = sc[1];
        tmp[2] = sc[2];
        mixTo(out, tmp, 0.95);
      }
    }
    // hard candy: a deeper colour toward the edge, a glow inside
    mixTo(out, EDGE, Math.pow(1 - mu, 2.2) * 0.4);
    scaleRGB(out, 1 + 0.07 * mu);
    if (out[0] > 255) out[0] = 255;
    if (out[1] > 255) out[1] = 255;
    if (out[2] > 255) out[2] = 255;
  };
}

/** Candy shine: a sharp window-shaped highlight, a softer sheen and a small reflection below. */
function candyLight() {
  return (x, y, z, out) => {
    let a = 0;
    const add = (v) => (a = a + v * (1 - a));
    add(Math.min(1, Math.pow(1 - z, 3) * 0.32));
    const sx = x + 0.3;
    const sy = y + 0.36;
    add(Math.exp(-(sx * sx + sy * sy) / 0.16) * 0.22);
    const gx = x + 0.36;
    const gy = y + 0.46;
    add(smooth(0.016, 0.006, gx * gx * 1.4 + gy * gy * 2.6) * 0.92);
    const rx = x - 0.42;
    const ry = y - 0.5;
    add(Math.exp(-(rx * rx * 2.5 + ry * ry * 6) / 0.012) * 0.38);
    out[0] = 255;
    out[1] = 255;
    out[2] = 255;
    out[3] = a;
  };
}

// --- neon: dark glass spheres traced with glowing lines ---

function neonSurface(kind) {
  const def = TIERS[kind];
  const col = neonOf(def.color);
  const n = makeNoise(500 + kind);
  const star = kind >= 9;
  const w = 1.5 / def.r; // line width, about 1.5 world units whatever the size
  const halo = 5 / def.r;
  const latStep = def.r < 40 ? Math.PI / 4 : Math.PI / 6;
  const lonStep = def.r < 40 ? Math.PI / 3 : Math.PI / 6;
  const BASE = col.map((v) => v * 0.07 + 5);
  return (P, mu, out) => {
    const lat = Math.asin(Math.max(-1, Math.min(1, -P[1])));
    const lon = Math.atan2(P[0], P[2]);
    let dLat = Math.abs(lat - Math.round(lat / latStep) * latStep);
    let dLon = Math.abs(lon - Math.round(lon / lonStep) * lonStep) * Math.cos(lat);
    if (Math.abs(lat) > 1.25) dLon = 9; // no crowding at the poles
    let I = 0;
    const line = (d, k) => {
      const v = Math.exp(-(d * d) / (w * w)) + 0.32 * Math.exp(-(d * d) / (halo * halo));
      if (v * k > I) I = v * k;
    };
    line(dLat, 0.75);
    line(dLon, 0.6);
    // the body's own features become glowing contour lines
    const c = fbm(n, P[0] * 1.5, P[1] * 1.5, P[2] * 1.5, 3);
    for (const level of [-0.18, 0.05, 0.26]) line(Math.abs(c - level) * 1.6, 1);
    if (star) {
      const r = Math.sqrt(Math.max(0, 1 - mu * mu));
      line(Math.abs(r - 0.42), 1);
      line(Math.abs(r - 0.74), 0.85);
    }
    I = Math.min(1.25, I);
    out[0] = BASE[0] * (0.6 + 0.4 * mu) + col[0] * I;
    out[1] = BASE[1] * (0.6 + 0.4 * mu) + col[1] * I;
    out[2] = BASE[2] * (0.6 + 0.4 * mu) + col[2] * I;
    if (I > 0.85) mixTo(out, WHITE, (I - 0.85) * 1.6);
    if (out[0] > 255) out[0] = 255;
    if (out[1] > 255) out[1] = 255;
    if (out[2] > 255) out[2] = 255;
  };
}

// --- kawaii: milky pastels, little sparkles, a soft outline and a big toy-like shine ---

function kawaiiFinish(canvas, kind, rPx) {
  eachPixel(canvas, (px, a) => {
    pastelize(px);
    return a;
  });
  const ctx = canvas.getContext('2d');
  const c = canvas.width / 2;
  const rnd = seeded(700 + kind);
  const count = 3 + (kind % 3);
  for (let i = 0; i < count; i++) {
    const a = rnd() * TAU;
    const d = rPx * (0.2 + rnd() * 0.5);
    const s = rPx * (0.06 + rnd() * 0.05);
    ctx.globalAlpha = 0.85;
    star4(ctx, c + Math.cos(a) * d, c + Math.sin(a) * d, s, '#ffffff');
  }
  ctx.globalAlpha = 1;
  return canvas;
}

function kawaiiLight(def) {
  const tone = pastelize(rgb(def.color));
  const LINE = rgb(shade((Math.round(tone[0]) << 16) | (Math.round(tone[1]) << 8) | Math.round(tone[2]), 0.7));
  return (x, y, z, out) => {
    const r = Math.hypot(x, y);
    let cr = 255;
    let cg = 238;
    let cb = 248;
    let a = Math.min(1, Math.pow(1 - z, 2.2) * 0.4);
    const gx = x + 0.36;
    const gy = y + 0.4;
    const g = smooth(0.034, 0.016, gx * gx + gy * gy * 1.3) * 0.85;
    if (g > 0) {
      cr = 255;
      cg = 255;
      cb = 255;
      a = a + g * (1 - a);
    }
    const s2x = x + 0.12;
    const s2y = y + 0.56;
    a = a + smooth(0.004, 0.001, s2x * s2x + s2y * s2y) * 0.8 * (1 - a);
    const line = smooth(0.9, 0.95, r);
    if (line > 0) {
      cr += (LINE[0] - cr) * line;
      cg += (LINE[1] - cg) * line;
      cb += (LINE[2] - cb) * line;
      a = a + line * 0.9 * (1 - a);
    }
    out[0] = cr;
    out[1] = cg;
    out[2] = cb;
    out[3] = a;
  };
}

// --- which parts each skin uses ---

const CANDY_PARTS = { saturnRing: 'candySaturnRing', uranusRing: 'candyUranusRing' };
const NEON_PARTS = { saturnRing: 'neonSaturnRing', uranusRing: 'neonUranusRing' };

/** The parts a body is drawn with in a skin: [name, front?]. */
export function partsOf(kind, skin) {
  const def = defOf(kind);
  const s = skinOf(kind, skin);
  if (s === 'candy') return def.parts.map(([name, front]) => [CANDY_PARTS[name] || name, front]);
  if (s === 'neon') return [['neonHalo', false], ...def.parts.map(([name, front]) => [NEON_PARTS[name] || name, front])];
  return def.parts;
}

/** Does the body have a light layer in this skin? Every skinned body does; classic stars may not. */
export const hasLight = (kind, skin) => skinOf(kind, skin) !== 'classic' || !!defOf(kind).light;

/** One elliptical band between angles a0 and a1 (drawn as one closed shape). */
function ringArc(ctx, R, r0, r1, tilt, a0, a1) {
  ctx.beginPath();
  ctx.ellipse(0, 0, r1 * R, r1 * R * tilt, 0, a0, a1, false);
  ctx.ellipse(0, 0, r0 * R, r0 * R * tilt, 0, a1, a0, true);
  ctx.closePath();
  ctx.fill();
}

function candyRing(ctx, R, front, { turn, tilt, r0, r1, colors, stripes }) {
  ctx.rotate(rad(turn));
  const from = front ? 0 : Math.PI;
  for (let i = 0; i < stripes; i++) {
    const a0 = from + (i / stripes) * Math.PI;
    const a1 = from + ((i + 1) / stripes) * Math.PI + 0.004;
    ctx.fillStyle = colors[i % colors.length];
    ringArc(ctx, R, r0, r1, tilt, a0, a1);
  }
  // a glossy line along it
  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.lineWidth = R * 0.025;
  ctx.beginPath();
  const mid = r0 + (r1 - r0) * 0.35;
  ctx.ellipse(0, 0, mid * R, mid * R * tilt, 0, from, from + Math.PI, false);
  ctx.stroke();
}

function neonRing(ctx, R, front, def, { turn, tilt, radii }) {
  ctx.rotate(rad(turn));
  const col = neonOf(def.color);
  const from = front ? 0 : Math.PI;
  for (const r of radii) {
    for (const [width, alpha] of [[0.09, 0.18], [0.045, 0.4], [0.018, 1]]) {
      ctx.strokeStyle = width < 0.02 ? 'rgba(255,255,255,.95)' : css3(col, alpha);
      ctx.lineWidth = R * width;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * R, r * R * tilt, 0, from, from + Math.PI, false);
      ctx.stroke();
    }
  }
}

Object.assign(PARTS, {
  candySaturnRing: {
    size: 2,
    draw: (ctx, R, front) => candyRing(ctx, R, front, { turn: -14, tilt: 0.3, r0: 1.3, r1: 1.82, colors: ['#ff7fb0', '#fff4f8'], stripes: 9 }),
  },
  candyUranusRing: {
    size: 1.9,
    draw: (ctx, R, front) => candyRing(ctx, R, front, { turn: 78, tilt: 0.22, r0: 1.42, r1: 1.66, colors: ['#5fe3c8', '#f2fffb'], stripes: 7 }),
  },
  neonSaturnRing: {
    size: 2,
    blend: 'add',
    draw: (ctx, R, front, def) => neonRing(ctx, R, front, def, { turn: -14, tilt: 0.3, radii: [1.42, 1.72] }),
  },
  neonUranusRing: {
    size: 1.9,
    blend: 'add',
    draw: (ctx, R, front, def) => neonRing(ctx, R, front, def, { turn: 78, tilt: 0.22, radii: [1.5, 1.66] }),
  },
  neonHalo: {
    size: 1.6,
    blend: 'add',
    draw(ctx, R, front, def) {
      const c = neonOf(def.color);
      glow(ctx, R, 1.6, [[0, css3(c, 0.55)], [0.42, css3(c, 0.2)], [1, css3(c, 0)]]);
    },
  },
});

// ---------- rendering ----------

/** Renders a sphere of radius rPx into a square canvas, calling shadeFn for every covered pixel. */
function renderSphere(size, rPx, shadeFn, frame) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const c = size / 2;
  const out = [0, 0, 0, 1];
  const P = [0, 0, 0];
  for (let j = 0; j < size; j++) {
    const y0 = (j + 0.5 - c) / rPx;
    for (let i = 0; i < size; i++) {
      const x0 = (i + 0.5 - c) / rPx;
      const r = Math.sqrt(x0 * x0 + y0 * y0);
      const cover = clamp01((1 - r) * rPx + 0.5); // antialiased edge
      if (cover <= 0) continue;
      const k = r > 0.999 ? 0.999 / r : 1;
      const x = x0 * k;
      const y = y0 * k;
      const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
      out[3] = 1;
      if (frame) {
        frame(x, y, z, P);
        shadeFn(P, z, out);
      } else {
        shadeFn(x, y, z, out);
      }
      const o = (j * size + i) * 4;
      d[o] = out[0];
      d[o + 1] = out[1];
      d[o + 2] = out[2];
      d[o + 3] = Math.round(255 * cover * clamp01(out[3]));
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Turns view-space points into the planet's frame: axial tilt toward us, roll in the picture, and spin. */
function frameOf(tilt, roll, spin) {
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const cs = Math.cos(spin);
  const ss = Math.sin(spin);
  return (x, y, z, P) => {
    const x1 = x * cr + y * sr;
    const y1 = -x * sr + y * cr;
    const y2 = y1 * ct - z * st;
    const z2 = y1 * st + z * ct;
    P[0] = x1 * cs + z2 * ss;
    P[1] = y2;
    P[2] = -x1 * ss + z2 * cs;
  };
}

const FRAMES = {
  mercury: [0.2, 0.3, 1.1],
  uranus: [0.1, 0.0, 0],
  bluegiant: [0.2, 0, 0.3],
  pulsar: [0.4, 0.2, 0],
  moon: [0.1, 0.1, 0.2],
  mars: [0.35, -0.2, 0.6],
  venus: [0.05, 0.08, 0.2],
  earth: [0.32, -0.25, 0.5],
  neptune: [0.3, 0.2, 0.4],
  saturn: [0.26, -0.24, 0],
  jupiter: [0.08, -0.05, 0],
  sun: [0.2, 0, 0.3],
  redgiant: [0.2, 0, 0.3],
  supernova: [0, 0, 0],
  blackhole: [0, 0, 0],
  comet: [0.3, 0.4, 0.6],
  dark: [0.3, 0.3, 0.2],
  bomb: [0.3, -0.2, 0.4],
};

/** A body's surface in a skin, rendered at `scale` pixels per world unit. */
function renderSurface(kind, skin, scale) {
  const def = defOf(kind);
  const s = skinOf(kind, skin);
  const size = Math.ceil((def.r + PAD) * 2 * scale);
  const f = FRAMES[def.surface];
  const frame = frameOf(f[0], f[1], f[2]);
  if (s === 'pixel') {
    const cells = gridOf(def);
    const rCells = (def.r * cells) / ((def.r + PAD) * 2);
    const small = renderGrid(cells, rCells, SURFACES[def.surface](), frame);
    eachPixel(small, (px, a) => {
      paletteSnap(px);
      return a;
    });
    return upscale(small, size);
  }
  const shader = s === 'candy' ? candySurface(kind) : s === 'neon' ? neonSurface(kind) : SURFACES[def.surface]();
  const canvas = renderSphere(size, def.r * scale, shader, frame);
  if (s === 'kawaii') kawaiiFinish(canvas, kind, def.r * scale);
  return canvas;
}

/** A body's light layer in a skin (it stays fixed on screen while the body turns). */
function renderLight(kind, skin, scale) {
  const def = defOf(kind);
  const s = skinOf(kind, skin);
  const size = Math.ceil((def.r + PAD) * 2 * scale);
  if (s === 'pixel') {
    const cells = gridOf(def);
    const rCells = (def.r * cells) / ((def.r + PAD) * 2);
    return upscale(renderGrid(cells, rCells, pixelLight(def, rCells, kind), null), size);
  }
  const rPx = (def.r * size) / ((def.r + PAD) * 2);
  let fn;
  if (s === 'kawaii') fn = kawaiiLight(def);
  else if (s === 'candy') fn = candyLight();
  else if (s === 'neon') {
    const c = neonOf(def.color);
    fn = glossFor({ rim: (c[0] << 16) | (c[1] << 8) | c[2], rimK: 1.1, sheen: 0, gloss: 0.32 });
  }
  else fn = glossFor(def.light);
  return renderSphere(size, rPx, fn, null);
}

const surfaceCanvases = new Map();
const lightCanvases = new Map();

function surfaceCanvas(kind, skin) {
  const key = tagOf(kind, skin);
  let c = surfaceCanvases.get(key);
  if (!c) {
    c = renderSurface(kind, skin, TEX_SCALE);
    surfaceCanvases.set(key, c);
  }
  return c;
}

function lightCanvas(kind, skin) {
  const key = tagOf(kind, skin);
  let c = lightCanvases.get(key);
  if (!c) {
    // lighting is smooth, so it is rendered at a modest resolution
    c = renderLight(kind, skin, Math.min(TEX_SCALE, 96 / defOf(kind).r));
    lightCanvases.set(key, c);
  }
  return c;
}

/** A part (ring, glow...) of a body, drawn at radius R into its own canvas, in the skin's style. */
function partCanvas(name, kind, R, front, skin) {
  const def = defOf(kind);
  const s = skinOf(kind, skin);
  const span = PARTS[name].size * R * 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(span * TEX_SCALE);
  canvas.height = canvas.width;
  const ctx = canvas.getContext('2d');
  ctx.scale(TEX_SCALE, TEX_SCALE);
  ctx.translate(span / 2, span / 2);
  ctx.save();
  PARTS[name].draw(ctx, R, front, def);
  ctx.restore();
  const glowing = PARTS[name].blend === 'add';
  if (s === 'kawaii' && !glowing) {
    eachPixel(canvas, (px, a) => {
      pastelize(px);
      return a;
    });
  } else if (s === 'pixel') {
    pixelateCanvas(canvas, Math.max(8, Math.round((PARTS[name].size * def.r * 2) / PX)), glowing);
  }
  return canvas;
}

/**
 * Static picture of a body, centred on (0,0): used for icons, the album and previews.
 * fresh: render the surface at just the size needed instead of using the full-size textures
 * (for shop previews of skins not in use).
 */
export function drawPortrait(ctx, kind, R, skin, fresh = false) {
  const def = defOf(kind);
  const s = skinOf(kind, skin);
  const parts = partsOf(kind, s);
  const layer = (front) => {
    for (const [name, isFront] of parts) {
      if (isFront !== front || PARTS[name].spin === 'velocity') continue;
      const span = PARTS[name].size * R * 2;
      ctx.save();
      if (PARTS[name].blend === 'add') ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(partCanvas(name, kind, R, front, s), -span / 2, -span / 2, span, span);
      ctx.restore();
    }
  };
  layer(false);
  const span = ((def.r + PAD) * 2 * R) / def.r;
  const scale = (R / def.r) * TEX_SCALE;
  ctx.save();
  if (s === 'pixel') ctx.imageSmoothingEnabled = false;
  ctx.drawImage(fresh ? renderSurface(kind, s, scale) : surfaceCanvas(kind, s), -span / 2, -span / 2, span, span);
  if (hasLight(kind, s)) ctx.drawImage(fresh ? renderLight(kind, s, Math.min(scale, 96 / R)) : lightCanvas(kind, s), -span / 2, -span / 2, span, span);
  ctx.restore();
  layer(true);
  if (s === 'kawaii') drawFace(ctx, R * 1.04, 'happy');
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
export const PORTRAIT_SIZE = PORTRAIT_R * 4.6;
export const surfaceKey = (kind, skin) => `surface_${tagOf(kind, skin)}`;
export const lightKey = (kind, skin) => `light_${tagOf(kind, skin)}`;
export const partKey = (kind, i, skin) => `part_${tagOf(kind, skin)}_${i}`;
export const portraitKey = (kind, skin) => `portrait_${tagOf(kind, skin)}`;
export const ALL_KINDS = [...TIERS.keys(), 'comet', 'wrecker', 'bomb'];

/** Everything one body needs in the skin in use: surface, lighting, parts and its portrait. */
export function makeKindTextures(scene, kind) {
  const s = skinOf(kind);
  const R = defOf(kind).r;
  if (!scene.textures.exists(surfaceKey(kind))) scene.textures.addCanvas(surfaceKey(kind), surfaceCanvas(kind, s));
  if (hasLight(kind, s) && !scene.textures.exists(lightKey(kind))) scene.textures.addCanvas(lightKey(kind), lightCanvas(kind, s));
  partsOf(kind, s).forEach(([name, front], i) => {
    if (!scene.textures.exists(partKey(kind, i))) scene.textures.addCanvas(partKey(kind, i), partCanvas(name, kind, R, front, s));
  });
  canvasTex(scene, portraitKey(kind), PORTRAIT_SIZE, PORTRAIT_SIZE, (ctx) => drawPortrait(ctx, kind, PORTRAIT_R, s));
}

export const hasKindTextures = (scene, kind) => scene.textures.exists(portraitKey(kind));

/** Frees the textures of a skin that is no longer in use. */
export function dropSkinTextures(scene, skin) {
  if (skin === 'classic') return;
  for (let kind = 0; kind < HOLE; kind++) {
    const tag = `${skin}_${kind}`;
    surfaceCanvases.delete(tag);
    lightCanvases.delete(tag);
    for (const key of [surfaceKey(kind, skin), lightKey(kind, skin), portraitKey(kind, skin)]) if (scene.textures.exists(key)) scene.textures.remove(key);
    for (let i = 0; i < 4; i++) if (scene.textures.exists(partKey(kind, i, skin))) scene.textures.remove(partKey(kind, i, skin));
  }
}

/** A small picture of a body in any skin, for the shop. Returns its texture key. */
export function skinPreview(scene, skin, kind, R) {
  const key = `preview_${skin}_${kind}_${R}`;
  if (!scene.textures.exists(key)) canvasTex(scene, key, R * 4.6, R * 4.6, (ctx) => drawPortrait(ctx, kind, R, skin, true));
  return key;
}

/** Shared textures: particles, glows, icons. Planet textures are made separately with makeKindTextures. */
export function makeCommonTextures(scene) {

  canvasTex(scene, 'dot', 20, 20, (ctx) => {
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, TAU);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  });
  canvasTex(scene, 'spark', 40, 40, (ctx) => {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const rr = i % 2 ? 5.4 : 18;
      const a = -Math.PI / 2 + (i * Math.PI) / 4;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  });
  canvasTex(scene, 'soft', 128, 128, (ctx) => {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 64, 0, TAU);
    ctx.fill();
  });
  canvasTex(scene, 'satellite', 80, 60, (ctx) => {
    ctx.translate(0, -6);
    satellite(ctx, 1.25);
  });
  canvasTex(scene, 'icon_laser', 80, 80, (ctx) => {
    ctx.translate(0, -4);
    satellite(ctx, 1.05);
    // the beam it fires
    const g = ctx.createLinearGradient(0, 14, 0, 40);
    g.addColorStop(0, 'rgba(255,120,230,1)');
    g.addColorStop(1, 'rgba(255,80,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-2.5, 14, 5, 26);
  });
  // Fusion: two planets drawn together by glowing field lines
  canvasTex(scene, 'icon_fusion', 80, 80, (ctx) => {
    ctx.lineCap = 'round';
    for (const [bend, alpha] of [[-17, 0.85], [17, 0.85], [-30, 0.4], [30, 0.4]]) {
      ctx.beginPath();
      ctx.moveTo(-15, 0);
      ctx.quadraticCurveTo(0, bend, 15, 0);
      ctx.strokeStyle = `rgba(150,235,255,${alpha})`;
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }
    for (const [x, c1, c2] of [[-17, '#ffc6e8', '#ff79c6'], [17, '#c9f4ff', '#58c8ff']]) {
      const g = ctx.createRadialGradient(x - 3, -4, 1, x, 0, 12);
      g.addColorStop(0, c1);
      g.addColorStop(1, c2);
      ctx.beginPath();
      ctx.arc(x, 0, 11, 0, TAU);
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, TAU);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  });
  // Vortex: a dark core with swirling arms
  canvasTex(scene, 'icon_vortex', 80, 80, (ctx) => {
    ctx.lineCap = 'round';
    for (let arm = 0; arm < 3; arm++) {
      ctx.save();
      ctx.rotate((arm * TAU) / 3);
      ctx.beginPath();
      for (let t = 0; t <= 1.0001; t += 0.05) {
        const a = t * 3.4;
        const r = 7 + t * 21;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      const g = ctx.createLinearGradient(0, 0, 28, 0);
      g.addColorStop(0, '#f2e6ff');
      g.addColorStop(1, 'rgba(150,110,255,0.2)');
      ctx.strokeStyle = arm % 2 ? '#9f8cff' : '#d2b8ff';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, TAU);
    ctx.fillStyle = '#07040f';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#efe6ff';
    ctx.stroke();
  });
  canvasTex(scene, 'chevron', 60, 60, (ctx) => {
    ctx.strokeStyle = '#ff5a8a';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const o of [-10, 8]) {
      ctx.beginPath();
      ctx.moveTo(o - 8, -16);
      ctx.lineTo(o + 8, 0);
      ctx.lineTo(o - 8, 16);
      ctx.stroke();
    }
  });

  // cute faces for the face skin, at radius FACE_R: happy, blinking, surprised
  for (const mood of ['happy', 'blink', 'wow']) {
    canvasTex(scene, `face_${mood}`, FACE_R * 2, FACE_R * 2, (ctx) => drawFace(ctx, FACE_R, mood));
  }

  // the diamond, the currency of the game
  canvasTex(scene, 'gem', 48, 48, (ctx) => drawGem(ctx, 17));
  // particles for the skins' effects
  canvasTex(scene, 'heart', 32, 32, (ctx) => {
    ctx.beginPath();
    ctx.moveTo(0, 11);
    ctx.bezierCurveTo(-15, 1, -12, -12, 0, -5);
    ctx.bezierCurveTo(12, -12, 15, 1, 0, 11);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  });
  canvasTex(scene, 'px', 12, 12, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-5, -5, 10, 10);
  });
  canvasTex(scene, 'sprinkle', 24, 10, (ctx) => {
    ctx.beginPath();
    ctx.moveTo(-8, -3);
    ctx.lineTo(8, -3);
    ctx.arc(8, 0, 3, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(-8, 3);
    ctx.arc(-8, 0, 3, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  });
}

/** A brilliant-cut diamond of half-width w, centred on (0,0). */
export function drawGem(ctx, w) {
  const top = -w * 0.62;
  const girdle = -w * 0.12;
  const tip = w * 0.95;
  const table = w * 0.5;
  // the crown
  ctx.beginPath();
  ctx.moveTo(-table, top);
  ctx.lineTo(table, top);
  ctx.lineTo(w, girdle);
  ctx.lineTo(-w, girdle);
  ctx.closePath();
  const g1 = ctx.createLinearGradient(0, top, 0, girdle);
  g1.addColorStop(0, '#e9fdff');
  g1.addColorStop(1, '#7fe2ff');
  ctx.fillStyle = g1;
  ctx.fill();
  // the pavilion
  ctx.beginPath();
  ctx.moveTo(-w, girdle);
  ctx.lineTo(w, girdle);
  ctx.lineTo(0, tip);
  ctx.closePath();
  const g2 = ctx.createLinearGradient(-w, 0, w, tip);
  g2.addColorStop(0, '#4fc6ff');
  g2.addColorStop(0.55, '#2a8cf0');
  g2.addColorStop(1, '#1d5fd0');
  ctx.fillStyle = g2;
  ctx.fill();
  // facets
  ctx.strokeStyle = 'rgba(255,255,255,.75)';
  ctx.lineWidth = w * 0.06;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-table * 0.35, top);
  ctx.lineTo(-w * 0.45, girdle);
  ctx.lineTo(0, tip);
  ctx.lineTo(w * 0.45, girdle);
  ctx.lineTo(table * 0.35, top);
  ctx.moveTo(-w, girdle);
  ctx.lineTo(w, girdle);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(20,60,150,.55)';
  ctx.lineWidth = w * 0.07;
  ctx.beginPath();
  ctx.moveTo(-table, top);
  ctx.lineTo(table, top);
  ctx.lineTo(w, girdle);
  ctx.lineTo(0, tip);
  ctx.lineTo(-w, girdle);
  ctx.closePath();
  ctx.stroke();
  star4(ctx, -w * 0.42, top + w * 0.2, w * 0.32, '#ffffff');
}

/** Radius the face textures are drawn at; they are scaled to each planet. */
export const FACE_R = 48;

function star4(ctx, x, y, r, color) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rr = i % 2 ? r * 0.32 : r;
    const a = -Math.PI / 2 + (i * Math.PI) / 4;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawFace(ctx, R, mood) {
  // rosy cheeks
  for (const s of [-1, 1]) {
    const g = ctx.createRadialGradient(s * R * 0.52, R * 0.2, 0, s * R * 0.52, R * 0.2, R * 0.2);
    g.addColorStop(0, 'rgba(255,120,150,.55)');
    g.addColorStop(1, 'rgba(255,120,150,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(s * R * 0.52, R * 0.2, R * 0.2, R * 0.13, 0, 0, TAU);
    ctx.fill();
  }
  // eyes
  for (const s of [-1, 1]) {
    const ex = s * R * 0.3;
    const ey = -R * 0.06;
    if (mood === 'blink') {
      ctx.strokeStyle = '#2b1d3a';
      ctx.lineWidth = R * 0.07;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(ex, ey - R * 0.02, R * 0.1, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      continue;
    }
    const big = mood === 'wow' ? 1.25 : 1;
    ctx.fillStyle = '#2b1d3a';
    ctx.beginPath();
    ctx.ellipse(ex, ey, R * 0.1 * big, R * 0.13 * big, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex - R * 0.035, ey - R * 0.05, R * 0.04 * big, 0, TAU);
    ctx.fill();
  }
  // mouth
  ctx.strokeStyle = '#2b1d3a';
  ctx.fillStyle = '#2b1d3a';
  ctx.lineWidth = R * 0.06;
  ctx.lineCap = 'round';
  if (mood === 'wow') {
    ctx.beginPath();
    ctx.ellipse(0, R * 0.25, R * 0.08, R * 0.1, 0, 0, TAU);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(0, R * 0.14, R * 0.13, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  }
}

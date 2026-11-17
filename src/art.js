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

function makeCraters(seed, count, rMin, rMax, toView) {
  const rnd = seeded(seed);
  const list = [];
  for (let i = 0; i < count; i++) {
    const lat = Math.asin(rnd() * 2 - 1);
    const lon = rnd() * TAU;
    const r = rMin + (rMax - rMin) * Math.pow(rnd(), 2);
    const d = dirOf(lat, lon);
    const v = toView(d);
    list.push([...d, r, v[0], v[1], v[2]]);
  }
  return list;
}

const WHITE = [255, 255, 255];
const VIEW = [0, 0];

/**
 * Bowl-shaped craters with a raised rim. The inner wall on the light's side is in shadow and
 * the far wall is lit, matching the scene light.
 */
function craters(list, P, out, strength) {
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const dx = P[0] - c[0];
    const dy = P[1] - c[1];
    const dz = P[2] - c[2];
    const t = Math.sqrt(dx * dx + dy * dy + dz * dz) / c[3];
    if (t > 1.45) continue;
    const s = c[6] > 0 ? Math.max(-1, Math.min(1, ((VIEW[0] - c[4]) * LIGHT[0] + (VIEW[1] - c[5]) * LIGHT[1]) / c[3])) : 0;
    if (t < 1) {
      const bowl = 1 - t * t;
      scaleRGB(out, Math.max(0.2, 1 - strength * (0.3 * bowl + 0.55 * s * Math.sqrt(bowl))));
    }
    const rim = Math.exp(-((t - 1) * (t - 1)) / 0.025);
    mixTo(out, WHITE, strength * 0.28 * rim * (0.55 - 0.45 * s));
  }
}

// ---------- planet surfaces ----------
// Each factory returns a function (P, mu, out) => void, where P is the point on the unit
// sphere in the planet's own frame, mu is how directly it faces the viewer (1 at the centre,
// 0 at the edge) and out is [r, g, b, alpha 0..1]. Colours are albedo only; light comes later.

const SURFACES = {
  asteroid(toView) {
    const n = makeNoise(11);
    const m = makeNoise(12);
    const list = makeCraters(13, 18, 0.08, 0.38, toView);
    const col = ramp([[-0.7, 0x2b2621], [-0.2, 0x5a5047], [0.3, 0x8f8372], [0.8, 0xbdb09c]]);
    return (P, mu, out) => {
      const h = fbm(n, P[0] * 3, P[1] * 3, P[2] * 3, 6) + 0.5 * fbm(m, P[0] * 13, P[1] * 13, P[2] * 13, 3);
      col(h * 1.2, out);
      craters(list, P, out, 0.7);
    };
  },

  moon(toView) {
    const n = makeNoise(21);
    const m = makeNoise(22);
    const list = makeCraters(23, 30, 0.04, 0.28, toView);
    return (P, mu, out) => {
      const base = fbm(n, P[0] * 3, P[1] * 3, P[2] * 3, 5);
      const maria = smooth(0.02, 0.24, fbm(m, P[0] * 1.4, P[1] * 1.4, P[2] * 1.4, 4));
      const g = 196 + base * 46 - maria * 78;
      out[0] = g;
      out[1] = g * 0.985;
      out[2] = g * 0.96;
      craters(list, P, out, 0.32);
    };
  },

  mars(toView) {
    const n = makeNoise(31);
    const m = makeNoise(32);
    const q = makeNoise(33);
    const list = makeCraters(34, 14, 0.03, 0.12, toView);
    const col = ramp([[-0.6, 0x5a1d0e], [-0.2, 0x8f3517], [0.15, 0xbd5a2e], [0.5, 0xdc8a56], [0.8, 0xeab58c]]);
    const CAP = [246, 240, 236];
    return (P, mu, out) => {
      const lat = Math.asin(Math.max(-1, Math.min(1, -P[1])));
      const h = fbm(n, P[0] * 2.6, P[1] * 2.6, P[2] * 2.6, 6);
      const dark = smooth(0.04, 0.3, fbm(m, P[0] * 1.3, P[1] * 1.3, P[2] * 1.3, 4));
      col(h * 0.9 - dark * 0.5, out);
      // a long canyon system just south of the equator
      const can = Math.abs(lat + 0.12 + 0.07 * fbm(q, P[0] * 3, P[1] * 3, P[2] * 3, 3));
      const along = 1 - smooth(0.35, 0.8, Math.abs(P[0]));
      if (P[2] > 0) scaleRGB(out, 1 - 0.3 * (1 - smooth(0.012, 0.07, can)) * along);
      craters(list, P, out, 0.25);
      const cap = smooth(1.1, 1.2, Math.abs(lat) + 0.06 * fbm(q, P[0] * 6, P[1] * 6, P[2] * 6, 3));
      mixTo(out, CAP, cap);
    };
  },

  venus() {
    const n = makeNoise(41);
    const w = makeNoise(42);
    const col = ramp([[-0.7, 0xa8692f], [-0.25, 0xcf9a55], [0.15, 0xe8c58b], [0.55, 0xf7e6c2], [0.9, 0xfff6e2]]);
    return (P, mu, out) => {
      const lat = Math.asin(Math.max(-1, Math.min(1, -P[1])));
      const wx = fbm(w, P[0] * 1.6, P[1] * 1.6, P[2] * 1.6, 3);
      // thick cloud deck: broad sideways streams with a chevron pattern
      const v = 0.5 * Math.sin(lat * 6 + Math.abs(lat) * 3 + 2.6 * wx) + 0.55 * fbm(n, P[0] * 3.4 + wx, P[1] * 3.4, P[2] * 3.4, 4);
      col(v, out);
    };
  },

  earth() {
    const land = makeNoise(51);
    const wet = makeNoise(52);
    const cloud = makeNoise(53);
    const warp = makeNoise(54);
    const ocean = ramp([[0, 0x2a8bd6], [0.12, 0x165fb0], [0.4, 0x0b3a7e]]);
    const DESERT = rgb(0xc9a768);
    const FOREST = rgb(0x2f6b2c);
    const GRASS = rgb(0x6d9442);
    const TUNDRA = rgb(0x8d8f78);
    const ROCK = rgb(0x7a6a58);
    const ICE = rgb(0xf0f6fa);
    return (P, mu, out) => {
      const lat = Math.asin(Math.max(-1, Math.min(1, -P[1])));
      const alat = Math.abs(lat);
      const e = fbm(land, P[0] * 1.7, P[1] * 1.7, P[2] * 1.7, 6) - 0.04;
      if (e < 0) {
        ocean(-e, out);
      } else {
        const m = fbm(wet, P[0] * 2.2, P[1] * 2.2, P[2] * 2.2, 4);
        out[0] = GRASS[0];
        out[1] = GRASS[1];
        out[2] = GRASS[2];
        mixTo(out, FOREST, smooth(-0.05, 0.25, m) * (1 - smooth(0.6, 0.95, alat)));
        mixTo(out, DESERT, smooth(0.0, -0.25, m) * smooth(0.15, 0.3, alat) * (1 - smooth(0.55, 0.7, alat)));
        mixTo(out, TUNDRA, smooth(0.85, 1.05, alat));
        mixTo(out, ROCK, smooth(0.22, 0.38, e));
        mixTo(out, ICE, smooth(0.36, 0.46, e));
        mixTo(out, [out[0] * 0.85, out[1] * 0.85, out[2] * 0.85], 1 - smooth(0, 0.05, e)); // darker coasts
      }
      // ice caps
      mixTo(out, ICE, smooth(1.12, 1.22, alat + 0.08 * fbm(wet, P[0] * 5, P[1] * 5, P[2] * 5, 2)));
      // swirling clouds
      const wq = fbm(warp, P[0] * 2, P[1] * 2, P[2] * 2, 3);
      const c = fbm(cloud, P[0] * 2.8 + wq * 1.4, P[1] * 4.2, P[2] * 2.8 - wq * 1.4, 5);
      mixTo(out, WHITE, smooth(0.04, 0.4, c) * 0.88);
    };
  },

  neptune() {
    const n = makeNoise(61);
    const w = makeNoise(62);
    const s = makeNoise(63);
    const col = ramp([[-0.7, 0x172f8a], [-0.2, 0x2852c7], [0.2, 0x3f72e3], [0.6, 0x6e9df5], [1, 0xa9c8ff]]);
    const spot = dirOf(-0.4, 0.35);
    const DARK = rgb(0x0f1f63);
    return (P, mu, out) => {
      const lat = Math.asin(Math.max(-1, Math.min(1, -P[1])));
      const v = 0.32 * Math.sin(lat * 9 + 1.4 * fbm(w, P[0] * 2.4, P[1] * 2.4, P[2] * 2.4, 3)) + 0.4 * fbm(n, P[0] * 4, P[1] * 4, P[2] * 4, 4);
      col(v, out);
      const d = ellipseDist(P, spot, 0.24, 0.13);
      if (d < 1.4) mixTo(out, DARK, 1 - smooth(0.55, 1.1, d));
      // bright high clouds drawn out along the latitude lines
      const streak = 1 - Math.abs(s(P[0] * 3, P[1] * 22, P[2] * 3));
      const where = smooth(0.1, 0.45, fbm(w, P[0] * 1.5 + 9, P[1] * 1.5, P[2] * 1.5, 3));
      mixTo(out, WHITE, smooth(0.8, 0.97, streak) * where * 0.9);
    };
  },

  saturn() {
    const n = makeNoise(71);
    const w = makeNoise(72);
    const col = bands([0xecdcb4, 0xdcc08c, 0xf2e6c6, 0xd1ae7a, 0xe9d5a8, 0xd8b884, 0xf0e2bf, 0xcdaa76]);
    const POLE = rgb(0x9fa38f);
    return (P, mu, out) => {
      const lat = Math.asin(Math.max(-1, Math.min(1, -P[1])));
      const t = lat * 4.6 + 0.22 * fbm(w, P[0] * 3, P[1] * 3, P[2] * 3, 3) + 0.05 * fbm(n, P[0] * 10, P[1] * 10, P[2] * 10, 3);
      col(t, out);
      mixTo(out, POLE, smooth(0.95, 1.4, Math.abs(lat)) * 0.7);
    };
  },

  jupiter() {
    const n = makeNoise(81);
    const w = makeNoise(82);
    const col = bands([0xf0e4cd, 0xc98d5c, 0xf6eee0, 0xb87447, 0xead6b4, 0xa86640, 0xf3e7d2, 0xc99566, 0xe8d4b3]);
    const grs = dirOf(-0.36, 0.55);
    const RED = rgb(0xc04f2c);
    const RIM = rgb(0xf2d7b4);
    return (P, mu, out) => {
      const lat = Math.asin(Math.max(-1, Math.min(1, -P[1])));
      // turbulent belts: latitude pushed around by noise stretched along the bands
      const turb = fbm(w, P[0] * 3.4, P[1] * 9, P[2] * 3.4, 5);
      const eddies = fbm(n, P[0] * 7, P[1] * 16, P[2] * 7, 4);
      const t = lat * 5 + 0.45 * Math.sin(lat * 9 + 1) + 0.75 * turb + 0.25 * eddies;
      col(t, out);
      const d = ellipseDist(P, grs, 0.3, 0.17);
      if (d < 1.5) {
        mixTo(out, RIM, smooth(1.4, 1.05, d) * 0.8);
        mixTo(out, RED, 1 - smooth(0.45, 1.0, d + 0.12 * turb));
      }
    };
  },

  sun() {
    const n = makeNoise(91);
    const m = makeNoise(92);
    const col = ramp([[0.25, 0x9c2a06], [0.5, 0xe8620e], [0.72, 0xffa128], [0.88, 0xffd35e], [1, 0xfff6d2]]);
    const spots = [[...dirOf(0.25, 0.3), 0.075], [...dirOf(-0.18, -0.42), 0.055], [...dirOf(-0.1, -0.3), 0.03]];
    return (P, mu, out) => {
      // granulation: bright cells with dark lanes between them
      const cell = smooth(0.02, 0.32, Math.abs(n(P[0] * 26, P[1] * 26, P[2] * 26)));
      const large = fbm(m, P[0] * 3, P[1] * 3, P[2] * 3, 3);
      let I = 0.86 + 0.08 * cell + 0.1 * large;
      for (const s of spots) {
        const dx = P[0] - s[0];
        const dy = P[1] - s[1];
        const dz = P[2] - s[2];
        const t = Math.sqrt(dx * dx + dy * dy + dz * dz) / s[3];
        if (t < 1.6) I -= 0.25 * (1 - smooth(0.9, 1.6, t)) + 0.35 * (1 - smooth(0.3, 0.75, t));
      }
      I *= 0.5 + 0.5 * Math.pow(mu, 0.55); // limb darkening
      col(I, out);
    };
  },

  redgiant() {
    const n = makeNoise(101);
    const m = makeNoise(102);
    const col = ramp([[0.2, 0x3d0705], [0.42, 0x8c1a0c], [0.62, 0xd93c18], [0.82, 0xff7a3d], [1, 0xffc79a]]);
    return (P, mu, out) => {
      const cells = fbm(n, P[0] * 3.2, P[1] * 3.2, P[2] * 3.2, 4);
      const fine = fbm(m, P[0] * 12, P[1] * 12, P[2] * 12, 3);
      let I = 0.8 + 0.22 * cells + 0.05 * fine;
      I *= 0.38 + 0.62 * Math.pow(mu, 0.7);
      col(I, out);
    };
  },

  supernova() {
    const n = makeNoise(111);
    const m = makeNoise(112);
    const body = ramp([[0, 0xffffff], [0.3, 0xd8f0ff], [0.6, 0x7fb4ff], [0.85, 0x5b5fe0], [1, 0x6a3fc4]]);
    const PINK = rgb(0xff8fd0);
    const GOLD = rgb(0xffc27a);
    const ICE = rgb(0xeaf8ff);
    return (P, mu, out) => {
      const r = Math.sqrt(Math.max(0, 1 - mu * mu));
      const swirl = fbm(m, P[0] * 2.5, P[1] * 2.5, P[2] * 2.5, 4);
      body(r + 0.12 * swirl, out);
      // thin glowing filaments of the expanding shell
      const fil = 1 - Math.abs(fbm(n, P[0] * 3.6, P[1] * 3.6, P[2] * 3.6, 5));
      const f = smooth(0.8, 0.95, fil) * smooth(0.25, 0.65, r);
      mixTo(out, swirl > 0 ? PINK : GOLD, f * 0.85);
      mixTo(out, ICE, smooth(0.9, 0.99, fil) * (1 - r) * 0.8);
      out[3] = 1 - 0.5 * smooth(0.85, 1, r);
    };
  },

  blackhole() {
    const RING = rgb(0xffe2b0);
    return (P, mu, out) => {
      const r = Math.sqrt(Math.max(0, 1 - mu * mu));
      out[0] = 2;
      out[1] = 1;
      out[2] = 6;
      mixTo(out, RING, Math.exp(-((r - 0.94) * (r - 0.94)) / 0.0012)); // photon ring
    };
  },

  comet() {
    const n = makeNoise(121);
    const m = makeNoise(122);
    const col = ramp([[-0.5, 0x2a3140], [0.1, 0x4f5a6d], [0.6, 0x8e9bb0]]);
    const ICE = rgb(0xe4f8ff);
    return (P, mu, out) => {
      col(fbm(n, P[0] * 3, P[1] * 3, P[2] * 3, 5), out);
      mixTo(out, ICE, smooth(0.05, 0.3, fbm(m, P[0] * 2.6, P[1] * 2.6, P[2] * 2.6, 4)) * 0.85);
    };
  },

  rogue() {
    const n = makeNoise(131);
    const m = makeNoise(132);
    const col = ramp([[-0.6, 0x09060f], [0, 0x1d1430], [0.6, 0x3b2a55]]);
    const LAVA = rgb(0xff3d1f);
    const HOT = rgb(0xffd56b);
    return (P, mu, out) => {
      col(fbm(n, P[0] * 2.6, P[1] * 2.6, P[2] * 2.6, 5), out);
      // glowing cracks: thin lines where the noise crosses zero
      const crack = 1 - Math.abs(fbm(m, P[0] * 3.3, P[1] * 3.3, P[2] * 3.3, 4));
      mixTo(out, LAVA, smooth(0.86, 0.96, crack));
      mixTo(out, HOT, smooth(0.95, 0.995, crack));
    };
  },
};

// ---------- lighting ----------
// One light for the whole scene, from the upper left and slightly in front.

const LIGHT = (() => {
  const v = [-0.7, -0.6, 0.22];
  const l = Math.hypot(...v);
  return v.map((c) => c / l);
})();
const HALF = (() => {
  const v = [LIGHT[0], LIGHT[1], LIGHT[2] + 1];
  const l = Math.hypot(...v);
  return v.map((c) => c / l);
})();

/** night: darkness of the unlit side; atm: atmosphere colour or null; atmK: its strength; spec/shine: highlight. */
function lightFor(params) {
  const atm = params.atm == null ? null : rgb(params.atm);
  return (x, y, z, out) => {
    const ndl = x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2];
    // a fairly sharp terminator, and the day side getting brighter toward the light
    const day = smooth(-0.12, 0.16, ndl);
    const lit = day * (0.6 + 0.4 * Math.min(1, Math.max(0, ndl) / 0.6));
    // premultiplied over-compositing of: shadow, limb, atmosphere, highlight
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
    over(4, 2, 14, (1 - lit) * params.night);
    over(4, 2, 14, Math.pow(1 - z, 3) * 0.3);
    if (atm) {
      const rim = Math.pow(1 - z, params.rimPow ?? 2.4) * params.atmK * (0.2 + 0.8 * smooth(-0.35, 0.55, ndl));
      over(atm[0], atm[1], atm[2], Math.min(1, rim));
    }
    const ndh = x * HALF[0] + y * HALF[1] + z * HALF[2];
    const spec = Math.pow(Math.max(0, ndh), params.shine ?? 30) * params.spec * day;
    over(255, 255, 255, Math.min(1, spec));
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
    [1.2, 1.33, [150, 132, 108], 0.22], // faint inner ring
    [1.33, 1.6, [232, 214, 176], 0.9], // bright broad ring
    [1.6, 1.65, [40, 30, 20], 0.05], // the dark gap
    [1.65, 1.86, [214, 194, 156], 0.72], // outer ring
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
      if (front) {
        // the planet's shadow falls across the rings behind it, away from the light
        ctx.globalCompositeOperation = 'source-atop';
        const g = ctx.createLinearGradient(0, 0, 1.9 * R, 0.6 * R);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.25)');
        ctx.fillStyle = g;
        ctx.fillRect(-2 * R, -2 * R, 4 * R, 4 * R);
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
  rogueAura: {
    size: 1.8,
    blend: 'add',
    spin: 'slow',
    draw(ctx, R) {
      glow(ctx, R, 1.8, [[0, 'rgba(255,80,200,.7)'], [0.3, 'rgba(255,90,40,.3)'], [1, 'rgba(120,20,90,0)']]);
      const rnd = seeded(3);
      for (let i = 0; i < 16; i++) {
        ctx.save();
        ctx.rotate((i / 16) * TAU + rnd() * 0.3);
        const len = (1.25 + rnd() * 0.4) * R;
        const g = ctx.createLinearGradient(R * 0.8, 0, len, 0);
        g.addColorStop(0, i % 2 ? 'rgba(255,120,40,.45)' : 'rgba(255,70,210,.4)');
        g.addColorStop(1, 'rgba(255,60,120,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(R * 0.85, -R * 0.15);
        ctx.quadraticCurveTo(len * 0.85, -R * 0.02, len, 0);
        ctx.quadraticCurveTo(len * 0.85, R * 0.02, R * 0.85, R * 0.15);
        ctx.fill();
        ctx.restore();
      }
    },
  },
  rogueTail: {
    size: 3.6,
    blend: 'add',
    spin: 'velocity',
    draw(ctx, R) {
      const g = ctx.createLinearGradient(0, 0, -3.5 * R, 0);
      g.addColorStop(0, 'rgba(255,110,60,.75)');
      g.addColorStop(0.5, 'rgba(255,60,190,.3)');
      g.addColorStop(1, 'rgba(160,40,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -0.95 * R);
      ctx.quadraticCurveTo(-1.8 * R, -0.6 * R, -3.5 * R, 0);
      ctx.quadraticCurveTo(-1.8 * R, 0.6 * R, 0, 0.95 * R);
      ctx.fill();
    },
  },
};

// ---------- the chain ----------
// light: lighting-layer parameters, or null for bodies that shine on their own.
// parts: [name, front?] - drawn behind the planet unless front is true.

const ROCK = { night: 0.9, spec: 0.1, shine: 22 };

export const TIERS = [
  { name: 'Asteroid', r: 21, color: 0xa39482, surface: 'asteroid', light: ROCK, parts: [] },
  { name: 'Moon', r: 26, color: 0xd5d9e0, surface: 'moon', light: ROCK, parts: [] },
  { name: 'Mars', r: 32, color: 0xe0683f, surface: 'mars', light: { night: 0.9, atm: 0xffa07a, atmK: 0.4, spec: 0.12, shine: 24 }, parts: [] },
  { name: 'Venus', r: 39, color: 0xf0c27a, surface: 'venus', light: { night: 0.88, atm: 0xfff1cf, atmK: 0.75, spec: 0.16, shine: 26 }, parts: [] },
  { name: 'Earth', r: 47, color: 0x3b8cf0, surface: 'earth', light: { night: 0.9, atm: 0x78c0ff, atmK: 0.95, spec: 0.4, shine: 44 }, parts: [] },
  { name: 'Neptune', r: 56, color: 0x4263eb, surface: 'neptune', light: { night: 0.88, atm: 0x9fdcff, atmK: 0.75, spec: 0.28, shine: 34 }, parts: [] },
  { name: 'Saturn', r: 66, color: 0xe3c27a, surface: 'saturn', light: { night: 0.88, atm: 0xfff0cc, atmK: 0.45, spec: 0.16, shine: 28 }, parts: [['saturnRing', false], ['saturnRing', true]] },
  { name: 'Jupiter', r: 78, color: 0xd98f55, surface: 'jupiter', light: { night: 0.88, atm: 0xffe7c9, atmK: 0.45, spec: 0.16, shine: 28 }, parts: [] },
  { name: 'Sun', r: 92, color: 0xffc93a, surface: 'sun', light: null, parts: [['sunGlow', false]] },
  { name: 'Red Giant', r: 108, color: 0xff5a3c, surface: 'redgiant', light: null, parts: [['redGlow', false]] },
  { name: 'Supernova', r: 126, color: 0x9fd8ff, surface: 'supernova', light: null, parts: [['novaGlow', false]] },
  { name: 'Black Hole', r: 80, color: 0xffb347, surface: 'blackhole', light: null, parts: [['holeGlow', false], ['holeDisk', false], ['holeDisk', true]] },
];

export const SPECIALS = {
  comet: { name: 'Comet', r: 24, color: 0xbff3ff, surface: 'comet', light: { night: 0.5, atm: 0xaef5ff, atmK: 1, spec: 0.35, shine: 30 }, parts: [['coma', false], ['cometTail', false]] },
  rogue: { name: 'Rogue Planet', r: 74, color: 0xff4fb0, surface: 'rogue', light: { night: 0.55, atm: 0xff5ad8, atmK: 0.9, spec: 0.3, shine: 30 }, parts: [['rogueTail', false], ['rogueAura', false]] },
};

export const HOLE = TIERS.length - 1; // the black hole
export const MAX_PLANET = HOLE - 1; // the largest ordinary body

export const defOf = (kind) => (typeof kind === 'number' ? TIERS[kind] : SPECIALS[kind]);
export const partInfo = (name) => PARTS[name];

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
      VIEW[0] = x;
      VIEW[1] = y;
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

/** The inverse of frameOf: a direction in the planet's frame back to view space. */
function viewOf(tilt, roll, spin) {
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const cs = Math.cos(spin);
  const ss = Math.sin(spin);
  return (P) => {
    const x1 = P[0] * cs - P[2] * ss;
    const z2 = P[0] * ss + P[2] * cs;
    const y2 = P[1];
    const y1 = y2 * ct + z2 * st;
    const z = -y2 * st + z2 * ct;
    return [x1 * cr - y1 * sr, x1 * sr + y1 * cr, z];
  };
}

const FRAMES = {
  asteroid: [0.4, 0.5, 0.3],
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
  rogue: [0.3, 0.3, 0.2],
};

const surfaceCanvases = new Map();
const lightCanvases = new Map();

function surfaceCanvas(kind) {
  let c = surfaceCanvases.get(kind);
  if (!c) {
    const def = defOf(kind);
    const size = Math.ceil((def.r + PAD) * 2 * TEX_SCALE);
    const f = FRAMES[def.surface];
    c = renderSphere(size, def.r * TEX_SCALE, SURFACES[def.surface](viewOf(f[0], f[1], f[2])), frameOf(f[0], f[1], f[2]));
    surfaceCanvases.set(kind, c);
  }
  return c;
}

function lightCanvas(kind) {
  let c = lightCanvases.get(kind);
  if (!c) {
    const def = defOf(kind);
    // lighting is smooth, so it is rendered at a modest resolution
    const s = Math.min(TEX_SCALE, 96 / def.r);
    const size = Math.ceil((def.r + PAD) * 2 * s);
    c = renderSphere(size, (def.r * size) / ((def.r + PAD) * 2), lightFor(def.light), null);
    lightCanvases.set(kind, c);
  }
  return c;
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
    if (front || PARTS[name].spin === 'velocity') continue;
    ctx.save();
    if (PARTS[name].blend === 'add') ctx.globalCompositeOperation = 'lighter';
    drawPart(ctx, name, R, false);
    ctx.restore();
  }
  const span = ((def.r + PAD) * 2 * R) / def.r;
  ctx.drawImage(surfaceCanvas(kind), -span / 2, -span / 2, span, span);
  if (def.light) ctx.drawImage(lightCanvas(kind), -span / 2, -span / 2, span, span);
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
export const PORTRAIT_SIZE = PORTRAIT_R * 4.6;
export const surfaceKey = (kind) => `surface_${kind}`;
export const lightKey = (kind) => `light_${kind}`;
export const partKey = (kind, i) => `part_${kind}_${i}`;
export const portraitKey = (kind) => `portrait_${kind}`;
export const ALL_KINDS = [...TIERS.keys(), 'comet', 'rogue'];

/** Everything one body needs: surface, lighting, parts and its portrait. */
export function makeKindTextures(scene, kind) {
  const def = defOf(kind);
  const R = def.r;
  if (!scene.textures.exists(surfaceKey(kind))) scene.textures.addCanvas(surfaceKey(kind), surfaceCanvas(kind));
  if (def.light && !scene.textures.exists(lightKey(kind))) scene.textures.addCanvas(lightKey(kind), lightCanvas(kind));
  def.parts.forEach(([name, front], i) => {
    const s = PARTS[name].size * R * 2;
    canvasTex(scene, partKey(kind, i), s, s, (ctx) => drawPart(ctx, name, R, front));
  });
  canvasTex(scene, portraitKey(kind), PORTRAIT_SIZE, PORTRAIT_SIZE, (ctx) => drawPortrait(ctx, kind, PORTRAIT_R));
}

export const hasKindTextures = (scene, kind) => scene.textures.exists(portraitKey(kind));

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
}

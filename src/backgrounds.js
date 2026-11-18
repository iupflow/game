// The sky behind the game, one for each background in the shop. Each is a still picture (the
// sky's gradient and soft nebulae) with layers that keep moving: stars drifting at two depths,
// slow clouds, and the theme's own life: aurora light flowing along its curtains with snow
// falling, sunbeams, shimmering light and drifting jellyfish under the sea, smoke and embers
// rising from a glowing deep, a turning galaxy with shooting stars. All of it is drawn in code
// and stays quiet enough to play over.
import Phaser from 'phaser';
import { TEX_SCALE } from './art.js';

const ADD = Phaser.BlendModes.ADD;
const TAU = Math.PI * 2;
const css = (c, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
const smooth = (a, b, v) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

/** A picture drawn at the game's resolution: w x h in world units. */
function canvasTexture(scene, key, w, h, paint) {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, Math.ceil(w * TEX_SCALE), Math.ceil(h * TEX_SCALE));
  const ctx = tex.getContext();
  ctx.scale(TEX_SCALE, TEX_SCALE);
  paint(ctx, w, h);
  tex.refresh();
  return key;
}

/** A soft picture (clouds, light) drawn small, px x px pixels, and shown stretched. */
function softTexture(scene, key, px, paint) {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, px, px);
  const ctx = tex.getContext();
  const img = ctx.createImageData(px, px);
  paint(img.data, px);
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  return key;
}

/** Smooth value noise on a grid that wraps every `size` cells, so pictures made with it tile. */
function valueNoise(seed, size) {
  const rnd = seeded(seed);
  const g = new Float32Array(size * size);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const at = (i, j) => g[(((j % size) + size) % size) * size + (((i % size) + size) % size)];
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

// ---------- painters, shared by the game and the shop's little previews ----------

/**
 * A curtain of northern lights: rays standing on a wavy lower edge, fading upward. Every wave
 * fits a whole number of times across, so the curtain tiles side by side and can flow along.
 */
function paintCurtain(ctx, w, h, seed = 1) {
  const rnd = seeded(seed);
  const waves = [1, 2, 3].map((f) => [f, rnd() * TAU]);
  const edge = (x) => h * (0.72 + waves.reduce((s, [f, p], i) => s + Math.sin((x / w) * TAU * f + p) * (0.09 / (i + 1)), 0));
  const k1 = 23 + Math.floor(rnd() * 6);
  for (let x = 0; x < w; x += 1.5) {
    const e = edge(x);
    const bright = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin((x / w) * TAU * k1 + Math.sin((x / w) * TAU * 3) * 3), 2);
    const top = e - h * (0.45 + 0.25 * bright);
    const g = ctx.createLinearGradient(0, top, 0, e);
    g.addColorStop(0, 'rgba(150,110,255,0)');
    g.addColorStop(0.45, `rgba(90,200,255,${0.25 * bright})`);
    g.addColorStop(0.85, `rgba(80,255,180,${0.75 * bright})`);
    g.addColorStop(1, 'rgba(80,255,180,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, top, 1.6, e - top + 2);
  }
}

/** A sunbeam reaching down through water: soft at the sides, fading toward the bottom. */
function paintRay(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'destination-in';
  const f = ctx.createLinearGradient(0, 0, 0, h);
  f.addColorStop(0, 'rgba(0,0,0,1)');
  f.addColorStop(0.55, 'rgba(0,0,0,.4)');
  f.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = f;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
}

function paintBubble(ctx, r) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = 'rgba(180,230,255,.12)';
  ctx.fill();
  ctx.lineWidth = r * 0.14;
  ctx.strokeStyle = 'rgba(210,245,255,.75)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-r * 0.35, -r * 0.35, r * 0.22, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.fill();
}

/** A spiral galaxy seen face on: a warm core, two arms of stars, pink knots and dark lanes. */
function paintGalaxy(ctx, R) {
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.42);
  core.addColorStop(0, 'rgba(255,246,220,.95)');
  core.addColorStop(0.3, 'rgba(255,200,140,.45)');
  core.addColorStop(1, 'rgba(255,160,120,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.42, 0, TAU);
  ctx.fill();
  const haze = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R);
  haze.addColorStop(0, 'rgba(140,150,255,.25)');
  haze.addColorStop(1, 'rgba(90,80,200,0)');
  ctx.fillStyle = haze;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.fill();
  const rnd = seeded(42);
  for (let arm = 0; arm < 2; arm++) {
    for (let i = 0; i < 900; i++) {
      const t = rnd();
      const th = t * 3.6 * Math.PI + arm * Math.PI;
      const r = R * (0.1 + 0.88 * t);
      const spread = R * (0.03 + 0.1 * t) * (rnd() - 0.5) * 2;
      const x = Math.cos(th) * r + Math.cos(th + Math.PI / 2) * spread;
      const y = Math.sin(th) * r + Math.sin(th + Math.PI / 2) * spread;
      const s = rnd() < 0.06 ? 1.6 : 0.5 + rnd() * 0.6;
      ctx.fillStyle = rnd() < 0.08 ? 'rgba(255,150,210,.8)' : rnd() < 0.5 ? 'rgba(200,220,255,.75)' : 'rgba(255,255,255,.8)';
      ctx.beginPath();
      ctx.arc(x, y, s, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(10,6,30,.35)';
    ctx.lineWidth = R * 0.03;
    ctx.beginPath();
    for (let t = 0.08; t <= 0.9; t += 0.01) {
      const th = t * 3.6 * Math.PI + arm * Math.PI - 0.12;
      const r = R * (0.1 + 0.88 * t);
      ctx.lineTo(Math.cos(th) * r, Math.sin(th) * r);
    }
    ctx.stroke();
  }
}

/** A shooting star's streak, pointing along +x with its bright head at the right. */
function paintStreak(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.85, 'rgba(220,235,255,.8)');
  g.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w - h / 2, 0);
  ctx.arc(w - h / 2, h / 2, h / 2, -Math.PI / 2, Math.PI / 2);
  ctx.closePath();
  ctx.fill();
}

/** Mountains along the bottom of the aurora sky. */
function paintRidge(ctx, w, y0, h) {
  const rnd = seeded(9);
  ctx.beginPath();
  ctx.moveTo(-10, y0 + h);
  let y = y0 + h * 0.5;
  for (let x = -10; x <= w + 10; x += 18) {
    y = Math.max(y0, Math.min(y0 + h * 0.8, y + (rnd() - 0.5) * 34));
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w + 10, y0 + h + 400);
  ctx.lineTo(-10, y0 + h + 400);
  ctx.closePath();
}

/** A tile of stars (w x w), the stars near an edge drawn again across it so the tile repeats. */
function paintStars(ctx, w, count, seed, big) {
  const rnd = seeded(seed);
  for (let i = 0; i < count; i++) {
    const x = rnd() * w;
    const y = rnd() * w;
    const r = big ? 0.9 + rnd() * 1.3 : 0.5 + rnd() * 0.8;
    const a = big ? 0.55 + rnd() * 0.45 : 0.25 + rnd() * 0.45;
    const tint = rnd() < 0.15 ? 'rgba(200,220,255,' : rnd() < 0.1 ? 'rgba(255,220,235,' : 'rgba(255,255,255,';
    for (const ox of [-w, 0, w]) {
      for (const oy of [-w, 0, w]) {
        const px = x + ox;
        const py = y + oy;
        if (px < -4 || px > w + 4 || py < -4 || py > w + 4) continue;
        ctx.fillStyle = tint + a + ')';
        ctx.beginPath();
        ctx.arc(px, py, r, 0, TAU);
        ctx.fill();
        if (big && r > 1.8) {
          // a little glint
          ctx.fillStyle = tint + a * 0.5 + ')';
          ctx.fillRect(px - r * 3, py - 0.35, r * 6, 0.7);
          ctx.fillRect(px - 0.35, py - r * 3, 0.7, r * 6);
        }
      }
    }
  }
}

/** A soft, wispy cloud (white: tinted when used), fading out toward its edge. */
function cloudTexture(scene, key, seed) {
  return softTexture(scene, key, 128, (d, px) => {
    const n = valueNoise(seed, 16);
    for (let j = 0; j < px; j++) {
      for (let i = 0; i < px; i++) {
        const u = i / px;
        const v = j / px;
        let f = 0;
        let amp = 0.55;
        let k = 4;
        for (let o = 0; o < 4; o++) {
          f += n(u * k + o * 3.1, v * k + o * 1.7) * amp;
          amp *= 0.5;
          k *= 2;
        }
        const r = Math.hypot(u - 0.5, v - 0.5) * 2;
        const a = smooth(0.42, 0.8, f) * smooth(1, 0.3, r);
        const o = (j * px + i) * 4;
        d[o] = 255;
        d[o + 1] = 255;
        d[o + 2] = 255;
        d[o + 3] = Math.round(255 * a);
      }
    }
  });
}

/** Shimmering light from waves above water: a net of bright lines, tiling every way. */
function causticTexture(scene) {
  return softTexture(scene, 'sky_caustic', 192, (d, px) => {
    for (let j = 0; j < px; j++) {
      for (let i = 0; i < px; i++) {
        const x = (i / px) * TAU;
        const y = (j / px) * TAU;
        let c = 0;
        for (const [a, b, p, q] of [[3, 2, 0.4, 1.3], [2, 3, 2.1, 0.2], [4, 1, 1.2, 2.6]]) {
          const v = Math.sin(a * x + Math.sin(b * y + p) * 1.6 + q);
          c = Math.max(c, Math.pow(1 - Math.abs(v), 8));
        }
        const o = (j * px + i) * 4;
        d[o] = 255;
        d[o + 1] = 255;
        d[o + 2] = 255;
        d[o + 3] = Math.round(255 * c);
      }
    }
  });
}

/** A jellyfish's bell: a see-through dome with a frilled edge and a glowing middle. */
function paintBell(ctx, w, h) {
  const cx = w / 2;
  const base = h * 0.78;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.46, base);
  ctx.bezierCurveTo(cx - w * 0.5, h * 0.05, cx + w * 0.5, h * 0.05, cx + w * 0.46, base);
  // the frilled rim
  for (let i = 0; i <= 8; i++) {
    const x = cx + w * 0.46 - (i / 8) * w * 0.92;
    ctx.quadraticCurveTo(x + w * 0.06, base + h * 0.12, x, base);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(cx, h * 0.45, 2, cx, h * 0.45, w * 0.55);
  g.addColorStop(0, 'rgba(255,255,255,.75)');
  g.addColorStop(0.5, 'rgba(255,255,255,.35)');
  g.addColorStop(1, 'rgba(255,255,255,.12)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(255,255,255,.8)';
  ctx.stroke();
  // four soft marks inside
  ctx.strokeStyle = 'rgba(255,255,255,.5)';
  ctx.lineWidth = 2;
  for (const dx of [-0.18, -0.06, 0.06, 0.18]) {
    ctx.beginPath();
    ctx.arc(cx + dx * w, h * 0.5, w * 0.05, 0, TAU);
    ctx.stroke();
  }
}

// ---------- the moving sky in the game ----------

/**
 * Builds the sky for a theme into a container at depth -10 (behind everything). Moving parts
 * use tweens, particle emitters, timers and one update step that belong to the scene, so they
 * stop with it.
 */
export function buildSky(scene, theme, W, H) {
  const layer = scene.add.container(0, 0).setDepth(-10);
  const add = (o) => {
    layer.add(o);
    return o;
  };
  const steps = []; // per-frame motion: (dt in seconds, t in seconds) => void
  const g = add(scene.add.graphics());
  g.fillGradientStyle(theme.top, theme.top, theme.bottom, theme.bottom, 1);
  g.fillRect(-W, -H, W * 3, H * 3);
  const glowAt = [[150, 380, 5.2], [600, 900, 6], [520, 300, 3.6]];
  glowAt.forEach(([x, y, s], i) => {
    const glow = add(scene.add.image(x, y, 'soft').setScale(s / TEX_SCALE).setTint(theme.glows[i]).setAlpha(0.2).setBlendMode(ADD));
    scene.tweens.add({ targets: glow, alpha: 0.3, duration: 4000 + i * 1300, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  });
  const opts = { add, steps, layer };
  const builders = { nebula: skyNebula, aurora: skyAurora, ocean: skyOcean, inferno: skyInferno, galaxy: skyGalaxy };
  (builders[theme.id] || skyNebula)(scene, opts, W, H, theme);
  if (steps.length) {
    let t = 0;
    const step = (_time, delta) => {
      const dt = Math.min(delta, 50) / 1000;
      t += dt;
      for (const f of steps) f(dt, t);
    };
    scene.events.on('update', step);
    layer.once('destroy', () => scene.events.off('update', step));
  }
  return layer;
}

/** Two layers of stars drifting slowly at different speeds, so the sky has depth. */
function starLayers(scene, { add, steps }, W, H, { far = 1, near = 1, dir = [1, 0.35], top = 0, height = H } = {}) {
  const farKey = canvasTexture(scene, 'sky_stars_far', 256, 256, (ctx, w) => paintStars(ctx, w, 70, 11, false));
  const nearKey = canvasTexture(scene, 'sky_stars_near', 256, 256, (ctx, w) => paintStars(ctx, w, 14, 23, true));
  const layers = [];
  if (far) layers.push([scene.add.tileSprite(W / 2, top + height / 2, W, height, farKey).setAlpha(far), 3]);
  if (near) layers.push([scene.add.tileSprite(W / 2, top + height / 2, W, height, nearKey).setAlpha(near), 8]);
  for (const [ts, speed] of layers) {
    ts.setTileScale(1 / TEX_SCALE);
    add(ts);
    steps.push((dt) => {
      ts.tilePositionX += dir[0] * speed * dt * TEX_SCALE;
      ts.tilePositionY += dir[1] * speed * dt * TEX_SCALE;
    });
  }
  // a few stars that twinkle
  for (let i = 0; i < 8; i++) {
    const s = add(scene.add.image(Math.random() * W, top + Math.random() * height, 'spark').setScale(0.35 / TEX_SCALE).setAlpha(0.2));
    scene.tweens.add({ targets: s, alpha: 0.9, duration: 900 + Math.random() * 1500, yoyo: true, repeat: -1, delay: Math.random() * 2000 });
  }
}

/** Slow clouds of light in the sky's colours, drifting and turning a little. */
function nebulaClouds(scene, { add }, W, H, colors, alpha = 0.16) {
  colors.forEach((c, i) => {
    const key = cloudTexture(scene, `sky_cloud${i}`, 31 + i * 17);
    const x = [W * 0.25, W * 0.78, W * 0.5][i % 3];
    const y = [H * 0.28, H * 0.62, H * 0.9][i % 3];
    const size = [560, 640, 520][i % 3];
    const cloud = add(scene.add.image(x, y, key).setDisplaySize(size, size).setTint(c).setAlpha(alpha).setBlendMode(ADD).setRotation(i));
    scene.tweens.add({ targets: cloud, x: x + (i % 2 ? -50 : 50), y: y + 20, rotation: i + 0.25, duration: 26000 + i * 7000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    scene.tweens.add({ targets: cloud, alpha: alpha * 0.55, duration: 9000 + i * 2500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  });
}

/** Now and then a shooting star crosses the upper sky. */
function shootingStars(scene, { add, layer }, W, every) {
  const streak = canvasTexture(scene, 'sky_streak', 160, 4, paintStreak);
  const shoot = () => {
    if (!layer.active) return;
    const x = 80 + Math.random() * (W - 160);
    const y = 120 + Math.random() * 480;
    const a = Math.PI * (0.15 + Math.random() * 0.2) * (Math.random() < 0.5 ? 1 : -1) + (Math.random() < 0.5 ? 0 : Math.PI);
    const s = add(scene.add.image(x, y, streak).setOrigin(1, 0.5).setRotation(a).setScale(0.3 / TEX_SCALE, 1 / TEX_SCALE).setAlpha(0).setBlendMode(ADD));
    const d = 220 + Math.random() * 160;
    scene.tweens.add({ targets: s, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, scaleX: 1 / TEX_SCALE, duration: 750, ease: 'Cubic.out', onComplete: () => s.destroy() });
    scene.tweens.add({ targets: s, alpha: { from: 0, to: 0.9 }, duration: 160, yoyo: true, hold: 280 });
    scene.time.delayedCall(every[0] + Math.random() * (every[1] - every[0]), shoot);
  };
  scene.time.delayedCall(1500 + Math.random() * 2000, shoot);
}

function skyNebula(scene, opts, W, H, theme) {
  nebulaClouds(scene, opts, W, H, [theme.glows[0], theme.glows[2], theme.glows[1]], 0.15);
  starLayers(scene, opts, W, H);
  shootingStars(scene, opts, W, [7000, 14000]);
}

function skyAurora(scene, opts, W, H) {
  const { add, steps } = opts;
  starLayers(scene, opts, W, H, { near: 0.8, dir: [1, 0], height: H * 0.75 });
  // two curtains whose light flows along them, swaying and breathing
  const k1 = canvasTexture(scene, 'sky_curtain_a', 720, 420, (ctx, w, h) => paintCurtain(ctx, w, h, 3));
  const k2 = canvasTexture(scene, 'sky_curtain_b', 720, 420, (ctx, w, h) => paintCurtain(ctx, w, h, 11));
  [[W * 0.5, 320, k1, 0x8affd0, 0.55, 14], [W * 0.5, 250, k2, 0x9ad8ff, 0.38, -9], [W * 0.45, 430, k2, 0xc4a8ff, 0.22, 6]].forEach(([x, y, k, tint, alpha, flow], i) => {
    const c = add(scene.add.tileSprite(x, y, W * 1.4, 420, k).setTileScale(1 / TEX_SCALE).setTint(tint).setAlpha(alpha).setBlendMode(ADD));
    steps.push((dt) => {
      c.tilePositionX += flow * dt * TEX_SCALE;
    });
    scene.tweens.add({ targets: c, x: x + 36 - i * 24, duration: 7000 + i * 1700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    scene.tweens.add({ targets: c, scaleY: 1.16, duration: 4200 + i * 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    scene.tweens.add({ targets: c, alpha: alpha * 0.45, duration: 2600 + i * 700, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: i * 500 });
  });
  // the glow of the lights on the snow along the ridge
  const shine = add(scene.add.image(W / 2, H - 120, 'soft').setScale(10 / TEX_SCALE, 1.6 / TEX_SCALE).setTint(0x5affc0).setAlpha(0.14).setBlendMode(ADD));
  scene.tweens.add({ targets: shine, alpha: 0.24, duration: 3300, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  const ridge = add(scene.add.graphics());
  ridge.fillStyle(0x02080c, 1);
  paintRidgeOn(ridge, W, H - 150, 120);
  ridge.lineStyle(1.5, 0x7affd0, 0.18);
  strokeRidgeOn(ridge, W, H - 150, 120);
  const snow = scene.add.particles(0, 0, 'dot', {
    x: { min: -20, max: W + 20 },
    y: -10,
    lifespan: 16000,
    speedY: { min: 22, max: 48 },
    speedX: { min: -10, max: 10 },
    scale: { min: 0.12 / TEX_SCALE, max: 0.3 / TEX_SCALE },
    alpha: { min: 0.35, max: 0.85 },
    frequency: 260,
  });
  snow.fastForward(16000);
  add(snow);
}

function ridgePoints(w, y0, h) {
  const rnd = seeded(9);
  const pts = [];
  let y = y0 + h * 0.5;
  for (let x = -10; x <= w + 10; x += 18) {
    y = Math.max(y0, Math.min(y0 + h * 0.8, y + (rnd() - 0.5) * 34));
    pts.push(new Phaser.Math.Vector2(x, y));
  }
  return pts;
}

/** The ridge, drawn with a Phaser Graphics (the same shape as the canvas painter). */
function paintRidgeOn(g, w, y0, h) {
  g.fillPoints([new Phaser.Math.Vector2(-10, y0 + h + 400), ...ridgePoints(w, y0, h), new Phaser.Math.Vector2(w + 10, y0 + h + 400)], true);
}

/** A faint line of light along the ridge's top. */
function strokeRidgeOn(g, w, y0, h) {
  g.strokePoints(ridgePoints(w, y0, h), false);
}

function skyOcean(scene, opts, W, H) {
  const { add, steps } = opts;
  // light from the waves above, shimmering in two layers that drift past each other and fade
  // out with depth
  const caustic = causticTexture(scene);
  const fade = softTexture(scene, 'sky_fade_down', 64, (d, px) => {
    for (let j = 0; j < px; j++) {
      const a = Math.round(255 * Math.pow(1 - j / (px - 1), 1.6));
      for (let i = 0; i < px; i++) {
        const o = (j * px + i) * 4;
        d[o] = 255;
        d[o + 1] = 255;
        d[o + 2] = 255;
        d[o + 3] = a;
      }
    }
  });
  const depth = H * 0.62;
  const mask = scene.make.image({ x: W / 2, y: depth / 2, key: fade, add: false }).setDisplaySize(W, depth);
  [[0.075, 2.2, [7, 4]], [0.05, 2.9, [-5, 6]]].forEach(([alpha, scale, [vx, vy]]) => {
    const c = add(scene.add.tileSprite(W / 2, depth / 2, W, depth, caustic).setTileScale(scale).setTint(0xbfeaff).setAlpha(alpha).setBlendMode(ADD));
    c.setMask(new Phaser.Display.Masks.BitmapMask(scene, mask));
    steps.push((dt) => {
      c.tilePositionX += vx * dt;
      c.tilePositionY += vy * dt;
    });
  });
  const ray = canvasTexture(scene, 'sky_ray', 90, 900, paintRay);
  [[110, -0.32, 0.16], [290, -0.18, 0.12], [450, -0.05, 0.18], [610, 0.1, 0.12], [700, 0.2, 0.09]].forEach(([x, rot, alpha], i) => {
    const r = add(scene.add.image(x, -60, ray).setOrigin(0.5, 0).setScale((1.4 + (i % 2) * 0.8) / TEX_SCALE, 1.5 / TEX_SCALE).setRotation(rot).setTint(0xbfeaff).setAlpha(alpha).setBlendMode(ADD));
    scene.tweens.add({ targets: r, rotation: rot + 0.06, duration: 5200 + i * 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    scene.tweens.add({ targets: r, alpha: alpha * 0.35, duration: 3100 + i * 800, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: i * 400 });
  });
  const specks = add(scene.add.graphics());
  for (let i = 0; i < 70; i++) {
    specks.fillStyle(0x9fdcff, 0.15 + Math.random() * 0.3);
    specks.fillCircle(Math.random() * W, Math.random() * H, 0.6 + Math.random() * 1.2);
  }
  scene.tweens.add({ targets: specks, y: -30, duration: 30000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  jellyfish(scene, opts, W, H);
  const floor = add(scene.add.graphics());
  floor.fillStyle(0x020a1c, 1);
  floor.fillEllipse(W * 0.2, H + 40, W * 0.9, 210);
  floor.fillEllipse(W * 0.8, H + 60, W * 0.9, 230);
  const bubble = canvasTexture(scene, 'sky_bubble', 24, 24, (ctx) => {
    ctx.translate(12, 12);
    paintBubble(ctx, 10);
  });
  const bubbles = scene.add.particles(0, 0, bubble, {
    x: { min: 10, max: W - 10 },
    y: H + 20,
    lifespan: 20000,
    speedY: { min: -85, max: -45 },
    speedX: { min: -6, max: 6 },
    scale: { min: 0.35 / TEX_SCALE, max: 0.9 / TEX_SCALE },
    alpha: { start: 0.9, end: 0.2 },
    frequency: 700,
  });
  bubbles.fastForward(20000);
  add(bubbles);
}

/** A few glowing jellyfish drifting up through the water: their bells pulse and they push upward. */
function jellyfish(scene, { add, steps }, W, H) {
  const bellKey = canvasTexture(scene, 'sky_bell', 64, 54, paintBell);
  const tentacles = add(scene.add.graphics().setBlendMode(ADD));
  const colors = [0xff9ad6, 0xb59cff, 0x8fe3ff];
  const fish = colors.map((tint, i) => {
    const size = [1, 0.75, 0.6][i];
    const bell = add(scene.add.image(0, 0, bellKey).setScale(size / TEX_SCALE).setTint(tint).setAlpha(0.55).setBlendMode(ADD));
    return { bell, tint, size, x: W * [0.18, 0.82, 0.62][i], y: H * [0.85, 0.5, 1.05][i], phase: i * 2.1, sway: Math.random() * TAU };
  });
  steps.push((dt, t) => {
    tentacles.clear();
    for (const f of fish) {
      f.phase += dt * 2.4;
      const pulse = Math.sin(f.phase);
      const push = Math.max(0, pulse);
      f.y -= (6 + 22 * push) * f.size * dt;
      f.x += Math.sin(t * 0.25 + f.sway) * 5 * dt;
      if (f.y < -90) {
        f.y = H + 80;
        f.x = 60 + Math.random() * (W - 120);
      }
      f.bell.setPosition(f.x, f.y).setScale(((1 + 0.08 * pulse) * f.size) / TEX_SCALE, ((1 - 0.1 * pulse) * f.size) / TEX_SCALE);
      // its tentacles trail and wave
      const s = f.size;
      tentacles.lineStyle(1.6, f.tint, 0.32);
      for (let k = 0; k < 5; k++) {
        const x0 = f.x + (k - 2) * 7 * s;
        const y0 = f.y + 14 * s;
        tentacles.beginPath();
        tentacles.moveTo(x0, y0);
        for (let seg = 1; seg <= 8; seg++) {
          const d = seg * 7 * s;
          tentacles.lineTo(x0 + Math.sin(t * 2 + k + seg * 0.6) * seg * 0.9 * s, y0 + d);
        }
        tentacles.strokePath();
      }
    }
  });
}

function skyInferno(scene, opts, W, H) {
  const { add } = opts;
  starLayers(scene, opts, W, H, { far: 0.35, near: 0, dir: [0.2, -1] });
  // smoke rolling up from the deep, dark against the glow
  for (let i = 0; i < 3; i++) {
    const key = cloudTexture(scene, `sky_cloud${i}`, 31 + i * 17);
    const smoke = add(scene.add.image(W * (0.2 + i * 0.3), H * (0.55 + 0.15 * (i % 2)), key).setDisplaySize(520, 520).setTint(0x3a0c08).setAlpha(0.32).setRotation(i));
    scene.tweens.add({ targets: smoke, y: smoke.y - 90, rotation: i + 0.3, duration: 18000 + i * 5000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }
  nebulaClouds(scene, opts, W, H, [0xff6a2a, 0xc0303a], 0.1);
  const heat = add(scene.add.image(W / 2, H + 40, 'soft').setScale(10 / TEX_SCALE, 4 / TEX_SCALE).setTint(0xff4a14).setAlpha(0.4).setBlendMode(ADD));
  const flicker = () => {
    if (!heat.active) return;
    scene.tweens.add({ targets: heat, alpha: 0.28 + Math.random() * 0.22, duration: 160 + Math.random() * 380, ease: 'Sine.inOut', onComplete: flicker });
  };
  flicker();
  const haze = add(scene.add.image(W / 2, H * 0.92, 'soft').setScale(12 / TEX_SCALE, 5 / TEX_SCALE).setTint(0xff8a2a).setAlpha(0.12).setBlendMode(ADD));
  scene.tweens.add({ targets: haze, alpha: 0.2, scaleX: 12.6 / TEX_SCALE, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  const embers = scene.add.particles(0, 0, 'dot', {
    x: { min: -10, max: W + 10 },
    y: H + 10,
    lifespan: { min: 9000, max: 15000 },
    speedY: { min: -110, max: -50 },
    speedX: { min: -16, max: 16 },
    scale: { start: 0.32 / TEX_SCALE, end: 0.06 / TEX_SCALE },
    alpha: { start: 0.95, end: 0 },
    tint: [0xffb347, 0xff7a2a, 0xffd27a, 0xff5a3a],
    blendMode: 'ADD',
    frequency: 150,
  });
  embers.fastForward(12000);
  add(embers);
  // now and then the deep flares: a spray of bright sparks
  const flares = scene.add.particles(0, 0, 'spark', {
    lifespan: { min: 1400, max: 2600 },
    speed: { min: 60, max: 170 },
    angle: { min: 240, max: 300 },
    gravityY: 60,
    scale: { start: 0.3 / TEX_SCALE, end: 0.02 / TEX_SCALE },
    alpha: { start: 1, end: 0 },
    rotate: { min: 0, max: 360 },
    tint: [0xffe08a, 0xffa040],
    blendMode: 'ADD',
    emitting: false,
  });
  add(flares);
  const flare = () => {
    if (!flares.active) return;
    const x = 60 + Math.random() * (W - 120);
    flares.explode(14 + Math.floor(Math.random() * 10), x, H + 10);
    const glow = add(scene.add.image(x, H, 'soft').setScale(3 / TEX_SCALE, 1.6 / TEX_SCALE).setTint(0xff9a3a).setAlpha(0.5).setBlendMode(ADD));
    scene.tweens.add({ targets: glow, alpha: 0, duration: 900, onComplete: () => glow.destroy() });
    scene.time.delayedCall(4000 + Math.random() * 5000, flare);
  };
  scene.time.delayedCall(2500, flare);
  const sparks = scene.add.particles(0, 0, 'soft', {
    x: { min: 0, max: W },
    y: H + 20,
    lifespan: 11000,
    speedY: { min: -70, max: -40 },
    speedX: { min: -10, max: 10 },
    scale: { start: 0.14 / TEX_SCALE, end: 0.02 / TEX_SCALE },
    alpha: { start: 0.7, end: 0 },
    tint: 0xff9a3a,
    blendMode: 'ADD',
    frequency: 900,
  });
  sparks.fastForward(11000);
  add(sparks);
}

function skyGalaxy(scene, opts, W, H, theme) {
  const { add } = opts;
  nebulaClouds(scene, opts, W, H, [0x7a6aff, 0xd06ac0], 0.1);
  starLayers(scene, opts, W, H, { dir: [0.6, 0.6] });
  const key = canvasTexture(scene, 'sky_galaxy', 520, 520, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2);
    paintGalaxy(ctx, w / 2 - 4);
  });
  // seen at a slant: each picture turns inside a squashed holder; a smaller one far away
  [[W * 0.3, 330, 0.9, 0.55, -0.35, 0.75, -1, 0xffffff], [W * 0.82, 1020, 0.32, 0.45, 0.5, 0.5, 1, 0xc8b8ff]].forEach(([x, y, size, squash, tilt, alpha, dir, tint]) => {
    const holder = scene.add.container(x, y).setScale(1, squash).setRotation(tilt).setAlpha(alpha);
    const galaxy = scene.add.image(0, 0, key).setScale(size / TEX_SCALE).setTint(tint).setBlendMode(ADD);
    holder.add(galaxy);
    add(holder);
    scene.tweens.add({ targets: galaxy, rotation: dir * TAU, duration: 240000 / (size < 0.5 ? 0.6 : 1), repeat: -1 });
  });
  shootingStars(scene, opts, W, [2500, 7000]);
}

// ---------- small still pictures for the shop ----------

/** A small still of a theme's sky, for its card in the shop. Returns the texture key. */
export function skyPreview(scene, theme, w, h) {
  return canvasTexture(scene, `skypv_${theme.id}`, w, h, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, css(theme.top));
    g.addColorStop(1, css(theme.bottom));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    theme.glows.forEach((c, i) => {
      const x = [0.25, 0.8, 0.65][i] * w;
      const y = [0.35, 0.75, 0.25][i] * h;
      const r = [0.45, 0.5, 0.32][i] * w;
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, css(c, 0.32));
      rg.addColorStop(1, css(c, 0));
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
    });
    const rnd = seeded(theme.id.length * 7 + 3);
    const stars = { ocean: 0, inferno: 6, aurora: 14, galaxy: 30 }[theme.id] ?? 20;
    for (let i = 0; i < stars; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.4 + rnd() * 0.5})`;
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * h, 0.4 + rnd() * 0.8, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    if (theme.id === 'aurora') {
      ctx.save();
      ctx.globalAlpha = 0.85;
      paintCurtain(ctx, w, h * 0.7, 3);
      ctx.restore();
    } else if (theme.id === 'ocean') {
      for (const [x, rot] of [[0.2, -0.3], [0.5, -0.08], [0.78, 0.15]]) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.translate(x * w, -4);
        ctx.rotate(rot);
        ctx.translate(-w * 0.07, 0);
        paintRay(ctx, w * 0.14, h * 1.2);
        ctx.restore();
      }
      for (let i = 0; i < 9; i++) {
        ctx.save();
        ctx.translate(rnd() * w, h * (0.3 + rnd() * 0.65));
        paintBubble(ctx, 1.2 + rnd() * 2.2);
        ctx.restore();
      }
    } else if (theme.id === 'inferno') {
      const hg = ctx.createRadialGradient(w / 2, h * 1.1, 0, w / 2, h * 1.1, w * 0.7);
      hg.addColorStop(0, 'rgba(255,110,40,.6)');
      hg.addColorStop(1, 'rgba(255,60,20,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 18; i++) {
        ctx.fillStyle = `rgba(255,${150 + rnd() * 80 | 0},60,${0.5 + rnd() * 0.5})`;
        ctx.beginPath();
        ctx.arc(rnd() * w, h * (0.25 + rnd() * 0.75), 0.6 + rnd() * 1.1, 0, TAU);
        ctx.fill();
      }
    } else if (theme.id === 'galaxy') {
      ctx.save();
      ctx.translate(w * 0.42, h * 0.48);
      ctx.rotate(-0.35);
      ctx.scale(1, 0.55);
      paintGalaxy(ctx, w * 0.36);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
    if (theme.id === 'aurora') {
      ctx.fillStyle = '#02080c';
      paintRidge(ctx, w, h * 0.78, h * 0.16);
      ctx.fill();
    }
  });
}

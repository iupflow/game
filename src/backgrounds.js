// The sky behind the game, one for each background in the shop. Each is a still picture (the
// sky's gradient, soft nebulae, stars) plus something that keeps moving: twinkling stars, swaying
// aurora curtains and snow, sunbeams and rising bubbles, embers drifting up from a glowing deep,
// or a slowly turning galaxy with shooting stars. Everything is drawn in code, no image files.
import Phaser from 'phaser';
import { TEX_SCALE } from './art.js';

const ADD = Phaser.BlendModes.ADD;
const TAU = Math.PI * 2;
const css = (c, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function canvasTexture(scene, key, w, h, paint) {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, Math.ceil(w * TEX_SCALE), Math.ceil(h * TEX_SCALE));
  const ctx = tex.getContext();
  ctx.scale(TEX_SCALE, TEX_SCALE);
  paint(ctx, w, h);
  tex.refresh();
  return key;
}

// ---------- painters, shared by the game and the shop's little previews ----------

/** A curtain of northern lights: rays standing on a wavy lower edge, fading upward. */
function paintCurtain(ctx, w, h, seed = 1) {
  const rnd = seeded(seed);
  const waves = [0.6 + rnd() * 0.6, 1.4 + rnd(), 3 + rnd() * 2].map((f) => [f, rnd() * TAU]);
  const edge = (x) => h * (0.72 + waves.reduce((s, [f, p], i) => s + Math.sin((x / w) * TAU * f + p) * (0.09 / (i + 1)), 0));
  for (let x = 0; x < w; x += 1.5) {
    const e = edge(x);
    const bright = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(x * 0.21 + Math.sin(x * 0.047) * 3), 2);
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
    // the dark lane inside each arm
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

// ---------- the moving sky in the game ----------

/**
 * Builds the sky for a theme into a container at depth -10 (behind everything). Moving parts
 * use tweens, particle emitters and timers that belong to the scene, so they stop with it.
 */
export function buildSky(scene, theme, W, H) {
  const layer = scene.add.container(0, 0).setDepth(-10);
  const add = (o) => {
    layer.add(o);
    return o;
  };
  const g = add(scene.add.graphics());
  g.fillGradientStyle(theme.top, theme.top, theme.bottom, theme.bottom, 1);
  g.fillRect(-W, -H, W * 3, H * 3);
  const rnd = Math.random;
  const glowAt = [[150, 380, 5.2], [600, 900, 6], [520, 300, 3.6]];
  glowAt.forEach(([x, y, s], i) => {
    const glow = add(scene.add.image(x, y, 'soft').setScale(s / TEX_SCALE).setTint(theme.glows[i]).setAlpha(0.2).setBlendMode(ADD));
    scene.tweens.add({ targets: glow, alpha: 0.3, duration: 4000 + i * 1300, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  });
  const stars = { nebula: 110, aurora: 70, ocean: 0, inferno: 30, galaxy: 170 }[theme.id] ?? 110;
  for (let i = 0; i < stars; i++) {
    const tint = theme.id === 'galaxy' && rnd() < 0.2 ? (rnd() < 0.5 ? 0xbfd4ff : 0xffd6ec) : 0xffffff;
    g.fillStyle(tint, (0.25 + rnd() * 0.6) * (theme.id === 'inferno' ? 0.5 : 1));
    g.fillCircle(rnd() * W, rnd() * (theme.id === 'aurora' ? H * 0.8 : H), 0.6 + rnd() * 1.5);
  }
  if (theme.id !== 'ocean') {
    for (let i = 0; i < 9; i++) {
      const s = add(scene.add.image(rnd() * W, 200 + rnd() * 900, 'spark').setScale(0.35 / TEX_SCALE).setAlpha(0.2));
      scene.tweens.add({ targets: s, alpha: 0.9, duration: 900 + rnd() * 1500, yoyo: true, repeat: -1, delay: rnd() * 2000 });
    }
  }
  const builders = { aurora: skyAurora, ocean: skyOcean, inferno: skyInferno, galaxy: skyGalaxy };
  if (builders[theme.id]) builders[theme.id](scene, add, W, H);
  return layer;
}

function skyAurora(scene, add, W, H) {
  const key = canvasTexture(scene, 'sky_curtain', 720, 420, (ctx, w, h) => paintCurtain(ctx, w, h, 3));
  const key2 = canvasTexture(scene, 'sky_curtain2', 720, 420, (ctx, w, h) => paintCurtain(ctx, w, h, 11));
  [[W * 0.45, 330, key, 0x8affd0, 0.5], [W * 0.62, 250, key2, 0x9ad8ff, 0.36], [W * 0.3, 430, key2, 0xc4a8ff, 0.24]].forEach(([x, y, k, tint, alpha], i) => {
    const c = add(scene.add.image(x, y, k).setScale(1.25 / TEX_SCALE, 1 / TEX_SCALE).setTint(tint).setAlpha(alpha).setBlendMode(ADD));
    scene.tweens.add({ targets: c, x: x + 40 - i * 25, duration: 7000 + i * 1700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    scene.tweens.add({ targets: c, scaleY: 1.18 / TEX_SCALE, duration: 4200 + i * 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    scene.tweens.add({ targets: c, alpha: alpha * 0.45, duration: 2600 + i * 700, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: i * 500 });
  });
  const ridge = add(scene.add.graphics());
  ridge.fillStyle(0x02080c, 1);
  paintRidgeOn(ridge, W, H - 150, 120);
  // snow, drifting down
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

/** The ridge, drawn with a Phaser Graphics (same shape as the canvas painter). */
function paintRidgeOn(g, w, y0, h) {
  const rnd = seeded(9);
  const pts = [new Phaser.Math.Vector2(-10, y0 + h + 400)];
  let y = y0 + h * 0.5;
  for (let x = -10; x <= w + 10; x += 18) {
    y = Math.max(y0, Math.min(y0 + h * 0.8, y + (rnd() - 0.5) * 34));
    pts.push(new Phaser.Math.Vector2(x, y));
  }
  pts.push(new Phaser.Math.Vector2(w + 10, y0 + h + 400));
  g.fillPoints(pts, true);
}

function skyOcean(scene, add, W, H) {
  const ray = canvasTexture(scene, 'sky_ray', 90, 900, paintRay);
  [[110, -0.32, 0.16], [290, -0.18, 0.12], [450, -0.05, 0.18], [610, 0.1, 0.12], [700, 0.2, 0.09]].forEach(([x, rot, alpha], i) => {
    const r = add(scene.add.image(x, -60, ray).setOrigin(0.5, 0).setScale((1.4 + (i % 2) * 0.8) / TEX_SCALE, 1.5 / TEX_SCALE).setRotation(rot).setTint(0xbfeaff).setAlpha(alpha).setBlendMode(ADD));
    scene.tweens.add({ targets: r, rotation: rot + 0.06, duration: 5200 + i * 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    scene.tweens.add({ targets: r, alpha: alpha * 0.35, duration: 3100 + i * 800, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: i * 400 });
  });
  // drifting specks in the water
  const specks = add(scene.add.graphics());
  for (let i = 0; i < 70; i++) {
    specks.fillStyle(0x9fdcff, 0.15 + Math.random() * 0.3);
    specks.fillCircle(Math.random() * W, Math.random() * H, 0.6 + Math.random() * 1.2);
  }
  scene.tweens.add({ targets: specks, y: -30, duration: 30000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  // the sea floor: dark, softly lit dunes
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

function skyInferno(scene, add, W, H) {
  // the glowing deep, flickering
  const heat = add(scene.add.image(W / 2, H + 40, 'soft').setScale(10 / TEX_SCALE, 4 / TEX_SCALE).setTint(0xff4a14).setAlpha(0.4).setBlendMode(ADD));
  const flicker = () => {
    if (!heat.active) return;
    scene.tweens.add({ targets: heat, alpha: 0.28 + Math.random() * 0.22, duration: 160 + Math.random() * 380, ease: 'Sine.inOut', onComplete: flicker });
  };
  flicker();
  const haze = add(scene.add.image(W / 2, H * 0.92, 'soft').setScale(12 / TEX_SCALE, 5 / TEX_SCALE).setTint(0xff8a2a).setAlpha(0.12).setBlendMode(ADD));
  scene.tweens.add({ targets: haze, alpha: 0.2, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
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

function skyGalaxy(scene, add, W, H) {
  const key = canvasTexture(scene, 'sky_galaxy', 520, 520, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2);
    paintGalaxy(ctx, w / 2 - 4);
  });
  // seen at a slant: the picture turns inside a squashed holder
  const holder = scene.add.container(W * 0.3, 330).setScale(1, 0.55).setRotation(-0.35).setAlpha(0.75);
  const galaxy = scene.add.image(0, 0, key).setScale(0.9 / TEX_SCALE).setBlendMode(ADD);
  holder.add(galaxy);
  add(holder);
  scene.tweens.add({ targets: galaxy, rotation: -TAU, duration: 240000, repeat: -1 });
  const streak = canvasTexture(scene, 'sky_streak', 160, 4, paintStreak);
  const shoot = () => {
    if (!holder.active) return;
    const x = 80 + Math.random() * (W - 160);
    const y = 120 + Math.random() * 520;
    const a = Math.PI * (0.15 + Math.random() * 0.2) * (Math.random() < 0.5 ? 1 : -1) + (Math.random() < 0.5 ? 0 : Math.PI);
    const s = add(scene.add.image(x, y, streak).setOrigin(1, 0.5).setRotation(a).setScale(0.3 / TEX_SCALE, 1 / TEX_SCALE).setAlpha(0).setBlendMode(ADD));
    const d = 220 + Math.random() * 160;
    scene.tweens.add({
      targets: s,
      x: x + Math.cos(a) * d,
      y: y + Math.sin(a) * d,
      scaleX: 1 / TEX_SCALE,
      duration: 750,
      ease: 'Cubic.out',
      onComplete: () => s.destroy(),
    });
    scene.tweens.add({ targets: s, alpha: { from: 0, to: 0.9 }, duration: 160, yoyo: true, hold: 280 });
    scene.time.delayedCall(2500 + Math.random() * 4500, shoot);
  };
  scene.time.delayedCall(1500, shoot);
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

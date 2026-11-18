// Jelly UI. Everything that can be tapped is made of jelly: it wobbles and swells a little when
// the pointer comes over it, squashes flat while it is pressed and springs back with a bounce
// when it is let go; the main buttons breathe gently at rest. Buttons and bubbles are drawn as
// glossy jelly: lighter on top, a shiny highlight, a couple of bubbles inside, a deeper base.
import { TEX_SCALE } from './art.js';

const TAU = Math.PI * 2;
const ch = (c, s) => (c >> s) & 255;
export function mix(c1, c2, t) {
  const m = (s) => Math.round(ch(c1, s) + (ch(c2, s) - ch(c1, s)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}
const darker = (c, f) => mix(0x000000, c, f);
const css = (c, a = 1) => `rgba(${ch(c, 16)},${ch(c, 8)},${ch(c, 0)},${a})`;

// ---------- motion ----------

/**
 * One spring per jelly object, stepped every frame: q is the squash (wider and flatter when
 * positive), p the swell. While nothing moves an object, its scale is left alone.
 */
export class JellyUi {
  constructor(scene) {
    this.scene = scene;
    this.items = new Set();
    scene.events.on('update', this.step, this);
    scene.events.once('shutdown', () => {
      scene.events.off('update', this.step, this);
      this.items.clear();
    });
  }

  /**
   * Makes obj jelly. breathe: it swells gently at rest (the main call to action); glow: an
   * object (a brighter copy of it) that lights up while it is touched; soft: smaller motion.
   */
  add(obj, { source = obj, breathe = false, glow = null, soft = false } = {}) {
    const j = { obj, q: 0, qv: 0, p: 0, pv: 0, hover: false, down: false, breathe, glow, k: soft ? 0.6 : 1, t: Math.random() * TAU, sx: obj.scaleX, sy: obj.scaleY, still: true };
    obj.jelly = j;
    this.items.add(j);
    obj.once('destroy', () => this.items.delete(j));
    // source: what is touched (an invisible zone, say), when that is not the jelly itself
    const on = source;
    on.on('pointerover', () => {
      j.hover = true;
      j.qv += 0.035 * j.k;
      j.still = false;
    });
    on.on('pointerout', () => {
      j.hover = false;
      j.down = false;
    });
    on.on('pointerdown', () => {
      j.down = true;
      j.qv += 0.03 * j.k;
      j.still = false;
    });
    on.on('pointerup', () => {
      if (j.down) j.qv -= 0.035 * j.k;
      j.down = false;
    });
    return j;
  }

  /** A wobble, as if the jelly had been flicked. */
  wobble(obj, amount = 0.06) {
    const j = obj && obj.jelly;
    if (!j) return;
    j.qv += amount;
    j.still = false;
  }

  /** A pop: it swells and wobbles, for something new or earned. */
  pop(obj, amount = 0.07) {
    const j = obj && obj.jelly;
    if (!j) return;
    j.pv += amount;
    j.qv -= amount * 0.7;
    j.still = false;
  }

  step(_time, delta) {
    const dt = Math.min(delta, 40) / 16.667;
    for (const j of this.items) {
      const o = j.obj;
      if (!o.active) continue;
      const tq = j.down ? 0.11 * j.k : 0;
      const tp = j.down ? -0.03 * j.k : j.hover ? 0.045 * j.k : 0;
      j.t += 0.065 * dt;
      // the springs: soft and bouncy, like jelly
      j.qv += (-0.22 * (j.q - tq) - 0.15 * j.qv) * dt;
      j.q += j.qv * dt;
      j.pv += (-0.2 * (j.p - tp) - 0.24 * j.pv) * dt;
      j.p += j.pv * dt;
      let q = j.q;
      let p = j.p;
      if (j.hover && !j.down) q += Math.sin(j.t * 2.3) * 0.022 * j.k; // alive while the pointer is on it
      if (j.breathe) {
        p += Math.sin(j.t * 0.9) * 0.016;
        q += Math.sin(j.t * 0.9 + 1.2) * 0.012;
      }
      if (j.glow) {
        const target = j.down ? 0.3 : j.hover ? 0.18 : 0;
        j.glow.alpha += (target - j.glow.alpha) * Math.min(1, 0.25 * dt);
      }
      const moving = j.hover || j.down || j.breathe || Math.abs(j.q) + Math.abs(j.qv) + Math.abs(j.p) + Math.abs(j.pv) > 0.0005;
      if (!moving) {
        if (!j.still) {
          o.setScale(j.sx, j.sy);
          j.still = true;
        }
        continue;
      }
      j.still = false;
      o.setScale(j.sx * (1 + p) * (1 + q), j.sy * (1 + p) * (1 - q));
    }
  }
}

// ---------- pictures ----------

function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function dot(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

function canvasTexture(scene, key, w, h, paint) {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, Math.ceil(w * TEX_SCALE), Math.ceil(h * TEX_SCALE));
  const ctx = tex.getContext();
  ctx.scale(TEX_SCALE, TEX_SCALE);
  paint(ctx);
  tex.refresh();
  return key;
}

/** A jelly slab of w x h in a colour, centred on (0, 0), sitting on a darker base `lip` deep. */
function paintSlab(ctx, w, h, color, lip, alpha = 1) {
  const r = Math.min(h / 2, 28);
  roundRect(ctx, -w / 2, -h / 2 + lip, w, h, r);
  ctx.fillStyle = css(darker(color, 0.55), alpha);
  ctx.fill();
  const body = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  body.addColorStop(0, css(mix(color, 0xffffff, 0.3), alpha));
  body.addColorStop(0.55, css(color, alpha));
  body.addColorStop(1, css(darker(color, 0.8), alpha));
  roundRect(ctx, -w / 2, -h / 2, w, h, r);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.save();
  roundRect(ctx, -w / 2, -h / 2, w, h, r);
  ctx.clip();
  // light passing through the jelly gathers low inside it
  const inner = ctx.createRadialGradient(0, h * 0.5, 0, 0, h * 0.5, Math.max(w * 0.5, h));
  inner.addColorStop(0, 'rgba(255,255,255,0.2)');
  inner.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = inner;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  // jelly is deeper at its edges
  ctx.lineWidth = Math.max(4, h * 0.1);
  ctx.strokeStyle = css(darker(color, 0.78), 0.45 * alpha);
  roundRect(ctx, -w / 2, -h / 2, w, h, r);
  ctx.stroke();
  ctx.restore();
  // the shine across the top
  const gh = h * 0.4;
  const inset = Math.min(12, r * 0.65);
  const gloss = ctx.createLinearGradient(0, -h / 2 + 3, 0, -h / 2 + 3 + gh);
  gloss.addColorStop(0, 'rgba(255,255,255,0.62)');
  gloss.addColorStop(1, 'rgba(255,255,255,0.02)');
  roundRect(ctx, -w / 2 + inset, -h / 2 + 3, w - inset * 2, gh, Math.min(r * 0.8, gh / 2));
  ctx.fillStyle = gloss;
  ctx.fill();
  // two little bubbles caught inside
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  const bx = w / 2 - Math.max(r * 0.75, 15);
  dot(ctx, bx, h * 0.14, Math.max(1.8, h * 0.055));
  dot(ctx, bx - Math.max(7, h * 0.14), h * 0.27, Math.max(1.2, h * 0.033));
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.32)';
  roundRect(ctx, -w / 2 + 0.75, -h / 2 + 0.75, w - 1.5, h - 1.5, r - 0.75);
  ctx.stroke();
}

/**
 * A jelly button's picture. Returns { key, oy }: the texture and the origin that puts the
 * middle of the button (not of its base) at the object's position.
 */
export function jellySlab(scene, w, h, color, alpha = 1) {
  const lip = Math.max(4, Math.round(h * 0.07));
  const pad = 3;
  const tw = w + pad * 2;
  const th = h + lip + pad * 2;
  const key = canvasTexture(scene, `jslab_${w}x${h}_${color.toString(16)}_${alpha}`, tw, th, (ctx) => {
    ctx.translate(tw / 2, pad + h / 2);
    paintSlab(ctx, w, h, color, lip, alpha);
  });
  return { key, oy: (pad + h / 2) / th };
}

/** A round jelly bubble of radius r: see-through, lit from the top left. */
export function jellyBubble(scene, r, color, alpha = 0.55) {
  const s = r * 2 + 6;
  return canvasTexture(scene, `jbub_${r}_${color.toString(16)}_${alpha}`, s, s, (ctx) => {
    ctx.translate(s / 2, s / 2);
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    g.addColorStop(0, css(mix(color, 0xffffff, 0.45), alpha));
    g.addColorStop(0.7, css(color, alpha * 0.8));
    g.addColorStop(1, css(darker(color, 0.7), alpha));
    ctx.fillStyle = g;
    dot(ctx, 0, 0, r);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(0, 0, r - 0.8, 0, TAU);
    ctx.stroke();
    // a curved shine near the top, and a bubble
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = Math.max(2, r * 0.1);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.72, Math.PI * 1.12, Math.PI * 1.42);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    dot(ctx, r * 0.42, r * 0.38, Math.max(1.5, r * 0.08));
  });
}

/** The home screen's soft fade: the sky shows in the middle, darker toward top and bottom. */
export function skyFade(scene, color) {
  return canvasTexture(scene, `skyfade_${color.toString(16)}`, 4, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, css(color, 0.5));
    g.addColorStop(0.3, css(color, 0));
    g.addColorStop(0.55, css(color, 0));
    g.addColorStop(0.85, css(color, 0.55));
    g.addColorStop(1, css(color, 0.7));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
  });
}

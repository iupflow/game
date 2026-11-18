// Jelly UI. Everything that can be tapped moves like jelly: it wobbles and swells a little when
// the pointer comes over it, squashes flat while it is pressed and springs back with a bounce
// when it is let go; the main buttons breathe gently at rest. Buttons, cards and bubbles are
// drawn as slim panes of tinted glass, so the sky shows through them.
import { TEX_SCALE } from './art.js';

const TAU = Math.PI * 2;
const ch = (c, s) => (c >> s) & 255;
export function mix(c1, c2, t) {
  const m = (s) => Math.round(ch(c1, s) + (ch(c2, s) - ch(c1, s)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}
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

/**
 * A pane of tinted glass, w x h, centred on (0, 0): see-through, so the sky shows behind it, a
 * little stronger at the top, a faint sheen over its upper half and a fine bright edge. A strong
 * one (the main button of a screen) is a little more solid and has a soft halo of its colour.
 */
function paintGlass(ctx, w, h, color, strong, r, fill) {
  const tint = mix(color, 0xffffff, 0.12);
  if (strong) {
    // the halo: drawn as a blurred shadow, then cut away inside so only the outside glows
    ctx.save();
    ctx.shadowColor = css(tint, 0.65);
    ctx.shadowBlur = 18;
    roundRect(ctx, -w / 2, -h / 2, w, h, r);
    ctx.fillStyle = css(tint, 1);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    roundRect(ctx, -w / 2, -h / 2, w, h, r);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
  }
  const body = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  body.addColorStop(0, css(mix(tint, 0xffffff, 0.18), (strong ? 0.78 : 0.4) * fill));
  body.addColorStop(1, css(tint, (strong ? 0.56 : 0.2) * fill));
  roundRect(ctx, -w / 2, -h / 2, w, h, r);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.save();
  roundRect(ctx, -w / 2, -h / 2, w, h, r);
  ctx.clip();
  const sheen = ctx.createLinearGradient(0, -h / 2, 0, 0);
  sheen.addColorStop(0, 'rgba(255,255,255,0.17)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(-w / 2, -h / 2, w, h / 2);
  ctx.restore();
  const edge = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  edge.addColorStop(0, css(mix(tint, 0xffffff, 0.75), 0.9));
  edge.addColorStop(1, css(mix(tint, 0xffffff, 0.35), 0.3));
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = edge;
  roundRect(ctx, -w / 2 + 0.75, -h / 2 + 0.75, w - 1.5, h - 1.5, Math.max(0, r - 0.75));
  ctx.stroke();
}

/**
 * A button's (or card's) glass picture. strong: the main button of a screen; r: the corner
 * radius (a pill by default); fill: how solid the glass is. Returns { key, oy } (oy: the origin
 * that centres it).
 */
export function jellySlab(scene, w, h, color, { strong = false, r = h / 2, fill = 1 } = {}) {
  const pad = strong ? 22 : 3;
  const tw = w + pad * 2;
  const th = h + pad * 2;
  const key = canvasTexture(scene, `jglass_${w}x${h}_${color.toString(16)}_${strong ? 1 : 0}_${r}_${fill}`, tw, th, (ctx) => {
    ctx.translate(tw / 2, th / 2);
    paintGlass(ctx, w, h, color, strong, r, fill);
  });
  return { key, oy: 0.5 };
}

/** A round glass bubble of radius r: see-through, lit from the top left, with a fine edge. */
export function jellyBubble(scene, r, color, alpha = 0.3) {
  const s = r * 2 + 6;
  return canvasTexture(scene, `jbub2_${r}_${color.toString(16)}_${alpha}`, s, s, (ctx) => {
    ctx.translate(s / 2, s / 2);
    const tint = mix(color, 0xffffff, 0.15);
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    g.addColorStop(0, css(mix(tint, 0xffffff, 0.35), alpha));
    g.addColorStop(1, css(tint, alpha * 0.55));
    ctx.fillStyle = g;
    dot(ctx, 0, 0, r);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = css(mix(tint, 0xffffff, 0.7), 0.6);
    ctx.beginPath();
    ctx.arc(0, 0, r - 0.75, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = Math.max(1.5, r * 0.06);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.74, Math.PI * 1.15, Math.PI * 1.4);
    ctx.stroke();
  });
}

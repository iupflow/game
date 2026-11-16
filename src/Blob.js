import Phaser from 'phaser';
import { TEX_SCALE, defOf, colorsOf, accKey, faceKey, accIsCentered, shade, tint } from './art.js';

// A jelly: a rigid circle in the physics engine, drawn as a soft body.
// The outline is recomputed every frame: it flattens against neighbours and
// walls, bulges elsewhere, and wobbles on a spring after impacts.

const VISUAL = 1.05; // drawn slightly larger than the physics circle so jellies press together
const TAU = Math.PI * 2;
export const DEPTH = { accBack: 10, body: 20, face: 30, shine: 31, accFront: 32 };

const tables = new Map();
function table(K) {
  let t = tables.get(K);
  if (!t) {
    t = { cos: new Float32Array(K), sin: new Float32Array(K), cos2: new Float32Array(K), sin2: new Float32Array(K) };
    for (let i = 0; i < K; i++) {
      const a = (i / K) * TAU;
      t.cos[i] = Math.cos(a);
      t.sin[i] = Math.sin(a);
      t.cos2[i] = Math.cos(2 * a);
      t.sin2[i] = Math.sin(2 * a);
    }
    tables.set(K, t);
  }
  return t;
}

export class Blob {
  constructor(scene, kind, x, y) {
    this.scene = scene;
    this.kind = kind;
    this.def = defOf(kind);
    this.tier = typeof kind === 'number' ? kind : -1;
    this.r = this.def.r;
    this.colors = colorsOf(kind);
    this.x = x;
    this.y = y;
    this.rot = 0;
    this.prevAngle = 0;
    this.body = null;
    this.planes = [];

    // deformation spring (in "double angle" space) and pop-in scale spring
    this.qx = 0;
    this.qy = 0;
    this.qvx = 0;
    this.qvy = 0;
    this.pop = 0.35;
    this.pv = 0.1;

    this.K = Phaser.Math.Clamp(Math.round(this.r / 1.7), 28, 80);
    this.t = table(this.K);
    this.radii = new Float32Array(this.K).fill(this.r * VISUAL * this.pop);
    this.tmp = new Float32Array(this.K);
    this.tmp2 = new Float32Array(this.K);

    const now = scene.time.now;
    this.born = now;
    this.dangerMs = 0;
    this.merging = false;
    this.used = false;
    this.fresh = false;
    this.scared = false;
    this.happyUntil = 0;
    this.blinkAt = now + 1500 + Math.random() * 4000;
    this.blinkUntil = 0;
    this.expr = 'idle';

    this.face = scene.add.image(x, y, faceKey(kind, 'idle')).setDepth(DEPTH.face);
    this.shine = scene.add.image(x, y, 'shine').setDepth(DEPTH.shine).setAlpha(0.6).setRotation(-0.6);
    this.accs = this.def.acc.map((a, i) => ({
      a,
      centered: accIsCentered(a.name),
      img: scene.add.image(x, y, accKey(kind, i)).setDepth(a.front ? DEPTH.accFront : DEPTH.accBack),
    }));
    this.place();
  }

  get rv() {
    return this.r * VISUAL * this.pop;
  }

  addBody() {
    this.body = this.scene.matter.add.circle(this.x, this.y, this.r, {
      restitution: 0.12,
      friction: 0.3,
      frictionAir: 0.008,
      density: 0.0012,
    });
    this.body.blob = this;
    this.prevAngle = 0;
    return this.body;
  }

  /** Squash along the given direction; the spring then makes it wobble. */
  impulse(angle, amount) {
    this.qvx += amount * Math.cos(2 * angle);
    this.qvy += amount * Math.sin(2 * angle);
  }

  sync() {
    const b = this.body;
    if (!b) return;
    this.x = b.position.x;
    this.y = b.position.y;
    // the picture follows the physics rotation but slowly rights itself
    this.rot += b.angle - this.prevAngle;
    this.prevAngle = b.angle;
  }

  update(dtMs, now) {
    const dt = Math.min(dtMs, 34) / 16.667;

    // springs
    this.qvx += (-0.18 * this.qx - 0.15 * this.qvx) * dt;
    this.qvy += (-0.18 * this.qy - 0.15 * this.qvy) * dt;
    this.qx += this.qvx * dt;
    this.qy += this.qvy * dt;
    this.pv += ((1 - this.pop) * 0.2 - this.pv * 0.24) * dt;
    this.pop += this.pv * dt;
    this.rot = Phaser.Math.Angle.Wrap(this.rot);
    this.rot -= this.rot * Math.min(1, 0.035 * dt);

    let Qx = this.qx;
    let Qy = this.qy;
    if (this.body) {
      // stretch along the direction of travel
      const v = this.body.velocity;
      const speed = Math.hypot(v.x, v.y);
      if (speed > 1) {
        const s = Math.min(speed * 0.009, 0.17);
        const a = Math.atan2(v.y, v.x);
        Qx -= s * Math.cos(2 * a);
        Qy -= s * Math.sin(2 * a);
      }
    }
    const qm = Math.hypot(Qx, Qy);
    if (qm > 0.3) {
      Qx *= 0.3 / qm;
      Qy *= 0.3 / qm;
    }

    const { K, t, tmp, tmp2, planes } = this;
    const rv = this.rv;
    for (let i = 0; i < K; i++) tmp[i] = rv;

    // flatten against neighbours and walls
    for (let p = 0; p < planes.length; p += 3) {
      const pc = planes[p];
      const ps = planes[p + 1];
      const d = Math.max(planes[p + 2], rv * 0.5);
      for (let i = 0; i < K; i++) {
        const c = t.cos[i] * pc + t.sin[i] * ps;
        if (c > 0.08) {
          const lim = d / c;
          if (lim < tmp[i]) tmp[i] = lim;
        }
      }
    }

    // what was squeezed in bulges out elsewhere
    let lost = 0;
    for (let i = 0; i < K; i++) lost += rv - tmp[i];
    lost /= K * rv;
    if (lost > 0.0005) {
      const bulged = rv * (1 + lost * 0.9);
      for (let i = 0; i < K; i++) if (tmp[i] >= rv - 0.01) tmp[i] = bulged;
    }

    for (let i = 0; i < K; i++) tmp[i] *= 1 - (Qx * t.cos2[i] + Qy * t.sin2[i]);

    // round off the corners
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < K; i++) {
        tmp2[i] = 0.25 * tmp[(i + K - 1) % K] + 0.5 * tmp[i] + 0.25 * tmp[(i + 1) % K];
      }
      tmp.set(tmp2);
    }

    const k = Math.min(1, 0.55 * dt);
    for (let i = 0; i < K; i++) this.radii[i] += (tmp[i] - this.radii[i]) * k;

    // expression
    if (now > this.blinkAt) {
      this.blinkUntil = now + 130;
      this.blinkAt = now + 2000 + Math.random() * 4500;
    }
    let expr = 'idle';
    if (now < this.happyUntil) expr = 'happy';
    else if (this.scared) expr = 'scared';
    else if (now < this.blinkUntil) expr = 'blink';
    if (expr !== this.expr) {
      this.expr = expr;
      this.face.setTexture(faceKey(this.kind, expr));
    }

    this.place();
  }

  radiusAt(angle) {
    const K = this.K;
    const f = ((((angle % TAU) + TAU) % TAU) / TAU) * K;
    const i0 = Math.floor(f) % K;
    const frac = f - Math.floor(f);
    return this.radii[i0] * (1 - frac) + this.radii[(i0 + 1) % K] * frac;
  }

  place() {
    const s = this.pop / TEX_SCALE;
    const rv = this.rv;
    this.face.setPosition(this.x, this.y).setRotation(this.rot).setScale(s);
    this.shine.setPosition(this.x - 0.36 * rv, this.y - 0.46 * rv).setScale((0.95 * rv) / (64 * TEX_SCALE));
    for (const { a, img, centered } of this.accs) {
      if (centered) {
        img.setPosition(this.x, this.y).setRotation(this.rot).setScale(s);
        continue;
      }
      const w = (a.angle * Math.PI) / 180 + this.rot;
      const rr = this.radiusAt(w) - a.inset * rv;
      img.setPosition(this.x + Math.cos(w) * rr, this.y + Math.sin(w) * rr).setRotation(w + Math.PI / 2).setScale(s);
    }
  }

  draw(g, now) {
    let c = this.colors;
    if (this.kind === 'star') {
      const base = Phaser.Display.Color.HSVToRGB((now / 1400) % 1, 0.55, 1).color;
      c = { base, rim: shade(base, 0.72), light: tint(base, 0.3) };
    }
    const rw = Math.max(2.5, this.r * 0.07);
    this.fan(g, c.rim, this.x, this.y, 1, 0);
    this.fan(g, c.base, this.x, this.y, 1, -rw);
    this.fan(g, c.light, this.x - 0.1 * this.rv, this.y - 0.12 * this.rv, 0.6, 0);
  }

  fan(g, color, cx, cy, scale, offset) {
    const { K, t, radii } = this;
    g.fillStyle(color, 1);
    let rr = radii[K - 1] * scale + offset;
    let px = cx + t.cos[K - 1] * rr;
    let py = cy + t.sin[K - 1] * rr;
    for (let i = 0; i < K; i++) {
      rr = radii[i] * scale + offset;
      const nx = cx + t.cos[i] * rr;
      const ny = cy + t.sin[i] * rr;
      g.fillTriangle(cx, cy, px, py, nx, ny);
      px = nx;
      py = ny;
    }
  }

  destroy() {
    this.face.destroy();
    this.shine.destroy();
    for (const { img } of this.accs) img.destroy();
    if (this.body) {
      this.scene.matter.world.remove(this.body);
      this.body.blob = null;
      this.body = null;
    }
  }
}

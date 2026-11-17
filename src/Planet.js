import Phaser from 'phaser';
import { TEX_SCALE, defOf, surfaceKey, partKey, partInfo } from './art.js';

// A planet is a soft body in two senses:
//  - physics: a hard core (CORE of the radius) wrapped in a springy skin, so planets
//    really sink into each other on impact and bounce back (the skin forces are
//    applied by the scene);
//  - picture: the outline flattens against neighbours, and the surface texture is
//    drawn on a mesh whose inside lags behind and sloshes, so the whole body wobbles.

export const CORE = 0.8;
const TAU = Math.PI * 2;
let nextId = 1;

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

export class Planet {
  constructor(scene, kind, x, y) {
    this.scene = scene;
    this.id = nextId++;
    this.kind = kind;
    this.def = defOf(kind);
    this.tier = typeof kind === 'number' ? kind : -1;
    this.r = this.def.r;
    this.x = x;
    this.y = y;
    this.rot = Math.random() * TAU;
    this.prevAngle = 0;
    this.tailAngle = 0;
    this.alpha = 1;
    this.body = null;
    this.planes = [];

    // springs: outline squash (in "double angle" space), size pop, inner slosh
    this.qx = 0;
    this.qy = 0;
    this.qvx = 0;
    this.qvy = 0;
    this.pop = 0.35;
    this.pv = 0.1;
    this.popTarget = 1;
    this.sx = 0;
    this.sy = 0;
    this.svx = 0;
    this.svy = 0;
    this.lastVx = 0;
    this.lastVy = 0;

    this.K = Phaser.Math.Clamp(Math.round(this.r / 1.5), 24, 64);
    this.t = table(this.K);
    this.radii = new Float32Array(this.K).fill(this.r * this.pop);
    this.inner = new Float32Array(this.K).fill(this.r * this.pop);
    this.tmp = new Float32Array(this.K);
    this.tmp2 = new Float32Array(this.K);

    this.born = scene.time.now;
    this.dangerMs = 0;
    this.merging = false;
    this.used = false;
    this.fresh = false;

    this.frame = scene.textures.getFrame(surfaceKey(kind));
    this.lightFrame = this.def.light ? scene.textures.getFrame('light_' + this.def.light) : null;
    this.parts = this.def.parts.map(([name, front], i) => {
      const info = partInfo(name);
      const img = scene.add.image(0, 0, partKey(kind, i));
      if (info.blend === 'add') img.setBlendMode(Phaser.BlendModes.ADD);
      (front ? scene.frontLayer : scene.backLayer).add(img);
      return { img, spin: info.spin };
    });
    this.place(scene.time.now);
  }

  get rv() {
    return this.r * this.pop;
  }

  addBody() {
    this.body = this.scene.matter.add.circle(this.x, this.y, this.r * CORE, {
      restitution: 0.25,
      friction: 0.25,
      frictionAir: 0.03,
      density: 0.001,
    });
    this.body.planet = this;
    this.prevAngle = 0;
    return this.body;
  }

  removeBody() {
    if (!this.body) return;
    this.scene.matter.world.remove(this.body);
    this.body.planet = null;
    this.body = null;
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
    this.rot += b.angle - this.prevAngle;
    this.prevAngle = b.angle;
  }

  update(dtMs, now) {
    const dt = Math.min(dtMs, 34) / 16.667;

    this.qvx += (-0.17 * this.qx - 0.13 * this.qvx) * dt;
    this.qvy += (-0.17 * this.qy - 0.13 * this.qvy) * dt;
    this.qx += this.qvx * dt;
    this.qy += this.qvy * dt;
    this.pv += ((this.popTarget - this.pop) * 0.2 - this.pv * 0.22) * dt;
    this.pop = Math.max(0.02, this.pop + this.pv * dt);

    let Qx = this.qx;
    let Qy = this.qy;
    let vx = 0;
    let vy = 0;
    if (this.body) {
      vx = this.body.velocity.x;
      vy = this.body.velocity.y;
      const speed = Math.hypot(vx, vy);
      if (speed > 1) {
        // stretch along the direction of travel
        const s = Math.min(speed * 0.011, 0.2);
        const a = Math.atan2(vy, vx);
        Qx -= s * Math.cos(2 * a);
        Qy -= s * Math.sin(2 * a);
        this.tailAngle = a;
      }
    }
    const qm = Math.hypot(Qx, Qy);
    if (qm > 0.34) {
      Qx *= 0.34 / qm;
      Qy *= 0.34 / qm;
    }

    // the inside lags behind sudden changes of speed, then sloshes back
    const ax = vx - this.lastVx;
    const ay = vy - this.lastVy;
    this.lastVx = vx;
    this.lastVy = vy;
    this.svx += (-0.15 * this.sx - 0.12 * this.svx) * dt - ax * 0.55;
    this.svy += (-0.15 * this.sy - 0.12 * this.svy) * dt - ay * 0.55;
    this.sx += this.svx * dt;
    this.sy += this.svy * dt;
    const rv = this.rv;
    const sm = Math.hypot(this.sx, this.sy);
    const smax = rv * 0.3;
    if (sm > smax) {
      this.sx *= smax / sm;
      this.sy *= smax / sm;
    }

    const { K, t, tmp, tmp2, planes } = this;
    for (let i = 0; i < K; i++) tmp[i] = rv;

    // flatten against neighbours
    for (let p = 0; p < planes.length; p += 3) {
      const pc = planes[p];
      const ps = planes[p + 1];
      const d = Math.max(planes[p + 2], rv * 0.45);
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
      const bulged = rv * (1 + Math.min(lost, 0.2) * 1.1);
      for (let i = 0; i < K; i++) if (tmp[i] >= rv - 0.01) tmp[i] = bulged;
    }

    // squash into an ellipse of the same area (always convex, however hard the hit)
    const q = Math.hypot(Qx, Qy);
    if (q > 0.002) {
      const squash = 1 - q;
      const s2 = squash * squash;
      for (let i = 0; i < K; i++) {
        const along = 0.5 + (0.5 * (Qx * t.cos2[i] + Qy * t.sin2[i])) / q; // cos^2 of the angle to the squash axis
        tmp[i] /= Math.sqrt(along / s2 + (1 - along) * s2);
      }
    }

    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < K; i++) {
        tmp2[i] = 0.25 * tmp[(i + K - 1) % K] + 0.5 * tmp[i] + 0.25 * tmp[(i + 1) % K];
      }
      tmp.set(tmp2);
    }

    const k = Math.min(1, 0.6 * dt);
    const ki = Math.min(1, 0.22 * dt);
    for (let i = 0; i < K; i++) {
      this.radii[i] += (tmp[i] - this.radii[i]) * k;
      this.inner[i] += (this.radii[i] - this.inner[i]) * ki;
    }

    this.place(now);
  }

  place(now) {
    const s = this.pop / TEX_SCALE;
    const lx = this.x - this.scene.CX;
    const ly = this.y - this.scene.CY;
    for (const { img, spin } of this.parts) {
      img.setPosition(lx, ly).setScale(s).setAlpha(this.alpha);
      if (spin === 'slow') img.setRotation(now * 0.0004);
      else if (spin === 'velocity') img.setRotation(this.tailAngle);
      else img.setRotation(this.rot);
    }
  }

  destroy() {
    for (const { img } of this.parts) img.destroy();
    this.removeBody();
  }
}

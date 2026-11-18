import Phaser from 'phaser';
import { TEX_SCALE, FACE_R, defOf, surfaceKey, lightKey, partKey, partInfo, hasKindTextures, makeKindTextures, partsOf, hasLight, wearsSkin } from './art.js';

// A planet is a soft body in two senses:
//  - physics: a hard core (CORE of the radius) wrapped in a springy skin, so planets
//    really sink into each other on impact and bounce back (the skin forces are
//    applied by the scene);
//  - picture: the outline flattens against neighbours, and the surface texture is
//    drawn on a mesh whose inside lags behind and sloshes, so the whole body wobbles.

export const CORE = 0.8;
// drawn slightly larger than the physical skin, so touching planets always press into each other a little
const VISUAL = 1.04;
export const DRAG = 0.022; // air drag once a planet has landed
// The squash spring peaks at about 1.93x the velocity it is kicked with.
export const SQUASH_GAIN = 1 / 1.93;
const MAX_Q = 0.46;
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
    // big bodies are textured in the background after start-up; make them now if they are needed sooner
    if (!hasKindTextures(scene, kind)) makeKindTextures(scene, kind);
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
    this.radii = new Float32Array(this.K).fill(this.r * VISUAL * this.pop);
    this.inner = new Float32Array(this.K).fill(this.r * VISUAL * this.pop);
    this.tmp = new Float32Array(this.K);
    this.tmp2 = new Float32Array(this.K);

    this.born = scene.time.now;
    this.dangerMs = 0;
    this.merging = false;
    this.used = false;
    this.flying = false;
    this.captured = 0;

    this.frame = scene.textures.getFrame(surfaceKey(kind));
    this.lightFrame = hasLight(kind) ? scene.textures.getFrame(lightKey(kind)) : null;
    this.tint = 0xffffff; // multiplies the surface colour, e.g. when a planet heats up
    // how the skin in use moves: squish (wobble strength), upright (the picture never turns),
    // hop (a little bounce now and then at rest), flicker (dims for a moment, like a neon tube)
    const look = (wearsSkin(kind) && scene.skin) || {};
    this.squish = look.squish || 1;
    this.upright = !!look.upright;
    this.hopAt = look.hop ? scene.time.now + 1500 + Math.random() * 4000 : Infinity;
    this.flickerAt = look.flicker ? scene.time.now + 2000 + Math.random() * 8000 : Infinity;
    this.dim = false;
    this.parts = partsOf(kind).map(([name, front], i) => {
      const info = partInfo(name);
      const img = scene.add.image(0, 0, partKey(kind, i));
      if (info.blend === 'add') img.setBlendMode(Phaser.BlendModes.ADD);
      (front ? scene.frontLayer : scene.backLayer).add(img);
      return { img, spin: info.spin };
    });
    this.overlays = []; // pictures drawn over the planet: a face
    this.face = null;
    this.blinkAt = scene.time.now + 1500 + Math.random() * 4000;
    this.place(scene.time.now);
  }

  /**
   * An extra picture over the planet (drawn at radius FACE_R, scaled to it). upright: stays level on
   * screen while the field turns; spin: turns on its own, in radians per millisecond.
   */
  addOverlay(key, { add = false, upright = true, spin = 0 } = {}) {
    const img = this.scene.add.image(0, 0, key);
    if (add) img.setBlendMode(Phaser.BlendModes.ADD);
    this.scene.frontLayer.add(img);
    const o = { img, key, upright, spin };
    this.overlays.push(o);
    this.place(this.scene.time.now);
    return o;
  }

  /** A cute face that blinks now and then and looks surprised when squashed (the kawaii skin). */
  addFace() {
    this.face = this.addOverlay('face_happy');
  }

  get rv() {
    return this.r * VISUAL * this.pop;
  }

  addBody() {
    this.body = this.scene.matter.add.circle(this.x, this.y, this.r * CORE, {
      restitution: 0.12,
      friction: 0.25,
      frictionAir: DRAG,
      density: 0.001,
    });
    this.body.planet = this;
    // how hard this planet presses into others: heavier planets dent lighter ones more
    this.w = Math.pow(this.body.mass, 0.6);
    this.prevAngle = 0;
    return this.body;
  }

  removeBody() {
    if (!this.body) return;
    this.scene.matter.world.remove(this.body);
    this.body.planet = null;
    this.body = null;
  }

  /** Squash so that the wobble peaks at about `peak` (a fraction of the radius) along `angle`. */
  squash(angle, peak) {
    this.impulse(angle, peak * SQUASH_GAIN);
  }

  /** Kick the squash spring along the given direction; it then wobbles. */
  impulse(angle, amount) {
    amount *= this.squish;
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

    if (now > this.hopAt) {
      // a little bounce at rest: it swells and squashes, then settles
      this.hopAt = now + 2500 + Math.random() * 4500;
      if (this.body && !this.flying) {
        this.pv += 0.04;
        this.impulse(Math.PI / 2, 0.05);
      }
    }
    if (now > this.flickerAt) {
      this.dim = true;
      if (now > this.flickerAt + 70 + Math.random() * 60) {
        this.dim = false;
        this.flickerAt = now + (Math.random() < 0.3 ? 120 : 3000 + Math.random() * 9000);
      }
    }

    this.qvx += (-0.17 * this.qx - 0.13 * this.qvx) * dt;
    this.qvy += (-0.17 * this.qy - 0.13 * this.qvy) * dt;
    this.qx += this.qvx * dt;
    this.qy += this.qvy * dt;
    const qs = Math.hypot(this.qx, this.qy);
    if (qs > MAX_Q) {
      // fully squashed: stop there rather than staying pinned at the limit
      this.qx *= MAX_Q / qs;
      this.qy *= MAX_Q / qs;
      this.qvx *= 0.5;
      this.qvy *= 0.5;
    }
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
    if (qm > 0.42) {
      Qx *= 0.42 / qm;
      Qy *= 0.42 / qm;
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
    const s = (VISUAL * this.pop) / TEX_SCALE;
    const lx = this.x - this.scene.CX;
    const ly = this.y - this.scene.CY;
    for (const { img, spin } of this.parts) {
      img.setPosition(lx, ly).setScale(s).setAlpha(this.alpha);
      if (spin === 'slow') img.setRotation(now * 0.0004);
      else if (spin === 'fast') img.setRotation(now * 0.0035); // a pulsar's sweeping beams
      else if (spin === 'velocity') img.setRotation(this.tailAngle);
      else img.setRotation(this.rot);
    }
    if (this.overlays.length) {
      const so = this.rv / FACE_R / TEX_SCALE;
      if (this.face) {
        // the face follows the jelly inside, blinks, and is startled by a hard squash
        let mood = 'happy';
        if (Math.hypot(this.qx, this.qy) > 0.15) mood = 'wow';
        else if (now > this.blinkAt) {
          mood = 'blink';
          if (now > this.blinkAt + 150) this.blinkAt = now + 2000 + Math.random() * 4500;
        }
        const key = `face_${mood}`;
        if (this.face.key !== key) {
          this.face.key = key;
          this.face.img.setTexture(key);
        }
      }
      for (const o of this.overlays) {
        const wob = o === this.face ? 1 : 0;
        o.img.setPosition(lx + this.sx * wob, ly + this.sy * wob).setScale(so).setAlpha(this.alpha);
        if (o.spin) o.img.setRotation(now * o.spin);
        else if (o.upright) o.img.setRotation(-this.scene.worldRot);
      }
    }
  }

  destroy() {
    for (const { img } of this.parts) img.destroy();
    for (const { img } of this.overlays) img.destroy();
    this.removeBody();
  }
}

import Phaser from 'phaser';
import { PAD } from './art.js';

// Draws every planet as a textured mesh: a centre point, an inner ring and the
// outline. The texture coordinates stay fixed while the vertices move, so the
// picture squashes and stretches with the body.

const INNER = 0.55; // inner ring, as a fraction of the radius
const EDGE = 1.5; // the mesh reaches slightly past the outline so the texture's soft edge shows
const MAX_K = 64;

const ox = new Float32Array(MAX_K);
const oy = new Float32Array(MAX_K);
const ou = new Float32Array(MAX_K);
const ov = new Float32Array(MAX_K);
const ix = new Float32Array(MAX_K);
const iy = new Float32Array(MAX_K);
const iu = new Float32Array(MAX_K);
const iv = new Float32Array(MAX_K);

const getTint = Phaser.Renderer.WebGL.Utils.getTintAppendFloatAlphaAndSwap; // takes 0xRRGGBB
const DIM = 0x6a6a6a; // a neon planet flickering

export class PlanetBatch extends Phaser.GameObjects.Image {
  constructor(scene, x, y) {
    super(scene, x, y, 'dot');
    this.planets = [];
    scene.add.existing(this);
  }

  renderWebGL(renderer, src, camera, parentMatrix) {
    camera.addToRenderList(src);
    const pipeline = renderer.pipelines.set(src.pipeline, src);
    const m = Phaser.GameObjects.GetCalcMatrix(src, camera, parentMatrix).calc;
    renderer.pipelines.preBatch(src);
    for (const p of src.planets) {
      const alpha = camera.alpha * src.alpha * p.alpha;
      // a pixel planet's picture stays level with the screen, so its pixels stay square
      src.drawMesh(pipeline, m, p, p.frame, p.upright ? -src.rotation : p.rot, p.r, p.r + PAD, getTint(p.dim ? DIM : p.tint, alpha));
      // lighting stays put on screen while the planet and the field turn underneath
      if (p.lightFrame) src.drawMesh(pipeline, m, p, p.lightFrame, -src.rotation, p.r, p.r + PAD, getTint(0xffffff, alpha));
    }
    renderer.pipelines.postBatch(src);
  }

  renderCanvas() {
    // WebGL only
  }

  drawMesh(pipeline, m, p, frame, uvRot, texR, texHalf, tint) {
    const K = p.K;
    const t = p.t;
    const cu = Math.cos(uvRot);
    const su = Math.sin(uvRot);
    const uo = (0.5 * (texR + (EDGE * texR) / p.r)) / texHalf;
    const ui = (0.5 * INNER * texR) / texHalf;
    const du = frame.u1 - frame.u0;
    const dv = frame.v1 - frame.v0;
    const px = p.x - this.x;
    const py = p.y - this.y;
    const sx = px + p.sx;
    const sy = py + p.sy;

    for (let i = 0; i < K; i++) {
      const c = t.cos[i];
      const s = t.sin[i];
      const ro = p.radii[i] + EDGE * p.pop;
      const ri = p.inner[i] * INNER;
      let x = px + c * ro;
      let y = py + s * ro;
      ox[i] = x * m.a + y * m.c + m.e;
      oy[i] = x * m.b + y * m.d + m.f;
      x = sx + c * ri;
      y = sy + s * ri;
      ix[i] = x * m.a + y * m.c + m.e;
      iy[i] = x * m.b + y * m.d + m.f;
      // direction in the texture's own frame
      const tc = c * cu + s * su;
      const ts = s * cu - c * su;
      ou[i] = frame.u0 + du * (0.5 + uo * tc);
      ov[i] = frame.v0 + dv * (0.5 + uo * ts);
      iu[i] = frame.u0 + du * (0.5 + ui * tc);
      iv[i] = frame.v0 + dv * (0.5 + ui * ts);
    }
    const cxw = px + p.sx * 1.25;
    const cyw = py + p.sy * 1.25;
    const cx = cxw * m.a + cyw * m.c + m.e;
    const cy = cxw * m.b + cyw * m.d + m.f;
    const cuv = frame.u0 + du * 0.5;
    const cvv = frame.v0 + dv * 0.5;

    const count = K * 9;
    if (pipeline.shouldFlush(count)) pipeline.flush();
    const unit = pipeline.setTexture2D(frame.glTexture);
    const F = pipeline.vertexViewF32;
    const U = pipeline.vertexViewU32;
    let o = pipeline.vertexCount * pipeline.currentShader.vertexComponentCount - 1;
    const vert = (x, y, u, v) => {
      F[++o] = x;
      F[++o] = y;
      F[++o] = u;
      F[++o] = v;
      F[++o] = unit;
      F[++o] = 0;
      U[++o] = tint;
    };
    for (let i = 0; i < K; i++) {
      const j = i + 1 === K ? 0 : i + 1;
      vert(cx, cy, cuv, cvv);
      vert(ix[i], iy[i], iu[i], iv[i]);
      vert(ix[j], iy[j], iu[j], iv[j]);

      vert(ix[i], iy[i], iu[i], iv[i]);
      vert(ox[i], oy[i], ou[i], ov[i]);
      vert(ox[j], oy[j], ou[j], ov[j]);

      vert(ix[i], iy[i], iu[i], iv[i]);
      vert(ox[j], oy[j], ou[j], ov[j]);
      vert(ix[j], iy[j], iu[j], iv[j]);
    }
    pipeline.vertexCount += count;
    pipeline.currentBatch.count = pipeline.vertexCount - pipeline.currentBatch.start;
  }
}

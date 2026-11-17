import Phaser from 'phaser';
import { GameScene, W, H } from './GameScene.js';
import { TEX_SCALE, TIERS } from './art.js';
import { setupNative } from './native.js';

// The world is W x H units; the canvas is rendered at up to 2x so it stays sharp on phones.
const game = new Phaser.Game({
  type: Phaser.WEBGL, // planets are drawn as deforming meshes, which needs WebGL
  parent: 'game',
  backgroundColor: '#05030f',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: W * TEX_SCALE,
    height: H * TEX_SCALE,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 0 }, // gravity is radial and applied by the scene
      positionIterations: 10,
      velocityIterations: 8,
      autoUpdate: false, // stepped at a fixed rate from the scene
    },
  },
  scene: [GameScene],
});

setupNative();

// hooks for automated tests
window.__game = game;
window.__tiers = TIERS;

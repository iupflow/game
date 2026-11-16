import Phaser from 'phaser';
import { GameScene, W, H } from './GameScene.js';
import { TEX_SCALE, TIERS } from './art.js';

// The world is W x H units; the canvas is rendered at up to 2x so it stays sharp on phones.
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#12082b',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: W * TEX_SCALE,
    height: H * TEX_SCALE,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { y: 1.4 },
      positionIterations: 10,
      velocityIterations: 8,
      autoUpdate: false, // stepped at a fixed rate from the scene
    },
  },
  scene: [GameScene],
});

// hooks for automated tests
window.__game = game;
window.__tiers = TIERS;

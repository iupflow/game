import Phaser from 'phaser';
import { GameScene, W, H } from './GameScene.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#12082b',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: W,
    height: H,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { y: 1.4 },
      positionIterations: 10,
      velocityIterations: 8,
    },
  },
  scene: [GameScene],
});

window.__game = game;

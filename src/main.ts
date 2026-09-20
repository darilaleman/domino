import Phaser from 'phaser';
import { BootScene } from './game/scenes/BootScene';
import { MenuScene } from './game/scenes/MenuScene';
import { MatchScene } from './game/scenes/MatchScene';
import { GameOverScene } from './game/scenes/GameOverScene';
import { WebTestPlatform } from './cubaplay/WebTestPlatform';

export const platform = new WebTestPlatform();

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO, parent: 'app', width: window.innerWidth, height: window.innerHeight,
    backgroundColor: '#0d4a28',
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [BootScene, MenuScene, MatchScene, GameOverScene]
};

new Phaser.Game(config);
platform.initialize();
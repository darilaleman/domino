import { Scene } from 'phaser';
export class BootScene extends Scene {
    constructor() { super('BootScene'); }
    preload() {
        this.load.image('menu-bg-landscape', 'assets/images/menu-bg-landscape.png');
        this.load.image('menu-bg-portrait', 'assets/images/menu-bg-portrait.png');
        this.load.image('tile-back-portrait', 'assets/images/tile-back-portrait.png');
        this.load.image('tile-back-landscape', 'assets/images/tile-back-landscape.png');
        this.load.image('table-bg-landscape', 'assets/images/table-bg-landscape.png');
        this.load.image('table-bg-portrait',  'assets/images/table-bg-portrait.png');
    }
    create() { this.scene.start('MenuScene'); }
}
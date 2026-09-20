import { Scene } from 'phaser';
export class BootScene extends Scene {
    constructor() { super('BootScene'); }
    preload() {
        // AquÃ­ cargarÃ­as la imagen de la mesa de madera
        // this.load.image('table', 'assets/images/table.png');
    }
    create() { this.scene.start('MenuScene'); }
}
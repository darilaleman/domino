import { Scene } from 'phaser';
export class GameOverScene extends Scene {
    constructor() { super('GameOverScene'); }
    create(data: {score: number}) {
        const {width, height} = this.cameras.main;
        this.add.text(width/2, height/3, 'FIN DE LA PARTIDA', {fontSize:'32px', color:'#f00'}).setOrigin(0.5);
        const btn = this.add.text(width/2, height*0.7, 'VOLVER AL MENÚ', {fontSize:'24px', color:'#0f0', backgroundColor:'#000', padding:{x:20,y:10}}).setOrigin(0.5).setInteractive();
        btn.on('pointerdown', () => this.scene.start('MenuScene'));
    }
}
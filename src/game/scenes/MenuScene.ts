import { Scene } from 'phaser';
export class MenuScene extends Scene {
    constructor() { super('MenuScene'); }
    create() {
        const {width, height} = this.cameras.main;
        this.add.text(width/2, height/3, 'DOMINÃ“ CUBAPLAY', {fontSize:'32px', color:'#fff', fontStyle:'bold'}).setOrigin(0.5);
        const btn = this.add.text(width/2, height/2, 'JUGAR VS BOTS', {fontSize:'24px', color:'#0f0', backgroundColor:'#000', padding:{x:20,y:10}}).setOrigin(0.5).setInteractive();
        btn.on('pointerdown', () => this.scene.start('MatchScene'));
    }
}
import Phaser from 'phaser';

export const TILE_W = 40;
export const TILE_H = 80;

export class Tile {
    public value1: number;
    public value2: number;
    public sprite!: Phaser.GameObjects.Container;
    public isDouble: boolean;
    private isFaceDown: boolean = false;

    private pipsContainer?: Phaser.GameObjects.Container;
    private faceUpVisuals?: Phaser.GameObjects.Graphics;

    constructor(v1: number, v2: number) {
        this.value1 = v1;
        this.value2 = v2;
        this.isDouble = v1 === v2;
    }

    createSprite(scene: Phaser.Scene, x: number, y: number, rotation: number = 0) {
        const container = scene.add.container(x, y);

        const shadow = scene.add.rectangle(2, 2, TILE_W, TILE_H, 0x000000, 0.4).setOrigin(0.5);
        const body = scene.add.rectangle(0, 0, TILE_W, TILE_H, 0xfdfdfd).setOrigin(0.5).setStrokeStyle(1, 0x999999);

        container.add([shadow, body]);
        container.setRotation(rotation);
        container.setSize(TILE_W, TILE_H);
        container.setInteractive(
            new Phaser.Geom.Rectangle(-TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H),
            Phaser.Geom.Rectangle.Contains
        );

        this.drawPips(scene, container);

        this.sprite = container;
        return container;
    }

    private drawPips(scene: Phaser.Scene, container: Phaser.GameObjects.Container) {
        this.pipsContainer = scene.add.container(0, 0);

        const line = scene.add.rectangle(0, 0, TILE_W - 6, 2, 0xdddddd).setOrigin(0.5);
        this.pipsContainer.add(line);

        const drawDot = (val: number, offsetX: number, offsetY: number) => {
            if (val === 0) return;
            const positions: Record<number, [number, number][]> = {
                1: [[0, 0]],
                2: [[-10, -10], [10, 10]],
                3: [[-10, -10], [0, 0], [10, 10]],
                4: [[-10, -10], [10, -10], [-10, 10], [10, 10]],
                5: [[-10, -10], [10, -10], [0, 0], [-10, 10], [10, 10]],
                6: [[-10, -10], [10, -10], [-10, 0], [10, 0], [-10, 10], [10, 10]]
            };
            const dots = positions[val] || [];
            dots.forEach(([px, py]) => {
                const dot = scene.add.circle(px + offsetX, py + offsetY, 3, 0x111111);
                this.pipsContainer!.add(dot);
            });
        };

        drawDot(this.value1, 0, -20);
        drawDot(this.value2, 0, 20);

        container.add(this.pipsContainer);
    }

    setFaceDown(isDown: boolean) {
        this.isFaceDown = isDown;
        if (this.pipsContainer) {
            this.pipsContainer.setVisible(!isDown);
        }
    }
}
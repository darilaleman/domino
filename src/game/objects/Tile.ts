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
    private backImage?: Phaser.GameObjects.Image;

    constructor(v1: number, v2: number) {
        this.value1 = v1;
        this.value2 = v2;
        this.isDouble = v1 === v2;
    }

    createSprite(scene: Phaser.Scene, x: number, y: number, rotation: number = 0) {
        const container = scene.add.container(x, y);

        const shadow = scene.add.rectangle(2, 2, TILE_W, TILE_H, 0x000000, 0.4).setOrigin(0.5);
        const body   = scene.add.rectangle(0, 0, TILE_W, TILE_H, 0xfdfdfd).setOrigin(0.5)
                             .setStrokeStyle(1, 0x999999);
        container.add([shadow, body]);

        // Dorso (bandera) — detrás de los pips
        this.backImage = this.createBackImage(scene, rotation);
        if (this.backImage) container.add(this.backImage);

        container.setRotation(rotation);
        container.setSize(TILE_W, TILE_H);
        container.setInteractive(
            new Phaser.Geom.Rectangle(-TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H),
            Phaser.Geom.Rectangle.Contains
        );

        this.drawPips(scene, container);

        this.sprite = container;
        this.applyFaceState();
        return container;
    }

    /**
     * Elige la imagen según la orientación del contenedor y la contra-rota para
     * que la bandera siempre se vea "derecha" en pantalla (no girada 90°).
     * El tamaño se fija con setDisplaySize para adaptarse a la ficha
     * independientemente del dispositivo o el DPI.
     */
    private createBackImage(
        scene: Phaser.Scene, rotation: number
    ): Phaser.GameObjects.Image | undefined {
        const isHorizontal = Math.abs(Math.sin(rotation)) > 0.5;

        // Elegimos el key específico, con fallback a la otra orientación
        // y a un posible 'tile-back' genérico.
        const candidates = isHorizontal
            ? ['tile-back-landscape', 'tile-back-portrait', 'tile-back']
            : ['tile-back-portrait',  'tile-back-landscape', 'tile-back'];

        const key = candidates.find(k => scene.textures.exists(k));
        if (!key) return undefined;

        const img = scene.add.image(0, 0, key);
        img.setRotation(-rotation);   // contra-rotación → siempre "derecha"

        // Tamaño en espacio local del hijo. Tras la contra-rotación, la imagen
        // debe cubrir la ficha (TILE_W × TILE_H en pantalla). Como el hijo está
        // rotado -rotation dentro de un contenedor rotado +rotation, en su
        // espacio local el tamaño correcto es el "inverso" del de pantalla.
        if (isHorizontal) img.setDisplaySize(TILE_H, TILE_W);
        else              img.setDisplaySize(TILE_W, TILE_H);

        return img;
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
            (positions[val] || []).forEach(([px, py]) => {
                const dot = scene.add.circle(px + offsetX, py + offsetY, 3, 0x111111);
                this.pipsContainer!.add(dot);
            });
        };
        drawDot(this.value1, 0, -20);
        drawDot(this.value2, 0,  20);

        container.add(this.pipsContainer);
    }

    private applyFaceState() {
        if (this.pipsContainer) this.pipsContainer.setVisible(!this.isFaceDown);
        if (this.backImage)     this.backImage.setVisible(this.isFaceDown);
    }

    setFaceDown(isDown: boolean) {
        this.isFaceDown = isDown;
        this.applyFaceState();
    }
}
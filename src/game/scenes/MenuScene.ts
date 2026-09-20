import { Scene } from 'phaser';

export class MenuScene extends Scene {
    private bg?: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
    private btn!: Phaser.GameObjects.Text;

    constructor() { super('MenuScene'); }

    create() {
        const { width, height } = this.cameras.main;

        // --- Fondo (contiene ya el título "Pulso Dominó" en la imagen) ---
        this.bg = this.createBackground(width, height);

        // --- Botón ---
        this.btn = this.add.text(0, 0, 'JUGAR', {
    fontSize: '44px',
    color: '#00ff00',
    fontStyle: 'bold',
    align: 'center',
    padding: { x: 30, y: 15 },
    stroke: '#000000',
    strokeThickness: 6,
    shadow: {
        offsetX: 0,
        offsetY: 0,
        color: '#000000',
        blur: 12,
        fill: true
    }
}).setOrigin(0.5).setDepth(10).setInteractive({ useHandCursor: true });

        this.tweens.add({
            targets: this.btn,
            scale: { from: 1, to: 1.18 },
            duration: 700,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        this.btn.on('pointerdown', () => this.scene.start('MatchScene'));

        // --- Posicionar y ajustar tamaño ---
        this.layoutUI(width, height);

        // --- Reaccionar a cambios de orientación ---
        this.scale.on('resize', this.handleResize, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.scale.off('resize', this.handleResize, this);
        });
    }

    /** Crea el fondo correcto para la orientación dada y lo escala para cubrir la pantalla. */
    private createBackground(
        width: number, height: number
    ): Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle {
        const isLandscape = width > height;
        const key = isLandscape ? 'menu-bg-landscape' : 'menu-bg-portrait';

        let useKey = key;
        if (!this.textures.exists(useKey)) useKey = 'menu-bg';

        if (this.textures.exists(useKey)) {
            const img = this.add.image(width / 2, height / 2, useKey).setDepth(0);
            const s = Math.max(width / img.width, height / img.height);   // cover
            img.setScale(s);
            return img;
        }
        return this.add.rectangle(0, 0, width, height, 0x0d2b18).setOrigin(0).setDepth(0);
    }

    /** Ajusta el fontSize del botón para que quepa dentro del ancho disponible. */
    private fitButtonFont(maxWidth: number) {
        const MIN_FONT = 14;
        const MAX_FONT = 64;

        for (let size = MAX_FONT; size >= MIN_FONT; size -= 2) {
            this.btn.setFontSize(size);
            const b = this.btn.getBounds();
            if (b.width <= maxWidth) return;
        }
        this.btn.setFontSize(MIN_FONT);
    }

    /** Coloca el botón centrado horizontalmente, un poco por debajo de la mitad vertical. */
    private layoutUI(width: number, height: number) {
        const sideMargin = Math.max(14, Math.min(width, height) * 0.045);
        const SCALE_HEADROOM = 1.2;   // reserva para el tween de escala (1.18)

        // Ajuste de fuente para que quepa con margen lateral
        const availableBtnW = (width - sideMargin * 2) / SCALE_HEADROOM;
        this.fitButtonFont(availableBtnW);

        // Posición: centrado en X, ~60% de la altura (un poco por debajo de la mitad)
        const y = height * 0.8;
        this.btn.setPosition(width / 2, y);

        // Red de seguridad: si aún se sale por los lados, reducir más
        let b = this.btn.getBounds();
        if (b.left < 2 || b.right > width - 2) {
            this.fitButtonFont(width * 0.85 / SCALE_HEADROOM);
            b = this.btn.getBounds();
        }
        // Y si se sale por abajo, subirlo lo justo
        if (b.bottom > height - 4) {
            this.btn.y -= (b.bottom - (height - 4));
        }
    }

    private handleResize(gameSize: Phaser.Structs.Size) {
        const { width, height } = gameSize;

        // Fondo
        this.bg?.destroy();
        this.bg = this.createBackground(width, height);

        // Reposicionar y reajustar botón
        this.layoutUI(width, height);
    }
}
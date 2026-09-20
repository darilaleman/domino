# domino-setup.ps1
Write-Host "🎲 Iniciando creación de Domino Game (Estilo CubaPlay)..." -ForegroundColor Cyan

function New-File {
    param([string]$Path, [string]$Content)
    $dir = Split-Path $Path -Parent
    if ($dir -and $dir -ne "") { 
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null } 
    }
    [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

# 1. Estructura de Carpetas
$folders = @(
    "src/game/scenes", 
    "src/game/objects", 
    "src/game/systems", 
    "src/game/config", 
    "src/cubaplay", 
    "public/assets/images", 
    "public/assets/audio"
)
foreach ($f in $folders) {
    New-Item -ItemType Directory -Force -Path $f | Out-Null
}

# 2. package.json
New-File "package.json" @'
{
  "name": "cubaplay-domino",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build"
  },
  "dependencies": {
    "phaser": "^3.60.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vite": "^4.3.0"
  }
}
'@

# 3. tsconfig.json
New-File "tsconfig.json" @'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM"],
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "strict": true
  },
  "include": ["src"]
}
'@

# 4. vite.config.ts
New-File "vite.config.ts" @'
import { defineConfig } from 'vite'
export default defineConfig({
  base: './',
  build: { outDir: 'dist' }
})
'@

# 5. index.html
New-File "index.html" @'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CubaPlay Domino</title>
    <link rel="stylesheet" href="/src/styles.css" />
</head>
<body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
</body>
</html>
'@

# 6. styles.css
New-File "src/styles.css" @'
body { margin: 0; overflow: hidden; background: #0d4a28; touch-action: none; }
#app { width: 100vw; height: 100vh; }
'@

# 7. GamePlatform.ts
New-File "src/cubaplay/GamePlatform.ts" @'
export interface GameResult {
    gameId: string; gameVersion: string; score: number; durationMs: number;
    statistics?: Record<string, any>;
}
export interface GamePlatform {
    initialize(): Promise<void>;
    getPlayer(): Promise<{id: string}>;
    startGame(): Promise<{sessionId: string}>;
    submitResult(result: GameResult): Promise<any>;
    exitGame(): void;
}
'@

# 8. WebTestPlatform.ts
New-File "src/cubaplay/WebTestPlatform.ts" @'
import { GamePlatform, GameResult } from './GamePlatform';
export class WebTestPlatform implements GamePlatform {
    async initialize() { console.log('Init'); }
    async getPlayer() { return { id: 'test-user' }; }
    async startGame() { return { sessionId: 'test-123' }; }
    async submitResult(r: GameResult) { 
        console.log('Domino Result:', r); 
        alert('Partida finalizada. Puntos: ' + r.score); 
        return { success: true }; 
    }
    exitGame() {}
}
'@

# 9. GameConfig.ts
New-File "src/game/config/GameConfig.ts" @'
export const GAME_INFO = {
    id: 'cubaplay-domino',
    name: 'Dominó Cubano',
    version: '1.0.0'
};
'@

# 10. Tile.ts (La Ficha)
New-File "src/game/objects/Tile.ts" @'
import Phaser from 'phaser';

export class Tile {
    public value1: number;
    public value2: number;
    public sprite?: Phaser.GameObjects.Container;
    public isDouble: boolean;

    constructor(v1: number, v2: number) {
        this.value1 = v1;
        this.value2 = v2;
        this.isDouble = v1 === v2;
    }

    get total(): number { return this.value1 + this.value2; }

    createVisuals(scene: Phaser.Scene, x: number, y: number) {
        // Contenedor para agrupar sombra y ficha
        const container = scene.add.container(x, y);
        
        // Sombra simulada
        const shadow = scene.add.rectangle(2, 2, 40, 80, 0x000000, 0.3).setOrigin(0.5);
        
        // Cuerpo de la ficha
        const body = scene.add.rectangle(0, 0, 40, 80, 0xffffff).setOrigin(0.5).setStrokeStyle(1, 0xcccccc);
        
        // Línea divisoria
        const line = scene.add.rectangle(0, 0, 36, 2, 0xcccccc).setOrigin(0.5);
        
        // Puntos (Texto por ahora, luego serían imágenes)
        const t1 = scene.add.text(-10, -20, this.value1.toString(), { fontSize: '20px', color: '#000' }).setOrigin(0.5);
        const t2 = scene.add.text(10, 20, this.value2.toString(), { fontSize: '20px', color: '#000' }).setOrigin(0.5);

        container.add([shadow, body, line, t1, t2]);
        this.sprite = container;
        return container;
    }
}
'@

# 11. RulesEngine.ts
New-File "src/game/systems/RulesEngine.ts" @'
import { Tile } from '../objects/Tile';

export class RulesEngine {
    private boardEnds: { left: number | null, right: number | null } = { left: null, right: null };
    private playedTiles: Tile[] = [];

    canPlay(tile: Tile): boolean {
        if (this.playedTiles.length === 0) return true;
        return tile.value1 === this.boardEnds.left || tile.value2 === this.boardEnds.left ||
               tile.value1 === this.boardEnds.right || tile.value2 === this.boardEnds.right;
    }

    playTile(tile: Tile, side: 'left' | 'right'): boolean {
        if (!this.canPlay(tile)) return false;

        if (this.playedTiles.length === 0) {
            this.boardEnds.left = tile.value1;
            this.boardEnds.right = tile.value2;
        } else if (side === 'left') {
            if (tile.value2 === this.boardEnds.left) {
                this.boardEnds.left = tile.value1;
            } else {
                this.boardEnds.left = tile.value2;
            }
        } else {
            if (tile.value1 === this.boardEnds.right) {
                this.boardEnds.right = tile.value2;
            } else {
                this.boardEnds.right = tile.value1;
            }
        }
        this.playedTiles.push(tile);
        return true;
    }

    getBoardEnds() { return this.boardEnds; }
}
'@

# 12. PlayerHand.ts
New-File "src/game/objects/PlayerHand.ts" @'
import { Tile } from './Tile';

export class PlayerHand {
    public tiles: Tile[] = [];
    public isBot: boolean;

    constructor(isBot: boolean = false) {
        this.isBot = isBot;
    }

    addTile(tile: Tile) { this.tiles.push(tile); }
    
    removeTile(tile: Tile) {
        const index = this.tiles.indexOf(tile);
        if (index > -1) this.tiles.splice(index, 1);
    }

    hasValidMove(boardEnds: { left: number | null, right: number | null }): boolean {
        if (boardEnds.left === null) return true;
        return this.tiles.some(t => 
            t.value1 === boardEnds.left || t.value2 === boardEnds.left ||
            t.value1 === boardEnds.right || t.value2 === boardEnds.right
        );
    }
}
'@

# 13. BootScene.ts
New-File "src/game/scenes/BootScene.ts" @'
import { Scene } from 'phaser';
export class BootScene extends Scene {
    constructor() { super('BootScene'); }
    preload() {
        // Aquí cargarías la imagen de la mesa de madera
        // this.load.image('table', 'assets/images/table.png');
    }
    create() { this.scene.start('MenuScene'); }
}
'@

# 14. MenuScene.ts
New-File "src/game/scenes/MenuScene.ts" @'
import { Scene } from 'phaser';
export class MenuScene extends Scene {
    constructor() { super('MenuScene'); }
    create() {
        const {width, height} = this.cameras.main;
        this.add.text(width/2, height/3, 'DOMINÓ CUBAPLAY', {fontSize:'32px', color:'#fff', fontStyle:'bold'}).setOrigin(0.5);
        const btn = this.add.text(width/2, height/2, 'JUGAR VS BOTS', {fontSize:'24px', color:'#0f0', backgroundColor:'#000', padding:{x:20,y:10}}).setOrigin(0.5).setInteractive();
        btn.on('pointerdown', () => this.scene.start('MatchScene'));
    }
}
'@

# 15. MatchScene.ts
New-File "src/game/scenes/MatchScene.ts" @'
import { Scene } from 'phaser';
import { Tile } from '../objects/Tile';
import { PlayerHand } from '../objects/PlayerHand';
import { RulesEngine } from '../systems/RulesEngine';

export class MatchScene extends Scene {
    private rules!: RulesEngine;
    private players: PlayerHand[] = [];
    private deck: Tile[] = [];
    private playerSprites: Tile[] = [];

    constructor() { super('MatchScene'); }

    create() {
        this.rules = new RulesEngine();
        this.generateDeck();
        this.dealTiles();
        
        const {width, height} = this.cameras.main;
        
        // Fondo de mesa (simulado con color por ahora)
        this.add.rectangle(width/2, height/2, width, height, 0x0d4a28);

        // Dibujar mano del jugador (abajo)
        this.renderPlayerHand(0, height - 100);

        this.add.text(width/2, 50, 'Tu Turno', {fontSize:'24px', color:'#fff'}).setOrigin(0.5);
    }

    private generateDeck() {
        this.deck = [];
        for(let i=0; i<=6; i++) {
            for(let j=i; j<=6; j++) {
                this.deck.push(new Tile(i, j));
            }
        }
        this.deck.sort(() => Math.random() - 0.5);
    }

    private dealTiles() {
        this.players = [];
        for(let i=0; i<4; i++) {
            const hand = new PlayerHand(i > 0);
            for(let j=0; j<7; j++) {
                if(this.deck.length > 0) hand.addTile(this.deck.pop()!);
            }
            this.players.push(hand);
        }
    }

    private renderPlayerHand(playerIndex: number, yPos: number) {
        const {width} = this.cameras.main;
        const hand = this.players[playerIndex];
        const spacing = 50;
        const startX = (width - (hand.tiles.length * spacing)) / 2;

        hand.tiles.forEach((tile, i) => {
            const visual = tile.createVisuals(this, startX + (i * spacing), yPos);
            visual.setInteractive();
            visual.on('pointerdown', () => this.onTileClicked(tile, visual));
        });
    }

    private onTileClicked(tile: Tile, visual: Phaser.GameObjects.Container) {
        if (this.rules.canPlay(tile)) {
            // Animación tipo "deslizar" hacia el centro
            this.tweens.add({
                targets: visual,
                y: this.cameras.main.height / 2,
                x: this.cameras.main.width / 2,
                duration: 500,
                ease: 'Power2'
            });
            this.rules.playTile(tile, 'right'); // Simplificado
        }
    }
}
'@

# 16. GameOverScene.ts
New-File "src/game/scenes/GameOverScene.ts" @'
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
'@

# 17. main.ts
New-File "src/main.ts" @'
import Phaser from 'phaser';
import { BootScene } from './game/scenes/BootScene';
import { MenuScene } from './game/scenes/MenuScene';
import { MatchScene } from './game/scenes/MatchScene';
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
'@

Write-Host "✅ Proyecto Domino generado correctamente." -ForegroundColor Green
Write-Host "Ejecuta npm install y luego npm run dev para comenzar." -ForegroundColor Yellow
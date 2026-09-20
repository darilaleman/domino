import { Scene } from 'phaser';
import { Tile, TILE_W, TILE_H } from '../objects/Tile';
import { PlayerHand } from '../objects/PlayerHand';

type Vec2 = { x: number; y: number };
type Dir = { dx: number; dy: number };
type GridPos = { gx: number; gy: number };
type Box = { gx: number; gy: number; gw: number; gh: number };
type Orientation = 'landscape' | 'portrait';

const TABLE_LONG = 60;
const TABLE_SHORT = 20;
const LONG = 4;
const SHORT = 2;
const DEBUG_GRID = false;
const REGISTRY_KEY = 'match_restore_state';

interface EndState {
    head: GridPos;
    dir: Dir;
    turn: Dir;
    lastDouble: boolean;
    afterElbow?: boolean;
}
interface Placement { box: Box; rotation: number; newEnd: EndState; }

// ---------- Estado serializable ----------
interface SerializedTile { v1: number; v2: number; }
interface SerializedBoardTile { v1: number; v2: number; box: Box; rotation: number; }

interface MatchState {
    orientation: Orientation;
    hands: SerializedTile[][];
    deck: SerializedTile[];
    currentPlayerIndex: number;
    boardTiles: SerializedBoardTile[];
    leftEndValue: number | null;
    rightEndValue: number | null;
    leftEnd: EndState;
    rightEnd: EndState;
    passStreak: number;
}

export class MatchScene extends Scene {
    private players: PlayerHand[] = [];
    private deck: Tile[] = [];
    private currentPlayerIndex = 0;
    private boardTiles: Tile[] = [];
    private boardBoxes = new Map<Tile, Box>();
    private isProcessingTurn = false;
    private leftEndValue: number | null = null;
    private rightEndValue: number | null = null;

    private gridOrigin: Vec2 = { x: 0, y: 0 };
    private gridCols = 0;
    private gridRows = 0;
    private cell = 10;
    private tileScale = 1;
    private handScale = 1;
    private botScale = 0.6;
    private occupied = new Set<string>();

    private leftEnd: EndState = { head: { gx: 0, gy: 0 }, dir: { dx: -1, dy: 0 }, turn: { dx: 0, dy: -1 }, lastDouble: false };
    private rightEnd: EndState = { head: { gx: 0, gy: 0 }, dir: { dx: 1, dy: 0 }, turn: { dx: 0, dy: 1 }, lastDouble: false };

    private isLandscape = false;
    private passStreak = 0;
    private choiceContainer?: Phaser.GameObjects.Container;
    private turnText!: Phaser.GameObjects.Text;
    private safeArea!: Phaser.Geom.Rectangle;
    private handZones = new Map<Tile, Phaser.GameObjects.Zone>();

    private pendingState: MatchState | undefined;
    private isEnding = false;

    // --- Overlay final ---
    private endOverlay?: Phaser.GameObjects.Container;
    private lastWinnerIndex = -1;
    private lastHeadline = '';

    constructor() { super('MatchScene'); }

    init(_data?: { state?: MatchState }) {
        this.resetSceneState();
        this.isEnding = false;

        const restore = this.registry.get(REGISTRY_KEY) as MatchState | undefined;
        this.pendingState = restore;
        if (restore) this.registry.remove(REGISTRY_KEY);
    }

    private resetSceneState() {
        this.players = [];
        this.deck = [];
        this.currentPlayerIndex = 0;
        this.boardTiles = [];
        this.boardBoxes = new Map();
        this.isProcessingTurn = false;
        this.isEnding = false;
        this.leftEndValue = null;
        this.rightEndValue = null;
        this.occupied = new Set<string>();
        this.handZones = new Map();
        this.passStreak = 0;
        this.choiceContainer = undefined;
        this.endOverlay = undefined;
        this.lastWinnerIndex = -1;
        this.lastHeadline = '';
        this.leftEnd = { head: { gx: 0, gy: 0 }, dir: { dx: -1, dy: 0 }, turn: { dx: 0, dy: -1 }, lastDouble: false };
        this.rightEnd = { head: { gx: 0, gy: 0 }, dir: { dx: 1, dy: 0 }, turn: { dx: 0, dy: 1 }, lastDouble: false };
    }

    create() {
        const { width, height } = this.cameras.main;
        this.isLandscape = width > height;

        // --- Fondo de la mesa ---
        const tableKey = this.isLandscape ? 'table-bg-landscape' : 'table-bg-portrait';
        if (this.textures.exists(tableKey)) {
            const bg = this.add.image(width / 2, height / 2, tableKey).setDepth(-10);
            const s = Math.max(width / bg.width, height / bg.height);
            bg.setScale(s);
        } else {
            this.add.rectangle(0, 0, width, height, 0x0d2b18).setOrigin(0).setDepth(-10);
        }

        this.handScale = Math.min(1, (width - 20) / (7 * (TILE_W + 6)), (height * 0.18) / TILE_H);
        this.botScale = this.handScale * 0.6;
        const handH = TILE_H * this.handScale;
        const botH = TILE_H * this.botScale;

        const topPad = botH + 46;
        const bottomPad = handH + 24;
        const sidePad = botH + 14;
        const gameW = width - sidePad * 2;
        const gameH = height - topPad - bottomPad;

        this.gridCols = this.isLandscape ? TABLE_LONG : TABLE_SHORT;
        this.gridRows = this.isLandscape ? TABLE_SHORT : TABLE_LONG;
        this.cell = Math.min(gameW / this.gridCols, gameH / this.gridRows);
        this.tileScale = (this.cell * SHORT) / TILE_W;

        const gridW = this.gridCols * this.cell;
        const gridH = this.gridRows * this.cell;
        this.gridOrigin = {
            x: sidePad + (gameW - gridW) / 2,
            y: topPad + (gameH - gridH) / 2
        };
        this.safeArea = new Phaser.Geom.Rectangle(this.gridOrigin.x, this.gridOrigin.y, gridW, gridH);

        const border = this.add.graphics().setDepth(0);
        border.fillStyle(0x0d4a28, 0.3);
        border.fillRect(this.gridOrigin.x, this.gridOrigin.y, gridW, gridH);
        border.lineStyle(4, 0x555555, 1);
        border.strokeRect(this.gridOrigin.x, this.gridOrigin.y, gridW, gridH);
        if (DEBUG_GRID) {
            border.lineStyle(1, 0xffffff, 0.12);
            for (let c = 0; c <= this.gridCols; c++)
                border.lineBetween(this.gridOrigin.x + c * this.cell, this.gridOrigin.y,
                    this.gridOrigin.x + c * this.cell, this.gridOrigin.y + gridH);
            for (let r = 0; r <= this.gridRows; r++)
                border.lineBetween(this.gridOrigin.x, this.gridOrigin.y + r * this.cell,
                    this.gridOrigin.x + gridW, this.gridOrigin.y + r * this.cell);
        }

        this.turnText = this.add.text(width / 2, 20, 'Esperando...', {
            fontSize: '20px', color: '#fff', backgroundColor: '#000',
            padding: { x: 10, y: 5 }
        }).setOrigin(0.5).setDepth(100);

        // --- Listener de orientación ---
        this.scale.on('resize', this.handleResize, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.scale.off('resize', this.handleResize, this);
        });

        // --- Restaurar partida o iniciar nueva ---
        if (this.pendingState) {
            const s = this.pendingState;
            this.pendingState = undefined;
            this.restoreGame(s);
        } else {
            this.generateDeck();
            this.dealTiles();
            this.renderPlayerHand();
            this.renderBotHands();
            this.startGame();
        }
    }

    // ---------- Cambio de orientación ----------
    private handleResize(gameSize: Phaser.Structs.Size) {
        if (!this.scene.isActive()) return;

        const newLandscape = gameSize.width > gameSize.height;

        // Si la partida terminó y hay overlay, lo reconstruimos con el nuevo tamaño.
        if (this.isEnding) {
            this.isLandscape = newLandscape;
            this.buildEndOverlay();
            return;
        }

        if (newLandscape === this.isLandscape) return;

        if (this.isProcessingTurn) {
            this.time.delayedCall(100, () => this.handleResize(gameSize));
            return;
        }

        this.registry.set(REGISTRY_KEY, this.saveState());
        this.scene.restart();
    }

    private saveState(): MatchState {
        return {
            orientation: this.isLandscape ? 'landscape' : 'portrait',
            hands: this.players.map(h => h.tiles.map(t => ({ v1: t.value1, v2: t.value2 }))),
            deck: this.deck.map(t => ({ v1: t.value1, v2: t.value2 })),
            currentPlayerIndex: this.currentPlayerIndex,
            boardTiles: this.boardTiles.map(t => {
                const box = this.boardBoxes.get(t)!;
                return { v1: t.value1, v2: t.value2, box: { ...box }, rotation: t.sprite.rotation };
            }),
            leftEndValue: this.leftEndValue,
            rightEndValue: this.rightEndValue,
            leftEnd: this.cloneEnd(this.leftEnd),
            rightEnd: this.cloneEnd(this.rightEnd),
            passStreak: this.passStreak
        };
    }

    private cloneEnd(e: EndState): EndState {
        return {
            head: { ...e.head },
            dir: { ...e.dir },
            turn: { ...e.turn },
            lastDouble: e.lastDouble,
            afterElbow: e.afterElbow
        };
    }

    private restoreGame(state: MatchState) {
        const currentOrientation: Orientation = this.isLandscape ? 'landscape' : 'portrait';
        const orientationChanged = state.orientation !== currentOrientation;

        this.players = state.hands.map((tiles, idx) => {
            const hand = new PlayerHand(idx > 0);
            tiles.forEach(td => hand.addTile(new Tile(td.v1, td.v2)));
            return hand;
        });
        this.deck = state.deck.map(td => new Tile(td.v1, td.v2));

        this.currentPlayerIndex = state.currentPlayerIndex;
        this.passStreak = state.passStreak;
        this.leftEndValue = state.leftEndValue;
        this.rightEndValue = state.rightEndValue;
        this.leftEnd = this.cloneEnd(state.leftEnd);
        this.rightEnd = this.cloneEnd(state.rightEnd);
        this.isProcessingTurn = false;

        let boardTilesData = state.boardTiles;
        if (orientationChanged) {
            boardTilesData = state.boardTiles.map(bt => ({
                v1: bt.v1,
                v2: bt.v2,
                box: this.transformBox(bt.box, state.orientation),
                rotation: bt.rotation + (state.orientation === 'landscape' ? Math.PI / 2 : -Math.PI / 2)
            }));
            this.leftEnd = this.transformEnd(this.leftEnd, state.orientation);
            this.rightEnd = this.transformEnd(this.rightEnd, state.orientation);
        }

        this.boardTiles = [];
        this.boardBoxes = new Map();
        this.occupied = new Set();
        for (const bt of boardTilesData) {
            const tile = new Tile(bt.v1, bt.v2);
            tile.createSprite(this, 0, 0, 0);
            tile.sprite.setScale(this.tileScale).setDepth(5);
            (tile.sprite as Phaser.GameObjects.GameObject).disableInteractive();
            tile.setFaceDown(false);
            const center = this.boxCenterWorld(bt.box);
            tile.sprite.setPosition(center.x, center.y);
            tile.sprite.setRotation(bt.rotation);
            this.occupy(bt.box);
            this.boardTiles.push(tile);
            this.boardBoxes.set(tile, { ...bt.box });
        }

        this.renderPlayerHand();
        this.renderBotHands();
        this.beginTurn();
    }

    // ---------- Transformaciones de orientación ----------
    private transformBox(box: Box, from: Orientation): Box {
        if (from === 'landscape') {
            return {
                gx: TABLE_SHORT - box.gy - box.gh,
                gy: box.gx,
                gw: box.gh,
                gh: box.gw
            };
        } else {
            return {
                gx: box.gy,
                gy: TABLE_SHORT - box.gx - box.gw,
                gw: box.gh,
                gh: box.gw
            };
        }
    }

    private transformPos(p: GridPos, from: Orientation): GridPos {
        if (from === 'landscape') {
            return { gx: TABLE_SHORT - p.gy, gy: p.gx };
        } else {
            return { gx: p.gy, gy: TABLE_SHORT - p.gx };
        }
    }

    private transformDir(d: Dir, from: Orientation): Dir {
        if (from === 'landscape') {
            return { dx: -d.dy, dy: d.dx };
        } else {
            return { dx: d.dy, dy: -d.dx };
        }
    }

    private transformEnd(e: EndState, from: Orientation): EndState {
        return {
            head: this.transformPos(e.head, from),
            dir: this.transformDir(e.dir, from),
            turn: this.transformDir(e.turn, from),
            lastDouble: e.lastDouble,
            afterElbow: e.afterElbow
        };
    }

    // ---------- Deck / manos ----------
    private generateDeck() {
        this.deck = [];
        for (let i = 0; i <= 6; i++)
            for (let j = i; j <= 6; j++)
                this.deck.push(new Tile(i, j));
        this.deck.sort(() => Math.random() - 0.5);
    }

    private dealTiles() {
        this.players = [];
        for (let i = 0; i < 4; i++) {
            const hand = new PlayerHand(i > 0);
            for (let j = 0; j < 7; j++)
                if (this.deck.length > 0) hand.addTile(this.deck.pop()!);
            this.players.push(hand);
        }
    }

    private startGame() {
        let starter = 0, found = false;
        for (let val = 6; val >= 0 && !found; val--) {
            for (let i = 0; i < 4; i++) {
                if (this.players[i].tiles.some(t => t.value1 === val && t.value2 === val)) {
                    starter = i; found = true; break;
                }
            }
        }
        this.currentPlayerIndex = starter;
        this.beginTurn();
    }

    private renderPlayerHand() {
        this.players[0].tiles.forEach(tile => {
            tile.createSprite(this, 0, 0, 0);
            tile.sprite.setScale(this.handScale).setDepth(50);
            (tile.sprite as Phaser.GameObjects.GameObject).disableInteractive();

            const zone = this.add.zone(0, 0, TILE_W * this.handScale, TILE_H * this.handScale)
                .setDepth(60)
                .setInteractive({ useHandCursor: true });
            zone.on('pointerdown', () => {
                if (this.currentPlayerIndex === 0 && !this.isProcessingTurn && !this.isEnding)
                    this.humanPlayTile(tile);
            });
            this.handZones.set(tile, zone);
        });
        this.layoutHumanHand(false);
    }

    private layoutHumanHand(animate: boolean) {
        const { width, height } = this.cameras.main;
        const hand = this.players[0];
        const spacing = TILE_W * this.handScale + 6;
        const totalW = hand.tiles.length * spacing;
        const x0 = (width - totalW) / 2 + spacing / 2;
        const y = height - (TILE_H * this.handScale) / 2 - 10;

        hand.tiles.forEach((tile, i) => {
            const x = x0 + i * spacing;
            this.handZones.get(tile)?.setPosition(x, y);
            if (animate) this.tweens.add({ targets: tile.sprite, x, y, duration: 200 });
            else tile.sprite.setPosition(x, y);
        });
    }

    private releaseHandZone(tile: Tile) {
        this.handZones.get(tile)?.destroy();
        this.handZones.delete(tile);
        this.layoutHumanHand(true);
    }

    private renderBotHands() {
        const s = this.safeArea;
        const off = (TILE_H * this.botScale) / 2 + 6;
        const positions = [
            { x: s.x - off, y: s.y + s.height / 2, rot: Math.PI / 2 },
            { x: s.x + s.width / 2, y: s.y - off, rot: 0 },
            { x: s.right + off, y: s.y + s.height / 2, rot: -Math.PI / 2 }
        ];
        const spacing = TILE_W * this.botScale + 3;
        for (let i = 1; i <= 3; i++) {
            const hand = this.players[i];
            const pos = positions[i - 1];
            const offset = ((hand.tiles.length - 1) * spacing) / 2;
            hand.tiles.forEach((tile, idx) => {
                let tx = pos.x, ty = pos.y;
                const delta = -offset + idx * spacing;
                if (pos.rot === 0) tx += delta; else ty += delta;
                tile.createSprite(this, tx, ty, pos.rot);
                tile.setFaceDown(true);
                tile.sprite.setScale(this.botScale);
                (tile.sprite as Phaser.GameObjects.GameObject).disableInteractive();
            });
        }
    }

    // ---------- Grid ----------
    private key(gx: number, gy: number) { return `${gx},${gy}`; }

    private boxCells(box: Box): GridPos[] {
        const cells: GridPos[] = [];
        for (let x = 0; x < box.gw; x++)
            for (let y = 0; y < box.gh; y++)
                cells.push({ gx: box.gx + x, gy: box.gy + y });
        return cells;
    }

    private boxInBounds(box: Box): boolean {
        return box.gx >= 0 && box.gy >= 0 &&
            box.gx + box.gw <= this.gridCols &&
            box.gy + box.gh <= this.gridRows;
    }

    private boxFits(box: Box): boolean {
        if (!this.boxInBounds(box)) return false;
        for (const c of this.boxCells(box))
            if (this.occupied.has(this.key(c.gx, c.gy))) return false;
        return true;
    }

    private occupy(box: Box) {
        for (const c of this.boxCells(box)) this.occupied.add(this.key(c.gx, c.gy));
    }

    private boxCenterWorld(box: Box): Vec2 {
        return {
            x: this.gridOrigin.x + (box.gx + box.gw / 2) * this.cell,
            y: this.gridOrigin.y + (box.gy + box.gh / 2) * this.cell
        };
    }

    // ---------- Rotaciones ----------
    private angleAlong(dir: Dir): number { return Math.atan2(-dir.dx, dir.dy); }
    private anglePerpendicular(dir: Dir): number { return Math.atan2(dir.dy, dir.dx); }

    // ---------- Marco local (u, v) ----------
    private framePoint(end: EndState, u: number, v: number): GridPos {
        return {
            gx: end.head.gx + u * end.dir.dx + v * end.turn.dx,
            gy: end.head.gy + u * end.dir.dy + v * end.turn.dy
        };
    }

    private frameBox(end: EndState, u0: number, u1: number, v0: number, v1: number): Box {
        const a = this.framePoint(end, u0, v0);
        const b = this.framePoint(end, u1, v1);
        return {
            gx: Math.min(a.gx, b.gx), gy: Math.min(a.gy, b.gy),
            gw: Math.abs(a.gx - b.gx), gh: Math.abs(a.gy - b.gy)
        };
    }

    private reverse(d: Dir): Dir { return { dx: 0 - d.dx, dy: 0 - d.dy }; }

    private alongBox(end: EndState): Box { return this.frameBox(end, 0, LONG, -1, 1); }
    private perpBox(end: EndState): Box { return this.frameBox(end, 0, SHORT, -2, 2); }

    private advance(end: EndState, isDouble: boolean): EndState {
        const step = isDouble ? SHORT : LONG;
        return {
            head: this.framePoint(end, step, 0),
            dir: { ...end.dir },
            turn: { ...end.turn },
            lastDouble: isDouble
        };
    }

    private elbowBox(end: EndState): Box {
        return end.lastDouble
            ? this.frameBox(end, -2, 0, 2, 6)
            : this.frameBox(end, -2, 0, 1, 5);
    }

    private postGeometry(end: EndState, isDouble: boolean) {
        const side = end.lastDouble;
        let u0: number, u1: number, v0: number, v1: number, headU: number, headV: number;
        if (!side && !isDouble) { u0 = -4; u1 = 0; v0 = 5; v1 = 7; headU = -4; headV = 6; }
        else if (!side && isDouble) { u0 = -3; u1 = 1; v0 = 5; v1 = 7; headU = -3; headV = 6; }
        else if (side && !isDouble) { u0 = -6; u1 = -2; v0 = 4; v1 = 6; headU = -6; headV = 5; }
        else { u0 = -3; u1 = 1; v0 = 6; v1 = 8; headU = -3; headV = 7; }
        return {
            box: this.frameBox(end, u0, u1, v0, v1),
            newEnd: {
                head: this.framePoint(end, headU, headV),
                dir: this.reverse(end.dir),
                turn: { ...end.turn },
                lastDouble: false
            } as EndState
        };
    }

    private postBox(end: EndState, isDouble: boolean): Box { return this.postGeometry(end, isDouble).box; }

    private postFeasible(end: EndState): boolean {
        return this.boxFits(this.postBox(end, false)) && this.boxFits(this.postBox(end, true));
    }

    private straightFits(end: EndState): boolean {
        return this.boxFits(this.alongBox(end));
    }

    private canContinue(end: EndState): boolean {
        if (this.straightFits(end)) return true;
        return this.boxFits(this.elbowBox(end)) && this.postFeasible(end);
    }

    // ---------- Lógica de colocación ----------
    private tryComputePlacement(tile: Tile, end: EndState): Placement | null {
        const isDouble = tile.isDouble;

        if (end.afterElbow) {
            const g = this.postGeometry(end, isDouble);
            if (!this.boxFits(g.box)) return null;
            return { box: g.box, rotation: this.angleAlong(g.newEnd.dir), newEnd: g.newEnd };
        }

        const natural: Placement = {
            box: isDouble ? this.perpBox(end) : this.alongBox(end),
            rotation: isDouble ? this.anglePerpendicular(end.dir) : this.angleAlong(end.dir),
            newEnd: this.advance(end, isDouble)
        };
        const elbow: Placement = {
            box: this.elbowBox(end),
            rotation: this.angleAlong(end.turn),
            newEnd: { ...end, afterElbow: true }
        };

        const natFits = this.boxFits(natural.box);
        const elbFits = this.boxFits(elbow.box);

        if (natFits && this.canContinue(natural.newEnd)) return natural;
        if (elbFits && this.postFeasible(end)) return elbow;
        if (natFits) return natural;
        if (elbFits) return elbow;
        return null;
    }

    // ---------- Colocación real ----------
    private tweenTile(tile: Tile, target: Vec2, rotation: number): Promise<void> {
        return new Promise(resolve => {
            this.tweens.add({
                targets: tile.sprite,
                x: target.x, y: target.y, rotation, scale: this.tileScale,
                duration: 500, ease: 'Power2',
                onComplete: () => resolve()
            });
        });
    }

    private async placeInitialTile(tile: Tile, playerIndex: number) {
        const cx = Math.floor(this.gridCols / 2);
        const cy = Math.floor(this.gridRows / 2);
        const isDouble = tile.isDouble;

        const mainDir: Dir = this.isLandscape ? { dx: 1, dy: 0 } : { dx: 0, dy: 1 };
        let box: Box;

        if (this.isLandscape) {
            box = isDouble
                ? { gx: cx - 1, gy: cy - 2, gw: SHORT, gh: LONG }
                : { gx: cx - 2, gy: cy - 1, gw: LONG, gh: SHORT };
            this.rightEnd = { head: { gx: box.gx + box.gw, gy: cy }, dir: { dx: 1, dy: 0 }, turn: { dx: 0, dy: 1 }, lastDouble: isDouble };
            this.leftEnd = { head: { gx: box.gx, gy: cy }, dir: { dx: -1, dy: 0 }, turn: { dx: 0, dy: -1 }, lastDouble: isDouble };
        } else {
            box = isDouble
                ? { gx: cx - 2, gy: cy - 1, gw: LONG, gh: SHORT }
                : { gx: cx - 1, gy: cy - 2, gw: SHORT, gh: LONG };
            this.rightEnd = { head: { gx: cx, gy: box.gy + box.gh }, dir: { dx: 0, dy: 1 }, turn: { dx: -1, dy: 0 }, lastDouble: isDouble };
            this.leftEnd = { head: { gx: cx, gy: box.gy }, dir: { dx: 0, dy: -1 }, turn: { dx: 1, dy: 0 }, lastDouble: isDouble };
        }
        const rotation = isDouble ? this.anglePerpendicular(mainDir) : this.angleAlong(mainDir);

        this.leftEndValue = tile.value1;
        this.rightEndValue = tile.value2;

        this.occupy(box);
        this.boardTiles.push(tile);
        this.boardBoxes.set(tile, box);
        await this.tweenTile(tile, this.boxCenterWorld(box), rotation);
        this.afterPlay(playerIndex);
    }

    private async placeTileOnBoard(tile: Tile, playerIndex: number, side: 'left' | 'right' | 'center') {
        let placement: Placement | null = null;
        const isRight = side === 'right';
        if (side !== 'center') {
            placement = this.tryComputePlacement(tile, isRight ? this.rightEnd : this.leftEnd);
            if (!placement) return;
        }

        this.isProcessingTurn = true;
        this.players[playerIndex].removeTile(tile);
        if (playerIndex === 0) this.releaseHandZone(tile);
        tile.setFaceDown(false);
        tile.sprite.setDepth(5);
        this.passStreak = 0;

        if (side === 'center' || !placement) {
            await this.placeInitialTile(tile, playerIndex);
            return;
        }

        const connecting = isRight ? this.rightEndValue! : this.leftEndValue!;
        let rotation = placement.rotation;
        if (tile.value2 === connecting && tile.value1 !== connecting) rotation += Math.PI;

        this.occupy(placement.box);
        this.boardTiles.push(tile);
        this.boardBoxes.set(tile, placement.box);

        const outer = (tile.value1 === connecting) ? tile.value2 : tile.value1;
        if (isRight) { this.rightEnd = placement.newEnd; this.rightEndValue = outer; }
        else { this.leftEnd = placement.newEnd; this.leftEndValue = outer; }

        await this.tweenTile(tile, this.boxCenterWorld(placement.box), rotation);
        this.afterPlay(playerIndex);
    }

    private afterPlay(playerIndex: number) {
        if (this.players[playerIndex].tiles.length === 0) {
            const names = ['Tú', 'Bot 1', 'Bot 2', 'Bot 3'];
            this.showRoundSummaryAndEnd(playerIndex,
                playerIndex === 0 ? '¡Ganaste!' : `¡${names[playerIndex]} gana!`);
            return;
        }
        this.nextTurn();
    }

    // ---------- Interacción humano ----------
    private canPlay(tile: Tile) {
        if (this.boardTiles.length === 0) return { left: true, right: true };
        const mLeft = tile.value1 === this.leftEndValue || tile.value2 === this.leftEndValue;
        const mRight = tile.value1 === this.rightEndValue || tile.value2 === this.rightEndValue;
        const left = mLeft && this.tryComputePlacement(tile, this.leftEnd) !== null;
        const right = mRight && this.tryComputePlacement(tile, this.rightEnd) !== null;
        return { left, right };
    }

    private async humanPlayTile(tile: Tile) {
        if (this.isEnding) return;
        if (this.isProcessingTurn) return;

        if (this.boardTiles.length === 0) {
            await this.placeTileOnBoard(tile, 0, 'center');
            return;
        }

        const { left: canLeft, right: canRight } = this.canPlay(tile);

        if (canLeft && canRight && this.leftEndValue !== this.rightEndValue) {
            this.promptSideChoice(tile);
        } else if (canLeft) {
            await this.placeTileOnBoard(tile, 0, 'left');
        } else if (canRight) {
            await this.placeTileOnBoard(tile, 0, 'right');
        } else {
            this.tweens.add({
                targets: tile.sprite,
                x: tile.sprite.x + 5, duration: 50, yoyo: true, repeat: 3
            });
        }
    }

    private promptSideChoice(tile: Tile) {
        this.isProcessingTurn = true;
        const { width, height } = this.cameras.main;
        const container = this.add.container(width / 2, height / 2).setDepth(300);
        const bg = this.add.rectangle(0, 0, 300, 130, 0x000000, 0.85).setStrokeStyle(2, 0xffffff);
        const label = this.add.text(0, -42, '¿Por dónde quieres jugar?',
            { fontSize: '16px', color: '#fff' }).setOrigin(0.5);
        const leftBtn = this.add.rectangle(-75, 15, 120, 44, 0x2266cc).setInteractive({ useHandCursor: true });
        const leftText = this.add.text(-75, 15, `(${this.leftEndValue})`,
            { fontSize: '13px', color: '#fff', align: 'center' }).setOrigin(0.5);
        const rightBtn = this.add.rectangle(75, 15, 120, 44, 0x2266cc).setInteractive({ useHandCursor: true });
        const rightText = this.add.text(75, 15, `(${this.rightEndValue})`,
            { fontSize: '13px', color: '#fff', align: 'center' }).setOrigin(0.5);
        container.add([bg, label, leftBtn, leftText, rightBtn, rightText]);
        this.choiceContainer = container;

        leftBtn.on('pointerdown', () => {
            container.destroy(); this.choiceContainer = undefined;
            this.placeTileOnBoard(tile, 0, 'left');
        });
        rightBtn.on('pointerdown', () => {
            container.destroy(); this.choiceContainer = undefined;
            this.placeTileOnBoard(tile, 0, 'right');
        });
    }

    // ---------- Turnos ----------
    private nextTurn() {
        if (this.isEnding) return;
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % 4;
        this.beginTurn();
    }

    private beginTurn() {
        if (this.isEnding) return;
        this.isProcessingTurn = false;
        this.updateTurnUI();
        if (this.currentPlayerIndex !== 0) {
            this.time.delayedCall(1500, () => this.botPlay());
        } else if (!this.canPlayerMove(0)) {
            this.turnText.setText('¡No puedes jugar! Pasas turno.');
            this.time.delayedCall(2000, () => this.registerPass());
        }
    }

    private registerPass() {
        if (this.isEnding) return;
        this.passStreak++;
        if (this.passStreak >= 4) { this.endGameBlocked(); return; }
        this.nextTurn();
    }

    private endGameBlocked() {
        let winner = 0, lowest = Infinity;
        this.players.forEach((hand, i) => {
            const sum = hand.tiles.reduce((a, t) => a + t.value1 + t.value2, 0);
            if (sum < lowest) { lowest = sum; winner = i; }
        });
        this.showRoundSummaryAndEnd(winner,
            winner === 0 ? '¡Trancado! Ganaste por puntos.' : `¡Trancado! Gana Bot ${winner}.`);
    }

    private revealAllHands() {
        this.players.forEach(h => h.tiles.forEach(t => t.setFaceDown(false)));
    }

    // ---------- Overlay fin de partida ----------
    private showRoundSummaryAndEnd(winnerIndex: number, headline: string) {
        this.isEnding = true;
        this.revealAllHands();
        this.lastWinnerIndex = winnerIndex;
        this.lastHeadline = headline;
        this.buildEndOverlay();
    }

    private buildEndOverlay() {
        this.endOverlay?.destroy();
        this.endOverlay = undefined;

        const { width, height } = this.cameras.main;
        const isLandscape = width > height;

        const overlay = this.add.container(0, 0).setDepth(500);

        // --- Parámetros de layout ---
        const padX = isLandscape ? 24 : 16;
        const padY = isLandscape ? 18 : 14;

        const titleSize = isLandscape ? 26 : 22;
        let scoreSize = isLandscape ? 20 : 18;
        let scoreLineSpacing = isLandscape ? 8 : 6;

        const btnH = isLandscape ? 46 : 44;
        const btnGap = isLandscape ? 20 : 12;
        const btnBlockH = isLandscape ? btnH : btnH * 2 + btnGap;

        const gapTitleScores = isLandscape ? 14 : 12;
        const gapScoresButtons = 18;

        // --- Límites del panel ---
        const maxPanelW = isLandscape ? Math.min(width * 0.85, 640) : width * 0.92;
        const maxPanelH = isLandscape ? height * 0.92 : height * 0.85;

        // --- Título (se crea para medir su altura real) ---
        const humanWon = this.lastWinnerIndex === 0;
        const titleStr = humanWon ? '¡Felicidades, ganaste!' : this.lastHeadline;
        const titleColor = humanWon ? '#ffe600' : '#ffffff';

        const titleText = this.add.text(0, 0, titleStr, {
            fontSize: `${titleSize}px`,
            color: titleColor,
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4,
            align: 'center',
            wordWrap: { width: maxPanelW - padX * 2 }
        }).setOrigin(0.5);
        const titleH = titleText.height;

        // --- Puntuaciones ---
        const names = ['Tú', 'Bot 1', 'Bot 2', 'Bot 3'];
        const lines: string[] = this.players.map((h, i) => {
            const sum = h.tiles.reduce((a, t) => a + t.value1 + t.value2, 0);
            const marker = i === this.lastWinnerIndex ? '  ←' : '';
            return `${names[i]}: ${sum} pts${marker}`;
        });

        const computeScoresH = () => {
            const lineH = scoreSize * 1.35;
            return lines.length * lineH + (lines.length - 1) * scoreLineSpacing;
        };

        // --- Altura necesaria ---
        const fixedH = padY + titleH + gapTitleScores + gapScoresButtons + btnBlockH + padY;
        let scoresH = computeScoresH();

        // Si no cabe, se reducen las puntuaciones proporcionalmente
        if (fixedH + scoresH > maxPanelH) {
            const available = Math.max(40, maxPanelH - fixedH);
            const ratio = Math.max(0.5, available / scoresH);
            scoreSize = Math.max(11, Math.round(scoreSize * ratio));
            scoreLineSpacing = Math.max(2, Math.round(scoreLineSpacing * ratio));
            scoresH = computeScoresH();
        }

        const requiredH = fixedH + scoresH;
        const panelH = Math.min(maxPanelH, Math.max(requiredH, 200));
        const panelW = maxPanelW;

        const px = width / 2 - panelW / 2;
        const py = height / 2 - panelH / 2;

        // --- Fondo oscuro global ---
        const dim = this.add.rectangle(0, 0, width, height, 0x000000, 0.55).setOrigin(0);
        overlay.add(dim);

        // --- Panel ---
        const panel = this.add.rectangle(px, py, panelW, panelH, 0x000000, 0.85)
            .setOrigin(0)
            .setStrokeStyle(3, 0xffffff, 0.9);
        overlay.add(panel);

        // --- Título ---
        titleText.setPosition(width / 2, py + padY + titleH / 2);
        overlay.add(titleText);

        // --- Puntuaciones ---
        const scoresY = py + padY + titleH + gapTitleScores;
        const scoresText = this.add.text(width / 2, scoresY, lines.join('\n'), {
            fontSize: `${scoreSize}px`,
            color: '#ffffff',
            align: 'center',
            lineSpacing: scoreLineSpacing
        }).setOrigin(0.5, 0);
        overlay.add(scoresText);

        // --- Botones (anclados al fondo del panel) ---
        const btnW = isLandscape
            ? Math.min(220, (panelW - padX * 2 - btnGap) / 2)
            : Math.min(260, panelW - padX * 2);
        const btnBottomY = py + panelH - padY - btnH / 2;

        let replayX: number, replayY: number, cancelX: number, cancelY: number;

        if (isLandscape) {
            const totalW = btnW * 2 + btnGap;
            const startX = width / 2 - totalW / 2 + btnW / 2;
            replayX = startX;
            cancelX = startX + btnW + btnGap;
            replayY = cancelY = btnBottomY;
        } else {
            replayX = cancelX = width / 2;
            cancelY = btnBottomY;
            replayY = btnBottomY - btnH - btnGap;
        }

        const replayBg = this.add.rectangle(replayX, replayY, btnW, btnH, 0x00aa44)
            .setStrokeStyle(2, 0xffffff)
            .setInteractive({ useHandCursor: true });
        const replayText = this.add.text(replayX, replayY, 'VOLVER A JUGAR', {
            fontSize: isLandscape ? '16px' : '15px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        overlay.add([replayBg, replayText]);

        const cancelBg = this.add.rectangle(cancelX, cancelY, btnW, btnH, 0xaa2222)
            .setStrokeStyle(2, 0xffffff)
            .setInteractive({ useHandCursor: true });
        const cancelText = this.add.text(cancelX, cancelY, 'CANCELAR', {
            fontSize: isLandscape ? '16px' : '15px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        overlay.add([cancelBg, cancelText]);

        replayBg.on('pointerdown', () => this.restartMatch());
        cancelBg.on('pointerdown', () => this.goToMenu());

        this.endOverlay = overlay;
    }

    private restartMatch() {
        this.registry.remove(REGISTRY_KEY);
        this.scene.restart();
    }

    private goToMenu() {
        this.registry.remove(REGISTRY_KEY);
        this.scene.start('MenuScene');
    }

    // ---------- UI auxiliar ----------
    private updateTurnUI() {
        const names = ['Tu Turno', 'Bot 1', 'Bot 2', 'Bot 3'];
        this.turnText.setText(names[this.currentPlayerIndex]);
    }

    private canPlayerMove(playerIndex: number): boolean {
        if (this.boardTiles.length === 0) return true;
        const hand = this.players[playerIndex];
        for (const t of hand.tiles) {
            const { left, right } = this.canPlay(t);
            if (left || right) return true;
        }
        return false;
    }

    private botPlay() {
        if (this.isEnding) return;
        const idx = this.currentPlayerIndex;
        const botHand = this.players[idx];
        let played = false;
        for (const tile of [...botHand.tiles]) {
            if (this.boardTiles.length === 0) {
                this.placeTileOnBoard(tile, idx, 'center');
                played = true; break;
            }
            const { left, right } = this.canPlay(tile);
            if (left) { this.placeTileOnBoard(tile, idx, 'left'); played = true; break; }
            if (right) { this.placeTileOnBoard(tile, idx, 'right'); played = true; break; }
        }
        if (!played) {
            this.turnText.setText(`Bot ${idx} pasa.`);
            this.time.delayedCall(1500, () => this.registerPass());
        }
    }
}
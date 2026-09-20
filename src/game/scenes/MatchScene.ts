import { Scene } from 'phaser';
import { Tile, TILE_W, TILE_H } from '../objects/Tile';
import { PlayerHand } from '../objects/PlayerHand';

type Vec2 = { x: number; y: number };
type Dir = { dx: number; dy: number };
type GridPos = { gx: number; gy: number };
type Box = { gx: number; gy: number; gw: number; gh: number };

// Mesa: 60 x 20 celdas (apaisado) o 20 x 60 (vertical).
const TABLE_LONG = 60;
const TABLE_SHORT = 20;
// Ficha = 4 celdas de largo x 2 de ancho.
const LONG = 4;
const SHORT = 2;
const DEBUG_GRID = false;

/**
 * Sistema de coordenadas LOCAL de cada extremo (u, v):
 *   origen = head (vértice donde termina la hilera, sobre la línea central)
 *   u = a lo largo de dir  (u > 0 = hacia afuera, u < 0 = hacia la hilera)
 *   v = a lo largo de turn (v > 0 = hacia donde se doblará la serpiente)
 *   La hilera ocupa v en [-1, 1]; un doble ocupa v en [-2, 2].
 *
 * lastDouble: la última ficha de la hilera es un doble.
 * afterElbow: el codo ya se puso; la próxima ficha arranca la hilera de regreso.
 *             En ese caso head/dir/turn/lastDouble siguen siendo los del marco VIEJO.
 */
interface EndState {
    head: GridPos;
    dir: Dir;
    turn: Dir;
    lastDouble: boolean;
    afterElbow?: boolean;
}
interface Placement { box: Box; rotation: number; newEnd: EndState; }

export class MatchScene extends Scene {
    private players: PlayerHand[] = [];
    private deck: Tile[] = [];
    private currentPlayerIndex = 0;
    private boardTiles: Tile[] = [];
    private isProcessingTurn = false;
    private leftEndValue: number | null = null;
    private rightEndValue: number | null = null;

    // Grid
    private gridOrigin: Vec2 = { x: 0, y: 0 };
    private gridCols = 0;
    private gridRows = 0;
    private cell = 10;
    private tileScale = 1;
    private handScale = 1;
    private botScale = 0.6;
    private occupied = new Set<string>();

    private leftEnd: EndState  = { head: { gx: 0, gy: 0 }, dir: { dx: -1, dy: 0 }, turn: { dx: 0, dy: -1 }, lastDouble: false };
    private rightEnd: EndState = { head: { gx: 0, gy: 0 }, dir: { dx:  1, dy: 0 }, turn: { dx: 0, dy:  1 }, lastDouble: false };

    private isLandscape = false;
    private passStreak = 0;
    private choiceContainer?: Phaser.GameObjects.Container;
    private turnText!: Phaser.GameObjects.Text;
    private safeArea!: Phaser.Geom.Rectangle;
    private handZones = new Map<Tile, Phaser.GameObjects.Zone>();

    constructor() { super('MatchScene'); }

    init() {
    this.players = [];
    this.deck = [];
    this.currentPlayerIndex = 0;
    this.boardTiles = [];
    this.isProcessingTurn = false;
    this.leftEndValue = null;
    this.rightEndValue = null;
    this.occupied = new Set<string>();
    this.handZones = new Map();
    this.passStreak = 0;
    this.choiceContainer = undefined;
    this.leftEnd  = { head: { gx: 0, gy: 0 }, dir: { dx: -1, dy: 0 }, turn: { dx: 0, dy: -1 }, lastDouble: false };
    this.rightEnd = { head: { gx: 0, gy: 0 }, dir: { dx:  1, dy: 0 }, turn: { dx: 0, dy:  1 }, lastDouble: false };
}

    create() {
        this.generateDeck();
        this.dealTiles();

        const { width, height } = this.cameras.main;
        this.isLandscape = width > height;

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

        this.renderPlayerHand();
        this.renderBotHands();
        this.startGame();
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
                if (this.currentPlayerIndex === 0 && !this.isProcessingTurn)
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
            { x: s.x - off,           y: s.y + s.height / 2, rot:  Math.PI / 2 },
            { x: s.x + s.width / 2,   y: s.y - off,          rot: 0 },
            { x: s.right + off,       y: s.y + s.height / 2, rot: -Math.PI / 2 }
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

    // ---------- Rotaciones (el sprite en rotation=0 está en vertical) ----------
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

    // ---------- Cajas en la hilera ----------
    /** Ficha normal en línea: 4 de largo a lo largo de dir, centrada en la línea. */
    private alongBox(end: EndState): Box { return this.frameBox(end, 0, LONG, -1, 1); }

    /** Doble en línea: perpendicular a dir, centrado (4 de alto). */
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

    // ---------- Codo ----------
    /**
     * Ficha codo: vertical (a lo largo de turn), sobre las 2 columnas exteriores
     * de la última ficha (u en [-2, 0]).
     *  - Última ficha normal: pegada a su borde (v en [1, 5]).
     *  - Última ficha doble:  pegada al borde del doble (v en [2, 6]).
     */
    private elbowBox(end: EndState): Box {
        return end.lastDouble
            ? this.frameBox(end, -2, 0, 2, 6)
            : this.frameBox(end, -2, 0, 1, 5);
    }

    /**
     * Ficha que viene DESPUÉS del codo (arranca la hilera de regreso, en sentido contrario).
     *  - Última ficha normal ("cap"): la normal queda ENCIMA del codo (v 5..7, u -4..0);
     *    el doble va tumbado y centrado sobre el codo (u -3..1), o sea corrido 1 celda.
     *  - Última ficha doble ("side"): la normal queda AL LADO de la mitad lejana del codo
     *    (v 4..6, u -6..-2); el doble va tumbado y centrado debajo del codo (v 6..8, u -3..1).
     */
    private postGeometry(end: EndState, isDouble: boolean) {
        const side = end.lastDouble;
        let u0: number, u1: number, v0: number, v1: number, headU: number, headV: number;
        if (!side && !isDouble) { u0 = -4; u1 = 0;  v0 = 5; v1 = 7; headU = -4; headV = 6; }
        else if (!side && isDouble) { u0 = -3; u1 = 1;  v0 = 5; v1 = 7; headU = -3; headV = 6; }
        else if (side && !isDouble) { u0 = -6; u1 = -2; v0 = 4; v1 = 6; headU = -6; headV = 5; }
        else { u0 = -3; u1 = 1; v0 = 6; v1 = 8; headU = -3; headV = 7; }
        return {
            box: this.frameBox(end, u0, u1, v0, v1),
            newEnd: {
                head: this.framePoint(end, headU, headV),
                dir: this.reverse(end.dir),
                turn: { ...end.turn },
                lastDouble: false   // tanto la normal como el doble tumbado ocupan 2 de alto
            } as EndState
        };
    }

    private postBox(end: EndState, isDouble: boolean): Box { return this.postGeometry(end, isDouble).box; }

    /** ¿Habrá sitio para la ficha siguiente al codo, sea normal o doble? */
    private postFeasible(end: EndState): boolean {
        return this.boxFits(this.postBox(end, false)) && this.boxFits(this.postBox(end, true));
    }

    private straightFits(end: EndState): boolean {
        return this.boxFits(this.alongBox(end));
    }

    /** Después de esta ficha: ¿puede la próxima ir recta, o hacer codo con sitio para lo que sigue? */
    private canContinue(end: EndState): boolean {
        if (this.straightFits(end)) return true;
        return this.boxFits(this.elbowBox(end)) && this.postFeasible(end);
    }

    // ---------- Lógica de colocación ----------
    private tryComputePlacement(tile: Tile, end: EndState): Placement | null {
        const isDouble = tile.isDouble;

        // Ficha que va justo después del codo.
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

        // Se mira una ficha hacia adelante: si tras poner esta todavía hay continuación, seguir recto.
        if (natFits && this.canContinue(natural.newEnd)) return natural;
        // Si no, esta ficha es el codo (siempre que también quede sitio después del codo).
        if (elbFits && this.postFeasible(end)) return elbow;
        // Casos límite.
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
        const cx = Math.floor(this.gridCols / 2);   // 30 -> columnas 30-31 (base 1)
        const cy = Math.floor(this.gridRows / 2);   // 10 -> filas 9-12 (base 1) si es doble
        const isDouble = tile.isDouble;

        const mainDir: Dir = this.isLandscape ? { dx: 1, dy: 0 } : { dx: 0, dy: 1 };
        let box: Box;

        if (this.isLandscape) {
            box = isDouble
                ? { gx: cx - 1, gy: cy - 2, gw: SHORT, gh: LONG }
                : { gx: cx - 2, gy: cy - 1, gw: LONG,  gh: SHORT };
            this.rightEnd = { head: { gx: box.gx + box.gw, gy: cy }, dir: { dx: 1,  dy: 0 }, turn: { dx: 0, dy: 1 },  lastDouble: isDouble };
            this.leftEnd  = { head: { gx: box.gx,          gy: cy }, dir: { dx: -1, dy: 0 }, turn: { dx: 0, dy: -1 }, lastDouble: isDouble };
        } else {
            box = isDouble
                ? { gx: cx - 2, gy: cy - 1, gw: LONG,  gh: SHORT }
                : { gx: cx - 1, gy: cy - 2, gw: SHORT, gh: LONG };
            this.rightEnd = { head: { gx: cx, gy: box.gy + box.gh }, dir: { dx: 0, dy: 1 },  turn: { dx: -1, dy: 0 }, lastDouble: isDouble };
            this.leftEnd  = { head: { gx: cx, gy: box.gy },          dir: { dx: 0, dy: -1 }, turn: { dx: 1,  dy: 0 }, lastDouble: isDouble };
        }
        const rotation = isDouble ? this.anglePerpendicular(mainDir) : this.angleAlong(mainDir);

        this.leftEndValue  = tile.value1;
        this.rightEndValue = tile.value2;

        this.occupy(box);
        this.boardTiles.push(tile);
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

        const outer = (tile.value1 === connecting) ? tile.value2 : tile.value1;
        if (isRight) { this.rightEnd = placement.newEnd; this.rightEndValue = outer; }
        else         { this.leftEnd  = placement.newEnd; this.leftEndValue  = outer; }

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
        const mLeft  = tile.value1 === this.leftEndValue  || tile.value2 === this.leftEndValue;
        const mRight = tile.value1 === this.rightEndValue || tile.value2 === this.rightEndValue;
        const left  = mLeft  && this.tryComputePlacement(tile, this.leftEnd)  !== null;
        const right = mRight && this.tryComputePlacement(tile, this.rightEnd) !== null;
        return { left, right };
    }

    private async humanPlayTile(tile: Tile) {
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
        const leftText = this.add.text(-75, 15, `Izquierda\n(${this.leftEndValue})`,
            { fontSize: '13px', color: '#fff', align: 'center' }).setOrigin(0.5);
        const rightBtn = this.add.rectangle(75, 15, 120, 44, 0x2266cc).setInteractive({ useHandCursor: true });
        const rightText = this.add.text(75, 15, `Derecha\n(${this.rightEndValue})`,
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
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % 4;
        this.beginTurn();
    }

    private beginTurn() {
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

    private buildPipSummary(): string {
        const names = ['Tú', 'Bot 1', 'Bot 2', 'Bot 3'];
        return this.players.map((h, i) => {
            const sum = h.tiles.reduce((a, t) => a + t.value1 + t.value2, 0);
            return `${names[i]}: ${sum} pts`;
        }).join('   |   ');
    }

    private revealAllHands() {
        this.players.forEach(h => h.tiles.forEach(t => t.setFaceDown(false)));
    }

    private showRoundSummaryAndEnd(winnerIndex: number, headline: string) {
        this.revealAllHands();
        const { width, height } = this.cameras.main;
        const summary = this.buildPipSummary();
        this.turnText.setText(headline);
        const summaryText = this.add.text(width / 2, height / 2, summary, {
            fontSize: '20px', color: '#fff', backgroundColor: '#000',
            padding: { x: 16, y: 10 }, align: 'center'
        }).setOrigin(0.5).setDepth(200);
        this.time.delayedCall(3000, () => {
            summaryText.destroy();
            this.endGame(winnerIndex);
        });
    }

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
        const idx = this.currentPlayerIndex;
        const botHand = this.players[idx];
        let played = false;
        for (const tile of [...botHand.tiles]) {
            if (this.boardTiles.length === 0) {
                this.placeTileOnBoard(tile, idx, 'center');
                played = true; break;
            }
            const { left, right } = this.canPlay(tile);
            if (left)  { this.placeTileOnBoard(tile, idx, 'left');  played = true; break; }
            if (right) { this.placeTileOnBoard(tile, idx, 'right'); played = true; break; }
        }
        if (!played) {
            this.turnText.setText(`Bot ${idx} pasa.`);
            this.time.delayedCall(1500, () => this.registerPass());
        }
    }

    private endGame(winnerIndex: number) {
        this.scene.start('GameOverScene', { score: winnerIndex === 0 ? 100 : 0 });
    }
}
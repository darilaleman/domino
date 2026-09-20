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
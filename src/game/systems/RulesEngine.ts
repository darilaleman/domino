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
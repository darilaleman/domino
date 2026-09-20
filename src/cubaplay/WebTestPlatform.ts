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
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
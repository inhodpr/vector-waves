export interface ITimeSource {
    getCurrentTimeMs(): number;
    onTimeUpdate(callback: (timeMs: number) => void): void;
    removeTimeUpdateListener(callback: (timeMs: number) => void): void;
}

export class Ticker {
    private isRunning: boolean = false;
    private animationFrameId: number | null = null;
    private callbacks: ((timestamp: number) => void)[] = [];

    public start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.tick(performance.now());
    }

    public stop() {
        this.isRunning = false;
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    public addCallback(cb: (timestamp: number) => void) {
        this.callbacks.push(cb);
    }

    public removeCallback(cb: (timestamp: number) => void) {
        this.callbacks = this.callbacks.filter(c => c !== cb);
    }

    private tick(timestamp: number) {
        if (!this.isRunning) return;

        for (const cb of this.callbacks) {
            cb(timestamp);
        }

        this.animationFrameId = requestAnimationFrame((t) => this.tick(t));
    }
}

import { ITimeSource } from './ITimeSource';

export class AudioPlaybackAdapter implements ITimeSource {
    private audioContext: AudioContext;
    private audioBuffer: AudioBuffer | null = null;
    private sourceNode: AudioBufferSourceNode | null = null;

    private listeners: ((timeMs: number) => void)[] = [];

    // Playback state tracking
    private isPlaying: boolean = false;
    private playbackStartTime: number = 0; // The context.currentTime when play() was last called
    private pausedAtTimeMs: number = 0;    // The absolute track position we were at when paused

    private updateIntervalId: number | null = null;

    constructor() {
        this.audioContext = new AudioContext();
    }

    public async loadTrackFromBuffer(arrayBuffer: ArrayBuffer) {
        // Must decode on a fresh buffer
        this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        this.pausedAtTimeMs = 0;
        this.broadcastTime(0);
    }

    public getPcmData(): Float32Array {
        return this.audioBuffer ? this.audioBuffer.getChannelData(0) : new Float32Array(0);
    }

    public play() {
        if (this.isPlaying || !this.audioBuffer) return;

        // Resume context if suspended (browser auto-play policies)
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        // Must create a new source node every time we play in Web Audio API
        this.sourceNode = this.audioContext.createBufferSource();
        this.sourceNode.buffer = this.audioBuffer;
        this.sourceNode.connect(this.audioContext.destination);

        const startOffsetSeconds = this.pausedAtTimeMs / 1000;
        this.sourceNode.start(0, startOffsetSeconds);

        this.isPlaying = true;
        this.playbackStartTime = this.audioContext.currentTime;

        // Handle end of track naturally
        this.sourceNode.onended = () => {
            // onended fires even when we manually .stop() it during pause
            if (this.isPlaying) {
                this.pause();
                this.seek(0); // auto-rewind for MVP
            }
        };

        this.startTimeBroadcaster();
    }

    public isCurrentlyPlaying(): boolean {
        return this.isPlaying;
    }

    public pause() {
        if (!this.isPlaying || !this.sourceNode) return;

        this.sourceNode.stop();
        this.sourceNode.disconnect();
        this.sourceNode = null;

        // Save exactly where we stopped so we can resume
        const playedTimeSeconds = this.audioContext.currentTime - this.playbackStartTime;
        this.pausedAtTimeMs += (playedTimeSeconds * 1000);

        this.isPlaying = false;
        this.stopTimeBroadcaster();
        this.broadcastTime(this.pausedAtTimeMs);
    }

    public seek(timeMs: number) {
        if (this.isPlaying) {
            this.pause();
            this.pausedAtTimeMs = timeMs;
            this.play();
        } else {
            this.pausedAtTimeMs = timeMs;
            this.broadcastTime(timeMs);
        }
    }

    public getCurrentTimeMs(): number {
        if (!this.isPlaying) {
            return this.pausedAtTimeMs;
        }

        const playedTimeSeconds = this.audioContext.currentTime - this.playbackStartTime;
        return this.pausedAtTimeMs + (playedTimeSeconds * 1000);
    }

    // --- ITimeSource Implementations ---

    public onTimeUpdate(callback: (timeMs: number) => void): void {
        this.listeners.push(callback);
    }

    public removeTimeUpdateListener(callback: (timeMs: number) => void): void {
        this.listeners = this.listeners.filter(cb => cb !== callback);
    }

    private broadcastTime(timeMs: number) {
        this.listeners.forEach(cb => cb(timeMs));
    }

    // Rather than letting React poll requestAnimationFrame separately, 
    // the Adapter emits a generic clock tick out to subscribers (Timeline UI).
    private startTimeBroadcaster() {
        if (this.updateIntervalId !== null) return;
        this.updateIntervalId = window.setInterval(() => {
            this.broadcastTime(this.getCurrentTimeMs());
        }, 16); // ~60fps
    }

    private stopTimeBroadcaster() {
        if (this.updateIntervalId !== null) {
            window.clearInterval(this.updateIntervalId);
            this.updateIntervalId = null;
        }
    }
}

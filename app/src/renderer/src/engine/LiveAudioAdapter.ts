import { ITimeSource } from './ITimeSource';

export class LiveAudioAdapter implements ITimeSource {
    private audioCtx: AudioContext | null = null;
    private sourceNode: MediaStreamAudioSourceNode | null = null;
    private analyzerNode: AnalyserNode | null = null;
    private startTime: number = 0;
    private listeners: ((timeMs: number) => void)[] = [];
    private animationFrameId: number | null = null;

    constructor() {
        this.startTime = Date.now();
    }

    public async start(deviceId?: string): Promise<boolean> {
        try {
            if (!this.audioCtx) {
                this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            }

            const constraints: MediaStreamConstraints = {
                audio: deviceId ? { deviceId: { exact: deviceId } } : true,
                video: false
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            this.sourceNode = this.audioCtx.createMediaStreamSource(stream);
            this.analyzerNode = this.audioCtx.createAnalyser();
            this.analyzerNode.fftSize = 256;
            
            this.sourceNode.connect(this.analyzerNode);

            this.startTime = Date.now();
            this.startTicking();
            
            return true;
        } catch (err) {
            console.error('Error starting live audio:', err);
            return false;
        }
    }

    public stop() {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        if (this.audioCtx) {
            this.audioCtx.close();
            this.audioCtx = null;
        }
    }

    private startTicking() {
        const tick = () => {
            const timeMs = this.getCurrentTimeMs();
            this.listeners.forEach(cb => cb(timeMs));
            this.animationFrameId = requestAnimationFrame(tick);
        };
        this.animationFrameId = requestAnimationFrame(tick);
    }

    public getCurrentTimeMs(): number {
        return Date.now() - this.startTime;
    }

    public onTimeUpdate(callback: (timeMs: number) => void): void {
        this.listeners.push(callback);
    }

    public removeTimeUpdateListener(callback: (timeMs: number) => void): void {
        this.listeners = this.listeners.filter(cb => cb !== callback);
    }

    public getFrequencyData(): Uint8Array {
        if (!this.analyzerNode) return new Uint8Array(0);
        const dataArray = new Uint8Array(this.analyzerNode.frequencyBinCount);
        this.analyzerNode.getByteFrequencyData(dataArray);
        return dataArray;
    }

    public getVolume(): number {
        const data = this.getFrequencyData();
        if (data.length === 0) return 0;
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data[i];
        }
        return sum / data.length;
    }

    public getBandVolume(low: number, high: number): number {
        const data = this.getFrequencyData();
        if (data.length === 0) return 0;

        // Map frequency bands (simple approximation)
        // fftSize=256, frequencyBinCount=128
        // index / 128 * (sampleRate/2)
        const sampleRate = this.audioCtx?.sampleRate || 44100;
        const binSize = (sampleRate / 2) / data.length;

        const startIndex = Math.floor(low / binSize);
        const endIndex = Math.min(data.length - 1, Math.floor(high / binSize));

        if (startIndex >= data.length) return 0;

        let sum = 0;
        let count = 0;
        for (let i = startIndex; i <= endIndex; i++) {
            sum += data[i];
            count++;
        }
        return count > 0 ? sum / count : 0;
    }
}

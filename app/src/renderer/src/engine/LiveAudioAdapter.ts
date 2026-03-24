import { ITimeSource } from './ITimeSource';
import processorUrl from './AudioWorkletProcessor?url';

export interface TriggerEvent {
    slotId: string;
    intensity: number;
    timestampMs: number;
}

export class LiveAudioAdapter implements ITimeSource {
    private audioCtx: AudioContext | null = null;
    private sourceNode: MediaStreamAudioSourceNode | null = null;
    private analyzerNode: AnalyserNode | null = null;
    private workletNode: AudioWorkletNode | null = null;
    private startTime: number = 0;
    private listeners: ((timeMs: number) => void)[] = [];
    private peakListeners: ((event: TriggerEvent) => void)[] = [];
    private animationFrameId: number | null = null;
    private sab: SharedArrayBuffer | null = null;
    private sabView: Int32Array | null = null;
    private lastReadIdx = 0;
    private slotIds: string[] = [];
    private messagePort: MessagePort | null = null;

    constructor() {
        this.startTime = Date.now();
    }

    public async start(deviceId?: string): Promise<boolean> {
        try {
            if (!this.audioCtx) {
                this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
                    latencyHint: 'interactive'
                });
            }

            const constraints: MediaStreamConstraints = {
                audio: deviceId ? { deviceId: { exact: deviceId } } : true,
                video: false
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            this.sourceNode = this.audioCtx.createMediaStreamSource(stream);
            
            // Legacy analyzer (optional, kept for visual volume if needed)
            this.analyzerNode = this.audioCtx.createAnalyser();
            this.analyzerNode.fftSize = 256;
            this.sourceNode.connect(this.analyzerNode);

            // AudioWorklet setup
            await this.audioCtx.audioWorklet.addModule(processorUrl);
            this.workletNode = new AudioWorkletNode(this.audioCtx, 'peak-detection-processor');
            
            // Setup SharedArrayBuffer (if available)
            if (typeof SharedArrayBuffer !== 'undefined') {
                this.sab = new SharedArrayBuffer(2 * 4 + 100 * 4 * 4); // 2 header ints + 100 events * 4 ints
                this.sabView = new Int32Array(this.sab);
                this.sabView[0] = 0; // write pointer
                this.sabView[1] = 0; // read pointer
                
                this.workletNode.port.postMessage({
                    type: 'SET_BUFFER',
                    data: { buffer: this.sab }
                });
            } else {
                console.warn('SharedArrayBuffer not available. Falling back to postMessage (higher overhead).');
                this.workletNode.port.onmessage = (e) => {
                    if (e.data.type === 'PEAK_FALLBACK') {
                        const { slotIndex, intensity, timestamp } = e.data;
                        const slotId = this.slotIds[slotIndex];
                        if (slotId) {
                            this.peakListeners.forEach(cb => cb({ slotId, intensity, timestampMs: timestamp }));
                            if (this.messagePort) {
                                this.messagePort.postMessage({ type: 'DETACHED_PLUCK', payload: { slotId, intensity, timestampMs: timestamp } });
                            }
                        }
                    }
                };
            }

            this.sourceNode.connect(this.workletNode);

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
        this.workletNode = null;
        this.sab = null;
        this.sabView = null;
    }

    private startTicking() {
        const tick = () => {
            const timeMs = this.getCurrentTimeMs();
            this.listeners.forEach(cb => cb(timeMs));
            
            // Poll for peaks in SAB
            this.pollSAB();

            this.animationFrameId = requestAnimationFrame(tick);
        };
        this.animationFrameId = requestAnimationFrame(tick);
    }

    private pollSAB() {
        if (!this.sabView) return;

        const writeIdx = Atomics.load(this.sabView, 0);
        const bufferSize = (this.sabView.length - 2) / 4;

        while (this.lastReadIdx !== writeIdx) {
            const base = 2 + this.lastReadIdx * 4;
            const slotIndex = this.sabView[base];
            const intensity = this.sabView[base + 1] / 1000;
            const tsLow = this.sabView[base + 2];
            const tsHigh = this.sabView[base + 3];
            
            // Reconstruct 64-bit timestamp (roughly, since we lose some prec in Int32 conversion but fine for Ms)
            const timestampMs = (tsHigh * 0x100000000) + (tsLow >>> 0);
            
            const slotId = this.slotIds[slotIndex];
            if (slotId) {
                this.peakListeners.forEach(cb => cb({ slotId, intensity, timestampMs }));
                if (this.messagePort) {
                    this.messagePort.postMessage({ type: 'DETACHED_PLUCK', payload: { slotId, intensity, timestampMs } });
                }
            }

            this.lastReadIdx = (this.lastReadIdx + 1) % bufferSize;
            Atomics.store(this.sabView, 1, this.lastReadIdx);
        }
    }

    public setMessagePort(port: MessagePort | null) {
        this.messagePort = port;
    }

    public updateTriggers(configs: Array<{ id: string, band: string, threshold: number, refractory: number }>) {
        if (!this.workletNode || !this.audioCtx) return;

        this.slotIds = configs.map(c => c.id);
        const sampleRate = this.audioCtx.sampleRate;

        const slots = configs.map(c => {
            const coeffs = this.getBiquadCoefficients(c.band, sampleRate);
            return {
                id: c.id,
                band: c.band,
                threshold: c.threshold / 255, // Normalize 0-255 to 0-1
                refractoryPeriodMs: c.refractory,
                ...coeffs
            };
        });

        this.workletNode.port.postMessage({
            type: 'UPDATE_CONFIG',
            data: { slots }
        });
    }

    private getBiquadCoefficients(band: string, fs: number) {
        // Default (Full)
        let b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
        const q = 1.0;

        if (band === 'Bass') {
            // Lowpass at 250Hz
            const f0 = 250;
            const w0 = 2 * Math.PI * f0 / fs;
            const alpha = Math.sin(w0) / (2 * q);
            const cosW0 = Math.cos(w0);
            const a0 = 1 + alpha;
            b0 = (1 - cosW0) / 2 / a0;
            b1 = (1 - cosW0) / a0;
            b2 = (1 - cosW0) / 2 / a0;
            a1 = -2 * cosW0 / a0;
            a2 = (1 - alpha) / a0;
        } else if (band === 'Mid') {
            // Bandpass at ~2000Hz (centered in 250-4000)
            const f0 = 1000; // Logarithmic center is closer to 1000
            const w0 = 2 * Math.PI * f0 / fs;
            const alpha = Math.sin(w0) / (2 * 0.5); // Wider Q for mids
            const cosW0 = Math.cos(w0);
            const a0 = 1 + alpha;
            b0 = alpha / a0;
            b1 = 0;
            b2 = -alpha / a0;
            a1 = -2 * cosW0 / a0;
            a2 = (1 - alpha) / a0;
        } else if (band === 'Treble') {
            // Highpass at 4000Hz
            const f0 = 4000;
            const w0 = 2 * Math.PI * f0 / fs;
            const alpha = Math.sin(w0) / (2 * q);
            const cosW0 = Math.cos(w0);
            const a0 = 1 + alpha;
            b0 = (1 + cosW0) / 2 / a0;
            b1 = -(1 + cosW0) / a0;
            b2 = (1 + cosW0) / 2 / a0;
            a1 = -2 * cosW0 / a0;
            a2 = (1 - alpha) / a0;
        }

        return { b0, b1, b2, a1, a2 };
    }

    public getCurrentTimeMs(): number {
        if (!this.audioCtx) return Date.now() - this.startTime;
        return (this.audioCtx.currentTime * 1000); // More accurate for audio sync
    }

    public onTimeUpdate(callback: (timeMs: number) => void): void {
        this.listeners.push(callback);
    }

    public removeTimeUpdateListener(callback: (timeMs: number) => void): void {
        this.listeners = this.listeners.filter(cb => cb !== callback);
    }

    public onPeakDetected(callback: (event: TriggerEvent) => void) {
        this.peakListeners.push(callback);
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
        // Kept for backward compatibility in UI volume bar
        const data = this.getFrequencyData();
        if (data.length === 0) return 0;
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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LiveAudioAdapter } from './LiveAudioAdapter';

// Mock the processor URL (Vite ?url import)
vi.mock('./AudioWorkletProcessor?url', () => ({
    default: 'mock-processor-url'
}));

describe('LiveAudioAdapter', () => {
    let adapter: LiveAudioAdapter;

    beforeEach(() => {
        vi.useFakeTimers();
        
        // Mock navigator.mediaDevices
        const mockStream = {
            getTracks: vi.fn().mockReturnValue([{ stop: vi.fn() }])
        };
        vi.stubGlobal('navigator', {
            mediaDevices: {
                getUserMedia: vi.fn().mockResolvedValue(mockStream),
                enumerateDevices: vi.fn().mockResolvedValue([
                    { kind: 'audioinput', deviceId: 'default', label: 'Default Mic' }
                ])
            }
        });

        // Mock AudioWorkletNode
        class MockAudioWorkletNode {
            port = {
                postMessage: vi.fn(),
                onmessage: null as any
            };
            connect = vi.fn();
            disconnect = vi.fn();
        }
        vi.stubGlobal('AudioWorkletNode', MockAudioWorkletNode);

        adapter = new LiveAudioAdapter();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('should initialize and start with default device', async () => {
        const success = await adapter.start();
        expect(success).toBe(true);
        expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
            audio: true,
            video: false
        });
    });

    it('should start with specific deviceId', async () => {
        const success = await adapter.start('mic-123');
        expect(success).toBe(true);
        expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
            audio: { deviceId: { exact: 'mic-123' } },
            video: false
        });
    });

    it('should handle start failure', async () => {
        vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(new Error('Permission denied'));
        const success = await adapter.start();
        expect(success).toBe(false);
    });

    it('should stop and clean up', async () => {
        await adapter.start();
        adapter.stop();
    });

    it('should update triggers and send to worklet', async () => {
        await adapter.start();
        adapter.updateTriggers([
            { id: 'trigger-1', band: 'Bass', threshold: 128, refractory: 100 }
        ]);
        
        const worklet = (adapter as any).workletNode;
        expect(worklet.port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'UPDATE_CONFIG'
        }));
    });

    it('should handle peak detection fallback (postMessage)', async () => {
        vi.stubGlobal('SharedArrayBuffer', undefined);
        
        await adapter.start();
        const worklet = (adapter as any).workletNode;
        const spy = vi.fn();
        adapter.onPeakDetected(spy);
        
        (adapter as any).slotIds = ['id-0'];
        
        expect(worklet.port.onmessage).toBeDefined();
        worklet.port.onmessage({
            data: { type: 'PEAK_FALLBACK', slotIndex: 0, intensity: 0.8, timestamp: 123456 }
        });
        
        expect(spy).toHaveBeenCalledWith({
            slotId: 'id-0',
            intensity: 0.8,
            timestampMs: 123456
        });
    });

    it('should broadcast time during live input', async () => {
        await adapter.start();
        const spy = vi.fn();
        adapter.onTimeUpdate(spy);
        
        vi.advanceTimersByTime(16);
        expect(spy).toHaveBeenCalledWith(expect.any(Number));
    });

    it('should calculate frequency and volume', async () => {
        await adapter.start();
        const analyzer = (adapter as any).analyzerNode;
        analyzer.frequencyBinCount = 4;
        analyzer.getByteFrequencyData.mockImplementation((arr: Uint8Array) => {
            arr.set([100, 200, 100, 0]);
        });

        const freq = adapter.getFrequencyData();
        expect(freq).toEqual(new Uint8Array([100, 200, 100, 0]));

        const vol = adapter.getVolume();
        expect(vol).toBe(100);

        const bandVol = adapter.getBandVolume(0, 1000);
        expect(bandVol).toBeGreaterThan(0);
    });

    it('should poll SAB and broadcast peaks', async () => {
        class MockSAB {}
        vi.stubGlobal('SharedArrayBuffer', MockSAB);
        
        const mockSabView = new Array(10).fill(0);
        class MockInt32Array {
            constructor() { return mockSabView as any; }
        }
        vi.stubGlobal('Int32Array', MockInt32Array);
        
        const originalAtomics = global.Atomics;
        global.Atomics = {
            ...originalAtomics,
            load: vi.fn((view, idx) => view[idx]),
            store: vi.fn((view, idx, val) => { view[idx] = val; })
        } as any;

        mockSabView[0] = 0; // writeIdx
        mockSabView[1] = 0; // readIdx

        await adapter.start();
        const spy = vi.fn();
        adapter.onPeakDetected(spy);
        (adapter as any).slotIds = ['id-0'];

        mockSabView[2] = 0; // slot 0
        mockSabView[3] = 800; // 0.8 intensity
        mockSabView[4] = 123456; // timestamp low
        mockSabView[5] = 0; // timestamp high
        mockSabView[0] = 1; // writeIdx = 1

        (adapter as any).pollSAB();

        expect(spy).toHaveBeenCalledWith({
            slotId: 'id-0',
            intensity: 0.8,
            timestampMs: 123456
        });

        global.Atomics = originalAtomics;
    });

    it('should calculate coefficients for Mid and Treble bands', async () => {
        await adapter.start();
        adapter.updateTriggers([
            { id: 'm', band: 'Mid', threshold: 100, refractory: 100 },
            { id: 't', band: 'Treble', threshold: 100, refractory: 100 }
        ]);
        const worklet = (adapter as any).workletNode;
        expect(worklet.port.postMessage).toHaveBeenCalled();
    });

    it('should send messages to messagePort if set', async () => {
        const mockPort = { postMessage: vi.fn() };
        adapter.setMessagePort(mockPort as any);
        
        // Trigger peak detection fallback
        vi.stubGlobal('SharedArrayBuffer', undefined);
        await adapter.start();
        const worklet = (adapter as any).workletNode;
        (adapter as any).slotIds = ['id-0'];
        worklet.port.onmessage({
            data: { type: 'PEAK_FALLBACK', slotIndex: 0, intensity: 0.5, timestamp: 999 }
        });
        
        expect(mockPort.postMessage).toHaveBeenCalled();
    });

    it('should remove time update listener', () => {
        const spy = vi.fn();
        adapter.onTimeUpdate(spy);
        adapter.removeTimeUpdateListener(spy);
        (adapter as any).listeners.forEach(cb => cb(100));
        expect(spy).not.toHaveBeenCalled();
    });
});

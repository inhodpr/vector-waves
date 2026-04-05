import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to ensure these globals exist before the module is imported
vi.hoisted(() => {
  (global as any).AudioWorkletProcessor = class {
    port = {
      onmessage: null as any,
      postMessage: vi.fn()
    };
  };
  (global as any).registerProcessor = vi.fn();
  (global as any).currentTime = 0;
  (global as any).sampleRate = 44100;
  (global as any).Atomics = {
    load: (view: any, idx: number) => view[idx],
    store: (view: any, idx: number, val: number) => { view[idx] = val; }
  };
});

// Now import the file
import './AudioWorkletProcessor';

const PeakDetectionProcessor = (global as any).registerProcessor.mock.calls[0][1];

describe('AudioWorkletProcessor', () => {
    let processor: any;

    beforeEach(() => {
        processor = new PeakDetectionProcessor();
        (global as any).currentTime = 0;
        vi.clearAllMocks();
    });

    it('should handle UPDATE_CONFIG message', () => {
        const slots = [
            { id: '1', band: 'Bass', threshold: 0.5, refractoryPeriodMs: 100, b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 }
        ];
        processor.port.onmessage({ data: { type: 'UPDATE_CONFIG', data: { slots } } });
        
        expect(processor.slots.length).toBe(1);
        expect(processor.filterStates.length).toBe(1);
    });

    it('should detect peaks and use fallback if no SAB', () => {
        const slots = [
            { id: '1', band: 'Full', threshold: 0.5, refractoryPeriodMs: 100 }
        ];
        processor.port.onmessage({ data: { type: 'UPDATE_CONFIG', data: { slots } } });
        
        // Use a timestamp > refractoryPeriodMs
        (global as any).currentTime = 0.2; 
        const input = [[new Float32Array(128).fill(0.8)]];
        processor.process(input);
        
        expect(processor.port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'PEAK_FALLBACK',
            intensity: expect.closeTo(0.8)
        }));
    });

    it('should detect peaks and use SAB if available', () => {
        const buffer = new SharedArrayBuffer(1024);
        const sabView = new Int32Array(buffer);
        processor.port.onmessage({ data: { type: 'SET_BUFFER', data: { buffer } } });

        const slots = [
            { id: '1', band: 'Full', threshold: 0.5, refractoryPeriodMs: 100 }
        ];
        processor.port.onmessage({ data: { type: 'UPDATE_CONFIG', data: { slots } } });
        
        (global as any).currentTime = 0.2;
        const input = [[new Float32Array(128).fill(0.9)]];
        processor.process(input);
        
        expect(sabView[0]).toBe(1); // writeIdx increased
        expect(sabView[2]).toBe(0); // slotIndex
        expect(sabView[3]).toBeGreaterThanOrEqual(899); // 0.9 * 1000 floor might be 899
    });

    it('should respect refractory period', () => {
        const slots = [
            { id: '1', band: 'Full', threshold: 0.5, refractoryPeriodMs: 100 }
        ];
        processor.port.onmessage({ data: { type: 'UPDATE_CONFIG', data: { slots } } });
        
        const input = [[new Float32Array(128).fill(0.8)]];
        
        // First trigger
        (global as any).currentTime = 0.2;
        processor.process(input);
        expect(processor.port.postMessage).toHaveBeenCalledTimes(1);
        
        // Second trigger (too soon)
        (global as any).currentTime = 0.25; // 250ms - 200ms = 50ms < 100ms
        processor.process(input);
        expect(processor.port.postMessage).toHaveBeenCalledTimes(1);
        
        // Third trigger (after refractory)
        (global as any).currentTime = 0.35; // 350ms - 200ms = 150ms > 100ms
        processor.process(input);
        expect(processor.port.postMessage).toHaveBeenCalledTimes(2);
    });

    it('should apply biquad filter for Bass band', () => {
        const slots = [
            { 
                id: '1', 
                band: 'Bass', 
                threshold: 0.1, 
                refractoryPeriodMs: 0,
                // Simple pass-through coefficients for testing the logic flow
                b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 
            }
        ];
        processor.port.onmessage({ data: { type: 'UPDATE_CONFIG', data: { slots } } });
        
        const input = [[new Float32Array(128).fill(0.2)]];
        (global as any).currentTime = 0.5;
        processor.process(input);
        
        expect(processor.port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'PEAK_FALLBACK',
            intensity: expect.closeTo(0.2)
        }));
    });
});

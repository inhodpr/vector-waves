import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LiveAudioAdapter } from './LiveAudioAdapter';

// Mock AudioContext and related nodes
class MockAudioContext {
  sampleRate = 44100;
  currentTime = 0;
  audioWorklet = {
    addModule: vi.fn().mockResolvedValue(undefined)
  };
  createMediaStreamSource = vi.fn().mockReturnValue({
    connect: vi.fn()
  });
  createAnalyser = vi.fn().mockReturnValue({
    fftSize: 2048,
    connect: vi.fn(),
    frequencyBinCount: 1024,
    getByteFrequencyData: vi.fn()
  });
  close = vi.fn().mockResolvedValue(undefined);
}

class MockAudioWorkletNode {
  port = {
    postMessage: vi.fn(),
    onmessage: null
  };
  connect = vi.fn();
}

vi.stubGlobal('AudioContext', MockAudioContext);
vi.stubGlobal('AudioWorkletNode', MockAudioWorkletNode);
vi.stubGlobal('navigator', {
  mediaDevices: {
    getUserMedia: vi.fn().mockResolvedValue({})
  }
});

// Mock the ?url import
vi.mock('./AudioWorkletProcessor?url', () => ({
  default: 'mock-url'
}));

describe('LiveAudioAdapter', () => {
  let adapter: LiveAudioAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new LiveAudioAdapter();
  });

  it('should calculate correct coefficients for Bass band (Lowpass)', () => {
    // We can't easily test the exact numbers without re-implementing the math,
    // but we can verify it doesn't return identity (1, 0, 0, 0, 0)
    const configs = [{ id: '1', band: 'Bass', threshold: 100, refractory: 50 }];
    
    // We need to trigger the private method or start the adapter to see the message
    // Manually mocking the state needed for updateTriggers
    (adapter as any).audioCtx = new MockAudioContext();
    (adapter as any).workletNode = new MockAudioWorkletNode();
    
    adapter.updateTriggers(configs);
    
    const message = (adapter as any).workletNode.port.postMessage.mock.calls[0][0];
    expect(message.type).toBe('UPDATE_CONFIG');
    const slot = message.data.slots[0];
    
    expect(slot.band).toBe('Bass');
    expect(slot.b0).not.toBe(1); // Should be filtered
    expect(slot.a1).not.toBe(0);
  });

  it('should use Full band (Identity) when specified', () => {
    const configs = [{ id: '2', band: 'Full', threshold: 100, refractory: 50 }];
    (adapter as any).audioCtx = new MockAudioContext();
    (adapter as any).workletNode = new MockAudioWorkletNode();
    
    adapter.updateTriggers(configs);
    
    const slot = (adapter as any).workletNode.port.postMessage.mock.calls[0][0].data.slots[0];
    expect(slot.b0).toBe(1);
    expect(slot.b1).toBe(0);
    expect(slot.a1).toBe(0);
  });

  it('should initialize SharedArrayBuffer if available', async () => {
    // Ensure SharedArrayBuffer is defined in the global scope for this test
    vi.stubGlobal('SharedArrayBuffer', class {
        constructor(size: number) { return new ArrayBuffer(size); }
    });

    await adapter.start();
    expect((adapter as any).sab).toBeDefined();
    expect((adapter as any).workletNode.port.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'SET_BUFFER' })
    );
  });
});

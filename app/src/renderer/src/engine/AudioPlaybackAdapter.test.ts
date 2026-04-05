import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioPlaybackAdapter } from './AudioPlaybackAdapter';

describe('AudioPlaybackAdapter', () => {
    let adapter: AudioPlaybackAdapter;

    beforeEach(() => {
        vi.useFakeTimers();
        adapter = new AudioPlaybackAdapter();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should initialize with default state', () => {
        expect(adapter.isCurrentlyPlaying()).toBe(false);
        expect(adapter.getCurrentTimeMs()).toBe(0);
        expect(adapter.getDurationMs()).toBe(0);
    });

    it('should load track from buffer', async () => {
        const buffer = new ArrayBuffer(8);
        const mockAudioBuffer = {
            duration: 10,
            getChannelData: vi.fn().mockReturnValue(new Float32Array(100))
        };
        
        // Accessing private audioContext for mocking
        const ctx = (adapter as any).audioContext;
        ctx.decodeAudioData.mockResolvedValue(mockAudioBuffer);

        await adapter.loadTrackFromBuffer(buffer);
        
        expect(adapter.getDurationMs()).toBe(10000);
        expect(adapter.getPcmData().length).toBe(100);
    });

    it('should play and pause', async () => {
        // Setup buffer
        const mockAudioBuffer = { duration: 10 };
        (adapter as any).audioBuffer = mockAudioBuffer;

        adapter.play();
        expect(adapter.isCurrentlyPlaying()).toBe(true);

        // Advance time in AudioContext
        const ctx = (adapter as any).audioContext;
        ctx.currentTime = 2; // 2 seconds passed

        expect(adapter.getCurrentTimeMs()).toBe(2000);

        adapter.pause();
        expect(adapter.isCurrentlyPlaying()).toBe(false);
        expect(adapter.getCurrentTimeMs()).toBe(2000);
    });

    it('should seek while paused', () => {
        adapter.seek(5000);
        expect(adapter.getCurrentTimeMs()).toBe(5000);
    });

    it('should seek while playing (restarts playback)', () => {
        (adapter as any).audioBuffer = { duration: 10 };
        adapter.play();
        
        const spyPlay = vi.spyOn(adapter, 'play');
        const spyPause = vi.spyOn(adapter, 'pause');
        
        adapter.seek(3000);
        
        expect(spyPause).toHaveBeenCalled();
        expect(spyPlay).toHaveBeenCalled();
        expect(adapter.getCurrentTimeMs()).toBe(3000);
    });

    it('should broadcast time during playback', () => {
        (adapter as any).audioBuffer = { duration: 10 };
        const spy = vi.fn();
        adapter.onTimeUpdate(spy);
        
        adapter.play();
        
        vi.advanceTimersByTime(32); // 2 intervals of 16ms
        
        expect(spy).toHaveBeenCalled();
    });

    it('should handle onended event', () => {
        (adapter as any).audioBuffer = { duration: 10 };
        adapter.play();
        
        const sourceNode = (adapter as any).sourceNode;
        expect(sourceNode).toBeDefined();
        
        const spyPause = vi.spyOn(adapter, 'pause');
        const spySeek = vi.spyOn(adapter, 'seek');
        
        sourceNode.onended();
        
        expect(spyPause).toHaveBeenCalled();
        expect(spySeek).toHaveBeenCalledWith(0);
    });

    it('should remove time update listeners', () => {
        const spy = vi.fn();
        adapter.onTimeUpdate(spy);
        adapter.removeTimeUpdateListener(spy);
        
        (adapter as any).broadcastTime(100);
        expect(spy).not.toHaveBeenCalled();
    });
});

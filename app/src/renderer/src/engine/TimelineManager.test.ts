import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TimelineManager } from './TimelineManager';
import { AudioPlaybackAdapter } from './AudioPlaybackAdapter';
import { useAppStore } from '../store/useAppStore';

vi.mock('../store/useAppStore', () => ({
    useAppStore: {
        getState: vi.fn(() => ({
            addAudioTrack: vi.fn()
        }))
    }
}));

describe('TimelineManager', () => {
    let mockAdapter: any;
    let timelineManager: TimelineManager;

    beforeEach(() => {
        vi.clearAllMocks();
        mockAdapter = {
            loadTrackFromBuffer: vi.fn().mockResolvedValue(undefined),
            play: vi.fn(),
            pause: vi.fn(),
            isCurrentlyPlaying: vi.fn(),
            seek: vi.fn(),
            getPcmData: vi.fn(),
            onTimeUpdate: vi.fn(),
            removeTimeUpdateListener: vi.fn(),
            getCurrentTimeMs: vi.fn()
        };
        timelineManager = new TimelineManager(mockAdapter as unknown as AudioPlaybackAdapter);
    });

    it('should convert an Electron IPC Node Buffer (Uint8Array) into an ES6 ArrayBuffer before passing to AudioContext', async () => {
        // Electron IPC structured cloning converts Node Buffers into standard Uint8Arrays in the renderer.
        const ipcBufferData = new Uint8Array([255, 0, 128]);

        const originalPath = '/dummy/path/song.mp3';

        await timelineManager.loadSelectedTrack(originalPath, ipcBufferData);

        // Verify the adapter received an actual ArrayBuffer, not the Node object
        expect(mockAdapter.loadTrackFromBuffer).toHaveBeenCalledTimes(1);
        const passedBuffer = mockAdapter.loadTrackFromBuffer.mock.calls[0][0];

        // We must ensure the adapter gets a pure ES6 ArrayBuffer (what AudioContext.decodeAudioData strictly requires), 
        // not a Uint8Array view which will cause silent failures in the Web Audio API.
        expect(passedBuffer.constructor.name).toBe('ArrayBuffer');
        expect(passedBuffer.byteLength).toBe(3);

        // Verify contents
        const view = new Uint8Array(passedBuffer);
        expect(view[0]).toBe(255);
        expect(view[1]).toBe(0);
        expect(view[2]).toBe(128);
    });
});

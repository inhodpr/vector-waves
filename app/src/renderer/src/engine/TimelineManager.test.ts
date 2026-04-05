import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TimelineManager } from './TimelineManager';
import { useAppStore } from '../store/useAppStore';

describe('TimelineManager', () => {
    let mockAdapter: any;
    let manager: TimelineManager;

    beforeEach(() => {
        mockAdapter = {
            loadTrackFromBuffer: vi.fn(),
            play: vi.fn(),
            pause: vi.fn(),
            isCurrentlyPlaying: vi.fn(),
            seek: vi.fn(),
            getDurationMs: vi.fn().mockReturnValue(12345)
        };
        manager = new TimelineManager(mockAdapter);
    });

    it('should load selected track and update store', async () => {
        const buffer = new Uint8Array([1, 2, 3]);
        await manager.loadSelectedTrack('/path/to/test.mp3', buffer);

        expect(mockAdapter.loadTrackFromBuffer).toHaveBeenCalled();
        expect(useAppStore.getState().audio.tracks).toContainEqual(expect.objectContaining({
            name: 'test.mp3',
            path: '/path/to/test.mp3'
        }));
    });

    it('should reload track via IPC', async () => {
        vi.mocked(window.electron.ipcRenderer.invoke).mockResolvedValueOnce({
            buffer: new Uint8Array([4, 5, 6])
        });

        await manager.reloadTrack('/path/to/old.mp3');

        expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith('read-audio-file', '/path/to/old.mp3');
        expect(mockAdapter.loadTrackFromBuffer).toHaveBeenCalled();
    });

    it('should proxy play, pause, toggle, seek', () => {
        manager.play();
        expect(mockAdapter.play).toHaveBeenCalled();

        manager.pause();
        expect(mockAdapter.pause).toHaveBeenCalled();

        mockAdapter.isCurrentlyPlaying.mockReturnValue(true);
        manager.togglePlayPause();
        expect(mockAdapter.pause).toHaveBeenCalledTimes(2);

        mockAdapter.isCurrentlyPlaying.mockReturnValue(false);
        manager.togglePlayPause();
        expect(mockAdapter.play).toHaveBeenCalledTimes(2);

        manager.seek(100);
        expect(mockAdapter.seek).toHaveBeenCalledWith(100);

        expect(manager.getDurationMs()).toBe(12345);
        expect(manager.getAdapter()).toBe(mockAdapter);
    });
});

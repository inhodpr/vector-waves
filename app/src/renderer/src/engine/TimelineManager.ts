import { useAppStore } from '../store/useAppStore';
import { AudioPlaybackAdapter } from './AudioPlaybackAdapter';

/**
 * Controller class that bridges the React/Zustand UI logic and the Audio adapter. 
 */
export class TimelineManager {
    private audioAdapter: AudioPlaybackAdapter;

    constructor(audioAdapter: AudioPlaybackAdapter) {
        this.audioAdapter = audioAdapter;

        // The adapter drives the actual exact math clock, but we sync it back to 
        // a pure Zustand store *solely* if the UI needs deep reactive bindings.
        // For performance, the CanvasEngine should probably read directly from the adapter via ITimeSource, 
        // while the playhead X position in the React UI subscribes to onTimeUpdate.
    }

    public async loadSelectedTrack(originalPath: string, bufferData: any) {
        // Electron IPC structured cloning converts Node Buffers to an object looking like { type: 'Buffer', data: [...] }.
        // We must convert this back into a true ES6 ArrayBuffer for the Web Audio Context to parse it.
        const arrayBuffer = new Uint8Array(bufferData).buffer;

        await this.audioAdapter.loadTrackFromBuffer(arrayBuffer);

        // Add to Zustand to record the path for the .vva save project bundle logic
        const store = useAppStore.getState();
        store.addAudioTrack({
            id: 'track1', // Phase 2 MVP assumes exactly 1 primary track
            name: originalPath.split('/').pop() || 'Unknown Track',
            path: originalPath
        });
    }

    /**
     * Reloads an existing track's buffer into the adapter.
     * Used after loading a project from a .vva file to re-initialize the audio engine.
     */
    public async reloadTrack(path: string) {
        const result = await (window as any).electron.ipcRenderer.invoke('read-audio-file', path);
        if (result && result.buffer) {
            const arrayBuffer = new Uint8Array(result.buffer).buffer;
            await this.audioAdapter.loadTrackFromBuffer(arrayBuffer);
        }
    }

    public play() {
        this.audioAdapter.play();
    }

    public pause() {
        this.audioAdapter.pause();
    }

    public togglePlayPause() {
        if (this.audioAdapter.isCurrentlyPlaying()) {
            this.audioAdapter.pause();
        } else {
            this.audioAdapter.play();
        }
    }

    public seek(timeMs: number) {
        this.audioAdapter.seek(timeMs);
    }

    public getDurationMs() {
        return this.audioAdapter.getDurationMs();
    }

    public getAdapter() {
        return this.audioAdapter;
    }
}

import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from './useAppStore';

describe('AppStore', () => {
    beforeEach(() => {
        useAppStore.setState({ entities: {}, entityIds: [], selectedEntityId: null });
    });

    it('should correctly update entity styles', () => {
        const mockEntity = {
            id: 'shp1',
            type: 'Line' as const,
            vertices: [],
            style: { strokeWidth: 2, strokeColor: '#000000', fillColor: 'transparent', globalRadius: 0 },
            pluckOrigin: 0,
            zIndex: 0,
            animations: []
        };
        useAppStore.setState({ entities: { 'shp1': mockEntity }, entityIds: ['shp1'] });

        useAppStore.getState().updateEntityStyle('shp1', { strokeWidth: 10 });

        const updatedEntity = useAppStore.getState().entities['shp1'];
        expect(updatedEntity.type === 'Line' && updatedEntity.style.strokeWidth).toBe(10);
    });

    it('should correctly manage audio tracks', () => {
        useAppStore.getState().addAudioTrack({
            id: 'track1',
            name: 'Song 1',
            path: '/path/to/song.mp3'
        });

        expect(useAppStore.getState().audio.tracks.length).toBe(1);
        expect(useAppStore.getState().audio.tracks[0].name).toBe('Song 1');

        // Prevent duplicates
        useAppStore.getState().addAudioTrack({
            id: 'track1',
            name: 'Song 1 Duplicate',
            path: '/path/to/song.mp3'
        });
        expect(useAppStore.getState().audio.tracks.length).toBe(1);

        useAppStore.getState().removeAudioTrack('track1');
        expect(useAppStore.getState().audio.tracks.length).toBe(0);
    });

    it('should correctly manage audio markers and cascade delete', () => {
        useAppStore.getState().addAudioTrack({ id: 'track1', name: 'Song 1', path: '/path' });

        // Add Marker
        useAppStore.getState().addAudioMarker({
            id: 'marker1',
            targetTrackId: 'track1',
            timestampMs: 1000
        });

        expect(useAppStore.getState().audio.markers.length).toBe(1);

        // Update Marker
        useAppStore.getState().updateAudioMarkerTime('marker1', 2000);
        expect(useAppStore.getState().audio.markers[0].timestampMs).toBe(2000);

        // Remove Marker
        useAppStore.getState().removeAudioMarker('marker1');
        expect(useAppStore.getState().audio.markers.length).toBe(0);

        // Cascade delete test
        useAppStore.getState().addAudioMarker({ id: 'marker2', targetTrackId: 'track1', timestampMs: 3000 });
        useAppStore.getState().removeAudioTrack('track1');
        expect(useAppStore.getState().audio.markers.length).toBe(0); // Marker should be deleted with track
    });

    it('should correctly manage background image assets', () => {
        const mockAsset = {
            id: 'img1',
            path: '/path/to/image.png',
            buffer: new Uint8Array([1, 2, 3])
        };

        useAppStore.getState().addImageAsset(mockAsset);
        expect(useAppStore.getState().assets.images['img1']).toEqual(mockAsset);

        useAppStore.getState().setBackgroundImage('img1');
        expect(useAppStore.getState().backgroundImageAssetId).toBe('img1');

        useAppStore.getState().setBackgroundImage(null);
        expect(useAppStore.getState().backgroundImageAssetId).toBeNull();
    });
});

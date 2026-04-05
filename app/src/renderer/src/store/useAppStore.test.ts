import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from './useAppStore';
import { CanvasEntity, VibrationAnim, LineEntity } from './types';

describe('AppStore', () => {
    beforeEach(() => {
        useAppStore.setState({ 
            entities: {}, 
            entityIds: [], 
            selectedEntityId: null,
            audio: {
                tracks: [],
                markers: [],
                nextMarkerIndex: 1
            },
            assets: {
                images: {}
            },
            exportSettings: {
                resolution: '1080p',
                fps: 60,
                rangeType: 'whole',
                startTimeMs: 0,
                endTimeMs: 5000
            },
            isExporting: false,
            exportProgress: 0,
            logs: []
        });
    });

    describe('Entity Management', () => {
        const mockEntity: CanvasEntity = {
            id: 'shp1',
            type: 'Line' as const,
            vertices: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
            style: { strokeWidth: 2, strokeColor: '#000000', fillColor: 'transparent', globalRadius: 0 },
            pluckOrigin: 0.5,
            zIndex: 0,
            animations: []
        };

        it('should add an entity', () => {
            useAppStore.getState().addEntity(mockEntity);
            const state = useAppStore.getState();
            expect(state.entities['shp1']).toEqual(mockEntity);
            expect(state.entityIds).toContain('shp1');
        });

        it('should not add a duplicate entity', () => {
            useAppStore.getState().addEntity(mockEntity);
            useAppStore.getState().addEntity(mockEntity);
            expect(useAppStore.getState().entityIds.length).toBe(1);
        });

        it('should update an entity', () => {
            useAppStore.getState().addEntity(mockEntity);
            useAppStore.getState().updateEntity('shp1', { pluckOrigin: 0.8 });
            expect((useAppStore.getState().entities['shp1'] as LineEntity).pluckOrigin).toBe(0.8);
        });

        it('should update entity style', () => {
            useAppStore.getState().addEntity(mockEntity);
            useAppStore.getState().updateEntityStyle('shp1', { strokeWidth: 5 });
            const entity = useAppStore.getState().entities['shp1'];
            if (entity.type === 'Line') {
                expect(entity.style.strokeWidth).toBe(5);
            }
        });

        it('should delete an entity', () => {
            useAppStore.getState().addEntity(mockEntity);
            useAppStore.getState().setSelectedEntityId('shp1');
            useAppStore.getState().deleteEntity('shp1');
            const state = useAppStore.getState();
            expect(state.entities['shp1']).toBeUndefined();
            expect(state.entityIds).not.toContain('shp1');
            expect(state.selectedEntityId).toBeNull();
        });
    });

    describe('Z-Order Actions', () => {
        beforeEach(() => {
            useAppStore.setState({ entityIds: ['e1', 'e2', 'e3'] });
        });

        it('should bring forward', () => {
            useAppStore.getState().bringForward('e1');
            expect(useAppStore.getState().entityIds).toEqual(['e2', 'e1', 'e3']);
        });

        it('should send backward', () => {
            useAppStore.getState().sendBackward('e3');
            expect(useAppStore.getState().entityIds).toEqual(['e1', 'e3', 'e2']);
        });

        it('should bring to front', () => {
            useAppStore.getState().toFront('e1');
            expect(useAppStore.getState().entityIds).toEqual(['e2', 'e3', 'e1']);
        });

        it('should send to back', () => {
            useAppStore.getState().toBack('e3');
            expect(useAppStore.getState().entityIds).toEqual(['e3', 'e1', 'e2']);
        });

        it('should do nothing if already at bounds', () => {
            useAppStore.getState().bringForward('e3');
            expect(useAppStore.getState().entityIds).toEqual(['e1', 'e2', 'e3']);
            useAppStore.getState().sendBackward('e1');
            expect(useAppStore.getState().entityIds).toEqual(['e1', 'e2', 'e3']);
        });
    });

    describe('Vibration / Animation Actions', () => {
        const lineEntity: CanvasEntity = {
            id: 'line1',
            type: 'Line' as const,
            vertices: [],
            style: { strokeWidth: 1, strokeColor: 'white', fillColor: 'transparent', globalRadius: 0 },
            pluckOrigin: 0.5,
            zIndex: 0,
            animations: []
        };

        const mockAnim: VibrationAnim = {
            id: 'anim1',
            startMarkerId: 'm1',
            endMarkerId: 'm2',
            frequency: 440,
            amplitude: 1.0,
            edgeDamping: 0.1,
            easing: 'Linear'
        };

        beforeEach(() => {
            useAppStore.getState().addEntity(lineEntity);
        });

        it('should add a vibration animation', () => {
            useAppStore.getState().addVibrationAnim('line1', mockAnim);
            const entity = useAppStore.getState().entities['line1'];
            if (entity.type === 'Line') {
                expect(entity.animations).toContain(mockAnim);
            }
        });

        it('should update a vibration animation', () => {
            useAppStore.getState().addVibrationAnim('line1', mockAnim);
            useAppStore.getState().updateVibrationAnim('line1', 'anim1', { amplitude: 0.5 });
            const entity = useAppStore.getState().entities['line1'];
            if (entity.type === 'Line') {
                expect(entity.animations[0].amplitude).toBe(0.5);
            }
        });

        it('should remove a vibration animation', () => {
            useAppStore.getState().addVibrationAnim('line1', mockAnim);
            useAppStore.getState().removeVibrationAnim('line1', 'anim1');
            const entity = useAppStore.getState().entities['line1'];
            if (entity.type === 'Line') {
                expect(entity.animations.length).toBe(0);
            }
        });

        it('should update pluck origin with clamping', () => {
            useAppStore.getState().updatePluckOrigin('line1', 1.5);
            expect((useAppStore.getState().entities['line1'] as LineEntity).pluckOrigin).toBe(1.0);
            useAppStore.getState().updatePluckOrigin('line1', -0.5);
            expect((useAppStore.getState().entities['line1'] as LineEntity).pluckOrigin).toBe(0.0);
            useAppStore.getState().updatePluckOrigin('line1', 0.7);
            expect((useAppStore.getState().entities['line1'] as LineEntity).pluckOrigin).toBe(0.7);
        });
    });

    describe('Audio Marker Management', () => {
        it('should auto-name markers', () => {
            useAppStore.getState().addAudioMarker({ id: 'm1', targetTrackId: 't1', timestampMs: 100 });
            expect(useAppStore.getState().audio.markers[0].name).toBe('M1');
            expect(useAppStore.getState().audio.nextMarkerIndex).toBe(2);

            useAppStore.getState().addAudioMarker({ id: 'm2', targetTrackId: 't1', timestampMs: 200 });
            expect(useAppStore.getState().audio.markers[1].name).toBe('M2');
            expect(useAppStore.getState().audio.nextMarkerIndex).toBe(3);
        });

        it('should update marker name', () => {
            useAppStore.getState().addAudioMarker({ id: 'm1', targetTrackId: 't1', timestampMs: 111 });
            useAppStore.getState().updateAudioMarkerName('m1', 'Chorus');
            expect(useAppStore.getState().audio.markers[0].name).toBe('Chorus');
        });

        it('should migrate unnamed markers', () => {
            useAppStore.setState({
                audio: {
                    tracks: [],
                    markers: [
                        { id: 'm1', targetTrackId: 't1', timestampMs: 100 } as any,
                        { id: 'm2', name: 'Existing', targetTrackId: 't1', timestampMs: 200 }
                    ],
                    nextMarkerIndex: 10
                }
            });

            useAppStore.getState().migrateAudioMarkers();
            expect(useAppStore.getState().audio.markers[0].name).toBe('M10');
            expect(useAppStore.getState().audio.markers[1].name).toBe('Existing');
            expect(useAppStore.getState().audio.nextMarkerIndex).toBe(11);
        });
    });

    describe('Project Save/Load', () => {
        it('should call IPC on saveProject', async () => {
            const invokeSpy = vi.spyOn((window as any).electron.ipcRenderer, 'invoke').mockResolvedValue(true);
            const success = await useAppStore.getState().saveProject();
            expect(success).toBe(true);
            expect(invokeSpy).toHaveBeenCalledWith('save-project', expect.any(String));
        });

        it('should load project data and restore assets', async () => {
            const projectData = {
                canvasWidth: 1920,
                assets: {
                    images: {
                        'img1': { buffer: { 0: 255, 1: 216 } }
                    }
                }
            };
            vi.mocked(window.electron.ipcRenderer.invoke).mockResolvedValueOnce(JSON.stringify(projectData));
            
            const success = await useAppStore.getState().loadProject();
            expect(success).toBe(true);
            expect(useAppStore.getState().canvasWidth).toBe(1920);
            expect(useAppStore.getState().assets.images['img1'].buffer).toBeInstanceOf(Uint8Array);
        });

        it('should return false and log error on invalid JSON in loadProject', async () => {
            vi.mocked(window.electron.ipcRenderer.invoke).mockResolvedValueOnce('invalid-json');
            const success = await useAppStore.getState().loadProject();
            expect(success).toBe(false);
            expect(useAppStore.getState().logs.some(l => l.level === 'error' && l.message.includes('Failed to load project'))).toBe(true);
        });

        it('should return false on empty loadProject response', async () => {
            vi.mocked(window.electron.ipcRenderer.invoke).mockResolvedValueOnce(null);
            const success = await useAppStore.getState().loadProject();
            expect(success).toBe(false);
        });
    });

    describe('Timeline Navigation', () => {
        it('should set timeline zoom', () => {
            useAppStore.getState().setTimelineZoom(5.5);
            expect(useAppStore.getState().timelineZoomLevel).toBe(5.5);
        });

        it('should set timeline zoom with focus', () => {
            useAppStore.setState({ timelineZoomLevel: 1, timelineScrollOffsetPx: 0 });
            // focus at 100ms, zoom to 2.
            // currentPixelX = (100 * 1) - 0 = 100
            // newScrollOffset = (100 * 2) - 100 = 100
            useAppStore.getState().setTimelineZoom(2, 100);
            expect(useAppStore.getState().timelineZoomLevel).toBe(2);
            expect(useAppStore.getState().timelineScrollOffsetPx).toBe(100);
        });

        it('should set timeline scroll', () => {
            useAppStore.getState().setTimelineScroll(500);
            expect(useAppStore.getState().timelineScrollOffsetPx).toBe(500);
            useAppStore.getState().setTimelineScroll(-10);
            expect(useAppStore.getState().timelineScrollOffsetPx).toBe(0);
        });
    });

    describe('Logging Actions', () => {
        it('should add logs and respect limit', () => {
            const { addLog } = useAppStore.getState();
            for (let i = 0; i < 60; i++) {
                addLog('info', `test ${i}`);
            }
            expect(useAppStore.getState().logs.length).toBe(50);
            expect(useAppStore.getState().logs[49].message).toBe('test 59');
        });

        it('should clear logs', () => {
            useAppStore.getState().addLog('info', 'test');
            useAppStore.getState().clearLogs();
            expect(useAppStore.getState().logs.length).toBe(0);
        });
    });

    describe('Audio Track Management', () => {
        it('should add and remove audio tracks', () => {
            const track = { id: 't1', name: 'Track 1', path: 'test.mp3', buffer: new Uint8Array(), volume: 1, isMuted: false };
            useAppStore.getState().addAudioTrack(track);
            expect(useAppStore.getState().audio.tracks).toContain(track);

            // Add duplicate
            useAppStore.getState().addAudioTrack(track);
            expect(useAppStore.getState().audio.tracks.length).toBe(1);

            // Add marker for track
            useAppStore.getState().addAudioMarker({ id: 'm1', timestampMs: 1000, targetTrackId: 't1' } as any);
            expect(useAppStore.getState().audio.markers.length).toBe(1);

            // Remove track (should cascade delete marker)
            useAppStore.getState().removeAudioTrack('t1');
            expect(useAppStore.getState().audio.tracks.length).toBe(0);
            expect(useAppStore.getState().audio.markers.length).toBe(0);
        });
    });

    describe('Project Settings and Miscellaneous', () => {
        it('should update basic project settings', () => {
            const { setActiveTool, setBackgroundColor, setBackgroundImage, setCanvasSize, setLiveMode, setAudioInputDeviceId, updateExportProgress, addImageAsset, setExportSettings, startExport, finishExport, setIsDragging, setBackgroundEditMode, setBackgroundImageTransform } = useAppStore.getState();
            
            setActiveTool('Draw');
            expect(useAppStore.getState().activeTool).toBe('Draw');

            setBackgroundColor('#123456');
            expect(useAppStore.getState().backgroundColor).toBe('#123456');

            setBackgroundImage('img1');
            expect(useAppStore.getState().backgroundImageAssetId).toBe('img1');

            setCanvasSize(1920, 1080);
            expect(useAppStore.getState().canvasWidth).toBe(1920);
            expect(useAppStore.getState().canvasHeight).toBe(1080);

            setLiveMode(true);
            expect(useAppStore.getState().liveMode).toBe(true);

            setAudioInputDeviceId('mic1');
            expect(useAppStore.getState().audioInputDeviceId).toBe('mic1');

            updateExportProgress(0.5);
            expect(useAppStore.getState().exportProgress).toBe(0.5);

            const asset = { id: 'a1', name: 'Asset 1', buffer: new Uint8Array() };
            addImageAsset(asset as any);
            expect(useAppStore.getState().assets.images['a1']).toBe(asset);

            setExportSettings({ resolution: '720p', fps: 30 });
            expect(useAppStore.getState().exportSettings.resolution).toBe('720p');
            expect(useAppStore.getState().exportSettings.fps).toBe(30);

            startExport();
            expect(useAppStore.getState().isExporting).toBe(true);
            expect(useAppStore.getState().exportProgress).toBe(0);

            finishExport();
            expect(useAppStore.getState().isExporting).toBe(false);

            setIsDragging(true);
            expect(useAppStore.getState().isDragging).toBe(true);

            setBackgroundEditMode(true);
            expect(useAppStore.getState().backgroundEditMode).toBe(true);

            setBackgroundImageTransform({ x: 10, y: 20, scale: 2 });
            expect(useAppStore.getState().backgroundImageTransform).toEqual({ x: 10, y: 20, scale: 2 });
        });

        it('should update audio marker time and remove it', () => {
            useAppStore.getState().addAudioMarker({ id: 'm1', timestampMs: 1000, name: 'M1' } as any);
            useAppStore.getState().updateAudioMarkerTime('m1', 2000);
            expect(useAppStore.getState().audio.markers[0].timestampMs).toBe(2000);

            useAppStore.getState().removeAudioMarker('m1');
            expect(useAppStore.getState().audio.markers.length).toBe(0);
        });
    });

    describe('Detached Mode', () => {
        it('should handle detached mode state', () => {
            const { setDetachedActive, setMessagePort, syncStateToPreview, applySyncPatch } = useAppStore.getState();
            
            setDetachedActive(true);
            expect(useAppStore.getState().detachedActive).toBe(true);

            const mockPort = {
                postMessage: vi.fn(),
                onmessage: null as any
            };
            setMessagePort(mockPort as any);
            expect(useAppStore.getState().messagePort).toBe(mockPort);

            // Mock receiving a message
            const syncEvent = { data: { type: 'SYNC_STATE', payload: { backgroundColor: '#FF00FF' } } };
            mockPort.onmessage(syncEvent);
            expect(useAppStore.getState().backgroundColor).toBe('#FF00FF');

            // Dispatch events
            const spySyncTime = vi.fn();
            const spyPluck = vi.fn();
            window.addEventListener('sync-time', spySyncTime);
            window.addEventListener('detached-pluck', spyPluck);

            mockPort.onmessage({ data: { type: 'SYNC_TIME', payload: { time: 123 } } });
            expect(spySyncTime).toHaveBeenCalled();

            mockPort.onmessage({ data: { type: 'DETACHED_PLUCK', payload: { x: 1, y: 1 } } });
            expect(spyPluck).toHaveBeenCalled();

            // Sync state to preview
            syncStateToPreview({ canvasWidth: 500 });
            expect(mockPort.postMessage).toHaveBeenCalledWith({
                type: 'SYNC_STATE',
                payload: { canvasWidth: 500 }
            });

            // Initial sync (no patch)
            syncStateToPreview();
            expect(mockPort.postMessage).toHaveBeenCalledTimes(2);
        });
    });

    describe('Layer System Actions', () => {
        beforeEach(() => {
            useAppStore.setState({ 
                canvasTransform: { x: 0, y: 0, scale: 0.8 },
                activeLayerId: null
            });
        });

        it('should set canvas transform', () => {
            useAppStore.getState().setCanvasTransform({ x: 100, y: 200, scale: 1.5 });
            expect(useAppStore.getState().canvasTransform).toEqual({ x: 100, y: 200, scale: 1.5 });
        });

        it('should update layer transform', () => {
            const mockLayer: any = { id: 'layer1', type: 'ImageLayer', x: 0, y: 0, scale: 1, width: 100, height: 100, assetId: 'blob:1' };
            useAppStore.getState().addEntity(mockLayer);
            useAppStore.getState().updateLayerTransform('layer1', { x: 50, scale: 2 });
            const layer = useAppStore.getState().entities['layer1'] as any;
            expect(layer.x).toBe(50);
            expect(layer.scale).toBe(2);
        });

        it('should garbage collect ObjectURLs on delete', () => {
            const revokeSpy = vi.spyOn(global.URL, 'revokeObjectURL');
            const mockLayer: any = { id: 'layer1', type: 'ImageLayer', assetId: 'blob:123', width: 100, height: 100 };
            useAppStore.getState().addEntity(mockLayer);
            useAppStore.getState().deleteEntity('layer1');
            expect(revokeSpy).toHaveBeenCalledWith('blob:123');
            revokeSpy.mockRestore();
        });
    });
});

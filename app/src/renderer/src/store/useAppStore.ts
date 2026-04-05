import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { AppState, CanvasEntity, VibrationAnim, AssetData } from './types';

export const useAppStore = create<AppState>()(subscribeWithSelector((set, get) => ({
    // Project Settings
    canvasWidth: 1080,
    canvasHeight: 1080,
    backgroundColor: '#FFFFFF',
    backgroundImageAssetId: null,
    backgroundImageTransform: { x: 0, y: 0, scale: 1.0 },
    backgroundEditMode: false,
    canvasTransform: { x: 0, y: 0, scale: 0.8 },
    activeLayerId: null,

    // Domain Data
    entities: {},
    entityIds: [], // Added to fix TS compiling error from missing AppState property

    // Audio State
    audio: {
        tracks: [],
        markers: [],
        nextMarkerIndex: 1
    },
    liveMode: false,
    audioInputDeviceId: null,

    // Export State
    exportSettings: {
        resolution: '1080p',
        fps: 60,
        rangeType: 'whole',
        startTimeMs: 0,
        endTimeMs: 5000 // Default 5s if no audio
    },
    isExporting: false,
    exportProgress: 0,

    // Assets
    assets: {
        images: {}
    },

    // Editor UI State
    selectedEntityId: null,
    activeTool: 'Select',
    isDragging: false,
    isExtracting: false,
    isSaving: false,
    timelineZoomLevel: 10,
    timelineScrollOffsetPx: 0,
    logs: [],

    // Detached Window State
    isDetachedMode: new URLSearchParams(window.location.search).get('mode') === 'preview',
    detachedActive: false,
    messagePort: null,

    // Actions
    updateEntityStyle: (id, styleUpdate) => set((state) => {
        const entity = state.entities[id];
        if (!entity || entity.type !== 'Line') return state; // Only Lines have EntityStyle in MVP

        return {
            entities: {
                ...state.entities,
                [id]: {
                    ...entity,
                    style: { ...entity.style, ...styleUpdate }
                }
            }
        };
    }),

    updateEntity: (id, entityUpdate) => set((state) => {
        const entity = state.entities[id];
        if (!entity) return state;

        return {
            entities: {
                ...state.entities,
                [id]: { ...entity, ...entityUpdate } as CanvasEntity
            }
        };
    }),

    addEntity: (entity) => set((state) => {
        if (state.entities[entity.id]) return state; // Prevent duplicates

        // Initialize empty animations array for lines if not provided
        const finalEntity = entity.type === 'Line' && !(entity as any).animations
            ? { ...entity, animations: [] }
            : entity;

        return {
            entities: {
                ...state.entities,
                [entity.id]: finalEntity as CanvasEntity
            },
            entityIds: [...state.entityIds, entity.id]
        };
    }),

    addEntities: (newEntities) => set((state) => {
        const nextEntities = { ...state.entities };
        const nextEntityIds = [...state.entityIds];

        newEntities.forEach(entity => {
            if (nextEntities[entity.id]) return;

            const finalEntity = entity.type === 'Line' && !(entity as any).animations
                ? { ...entity, animations: [] }
                : entity;

            nextEntities[entity.id] = finalEntity as CanvasEntity;
            nextEntityIds.push(entity.id);
        });

        return {
            entities: nextEntities,
            entityIds: nextEntityIds
        };
    }),

    deleteEntity: (id) => set((state) => {
        const entity = state.entities[id];
        if (!entity) return state;

        // Cleanup ObjectURLs if necessary
        if (entity.type === 'ImageLayer' && entity.assetId.startsWith('blob:')) {
            URL.revokeObjectURL(entity.assetId);
        }

        const newEntities = { ...state.entities };
        delete newEntities[id];

        return {
            entities: newEntities,
            entityIds: state.entityIds.filter(eId => eId !== id),
            selectedEntityId: state.selectedEntityId === id ? null : state.selectedEntityId,
            activeLayerId: state.activeLayerId === id ? null : state.activeLayerId
        };
    }),

    setSelectedEntityId: (id) => set({ selectedEntityId: id }),
    setActiveTool: (tool) => set({ activeTool: tool }),
    setIsDragging: (isDragging) => set({ isDragging }),
    setIsExtracting: (active) => set({ isExtracting: active }),
    setBackgroundEditMode: (active) => set({ backgroundEditMode: active }),
    setBackgroundImageTransform: (transform) => set({ backgroundImageTransform: transform }),
    setCanvasTransform: (transform) => set({ canvasTransform: transform }),
    
    updateLayerTransform: (id, transformUpdate) => set((state) => {
        const entity = state.entities[id];
        if (!entity || entity.type !== 'ImageLayer') return state;

        return {
            entities: {
                ...state.entities,
                [id]: {
                    ...entity,
                    ...transformUpdate
                }
            }
        };
    }),

    reRasterizeOSMLayer: async (id, newZoomScale, viewportBounds) => {
        const state = get();
        const entity = state.entities[id];
        if (!entity || entity.type !== 'ImageLayer' || !entity.cacheKey) return;

        try {
            // Request vector data from IPC based on cacheKey
            const geoJSON = await (window as any).electron.ipcRenderer.invoke('get-osm-cache', entity.cacheKey);
            if (!geoJSON) throw new Error('Failed to retrieve OSM cache data');

            // Dynamic import to avoid circular dependency if osmImporter uses store
            const { rasterizeOSMLayers } = await import('../utils/osmImporter');
            
            const results = await rasterizeOSMLayers(
                geoJSON,
                state.canvasWidth,
                state.canvasHeight,
                newZoomScale,
                viewportBounds
            );

            // For now, we assume the layer represents a specific category or the whole set
            // In a better impl, we might update multiple layers. 
            // Here we assume this id's asset is what needs updating.
            const buffers = Object.values(results);
            if (buffers.length > 0) {
                const buffer = buffers[0] as Uint8Array;
                const newAssetId = `osm_${entity.cacheKey || 'patch'}_${Date.now()}`;

                set((state) => ({
                    assets: {
                        ...state.assets,
                        images: {
                            ...state.assets.images,
                            [newAssetId]: {
                                id: newAssetId,
                                path: '',
                                buffer: buffer
                            } as AssetData
                        }
                    },
                    entities: {
                        ...state.entities,
                        [id]: {
                            ...entity,
                            assetId: newAssetId,
                            rasterizedZoomLevel: newZoomScale
                        } as any
                    }
                }));

                // Garbage collect old blob if it was a blob URL (though now we use buffer-backed assets)
                if (entity.assetId.startsWith('blob:')) {
                    URL.revokeObjectURL(entity.assetId);
                }
            }
        } catch (e) {
            console.error('reRasterizeOSMLayer failed:', e);
            state.addLog('error', `Failed to re-rasterize OSM layer: ${e instanceof Error ? e.message : String(e)}`);
        }
    },

    // Z-Order Actions
    bringForward: (id) => set((state) => {
        const index = state.entityIds.indexOf(id);
        if (index === -1 || index === state.entityIds.length - 1) return state;

        const newOrder = [...state.entityIds];
        [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
        return { entityIds: newOrder };
    }),

    sendBackward: (id) => set((state) => {
        const index = state.entityIds.indexOf(id);
        if (index <= 0) return state;

        const newOrder = [...state.entityIds];
        [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];
        return { entityIds: newOrder };
    }),

    toFront: (id) => set((state) => {
        const index = state.entityIds.indexOf(id);
        if (index === -1 || index === state.entityIds.length - 1) return state;

        const newOrder = [...state.entityIds];
        newOrder.splice(index, 1);
        newOrder.push(id);
        return { entityIds: newOrder };
    }),

    toBack: (id) => set((state) => {
        const index = state.entityIds.indexOf(id);
        if (index <= 0) return state;

        const newOrder = [...state.entityIds];
        newOrder.splice(index, 1);
        newOrder.unshift(id);
        return { entityIds: newOrder };
    }),

    // Vibration / Animation Actions
    addVibrationAnim: (entityId, anim) => set((state) => {
        const entity = state.entities[entityId];
        if (!entity || entity.type !== 'Line') return state;
        if (entity.animations.find(a => a.id === anim.id)) return state;

        return {
            entities: {
                ...state.entities,
                [entityId]: {
                    ...entity,
                    animations: [...entity.animations, anim]
                }
            }
        };
    }),

    updateVibrationAnim: (entityId, animId, updates) => set((state) => {
        const entity = state.entities[entityId];
        if (!entity || entity.type !== 'Line') return state;

        const index = entity.animations.findIndex(a => a.id === animId);
        if (index === -1) return state;

        const newAnimations = [...entity.animations];
        newAnimations[index] = { ...newAnimations[index], ...updates };

        return {
            entities: {
                ...state.entities,
                [entityId]: {
                    ...entity,
                    animations: newAnimations
                }
            }
        };
    }),

    removeVibrationAnim: (entityId, animId) => set((state) => {
        const entity = state.entities[entityId];
        if (!entity || entity.type !== 'Line') return state;

        return {
            entities: {
                ...state.entities,
                [entityId]: {
                    ...entity,
                    animations: entity.animations.filter(a => a.id !== animId)
                }
            }
        };
    }),

    updatePluckOrigin: (entityId, percent) => set((state) => {
        const entity = state.entities[entityId];
        if (!entity || entity.type !== 'Line') return state;

        // Clamp between 0.0 and 1.0 strictly
        const clampedPercent = Math.max(0, Math.min(1, percent));

        return {
            entities: {
                ...state.entities,
                [entityId]: {
                    ...entity,
                    pluckOrigin: clampedPercent
                }
            }
        };
    }),

    // Project Actions
    setBackgroundColor: (color) => set({ backgroundColor: color }),
    setBackgroundImage: (assetId) => set({ backgroundImageAssetId: assetId }),
    setCanvasSize: (width, height) => set({ canvasWidth: width, canvasHeight: height }),

    // Asset Actions
    addImageAsset: (asset) => set((state) => ({
        assets: {
            ...state.assets,
            images: { ...state.assets.images, [asset.id]: asset }
        }
    })),

    // Export Actions
    setExportSettings: (settings) => set((state) => ({
        exportSettings: { ...state.exportSettings, ...settings }
    })),
    startExport: () => set({ isExporting: true, exportProgress: 0 }),
    updateExportProgress: (progress) => set({ exportProgress: progress }),
    finishExport: () => set({ isExporting: false }),

    // Live Audio Actions
    setLiveMode: (active) => set({ liveMode: active }),
    setAudioInputDeviceId: (id) => set({ audioInputDeviceId: id }),

    // Timeline Navigation Actions
    setTimelineZoom: (zoom, focusTimeMs) => set((state) => {
        const newZoom = Math.max(0.1, Math.min(100, zoom)); // Reasonable zoom bounds

        if (focusTimeMs !== undefined) {
            // formula from PHASE3B_IMPLEMENTATION.md: 
            // newScrollOffset = (timeAtFocus * newZoom) - mouseX
            // In our case, if we know focusTimeMs, we want it to stay at its current relative screen position
            const currentPixelX = (focusTimeMs * state.timelineZoomLevel) - state.timelineScrollOffsetPx;
            const newScrollOffset = Math.floor((focusTimeMs * newZoom) - currentPixelX);

            return {
                timelineZoomLevel: newZoom,
                timelineScrollOffsetPx: Math.max(0, newScrollOffset)
            };
        }

        return { timelineZoomLevel: newZoom };
    }),

    setTimelineScroll: (offset) => set({
        timelineScrollOffsetPx: Math.max(0, Math.floor(offset))
    }),

    // Log Actions
    addLog: (level, message) => set((state) => ({
        logs: [
            ...state.logs,
            { id: `log_${Date.now()}_${Math.random()}`, timestamp: Date.now(), level, message }
        ].slice(-50) // Keep last 50 logs
    })),
    clearLogs: () => set({ logs: [] }),

    // Audio Actions
    addAudioTrack: (track) => set((state) => {
        // Simple MVP: Ensure we don't have duplicate IDs
        if (state.audio.tracks.find(t => t.id === track.id)) return state;
        return {
            audio: {
                ...state.audio,
                tracks: [...state.audio.tracks, track]
            }
        };
    }),

    removeAudioTrack: (id) => set((state) => {
        return {
            audio: {
                ...state.audio,
                tracks: state.audio.tracks.filter(t => t.id !== id),
                markers: state.audio.markers.filter(m => m.targetTrackId !== id) // Cascade delete
            }
        };
    }),

    addAudioMarker: (marker) => set((state) => {
        if (state.audio.markers.find(m => m.id === marker.id)) return state;
        
        // Auto-naming logic
        const newMarker = { ...marker };
        let nextIdx = state.audio.nextMarkerIndex;
        
        if (!newMarker.name) {
            newMarker.name = `M${nextIdx}`;
            nextIdx++;
        }

        return {
            audio: {
                ...state.audio,
                markers: [...state.audio.markers, newMarker],
                nextMarkerIndex: nextIdx
            }
        };
    }),

    updateAudioMarkerName: (id, name) => set((state) => {
        const index = state.audio.markers.findIndex(m => m.id === id);
        if (index === -1) return state;

        // Idempotency: don't update if name is identical
        if (state.audio.markers[index].name === name) return state;

        const newMarkers = [...state.audio.markers];
        newMarkers[index] = { ...newMarkers[index], name };

        return {
            audio: {
                ...state.audio,
                markers: newMarkers
            }
        };
    }),

    updateAudioMarkerTime: (id, newTimestampMs) => set((state) => {
        const index = state.audio.markers.findIndex(m => m.id === id);
        if (index === -1) return state;

        // Validations could prevent overlaps, but for base MVP we just blindly update the time
        // The UI will sort markers visually. Advanced logic belongs in TimelineManager.
        const newMarkers = [...state.audio.markers];
        newMarkers[index] = { ...newMarkers[index], timestampMs: newTimestampMs };

        return {
            audio: {
                ...state.audio,
                markers: newMarkers
            }
        };
    }),

    removeAudioMarker: (id) => set((state) => {
        return {
            audio: {
                ...state.audio,
                markers: state.audio.markers.filter(m => m.id !== id)
            }
        };
    }),

    migrateAudioMarkers: () => set((state) => {
        let hasChanges = false;
        let nextIdx = state.audio.nextMarkerIndex;

        const newMarkers = state.audio.markers.map(m => {
            if (!m.name) {
                hasChanges = true;
                const name = `M${nextIdx}`;
                nextIdx++;
                return { ...m, name };
            }
            return m;
        });

        if (!hasChanges) return state;

        return {
            audio: {
                ...state.audio,
                markers: newMarkers,
                nextMarkerIndex: nextIdx
            }
        };
    }),

    saveProject: async () => {
        const state = get();
        set({ isSaving: true });
        try {
            const projectData = {
                canvasWidth: state.canvasWidth,
                canvasHeight: state.canvasHeight,
                backgroundColor: state.backgroundColor,
                backgroundImageAssetId: state.backgroundImageAssetId,
                backgroundImageTransform: state.backgroundImageTransform,
                entities: state.entities,
                entityIds: state.entityIds,
                audio: state.audio,
                assets: state.assets,
                exportSettings: state.exportSettings
            };
            
            // Pass the object directly. Electron IPC handles TypedArrays efficiently 
            // via structured cloning, avoiding the massive overhead of JSON stringification.
            const success = await (window as any).electron.ipcRenderer.invoke('save-project', projectData);
            
            if (success) {
                state.addLog('info', 'Project saved successfully.');
            } else {
                state.addLog('warn', 'Project save was cancelled or failed.');
            }
            set({ isSaving: false });
            return success;
        } catch (e) {
            console.error('saveProject failed:', e);
            state.addLog('error', `Failed to save project: ${e instanceof Error ? e.message : String(e)}`);
            set({ isSaving: false });
            return false;
        }
    },

    loadProject: async () => {
        const state = get();
        try {
            const projectData = await (window as any).electron.ipcRenderer.invoke('load-project');
            if (projectData) {
                // DATA REWIRING: structured clone preserves Uint8Array, but let's be safe
                if (projectData.assets && projectData.assets.images) {
                    for (const id in projectData.assets.images) {
                        const asset = projectData.assets.images[id];
                        if (asset.buffer && !(asset.buffer instanceof Uint8Array)) {
                            // Convert the plain object {0: 123, 1: 45...} back to Uint8Array 
                            // (Only needed if the main process still stringifies somewhere)
                            asset.buffer = new Uint8Array(Object.values(asset.buffer));
                        }
                    }
                }

                set({
                    ...projectData,
                    selectedEntityId: null,
                    activeTool: 'Select',
                    isExporting: false,
                    exportProgress: 0,
                    logs: []
                });

                state.addLog('info', 'Project loaded successfully. Synchronizing engines...');
                
                // Notify App.tsx to reload audio buffers
                window.dispatchEvent(new CustomEvent('project-loaded'));
                
                return true;
            }
        } catch (e) {
            console.error('Failed to load project:', e);
            state.addLog('error', `Failed to load project: ${e instanceof Error ? e.message : String(e)}`);
            return false;
        }
        return false;
    },

    // Detached Window Actions
    setDetachedActive: (active) => set({ detachedActive: active }),
    setMessagePort: (port) => {
        console.log(`[STORE] setMessagePort called. Port:`, port);
        set({ messagePort: port });
        if (port) {
            port.onmessage = (event) => {
                const { type, payload } = event.data;
                if (type !== 'SYNC_TIME') { // Too noisy to log time syncs
                    console.log(`[STORE] Received Port Message: ${type}`, typeof payload === 'object' ? Object.keys(payload) : '');
                }
                if (type === 'SYNC_STATE') {
                    get().applySyncPatch(payload);
                } else if (type === 'SYNC_TIME') {
                    window.dispatchEvent(new CustomEvent('sync-time', { detail: payload }));
                } else if (type === 'DETACHED_PLUCK') {
                    window.dispatchEvent(new CustomEvent('detached-pluck', { detail: payload }));
                } else if (type === 'REQUEST_INITIAL_SYNC') {
                    console.log(`[STORE] Main Window received REQUEST_INITIAL_SYNC. Dispatching full state payload.`);
                    get().syncStateToPreview();
                }
            };
        }
    },
    syncStateToPreview: (patch) => {
        const state = get();
        if (!state.detachedActive || !state.messagePort) return;

        // If no patch provided, send full snapshot (initial sync)
        const payload = patch || {
            entities: state.entities,
            entityIds: state.entityIds,
            audio: state.audio,
            assets: state.assets,
            canvasWidth: state.canvasWidth,
            canvasHeight: state.canvasHeight,
            backgroundColor: state.backgroundColor,
            backgroundImageTransform: state.backgroundImageTransform
        };

        state.messagePort.postMessage({ type: 'SYNC_STATE', payload });
    },
    applySyncPatch: (patch) => {
        // Simple implementation: overwrite state with patch
        // In a real differential sync, this would use immer's applyPatches
        set((state) => ({ ...state, ...patch }));
    }
})));

// Expose to window for debugging
if (typeof window !== 'undefined') {
    (window as any).appStore = useAppStore;
}

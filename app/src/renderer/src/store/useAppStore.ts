import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { AppState, CanvasEntity, VibrationAnim } from './types';

export const useAppStore = create<AppState>()(subscribeWithSelector((set, get) => ({
    // Project Settings
    canvasWidth: 1080,
    canvasHeight: 1080,
    backgroundColor: '#FFFFFF',
    backgroundImageAssetId: null,

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

    deleteEntity: (id) => set((state) => {
        if (!state.entities[id]) return state;

        const newEntities = { ...state.entities };
        delete newEntities[id];

        return {
            entities: newEntities,
            entityIds: state.entityIds.filter(eId => eId !== id),
            selectedEntityId: state.selectedEntityId === id ? null : state.selectedEntityId
        };
    }),

    setSelectedEntityId: (id) => set({ selectedEntityId: id }),
    setActiveTool: (tool) => set({ activeTool: tool }),
    setIsDragging: (isDragging) => set({ isDragging }),

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
        const projectData = {
            canvasWidth: state.canvasWidth,
            canvasHeight: state.canvasHeight,
            backgroundColor: state.backgroundColor,
            backgroundImageAssetId: state.backgroundImageAssetId,
            entities: state.entities,
            entityIds: state.entityIds,
            audio: state.audio,
            assets: state.assets,
            exportSettings: state.exportSettings
        };
        
        const jsonString = JSON.stringify(projectData, null, 2);
        const success = await (window as any).electron.ipcRenderer.invoke('save-project', jsonString);
        
        if (success) {
            state.addLog('info', 'Project saved successfully.');
        }
        return success;
    },

    loadProject: async () => {
        const jsonString = await (window as any).electron.ipcRenderer.invoke('load-project');
        if (jsonString) {
            try {
                const projectData = JSON.parse(jsonString);
                
                // DATA REWIRING: JSON.parse turns Uint8Array into plain objects. 
                // We must restore them so the CanvasEngine/Blob logic works.
                if (projectData.assets && projectData.assets.images) {
                    for (const id in projectData.assets.images) {
                        const asset = projectData.assets.images[id];
                        if (asset.buffer && !(asset.buffer instanceof Uint8Array)) {
                            // Convert the plain object {0: 123, 1: 45...} back to Uint8Array
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

                get().addLog('info', 'Project loaded successfully. Synchronizing engines...');
                
                // Notify App.tsx to reload audio buffers
                window.dispatchEvent(new CustomEvent('project-loaded'));
                
                return true;
            } catch (e) {
                console.error('Failed to parse project file', e);
                get().addLog('error', `Failed to load project: ${e instanceof Error ? e.message : String(e)}`);
                return false;
            }
        }
        return false;
    },

    // Detached Window Actions
    setDetachedActive: (active) => set({ detachedActive: active }),
    setMessagePort: (port) => {
        set({ messagePort: port });
        if (port) {
            port.onmessage = (event) => {
                const { type, payload } = event.data;
                if (type === 'SYNC_STATE') {
                    get().applySyncPatch(payload);
                } else if (type === 'SYNC_TIME') {
                    // Handled by Ticker/Engine directly to avoid React overhead
                    window.dispatchEvent(new CustomEvent('sync-time', { detail: payload }));
                } else if (type === 'DETACHED_PLUCK') {
                    window.dispatchEvent(new CustomEvent('detached-pluck', { detail: payload }));
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
            backgroundColor: state.backgroundColor
        };

        state.messagePort.postMessage({ type: 'SYNC_STATE', payload });
    },
    applySyncPatch: (patch) => {
        // Simple implementation: overwrite state with patch
        // In a real differential sync, this would use immer's applyPatches
        set((state) => ({ ...state, ...patch }));
    }
})));

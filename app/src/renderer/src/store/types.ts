export type Point = { x: number; y: number };

export interface EntityStyle {
    strokeColor: string;
    strokeWidth: number;
    fillColor: string;
    globalRadius: number; // For corner smoothing
}

export interface TriggerSettings {
    type: 'Temporal' | 'Reactive';
    threshold?: number;
    frequencyBand?: 'Bass' | 'Mid' | 'Treble' | 'Full';
}

export interface ActiveTrigger {
    timestampMs: number;
    intensity: number;
}

export interface VibrationAnim {
    id: string;
    startMarkerId: string;
    endMarkerId: string;
    frequency: number;
    amplitude: number;
    edgeDamping: number;
    easing: 'Linear' | 'Exponential';
    trigger?: TriggerSettings;
    activeTriggers?: ActiveTrigger[]; // For multiple overlapping waves
}

export interface LineEntity {
    id: string;
    type: 'Line';
    vertices: Point[];
    style: EntityStyle;
    pluckOrigin: number; // 0.0 to 1.0 (percentage along the path)
    zIndex: number;
    animations: VibrationAnim[];
}

export interface ImageEntity {
    id: string;
    type: 'Image';
    zIndex: number;
    assetId: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export type CanvasEntity = LineEntity | ImageEntity;

export interface AudioTrack {
    id: string;
    name: string;
    path: string;
}

export interface AudioMarker {
    id: string;
    targetTrackId: string;
    timestampMs: number;
}

export interface AudioState {
    tracks: AudioTrack[];
    markers: AudioMarker[];
}

export interface ExportSettings {
    resolution: '1080p' | '720p';
    fps: number;
}

export interface AssetData {
    id: string;
    path: string;
    buffer?: Uint8Array;
}

export interface LogEntry {
    id: string;
    timestamp: number;
    level: 'info' | 'warn' | 'error';
    message: string;
}

export interface AppState {
    // Project Settings
    canvasWidth: number;
    canvasHeight: number;
    backgroundColor: string;
    backgroundImageAssetId: string | null;

    // Audio State
    audio: AudioState;
    liveMode: boolean;
    audioInputDeviceId: string | null;

    // Export State
    exportSettings: ExportSettings;
    isExporting: boolean;
    exportProgress: number; // 0.0 to 1.0

    // Assets
    assets: {
        images: Record<string, AssetData>;
    };

    // Domain Data
    entities: Record<string, CanvasEntity>; // Polymorphic support
    entityIds: string[]; // Maintains Z-Order (index 0 is back, length-1 is front)

    // Editor UI State
    selectedEntityId: string | null;
    activeTool: 'Select' | 'Draw' | 'EditPts';
    isDragging: boolean;
    timelineZoomLevel: number;      // Pixels per millisecond
    timelineScrollOffsetPx: number; // Horizontal scroll position
    logs: LogEntry[];

    // Actions
    updateEntityStyle: (id: string, styleUpdate: Partial<EntityStyle>) => void;
    updateEntity: (id: string, entityUpdate: Partial<CanvasEntity>) => void;
    addEntity: (entity: CanvasEntity) => void;
    deleteEntity: (id: string) => void;
    setSelectedEntityId: (id: string | null) => void;
    setActiveTool: (tool: 'Select' | 'Draw' | 'EditPts') => void;
    setIsDragging: (isDragging: boolean) => void;

    // Z-Order Actions
    bringForward: (id: string) => void;
    sendBackward: (id: string) => void;
    toFront: (id: string) => void;
    toBack: (id: string) => void;

    // Audio Actions
    addAudioTrack: (track: AudioTrack) => void;
    removeAudioTrack: (id: string) => void;
    addAudioMarker: (marker: AudioMarker) => void;
    updateAudioMarkerTime: (id: string, newTimestampMs: number) => void;
    removeAudioMarker: (id: string) => void;

    // Animation Actions
    addVibrationAnim: (entityId: string, anim: VibrationAnim) => void;
    updateVibrationAnim: (entityId: string, animId: string, updates: Partial<VibrationAnim>) => void;
    removeVibrationAnim: (entityId: string, animId: string) => void;
    updatePluckOrigin: (entityId: string, percent: number) => void;

    // Project Actions
    setBackgroundColor: (color: string) => void;
    setBackgroundImage: (assetId: string | null) => void;

    // Asset Actions
    addImageAsset: (asset: AssetData) => void;

    // Export Actions
    setExportSettings: (settings: Partial<ExportSettings>) => void;
    startExport: () => void;
    updateExportProgress: (progress: number) => void;
    finishExport: () => void;

    // Live Audio Actions
    setLiveMode: (active: boolean) => void;
    setAudioInputDeviceId: (id: string | null) => void;

    // Timeline Navigation Actions
    setTimelineZoom: (zoom: number, focusTimeMs?: number) => void;
    setTimelineScroll: (offset: number) => void;

    // Log Actions
    addLog: (level: 'info' | 'warn' | 'error', message: string) => void;
    clearLogs: () => void;
}

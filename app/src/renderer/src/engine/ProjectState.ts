import { CanvasEntity, AssetData, AudioState } from '../store/types';

export interface ProjectState {
    canvasWidth: number;
    canvasHeight: number;
    backgroundColor: string;
    backgroundImageAssetId: string | null;
    backgroundImageTransform: { x: number; y: number; scale: number };
    entities: Record<string, CanvasEntity>;
    entityIds: string[];
    assets: {
        images: Record<string, AssetData>;
    };
    audio: AudioState;
    activeTool?: string; // Optional for player
    selectedEntityId?: string | null;
}

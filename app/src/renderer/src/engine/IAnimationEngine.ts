import { LineEntity, Point, AppState } from '../store/types';

export interface IAnimationEngine {
    calculateDeformedMesh(entity: LineEntity, timestamp: number, state: AppState): Point[];
    getPluckOriginPoint(entity: LineEntity): Point | null;
    getClosestPluckPercentage(entity: LineEntity, cursorX: number, cursorY: number): number;
}

export class StubAnimationEngine implements IAnimationEngine {
    calculateDeformedMesh(entity: LineEntity, _timestamp: number, _state: AppState): Point[] {
        // Phase 1 MVP: Just return the original un-deformed vertices
        return entity.vertices;
    }
    getPluckOriginPoint(entity: LineEntity): Point | null {
        return entity.vertices.length > 0 ? entity.vertices[0] : null;
    }
    getClosestPluckPercentage(_entity: LineEntity, _cursorX: number, _cursorY: number): number {
        return 0;
    }
}

import { AppState } from '../store/types';
import { useAppStore } from '../store/useAppStore';
import { buildEntityPath } from '../utils/geometry';
import { IToolHandler } from './IToolHandler';
import { PhysicsAnimationEngine } from '../engine/PhysicsAnimationEngine';
import { OneDWaveStrategy } from '../engine/OneDWaveStrategy';


export class SelectToolHandler implements IToolHandler {
    private dragStartX = 0;
    private dragStartY = 0;
    private selectedEntityInitialState: AppState['entities'][string] | null = null;
    private isDragging = false;

    onMouseDown(e: React.MouseEvent<HTMLCanvasElement>, state: AppState, ctx: CanvasRenderingContext2D) {
        let hitId: string | null = null;

        // MVP: We need the Physics Engine to know where the waves are right now.
        // We will instantiate one locally for hit tests.
        const hitPhysicsEngine = new PhysicsAnimationEngine(new OneDWaveStrategy());
        const timeMs = 0; // The Ticker time isn't deeply accessible in React handlers easily without prop drilling. 
        // For MVP, user hit tests happen when paused or at time=0 mostly. 
        // TODO: Inject actual `lastTickMs` from the Engine somehow if we want to click flying waves.

        // Reverse checking top z-index to bottom
        for (let i = state.entityIds.length - 1; i >= 0; i--) {
            const id = state.entityIds[i];
            const entity = state.entities[id];

            if (entity && entity.type === 'Line') {
                let path = new Path2D();

                if (entity.animations && entity.animations.length > 0) {
                    const denseMesh = hitPhysicsEngine.calculateDeformedMesh(entity, timeMs, state);
                    if (denseMesh.length > 0) {
                        path.moveTo(denseMesh[0].x, denseMesh[0].y);
                        for (let j = 1; j < denseMesh.length; j++) {
                            path.lineTo(denseMesh[j].x, denseMesh[j].y);
                        }
                    }
                } else {
                    path = buildEntityPath(entity.vertices, entity.style.globalRadius);
                }

                ctx.lineWidth = Math.max(entity.style.strokeWidth, 10);
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';

                if (ctx.isPointInStroke(path, e.nativeEvent.offsetX, e.nativeEvent.offsetY)) {
                    hitId = id;
                    break;
                }
            }
        }

        useAppStore.getState().setSelectedEntityId(hitId);

        if (hitId) {
            useAppStore.getState().setIsDragging(true);
            this.isDragging = true;
            this.dragStartX = e.nativeEvent.offsetX;
            this.dragStartY = e.nativeEvent.offsetY;
            this.selectedEntityInitialState = JSON.parse(JSON.stringify(state.entities[hitId]));
        }
    }

    onMouseMove(e: React.MouseEvent<HTMLCanvasElement>, state: AppState) {
        if (!this.isDragging || !state.selectedEntityId || !this.selectedEntityInitialState) return;

        const dx = e.nativeEvent.offsetX - this.dragStartX;
        const dy = e.nativeEvent.offsetY - this.dragStartY;

        if (this.selectedEntityInitialState.type === 'Line') {
            const newVertices = this.selectedEntityInitialState.vertices.map(v => ({
                x: v.x + dx,
                y: v.y + dy
            }));
            useAppStore.getState().updateEntity(state.selectedEntityId, { vertices: newVertices });
        }
    }

    onMouseUp(_e: React.MouseEvent<HTMLCanvasElement>, _state: AppState, _ctx: CanvasRenderingContext2D) {
        this.isDragging = false;
        useAppStore.getState().setIsDragging(false);
        this.selectedEntityInitialState = null;
    }
}

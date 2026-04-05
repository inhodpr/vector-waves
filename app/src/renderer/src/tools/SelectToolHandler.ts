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
        const hitPhysicsEngine = new PhysicsAnimationEngine(new OneDWaveStrategy());
        const timeMs = 0; 

        // Use raw offsetX/offsetY — these are already in canvas pixel space
        // (CSS transforms on the parent div do NOT affect offsetX/offsetY on the canvas element)
        const ox = e.nativeEvent.offsetX;
        const oy = e.nativeEvent.offsetY;

        // Reverse checking top z-index to bottom
        for (let i = state.entityIds.length - 1; i >= 0; i--) {
            const id = state.entityIds[i];
            const entity = state.entities[id];

            if (entity && entity.type === 'Line') {
                let path = new Path2D();

                if (entity.animations && entity.animations.length > 0) {
                    const denseMesh = hitPhysicsEngine.calculateDeformedMesh(entity, timeMs, state);
                    if (denseMesh.length > 1) {
                        path.moveTo(denseMesh[0].x, denseMesh[0].y);
                        for (let j = 1; j < denseMesh.length; j++) {
                            path.lineTo(denseMesh[j].x, denseMesh[j].y);
                        }
                    } else {
                        path = buildEntityPath(entity.vertices, entity.style.globalRadius);
                    }
                } else {
                    path = buildEntityPath(entity.vertices, entity.style.globalRadius);
                }

                ctx.lineWidth = Math.max(entity.style.strokeWidth, 10);
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';

                // Reset ctx transform to identity for hit testing — path coords are in canvas space
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);

                if (ctx.isPointInStroke(path, ox, oy)) {
                    ctx.restore();
                    hitId = id;
                    break;
                }
                ctx.restore();

            } else if (entity && entity.type === 'ImageLayer') {
                const ex = entity.x;
                const ey = entity.y;
                const ew = entity.width * entity.scale;
                const eh = entity.height * entity.scale;
                
                if (ox >= ex && ox <= ex + ew &&
                    oy >= ey && oy <= ey + eh) {
                    hitId = id;
                    break;
                }
            }
        }

        useAppStore.getState().setSelectedEntityId(hitId);

        if (hitId) {
            useAppStore.getState().setIsDragging(true);
            this.isDragging = true;
            this.dragStartX = ox;
            this.dragStartY = oy;
            this.selectedEntityInitialState = JSON.parse(JSON.stringify(state.entities[hitId]));
        }
    }

    onMouseMove(e: React.MouseEvent<HTMLCanvasElement>, state: AppState) {
        if (!this.isDragging || !state.selectedEntityId || !this.selectedEntityInitialState) return;

        const ox = e.nativeEvent.offsetX;
        const oy = e.nativeEvent.offsetY;

        const dx = ox - this.dragStartX;
        const dy = oy - this.dragStartY;

        if (this.selectedEntityInitialState.type === 'Line') {
            const newVertices = this.selectedEntityInitialState.vertices.map(v => ({
                x: v.x + dx,
                y: v.y + dy
            }));
            useAppStore.getState().updateEntity(state.selectedEntityId, { vertices: newVertices });
        } else if (this.selectedEntityInitialState.type === 'ImageLayer') {
            useAppStore.getState().updateEntity(state.selectedEntityId, {
                x: (this.selectedEntityInitialState as any).x + dx,
                y: (this.selectedEntityInitialState as any).y + dy
            });
        }
    }

    onMouseUp(_e: React.MouseEvent<HTMLCanvasElement>, _state: AppState, _ctx: CanvasRenderingContext2D) {
        this.isDragging = false;
        useAppStore.getState().setIsDragging(false);
        this.selectedEntityInitialState = null;
    }

    onKeyDown(e: React.KeyboardEvent<HTMLCanvasElement>, state: AppState) {
        if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedEntityId) {
            // Delete the entity if selected
            useAppStore.getState().deleteEntity(state.selectedEntityId);
        }
    }
}

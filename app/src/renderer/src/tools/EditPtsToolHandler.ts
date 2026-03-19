import { AppState } from '../store/types';
import { useAppStore } from '../store/useAppStore';
import { IToolHandler } from './IToolHandler';
import { IAnimationEngine } from '../engine/IAnimationEngine';

export class EditPtsToolHandler implements IToolHandler {
    private animationEngine?: IAnimationEngine;
    constructor(animEngine?: IAnimationEngine) {
        this.animationEngine = animEngine;
    }
    private selectedPointIndex: number | null = null;
    private draggingEntityId: string | null = null;
    private isDraggingPluckOrigin: boolean = false;
    private isDragging: boolean = false;

    onMouseDown(e: React.MouseEvent<HTMLCanvasElement>, state: AppState) {
        const ox = e.nativeEvent.offsetX;
        const oy = e.nativeEvent.offsetY;
        const hitRadius = 8;

        // Reset tracking
        this.selectedPointIndex = null;
        this.draggingEntityId = null;

        // TL REQUIREMENT: Iterate through entityIds in REVERSE order (front-to-back)
        for (let i = state.entityIds.length - 1; i >= 0; i--) {
            const id = state.entityIds[i];
            const entity = state.entities[id];
            if (!entity || entity.type !== 'Line') continue;

            // 1. Check Pluck Origin Hit (only for the SELECTED entity if any)
            if (id === state.selectedEntityId && entity.animations && entity.animations.length > 0) {
                const v = this.animationEngine ? this.animationEngine.getPluckOriginPoint(entity) : entity.vertices[0];
                if (v) {
                    const dist = Math.sqrt(Math.pow(v.x - ox, 2) + Math.pow(v.y - oy, 2));
                    if (dist <= hitRadius + 4) {
                        this.isDraggingPluckOrigin = true;
                        this.draggingEntityId = id;
                        useAppStore.getState().setIsDragging(true);
                        return;
                    }
                }
            }

            // 2. Check Line Vertices (Global Mode)
            // TL REQUIREMENT: Hit-test against base un-deformed vertices for performance
            let hitIndex = -1;
            for (let j = 0; j < entity.vertices.length; j++) {
                const v = entity.vertices[j];
                const dist = Math.sqrt(Math.pow(v.x - ox, 2) + Math.pow(v.y - oy, 2));
                if (dist <= hitRadius) {
                    hitIndex = j;
                    break;
                }
            }

            if (hitIndex !== -1) {
                this.selectedPointIndex = hitIndex;
                this.draggingEntityId = id;
                this.isDragging = true;

                // TL REQUIREMENT: Implicit Selection
                if (state.selectedEntityId !== id) {
                    useAppStore.getState().setSelectedEntityId(id);
                }

                useAppStore.getState().setIsDragging(true);
                return; // Stop after first hit (top-most z-index)
            }
        }
    }

    onMouseMove(e: React.MouseEvent<HTMLCanvasElement>, state: AppState) {
        if (!this.draggingEntityId) return;

        const entity = state.entities[this.draggingEntityId];
        if (!entity || entity.type !== 'Line') return;

        if (this.isDraggingPluckOrigin) {
            if (entity.vertices.length >= 2) {
                if (this.animationEngine) {
                    const rawPercent = this.animationEngine.getClosestPluckPercentage(entity, e.nativeEvent.offsetX, e.nativeEvent.offsetY);
                    useAppStore.getState().updatePluckOrigin(this.draggingEntityId, rawPercent);
                } else {
                    const firstX = entity.vertices[0].x;
                    const lastX = entity.vertices[entity.vertices.length - 1].x;
                    const totalW = Math.abs(lastX - firstX);
                    let rawPercent = totalW > 0 ? Math.abs((e.nativeEvent.offsetX - firstX)) / totalW : 0;
                    useAppStore.getState().updatePluckOrigin(this.draggingEntityId, rawPercent);
                }
            }
            return;
        }

        if (this.isDragging && this.selectedPointIndex !== null) {
            const newVertices = [...entity.vertices];
            newVertices[this.selectedPointIndex] = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
            useAppStore.getState().updateEntity(this.draggingEntityId, { vertices: newVertices });
        }
    }

    onMouseUp(_e: React.MouseEvent<HTMLCanvasElement>, _state: AppState, _ctx: CanvasRenderingContext2D) {
        this.isDragging = false;
        this.isDraggingPluckOrigin = false;
        this.draggingEntityId = null;
        useAppStore.getState().setIsDragging(false);
    }

    onKeyDown(e: React.KeyboardEvent<HTMLCanvasElement>, state: AppState) {
        if ((e.key === 'Backspace' || e.key === 'Delete') && state.selectedEntityId) {
            if (this.selectedPointIndex !== null) {
                const entity = state.entities[state.selectedEntityId];
                if (entity && entity.type === 'Line') {
                    const newVertices = [...entity.vertices];
                    newVertices.splice(this.selectedPointIndex, 1);
                    if (newVertices.length < 2) {
                        useAppStore.getState().deleteEntity(state.selectedEntityId);
                    } else {
                        useAppStore.getState().updateEntity(state.selectedEntityId, { vertices: newVertices });
                    }
                    this.selectedPointIndex = null;
                }
            } else {
                useAppStore.getState().deleteEntity(state.selectedEntityId);
            }
        }
    }
}

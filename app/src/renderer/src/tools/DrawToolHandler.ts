import { AppState } from '../store/types';
import { useAppStore } from '../store/useAppStore';
import { IToolHandler } from './IToolHandler';

export class DrawToolHandler implements IToolHandler {
    private currentShapeId: string | null = null;

    onMouseDown(e: React.MouseEvent<HTMLCanvasElement>, state: AppState) {
        const ox = e.nativeEvent.offsetX;
        const oy = e.nativeEvent.offsetY;

        if (!this.currentShapeId) {
            const id = 'line_' + Date.now();
            this.currentShapeId = id;

            // Start shape with 2 identical points. First is committed, second follows the mouse.
            const state = useAppStore.getState();
            const markers = state.audio.markers;
            const defaultAnim = markers.length > 0 ? [{
                id: `anim_${Date.now()}`,
                startMarkerId: markers[0].id,
                frequency: Number((0.9 + Math.random() * 1.0).toFixed(2)),
                amplitude: Math.round(8 + Math.random() * 7),
                edgeDamping: 20,
                durationMs: 1000,
                easing: 'Exponential' as const
            }] : [];

            useAppStore.getState().addEntity({
                id,
                type: 'Line',
                vertices: [{ x: ox, y: oy }, { x: ox, y: oy }],
                style: {
                    strokeColor: (useAppStore.getState().entities[state.selectedEntityId || ''] as any)?.style?.strokeColor || '#000000',
                    strokeWidth: 5,
                    fillColor: 'transparent',
                    globalRadius: 0
                },
                pluckOrigin: 0.5,
                zIndex: state.entityIds.length,
                animations: defaultAnim
            });
            useAppStore.getState().setSelectedEntityId(id);
        } else {
            const entity = state.entities[this.currentShapeId];
            if (entity && entity.type === 'Line') {
                // Commit the current point by appending a new point that will take over following the mouse
                const newVertices = [...entity.vertices, { x: ox, y: oy }];
                useAppStore.getState().updateEntity(this.currentShapeId, { vertices: newVertices });
            } else {
                this.currentShapeId = null;
                this.onMouseDown(e, state);
            }
        }
    }

    onMouseMove(e: React.MouseEvent<HTMLCanvasElement>, state: AppState) {
        if (!this.currentShapeId) return;

        const entity = state.entities[this.currentShapeId];
        if (entity && entity.type === 'Line') {
            const newVertices = [...entity.vertices];
            // Ensure the last uncommitted point tracks the mouse dynamically
            newVertices[newVertices.length - 1] = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
            useAppStore.getState().updateEntity(this.currentShapeId, { vertices: newVertices });
        }
    }

    onMouseUp(_e: React.MouseEvent<HTMLCanvasElement>, _state: AppState, _ctx: CanvasRenderingContext2D) {
        // Intentionally empty. The user clicking down sets the point, we don't finish drawing on mouse-up.
    }

    onKeyDown(e: React.KeyboardEvent<HTMLCanvasElement>, state: AppState) {
        if (e.key === 'Escape' || e.key === 'Enter') {
            this.finishDrawing(state);
        }
    }

    private finishDrawing(state: AppState) {
        if (!this.currentShapeId) return;

        const entity = state.entities[this.currentShapeId];
        if (entity && entity.type === 'Line') {
            const newVertices = [...entity.vertices];
            // Pop the final uncommitted point that was tracking the mouse
            newVertices.pop();

            if (newVertices.length < 2) {
                useAppStore.getState().deleteEntity(this.currentShapeId);
            } else {
                useAppStore.getState().updateEntity(this.currentShapeId, { vertices: newVertices });
            }
        }
        this.currentShapeId = null;
    }
}

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DrawToolHandler } from './DrawToolHandler';
import { useAppStore } from '../store/useAppStore';

describe('DrawToolHandler', () => {
    let handler: DrawToolHandler;

    beforeEach(() => {
        handler = new DrawToolHandler();
        useAppStore.setState({
            entityIds: [],
            entities: {},
            selectedEntityId: null
        });
    });

    const createMouseEvent = (x: number, y: number) => ({
        nativeEvent: { offsetX: x, offsetY: y },
        preventDefault: vi.fn()
    } as any);

    it('should start drawing a line on mouseDown', () => {
        handler.onMouseDown(createMouseEvent(10, 20), useAppStore.getState());
        
        const state = useAppStore.getState();
        expect(state.entityIds.length).toBe(1);
        const line = state.entities[state.entityIds[0]] as any;
        expect(line.type).toBe('Line');
        expect(line.vertices).toEqual([{ x: 10, y: 20 }, { x: 10, y: 20 }]);
    });

    it('should track mouse movement for the last point', () => {
        handler.onMouseDown(createMouseEvent(10, 20), useAppStore.getState());
        handler.onMouseMove(createMouseEvent(30, 40), useAppStore.getState());
        
        const state = useAppStore.getState();
        const line = state.entities[state.entityIds[0]] as any;
        expect(line.vertices).toEqual([{ x: 10, y: 20 }, { x: 30, y: 40 }]);
    });

    it('should add points on subsequent mouseDown', () => {
        handler.onMouseDown(createMouseEvent(10, 20), useAppStore.getState());
        handler.onMouseDown(createMouseEvent(50, 60), useAppStore.getState());
        
        const state = useAppStore.getState();
        const line = state.entities[state.entityIds[0]] as any;
        // Should have 3 points now: [10,20] (initial), [10,20] (trailing), [50,60] (committed)
        expect(line.vertices.length).toBe(3);
        expect(line.vertices[2]).toEqual({ x: 50, y: 60 });
    });

    it('should finish drawing on Enter', () => {
        handler.onMouseDown(createMouseEvent(10, 20), useAppStore.getState());
        handler.onMouseDown(createMouseEvent(50, 60), useAppStore.getState());
        
        handler.onKeyDown({ key: 'Enter' } as any, useAppStore.getState());
        
        const state = useAppStore.getState();
        const line = state.entities[state.entityIds[0]] as any;
        expect(line.vertices.length).toBe(2); // The uncommitted last point should be removed
        expect((handler as any).currentShapeId).toBeNull();
    });

    it('should delete entity if finished with < 2 points', () => {
        handler.onMouseDown(createMouseEvent(10, 20), useAppStore.getState());
        handler.onKeyDown({ key: 'Escape' } as any, useAppStore.getState());
        
        const state = useAppStore.getState();
        expect(state.entityIds.length).toBe(0);
    });
});

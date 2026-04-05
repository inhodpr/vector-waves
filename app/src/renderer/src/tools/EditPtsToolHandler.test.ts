import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EditPtsToolHandler } from './EditPtsToolHandler';
import { useAppStore } from '../store/useAppStore';

describe('EditPtsToolHandler', () => {
    let handler: EditPtsToolHandler;
    let mockAnimEngine: any;

    beforeEach(() => {
        mockAnimEngine = {
            getPluckOriginPoint: vi.fn().mockReturnValue({ x: 50, y: 10 }),
            getClosestPluckPercentage: vi.fn().mockReturnValue(0.7)
        };
        handler = new EditPtsToolHandler(mockAnimEngine);
        
        useAppStore.setState({
            entityIds: ['l1'],
            entities: {
                'l1': {
                    id: 'l1',
                    type: 'Line',
                    vertices: [{ x: 10, y: 10 }, { x: 100, y: 10 }],
                    style: { strokeWidth: 5, strokeColor: '#000000', globalRadius: 0 },
                    animations: [{ id: 'a1' }], // triggers pluck origin logic
                    pluckOrigin: 0.5
                }
            } as any,
            selectedEntityId: 'l1'
        });
    });

    const createMouseEvent = (x: number, y: number) => ({
        nativeEvent: { offsetX: x, offsetY: y }
    } as any);

    it('should select a vertex on mouseDown', () => {
        handler.onMouseDown(createMouseEvent(10, 10), useAppStore.getState());
        expect((handler as any).selectedPointIndex).toBe(0);
        expect((handler as any).draggingEntityId).toBe('l1');
    });

    it('should drag a vertex on mouseMove', () => {
        handler.onMouseDown(createMouseEvent(10, 10), useAppStore.getState());
        handler.onMouseMove(createMouseEvent(15, 20), useAppStore.getState());
        
        const line = useAppStore.getState().entities['l1'] as any;
        expect(line.vertices[0]).toEqual({ x: 15, y: 20 });
    });

    it('should select and drag pluck origin handle', () => {
        // Mock engine says origin is at 50, 10. Hit it.
        handler.onMouseDown(createMouseEvent(50, 10), useAppStore.getState());
        expect((handler as any).isDraggingPluckOrigin).toBe(true);
        
        handler.onMouseMove(createMouseEvent(70, 10), useAppStore.getState());
        const line = useAppStore.getState().entities['l1'] as any;
        expect(line.pluckOrigin).toBe(0.7); // From mockAnimEngine.getClosestPluckPercentage
    });

    it('should delete selected vertex on Backspace', () => {
        handler.onMouseDown(createMouseEvent(10, 10), useAppStore.getState());
        handler.onKeyDown({ key: 'Backspace' } as any, useAppStore.getState());
        
        // After deleting the second-to-last vertex, the line has only 1 left, 
        // which triggers deletion of the entire entity.
        expect(useAppStore.getState().entityIds).not.toContain('l1');
    });

    it('should delete entire entity if Backspace with no vertex selected', () => {
        (handler as any).selectedPointIndex = null;
        handler.onKeyDown({ key: 'Delete' } as any, useAppStore.getState());
        expect(useAppStore.getState().entityIds.length).toBe(0);
    });
});

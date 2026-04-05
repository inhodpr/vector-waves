import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SelectToolHandler } from './SelectToolHandler';
import { useAppStore } from '../store/useAppStore';

describe('SelectToolHandler', () => {
    let handler: SelectToolHandler;
    let mockContext: any;

    beforeEach(() => {
        handler = new SelectToolHandler();
        mockContext = {
            isPointInStroke: vi.fn().mockReturnValue(false),
            lineWidth: 0,
            lineJoin: '',
            lineCap: ''
        };
        useAppStore.setState({
            entityIds: ['l1'],
            entities: {
                'l1': {
                    id: 'l1',
                    type: 'Line',
                    vertices: [{ x: 10, y: 10 }, { x: 100, y: 100 }],
                    style: { strokeWidth: 5, strokeColor: '#000000', globalRadius: 0 },
                    animations: []
                }
            } as any,
            selectedEntityId: null,
            isDragging: false
        });
    });

    const createMouseEvent = (x: number, y: number) => ({
        nativeEvent: { offsetX: x, offsetY: y },
        preventDefault: vi.fn()
    } as any);

    it('should select an entity on hit', () => {
        mockContext.isPointInStroke.mockReturnValue(true);
        handler.onMouseDown(createMouseEvent(15, 15), useAppStore.getState(), mockContext);
        
        expect(useAppStore.getState().selectedEntityId).toBe('l1');
        expect(useAppStore.getState().isDragging).toBe(true);
    });

    it('should deselect if no hit', () => {
        mockContext.isPointInStroke.mockReturnValue(false);
        handler.onMouseDown(createMouseEvent(200, 200), useAppStore.getState(), mockContext);
        
        expect(useAppStore.getState().selectedEntityId).toBeNull();
    });

    it('should drag selected entity', () => {
        // First select it
        mockContext.isPointInStroke.mockReturnValue(true);
        handler.onMouseDown(createMouseEvent(10, 10), useAppStore.getState(), mockContext);
        
        // Then move mouse
        handler.onMouseMove(createMouseEvent(20, 30), useAppStore.getState());
        
        const state = useAppStore.getState();
        const line = state.entities['l1'] as any;
        // dx=10, dy=20
        expect(line.vertices[0]).toEqual({ x: 20, y: 30 });
        expect(line.vertices[1]).toEqual({ x: 110, y: 120 });
    });

    it('should stop dragging on mouseUp', () => {
        mockContext.isPointInStroke.mockReturnValue(true);
        handler.onMouseDown(createMouseEvent(10, 10), useAppStore.getState(), mockContext);
        handler.onMouseUp(createMouseEvent(10, 10), useAppStore.getState(), mockContext);
        
        expect(useAppStore.getState().isDragging).toBe(false);
        expect((handler as any).isDragging).toBe(false);
    });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../store/useAppStore';
import { EditPtsToolHandler } from './EditPtsToolHandler';
import { AppState } from '../store/types';

describe('EditPtsToolHandler Global Selection', () => {
    beforeEach(() => {
        useAppStore.setState({
            entities: {
                'line1': {
                    id: 'line1',
                    type: 'Line',
                    vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
                    style: { strokeColor: 'red', strokeWidth: 2, fillColor: '', globalRadius: 0 },
                    zIndex: 0,
                    animations: []
                },
                'line2': {
                    id: 'line2',
                    type: 'Line',
                    vertices: [{ x: 50, y: 50 }, { x: 150, y: 50 }],
                    style: { strokeColor: 'blue', strokeWidth: 2, fillColor: '', globalRadius: 0 },
                    zIndex: 1, // Higher Z
                    animations: []
                }
            },
            entityIds: ['line1', 'line2'],
            selectedEntityId: 'line1',
            activeTool: 'EditPts'
        });
    });

    it('performs implicit selection when clicking vertex of another shape', () => {
        const handler = new EditPtsToolHandler();
        const state = useAppStore.getState();

        // Mock a click on line2's first vertex (50, 50)
        const mockEvent = {
            nativeEvent: { offsetX: 50, offsetY: 50 }
        } as any;

        handler.onMouseDown(mockEvent, state);

        expect(useAppStore.getState().selectedEntityId).toBe('line2');
    });

    it('respects reverse Z-order when vertices overlap', () => {
        // Mock an overlap: line1 and line2 both have a vertex at (10, 10)
        useAppStore.setState({
            entities: {
                'line1': {
                    id: 'line1', type: 'Line', vertices: [{ x: 10, y: 10 }],
                    style: {} as any, zIndex: 0, animations: []
                },
                'line2': {
                    id: 'line2', type: 'Line', vertices: [{ x: 10, y: 10 }],
                    style: {} as any, zIndex: 1, animations: []
                }
            },
            entityIds: ['line1', 'line2']
        });

        const handler = new EditPtsToolHandler();
        const state = useAppStore.getState();
        const mockEvent = { nativeEvent: { offsetX: 10, offsetY: 10 } } as any;

        handler.onMouseDown(mockEvent, state);

        // Should pick line2 (front-most)
        expect(useAppStore.getState().selectedEntityId).toBe('line2');
    });
});

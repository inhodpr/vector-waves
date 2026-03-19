import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../store/useAppStore';

describe('Timeline Navigation Math', () => {
    beforeEach(() => {
        useAppStore.setState({
            timelineZoomLevel: 10,
            timelineScrollOffsetPx: 0
        });
    });

    it('calculates centered zoom offset correctly (no drift)', () => {
        const state = useAppStore.getState();

        // Scenario: Cursor is at screen X=400. 
        // Initial zoom 10. Scroll 0. 
        // timeAtMouse = 400 / 10 = 40ms.
        const focusTimeMs = 40;

        // Zoom in to 20.
        // New playhead position should be 40ms * 20 = 800px.
        // To keep it at screen X=400, scroll must jump to 400px.
        state.setTimelineZoom(20, focusTimeMs);

        const newState = useAppStore.getState();
        expect(newState.timelineZoomLevel).toBe(20);
        expect(newState.timelineScrollOffsetPx).toBe(400);
    });

    it('uses Math.floor to prevent sub-pixel drift', () => {
        const state = useAppStore.getState();

        // Scenario with fractional zoom/time
        // timeAtMouse = 40.5ms. Zoom = 10.5.
        // playhead = 425.25. 
        state.setTimelineZoom(10.5, 40.5);

        const newState = useAppStore.getState();
        expect(Number.isInteger(newState.timelineScrollOffsetPx)).toBe(true);
    });
});

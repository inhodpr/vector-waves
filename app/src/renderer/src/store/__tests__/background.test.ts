import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../useAppStore';

describe('Background and Canvas State', () => {
    beforeEach(() => {
        // Reset state before each test
        const state = useAppStore.getState();
        state.setCanvasSize(1080, 1080);
        state.setBackgroundColor('#000000');
        state.setBackgroundImage(null);
        state.setBackgroundImageTransform({ x: 0, y: 0, scale: 1 });
    });

    it('should set canvas size correctly', () => {
        const store = useAppStore.getState();
        store.setCanvasSize(1920, 1080);
        
        expect(useAppStore.getState().canvasWidth).toBe(1920);
        expect(useAppStore.getState().canvasHeight).toBe(1080);
    });

    it('should update background color', () => {
        const store = useAppStore.getState();
        store.setBackgroundColor('#ff0000');
        
        expect(useAppStore.getState().backgroundColor).toBe('#ff0000');
    });

    it('should update background image transform', () => {
        const store = useAppStore.getState();
        const newTransform = { x: 100, y: -50, scale: 2.5 };
        store.setBackgroundImageTransform(newTransform);
        
        expect(useAppStore.getState().backgroundImageTransform).toEqual(newTransform);
    });

    it('should toggle background edit mode', () => {
        const store = useAppStore.getState();
        store.setBackgroundEditMode(true);
        expect(useAppStore.getState().backgroundEditMode).toBe(true);
        
        store.setBackgroundEditMode(false);
        expect(useAppStore.getState().backgroundEditMode).toBe(false);
    });
});

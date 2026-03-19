import { describe, it, expect, vi } from 'vitest';
(global as any).jest = vi;
import 'jest-canvas-mock';
import { CanvasEngine } from './CanvasEngine';
import { StubAnimationEngine } from './IAnimationEngine';
import { EventBus } from './EventBus';
import { useAppStore } from '../store/useAppStore';

describe('CanvasEngine', () => {
    it('should apply the correct stroke color based on Zustand state', () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;

        useAppStore.setState({
            canvasWidth: 800, canvasHeight: 600, backgroundColor: '#000',
            entityIds: ['shp1'],
            entities: {
                'shp1': {
                    id: 'shp1', type: 'Line',
                    vertices: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
                    style: { strokeColor: '#FF0000', strokeWidth: 2, fillColor: '', globalRadius: 0 },
                    pluckOrigin: 0, zIndex: 0, animations: []
                }
            }
        });

        const engine = new CanvasEngine(canvas, useAppStore, new EventBus(), new StubAnimationEngine());

        engine.draw();

        const calls = ctx.__getDrawCalls();
        const hasStroke = calls.some((call: any) => call.type === 'stroke');
        expect(hasStroke).toBe(true);
        expect(ctx.strokeStyle).toBe('#ff0000');
    });
});

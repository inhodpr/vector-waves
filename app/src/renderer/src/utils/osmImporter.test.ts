import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock context for the canvas
class MockContext {
    scale = vi.fn();
    translate = vi.fn();
    beginPath = vi.fn();
    moveTo = vi.fn();
    lineTo = vi.fn();
    stroke = vi.fn();
    closePath = vi.fn();
    set strokeStyle(v: string) {}
    set lineWidth(v: number) {}
    set lineJoin(v: string) {}
    set lineCap(v: string) {}
}

const mockCtx = new MockContext();

class MockOffscreenCanvas {
    width: number;
    height: number;
    constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
    }
    getContext() { return mockCtx; }
    convertToBlob() { return Promise.resolve(new Blob(['test'], { type: 'image/webp' })); }
}

// Stub globals BEFORE importing the module under test
vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);
vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:mock-url'),
    revokeObjectURL: vi.fn()
});

// Now import the module
import { rasterizeOSMLayers, MAX_RASTER_ZOOM_LEVEL } from './osmImporter';

describe('osmImporter', () => {
    const mockGeoJSON = {
        type: 'FeatureCollection',
        features: [
            {
                geometry: { type: 'LineString', coordinates: [[10, 10], [20, 20]] },
                properties: { category: 'transport' }
            }
        ]
    };

    it('should enforce MAX_RASTER_ZOOM_LEVEL', async () => {
        const bounds = { panX: 0, panY: 0, width: 100, height: 100 };
        const results = await rasterizeOSMLayers(mockGeoJSON, 1000, 1000, 50, bounds);
        
        // Capped width = 100 * 10 = 1000
        expect(results).toBeDefined();
    });

    it('should cull features outside the visible viewport', async () => {
        const bounds = { panX: 0, panY: 0, width: 100, height: 100 };
        const results = await rasterizeOSMLayers(mockGeoJSON, 1000, 1000, 1, bounds);
        
        expect(results).toBeDefined();
        expect(results['default']).toBe('blob:mock-url');
    });

    it('should respect viewport translation and scale', async () => {
        const bounds = { panX: 50, panY: 50, width: 100, height: 100 };
        await rasterizeOSMLayers(mockGeoJSON, 1000, 1000, 2, bounds);
        
        // The mockCtx should have been called with translation and scale
        expect(mockCtx.scale).toHaveBeenCalledWith(2, 2);
        expect(mockCtx.translate).toHaveBeenCalledWith(-50, -50);
    });
});

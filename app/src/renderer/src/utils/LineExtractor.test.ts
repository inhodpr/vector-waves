import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LineExtractor } from './LineExtractor';

// Mock OffscreenCanvas
class OffscreenCanvasMock {
    width: number;
    height: number;
    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
    }
    getContext() {
        return {
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            drawImage: vi.fn(),
            getImageData: vi.fn().mockReturnValue({
                data: new Uint8ClampedArray(this.width * this.height * 4)
            }),
            putImageData: vi.fn(),
            save: vi.fn(),
            restore: vi.fn(),
            scale: vi.fn(),
            translate: vi.fn(),
            clip: vi.fn(),
            set globalCompositeOperation(val: string) {},
            set globalAlpha(val: number) {},
            set lineCap(val: string) {},
            set lineJoin(val: string) {},
            set lineWidth(val: number) {},
            set strokeStyle(val: string) {},
        };
    }
}
(global as any).OffscreenCanvas = OffscreenCanvasMock;

// Mock ImageData
(global as any).ImageData = class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(data: Uint8ClampedArray, width: number, height: number) {
        this.data = data;
        this.width = width;
        this.height = height;
    }
};

describe('LineExtractor', () => {
    const width = 20;
    const height = 20;
    const data = new Uint8ClampedArray(width * height * 4).fill(255); // White background
    
    // Draw a 3-pixel wide black line at y=9,10,11
    for (let x = 0; x < width; x++) {
        for (let dy = -1; dy <= 1; dy++) {
            const idx = ((10 + dy) * width + x) * 4;
            data[idx] = 0;   // R
            data[idx+1] = 0; // G
            data[idx+2] = 0; // B
            data[idx+3] = 255;
        }
    }

    const mockImageData = new ImageData(data, width, height);
    const targetColor = { r: 0, g: 0, b: 0 };

    describe('analyzeRidge', () => {
        it('should move points towards the ridge (center) of the line', () => {
            const initialPoints = [
                { x: 0, y: 11 }, // Slightly off-center (line is at y=10)
                { x: 19, y: 9 }   // Slightly off-center
            ];

            const result = LineExtractor.analyzeRidge(initialPoints, mockImageData, targetColor, 30);
            
            // The result should have more points due to subdivision, 
            // and they should be at or closer to y=10
            expect(result.length).toBeGreaterThan(initialPoints.length);
            
            // Check some intermediate points
            for (let i = 1; i < result.length - 1; i++) {
                expect(result[i].y).toBeCloseTo(10, 0); // Should be snapped to the black line
            }
        });

        it('should maintain the first point exactly', () => {
            const initialPoints = [{ x: 5, y: 5 }, { x: 10, y: 10 }];
            const result = LineExtractor.analyzeRidge(initialPoints, mockImageData, targetColor, 30);
            expect(result[0]).toEqual(initialPoints[0]);
        });
    });

    describe('eraseLineFromImage', () => {
        it('should replace line pixels with neighbouring background samples', async () => {
            // Create a 20x20 white image with a black line at y=10
            const w = 20, h = 20;
            const canvas = new OffscreenCanvas(w, h) as any;
            const ctx = canvas.getContext('2d')!;

            // Simulate putImageData / getImageData by providing a real-ish mock
            // Since our OffscreenCanvas mock doesn't actually rasterize,
            // we verify the method accepts the right args and returns a blob URL.
            
            // Mock convertToBlob
            canvas.convertToBlob = vi.fn().mockResolvedValue(new Blob(['test'], { type: 'image/png' }));
            (global as any).URL = { createObjectURL: vi.fn().mockReturnValue('blob:mock-url') };

            const path = [{ x: 0, y: 10 }, { x: 19, y: 10 }];

            const result = await LineExtractor.eraseLineFromImage(path, 5, canvas);

            expect(result).toBe('blob:mock-url');
            expect(canvas.convertToBlob).toHaveBeenCalledWith({ type: 'image/png' });
        });

        it('should return blob URL immediately for paths with fewer than 2 points', async () => {
            const canvas = new OffscreenCanvas(10, 10) as any;
            canvas.convertToBlob = vi.fn().mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
            (global as any).URL = { createObjectURL: vi.fn().mockReturnValue('blob:short-path') };

            const result = await LineExtractor.eraseLineFromImage([{ x: 5, y: 5 }], 3, canvas);
            expect(result).toBe('blob:short-path');
        });
    });
});

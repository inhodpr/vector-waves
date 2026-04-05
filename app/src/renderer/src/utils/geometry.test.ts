import { describe, it, expect, vi } from 'vitest';
import { buildEntityPath } from './geometry';

describe('geometry', () => {
    describe('buildEntityPath', () => {
        it('should return empty path for < 2 vertices', () => {
            const path = buildEntityPath([], 10);
            expect(path).toBeDefined();
            // Path2D is mocked in test-setup.ts
        });

        it('should draw a simple line for 2 vertices', () => {
            const vertices = [{ x: 0, y: 0 }, { x: 100, y: 100 }];
            const path = buildEntityPath(vertices, 0);
            expect(path.moveTo).toHaveBeenCalledWith(0, 0);
            expect(path.lineTo).toHaveBeenCalledWith(100, 100);
        });

        it('should use arcTo for rounded corners with > 2 vertices', () => {
            const vertices = [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 100 }
            ];
            const path = buildEntityPath(vertices, 10);
            expect(path.arcTo).toHaveBeenCalledWith(100, 0, 100, 100, 10);
        });

        it('should clamp radius if segments are too short', () => {
            const vertices = [
                { x: 0, y: 0 },
                { x: 10, y: 0 },
                { x: 10, y: 10 }
            ];
            // segments are length 10. max radius is 5.
            const path = buildEntityPath(vertices, 50);
            expect(path.arcTo).toHaveBeenCalledWith(10, 0, 10, 10, 5);
        });
    });
});

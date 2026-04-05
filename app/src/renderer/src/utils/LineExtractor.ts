import { Point } from '../store/types';

export interface RGB {
    r: number;
    g: number;
    b: number;
}

export class LineExtractor {
    /**
     * Finds the ridge (center) of a line between given points by analyzing image data.
     */
    public static analyzeRidge(
        points: Point[],
        imageData: ImageData,
        targetColor: RGB,
        tolerance: number
    ): Point[] {
        if (points.length < 2) return points;

        const { width, height, data } = imageData;
        const u32Data = new Uint32Array(data.buffer);
        
        // 1. Pre-process: Apply Gaussian Blur (simple 3x3 for performance)
        const blurredData = this.applyBlur(u32Data, width, height);

        const result: Point[] = [];
        result.push(points[0]);

        for (let i = 0; i < points.length - 1; i++) {
            const start = points[i];
            const end = points[i + 1];
            
            // Subdivide the segment to find ridge points more accurately
            const dist = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
            const steps = Math.max(1, Math.floor(dist / 5)); // Every 5 pixels

            for (let s = 1; s <= steps; s++) {
                const t = s / steps;
                const p = {
                    x: start.x + (end.x - start.x) * t,
                    y: start.y + (end.y - start.y) * t
                };

                // Direction constraint: vector from previous point to current
                const prev = result[result.length - 1];
                const dir = { x: p.x - prev.x, y: p.y - prev.y };
                const dirLen = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
                const dirNorm = dirLen > 0 ? { x: dir.x / dirLen, y: dir.y / dirLen } : { x: 0, y: 0 };

                // Search 7x7 grid
                const ridgePoint = this.findLocalRidge(
                    p, 
                    blurredData, 
                    width, 
                    height, 
                    targetColor, 
                    tolerance,
                    dirNorm
                );
                result.push(ridgePoint);
            }
        }

        // Apply a moving average smoothing to eliminate high-frequency waviness
        const smoothed = this.smoothPath(result, 5);
        console.log(`[EXTRACTOR] Trace complete. Extracted ${result.length} points. Yielded ${smoothed.length} smoothed points.`);
        return smoothed;
    }

    private static smoothPath(points: Point[], iterations: number): Point[] {
        if (points.length < 3) return points;
        let iterPoints = [...points];
        
        for (let it = 0; it < iterations; it++) {
            const smoothed = [iterPoints[0]];
            for (let i = 1; i < iterPoints.length - 1; i++) {
                smoothed.push({
                    x: (iterPoints[i - 1].x + iterPoints[i].x + iterPoints[i + 1].x) / 3,
                    y: (iterPoints[i - 1].y + iterPoints[i].y + iterPoints[i + 1].y) / 3
                });
            }
            smoothed.push(iterPoints[iterPoints.length - 1]);
            iterPoints = smoothed;
        }
        
        return iterPoints;
    }

    /**
     * Erases a line from the source image by painting over it with mirror-sampled
     * neighboring pixels.  Returns a blob URL of the modified image.
     *
     * @param path       Ridge path in **layer-local** coordinates
     * @param strokeWidth  Width of the line to erase (pixels)
     * @param sourceCanvas OffscreenCanvas containing the layer image (mutated in-place)
     * @returns A blob URL pointing to the modified image
     */
    public static async eraseLineFromImage(
        path: Point[],
        strokeWidth: number,
        sourceCanvas: OffscreenCanvas
    ): Promise<Uint8Array> {
        if (path.length < 2) {
            const blob = await sourceCanvas.convertToBlob({ type: 'image/png' });
            const arrayBuffer = await blob.arrayBuffer();
            return new Uint8Array(arrayBuffer);
        }

        const w = sourceCanvas.width;
        const h = sourceCanvas.height;
        const ctx = sourceCanvas.getContext('2d')!;

        // 1. Build a mask canvas that marks the line area to erase
        const maskCanvas = new OffscreenCanvas(w, h);
        const maskCtx = maskCanvas.getContext('2d')!;
        maskCtx.lineCap = 'round';
        maskCtx.lineJoin = 'round';
        maskCtx.lineWidth = strokeWidth + 4; // slightly wider for clean coverage
        maskCtx.strokeStyle = 'white';

        maskCtx.beginPath();
        maskCtx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
            maskCtx.lineTo(path[i].x, path[i].y);
        }
        maskCtx.stroke();

        // 2. Read mask to identify which pixels need healing
        const maskData = maskCtx.getImageData(0, 0, w, h).data;

        // 3. Snapshot the original pixels before any modification
        const origData = ctx.getImageData(0, 0, w, h);
        const orig = origData.data;

        // 4. For every masked pixel, replace with an average of nearby non-masked pixels
        const shift = strokeWidth + 5;
        const result = new Uint8ClampedArray(orig);

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const mi = (y * w + x) * 4;
                if (maskData[mi + 3] === 0) continue; // not on the stroke

                // Sample 4 neighbours offset by `shift` in cardinal directions
                let rSum = 0, gSum = 0, bSum = 0, aSum = 0, count = 0;
                const offsets = [
                    [x + shift, y], [x - shift, y],
                    [x, y + shift], [x, y - shift]
                ];
                for (const [sx, sy] of offsets) {
                    if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
                    const si = (sy * w + sx) * 4;
                    // Skip samples that are themselves on the stroke
                    if (maskData[si + 3] > 0) continue;
                    rSum += orig[si];
                    gSum += orig[si + 1];
                    bSum += orig[si + 2];
                    aSum += orig[si + 3];
                    count++;
                }

                if (count > 0) {
                    result[mi]     = rSum / count;
                    result[mi + 1] = gSum / count;
                    result[mi + 2] = bSum / count;
                    result[mi + 3] = aSum / count;
                }
            }
        }

        // 5. Write the healed pixels back to the source canvas
        ctx.putImageData(new ImageData(result, w, h), 0, 0);

        // 6. Export as Uint8Array (PNG)
        const blob = await sourceCanvas.convertToBlob({ type: 'image/png' });
        const arrayBuffer = await blob.arrayBuffer();
        return new Uint8Array(arrayBuffer);
    }


    private static findLocalRidge(
        p: Point,
        data: Uint32Array,
        width: number,
        height: number,
        target: RGB,
        tolerance: number,
        dirNorm: Point
    ): Point {
        let bestPoint = p;
        let minDiff = Infinity;

        const targetU32 = (255 << 24) | (target.b << 16) | (target.g << 8) | target.r;

        for (let dy = -3; dy <= 3; dy++) {
            for (let dx = -3; dx <= 3; dx++) {
                const nx = Math.floor(p.x + dx);
                const ny = Math.floor(p.y + dy);

                if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

                const color = data[ny * width + nx];
                const r = color & 0xFF;
                const g = (color >> 8) & 0xFF;
                const b = (color >> 16) & 0xFF;

                const diff = Math.sqrt(
                    Math.pow(r - target.r, 2) +
                    Math.pow(g - target.g, 2) +
                    Math.pow(b - target.b, 2)
                );

                // Directional Continuity: penalize points far from the expected direction
                const dot = (dx * dirNorm.x + dy * dirNorm.y);
                const distToLine = Math.sqrt(dx * dx + dy * dy - dot * dot);
                
                const score = diff + distToLine * 2; // Weight distance to line

                if (score < minDiff) {
                    minDiff = score;
                    bestPoint = { x: nx, y: ny };
                }
            }
        }

        return bestPoint;
    }

    private static applyBlur(data: Uint32Array, width: number, height: number): Uint32Array {
        const result = new Uint32Array(data.length);
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let r = 0, g = 0, b = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const color = data[(y + dy) * width + (x + dx)];
                        r += color & 0xFF;
                        g += (color >> 8) & 0xFF;
                        b += (color >> 16) & 0xFF;
                    }
                }
                result[y * width + x] = (255 << 24) | ((b / 9) << 16) | ((g / 9) << 8) | (r / 9);
            }
        }
        return result;
    }
}

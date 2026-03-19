import React, { useRef, useEffect } from 'react';

interface WaveformRendererProps {
    pcmData: Float32Array;
    zoomLevel: number;        // pixels per millisecond
    viewportOffsetMs: number; // The current scroll position of the timeline
    width: number;            // The fixed pixel width of the canvas element
    height: number;
    color?: string;
}

export const WaveformRenderer: React.FC<WaveformRendererProps> = ({
    pcmData,
    zoomLevel,
    viewportOffsetMs,
    width,
    height,
    color = '#4CAF50'
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear previous frame
        ctx.clearRect(0, 0, width, height);

        if (!pcmData || pcmData.length === 0) return;

        // --- Culling & Windowing Math ---
        // 1. Calculate how many milliseconds fit on screen
        const viewportDurationMs = width / zoomLevel;
        const endViewportMs = viewportOffsetMs + viewportDurationMs;

        // 2. Map time window to Float32Array indices
        // Assuming standard 44.1kHz audio (44.1 samples per ms)
        // Note: For production, we'd pull the actual sample rate from the AudioBuffer. 
        // We'll hardcode a standard assumption for Phase 2 MVP.
        const samplesPerMs = 44.1;

        const startIndex = Math.max(0, Math.floor(viewportOffsetMs * samplesPerMs));
        const endIndex = Math.min(pcmData.length, Math.ceil(endViewportMs * samplesPerMs));

        if (startIndex >= endIndex) return;

        // 3. Draw
        ctx.fillStyle = color;
        const halfHeight = height / 2;

        // We don't draw every single sample (too dense), we draw buckets (peaks) per pixel
        const samplesPerPixel = (endIndex - startIndex) / width;

        ctx.beginPath();
        for (let x = 0; x < width; x++) {
            let maxPos = 0;
            let minNeg = 0;

            // Find max/min in this pixel bucket
            const bucketStart = Math.floor(startIndex + (x * samplesPerPixel));
            const bucketEnd = Math.floor(bucketStart + samplesPerPixel);

            for (let i = bucketStart; i < bucketEnd && i < pcmData.length; i++) {
                const val = pcmData[i];
                if (val > maxPos) maxPos = val;
                if (val < minNeg) minNeg = val;
            }

            // Draw line for this column
            const y1 = halfHeight - (maxPos * halfHeight);
            const y2 = halfHeight - (minNeg * halfHeight);

            ctx.moveTo(x, y1);
            ctx.lineTo(x, y2);
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();

    }, [pcmData, zoomLevel, viewportOffsetMs, width, height, color]);

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            style={{ display: 'block', backgroundColor: '#1E1E1E' }}
        />
    );
};

import { Point } from '../store/types';

export const MAX_RASTER_ZOOM_LEVEL = 10;

/**
 * Generates compressed WebP blobs from raw OSM vectors via OffscreenCanvas.
 * Implements viewport culling and zoom limits to optimize memory usage.
 */
export async function rasterizeOSMLayers(
    geoJSON: any, 
    baseWidth: number, 
    baseHeight: number, 
    targetZoom: number,
    viewportBounds: { panX: number; panY: number; width: number; height: number }
): Promise<Record<string, Uint8Array>> {
    const zoom = Math.min(targetZoom, MAX_RASTER_ZOOM_LEVEL);
    
    // The resulting canvas size matches the visible viewport * zoom
    const canvasWidth = Math.ceil(viewportBounds.width * zoom);
    const canvasHeight = Math.ceil(viewportBounds.height * zoom);
    
    // Grouped by category as per map_processor.py output
    const results: Record<string, string> = {};
    const categories = Object.keys(geoJSON.features || {}); // Assuming features grouped by category

    // If features are not grouped, we might need to handle a standard GeoJSON FeatureCollection
    const featureGroups = geoJSON.type === 'FeatureCollection' 
        ? { 'default': geoJSON.features } 
        : geoJSON;

    for (const [category, features] of Object.entries(featureGroups)) {
        if (!Array.isArray(features)) continue;

        const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d')!;

        // 1. Setup transform: Map project coordinates [panX, panX+width] to [0, canvasWidth]
        ctx.scale(zoom, zoom);
        ctx.translate(-viewportBounds.panX, -viewportBounds.panY);

        // 2. Draw features
        ctx.strokeStyle = getCategoryColor(category);
        ctx.lineWidth = 1.5 / zoom; // Maintain sharp lines regardless of zoom
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        features.forEach((feature: any) => {
            if (feature.geometry.type === 'LineString') {
                const coords = feature.geometry.coordinates;
                if (!coords || coords.length < 2) return;

                // Simple Viewport Culling: Check if bounding box of line intersects viewport
                if (!intersects(coords, viewportBounds)) return;

                ctx.beginPath();
                ctx.moveTo(coords[0][0], coords[0][1]);
                for (let i = 1; i < coords.length; i++) {
                    ctx.lineTo(coords[i][0], coords[i][1]);
                }
                ctx.stroke();
            } else if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
                // Handle polygons (simplified to outlines for now)
                const polygons = feature.geometry.type === 'Polygon' 
                    ? [feature.geometry.coordinates] 
                    : feature.geometry.coordinates;

                polygons.forEach((rings: any[]) => {
                    rings.forEach((ring: any[]) => {
                        if (ring.length < 2) return;
                        if (!intersects(ring, viewportBounds)) return;

                        ctx.beginPath();
                        ctx.moveTo(ring[0][0], ring[0][1]);
                        for (let i = 1; i < ring.length; i++) {
                            ctx.lineTo(ring[i][0], ring[i][1]);
                        }
                        ctx.closePath();
                        ctx.stroke();
                    });
                });
            }
        });

        // 3. Convert to Uint8Array
        const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
        const arrayBuffer = await blob.arrayBuffer();
        results[category] = new Uint8Array(arrayBuffer) as any;
    }

    return results as unknown as Record<string, Uint8Array>;
}

function getCategoryColor(category: string): string {
    const colors: Record<string, string> = {
        'transport': '#666666',
        'water': '#a2daf2',
        'landuse': '#def3c6',
        'roads': '#bbbbbb',
        'buildings': '#cccccc'
    };
    return colors[category.toLowerCase()] || '#999999';
}

function intersects(coords: number[][], bounds: { panX: number; panY: number; width: number; height: number }): boolean {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of coords) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    }
    
    return !(
        maxX < bounds.panX || 
        minX > bounds.panX + bounds.width || 
        maxY < bounds.panY || 
        minY > bounds.panY + bounds.height
    );
}

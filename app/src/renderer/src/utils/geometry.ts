import { Point } from '../store/types';

export function buildEntityPath(vertices: Point[], radius: number): Path2D {
    const path = new Path2D();
    if (vertices.length < 2) return path;

    path.moveTo(vertices[0].x, vertices[0].y);

    for (let i = 1; i < vertices.length - 1; i++) {
        const P0 = vertices[i - 1]; // Previous point
        const P1 = vertices[i];     // Current corner
        const P2 = vertices[i + 1]; // Next point

        // Calculate segment vectors and lengths
        const d1x = P0.x - P1.x, d1y = P0.y - P1.y;
        const d2x = P2.x - P1.x, d2y = P2.y - P1.y;
        const len1 = Math.sqrt(d1x * d1x + d1y * d1y);
        const len2 = Math.sqrt(d2x * d2x + d2y * d2y);

        // Clamping logic: Radius cannot exceed 50% of the shortest neighboring segment
        const maxAllowedRadius = Math.min(len1, len2) / 2;
        const safeRadius = Math.min(radius, maxAllowedRadius);

        if (safeRadius === 0 || isNaN(safeRadius)) {
            // Shape is too small or radius is 0, draw sharp corner
            path.lineTo(P1.x, P1.y);
            continue;
        }

        // Native canvas handles the exact tangent circle geometry, we just provide the cap.
        path.arcTo(P1.x, P1.y, P2.x, P2.y, safeRadius);
    }

    // Draw the final straight line to the end point
    const lastPoint = vertices[vertices.length - 1];
    path.lineTo(lastPoint.x, lastPoint.y);

    return path;
}

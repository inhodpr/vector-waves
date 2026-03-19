import { IAnimationEngine } from './IAnimationEngine';
import { IWavePropagationStrategy } from './IWavePropagationStrategy';
import { LineEntity, Point, AppState } from '../store/types';
import { useAppStore } from '../store/useAppStore';

type MeshNode = {
    pt: Point,
    dist: number,
    nx: number,
    ny: number,
    isArc: boolean,
};

export class PhysicsAnimationEngine implements IAnimationEngine {
    private waveStrategy: IWavePropagationStrategy;
    private readonly meshResolutionPx = 2.0;

    constructor(strategy: IWavePropagationStrategy) {
        this.waveStrategy = strategy;
    }

    public getPluckOriginPoint(entity: LineEntity): Point | null {
        if (!entity.vertices || entity.vertices.length === 0) return null;
        const { baseMesh, totalLength } = this.subdivideAndSmooth(entity);
        if (baseMesh.length === 0) return null;

        const targetDist = (entity.pluckOrigin || 0) * totalLength;
        // Find closest point in map
        let closest = baseMesh[0];
        let minDiff = Math.abs(closest.dist - targetDist);
        for (let i = 1; i < baseMesh.length; i++) {
            const diff = Math.abs(baseMesh[i].dist - targetDist);
            if (diff < minDiff) {
                minDiff = diff;
                closest = baseMesh[i];
            }
        }
        return closest.pt;
    }

    public getClosestPluckPercentage(entity: LineEntity, cursorX: number, cursorY: number): number {
        if (!entity.vertices || entity.vertices.length === 0) return 0;
        const { baseMesh, totalLength } = this.subdivideAndSmooth(entity);
        if (baseMesh.length === 0 || totalLength === 0) return 0;

        let closestDist = 0;
        let minGeometricDist = Infinity;

        for (const node of baseMesh) {
            const distSq = Math.pow(node.pt.x - cursorX, 2) + Math.pow(node.pt.y - cursorY, 2);
            if (distSq < minGeometricDist) {
                minGeometricDist = distSq;
                closestDist = node.dist;
            }
        }

        const percent = closestDist / totalLength;
        return Math.max(0, Math.min(1.0, percent));
    }

    public calculateDeformedMesh(entity: LineEntity, timestampMs: number, appStateArg?: AppState): Point[] {
        const appState = appStateArg || useAppStore.getState();
        if (!entity.animations || entity.animations.length === 0) {
            return entity.vertices;
        }

        const { baseMesh, totalLength } = this.subdivideAndSmooth(entity);
        if (baseMesh.length < 2) return baseMesh.map(b => b.pt);

        // Pre-calculate nearest edge distance for Edge Damping
        const distanceToEdgeArr = new Array<number>(baseMesh.length).fill(Infinity);

        // Forward pass
        let distToLastEdge = 0;
        for (let i = 0; i < baseMesh.length; i++) {
            if (i === 0) {
                distToLastEdge = 0;
            } else {
                distToLastEdge += (baseMesh[i].dist - baseMesh[i - 1].dist);
            }
            distanceToEdgeArr[i] = distToLastEdge;
        }

        // Backward pass
        let distToNextEdge = 0;
        for (let i = baseMesh.length - 1; i >= 0; i--) {
            if (i === baseMesh.length - 1) {
                distToNextEdge = 0;
            } else {
                distToNextEdge += (baseMesh[i + 1].dist - baseMesh[i].dist);
            }
            distanceToEdgeArr[i] = Math.min(distanceToEdgeArr[i], distToNextEdge);
        }

        const absolutePluckDist = (entity.pluckOrigin || 0) * totalLength;
        const deformedMesh: Point[] = [];

        for (let i = 0; i < baseMesh.length; i++) {
            const node = baseMesh[i];
            let totalDisplacement = 0;

            const distanceToPluck = Math.abs(node.dist - absolutePluckDist);
            const distToEdge = distanceToEdgeArr[i];

            for (const anim of entity.animations) {
                const isReactive = anim.trigger?.type === 'Reactive';
                
                if (isReactive) {
                    if (!anim.activeTriggers || anim.activeTriggers.length === 0) continue;

                    // Support multiple overlapping waves via superposition
                    for (const trigger of anim.activeTriggers) {
                        const timeActiveMs = timestampMs - trigger.timestampMs;
                        
                        // Only calculate if the wave is still potentially visible/active
                        // At speed 2.0, 2000ms = 4000px range. Most waves are damped by then.
                        if (timeActiveMs > 0 && timeActiveMs < 2000) {
                            const effectiveAmplitude = anim.amplitude * trigger.intensity;
                            
                            const disp = this.waveStrategy.calculateDisplacement({
                                amplitude: effectiveAmplitude,
                                frequency: anim.frequency,
                                distanceFromOrigin: distanceToPluck,
                                timeActiveMs,
                                easing: anim.easing
                            });
                            totalDisplacement += disp;
                        }
                    }
                } else {
                    // Temporal (Timeline) Logic
                    const startMarker = appState.audio.markers.find(m => m.id === anim.startMarkerId);
                    const endMarker = appState.audio.markers.find(m => m.id === anim.endMarkerId);
                    
                    if (!startMarker) continue;

                    const timeActiveMs = timestampMs - startMarker.timestampMs;
                    let dampingStartTimeMs: number | undefined = undefined;
                    
                    if (endMarker && timestampMs > endMarker.timestampMs) {
                        dampingStartTimeMs = timestampMs - endMarker.timestampMs;
                    }

                    if (timeActiveMs > 0 && timeActiveMs < 5000) { // Limit timeline waves too for safety
                        const disp = this.waveStrategy.calculateDisplacement({
                            amplitude: anim.amplitude,
                            frequency: anim.frequency,
                            distanceFromOrigin: distanceToPluck,
                            timeActiveMs,
                            dampingStartTimeMs,
                            easing: anim.easing
                        });
                        totalDisplacement += disp;
                    }
                }

                // Apply edge damping (guitar string taper effect)
                // This is applied to the SUM of all displacements for this animation
                const edgeDamping = anim.edgeDamping || 0;
                if (edgeDamping > 0 && totalDisplacement !== 0) {
                    if (distToEdge < edgeDamping) {
                        const edgeMultiplier = Math.max(0, distToEdge / edgeDamping);
                        totalDisplacement *= edgeMultiplier;
                    }
                }
            }
            
            if (totalDisplacement !== 0) {
                deformedMesh.push({
                    x: node.pt.x + (node.nx * totalDisplacement),
                    y: node.pt.y + (node.ny * totalDisplacement)
                });
            } else {
                deformedMesh.push(node.pt);
            }
        }

        return deformedMesh;
    }

    public subdivideAndSmooth(entity: LineEntity): { baseMesh: MeshNode[], totalLength: number } {
        const { vertices, style } = entity;
        const radius = style.globalRadius || 0;
        const baseMesh: MeshNode[] = [];
        let totalLength = 0;

        if (vertices.length < 2) return { baseMesh, totalLength };

        baseMesh.push({ pt: vertices[0], dist: 0, nx: 0, ny: 0, isArc: false });

        for (let i = 1; i < vertices.length - 1; i++) {
            // Use original vertices for stable segment calculations
            const origP0 = vertices[i - 1];
            const origP1 = vertices[i];
            const origP2 = vertices[i + 1];

            const v1x = origP0.x - origP1.x;
            const v1y = origP0.y - origP1.y;
            const v2x = origP2.x - origP1.x;
            const v2y = origP2.y - origP1.y;

            const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
            const len2 = Math.sqrt(v2x * v2x + v2y * v2y);

            const maxAllowedRadius = Math.min(len1, len2) / 2;
            let safeRadius = Math.min(radius, maxAllowedRadius);

            let angle = Math.acos((v1x * v2x + v1y * v2y) / (len1 * len2));
            if (isNaN(angle)) angle = 0;

            // Prevent tangent distance from exceeding half the shortest segment length
            const maxRadiusForAngle = Math.min(len1, len2) / 2 * Math.tan(angle / 2);
            safeRadius = Math.min(safeRadius, maxRadiusForAngle);

            const tangentDist = safeRadius > 0.001 ? safeRadius / Math.tan(angle / 2) : 0;

            if (safeRadius > 0.1 && !isNaN(tangentDist)) {
                const P1 = origP1;

                const t0x = P1.x + tangentDist * (v1x / len1);
                const t0y = P1.y + tangentDist * (v1y / len1);

                const t1x = P1.x + tangentDist * (v2x / len2);
                const t1y = P1.y + tangentDist * (v2y / len2);

                // Straight segment leading to corner
                const startPt = baseMesh[baseMesh.length - 1].pt;
                totalLength = this.subdivideSegment(baseMesh, startPt, { x: t0x, y: t0y }, totalLength, false);

                // Arc segment
                const bisectorX = (v1x / len1 + v2x / len2);
                const bisectorY = (v1y / len1 + v2y / len2);
                const bisectorLen = Math.sqrt(bisectorX * bisectorX + bisectorY * bisectorY);
                const centerDist = safeRadius / Math.sin(angle / 2);

                let centerX, centerY;
                if (bisectorLen > 0.0001) {
                    centerX = P1.x + centerDist * (bisectorX / bisectorLen);
                    centerY = P1.y + centerDist * (bisectorY / bisectorLen);
                } else {
                    centerX = P1.x;
                    centerY = P1.y;
                }

                const startAngle = Math.atan2(t0y - centerY, t0x - centerX);
                const endAngle = Math.atan2(t1y - centerY, t1x - centerX);

                totalLength = this.subdivideArc(baseMesh, { x: centerX, y: centerY }, safeRadius, startAngle, endAngle, totalLength);

            } else {
                const startPt = baseMesh[baseMesh.length - 1].pt;
                totalLength = this.subdivideSegment(baseMesh, startPt, origP1, totalLength, false);
            }
        }

        const lastPt = baseMesh[baseMesh.length - 1].pt;
        totalLength = this.subdivideSegment(baseMesh, lastPt, vertices[vertices.length - 1], totalLength, false);

        return { baseMesh, totalLength };
    }

    private subdivideSegment(mesh: MeshNode[], p1: Point, p2: Point, totalLength: number, isArc: boolean): number {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const segmentDist = Math.sqrt(dx * dx + dy * dy);
        if (segmentDist < 0.1) return totalLength;

        const ux = dx / segmentDist;
        const uy = dy / segmentDist;
        const nx = -uy;
        const ny = ux;

        let stepDist = this.meshResolutionPx;
        while (stepDist < segmentDist) {
            totalLength += this.meshResolutionPx;
            mesh.push({
                pt: { x: p1.x + ux * stepDist, y: p1.y + uy * stepDist },
                dist: totalLength,
                nx, ny, isArc
            });
            stepDist += this.meshResolutionPx;
        }

        const remainingDist = segmentDist - (stepDist - this.meshResolutionPx);
        totalLength += remainingDist;
        mesh.push({ pt: p2, dist: totalLength, nx, ny, isArc });
        return totalLength;
    }

    private subdivideArc(mesh: MeshNode[], center: Point, radius: number, startAngle: number, endAngle: number, totalLength: number): number {
        let angle = endAngle - startAngle;
        // Handle angle wrapping
        if (angle > Math.PI) angle -= 2 * Math.PI;
        if (angle < -Math.PI) angle += 2 * Math.PI;

        const arcLength = Math.abs(angle * radius);
        const numSteps = Math.ceil(arcLength / this.meshResolutionPx);
        const angleStep = angle / numSteps;

        for (let i = 1; i <= numSteps; i++) {
            const currentAngle = startAngle + i * angleStep;
            const x = center.x + radius * Math.cos(currentAngle);
            const y = center.y + radius * Math.sin(currentAngle);

            const nx = (x - center.x) / radius;
            const ny = (y - center.y) / radius;

            totalLength += arcLength / numSteps;
            mesh.push({ pt: { x, y }, dist: totalLength, nx, ny, isArc: true });
        }
        return totalLength;
    }
}

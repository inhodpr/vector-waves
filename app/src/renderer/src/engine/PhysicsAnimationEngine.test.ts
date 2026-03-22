import { describe, it, expect, vi } from 'vitest';
import { PhysicsAnimationEngine } from './PhysicsAnimationEngine';
import { IWavePropagationStrategy, WaveParams } from './IWavePropagationStrategy';
import { LineEntity, AppState } from '../store/types';

// A mock strategy that just returns exactly +5 displacement constantly
class MockWaveStrategy implements IWavePropagationStrategy {
    calculateDisplacement(_params: WaveParams): number {
        return 5;
    }
}

describe('PhysicsAnimationEngine', () => {
    it('returns raw vertices if no animations are active', () => {
        const engine = new PhysicsAnimationEngine(new MockWaveStrategy());

        const entity: LineEntity = {
            id: '1',
            type: 'Line',
            vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
            style: { strokeColor: 'red', strokeWidth: 1, fillColor: '', globalRadius: 0 },
            pluckOrigin: 0,
            zIndex: 0,
            animations: []
        };

        const result = engine.calculateDeformedMesh(entity, 0, {} as AppState);
        expect(result.length).toBe(2);
        expect(result[0].x).toBe(0);
    });

    it('subdivides geometry straight paths properly', () => {
        const engine = new PhysicsAnimationEngine(new MockWaveStrategy());

        const entity: LineEntity = {
            id: '1',
            type: 'Line',
            vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }], // 10px long line
            style: { strokeColor: 'red', strokeWidth: 1, fillColor: '', globalRadius: 0 },
            pluckOrigin: 0,
            zIndex: 0,
            animations: []
        };

        const { baseMesh, totalLength } = engine.subdivideAndSmooth(entity);

        // Length should be 10
        expect(totalLength).toBe(10);

        // At 2px resolution, there should be points at 0, 2, 4, 6, 8, 10
        expect(baseMesh.length).toBe(6);
        expect(baseMesh[1].dist).toBe(2);
        expect(baseMesh[1].ny).toBe(1); // Normal Y should be 1 (pointing down/up orthogonally from horizontal line)
    });

    it('accumulates displacement from multiple vibrations (Constructive Interference)', () => {
        const engine = new PhysicsAnimationEngine(new MockWaveStrategy());

        const entity: LineEntity = {
            id: '1',
            type: 'Line',
            vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }], // Horizontal line
            style: { strokeColor: 'red', strokeWidth: 1, fillColor: '', globalRadius: 0 },
            pluckOrigin: 0,
            zIndex: 0,
            animations: [
                { id: 'anim1', startMarkerId: 'm1', endMarkerId: 'm2', frequency: 1, amplitude: 5, edgeDamping: 0, easing: 'Linear' },
                { id: 'anim2', startMarkerId: 'm1', endMarkerId: 'm2', frequency: 1, amplitude: 5, edgeDamping: 0, easing: 'Linear' }
            ]
        };

        const mockAppState = {
            audio: {
                markers: [
                    { id: 'm1', targetTrackId: 't1', timestampMs: 0 },
                    { id: 'm2', targetTrackId: 't1', timestampMs: 1000 }
                ]
            }
        } as AppState;

        // Both animations active at timeMs=500
        const result = engine.calculateDeformedMesh(entity, 500, mockAppState);

        // There are 6 points in the base mesh.
        // Each anim provides +5px displacement along the Normal Y (ny = 1)
        // Two anims = +10px total Y displacement.

        expect(result.length).toBe(6);
        for (let i = 1; i < result.length - 1; i++) {
            // For middle points, normal should be (0, 1) and disp should accumulate 10
            // x should remain the same (nx = 0)
            // y should be displaced by 10 (ny = 1 * 10)
            expect(result[i].y).toBe(10);
        }
    });

    it('should create arc nodes when a radius is applied to a corner', () => {
        const engine = new PhysicsAnimationEngine(new MockWaveStrategy());

        const entity: LineEntity = {
            id: '1',
            type: 'Line',
            vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], // 90-degree corner
            style: { strokeColor: 'red', strokeWidth: 1, fillColor: '', globalRadius: 20 },
            pluckOrigin: 0,
            zIndex: 0,
            animations: []
        };

        const { baseMesh } = engine.subdivideAndSmooth(entity);

        // Expect that some nodes were flagged as being part of an arc
        expect(baseMesh.some(node => node.isArc)).toBe(true);
    });

    it('should not create arc nodes when radius is 0', () => {
        const engine = new PhysicsAnimationEngine(new MockWaveStrategy());

        const entity: LineEntity = {
            id: '1',
            type: 'Line',
            vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], // 90-degree corner
            style: { strokeColor: 'red', strokeWidth: 1, fillColor: '', globalRadius: 0 },
            pluckOrigin: 0,
            zIndex: 0,
            animations: []
        };

        const { baseMesh } = engine.subdivideAndSmooth(entity);

        // Expect that no nodes were flagged as being part of an arc
        expect(baseMesh.every(node => !node.isArc)).toBe(true);
    });
});

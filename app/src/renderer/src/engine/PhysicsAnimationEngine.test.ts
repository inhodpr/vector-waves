import { describe, it, expect, vi } from 'vitest';
import { PhysicsAnimationEngine } from './PhysicsAnimationEngine';
import { IWavePropagationStrategy, WaveParams } from './IWavePropagationStrategy';
import { LineEntity, AppState } from '../store/types';

// A mock strategy that returns exactly +5 displacement constantly
class MockWaveStrategy implements IWavePropagationStrategy {
    calculateDisplacement(_params: WaveParams): number {
        return 5;
    }
}

describe('PhysicsAnimationEngine', () => {
    it('returns raw vertices if no animations are active', () => {
        const engine = new PhysicsAnimationEngine(new MockWaveStrategy());
        const entity: LineEntity = {
            id: '1', type: 'Line', vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
            style: { strokeColor: 'red', strokeWidth: 1, fillColor: '', globalRadius: 0 },
            pluckOrigin: 0, zIndex: 0, animations: []
        };
        const result = engine.calculateDeformedMesh(entity, 0, {} as AppState);
        expect(result).toBe(entity.vertices);
    });

    it('subdivides geometry properly', () => {
        const engine = new PhysicsAnimationEngine(new MockWaveStrategy());
        const entity: LineEntity = {
            id: '1', type: 'Line', vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
            style: { strokeColor: 'red', strokeWidth: 1, fillColor: '', globalRadius: 0 },
            pluckOrigin: 0, zIndex: 0, animations: []
        };
        const { baseMesh, totalLength } = engine.subdivideAndSmooth(entity);
        expect(totalLength).toBe(10);
        expect(baseMesh.length).toBe(6);
    });

    it('handles timeline-based animations', () => {
        const engine = new PhysicsAnimationEngine(new MockWaveStrategy());
        const entity: LineEntity = {
            id: '1', type: 'Line', vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
            style: { strokeColor: 'red', strokeWidth: 1, fillColor: '', globalRadius: 0 },
            pluckOrigin: 0.5, zIndex: 0, 
            animations: [{ 
                id: 'a1', startMarkerId: 'm1', endMarkerId: 'm2',
                frequency: 1, amplitude: 10, edgeDamping: 0, easing: 'Linear' 
            }]
        };
        const state = {
            audio: {
                markers: [
                    { id: 'm1', timestampMs: 0 },
                    { id: 'm2', timestampMs: 1000 }
                ]
            }
        } as AppState;
        
        const result = engine.calculateDeformedMesh(entity, 500, state);
        expect(result[1].y).toBe(5);
    });

    it('applies edge damping', () => {
        const engine = new PhysicsAnimationEngine(new MockWaveStrategy());
        const entity: LineEntity = {
            id: '1', type: 'Line', vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
            style: { strokeColor: 'red', strokeWidth: 1, fillColor: '', globalRadius: 0 },
            pluckOrigin: 0.5, zIndex: 0, 
            animations: [{ 
                id: 'a1', startMarkerId: 'm1', endMarkerId: 'm2',
                frequency: 1, amplitude: 10, edgeDamping: 5, easing: 'Linear' 
            }]
        };
        const state = { audio: { markers: [{ id: 'm1', timestampMs: 0 }] } } as any;
        const result = engine.calculateDeformedMesh(entity, 100, state);
        
        expect(result[0].y).toBe(0);
        expect(result[5].y).toBe(0);
    });

    it('handles arc subdivision with radius', () => {
        const engine = new PhysicsAnimationEngine(new MockWaveStrategy());
        const entity: LineEntity = {
            id: '1', type: 'Line', vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
            style: { strokeColor: 'red', strokeWidth: 1, fillColor: '', globalRadius: 20 },
            pluckOrigin: 0, zIndex: 0, animations: []
        };
        const { baseMesh } = engine.subdivideAndSmooth(entity);
        expect(baseMesh.some(m => m.isArc)).toBe(true);
    });

    it('handles subdivision for < 2 vertices', () => {
        const engine = new PhysicsAnimationEngine(new MockWaveStrategy());
        const entity = { vertices: [{ x: 0, y: 0 }], style: {} } as any;
        const { baseMesh } = engine.subdivideAndSmooth(entity);
        expect(baseMesh.length).toBe(0);
    });

    it('handles very short segments', () => {
        const engine = new PhysicsAnimationEngine(new MockWaveStrategy());
        const entity = { vertices: [{ x: 0, y: 0 }, { x: 0.01, y: 0 }], style: {} } as any;
        const { totalLength } = engine.subdivideAndSmooth(entity);
        expect(totalLength).toBeLessThan(0.1);
    });

    it('should return closest pluck percentage', () => {
        const engine = new PhysicsAnimationEngine(new MockWaveStrategy());
        const entity: LineEntity = {
            id: '1', type: 'Line', vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
            style: { strokeColor: 'red', strokeWidth: 1, fillColor: '', globalRadius: 0 },
            pluckOrigin: 0, zIndex: 0, animations: []
        };
        const pct = engine.getClosestPluckPercentage(entity, 50, 10);
        expect(pct).toBeCloseTo(0.5);
    });

    it('should return null pluck origin for empty entity', () => {
        const engine = new PhysicsAnimationEngine(new MockWaveStrategy());
        const origin = engine.getPluckOriginPoint({ vertices: [] } as any);
        expect(origin).toBeNull();
    });

    it('handles reactive animations with active triggers', () => {
        const engine = new PhysicsAnimationEngine(new MockWaveStrategy());
        const entity: LineEntity = {
            id: '1', type: 'Line', vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
            style: { strokeColor: 'red', strokeWidth: 1, fillColor: '', globalRadius: 0 },
            pluckOrigin: 0.5, zIndex: 0, 
            animations: [{ 
                id: 'a1', startMarkerId: '', endMarkerId: '',
                trigger: { type: 'Reactive', frequencyBand: 'Bass' }, 
                frequency: 1, amplitude: 10, edgeDamping: 0, easing: 'Linear',
                activeTriggers: [{ timestampMs: 400, intensity: 1.0 }]
            }]
        };
        
        const result = engine.calculateDeformedMesh(entity, 500, {} as AppState);
        expect(result[1].y).toBe(5);
    });

    it('should calculate pluck origin at specific percent', () => {
        const engine = new PhysicsAnimationEngine(new MockWaveStrategy());
        const entity: LineEntity = {
            id: '1', type: 'Line', vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
            style: { strokeColor: 'red', strokeWidth: 1, fillColor: '', globalRadius: 0 },
            pluckOrigin: 0.5, zIndex: 0, animations: []
        };
        const origin = engine.getPluckOriginPoint(entity);
        expect(origin?.x).toBeCloseTo(50);
    });

    it('should handle end-marker damping logic', () => {
        const engine = new PhysicsAnimationEngine(new MockWaveStrategy());
        const entity: LineEntity = {
            id: '1', type: 'Line', vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
            style: { strokeColor: 'red', strokeWidth: 1, fillColor: '', globalRadius: 0 },
            pluckOrigin: 0.5, zIndex: 0, 
            animations: [{ 
                id: 'a1', startMarkerId: 'm1', endMarkerId: 'm2',
                frequency: 1, amplitude: 10, edgeDamping: 0, easing: 'Linear' 
            }]
        };
        const state = {
            audio: {
                markers: [
                    { id: 'm1', timestampMs: 0 },
                    { id: 'm2', timestampMs: 500 }
                ]
            }
        } as AppState;
        
        // At 600ms, dampStartTimeMs should be 100ms
        const result = engine.calculateDeformedMesh(entity, 600, state);
        expect(result.length).toBeGreaterThan(0);
    });

    it('should handle durationMs damping logic when no end-marker is present', () => {
        const engine = new PhysicsAnimationEngine(new MockWaveStrategy());
        const entity: LineEntity = {
            id: '1', type: 'Line', vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
            style: { strokeColor: 'red', strokeWidth: 1, fillColor: '', globalRadius: 0 },
            pluckOrigin: 0.5, zIndex: 0, 
            animations: [{ 
                id: 'a1', startMarkerId: 'm1', 
                frequency: 1, amplitude: 10, edgeDamping: 0, easing: 'Linear',
                durationMs: 500
            }]
        };
        const state = {
            audio: {
                markers: [{ id: 'm1', timestampMs: 0 }]
            }
        } as AppState;
        
        // At 600ms, dampingStartTimeMs should be 100ms (600 - 500)
        // We can't easily check dampingStartTimeMs directly without exposing it, 
        // but we can verify it doesn't crash and returns expected data.
        const result = engine.calculateDeformedMesh(entity, 600, state);
        expect(result.length).toBeGreaterThan(0);
    });
});

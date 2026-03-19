export interface WaveParams {
    amplitude: number;
    frequency: number;
    distanceFromOrigin: number; // The Euclidean arc-length distance from the Pluck Origin
    timeActiveMs: number;       // timestampMs - startMarkerTime
    dampingStartTimeMs?: number; // timestampMs - endMarkerTime (if past end marker)
    easing: 'Linear' | 'Exponential';
}

/**
 * Strategy pattern interface for calculating 1D physics displacements.
 * Returns a scalar value representing the Orthogonal displacement magnitude.
 */
export interface IWavePropagationStrategy {
    calculateDisplacement(params: WaveParams): number;
}

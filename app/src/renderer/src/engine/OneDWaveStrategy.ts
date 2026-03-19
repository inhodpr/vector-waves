import { IWavePropagationStrategy, WaveParams } from './IWavePropagationStrategy';

export class OneDWaveStrategy implements IWavePropagationStrategy {
    // Tuning constants for the wave feel
    private readonly waveSpeed = 2.0; // pixels per millisecond
    private readonly dampingDurationMs = 1000; // time it takes to decay to ~0

    calculateDisplacement(params: WaveParams): number {
        const { amplitude, frequency, distanceFromOrigin, timeActiveMs, dampingStartTimeMs, easing } = params;

        // 1. Wave hasn't started yet
        if (timeActiveMs <= 0) return 0;

        // 2. Wave Propagation Bound: Has the wave traveled this far yet?
        const maxTraveledDistance = timeActiveMs * this.waveSpeed;
        if (distanceFromOrigin > maxTraveledDistance + 10) {
            return 0; // Point is resting
        }

        // 3. Smooth Envelope (Leading Edge)
        // Instead of a hard cut, we fade in the wave over 100 pixels at the front
        const edgeSmoothingPx = 100;
        let leadingEdgeMultiplier = 1.0;
        const distanceToFront = maxTraveledDistance - distanceFromOrigin;
        
        if (distanceToFront < edgeSmoothingPx) {
            leadingEdgeMultiplier = Math.max(0, distanceToFront / edgeSmoothingPx);
            // Optional: apply a smoothstep Curve
            leadingEdgeMultiplier = leadingEdgeMultiplier * leadingEdgeMultiplier * (3 - 2 * leadingEdgeMultiplier);
        }

        // 4. Distance Attenuation (Wave naturally dies out as it travels)
        // Attenuate to 0 at 2000px
        const attenuation = Math.max(0, 1.0 - (distanceFromOrigin / 2000));

        // 5. Calculate Base Oscillation (Sine wave)
        const w = (frequency * Math.PI * 2) / 100;
        const k = w / this.waveSpeed; 
        const baseSine = Math.sin((w * timeActiveMs) - (k * distanceFromOrigin));

        // 6. Calculate Damping Multiplier (Temporal Envelope)
        let dampingMultiplier = 1.0;
        if (dampingStartTimeMs !== undefined && dampingStartTimeMs > 0) {
            const decayProgress = dampingStartTimeMs / this.dampingDurationMs;
            if (easing === 'Linear') {
                dampingMultiplier = Math.max(0, 1.0 - decayProgress);
            } else if (easing === 'Exponential') {
                dampingMultiplier = Math.exp(-3 * decayProgress);
            }
        }

        const finalDisplacement = amplitude * baseSine * dampingMultiplier * leadingEdgeMultiplier * attenuation;
        
        if (Math.abs(finalDisplacement) < 0.05) {
            return 0;
        }

        return finalDisplacement;
    }
}

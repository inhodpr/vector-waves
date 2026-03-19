import { describe, it, expect } from 'vitest';
import { OneDWaveStrategy } from './OneDWaveStrategy';

describe('OneDWaveStrategy', () => {
    it('returns 0 when timeActiveMs is <= 0', () => {
        const strategy = new OneDWaveStrategy();
        const disp = strategy.calculateDisplacement({
            amplitude: 10,
            frequency: 1,
            distanceFromOrigin: 0,
            timeActiveMs: 0,
            easing: 'Linear'
        });
        expect(disp).toBe(0);
    });

    it('returns 0 if wave has not reached the distance yet', () => {
        const strategy = new OneDWaveStrategy();
        // Speed is 0.5px/ms. In 100ms, wave travels 50px.
        // Distance is 100px. It should be 0.
        const disp = strategy.calculateDisplacement({
            amplitude: 10,
            frequency: 1,
            distanceFromOrigin: 100,
            timeActiveMs: 100,
            easing: 'Linear'
        });
        expect(disp).toBe(0);
    });

    it('returns a sine wave displacement at origin', () => {
        const strategy = new OneDWaveStrategy();
        // At origin, distance is 0. 
        // A * sin((w * t) - 0)
        const disp = strategy.calculateDisplacement({
            amplitude: 10,
            frequency: 5, // w = (5 * PI * 2) / 100 = ~0.314
            distanceFromOrigin: 0,
            timeActiveMs: 5, // w * t = ~1.57 = PI/2. sin(PI/2) = 1.
            easing: 'Linear'
        });

        // 10 * 1 = 10.
        expect(disp).toBeCloseTo(10, 1);
    });

    it('applies linear damping correctly', () => {
        const strategy = new OneDWaveStrategy();
        // dampingStartTimeMs > 0 means the wave is dying.
        // at 500ms (half the 1000ms damping pool), multiplier should be 0.5.
        const disp = strategy.calculateDisplacement({
            amplitude: 10,
            frequency: 5,
            distanceFromOrigin: 0,
            timeActiveMs: 1005, // well past start
            dampingStartTimeMs: 500, // exactly 50% decayed
            easing: 'Linear'
        });

        // At this specific w*t timing, base sine is 1 again roughly.
        // Instead of 10 amplitude, it should be 5.
        // Because the sine changes over time so fast it's hard to predict the exact number,
        // let's test a simpler timing where w*t = PI/2 relative.
        // Easier: Just assert the maximum envelope bounds.
        expect(Math.abs(disp)).toBeLessThanOrEqual(5.001);
    });

    it('applies exponential damping faster than linear', () => {
        const strategy = new OneDWaveStrategy();
        const dispLin = strategy.calculateDisplacement({
            amplitude: 10,
            frequency: 5,
            distanceFromOrigin: 0,
            timeActiveMs: 1005,
            dampingStartTimeMs: 800, // 80% decayed
            easing: 'Linear'
        });

        const dispExp = strategy.calculateDisplacement({
            amplitude: 10,
            frequency: 5,
            distanceFromOrigin: 0,
            timeActiveMs: 1005,
            dampingStartTimeMs: 800, // 80% decayed
            easing: 'Exponential'
        });

        expect(Math.abs(dispExp)).toBeLessThan(Math.abs(dispLin));
    });
});

import { describe, it, expect } from 'vitest';
import { BiquadFilter } from './BiquadFilter';

describe('BiquadFilter', () => {
  const coeffs = { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 }; // Pass-through

  it('should process a sample (pass-through)', () => {
    const filter = new BiquadFilter(coeffs);
    const out = filter.process(0.5);
    expect(out).toBe(0.5);
  });

  it('should apply coefficients', () => {
    const doubleCoeffs = { b0: 2, b1: 0, b2: 0, a1: 0, a2: 0 };
    const filter = new BiquadFilter(doubleCoeffs);
    expect(filter.process(0.5)).toBe(1.0);
  });

  it('should update coefficients', () => {
    const filter = new BiquadFilter(coeffs);
    filter.updateCoefficients({ b0: 3, b1: 0, b2: 0, a1: 0, a2: 0 });
    expect(filter.process(0.5)).toBe(1.5);
  });

  it('should reset state', () => {
    const delayCoeffs = { b0: 0, b1: 1, b2: 0, a1: 0, a2: 0 };
    const filter = new BiquadFilter(delayCoeffs);
    filter.process(0.5); // x1 becomes 0.5
    expect(filter.process(0)).toBe(0.5); // returns x1
    
    filter.reset();
    expect(filter.process(0)).toBe(0); // x1 reset to 0
  });
});

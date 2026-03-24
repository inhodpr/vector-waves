import { describe, it, expect } from 'vitest';
import { BiquadFilter } from './BiquadFilter';

describe('BiquadFilter', () => {
  it('should pass "Full" range signal transparently with (b0=1, others=0)', () => {
    const coeffs = { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 };
    const filter = new BiquadFilter(coeffs);
    
    expect(filter.process(0.5)).toBe(0.5);
    expect(filter.process(-0.1)).toBe(-0.1);
  });

  it('should attenuate high frequencies with lowpass coefficients', () => {
    // Basic lowpass-like coeffs (not mathematically derived here but testing the behavior)
    // b0=0.5, b1=0.5 (averaging filter)
    const coeffs = { b0: 0.5, b1: 0.5, b2: 0, a1: 0, a2: 0 };
    const filter = new BiquadFilter(coeffs);
    
    // Constant signal passes through (0.5*1 + 0.5*1 = 1)
    expect(filter.process(1.0)).toBe(0.5); // x0=1, x1=0
    expect(filter.process(1.0)).toBe(1.0); // x0=1, x1=1
    
    // Alternating signal (Nyquist) is attenuated to 0
    filter.reset();
    expect(filter.process(1.0)).toBe(0.5); // x0=1, x1=0
    expect(filter.process(-1.0)).toBe(0.0); // x0=-1, x1=1 (averaging to 0)
  });

  it('should maintain state across process calls', () => {
    const coeffs = { b0: 0, b1: 1, b2: 0, a1: 0, a2: 0 }; // Simple delay
    const filter = new BiquadFilter(coeffs);
    
    expect(filter.process(0.8)).toBe(0);   // Delayed by 1 sample
    expect(filter.process(0.3)).toBe(0.8); // Previous x
    expect(filter.process(0.0)).toBe(0.3);
  });
});

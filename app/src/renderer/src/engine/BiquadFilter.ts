/**
 * BiquadFilter.ts
 *
 * A reusable Bi-quad IIR filter implementation.
 */

export interface FilterCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

export class BiquadFilter {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(private coeffs: FilterCoefficients) {}

  public process(sample: number): number {
    const { b0, b1, b2, a1, a2 } = this.coeffs;

    // Direct Form implementation
    const out = b0 * sample + b1 * this.x1 + b2 * this.x2 - a1 * this.y1 - a2 * this.y2;

    this.x2 = this.x1;
    this.x1 = sample;
    this.y2 = this.y1;
    this.y1 = out;

    return out;
  }

  public reset() {
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }

  public updateCoefficients(coeffs: FilterCoefficients) {
    this.coeffs = coeffs;
  }
}

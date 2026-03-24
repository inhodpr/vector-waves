/**
 * PeakDetectionProcessor.ts
 *
 * This file runs on the high-priority AudioWorklet thread.
 * It provides zero-allocation, multi-band peak detection.
 */

// @ts-nocheck

interface FilterState {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

interface TriggerConfig {
  id: string; // The original UUID (not used in the SAB event, we use slotIndex)
  band: 'Full' | 'Bass' | 'Mid' | 'Treble';
  threshold: number;
  refractoryPeriodMs: number;
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

class PeakDetectionProcessor extends AudioWorkletProcessor {
  private slots: TriggerConfig[] = [];
  private filterStates: FilterState[] = [];
  private lastTriggerTimes: Float64Array = new Float64Array(0);

  // SharedArrayBuffer indices
  // [0] = write pointer
  // [1] = read pointer (not used here, but for the reader)
  // [2...N] = event records [slotIndex, intensity_u8, timestamp_low_u32, timestamp_high_u32]
  private sharedBuffer: Int32Array | null = null;
  private bufferSize = 0;

  constructor() {
    super();
    this.port.onmessage = (e) => {
      const { type, data } = e.data;
      if (type === 'SET_BUFFER') {
        this.sharedBuffer = new Int32Array(data.buffer);
        this.bufferSize = (this.sharedBuffer.length - 2) / 4; // 4 ints per event
      } else if (type === 'UPDATE_CONFIG') {
        this.slots = data.slots;
        // Re-align states
        this.filterStates = this.slots.map(() => ({ x1: 0, x2: 0, y1: 0, y2: 0 }));
        this.lastTriggerTimes = new Float64Array(this.slots.length);
      }
    };
  }

  private applyFilter(sample: number, config: TriggerConfig, state: FilterState): number {
    if (config.band === 'Full') return sample;

    // Direct Form II - Bi-quad implementation
    const b0 = config.b0;
    const b1 = config.b1;
    const b2 = config.b2;
    const a1 = config.a1;
    const a2 = config.a2;

    const out = b0 * sample + b1 * state.x1 + b2 * state.x2 - a1 * state.y1 - a2 * state.y2;

    state.x2 = state.x1;
    state.x1 = sample;
    state.y2 = state.y1;
    state.y1 = out;

    return out;
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (!input || input.length === 0 || this.slots.length === 0) return true;

    const channel = input[0];
    const now = currentTime * 1000;

    for (let s = 0; s < this.slots.length; s++) {
      const slot = this.slots[s];
      const state = this.filterStates[s];
      let maxVal = 0;

      // Scan the 128-sample block
      for (let i = 0; i < channel.length; i++) {
        const filtered = this.applyFilter(channel[i], slot, state);
        const abs = filtered < 0 ? -filtered : filtered;
        if (abs > maxVal) maxVal = abs;
      }

      const lastTime = this.lastTriggerTimes[s];
      if (maxVal > slot.threshold && (now - lastTime) > slot.refractoryPeriodMs) {
        this.lastTriggerTimes[s] = now;
        this.pushTrigger(s, maxVal, now);
      }
    }

    return true;
  }

  private pushTrigger(slotIndex: number, intensity: number, timestamp: number) {
    if (!this.sharedBuffer) {
      // Fallback to postMessage if SharedArrayBuffer is not available
      this.port.postMessage({ type: 'PEAK_FALLBACK', slotIndex, intensity, timestamp });
      return;
    }

    // Use Atomics for thread-safe index increment
    const writeIdx = Atomics.load(this.sharedBuffer, 0);
    const nextWriteIdx = (writeIdx + 1) % this.bufferSize;

    // We store events in 4-integer chunks starting at index 2
    const base = 2 + writeIdx * 4;
    
    // Store intensity as 0-1000 fixed point for simplicity in Int32Array
    this.sharedBuffer[base] = slotIndex;
    this.sharedBuffer[base + 1] = Math.floor(intensity * 1000);
    
    // Split 64-bit float timestamp into two Int32s
    const tsInt = Math.floor(timestamp);
    this.sharedBuffer[base + 2] = tsInt & 0xffffffff;
    this.sharedBuffer[base + 3] = (tsInt / 0x100000000) | 0;

    Atomics.store(this.sharedBuffer, 0, nextWriteIdx);
  }
}

registerProcessor('peak-detection-processor', PeakDetectionProcessor);

# Implementation Plan (v2): High-Performance Multi-Band Audio Triggers

This document revines the `AudioWorklet` strategy to include multi-band filtering, dynamic parameterization, and optimal thread communication, addressing the requirements from the CTO's review in `REVIEW_AUDIO_WORKLET.md`.

## 🎯 Objectives
- **Zero Regression**: Support Bass, Mid, and Treble band-pass triggers.
- **Dynamic Configuration**: Support per-animation thresholds and refractory periods.
- **Efficient Communication**: Batch trigger events to minimize main-thread interruption.
- **Production-Ready Build**: Full Vite/Electron integration details.

---

## 🏗️ Components & Logic

### 1. `AudioWorkletProcessor.ts`
The worklet will implement a bank of IIR (Infinite Impulse Response) filters to isolate frequency bands without the overhead of a full FFT.

**Key Features**:
- **IIR Filter Bank**: Discrete filters for Bass (20-250Hz), Mid (250-4000Hz), and Treble (4000-20000Hz).
- **Dynamic Slot Mapping**: Tracks multiple `TriggerSlot` objects. Each slot maps a specific animation/entity to a band, threshold, and status.
- **Batching**: Sends all triggers that fired within a 128-sample block as a single `postMessage`.

### 2. `LiveAudioAdapter.ts`
Acts as the bridge between the Zustand state and the Worklet thread.

**Key Features**:
- **State Synchronization**: Maps current reactive animations into `TriggerSlot` configurations.
- **Refractory Logic Management**: Passes hardware-accurate timestamps back to the UI.

---

## 📐 Detailed Design

### `AudioWorkletProcessor.ts` (Full Snippet)
```typescript
/**
 * PeakDetectionProcessor handles multi-band peak detection using IIR filters.
 * It processes 128 samples at a time on the audio thread.
 */
class PeakDetectionProcessor extends AudioWorkletProcessor {
  private lastTriggerTimes = new Map<string, number>();
  private slots: Array<{
      id: string,
      band: 'Full' | 'Bass' | 'Mid' | 'Treble',
      threshold: number,
      refractoryPeriodMs: number
  }> = [];

  constructor() {
    super();
    this.port.onmessage = (e) => {
      if (e.data.type === 'UPDATE_CONFIG') {
        this.slots = e.data.slots;
      }
    };
  }

  // Simple IIR filters (placeholder coefficients for brevity)
  private filterBass(sample: number) { /* ... Low-pass 250Hz ... */ return sample; }
  private filterMid(sample: number) { /* ... Band-pass 250-4000Hz ... */ return sample; }
  private filterTreble(sample: number) { /* ... High-pass 4000Hz ... */ return sample; }

  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    const input = inputs[0];
    if (input.length === 0) return true;
    const channel = input[0];
    const now = currentTime * 1000;
    const triggers: Array<{ id: string, intensity: number }> = [];

    this.slots.forEach(slot => {
        let maxVal = 0;
        for (let i = 0; i < channel.length; i++) {
            let s = channel[i];
            if (slot.band === 'Bass') s = this.filterBass(s);
            if (slot.band === 'Mid') s = this.filterMid(s);
            if (slot.band === 'Treble') s = this.filterTreble(s);
            maxVal = Math.max(maxVal, Math.abs(s));
        }

        const lastTime = this.lastTriggerTimes.get(slot.id) || 0;
        if (maxVal > slot.threshold && (now - lastTime) > slot.refractoryPeriodMs) {
            triggers.push({ id: slot.id, intensity: maxVal });
            this.lastTriggerTimes.set(slot.id, now);
        }
    });

    if (triggers.length > 0) {
      this.port.postMessage({ type: 'BATCH_TRIGGERS', triggers, timestamp: now });
    }
    return true;
  }
}

registerProcessor('peak-detection-processor', PeakDetectionProcessor);
```

---

## 🏗️ Build & Environment Details

### Vite Integration
Vite handles worklets by importing them with the `?url` suffix. This allows Electron to load the script even in production (packaged) asar formats.
```typescript
import processorUrl from './AudioWorkletProcessor?url';
// ...
await this.audioCtx.audioWorklet.addModule(processorUrl);
```

### Electron Considerations
- **Content Security Policy (CSP)**: Ensure `script-src` includes `self` and potentially `blob:` if Vite transforms the worklet into a blob for HMR during development.
- **Latency**: Use `latencyHint: 'interactive'` when creating the `AudioContext`.

---

## 🧠 Technical Addendum: Addressing CTO Feedback (v2)

### 1. Zero-Allocation (GC-Free) Loop
The `process()` loop will be refactored to eliminate heap allocations. Instead of `postMessage` with dynamic arrays, we will use a **`SharedArrayBuffer` (SAB)**:
- **`TriggerQueue`**: A pre-allocated `Uint32Array` (SAB-backed) acting as a ring buffer.
- **Audio Thread**: Writes a fixed-size event record (4 bytes: `slotId`, `intensity_byte`, `timestamp_ms_offset`) into the buffer.
- **Main Thread**: Reads the `TriggerQueue` on every `requestAnimationFrame`. This allows the audio thread to remain entirely memory-stable and avoids GC "pops".

### 2. Temporal Sync & Clock Drift
We will designate the **Audio Hardware Clock (`currentTime`)** as the "Master Clock" while Live Mode is active:
- **Sync Point**: At the start of `LiveAudioAdapter`, we capture `BASE_OFFSET = performance.now() - (audioCtx.currentTime * 1000)`.
- **Timestamp Mapping**: The worklet uses `currentTime` for all triggers. The adapter converts these to project-relative `timestampMs` via the `BASE_OFFSET`. This ensures that even if the animation loop is delayed, the trigger remains sample-accurate on the timeline.

### 3. Persistent Filter State
To maintain IIR continuity, we will store a **`FilterState` struct** for each active slot:
```typescript
interface BiQuadState {
    x1: number, x2: number, // previous inputs
    y1: number, y2: number  // previous outputs
}
```
- **State Persistence**: These states are stored in a `Map<slotId, BiQuadState>` within the `PeakDetectionProcessor`.
- **Smooth Transition**: When a slot is modified (e.g., band change), its state is reset to zero. This occurs only on user interaction and is acceptable. All other processing is continuous across block boundaries.
- **Efficient Processing**: The filter coefficients (`a1, a2, b0, b1, b2`) are pre-calculated on the main thread and passed to the worklet during configuration updates.

---

## 🚦 Implementation Steps (Updated)

1.  **Shared Memory Setup**: Create the SAB-backed `TriggerQueue`.
2.  **Filter State Logic**: Implement the 2nd order Bi-quad direct-form-II algorithm with state persistence in `AudioWorkletProcessor.ts`.
3.  **Clock Sync Ingestion**: Refactor `LiveAudioAdapter` to handle the `currentTime` to `performance.now()` mapping.
4.  **Verification**: 
    - Verify zero heap allocations in the `process` block using browser profiling tools.
    - Measure clock drift over a 10-minute session.

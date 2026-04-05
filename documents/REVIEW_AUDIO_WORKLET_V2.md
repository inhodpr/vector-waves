# CTO Follow-up: V2 Audio Worklet Review

**Document Under Review**: `AUDIO_WORKLET_IMPLEMENTATION.md` (v2)  
**Reviewer**: CTO  
**Date**: 2026-03-23  
**Status**: ✅ PROVISIONALLY APPROVED (Pending Technical Clarifications)

The v2 plan is a significant improvement. Implementing a slot-based IIR filter bank addresses the functional regressions and configurability issues highlighted in my previous review. However, before we proceed to coding, the following technical deep-dives are required.

## 🧠 3 Hard Questions for the Tech Lead

These questions address fundamental architectural risks that will be extremely expensive to fix if ignored during the initial implementation.

### 1. Zero-Allocation (GC-Free) Audio Threading
Your `process()` loop currently initializes a new `triggers` array (`const triggers: Array<...> = [];`) on every single call (every ~2.9ms). In a high-performance audio thread, any heap allocation can trigger Garbage Collection, leading to audible stutters or "pops" in the audio output and missed triggers.
*   **The Question**: How will you refactor the communication layer to use a **Lock-free RingBuffer** or a **SharedArrayBuffer** to ensure the audio thread performs zero allocations during the steady-state processing loop?

### 2. Temporal Sync & Clock Drift
The `AudioWorklet` operates on the hardware clock (`currentTime`), while our `TimelineManager` and `PhysicsAnimationEngine` operate on the main thread clock (often derived from `performance.now()` or `Date.now()`). These clocks *will* drift over time, especially during long live sessions or when using external USB interfaces with varying buffer sizes.
*   **The Question**: What is your strategy for **clock synchronization** between the hardware audio timestamp and the visual playhead? If a trigger occurs at `audioCurrentTime: 105.42s`, how do we guarantee it snaps to the exact sub-frame coordinate on the canvas without visual jitter?

### 3. Filter State & Block Continuity
The provided snippet shows IIR filters as simple functions (`this.filterBass(sample)`). IIR filters (Infinite Impulse Response) rely on recursive state (previous inputs and outputs). If these filters do not maintain an internal state buffer between 128-sample blocks, the frequency response will be corrupted at every block boundary, rendering the filters ineffective.
*   **The Question**: With the slot-based architecture, how will you manage the **persistent state buffers** for dozens of independent IIR filter instances efficiently? Specifically, how do you handle state initialization/teardown when a slot is added or removed to prevent DC-offset spikes?

---

Please provide a technical addendum to the implementation plan addressing these points.

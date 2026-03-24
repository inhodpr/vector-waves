# Phase 5 Implementation Guide: Real-Time Audio (Live Mode)

This document describes the implementation of Phase 5, enabling responsive animation from external sound sources (microphones, system loopback).

---

## 🏗️ Architectural Overview

Phase 5 introduces a new `ITimeSource` adapter and a reactive triggering mechanism that allows animations to be driven by real-time audio amplitude rather than static timeline markers.

### Core Components

1.  **[LiveAudioAdapter.ts](file:///home/inhodpr/workspace/line-animator/app/src/renderer/src/engine/LiveAudioAdapter.ts)**:
    *   **Purpose**: Manages the Web Audio API lifecycle.
    *   **Capabilities**: 
        *   Enumerates audio input devices.
        *   Captures live audio using `getUserMedia`.
        *   Analyzes frequency data via `AnalyserNode`.
        *   Provides helper methods for calculating volume and band-specific amplitudes.
2.  **[LivePanel.tsx](file:///home/inhodpr/workspace/line-animator/app/src/renderer/src/components/LivePanel.tsx)**:
    *   **Purpose**: UI control for Live Mode and the primary trigger orchestrator.
    *   **Logic**: Runs a high-frequency loop (20fps) to poll volumes from the adapter and update the global state with new "Pluck" events.
3.  **[PhysicsAnimationEngine.ts](file:///home/inhodpr/workspace/line-animator/app/src/renderer/src/engine/PhysicsAnimationEngine.ts)**:
    *   **Reactive Triggering**: Detects `type: 'Reactive'` animations and sums displacements from all `activeTriggers` currently stored in the state.

---

## 📐 Detailed Specifications

### 1. The Reactive Trigger Loop

The trigger loop in `LivePanel.tsx` performs the following steps:
1.  **Poll Volume**: Get the current master volume and band-specific volumes (Bass: 20-250Hz, Mid: 250-4000Hz, Treble: 4000-20000Hz).
2.  **Filter & Threshold**: For each animation with a `Reactive` trigger, compare the current band volume against its `threshold`.
3.  **Refractory Period**: To prevent overwhelming the engine with too many waves, a 100ms refractory period is enforced between triggers on the same animation.
4.  **State Sync**: Cleanup expired triggers (older than 2,000ms) and append new triggers to the `activeTriggers` array in the Zustand store.

### 2. Frequency Band Mapping

The mapping of frequency bands to Hertz is as follows:
*   **Bass**: 20 Hz to 250 Hz
*   **Mid**: 250 Hz to 4,000 Hz
*   **Treble**: 4,000 Hz to 20,000 Hz
*   **Full**: Constant average of all frequency bins.

### 3. Data Structure: Active Triggers

Unlike temporal animations which have a fixed start/end marker, reactive animations use a dynamic array:
```typescript
export interface ActiveTrigger {
    timestampMs: number; // The relative playhead time when the trigger occurred
    intensity: number;   // Normalized 0.0 to 1.0 (amplitude / 255)
}
```

---

## 🧪 Phase 5 Testing Strategy

### 1. Adapter Stability
*   **Test**: Verify that `LiveAudioAdapter` correctly handles hardware disconnection or permission denial without crashing the `CanvasEngine`.

### 2. Trigger Density
*   **Test**: Ensure that the 100ms refractory period prevents performance degradation when loud, sustained signals are processed.

### 3. Wave Superposition
*   **Test**: Verify that multiple `activeTriggers` on a single line correctly sum their displacements in the `PhysicsAnimationEngine`, creating interference patterns.

# CTO Advisory: Audio Worklet & Detached Preview Coordination

**Subject**: Architectural Synchronization Consistency  
**Reviewer**: CTO  
**Date**: 2026-03-23  

As we move toward implementing both **Audio Worklet Triggers** and the **Detached Preview Window**, we face a potential "Synchronization Chain" problem that could lead to noticeable latency in our live performance features.

## ⚠️ Potential Conflict 1: Trigger Propagation Latency
The current Audio Worklet design sends "Pluck" triggers to the **Main Window**. If the Detached Window relies on the standard "State Patch" mechanism to receive these triggers:
*   **Path**: `AudioWorklet -> (SAB/Message) -> Main Window -> (State Store Update) -> (Diff/Patch Calc) -> (MessagePort) -> Detached Window -> Render`.
*   **Problem**: This chain adds ~16-32ms of latency. In "Live Mode," the Detached Preview (often used for projections) will look laggy compared to the physical sound and the Main Window UI.
*   **Solution**: **Direct Trigger Passthrough**. The `MessagePort` setup for the Detached Window should include a dedicated channel for raw `ActiveTrigger` events. The Main Window should relay these raw events *before* they even hit the state store, allowing the Detached Window to "pluck" its lines near-instantaneously.

## ⚠️ Potential Conflict 2: Clock Hierarchy ("Who is the Master?")
*   **Audio Worklet**: Wants the hardware `audioCtx.currentTime` to be the master clock.
*   **Detached Preview**: Currently plans to receive pulses from the Main Window.
*   **Conflict**: If the Main Window is throttled or stutters, the Detached Window will interpolate based on "bad" pulses, while the Audio Worklet is still churning out sample-accurate triggers.
*   **Solution**: The Main Window must propagate the **Audio Hardware Clock timestamp** (if active) in its `time-sync` pulses. The Detached Window should prioritize the high-precision audio timestamp over its own `requestAnimationFrame` delta when both are available.

## ⚠️ Potential Conflict 3: Resource Ownership
Both features require careful window-lifecycle management.
*   **Conflict**: If the user closes the Main Window while the Detached Window is open, or vice versa, the `AudioContext` (which is expensive and hardware-exclusive) must be disposed of cleanly.
*   **Requirement**: Explicitly designate the **Main Window** as the "Engine Owner." The Detached Window must NEVER attempt to initialize a `LiveAudioAdapter` or `AudioWorklet` itself. It must be a "dumb observer" of the Main Window's engine state.

---

## 🚦 CTO Directive: "The Unified Sync Strategy"
I am mandating that the two teams coordinate on a shared `MessagePort` protocol:
1.  **Sync Pulse (20Hz)**: Includes `projectTimeMs` + `audioHardwareTime` (if applicable).
2.  **Fast Path**: `DETACHED_PLUCK` events sent via raw IPC bypass.
3.  **Slow Path**: Project state patches for permanent changes (shapes, markers).

**Both plans are still APPROVED, but implementation must follow this unified protocol.**

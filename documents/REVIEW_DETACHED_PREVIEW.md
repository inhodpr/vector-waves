# CTO Review: Detached Preview Window Proposal

**Document Under Review**: `detached-preview-implementation.md`  
**Reviewer**: CTO  
**Date**: 2026-03-23  
**Status**: ⚠️ REVISION REQUIRED (Performance & Scalability Concerns)

The "Detached Preview" feature is a high-value addition for our professional users. However, the proposed implementation relies on a "naive" synchronization model that will fail to scale as project complexity grows. 

## 🔴 Critical Architectural Risks

### 1. IPC Saturation (The 60fps Problem)
The proposal to send `time-update` messages at 60fps via standard Electron IPC is dangerous. 
*   **Risk**: IPC is asynchronous and has overhead. Constant high-frequency messaging combined with large state payloads will saturate the main-thread message loop, leading to "input lag" in the IDE and "jitter" in the preview.
*   **Requirement**: Investigate using a **MessagePort** for direct renderer-to-renderer communication or a throttled synchronization strategy that allows the remote engine to "interpolate" between lower-frequency time sync pulses.

### 2. State Payload Scalability
Sending the *entire* project state (`payload`) on every mutation is unacceptable for a professional vector tool.
*   **Risk**: As users add more complex shapes (e.g., Phase 3 images and subdivided physics meshes), the JSON stringification and IPC transfer time will exceed the 16ms frame budget, causing the main editor to "freeze" momentarily on every edit.
*   **Requirement**: Implement **Differential Sync (Patches)**. Only send changed properties or entities.

### 3. Asset & Resource Duplication
The plan does not address how heavy assets (Phase 4 images) are shared.
*   **Risk**: Loading a 10MB background image twice (once in each window) doubles memory pressure and disk I/O.
*   **Requirement**: Specify how the detached window will reference assets (e.g., via local file paths already known to the main process) to avoid redundant memory allocation.

---

## 🧠 3 Hard Questions for the Team

1.  **State Scalability**: How do you plan to handle projects with 10,000+ vector points? Will the "Push Full State" model still work, or will we see O(N) performance degradation during editing?
2.  **Jitter Compensation**: In a multi-window Electron environment, the background window (the Detached Preview) often receives lower priority from the OS scheduler. How will you guarantee smooth 60fps playback if the `time-update` messages arrive at irregular intervals?
3.  **Audio/Visual Paradox**: If the user starts "Live Mode" (Phase 5), which window handles the `AudioContext`? If it's the main window, how do we ensure the detached window's animation (driven by reactive triggers) doesn't lag behind the physical sound?

---

**Status: REVISION REQUIRED**  
Please address the IPC bottleneck and state patch strategy before resubmitting.

# Technical Implementation Plan: Detached Preview Window

This document outlines the technical strategy for implementing the "Detached Preview Window" feature in Vector Vibe Animator.

## Overview
The feature allows users to open a secondary window that displays only the animation canvas. This window stays in real-time sync with the main editor and can be used for presentations, projections, or multi-monitor workflows.

## 1. Main Process Changes (`app/src/main/index.ts`)

### Window Management
-   Maintain a global reference: `let detachedPreviewWindow: BrowserWindow | null = null;`.
-   Implement an IPC handler `window:toggle-detached-preview`:
    -   If a detached window exists: `detachedPreviewWindow.close()`.
    -   If not: Create a new `BrowserWindow`.
    -   Load the app URL with a query parameter: `${process.env['ELECTRON_RENDERER_URL']}?mode=preview`.
    -   **Performance Optimization**: Create a `MessageChannel` and send one `MessagePort` to the Main Window and the other to the Detached Window via `postMessage`. This enables direct, low-latency renderer-to-renderer communication, bypassing the Main Process for high-frequency updates.
    -   Listen for the `closed` event to set the reference back to `null` and notify the main window to reattach.

### IPC State Relay (Fallback)
-   Standard IPC will be reserved for initial state handshake and window lifecycle events.

## 2. Preload Bridge (`app/src/preload/index.ts`)

Expose the following methods in a new `windowAPI`:
-   `setupMessagePort(port)`: Receives the `MessagePort` from the Main process.
-   `syncStateToPreview(patch)`: Sends **differential patches** (JSON Patch or similar) instead of the full state.
-   `onSyncState(callback)`: Listens for patches.

## 3. Renderer Architecture

### App Entry Point (`app/src/renderer/src/App.tsx`)
-   **Engine Ownership**: The Main Window is the "Engine Owner." It manages the `AudioContext`, `LiveAudioAdapter`, and `AudioWorklet`.
-   **Dumb Observer Mode**: The Detached Window (detected via `?mode=preview`) is a "dumb observer." It must NEVER attempt to initialize its own audio hardware or worklet. It relies entirely on the Main Window for both state and temporal pulses.
-   Conditional Rendering:
    -   **Preview Mode**: Render ONLY `CanvasContainer`. Disable all mouse/keyboard interactions on the canvas (display-only).
    -   **Standard Mode**: Render the full IDE.

### Temporal Synchronization (The Unified Sync Strategy)
-   **Fast Path (`DETACHED_PLUCK`)**: Reactive triggers from the Audio Worklet are relayed *immediately* via the `MessagePort` before hitting the UI state store. This bypasses the React/Zustand render cycle to maintain sub-10ms latency.
-   **Unified Sync Pulse (20Hz)**:
    -   Sent via `MessagePort`.
    -   Payload: `{ projectTimeMs, audioHardwareTime }`.
    -   The Detached Window uses `audioHardwareTime` to stay sample-locked to the audio thread.
-   **Slow Path (Patches)**: Differential state updates for structural changes (new lines, deleted markers).

### State Synchronization (`app/src/renderer/src/store/useAppStore.ts`)
-   **Differential Sync**: Use a library like `immer-patches` or a custom diffing utility to send only changed properties.
-   **Asset Handling**: The Detached Window will reference assets (Phase 4 Images) directly via their local file system absolute paths (which the Main Process already provides). This avoids redundant memory buffers; both windows will point to the same file resources.

## 4. UI Components

### Left Toolbar / Action Area
-   Add a new `[Action] Detach Preview` button.
-   Icon should toggle state (indicating if the preview is active).

### Reattach Overlay
-   When `detachedActive` is true, the `CanvasContainer` in the main window should display a blurred placeholder with a **"Reattach Preview"** button.
-   Clicking this will close the detached window via IPC.

## 5. Verification Plan

### Automated Tests
-   Unit tests for IPC message serialization and deserialization.
-   Mock Electron window tests to verify the toggle logic.

### Manual Verification
1.  Click "Detach Preview" in the main editor.
2.  Verify a new window opens showing only the canvas.
3.  Draw a line in the main editor; verify it appears instantly in the detached window.
4.  Move the playhead in the main editor; verify the animation syncs in the detached window.
5.  Close the detached window; verify the main editor's canvas is restored.
6.  Test Fullscreen (F11) in the detached window.

## 6. 3 Hard Questions (CTO Review Response)

1.  **State Scalability**: By switching to **Differential Sync**, editing a single point on a 10,000-point path will only transmit that point's delta, keeping IPC overhead at $O(1)$ rather than $O(N)$.
2.  **Jitter Compensation**: We will use a **Predictive Clock** in the detached renderer. It will advance time locally based on the last known playhead velocity and correct its drift only when sync pulses arrive, ensuring smooth 60fps animations.
3.  **Audio/Visual Paradox**: The **Main Window** handles the `AudioContext` (input/output). Real-time triggers (Phase 5 plucks) from the **Audio Worklet** are prioritized through the direct `MessagePort` fast-path to minimize the "A/V lag" to sub-5ms levels.

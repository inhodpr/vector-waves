# Phase 2 Implementation Guide: Audio/Timeline Authoring Logic

This document is the execution playbook for Phase 2. It builds upon the secure IPC and Hexagonal state mechanics established in Phase 1, introducing the dimension of time.

---

## 🏗️ The Execution Checklist

Follow this sequence strictly to implement the Audio/Timeline MVP.

### Step 1: Upgrading the State Schema
*   **Action:** Expand the Zustand `AppState` types to match the `audio` blocks defined in `DESIGN.md`. 
*   **Files Touched:** `src/renderer/src/store/types.ts`, `src/renderer/src/store/useAppStore.ts`.
*   **Goal:** Add `audio: { tracks: [], markers: [] }` to the core schema. Create Zustand mutations for `addTrack`, `addMarker`, `updateMarkerTime`, and `removeMarker`. Validations must ensure a marker's `timestampMs` does not overlap or invert (e.g., Marker A going past Marker B).

### Step 2: The Hexagonal Time Interface (`ITimeSource`)
*   **Action:** Define the interface that will decouple the `CanvasEngine` from the actual music clock.
*   **Files Touched:** `src/renderer/src/engine/ITimeSource.ts`.
*   **Goal:** The Engine only needs one thing: to know what time it is. 
```typescript
// Define this strictly
export interface ITimeSource {
  getCurrentTimeMs(): number;
  onTimeUpdate(callback: (timeMs: number) => void): void;
}
```

### Step 3: Implement WebAudio `AudioPlaybackAdapter`
*   **Action:** Build the concrete implementation of `ITimeSource` that plays real audio in the browser layer using the **Web Audio API** (not the legacy HTML5 `<audio>` element).
*   **Files Touched:** `src/renderer/src/engine/AudioPlaybackAdapter.ts`, `src/renderer/src/engine/TimelineManager.ts`.
*   **Goal:** This adapter parses audio into an `AudioBuffer` via `audioContext.decodeAudioData()`. This allows seamless playback via `AudioBufferSourceNode` while perfectly maintaining the raw PCM Float32 byte arrays needed for the waveform UI renderer.

### Step 4: Inject Time into the Application Loop
*   **Action:** Wire the new clock into the existing `CanvasEngine` and `Ticker`.
*   **Files Touched:** `src/renderer/src/engine/Ticker.ts`, `src/renderer/src/engine/CanvasEngine.ts`.
*   **Goal:** Pass the `ITimeSource.getCurrentTimeMs()` into `CanvasEngine.update(timestampMs)`. The engine now theoretically runs "in sync" with the music.

### Step 5: Timeline UI Components (Windowing/Culling logic)
*   **Action:** Build the React components for the bottom Timeline panel.
*   **Files Touched:** `src/renderer/src/components/TimelinePanel.tsx`, `src/renderer/src/components/WaveformRenderer.tsx`.
*   **Goal:** Implement a scrollable/zoomable area rendering drawing the Float32 PCM arrays dynamically.
*   **⚠️ CRITICAL WARNING (Canvas Geometry Limits):** Do NOT create a `<canvas>` element arbitrarily wide for the entire track based on the zoom factor. Browsers will crash if you attempt a 180,000px wide canvas. The `<canvas>` element itself must remain statically sized (e.g. `100%` viewport width). The React `useEffect` drawing handler must implement physical windowing/culling: doing the math to calculate *which exact segment* of the audio array falls within the current visible viewport timestamps, and only drawing those specific lines.

### Step 6: Marker Interaction Handlers & Keyboard Hotkeys
*   **Action:** Implement timeline mouse dragging and Spacebar Play/Pause toggles.
*   **Files Touched:** `src/renderer/src/tools/TimelineInteractionHandler.ts` (or similar), `src/renderer/src/App.tsx`.
*   **Goal:** Allow users to drag a marker horizontally, dispatching Zustand mutations representing `timestampMs`.
*   **⚠️ CRITICAL WARNING (Focus Management):** REQUIREMENTS.md mandates Spacebar controls Play/Pause. When binding this global hotkey, you *must* check `document.activeElement`. If the user is typing `#FF0000` into the Color Picker properties panel and hits Space, they should not accidentally start blaring music. Only intercept the key if the active element is the document body or canvas.

### Step 7: Security & I/O: The IPC Bundle Protocol
*   **Action:** Safely bridge local system files into the Chromium sandbox.
*   **Files Touched:** `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/App.tsx`.
*   **Goal:** Electron renderer processes cannot organically load strict `file://` URIs due to Chromium CORS policies. When the user "Loads an Audio Track", `main.ts` will open the dialog, `fs.readFile()` the bytes into a pure ArrayBuffer, and stream that IPC message back to the renderer so React can generate an internal `Blob`. Alternatively, you can use the `protocol.registerFileProtocol('vva://')` route on initialization to bypass CORS entirely.

---

## 1. Security: Expanding the IPC Context Bridge

In Phase 1, the user clicked "Save" and we saved JSON text. Now, the user must select an audio file from their hard drive to use. We must let Electron route the real paths safely over IPC.

### The Backend Dialog (`src/main/index.ts`)
```typescript
// main/index.ts
import { ipcMain, dialog } from 'electron';
import fs from 'fs/promises';

ipcMain.handle('select-audio-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav'] }]
  });
  
  if (canceled || filePaths.length === 0) return null;
  
  const absolutePath = filePaths[0];

  // Secure Delivery Method A: Buffer streaming
  const fileBuffer = await fs.readFile(absolutePath);
  
  return {
    originalPath: absolutePath,
    buffer: fileBuffer // React will turn this into a Blob URL and pass it to AudioContext
  };
});
```

### The Frontend Call (`src/preload/index.ts` & `App.tsx`)
```typescript
// preload/index.ts
contextBridge.exposeInMainWorld('audioAPI', {
  selectTrack: () => ipcRenderer.invoke('select-audio-file'),
});
```

---

## 2. Core Audio Strategy: The `AudioPlaybackAdapter` (Web Audio API)

Do not use legacy `<audio>` tags. We need the raw data for drawing the visualization.

```typescript
// src/renderer/src/engine/AudioPlaybackAdapter.ts
import { ITimeSource } from './ITimeSource';

export class AudioPlaybackAdapter implements ITimeSource {
    private audioContext: AudioContext;
    private audioBuffer: AudioBuffer | null = null;
    private sourceNode: AudioBufferSourceNode | null = null;
    private startTime: number = 0;
    private pauseTime: number = 0;
    
    constructor() {
        this.audioContext = new AudioContext();
    }

    public async loadTrackFromBuffer(arrayBuffer: ArrayBuffer) {
        this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    }

    public getPcmData(): Float32Array {
        // Essential step for returning pure amplitude array down to the Waveform UI
        return this.audioBuffer ? this.audioBuffer.getChannelData(0) : new Float32Array(0);
    }

    public play() { /* Connect SourceNode from paused time -> destination */ }
    public pause() { /* Disconnect SourceNode and save state */ }
    
    public getCurrentTimeMs(): number {
       // Logic calculating context.currentTime offset versus play state
       return timeMs;
    }
}
```

---

## 3. UI Mathematics: The Zoomable Timeline

The timeline maps absolute milliseconds (`timestampMs`) to horizontal coordinates (`X`).

**The Math Helper (`src/renderer/src/utils/timeMath.ts`):**
```typescript
export const TimeMath = {
  /**
   * Converts an exact timestamp to an infinite virtual pixel X coordinate.
   * zoomLevel = Pixels per millisecond.
   */
  timeToPixel: (timeMs: number, zoomLevel: number, viewportOffsetPixels: number = 0): number => {
    return (timeMs * zoomLevel) - viewportOffsetPixels;
  },

  /**
   * Converts a user mouse click X coordinate back to absolute milliseconds.
   */
  pixelToTime: (pixelX: number, zoomLevel: number, viewportOffsetPixels: number = 0): number => {
    return (pixelX + viewportOffsetPixels) / zoomLevel;
  }
};
```

**⚠️ CRITICAL WARNING (Focus Management): Spacebar to Play/Pause**
`REQUIREMENTS.md` explicitly calls for "Spacebar to Play/Pause." When writing the React event listener for `keydown` (likely inside `App.tsx` or `TimelinePanel.tsx`), you **must** check `document.activeElement`. If the user has focused an `<input type="color">` or `<input type="text">` to type a hex code, pressing Spacebar should *not* start playing the music. Only intercept the Spacebar if the active element is `document.body` or the `<canvas>` element.

---

## 4. Phase 2 Testing Strategy

Because we isolated `ITimeSource`, testing the engine remains simple.

*   **Test 1 (Time Mapping Logic):** Write pure Jest/Vitest tests for `TimeMath.timeToPixel` and `TimeMath.pixelToTime`.
*   **Test 2 (Store Constraints):** Write Zustand tests ensuring that `updateMarkerTime(id, newTime)` immediately rejects the mutation if `newTime` crosses over another bound marker.
*   **Test 3 (Hexagonal Wiring):** Inject a mock `ITimeSource` into `CanvasEngine`. Assert that `CanvasEngine.update(time)` pulls the exact expected frame.

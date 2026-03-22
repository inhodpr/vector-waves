# Phase 4 Implementation Guide: Polish & Export Media

This document is the execution playbook for Phase 4. It builds upon the vector physics and timeline architecture established in Phases 1-3, introducing manual image manipulation and finalizing the media export ecosystem.

---

## 🏗️ The Execution Checklist

Follow this sequence strictly to implement the Manual Cropping Modal, Free-Floating Bounded Objects, and final Export Polish.

### Step 1: Upgrading the State Schema (Image Objects)
*   **Action:** Expand the Zustand `AppState` to support a new entity type: `ImageEntity` (as defined in `DESIGN.md`).
*   **Files Touched:** `src/renderer/src/store/types.ts`, `src/renderer/src/store/useAppStore.ts`.
*   **Goal:** 
    *   Implement `addImageEntity(assetId: string, bounds: Rect)`: Adds a free-floating image to the `entities` Record.
    *   Support transformations (position, scale) for image entities in the state store.

### Step 2: The Manual Image Cropper Modal
*   **Action:** Create a specialized modal component for selecting a sub-region of an imported image.
*   **Files Touched:** `src/renderer/src/components/ImageCropperModal.tsx` [New].
*   **Goal:** 
    *   **Visual Interface:** Render the full-resolution image with a draggable/resizable overlay rectangle (matching the project aspect ratio).
    *   **Logic:** When "Confirm" is clicked, calculate the normalized UV coordinates of the crop rectangle (0.0 to 1.0) and save them to the `ImageEntity`.

### Step 3: Polymorphic Rendering (CanvasEngine)
*   **Action:** Update the `CanvasEngine` to handle rendering `ImageEntity` types.
*   **Files Touched:** `src/renderer/src/engine/CanvasEngine.ts`.
*   **Goal:** 
    *   The engine must detect `entity.type === 'Image'`.
    *   Use the stored crop UV coordinates to execute a source-to-destination `ctx.drawImage` call.
    *   **Interaction:** Allow the `SelectToolHandler` to hit-test the bounding box of image entities.

### Step 4: Export Polish (MP4 Metadata & Progress)
*   **Action:** Finalize the FFmpeg pipeline to include metadata and better progress feedback.
*   **Files Touched:** `src/main/index.ts`, `src/renderer/src/components/ExportDialog.tsx`.
*   **Goal:** 
    *   Handle cases where FFmpeg is not installed (emit a helpful error log).
    *   Automatically include the audio track in the final MP4 muxing stage (Phase 2 currently only exports video frames).
    *   **Warning (Muxing Overhead):** FFmpeg muxing can take time. Update the `ExportDialog` to show a "Muxing Audio..." state after all frames are rendered but before the file is finalized.

---

## 📐 Detailed Specifications

### 1. Manual Cropping Logic
The cropper must not physically manipulate the buffer (to avoid multi-generational quality loss). Instead, it stores "View Rect" metadata:
```typescript
interface ImageEntity {
    type: 'Image';
    assetId: string;
    crop: { x: number, y: number, w: number, h: number }; // Normalized 0-1
    canvasBounds: { x: number, y: number, width: number, height: number }; 
}
```
Rendering then uses these indices for the `ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)` call.

### 2. FFmpeg Audio Integration (The Final Mux)
Currently, `ExportManager.ts` sends video frames to FFmpeg. To include music, the final FFmpeg command in `main/index.ts` must be updated during `finish-export`:
1.  Temporarily save the raw video to a buffer/temp file.
2.  Run a second FFmpeg pass: `ffmpeg -i temp_video.mp4 -i audio_track.mp3 -c copy -map 0:v:0 -map 1:a:0 final_video.mp4`.
3.  Alternatively, stream audio packets directly during the pipe (higher complexity).

---

## 🧪 Phase 4 Testing Strategy

### Framework
**Vitest** (CLI-based).

### Test Suites to Write

**1. Cropping Geometry (`CroppingMath.test.ts`)**
*   **Purpose:** Ensure the normalized UV coordinates correctly map back to pixel offsets for any source image resolution.
*   **Assertion:** Given a 4000x3000 image and a 0.5 center crop, verify `sx` and `sy` are calculated correctly.

**2. FFmpeg Handle Stability (`MainProcess.test.ts`)**
*   **Purpose:** Mock the `spawn` process to ensure the IPC event lifecycle correctly handles `finish-export` and process crashes.

**3. Z-Order Regression (`EntityZOrder.test.ts`)**
*   **Purpose:** Ensure adding `ImageEntity` to the flat `entities` store doesn't break the existing Z-order sorting used by `LineEntity`.

# Implementation Plan: Line Extraction & Hybrid Healing

This plan outlines the steps to implement the **Line Extraction & Hybrid Healing** feature. This feature allows users to "snatch" a line from a background image and convert it into a fully animatable entity while automatically "erasing" the ghost of that line in the background during active vibrations.

## Objective
Enable a seamless workflow where a user:
1.  Selects the **Extract Tool** and picks a line color.
2.  Clicks along a line in the background image.
3.  Double-clicks to **snap** points to the center of the line.
4.  Triggers an **auto-extraction** that creates a new `Line` entity and generates a "Heal Patch" for the background.

---

## Technical Context & References

### 1. Ridge Detection (Directional Continuity)
When searching the 7x7 grid, we must apply a **Directional Continuity Constraint**.
- **Constraint**: Prioritize pixels that align with the previous segment's unit vector ($D_{normalized} \cdot P_{next}$) to prevent "jumping" at intersections.
- **Robustness**: Apply a **Gaussian Blur** (5x5) to the source `ImageData` *before* tracing to ignore single-pixel noise.

### 2. Normal-Based Healing (High Fidelity)
To "erase" the line, we sample pixels from *both* sides of the stroke symmetrically.
- **Improved Sampling**: For every point $P$ on the path, sample the pixel at $(P \pm N \cdot (width + 5px))$, where $N$ is the **Local Normal**. This clones the texture grain from the immediate surroundings, preventing "tearing" or misalignment on diagonal/curved lines.

---

## 1. Domain Types & State Updates

### [MODIFY] `app/src/renderer/src/store/types.ts`
We need to track which entities have a "Heal Patch" and add the new tool type.

1.  Add `healPatchAssetId?: string;` to the `LineEntity` interface.
2.  Add `patchOffset?: Point;` to `LineEntity` (for localized bounding-box rendering).
3.  Add `'Extract'` to the `activeTool` literal type in `AppState`.
4.  Add `isExtracting: boolean;` to `AppState` to show/hide the "Processing..." bar.

### [MODIFY] `app/src/renderer/src/store/useAppStore.ts`
Add actions for managing the extraction and asset lifecycle.

- **CTO Review Fix (IPC Latency)**: Adopt an **Asset Relay Strategy**.
    - Since we are in Electron, the `main` process should maintain a **Map of Blobs**.
    - Renderers request assets by ID and receive a local `objectURL`. This ensures <10ms sync for the Detached Preview without serializing raw buffers into the state.
- `setIsExtracting(active: boolean)`: Toggles the global processing state.
- `addHealPatchAsset(id: string, buffer: Uint8Array)`: Stores the patch in the shared asset store.
- **CTO Review Fix (Orphaning)**: Implement `removeHealPatchAsset(assetId)`. Hook this into `deleteEntity` to prevent memory bloat and project file orphaning.

---

## 2. Core Utility Logic

### [NEW] `app/src/renderer/src/utils/LineExtractor.ts`
This class handles the heavy lifting of pixel analysis. Use an `OffscreenCanvas` to avoid blocking the main UI thread during processing.

#### `public static analyzeRidge(points: Point[], imageData: ImageData, targetColor: RGB, tolerance: number): Point[]`
1.  **Performance Tip**: Convert `ImageData` to a `Uint32Array` *once* at start: `const data = new Uint32Array(imageData.data.buffer)`. Access via `data[y * width + x]`.
2.  For each segment $(P_i, P_{i+1})$, calculate:
    - **Direction**: $D = P_{i+1} - P_i$
    - **Normal**: $N = (-D.y, D.x) / \text{length}(D)$
3.  Sample perpendicular to the segment at $P + t \cdot N$ where $t \in [-W/2, W/2]$.
4.  Find pixel with lowest color distance and return the smoothed ridge path.

#### `public static generateHealPatch(path: Point[], width: number, imageData: ImageData): { buffer: Uint8Array, offset: Point }`
1.  **Optimization (Memory)**: Calculate the **Clamped Bounding Box** $(X_{min}, Y_{min}, X_{max}, Y_{max})$ of the `path` plus a 20px margin.
2.  Create an `OffscreenCanvas` sized to this bounding box.
3.  **Normal-Based Fill**:
    - Draw the path into the local coordinate space.
    - Sample source pixels from $(P_{global} \pm N \cdot (width + 5px))$ and paint them into the patch.
4.  Return the localized PNG buffer and the global $\{x, y\}$ offset.

---

## 3. Tool Implementation

### [NEW] `app/src/renderer/src/tools/ExtractToolHandler.ts`
Implement the `IToolHandler` interface.

- **`onMouseDown`**: Add a point to the current draft line.
- **Double-Click Detection**: Use a `setTimeout` (approx 250ms) to distinguish between a single-click (normal point) and a double-click (snap request).
- **Extraction Sequence**:
  1.  If two consecutive "snap" points are detected, call `setIsExtracting(true)`.
  2.  Run `LineExtractor.analyzeRidge` and `generateHealPatch`.
  3.  Call `state.addEntity()` with the new `LineEntity`.
  4.  Assign the `healPatchAssetId` and call `setIsExtracting(false)`.

---

## 4. Rendering Pipeline Integration

### [MODIFY] `app/src/renderer/src/engine/CanvasEngine.ts`
Update `renderEntity` to handle the conditional "Heal Patch" display.

- **CTO Review Fix (Performance Scalability)**: If 20+ lines are animating, batch these patches into a single `PatchOverlayCanvas` layer to avoid multiple high-alpha `drawImage` calls per frame.
- **Geometry Edits**: If the user moves a vertex in `EditPts` mode, trigger a re-generation of the `healPatch` on `MouseUp` to maintain texture alignment.
1.  **Check Animation State**: Determine if the line is currently vibrating (e.g., `amplitude > 0.01`).
2.  **Alpha Rendering**: If vibrating and `entity.healPatchAssetId` exists:
    - Use `ctx.globalAlpha` to fade in the patch over 100ms.
    - Draw the patch at `entity.patchOffset` directly over the background.
    - Reset `ctx.globalAlpha`.
3.  **Draw the Line**: Render the vibrating line entity on top of the patch.

---

## 5. UI Integration

### [MODIFY] `app/src/renderer/src/components/Toolbar.tsx`
1. Add an "Extract Line" button with an eye-dropper icon.
2. Add a global overlay that displays a "Processing Extraction..." progress bar when `state.isExtracting` is true.

---

## Verification Plan

### Automated Tests
- **Unit Test `LineExtractor.ts`**: Mock a simple 10x10 black-and-white image and verify that `analyzeRidge` finds the center.
- **Store Test**: Verify that adding a "Heal Patch" correctly updates the assets dictionary and entity property.

### Manual Verification
1.  Import a background image containing a distinct line (e.g., a hand-drawn wave).
2.  Use the Extract Tool to eye-drop the color.
3.  Draw along the line and double-click to snap.
4.  Confirm extraction: The background line should look identical when idle.
5.  Add a "Vibration" animation: Verify the background line disappears (healed) and the new vector line vibrates smoothly on top.

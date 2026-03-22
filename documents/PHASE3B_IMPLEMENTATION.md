# Phase 3b Implementation Guide: Usability & Efficiency

This phase focuses on "DAW-standard" refinements to the timeline and global tool interactions, as requested by the PM and Tech Lead.

---

## 🏗️ The Execution Checklist

### Step 1: State Schema Expansion (Timeline Viewport)
*   **Action:** Add persistent viewport properties to the Zustand store to support reactive zooming and panning.
*   **Files Touched:** `src/renderer/src/store/types.ts`, `src/renderer/src/store/useAppStore.ts`.
*   **Goal:** 
    *   Add `timelineZoomLevel: number` (pixels per millisecond, default: 10).
    *   Add `timelineScrollOffsetPx: number` (horizontal scroll position, default: 0).
    *   Add `setTimelineZoom(zoom: number, focusTimeMs?: number)`: Updates zoom and optionally adjusts scroll offset to keep a specific time point centered.
    *   Add `setTimelineScroll(offset: number)`: Updates the scroll offset.
    *   Add `addAudioMarkerAtTime(timeMs: number)`: Unified action for adding markers.

### Step 2: Global Edit Points Mode
*   **Action:** Enable interaction with vertices across ALL shapes simultaneously when the EditPts tool is active.
*   **Files Touched:** `src/renderer/src/tools/EditPtsToolHandler.ts`, `src/renderer/src/engine/CanvasEngine.ts`.
*   **Goal:** 
    *   **Hit-Testing:** Update `EditPtsToolHandler.onMouseDown`. Iterate through `state.entityIds` in **REVERSE order** (from `length-1` down to `0`) to correctly respect visual Z-order.
    *   **Performance Warning:** Since vertices may be vibrating in Phase 3, hit-testing a moving physics mesh is expensive. For initial selection, you should hit-test the **base un-deformed vertices**. Once a shape is selected, its vibrating vertices can be individually hit-tested for dragging.
    *   **Implicit Selection:** If the hit vertex belongs to an entity other than the currently selected one, immediately dispatch `setSelectedEntityId(ownerId)`.

### Step 3: DAW-Standard Timeline Navigation
*   **Action:** Implement advanced `onWheel` and keyboard handlers for the Timeline UI.
*   **Files Touched:** `src/renderer/src/components/TimelinePanel.tsx`.
*   **Goal:** 
    *   **Zooming (Ctrl + Scroll):** Calculate the time under the mouse cursor. Adjust `timelineZoomLevel` and then re-calculate `timelineScrollOffsetPx` so that the time-under-mouse remains at the same pixel position.
    *   **Panning (Shift + Scroll):** Map vertical wheel delta to horizontal `timelineScrollOffsetPx`.
    *   **Auto-Scroll (Thresholding):** Update the playback loop (or a reactive effect). Do *not* scroll continuously as this causes jitter. Instead, wait until the playhead position exceeds **90% of the visible viewport width**, then update `timelineScrollOffsetPx` significantly. 
    *   **Precision:** Use `Math.floor()` for all pixel-to-time calculations to avoid "sub-pixel drift" during scroll operations.

### Step 4: Marker Interaction Triggers
*   **Action:** Add multiple entry points for marker creation.
*   **Files Touched:** `src/renderer/src/components/TimelinePanel.tsx`, `src/renderer/src/components/CanvasEditor.tsx` (or global keyboard listener).
*   **Goal:** 
    *   **Double-Click:** Add marker at the clicked time on the waveform.
    *   **Hotkey 'M':** Add marker at the current playback position. 
    *   **Warning (Hotkey Focus Management):** Just like in Phase 1, you must check if the user is typing in a property field. Before handling the 'M' key, verify that `document.activeElement === document.body`.
    *   **Context Menu:** Implement a basic right-click menu on the timeline for "Add Marker here".

---

## 📐 Detailed Specifications

### 1. Centered Zoom Mathematics (Avoiding Drift)
To prevent the timeline from "jumping" during zoom, we use this logic:
1.  **Anchor the time:** At the start of the wheel event, calculate `timeAtMouse = (mouseX + scrollOffset) / oldZoom`.
2.  **Apply Zoom:** Update the `timelineZoomLevel`.
3.  **Correct Offset:** Calculate `newScrollOffset = (timeAtMouse * newZoom) - mouseX`.
4.  **Math Precision:** Wrap the result in `Math.floor()` to ensure integers. If you don't use integers, small rounding errors in the floating-point browser engine will cause the waveform to slowly "drift" away from the cursor as the user zooms in and out.
This ensures the specific audio event the user is looking at stays under their cursor.

### 2. Performance-Optimized Global Hit-Testing
In `EditPtsToolHandler`, we iterate `entities` -> `vertices`. 
*   **Optimization:** We only run this check `onMouseDown`. For `onMouseMove`, we continue dragging the previously memoized `selectedPointIndex` and `selectedEntityId`.
*   **Culling:** Since vertex handles are small (8px), we can quickly skip entities whose bounding boxes (cached or calculated) don't contain the mouse coordinates.

---

## 🧪 Phase 3b Testing Strategy

### Framework
**Vitest** (CLI-based unit execution).

### Test Suites to Write

**1. Global Edit Logic (`EditPtsToolHandler.test.ts`)**
*   **Scenario:** Two lines exist, Line A is selected. User clicks a vertex on Line B.
*   **Assertion:** Verify `selectedEntityId` becomes Line B and `selectedPointIndex` is correctly set.
*   **Scenario:** Pressing 'Delete' with a vertex selected.
*   **Assertion:** Verify the vertex is removed from the correct entity's array.

**2. Timeline Navigation Math (`TimelineNavigation.test.ts`)**
*   **Scenario:** Zooming in with cursor at 50% of the viewport.
*   **Assertion:** Calculate expected `scrollOffset` and verify it matches the implementation's state update.
*   **Scenario:** Panning with Shift key.
*   **Assertion:** Verify `onWheel` delta maps to `scrollOffset` changes.

**3. Auto-Scroll Logic (`TimelineAutoScroll.test.ts`)**
*   **Scenario:** Playhead at 990px, Viewport Width 1000px, Movement +20px.
*   **Assertion:** Verify `scrollOffset` increments to keep playhead within 0-1000px range.

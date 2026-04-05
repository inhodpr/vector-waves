# Goal Description

The user wants to zoom in and out of the entire canvas workspace using `ctrl + scroll up` and `ctrl + scroll down`, and smoothly pan across the canvas using `shift + scroll` (or trackpad scrolling). This will be implemented by introducing a coordinate-aware zoom and pan state in `CanvasContainer.tsx` that controls the CSS `transform` (scale and translation) of the canvas wrapper, scaling both the vectors and background image simultaneously without interrupting the coordinate system. The zoom will center on the user's mouse cursor exactly, utilizing a continuous translation/scale 2D math approach to avoid layout jumps.

## Proposed Changes

### `app/src/renderer/src/components/CanvasContainer.tsx`

**1. New Hooks & State:**
- Add `const [transform, setTransform] = useState({ scale: 0.8, x: 0, y: 0 })` to store both the zoom level and the current 2D translation offset, initialized to the current default `0.8` scale with 0 offsets.
- The `containerRef` is already declared as `const containerRef = useRef<HTMLDivElement>(null)`.

**2. Modifications to `useEffect` (Consolidating Wheel Events):**
- Modify the existing `useEffect` (currently lines 101-122) that handles `wheel` events on `canvasRef.current` to be attached instead to `containerRef.current`. This prevents duplicate wheel interactions over the canvas bounding box.
- Create a unified `handleWheel` logic block:
  1. Determine mouse relative coordinates:
     ```javascript
     const rect = containerRef.current.getBoundingClientRect();
     const mouseX = e.clientX - rect.left;
     const mouseY = e.clientY - rect.top;
     ```
  2. If `state.backgroundEditMode && state.backgroundImageAssetId` is active, execute the *existing* logic to zoom the background image scaling value. Be sure to call `e.preventDefault()`.
  3. Else, if `e.ctrlKey` is true:
     - Call `e.preventDefault()` to prevent default browser zooming. Note that this requires attaching the event natively with `{ passive: false }`.
     - Determine the continuous scale factor: `const zoomSensitivity = 0.005;` and `const newScale = Math.max(0.1, Math.min(5.0, transform.scale * Math.exp(-e.deltaY * zoomSensitivity)))`.
     - Calculate the bounding scale ratio: `const scaleRatio = newScale / transform.scale;`
     - Calculate the new offsets to perfectly keep the cursor locked to the matched canvas pixel:
       ```javascript
       const newX = mouseX - (mouseX - transform.x) * scaleRatio;
       const newY = mouseY - (mouseY - transform.y) * scaleRatio;
       ```
     - Call `setTransform({ scale: newScale, x: newX, y: newY })`.
  4. Else if `e.shiftKey` or regular scrolling is detected:
     - Call `e.preventDefault()` to prevent outer document scrolling.
     - Update translation offsets by subtracting the wheel deltas, maintaining the current scale. If `Shift` is held on a standard mouse wheel, force the vertical delta into a horizontal pan.
       ```javascript
       let dx = e.deltaX; let dy = e.deltaY;
       if (e.shiftKey && dy !== 0 && dx === 0) { dx = dy; dy = 0; }
       
       const newX = transform.x - dx;
       const newY = transform.y - dy;
       ```
     - Call `setTransform({ scale: transform.scale, x: newX, y: newY })`.

**3. Modifications to JSX:**
- In the inner wrapper `<div style={{ transform: 'scale(0.8)', transformOrigin: 'center', transition: 'transform 0.1s' }}>`:
  - Update `transform` to use `transform: \`translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})\``.
  - Update `transformOrigin` to strictly `'0 0'` (top-left). This is critically important so that the calculated translation offsets strictly match Euclidean space without CSS injecting dual offsets.
  - Completely remove `transition: 'transform 0.1s'` to ensure immediate 1-to-1 visual synchronization when wheel deltas are fired rapidly.

## References

Review the following documentation to understand the foundational APIs and constraints:
* **MDN - WheelEvent & deltaY handling:** [https://developer.mozilla.org/en-US/docs/Web/API/WheelEvent](https://developer.mozilla.org/en-US/docs/Web/API/WheelEvent)
* **Chrome specific interventions on Passive Wheel Listeners:** [https://developer.chrome.com/blog/scrolling-intervention/](https://developer.chrome.com/blog/scrolling-intervention/)
* **React Refs for native DOM access:** [https://react.dev/reference/react/useRef](https://react.dev/reference/react/useRef)

## Verification Plan

### Automated Tests
- N/A. Zoom is purely a visual UI interaction and relies on native DOM events.

### Manual Verification
1. Open the application.
2. Enter background edit mode and verify background image zoom still works.
3. Exit background edit mode. Hold `Ctrl` and scroll the trackpad/mouse wheel up and down over a specific point on the canvas.
4. Verify that the canvas zooms responsively and exactly based on the wheel delta.
5. Verify that the pixel under the cursor remains perfectly stationary relative to the screen during the zoom process, exhibiting zero jitter or sudden jumps.
6. Check that drawing lines while zoomed closely into the canvas correctly positions the line endpoint at the mouse since `offsetX/Y` naturally absorbs standard CSS 2D transforms.

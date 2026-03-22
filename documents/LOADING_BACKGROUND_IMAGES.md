# Background Image Support with Cropping

Implement the ability to set a background image for the canvas. The image will be "cropped" automatically to cover the entire canvas area (maintaining aspect ratio and centering).

## Proposed Changes

### [Component] Backend / IPC

#### [MODIFY] [index.ts](file:///home/inhodpr/workspace/line-animator/app/src/main/index.ts)
- Add `select-image-file` IPC handler.
- Use `dialog.showOpenDialog` with image filters (jpg, png, svg).
- Read the file into a buffer and return it to the renderer.

#### [MODIFY] [index.ts](file:///home/inhodpr/workspace/line-animator/app/src/preload/index.ts)
- Expose `imageAPI` to the renderer with a `selectImage` function.

### [Component] Frontend Store

#### [MODIFY] [useAppStore.test.ts](file:///home/inhodpr/workspace/line-animator/app/src/renderer/src/store/useAppStore.test.ts)
- Add tests for `addImageAsset` and `setBackgroundImage` actions.

### [Component] Frontend Engine

#### [MODIFY] [CanvasEngine.ts](file:///home/inhodpr/workspace/line-animator/app/src/renderer/src/engine/CanvasEngine.ts)
- Implement an image cache to avoid recreating `HTMLImageElement` every frame.
- Update `draw()` to render the background image if `backgroundImageAssetId` is set.
- Implement "object-fit: cover" logic for the canvas background:
    - Calculate scale to fill the canvas.
    - Calculate offsets to center the image.
    - Use `ctx.drawImage` with source and destination rectangles.

### [Component] Debugging & Refinement

#### [MODIFY] [index.html](file:///home/inhodpr/workspace/line-animator/app/src/renderer/index.html)
- Update Content Security Policy to allow `blob:` in `img-src`.

#### [MODIFY] [CanvasEngine.ts](file:///home/inhodpr/workspace/line-animator/app/src/renderer/src/engine/CanvasEngine.ts)
- Add MIME type detection based on magic numbers.
- Prevent log flooding (already partially done, but will refine).

---

## Verification Plan

### Automated Tests
- Run `npm test` (which should run Vitest) to ensure store actions are working correctly.
- Specifically, verify `useAppStore.test.ts`.

### Manual Verification
1. Start the application with `npm run dev`.
2. Open the "Project Settings" panel.
3. Click "Choose Image" and select a high-resolution image.
4. Verify the image appears as the canvas background.
5. Verify the image covers the entire canvas without stretching (aspect ratio maintained).
6. Resize the canvas (if possible) or change project dimensions to verify the "cover" crop logic remains centered.
7. Click "Remove" and verify the background reverts to the solid color.

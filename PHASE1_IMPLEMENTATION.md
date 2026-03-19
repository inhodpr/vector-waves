# Phase 1 Implementation Guide: Vector Vibe Animator

This document is the execution playbook for Phase 1. It bridges the gap between the high-level architecture defined in [DESIGN.md](../../../../workspace/line-animator/DESIGN.md) and the actual code you are about to write. 

## The Execution Checklist
Follow this sequence strictly to implement the Core Engine & Visualization MVP.

### Step 1: Repo Setup & Security Boilerplate
*   **Action:** Do not stitch libraries manually. Use the community standard Electron-Vite boilerplate (`npm create @quick-start/electron@latest` selecting React/TS).
*   **Files Touched:** `src/main/index.ts` (for the IPC handlers), `src/preload/index.ts` (for the Context Bridge).
*   **Goal:** Establish the dual build pipeline (Node backend + React frontend) and expose a secure API for saving/loading `.vva` projects. See *Section 2* below for the exact IPC code.

### Step 2: State Layer & Data Structures
*   **Action:** Install Zustand and define the TS types based on the Polymorphic Entity interfaces in `DESIGN.md`.
*   **Files Touched:** `src/renderer/src/store/types.ts` (Interface definitions), `src/renderer/src/store/useAppStore.ts` (Zustand hook).
*   **Goal:** Create a globally accessible, framerate-independent state store. Implement the `updateEntityStyle` mutation and basic Z-Order array mutations (`Bring Forward`, etc.). 

### Step 3: Hexagonal Engine Wiring
*   **Action:** Implement the `CanvasEngine` and decouple its clock so it can be stepped dynamically.
*   **Files Touched:** `src/renderer/src/engine/CanvasEngine.ts`, `src/renderer/src/engine/IAnimationEngine.ts`, `src/renderer/src/engine/Ticker.ts`.
*   **Goal:** The Engine must read purely from Zustand without knowing React exists. Implement the `Ticker` class to run `requestAnimationFrame` and call `CanvasEngine.update()` and `CanvasEngine.draw()`.

### Step 4: UI Scaffolding & Context Isolation
*   **Action:** Build the React layout, binding inputs strictly to Zustand mutations.
*   **Files Touched:** `src/renderer/src/App.tsx`, `src/renderer/src/components/LeftToolbar.tsx`, `src/renderer/src/components/PropertiesPanel.tsx`, `src/renderer/src/components/CanvasContainer.tsx`.
*   **Goal:** The UI sits on top of the engine. When a user changes a color picker in `PropertiesPanel.tsx`, it calls `useAppStore().updateEntityStyle()`.
*   **Viewport Constraints (Zoom/Pan):** The `<canvas>` element itself must remain a fixed, centered resolution (e.g., exactly `1080x1080` internally). Do not implement an infinite geometric panning workspace. Instead, use React/CSS `transform: scale()` on the canvas DOM node wrapper to let the user visually "zoom" in and out of that fixed frame based on their screen size. The `CanvasEngine` should always draw to a fixed coordinate system.
*   **Warning (Hotkey Focus Management):** When writing your `EditPtsToolHandler` logic to listen for the `Backspace` or `Delete` key to remove vertices, do not attach a global `window.addEventListener('keydown')`. If you do, users returning to the `PropertiesPanel` to type in a hex code will accidentally delete their entire shape when they press Backspace. You must either bind the `onKeyDown` React event directly to your `<canvas tabIndex={0}>` container, or inside a global listener specifically check if `document.activeElement === document.body`.

### Step 5: Rendering Math (Absolute Corner Clamping)
*   **Action:** Implement the geometry logic that reads a `LineEntity` and draws it to the HTML5 Context.
*   **Files Touched:** `src/renderer/src/engine/CanvasEngine.ts`.
*   **Goal:** The hardest part of rendering vectors is absolute pixel-based corner rounding. See *Section 3* below for the exact `quadraticCurveTo` clamping algorithm.

### Step 6: Tool Implementations (Strategy Pattern & Hit-Testing)
*   **Action:** Build the controllers that translate mouse coordinates into Zustand mutations.
*   **Files Touched:** `src/renderer/src/tools/DrawToolHandler.ts`, `src/renderer/src/tools/SelectToolHandler.ts`, `src/renderer/src/tools/EditPtsToolHandler.ts`.
*   **Goal:** Implement drawing lines (`DrawToolHandler`) and hit-testing existing math lines (`SelectToolHandler` / `EditPtsToolHandler`). See *Section 4* below for the exact point-to-segment algebra needed so you don't iterate pixels.

### Step 7: Unit Testing & Serialization
*   **Action:** Verify the core domain logic without launching Electron.
*   **Files Touched:** Run `npm i -D vitest jest-canvas-mock`. Create `CanvasEngine.test.ts` and `Store.test.ts`.
*   **Goal:** Assert that `JSON.stringify(useAppStore.getState())` correctly serializes the state, and verify that the mocked `CanvasRenderingContext2D` receives the correct `ctx.strokeColor` from the engine based on a mock state injection. See *Section 5* below for exact test boilerplates.

---

## 1. Security: The IPC Context Bridge

---

## 2. Security: The IPC Context Bridge

In modern Electron, the React frontend (`renderer`) **cannot** directly access Node.js modules like `fs` (File System) for security reasons. If you try to `import fs from 'fs'` inside a React component, your app will crash.

To save our `.vva` projects, we must use the **Context Bridge**.

### Step 2.1: The Preload Script (`src/preload/index.ts`)
You must define the exact functions the React frontend is allowed to call.
```typescript
import { contextBridge, ipcRenderer } from 'electron'

// Expose a specific API to the renderer process safely
contextBridge.exposeInMainWorld('fileSystemAPI', {
  saveProject: (data: string) => ipcRenderer.invoke('save-project', data),
  loadProject: () => ipcRenderer.invoke('load-project')
})
```

### Step 2.2: The Main Process (`src/main/index.ts`)
Here, you listen for those specific calls and actually write the files.
```typescript
import { ipcMain, dialog } from 'electron';
import fs from 'fs';

ipcMain.handle('save-project', async (event, jsonString) => {
  const { filePath } = await dialog.showSaveDialog({ filters: [{ name: 'VVA', extensions: ['vva'] }] });
  if (filePath) {
      fs.writeFileSync(filePath, jsonString);
      return true;
  }
  return false;
});
```

### Step 2.3: The React Frontend (`src/renderer/src/App.tsx`)
Now, React can call the globally exposed API.
```typescript
// Add global typings so TypeScript doesn't yell at you
declare global {
  interface Window { fileSystemAPI: { saveProject: (data: string) => Promise<boolean> } }
}

const handleSave = async () => {
    const jsonToSave = JSON.stringify(useAppStore.getState());
    await window.fileSystemAPI.saveProject(jsonToSave);
}
```

---

## 3. The Math: Hit Testing (Select Tool) using `Path2D`

When a user clicks on the canvas, you need to know if they clicked on a line. Do not loop over pixels, and do not try to write custom mathematics for the lines. Custom mathematics fail to understand curves and stroke widths.

### The Algorithm: Native `isPointInStroke`
Instead of writing algebra, rely on the HTML5 Canvas context. We will generate a `Path2D` object that guarantees the hit-box geometry is numerically identical to the visually rendered geometry (see Section 4). 

**Implementation logic for your `SelectToolHandler`:**

```typescript
// Important: Make sure to import the shared buildEntityPath helper from Section 4!
export function isPointOnEntity(ctx: CanvasRenderingContext2D, entity: LineEntity, mouseX: number, mouseY: number): boolean {
  if (entity.vertices.length < 2) return false;

  // 1. Re-use the exact mathematical path generation from the Engine!
  const path = buildEntityPath(entity.vertices, entity.style.globalRadius);

  // 2. Set the context's line specs to match the entity (temporarily)
  ctx.lineWidth = entity.style.strokeWidth;
  // Make sure your context has the same lineJoin and lineCap settings you use for rendering!

  // 3. Ask the deeply optimized native C++ browser engine if we hit the math
  return ctx.isPointInStroke(path, mouseX, mouseY);
}
```

---

## 4. The Math: Absolute Corner Smoothing

`REQUIREMENTS.md` calls for absolute pixel-based corner smoothing (e.g., a 20px radius) that clamps so it doesn't break the shape. 

Do not use `quadraticCurveTo`. They draw parabolas, not perfect circles. Native `arcTo` draws perfect circles, but it explodes if the requested radius is geometrically impossible (longer than the lines connecting the points). We must mathematically clamp the radius first.

### The Algorithm: Clamped `arcTo`
To guarantee the DRY principle, we will extract the path geometry into a shared reusable helper function that constructs a `Path2D`. This ensures the visual rendering (Section 4) and the logical hit-testing (Section 3) are perfectly identical.

To calculate a safe rounded corner at point `B` (coming from `A` and going to `C`):
1. Find the distance from `B` to `A` and `B` to `C`.
2. Find the *maximum allowed radius*, which is half the length of the shortest segment.
3. Clamp the user's requested `globalRadius` to that maximum.
4. Pass that clamped radius perfectly into `arcTo(B.x, B.y, C.x, C.y, safeRadius)`.

**Shared Geometry Helper (`src/renderer/src/utils/geometry.ts`):**

```typescript
export function buildEntityPath(vertices: Point[], radius: number): Path2D {
  const path = new Path2D();
  if (vertices.length < 2) return path;
  
  path.moveTo(vertices[0].x, vertices[0].y);

  for (let i = 1; i < vertices.length - 1; i++) {
    const P0 = vertices[i - 1]; // Previous point
    const P1 = vertices[i];     // Current corner
    const P2 = vertices[i + 1]; // Next point

    // Calculate segment vectors and lengths
    const d1x = P0.x - P1.x, d1y = P0.y - P1.y;
    const d2x = P2.x - P1.x, d2y = P2.y - P1.y;
    const len1 = Math.sqrt(d1x * d1x + d1y * d1y);
    const len2 = Math.sqrt(d2x * d2x + d2y * d2y);

    // Clamping logic: Radius cannot exceed 50% of the shortest neighboring segment
    const maxAllowedRadius = Math.min(len1, len2) / 2;
    const safeRadius = Math.min(radius, maxAllowedRadius);

    if (safeRadius === 0) {
      // Shape is too small or radius is 0, draw sharp corner
      path.lineTo(P1.x, P1.y);
      continue;
    }

    // Native canvas handles the exact tangent circle geometry, we just provide the cap.
    path.arcTo(P1.x, P1.y, P2.x, P2.y, safeRadius);
  }

  // Draw the final straight line to the end point
  const lastPoint = vertices[vertices.length - 1];
  path.lineTo(lastPoint.x, lastPoint.y);
  
  return path;
}
```

**Implementation logic for your `CanvasEngine.renderEntity` method:**
```typescript
const path = buildEntityPath(entity.vertices, entity.style.globalRadius);

// Set your colors and widths from the entity styles, then draw natively!
ctx.lineWidth = entity.style.strokeWidth;
ctx.strokeStyle = entity.style.strokeColor;
ctx.stroke(path);
```

---

## 5. Unit Testing Execution

`DESIGN.md` mandates testing the core logic independent of React. To do this, we use `vitest` and `jest-canvas-mock`. 

### 5.1 Testing the State (Zustand)
You don't need to mount React components to test application state. Import the hook, fetch the state, trigger an action, and assert the new JSON snapshot.

```typescript
// src/renderer/src/store/useAppStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from './useAppStore';

describe('AppStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useAppStore.setState({ entities: {}, entityIds: [] });
  });

  it('should correctly update entity styles', () => {
    // 1. Arrange
    const mockEntity = { id: 'shp1', type: 'Line', style: { strokeWidth: 2 } /* ... */ };
    useAppStore.setState({ entities: { 'shp1': mockEntity }, entityIds: ['shp1'] });

    // 2. Act
    useAppStore.getState().updateEntityStyle('shp1', { strokeWidth: 10 });

    // 3. Assert
    expect(useAppStore.getState().entities['shp1'].style.strokeWidth).toBe(10);
  });
});
```

### 5.2 Testing the Engine (Hexagonal Core)
We use `jest-canvas-mock` to intercept HTML5 Canvas calls during unit tests. We assert that the engine translates the math into the exact expected visualization commands.

```typescript
// src/renderer/src/engine/CanvasEngine.test.ts
import { describe, it, expect, vi } from 'vitest';
import 'jest-canvas-mock';
import { CanvasEngine } from './CanvasEngine';

describe('CanvasEngine', () => {
  it('should apply the correct stroke color based on Zustand state', () => {
    // 1. Arrange a mock canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    
    // 2. Arrange a mock store
    const mockState = {
      canvasWidth: 800, canvasHeight: 600, backgroundColor: '#000',
      entityIds: ['shp1'],
      entities: { 
         'shp1': { type: 'Line', vertices: [{x:0, y:0}, {x:100, y:100}], style: { strokeColor: '#FF0000', strokeWidth: 2, globalRadius: 0 } }
      }
    };
    const mockStore = { getState: () => mockState };

    // 3. Instantiate the isolated engine
    const engine = new CanvasEngine(canvas, mockStore, mockEventBus, mockAnimEngine);

    // 4. Act (Trigger a synchronous frame render)
    engine.draw();

    // 5. Assert: Did the engine actually execute a stroke with the required color?
    const calls = ctx.__getDrawCalls();
    const hasStrokeWithRed = calls.some(call => 
         call.type === 'stroke' && ctx.strokeStyle === '#FF0000'
    );
    expect(hasStrokeWithRed).toBe(true);
  });
});
```

---

## 6. Summary
If you follow the boilerplate setup in Section 1, wire up the state exactly as detailed in `DESIGN.md`, implement unit tests as shown in Section 5, and drop the exact math helpers (Section 3 & 4) into your event handlers and render loop, you will successfully implement Phase 1 without getting blocked by fundamental 2D geometry, testing hurdles, or Electron architecture issues.

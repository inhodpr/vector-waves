# Plan: Reusable Photo System for Stand-alone Player

## Goal
Integrate the reactive photo rendering system from the `visual_map` project into the `line-animator` player without copying code. This will utilize Vite aliases to share code between sibling directories while keeping the volatile photo state out of the main application's Zustand store.

## 1. Refactor `visual_map` Project
Since `visual_map/src/main.ts` is currently a monolithic script, we will extract the photo-related logic into a reusable class.

### 1.1 Extract `PhotoSystem.ts`
Create a new file `visual_map/src/PhotoSystem.ts` that encapsulates:
- **Types**: `Slot`, `LoadedPhoto`, `ActivePhoto`.
- **Logic**:
    - `generateSlots(width, height, marginRatio)`: Calculates grid positions.
    - `loadPhotos(sources)`: Handles preloading from local paths or Supabase.
    - `spawnPhoto(now)`: Weighted selection based on recency.
    - `update(dt)`: Manages lifecycles (durations).
    - `draw(ctx)`: Renders to the canvas context with alpha and letterboxing.

### 1.2 Update `visual_map/src/main.ts`
Refactor the original project to use the new `PhotoSystem` class to ensure it remains functional and serves as a test-bed for the module.

## 2. Configure `line-animator` for Cross-Project Imports
Link the sibling directory using Vite and TypeScript configurations.

### 2.1 Vite Alias (`app/electron.vite.config.ts`)
Add an alias to the renderer configuration:
```typescript
alias: {
  '@renderer': resolve('src/renderer/src'),
  '@visual-map': resolve(__dirname, '../../visual_map/src')
}
```

### 2.2 TypeScript Paths (`app/tsconfig.web.json`)
Ensure IntelliSense works across projects:
```json
"paths": {
  "@renderer/*": ["src/renderer/src/*"],
  "@visual-map/*": ["../../visual_map/src/*"]
}
```

## 3. Integration in `PlayerApp.tsx`
The player will consume the `PhotoSystem` directly, keeping it isolated from the core animation state.

### 3.1 Initialization
- Instantiate `PhotoSystem` using `useRef` to maintain persistence across re-renders without triggering them.
- Load photos in a `useEffect` on mount.

### 3.2 Ticker Integration
- Update and Draw the photo system within the existing `Ticker` loop:
```typescript
ticker.addCallback((ts) => {
    // ... existing engine updates
    photoSystem.current.update(dt);
    engine.draw(); // Draw map
    photoSystem.current.draw(ctx); // Draw photos on top
});
```

### 3.3 Volatility
By using the class instance directly in the Ticker, the photo state (which images are active, their alphas, etc.) remains "volatile" and is never serialized into the `.vva` project file or managed by Zustand.

## 4. Verification
1. Verify `visual_map` still works with the refactored class.
2. Verify `line-animator` can import from `@visual-map` without compilation errors.
3. Verify photos appear in the `PlayerApp` margins when a project is loaded.

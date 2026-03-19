# Phase 3 Implementation Guide: Physics & Animation

This document is the execution playbook for Phase 3. It builds upon the vector visualization and timeline timing architecture established in Phases 1 and 2, introducing dynamic, audio-driven mathematical deformation of the drawn lines.

---

## 🏗️ The Execution Checklist

Follow this sequence strictly to implement the 1D Wave equation and Constructive Interference mechanics.

### Step 1: Upgrading the State Schema (AnimStack)
*   **Action:** Expand the Zustand `AppState` types to support manipulating `VibrationAnim` objects inside a `LineEntity`, as well as moving the global `pluckOrigin`.
*   **Files Touched:** `src/renderer/src/store/types.ts`, `src/renderer/src/store/useAppStore.ts`.
*   **Goal:** 
    *   Add mutations to `useAppStore`:
        *   `addVibrationAnim(entityId: string, anim: VibrationAnim)`
        *   `removeVibrationAnim(entityId: string, animId: string)`
        *   `updateVibrationAnim(entityId: string, animId: string, updates: Partial<VibrationAnim>)`
        *   `updatePluckOrigin(entityId: string, percent: number)` (0.0 to 1.0)
    *   Ensure the data shape matches the `REQUIREMENTS.md` specs exactly (e.g. `easing: 'Linear' | 'Exponential'`).

### Step 2: The Hexagonal Physics Interface (`IAnimationEngine`)
*   **Action:** Replace the Phase 1 `StubAnimationEngine` with a fully mathematical `PhysicsAnimationEngine`.
*   **Files Touched:** `src/renderer/src/engine/IWavePropagationStrategy.ts` [New], `src/renderer/src/engine/PhysicsAnimationEngine.ts` [New], `src/renderer/src/components/CanvasContainer.tsx`.
*   **Goal:** Build an implementation of `IAnimationEngine` that accepts a `LineEntity` and `timestampMs`. 
    *   *Subdivision:* The engine must mathematically subdivide long straight line segments into high-density arrays of `Point[]`. **CRITICAL: The base path must be subdivided *after* simulating the `arcTo` corner smoothing from Phase 1, meaning the high-density points traverse the curved bezier radii.**
    *   *Strategy Pattern:* Abstract the wave equation. Create `IWavePropagationStrategy` and a concrete `OneDWaveStrategy` that handles sine-wave propagation. **CRITICAL: The displacement vectors must be calculated orthogonally against the smoothed multi-segment curve.**
    *   *Rendering Bypass:* **CRITICAL:** Update `CanvasEngine.renderEntity()`: When drawing a `LineEntity` that has active vibrations, do *not* pass the dense mesh back into `buildEntityPath()`. It will forcibly recalculate impossible `arcTo` radii and destroy the wave. The `CanvasEngine` must bypass the helper and draw the returning `Point[]` array using pure `lineTo()` commands.

### Step 3: Constructive Interference Logic
*   **Action:** Implement the accumulator logic inside the `PhysicsAnimationEngine`.
*   **Files Touched:** `src/renderer/src/engine/PhysicsAnimationEngine.ts`.
*   **Goal:** If a single line has multiple `VibrationAnim` objects active at the current `timestampMs` (based on their mapped Timeline Markers), the displacement vector for every subdivided point must mathematically *sum* across all active animations before returning the final mesh to the renderer.

### Step 4: UI Scaffolding (AnimStack & Properties)
*   **Action:** Build the React components to control the new Zustand physics data.
*   **Files Touched:** `src/renderer/src/components/PropertiesPanel.tsx`, `src/renderer/src/components/AnimListPanel.tsx` [New].
*   **Goal:** 
    *   When a `LineEntity` is selected, render a list of its current vibrations.
    *   Include an `<input type="range">` slider for `Frequency` (1-10) and `Amplitude` (abs px).
    *   Include a `<select>` dropdown for `AnimEasing` (Linear, Exponential).
    *   Include two `<select>` dropdowns mapping the `startMarkerId` and `endMarkerId` to the active markers in the `audio.markers` store state.

### Step 5: Canvas Interaction (The Pluck Handle)
*   **Action:** Create a draggable canvas UI element representing the origin point of the wave.
*   **Files Touched:** `src/renderer/src/engine/CanvasEngine.ts`, `src/renderer/src/tools/EditPtsToolHandler.ts`.
*   **Goal:** 
    *   *Rendering:* When the `EditPts` tool is active, the `CanvasEngine` must draw a distinct visual node tracking the actual path geometry at `entity.pluckOrigin`. **CRITICAL: This calculation must use total Euclidean Arc-Length across all segments and curved corners, not a pure vertex index ratio.**
    *   *Hit-Testing & Interaction:* `EditPtsToolHandler` and `SelectToolHandler` must be updated. Because the wave geometry dynamically moves away from the mathematical center line, the hit-test must query the `PhysicsAnimationEngine` for the currently deformed mesh at the exact `timestampMs` of the click. Construct a simple `lineTo()` Path2D of that moving mesh and execute `ctx.isPointInStroke()` so users can physically select vibrating waves.

---

## 📐 Detailed Specifications

### 1. Mathematics of Subdivision & Smooth Base Generation
A standard HTML5 `lineTo()` cannot bend. To animate a wave, the `PhysicsAnimationEngine` must convert the raw vector `vertices` into a dense map.
*   **The Pre-Smooth Pass:** Before any wave equations are applied, the engine must "bake" the Phase 1 `arcTo` radius mathematics into the base coordinates. The subdivision algorithm must walk the straight lines *and* the theoretical bezier curves of the corners to generate the base mesh.
*   **Orthogonal Displacement:** For every point `i` in the high-density mesh, the `OneDWaveStrategy` will calculate a scalar amplitude. The engine must calculate the *Normal Vector* (orthogonally perpendicular) to the smooth curve at point `i` and displace the point along that normal by the amplitude.

### 2. Mathematics of 1D Wave Propagation
The `OneDWaveStrategy` is purely deterministic.
*   **Input:** Line distance `d` from the Pluck Origin, current `timestampMs`, and the specific `VibrationAnim` instance configuration.
*   **Calculus:** 
    *   Travel out: The wave disturbance expands outward from the "Pluck Origin" at a constant velocity over time. 
        *   *Arc-Length Constraint:* The distance `d` is not linear pixels across the screen; it is the physical distance traveling along the pre-smoothed curve length.
    *   Curve: Standard $A \sin(kx - \omega t)$ adjusted to fit the boundary constraints.
    *   Decay: If `timestampMs > timeOf(anim.endMarkerId)`, begin the damping phase. Multiply the amplitude by a decay factor (e.g., $e^{-\gamma t}$ for Exponential, or linear slope to 0) until amplitude $< 0.1$, at which point the animation can be culled from processing.

---

## 🧪 Phase 3 Testing Strategy

Because we isolated the `IAnimationEngine` using the Hexagonal architecture in Phase 1, testing complex wave calculus does not require mounting a single React UI element or a headless browser.

### Framework
We will continue using **Vitest** for blistering fast, CLI-based unit execution in the pure Node backend.

### Test Suites to Write

**1. The Physics Mesh Router (`PhysicsAnimationEngine.test.ts`)**
*   **Purpose:** Ensure the engine correctly orchestrates multiple overlapping animations.
*   **Execution:** 
    *   Instantiate `PhysicsAnimationEngine` with a dummy `MockWaveStrategy` that simply returns a flat $+5px` Y displacement.
    *   Pass it a `LineEntity` containing two active `VibrationAnim` objects.
    *   **Assertion:** The engine must return a `Point[]` array where every vertex evaluates to exactly $+10px` Y displacement (proving the Constructive Interference accumulator loop works).

**2. The Pure Mathematics Strategy (`OneDWaveStrategy.test.ts`)**
*   **Purpose:** Validate the actual trigonometric wave equations and damping curves deterministically.
*   **Execution:** 
    *   Instantiate `OneDWaveStrategy`.
    *   *Test Pluck Origin:* Pass `timestampMs = 0`, Amplitude = 10, Frequency = 1. Assert that the mathematical displacement return exactly at $distance = 0$ is $10$, while displacement at $distance = 500$ is exactly $0$ (the wave hasn't traveled there yet).
    *   *Test Damping (Linear):* Pass a `timestampMs` exactly 50% through the damping phase envelope. Assert the returned amplitude multiplier is exactly $0.5$.
    *   *Test Damping (Exponential):* Pass a `timestampMs` deep into the damping phase. Assert the amplitude multiplier is $< 0.1$.

**3. State Integrity (`useAppStore.test.ts`)**
*   **Purpose:** Ensure adding complicated `VibrationAnim` nested objects doesn't break JSON serialization or state immutability.
*   **Execution:** 
    *   Call `useAppStore.getState().addVibrationAnim('shp1', { ...data })`.
    *   **Assertion:** Verify `state.entities['shp1'].animations.length === 1` and that no other state slices triggered re-renders.

**4. UI Tool Mathematics (`EditPtsToolHandler.test.ts`)**
*   **Purpose:** Ensure the hit-test radius and dragging calculation for the dynamic `pluckOrigin` node returns purely bounded percentages (0.0 to 1.0).
*   **Execution:** 
    *   Given a line strictly from `(0,0)` to `(100,0)`. 
    *   Simulate a mouse drag event to `(150, 0)`.
    *   **Assertion:** The mathematics must clamp and dispatch an action setting the Pluck Origin to `1.0` (100%), preventing out-of-bounds geometry rendering.

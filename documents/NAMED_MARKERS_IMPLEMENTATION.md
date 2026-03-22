# Implementation Guide: Named Markers

This document outlines the execution plan for the "Named Markers" feature, building upon the established timeline and state management architecture.

---

## 🏗️ The Execution Checklist

Follow this sequence to implement the Named Markers feature.

### Step 1: Upgrading the State Schema & Migration
*   **Action:** Update the `Marker` interface and `AppState` in the Zustand store.
*   **Legacy Migration:** On load, detect markers lacking the `name` field and batch-assign names (M1, M2, etc.) based on their existing order.
*   **Files Touched:** `src/renderer/src/store/types.ts`.
*   **Goal:** Add `name: string` to the `Marker` interface. In `AppState`, ensure markers are stored in a `Record<string, Marker>` with a separate `markerIds: string[]` for ordered access.

### Step 2: Auto-Generating Generic Names
*   **Logic:** To avoid duplicate names after deletions, use a "next index" counter in the audio state or calculate `max(N + 1)` from existing `M<N>` names. (Note: Gaps in numbering after undos/deletions are acceptable).
*   **Files Touched:** `src/renderer/src/store/useAppStore.ts`.
*   **Goal:** When `addAudioMarker` is called, determine the next available index and set the `name` property automatically.

### Step 3: Marker Label Component (`MarkerLabel.tsx`)
*   **Action:** Create a new React component for the marker's visual label.
*   **Files Touched:** `src/renderer/src/components/MarkerLabel.tsx`.
*   **Goal:** Render a yellow rectangle above the marker line. It should display the marker's name and handle double-click events to enter "editing mode".

### Step 4: Inline Renaming Interaction
*   **Action:** Add a text input to `MarkerLabel` that appears in editing mode.
*   **Keyboard Safety:** Use `autoFocus` on the input to ensure it captures focus instantly, preventing accidental Spacebar triggers (Play/Pause).
*   **Idempotency:** Implement a guard to prevent redundant store mutations if both `Enter` and `blur` events fire.
*   **Files Touched:** `src/renderer/src/components/MarkerLabel.tsx`, `src/renderer/src/store/useAppStore.ts`.
*   **Goal:** When double-clicked, the label becomes an `<input type="text">`. On `Enter` or `blur`, dispatch an `updateMarkerName` mutation to the Zustand store and exit editing mode. Changes should only commit to the store on `Enter` or `blur` (not on every keystroke).

### Step 5: Animation Dropdown Enhancements
*   **Action:** Update the rendering logic for the `AnimStart` and `AnimEnd` dropdowns.
*   **Sorting Stability:** While markers must be sorted by `timestampMs`, consider debouncing re-sorts during active marker dragging to prevent UI stutter in the properties panel.
*   **Files Touched:** `src/renderer/src/components/PropertiesPanel.tsx`.
*   **Goal:** 
    1. Sort the markers by their `timestampMs` before mapping them to dropdown options.
    2. Format the display string as `Name (Time)`, e.g., `M1 (00:01.500)`.

---

## 🛠️ Technical Details

### 1. Data Structure Update
```typescript
// src/renderer/src/store/types.ts
export interface Marker {
  id: string;
  targetTrackId: string;
  timestampMs: number;
  name: string; // New field
}
```

### 2. Generic Name Increment Logic
When adding a marker, the store should calculate the next number:
```typescript
const nextIndex = Object.keys(state.markers).length + 1;
const name = `M${nextIndex}`;
```

### 3. Sorting and Formatting in UI
Ensure the markers are always presented chronologically in the selection UI:
```typescript
const sortedMarkers = Object.values(markers).sort((a, b) => a.timestampMs - b.timestampMs);

// In the dropdown map:
<option value={m.id}>{`${m.name} (${formatTime(m.timestampMs)})`}</option>
```

### 4. Editing State Management
The `MarkerLabel` should manage its own local `isEditing` state to swap between the `<span>` and the `<input>`.

---

## 🏗️ Technical Considerations (Feedback Resolution)

*   **Name Uniqueness**: Names are non-blocking; multiple markers can have the same label (e.g., "Chorus"), but the underlying `id` ensures technical isolation. 
*   **Label Collision & Tooltips**: For high-density marker areas, labels will be allowed to overlap in MVP. To ensure readability, a native `title` tooltip should be added to show the full name on hover. Future iterations may include vertical staggering as a polish.
*   **Undo/Redo**: Marker renaming is a state mutation and should be tracked as a distinct event in the Undo stack, decoupled from movement/time changes.
*   **Timeline Scale**: Labels should have a fixed or minimum width; as the timeline zooms out, their visibility can be dynamically toggled or their text truncated to prevent obscuring the waveform.
*   **Character Limits**: Names are not exported in audio metadata (only used within the `.VAA` project file), so strict sanitization is not required.
*   **Multi-Selection**: Multi-selection of markers is not supported; renaming applies to a single marker at a time.

---

## 🧪 Testing Strategy

*   **Test 1 (Name Generation):** Assert that adding three markers results in names `M1`, `M2`, and `M3`.
*   **Test 2 (Renaming):** Verify that the `updateMarkerName` mutation correctly updates the store and the UI reflects the change.
*   **Test 3 (Sorting):** Ensure that if a marker at `2000ms` is added after a marker at `4000ms`, the dropdown list displays the `2000ms` marker first.
*   **Test 4 (Format):** Assert the time formatting inside the parenthesis matches the `MM:SS.mmm` requirement.

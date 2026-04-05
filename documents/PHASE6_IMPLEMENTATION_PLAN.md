# Phase 6 Implementation Plan: Robustness, Reliability, & Efficiency

## 1. Current State Assessment

### 1.1 Detached Preview (Separate Window)
- **Current State**: Mostly implemented. 
- **User Feedback**: The detached window opens but is rendered WITHOUT the lines that were added in the main window. This indicates the initial state sync or differential updates are broken.
- **Action**: Debug `syncStateToPreview` in `App.tsx` and `useAppStore.ts` to ensure lines are properly sent and received over the `MessagePort`.

### 1.2 OpenStreetMap Maps Import
- **Current State**: Custom IPC handles Overpass bounds via python (`map_processor.py`). 
- **User Feedback 1 (Timeout)**: Hangs indefinitely on search, throwing `HTTPSConnectionPool... Read timed out. (read timeout=60)` from Overpass API.
- **User Feedback 2 (Zustand)**: User questioned why 500+ vector paths needed to go into Zustand since the background won't be animated.
- **Action**: 
  1. Fix the Overpass Python query (use different endpoint, reduce bounding box, or optimize the query syntax).
  2. Implement an option (or by default) to render imported OSM features directly into a static caching layer/image asset rather than instantiating them as heavy `CanvasEntity` objects in Zustand, offloading the React render cycle.

### 1.3 Line Extraction & Hybrid Healing
- **Current State**: Core math exists in `LineExtractor.ts`. 
- **User Feedback 1 (Select Tool)**: The Select Tool is currently broken, making it impossible to delete lines.
- **User Feedback 2 (Wavy Lines)**: The extracted line is "a bit too wavy" and added "a bunch of curves" to a straight black line.
- **Action**:
  1. Fix the `SelectToolHandler.ts` so users can click and select entities to delete.
  2. Improve `LineExtractor.ts`: Apply stronger directional momentum, higher blur, or a post-process smoothing pass (like Douglas-Peucker algorithm) to eliminate waviness.

### 1.4 Optimized Audio Triggering
- **Current State**: V2 architecture implemented in `AudioWorkletProcessor.ts`.
- **User Feedback**: "yes, this is working, and is very fast"
- **Action**: Consider this feature stable. No major architectural changes needed. Focus only on minor UI/UX polishing if requested.

---

## 2. Refinement Implementation Strategy

### A. Fix Immediate User Bugs
1. **Fix Detached Preview State Sync**: Fix why lines aren't appearing in the detached window.
2. **Fix Select Tool**: Restore functionality to allow entity deletion.
3. **Smooth Line Extraction**: Implement post-extraction simplification (Douglas-Peucker) or stronger directional constraints.

### B. OSM Reliability & Performance
1. **Overpass Timeout Fix**: Refactor `map_processor.py` to use a more resilient querying strategy.
2. **Static Background Generation**: Render OSM map paths onto a single `OffscreenCanvas` to use as an image background overlay, bypassing Zustand completely unless specifically "extracted".

---

## 3. User Testing Use Cases

Please manually test the following scenarios to pinpoint where the current bugs lay:

### Scenario 1: The Detached Audio Load Test
1. Open the project and attach 5 different animations (some React, some Temporal).
2. Click "Detach Preview". Move the detached window to a second monitor or side-by-side.
3. Turn on Live Mode audio triggering the microphone.
4. **Validation Check**: Does the detached window feel 60fps? Is there noticeable lag between the sound, the main window UI, and the detached pulse?

### Scenario 2: The Map Stress Test
1. Open the "Import OSM Map" modal.
2. Search for a complex location (e.g., "Zurich, Switzerland" or "Manhattan, NY") and enable all available layers.
3. Change the limit to 500 features and perform the import (with background image enabled).
4. **Validation Check**: Does the app freeze entirely? Are the vector lines perfectly aligned over the static bitmap map background?

### Scenario 3: The Ghost Line Extraction
1. Load a canvas with a hand-drawn wave image as the background.
2. Select the Extract tool, draw over the line, and double-click to execute the extraction.
3. Delete the newly created line entity immediately after.
4. **Validation Check**: Did the line extraction accurately follow the ridge? When you deleted the line, was the "Heal Patch" fully purged without leaving visual artifacts?

### Scenario 4: Extreme Audio Frequencies
1. In Live Mode, configure one line to only react to "Bass" (threshold 0.8) and another to "Treble" (threshold 0.5).
2. Play a song with distinct kicks and hi-hats.
3. **Validation Check**: Verify the Worklet is successfully isolating the bands via the IIR filters. Do they trigger independently without bleeding?

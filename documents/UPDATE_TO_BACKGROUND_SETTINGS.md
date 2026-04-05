# Implementation Plan: Improved Background & Map Integration

This document outlines the technical changes required to support customizable canvas sizes, interactive background image controls, and geographic map feature import via Geopandas.

## Overview
The goal is to move beyond fixed canvas sizes and static background images. We will introduce a persistent background transformation state and a Python-based bridge to process complex spatial data from Geopandas.

## Proposed Changes

### 1. State Management (`app/src/renderer/src/store/`)
- **Canvas Size**: Update `AppState` to include `setCanvasSize`. This will be an explicitly set property, fixed once the project or map is initialized.
- **Background Transformation**: Add `backgroundImageTransform: { x: number, y: number, scale: number }` to the store.
- **Actions**: Add `setBackgroundImageTransform` to allow real-time manipulation of the background layer.

### 2. UI Updates (`app/src/renderer/src/components/`)
- **ProjectSettings.tsx**: 
    - Add numeric inputs for Width/Height.
    - Add an "Edit Background" toggle that enables a dedicated manipulation mode.
    - Add "Import Map" action.
- **MapImportModal.tsx [NEW]**:
    - Input for "Location Name" (e.g., "Zurich").
    - Toggle for "Import as Background Image" (Static Map).
    - List of feature types to convert to lines (Trams, Water, Roads, etc.).
    - Displays a preview status while fetching from API.
    - Imports Polygons (lakes/forests) as filled VVA lines.

### 3. Rendering Engine (`app/src/renderer/src/engine/`)
- **CanvasEngine.ts**:
    - Update `drawBackgroundImage` to apply the `backgroundImageTransform`.
    - Update `renderEntity` to support `fillColor` for Line entities, enabling the rendering of lakes, forests, and other area features.

### 4. OSM Map Bridge
- **map_processor.py**: 
    - **Geocoding**: Use Nominatim API to resolve location names to bounding boxes.
    - **Vector Extraction**: Use Overpass API to fetch specific layers:
        - `railway=tram/rail` (Transport)
        - `waterway` / `natural=water` (Water)
        - `leisure=park` / `landuse=forest` (Greenery)
    - **Static Map**: Fetch a background tile using `staticmap.openstreetmap.de`.
    - Handle coordinate normalization to a [0, 1] canvas space based on the fetched bounding box.
- **index.ts (Electron Main)**:
    - New IPC handler `fetch-osm-map` to coordinate between geocoding, static map fetching, and vector feature extraction.

## Verification Plan
1. **Manual Canvas Resize**: Verify that the UI correctly updates and the background fills the new dimensions.
2. **Interactive Background**: Verify that dragging/zooming the background in "Edit Mode" persists across project saves.
3. **Map Import**:
    - Load a sample GeoJSON of Zurich tram lines.
    - Select tram lines and a lake feature.
    - Verify they appear as editable VVA lines with correct colors (Red for trams, Blue fill for lake).
    - Verify that simplification prevents UI lag.

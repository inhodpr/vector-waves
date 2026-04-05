import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { CanvasEntity, Point } from '../store/types';

interface MapFeature {
    id: string;
    name: string;
    category: 'transport' | 'water' | 'greenery' | 'other';
    sub_category: string;
    geometry: number[][];
    raw_geometry: number[][];
    distance: number;
}

interface MapImportModalProps {
    onClose: () => void;
}

export const MapImportModal: React.FC<MapImportModalProps> = ({ onClose }) => {
    const [query, setQuery] = useState('');
    const [layers, setLayers] = useState({
        transport: true,
        water: true,
        greenery: true
    });
    const [subFilters, setSubFilters] = useState({
        rail: true,
        tram: true,
        otherTransport: true
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [results, setResults] = useState<{
        features: MapFeature[];
        static_map_url: string;
        location: string;
        center: { lat: number, lon: number };
    } | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [importBackground, setImportBackground] = useState(true);
    const [mapScale, setMapScale] = useState<number>(1.0);

    const handleSearch = async () => {
        if (!query.trim()) return;
        setLoading(true);
        setError(null);
        setResults(null);
        
        const activeLayers = Object.entries(layers)
            .filter(([_, active]) => active)
            .map(([name]) => name);

        try {
            const result = await (window as any).electron.ipcRenderer.invoke('fetch-osm-map', { 
                location: query, 
                layers: activeLayers 
            });
            
            if (result.error) {
                setError(result.error);
            } else {
                setResults(result);
                // Auto-select all features
                const initialSelected = new Set<string>(result.features.map((f: any) => f.id));
                setSelectedIds(initialSelected);
                // Reset scale for new search
                setMapScale(1.0);
            }
        } catch (e: any) {
            setError(e.message || 'Search failed');
        } finally {
            setLoading(false);
        }
    };

    const getFilteredFeatures = () => {
        if (!results) return [];
        return results.features.filter(f => {
            if (f.category === 'transport') {
                if (f.sub_category === 'rail' && !subFilters.rail) return false;
                if (f.sub_category === 'tram' && !subFilters.tram) return false;
                if (!['rail', 'tram'].includes(f.sub_category) && !subFilters.otherTransport) return false;
            }
            return true;
        }).sort((a, b) => a.distance - b.distance);
    };

    const filteredFeatures = getFilteredFeatures();

    const handleImport = async () => {
        if (!results) return;
        setLoading(true); // Re-use loading state for import process
        
        try {
            const store = useAppStore.getState();
            const { canvasWidth, canvasHeight } = store;

            console.log(`[MAP IMPORT] Starting import for ${results.location}`);
            console.log(`[MAP IMPORT] Canvas size: ${canvasWidth}x${canvasHeight}`);

            // 1. Group Features by Category
            const featuresByCategory: Record<string, MapFeature[]> = {};
            filteredFeatures.forEach(f => {
                if (selectedIds.has(f.id)) {
                    if (!featuresByCategory[f.category]) featuresByCategory[f.category] = [];
                    featuresByCategory[f.category].push(f);
                }
            });

            // 2. Iterate through categories and create separate transparent layers
            for (const [category, features] of Object.entries(featuresByCategory)) {
                if (features.length === 0) continue;

                const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
                const ctx = canvas.getContext('2d')!;
                // Background is transparent by default (do not fill)

                features.forEach((f) => {
                    ctx.beginPath();
                    f.geometry.forEach((pt, i) => {
                        const normX = (pt[0] - 0.5) * mapScale + 0.5;
                        const normY = (pt[1] - 0.5) * mapScale + 0.5;
                        const vx = normX * canvasWidth;
                        const vy = normY * canvasHeight;
                        
                        if (i === 0) ctx.moveTo(vx, vy);
                        else ctx.lineTo(vx, vy);
                    });

                    let strokeColor = '#666666';
                    let strokeWidth = 2;

                    if (f.category === 'transport') {
                        strokeColor = f.sub_category === 'tram' ? '#FF9500' : '#FF3B30';
                        strokeWidth = 3;
                    } else if (f.category === 'water') {
                        strokeColor = '#007AFF';
                    } else if (f.category === 'greenery') {
                        strokeColor = '#34C759';
                    }

                    ctx.strokeStyle = strokeColor;
                    ctx.lineWidth = strokeWidth;
                    ctx.lineJoin = 'round';
                    ctx.lineCap = 'round';
                    ctx.stroke();
                });

                const blob = await canvas.convertToBlob({ type: 'image/png' });
                const arrayBuffer = await blob.arrayBuffer();
                const uint8 = new Uint8Array(arrayBuffer);
                
                const assetId = `osm_${category}_${Date.now()}`;
                store.addImageAsset({
                    id: assetId,
                    path: `osm_${category}.png`,
                    buffer: uint8
                });

                const layerId = `map_layer_${category}_${Date.now()}`;
                
                const newLayer: any = {
                    id: layerId,
                    type: 'ImageLayer',
                    zIndex: store.entityIds.length,
                    assetId: assetId, // Point to the registered asset ID
                    rasterizedZoomLevel: 1.0,
                    x: 0,
                    y: 0,
                    scale: 1.0,
                    width: canvasWidth,
                    height: canvasHeight,
                    cacheKey: results.location
                };

                store.addEntity(newLayer);
                store.addLog('info', `Imported ${category} features as a new transparent layer.`);
                console.log(`[MAP IMPORT] Created new ${category} layer: ${layerId}`);
            }

            onClose();
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
            <div style={{
                backgroundColor: 'white', padding: '32px', borderRadius: '12px',
                width: '740px', maxHeight: '90%', display: 'flex', flexDirection: 'column',
                boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h2 style={{ margin: 0, fontSize: '24px' }}>Import OSM Map</h2>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '24px', cursor: 'pointer' }}>×</button>
                </div>
                <p style={{ margin: '0 0 24px 0', color: '#666', fontSize: '14px' }}>
                    Refine features by type and proximity to center.
                </p>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                    <input 
                        type="text" 
                        placeholder="e.g. Zurich, Switzerland" 
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                        style={{ flex: 1, padding: '12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '16px' }}
                    />
                    <button onClick={handleSearch} disabled={loading || !query.trim()} style={{ padding: '0 24px', backgroundColor: '#007AFF', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', opacity: loading || !query.trim() ? 0.6 : 1 }}>
                        {loading ? 'Searching...' : 'Search'}
                    </button>
                </div>

                <div style={{ backgroundColor: '#f9f9f9', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', gap: '24px', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#666' }}>Layers:</span>
                            {Object.keys(layers).map(layer => (
                                <label key={layer} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', textTransform: 'capitalize' }}>
                                    <input type="checkbox" checked={layers[layer as keyof typeof layers]} onChange={e => setLayers({ ...layers, [layer]: e.target.checked })} />
                                    {layer}
                                </label>
                            ))}
                        </div>
                    </div>

                    {layers.transport && (
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '8px', backgroundColor: '#fff', borderRadius: '4px', border: '1px solid #eee' }}>
                            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#999' }}>Transport Filter:</span>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                                <input type="checkbox" checked={subFilters.rail} onChange={e => setSubFilters({ ...subFilters, rail: e.target.checked })} />
                                Rail
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                                <input type="checkbox" checked={subFilters.tram} onChange={e => setSubFilters({ ...subFilters, tram: e.target.checked })} />
                                Tram
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                                <input type="checkbox" checked={subFilters.otherTransport} onChange={e => setSubFilters({ ...subFilters, otherTransport: e.target.checked })} />
                                Other
                            </label>
                        </div>
                    )}
                </div>

                {error && (
                    <div style={{ padding: '12px', backgroundColor: '#fee', color: '#d32f2f', borderRadius: '6px', marginBottom: '16px', fontSize: '14px' }}>
                        {error}
                    </div>
                )}

                {results && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                <div style={{ width: '80px', height: '80px', backgroundColor: '#e3f2fd', borderRadius: '4px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                    <span style={{ fontSize: '24px' }}>🗺️</span>
                                </div>
                                <div>
                                    <h4 style={{ margin: '0 0 4px 0' }}>{results.location}</h4>
                                    <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>
                                        Showing {filteredFeatures.length} features.
                                    </p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '16px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#999', textAlign: 'right' }}>MAP SCALE (ZOOM)</span>
                                    <input 
                                        type="range" 
                                        min="1" max="20" step="0.5"
                                        value={mapScale}
                                        onChange={e => setMapScale(parseFloat(e.target.value) || 1.0)}
                                        style={{ width: '120px' }}
                                    />
                                    <span style={{ fontSize: '11px', color: '#666', textAlign: 'right' }}>{mapScale.toFixed(1)}x</span>
                                </div>
                            </div>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #eee', borderRadius: '6px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f5f5f5', fontSize: '11px' }}>
                                    <tr>
                                        <th style={{ padding: '8px', textAlign: 'left', width: '30px' }}>
                                            <input type="checkbox" 
                                                checked={filteredFeatures.length > 0 && filteredFeatures.every(f => selectedIds.has(f.id))} 
                                                onChange={e => {
                                                    const next = new Set(selectedIds);
                                                    filteredFeatures.forEach(f => {
                                                        if (e.target.checked) next.add(f.id);
                                                        else next.delete(f.id);
                                                    });
                                                    setSelectedIds(next);
                                                }} 
                                            />
                                        </th>
                                        <th style={{ padding: '8px', textAlign: 'left' }}>Feature Name</th>
                                        <th style={{ padding: '8px', textAlign: 'left' }}>Type</th>
                                        <th style={{ padding: '8px', textAlign: 'left' }}>Dist</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredFeatures.map(f => (
                                        <tr key={f.id} style={{ borderBottom: '1px solid #eee', fontSize: '12px' }}>
                                            <td style={{ padding: '8px' }}>
                                                <input type="checkbox" checked={selectedIds.has(f.id)} onChange={() => {
                                                    const next = new Set(selectedIds);
                                                    if (next.has(f.id)) next.delete(f.id);
                                                    else next.add(f.id);
                                                    setSelectedIds(next);
                                                }} />
                                            </td>
                                            <td style={{ padding: '8px', fontWeight: 'medium' }}>{f.name}</td>
                                            <td style={{ padding: '8px' }}>
                                                <span style={{ 
                                                    padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold',
                                                    backgroundColor: f.category === 'transport' ? (f.sub_category === 'tram' ? '#fff3e0' : '#ffebee') : f.category === 'water' ? '#e3f2fd' : '#e8f5e9',
                                                    color: f.category === 'transport' ? (f.sub_category === 'tram' ? '#ef6c00' : '#c62828') : f.category === 'water' ? '#1565c0' : '#2e7d32'
                                                }}>
                                                    {f.sub_category !== 'none' ? f.sub_category.toUpperCase() : f.category.toUpperCase()}
                                                </span>
                                            </td>
                                            <td style={{ padding: '8px', color: '#999', fontSize: '11px' }}>{(f.distance * 100).toFixed(1)}%</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                    <button onClick={onClose} style={{ padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                    <button 
                        onClick={handleImport}
                        disabled={!results || selectedIds.size === 0}
                        style={{ 
                            padding: '10px 24px', backgroundColor: '#007AFF', color: 'white', 
                            border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer',
                            opacity: !results || selectedIds.size === 0 ? 0.6 : 1
                        }}
                    >
                        Import {filteredFeatures.filter(f => selectedIds.has(f.id)).length} Features
                    </button>
                </div>
            </div>
        </div>
    );
};

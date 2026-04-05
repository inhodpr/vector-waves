import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { MapImportModal } from './MapImportModal';

export const ProjectSettings: React.FC = () => {
    const backgroundColor = useAppStore(state => state.backgroundColor);
    const setBackgroundColor = useAppStore(state => state.setBackgroundColor);
    const canvasWidth = useAppStore(state => state.canvasWidth);
    const canvasHeight = useAppStore(state => state.canvasHeight);
    const setCanvasSize = useAppStore(state => state.setCanvasSize);
    const backgroundEditMode = useAppStore(state => state.backgroundEditMode);
    const setBackgroundEditMode = useAppStore(state => state.setBackgroundEditMode);
    const setBackgroundImageTransform = useAppStore(state => state.setBackgroundImageTransform);
    const backgroundImageAssetId = useAppStore(state => state.backgroundImageAssetId);
    const selectedEntityId = useAppStore(state => state.selectedEntityId);

    const [showMapModal, setShowMapModal] = useState(false);

    return (
        <div style={{ padding: '16px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Project Settings</h3>
            
            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Canvas Size</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                        <span style={{ fontSize: '10px', color: '#666' }}>Width</span>
                        <input
                            type="number"
                            value={canvasWidth}
                            onChange={(e) => setCanvasSize(parseInt(e.target.value) || 1080, canvasHeight)}
                            style={{ width: '100%', padding: '4px', fontSize: '12px' }}
                        />
                    </div>
                    <div style={{ flex: 1 }}>
                        <span style={{ fontSize: '10px', color: '#666' }}>Height</span>
                        <input
                            type="number"
                            value={canvasHeight}
                            onChange={(e) => setCanvasSize(canvasWidth, parseInt(e.target.value) || 1080)}
                            style={{ width: '100%', padding: '4px', fontSize: '12px' }}
                        />
                    </div>
                </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Canvas Background</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                            type="color"
                            value={backgroundColor}
                            onChange={(e) => setBackgroundColor(e.target.value)}
                            style={{ width: '40px', height: '40px', border: '1px solid #ccc', borderRadius: '4px', padding: '2px', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '12px', fontFamily: 'monospace' }}>{backgroundColor.toUpperCase()}</span>
                    </div>
                </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Background Image</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button 
                        onClick={async () => {
                            const result = await (window as any).imageAPI.selectImage();
                            const store = useAppStore.getState();
                            if (result) {
                                store.addLog('info', `ProjectSettings: Received selection result for ${result.originalPath}`);
                                
                                const bufferData = result.buffer;
                                let uint8Buffer: Uint8Array;

                                if (bufferData && bufferData.type === 'Buffer' && Array.isArray(bufferData.data)) {
                                    store.addLog('info', 'ProjectSettings: Detected Node.js Buffer object format');
                                    uint8Buffer = new Uint8Array(bufferData.data);
                                } else if (bufferData instanceof Uint8Array) {
                                    store.addLog('info', 'ProjectSettings: Detected native Uint8Array format');
                                    uint8Buffer = bufferData;
                                } else {
                                    store.addLog('info', `ProjectSettings: Attempting generic conversion for type: ${typeof bufferData}`);
                                    uint8Buffer = new Uint8Array(bufferData);
                                }

                                store.addLog('info', `Values: first 4 bytes: ${uint8Buffer.slice(0, 4).join(', ')}`);
                                
                                const assetId = `img_${Date.now()}`;
                                store.addImageAsset({
                                    id: assetId,
                                    path: result.originalPath,
                                    buffer: uint8Buffer
                                });

                                // Create an ImageLayerEntity for the uploaded image
                                const imgId = `layer_img_${Date.now()}`;
                                const blob = new Blob([uint8Buffer as any]);
                                const blobUrl = URL.createObjectURL(blob);
                                
                                const tempImg = new Image();
                                tempImg.src = blobUrl;
                                tempImg.onload = () => {
                                    store.addEntity({
                                        id: imgId,
                                        type: 'ImageLayer',
                                        zIndex: store.entityIds.length,
                                        assetId: assetId, // USE THE PERSISTENT ASSET ID
                                        rasterizedZoomLevel: 1.0,
                                        x: 0,
                                        y: 0,
                                        scale: 1.0,
                                        width: tempImg.naturalWidth,
                                        height: tempImg.naturalHeight
                                    } as any);

                                    (store as any).setActiveLayerId?.(imgId);
                                    store.addLog('info', `Added background image "${result.originalPath.split('/').pop()}" as a new layer (${tempImg.naturalWidth}×${tempImg.naturalHeight}).`);
                                    URL.revokeObjectURL(blobUrl);
                                };
                                tempImg.onerror = () => {
                                    // Fallback: use canvas dimensions if image fails to pre-load
                                    store.addEntity({
                                        id: imgId,
                                        type: 'ImageLayer',
                                        zIndex: store.entityIds.length,
                                        assetId: blobUrl,
                                        rasterizedZoomLevel: 1.0,
                                        x: 0,
                                        y: 0,
                                        scale: 1.0,
                                        width: store.canvasWidth,
                                        height: store.canvasHeight
                                    } as any);
                                    store.addLog('warn', `Could not pre-load image dimensions, using canvas size as fallback.`);
                                };
                            } else {
                                store.addLog('warn', 'ProjectSettings: Image selection cancelled or failed');
                            }
                        }}
                        style={{ padding: '8px', cursor: 'pointer' }}
                    >
                        Choose Image...
                    </button>
                    {useAppStore.getState().backgroundImageAssetId && (
                        <>
                            <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                                <button 
                                    onClick={() => setBackgroundEditMode(!backgroundEditMode)}
                                    style={{ 
                                        flex: 1, padding: '6px', cursor: 'pointer',
                                        backgroundColor: backgroundEditMode ? '#4caf50' : '#f0f0f0',
                                        color: backgroundEditMode ? 'white' : 'black',
                                        border: '1px solid #ccc', borderRadius: '4px', fontSize: '11px'
                                    }}
                                >
                                    {backgroundEditMode ? 'Finish Editing' : 'Move Background'}
                                </button>
                                <button 
                                    onClick={() => setBackgroundImageTransform({ x: 0, y: 0, scale: 1.0 })}
                                    style={{ 
                                        padding: '6px', cursor: 'pointer',
                                        backgroundColor: '#f0f0f0', border: '1px solid #ccc', borderRadius: '4px', fontSize: '11px'
                                    }}
                                >
                                    Reset
                                </button>
                            </div>
                            <button 
                                onClick={() => useAppStore.getState().setBackgroundImage(null)}
                                style={{ padding: '8px', cursor: 'pointer', backgroundColor: '#fee', border: '1px solid #fcc', marginTop: '8px' }}
                            >
                                Remove Image
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div style={{ marginBottom: '16px', borderTop: '1px solid #eee', paddingTop: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', fontWeight: 'bold' }}>Map Integration</label>
                <button 
                    style={{ width: '100%', padding: '8px', cursor: 'pointer' }}
                    onClick={() => setShowMapModal(true)}
                >
                    Import Map (Geopandas)...
                </button>

                {showMapModal && (
                    <MapImportModal onClose={() => setShowMapModal(false)} />
                )}

                <div style={{ marginTop: '24px', borderTop: '1px solid #eee', paddingTop: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', marginBottom: '8px', fontWeight: 'bold' }}>Active Layers</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {useAppStore(state => state.entityIds)
                            .map(id => ({ id, entity: useAppStore.getState().entities[id] }))
                            .filter(item => item.entity && item.entity.type === 'ImageLayer')
                            .reverse() // Top layers first
                            .map(({ id, entity }) => (
                                <div key={id} style={{ 
                                    display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px', 
                                    backgroundColor: selectedEntityId === id ? '#e3f2fd' : '#f9f9f9', 
                                    borderRadius: '4px', border: selectedEntityId === id ? '1px solid #2196f3' : '1px solid #ddd' 
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span 
                                            onClick={() => useAppStore.getState().setSelectedEntityId(id)}
                                            style={{ fontSize: '11px', flex: 1, cursor: 'pointer', fontWeight: selectedEntityId === id ? 'bold' : 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                        >
                                            {id.startsWith('map_') ? '🗺️ ' : '🖼️ '}{entity.id.slice(0, 15)}...
                                        </span>
                                        <button 
                                            onClick={() => useAppStore.getState().bringForward(id)}
                                            style={{ padding: '2px 4px', fontSize: '10px', cursor: 'pointer' }}
                                            title="Bring Forward"
                                        >↑</button>
                                        <button 
                                            onClick={() => useAppStore.getState().sendBackward(id)}
                                            style={{ padding: '2px 4px', fontSize: '10px', cursor: 'pointer' }}
                                            title="Send Backward"
                                        >↓</button>
                                        <button 
                                            onClick={() => useAppStore.getState().deleteEntity(id)}
                                            style={{ padding: '2px 4px', fontSize: '10px', cursor: 'pointer', backgroundColor: '#fee' }}
                                            title="Delete"
                                        >✕</button>
                                    </div>
                                    
                                    {selectedEntityId === id && (
                                        <div style={{ marginTop: '8px', padding: '8px', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #eee', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '10px', color: '#666' }}>Scale: {(entity as any).scale?.toFixed(2)}x</label>
                                                <input type="range" min="0.1" max="5" step="0.05" value={(entity as any).scale || 1} onChange={(e) => useAppStore.getState().updateEntity(id, { scale: parseFloat(e.target.value) })} style={{ width: '100%' }} />
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '10px', color: '#666' }}>Crop X</label>
                                                    <input type="number" value={(entity as any).cropX || 0} onChange={(e) => useAppStore.getState().updateEntity(id, { cropX: parseInt(e.target.value) })} style={{ width: '100%', fontSize: '10px' }} />
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '10px', color: '#666' }}>Crop Y</label>
                                                    <input type="number" value={(entity as any).cropY || 0} onChange={(e) => useAppStore.getState().updateEntity(id, { cropY: parseInt(e.target.value) })} style={{ width: '100%', fontSize: '10px' }} />
                                                </div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '10px', color: '#666' }}>Crop W</label>
                                                    <input type="number" value={(entity as any).cropWidth || (entity as any).width} onChange={(e) => useAppStore.getState().updateEntity(id, { cropWidth: parseInt(e.target.value) })} style={{ width: '100%', fontSize: '10px' }} />
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '10px', color: '#666' }}>Crop H</label>
                                                    <input type="number" value={(entity as any).cropHeight || (entity as any).height} onChange={(e) => useAppStore.getState().updateEntity(id, { cropHeight: parseInt(e.target.value) })} style={{ width: '100%', fontSize: '10px' }} />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        {useAppStore(state => state.entityIds).filter(id => useAppStore.getState().entities[id]?.type === 'ImageLayer').length === 0 && (
                            <span style={{ fontSize: '11px', color: '#999', fontStyle: 'italic' }}>No additional layers</span>
                        )}
                    </div>
                </div>
            </div>

            <div style={{ borderTop: '1px solid #ccc', paddingTop: '16px', marginTop: '16px' }}>
                <p style={{ fontSize: '11px', color: '#666' }}>
                    Export settings will appear here in the next update.
                </p>
            </div>
        </div>
    );
};
